import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL = 3000;
const SHOW_BUTTON_AFTER = 20000;

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const { isPaid, hasCompletedOnboarding, refreshAppState } = useAuth();
  const [showButton, setShowButton] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const mountedAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isPaid) {
      navigate(hasCompletedOnboarding ? "/dashboard" : "/onboarding", { replace: true });
    }
  }, [isPaid, hasCompletedOnboarding, navigate]);

  useEffect(() => {
    if (isPaid) return;

    async function poll() {
      await refreshAppState();
      if (Date.now() - mountedAt.current > SHOW_BUTTON_AFTER) setShowButton(true);
      timer.current = setTimeout(poll, POLL_INTERVAL);
    }

    poll();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinue() {
    setContinuing(true);
    await refreshAppState();
    navigate(isPaid ? (hasCompletedOnboarding ? "/dashboard" : "/onboarding") : "/", {
      replace: true,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-md p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-success/40 bg-success/10">
          <Check className="h-5 w-5 text-success" />
        </div>
        <h1 className="mt-5 font-display text-xl font-semibold">
          {showButton ? "Payment received" : "Payment successful"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {showButton
            ? "Your payment was successful. Click below to continue to vessel setup."
            : "Activating your subscription — this only takes a moment."}
        </p>

        {showButton ? (
          <>
            <Button className="mt-6 w-full" disabled={continuing} onClick={handleContinue}>
              {continuing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Activating…
                </span>
              ) : (
                "Continue to vessel setup"
              )}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Still activating — the page will advance automatically.
            </p>
          </>
        ) : (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
