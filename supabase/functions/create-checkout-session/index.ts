import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsResponse, err, json } from "../_shared/cors.ts";
import { userClient } from "../_shared/client.ts";

const PRICE_MAP: Record<string, string | undefined> = {
  solo_watch: Deno.env.get("STRIPE_PRICE_SOLO"),
  dual_watch: Deno.env.get("STRIPE_PRICE_DUAL"),
  triple_watch: Deno.env.get("STRIPE_PRICE_TRIPLE"),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { plan_type, success_url, cancel_url } = await req.json();
    if (!plan_type || !success_url || !cancel_url) {
      return err("plan_type, success_url, cancel_url are required.");
    }

    const priceId = PRICE_MAP[plan_type];
    if (!priceId) return err(`No Stripe price configured for plan: ${plan_type}`);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return err("Stripe not configured.", 500);

    const supabase = userClient(req);
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return err("Unauthorised.", 401);

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    // Get or create Stripe customer
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      metadata: {
        supabase_user_id: user.id,
        plan_type,
      },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan_type },
      },
    });

    return json({ url: session.url });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
