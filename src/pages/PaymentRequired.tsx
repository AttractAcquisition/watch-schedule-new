import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/edge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLAN_LABEL, BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PlanType } from "@/lib/types";

export default function PaymentRequired() {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState<PlanType | null>(null);

  async function handleSelectPlan(planId: PlanType) {
    if (!user) return;
    setLoading(planId);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckoutSession({
        plan_type: planId,
        success_url: `${origin}/payment-success`,
        cancel_url: `${origin}/payment-required`,
      });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout.");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            {BRAND.name}
          </div>
          <h1 className="font-display text-3xl font-semibold">Choose your plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Professional watch scheduling for your superyacht. Cancel anytime.
          </p>
          {user && (
            <p className="mt-3 text-xs text-muted-foreground">
              Signed in as{" "}
              <span className="text-foreground">{user.email}</span>{" · "}
              <button className="text-primary hover:underline" onClick={() => signOut()}>
                Sign out
              </button>
            </p>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "panel relative flex flex-col p-6",
                plan.popular && "border-primary/40 ring-1 ring-primary/30",
              )}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 border-primary/40 bg-primary/15 text-primary text-[10px] uppercase tracking-wider">
                  Most popular
                </Badge>
              )}

              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {PLAN_LABEL[plan.id]}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-semibold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.per}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.blurb}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">{plan.typical}</p>
              </div>

              <ul className="my-5 flex flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-auto w-full"
                variant={plan.popular ? "default" : "outline"}
                disabled={!!loading}
                onClick={() => handleSelectPlan(plan.id)}
              >
                {loading === plan.id ? "Redirecting…" : plan.cta}
              </Button>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secured by Stripe · All prices in GBP + VAT where applicable
        </p>
      </div>
    </div>
  );
}
