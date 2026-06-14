import Stripe from "https://esm.sh/stripe@14?target=deno";
import { CORS } from "../_shared/cors.ts";
import { adminClient } from "../_shared/client.ts";

const PLAN_FROM_PRICE: Record<string, string> = {
  [Deno.env.get("STRIPE_PRICE_SOLO") ?? ""]: "solo_watch",
  [Deno.env.get("STRIPE_PRICE_DUAL") ?? ""]: "dual_watch",
  [Deno.env.get("STRIPE_PRICE_TRIPLE") ?? ""]: "triple_watch",
};

async function upsertSubscription(supabase: ReturnType<typeof adminClient>, data: {
  stripeCustomerId: string;
  stripeSubId: string;
  status: string;
  planType: string;
  userId: string;
  periodStart?: number | null;
  periodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
}) {
  await supabase.from("subscriptions").upsert(
    {
      user_id: data.userId,
      stripe_customer_id: data.stripeCustomerId,
      stripe_subscription_id: data.stripeSubId,
      plan_type: data.planType,
      status: data.status,
      current_period_start: data.periodStart
        ? new Date(data.periodStart * 1000).toISOString()
        : null,
      current_period_end: data.periodEnd
        ? new Date(data.periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: data.cancelAtPeriodEnd ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe not configured", { status: 500, headers: CORS });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    event = stripe.webhooks.constructEvent(body, sig ?? "", webhookSecret);
  } catch (err) {
    return new Response(`Webhook error: ${err instanceof Error ? err.message : err}`, {
      status: 400,
      headers: CORS,
    });
  }

  const supabase = adminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const planType = session.metadata?.plan_type ?? "solo_watch";
        if (!userId || !session.subscription) break;

        const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = sub.items.data[0]?.price.id ?? "";

        await upsertSubscription(supabase, {
          userId,
          stripeCustomerId: session.customer as string,
          stripeSubId: sub.id,
          status: sub.status,
          planType: PLAN_FROM_PRICE[priceId] ?? planType,
          periodStart: sub.current_period_start,
          periodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId = sub.items.data[0]?.price.id ?? "";

        const { data: existing } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!existing?.user_id) break;

        await upsertSubscription(supabase, {
          userId: existing.user_id,
          stripeCustomerId: customerId,
          stripeSubId: sub.id,
          status: event.type === "customer.subscription.deleted" ? "cancelled" : sub.status,
          planType: PLAN_FROM_PRICE[priceId] ?? "solo_watch",
          periodStart: sub.current_period_start,
          periodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const { data: existing } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (!existing?.user_id) break;

        await supabase
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("user_id", existing.user_id);
        break;
      }
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
