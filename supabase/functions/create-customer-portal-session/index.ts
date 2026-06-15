import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { return_url } = await req.json();
    if (!return_url) return err("return_url is required.");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return err("Stripe not configured.", 500);

    const supabase = userClient(req);
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return err("Unauthorised.", 401);

    const admin = adminClient();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return err(
        "No billing account found. If you subscribed via a previous version of the app, please contact support@watchschedule.com to link your account.",
        400,
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url,
    });

    return json({ url: session.url });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
