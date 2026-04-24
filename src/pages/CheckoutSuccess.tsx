import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type CheckoutStatus = "syncing" | "delayed" | "failed";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tranId = params.get("tran_id");
  const valId = params.get("val_id");
  const { refresh } = useCart();
  const [status, setStatus] = useState<CheckoutStatus>("syncing");

  useEffect(() => {
    if (!tranId) {
      setStatus("failed");
      return;
    }

    let cancelled = false;

    const syncPayment = async () => {
      for (let attempt = 0; attempt < 12 && !cancelled; attempt += 1) {
        try {
          await refresh();

          const { data, error } = await supabase.functions.invoke("check-payment-status", {
            body: { tran_id: tranId, val_id: valId },
          });

          if (error) throw error;

          if (data?.status === "confirmed") {
            await refresh();
            toast.success("Tickets confirmed");
            navigate("/tickets", { replace: true });
            return;
          }

          if (data?.status === "failed" || data?.status === "expired" || data?.status === "not_found") {
            setStatus("failed");
            return;
          }
        } catch (e) {
          console.error("payment status sync failed", e);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!cancelled) {
        setStatus("delayed");
      }
    };

    syncPayment();

    return () => {
      cancelled = true;
    };
  }, [navigate, refresh, tranId, valId]);

  return (
    <div className="container max-w-xl py-24 text-center">
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-9 w-9 text-primary" />
      </div>
      <h1 className="mb-3 font-display text-4xl font-bold">
        {status === "failed" ? "Payment needs attention" : "Payment received"}
      </h1>
      <p className="mb-2 text-muted-foreground">
        {status === "failed"
          ? "We couldn’t confirm your tickets yet. If you were charged, please wait a moment and check your wallet again."
          : status === "delayed"
            ? "Your payment was accepted, but ticket confirmation is taking a bit longer than usual."
            : "We’re confirming your tickets — this usually takes a few seconds."}
      </p>
      {tranId && (
        <p className="mb-8 inline-flex items-center gap-2 text-xs text-muted-foreground">
          {status === "syncing" && <Loader2 className="h-3 w-3 animate-spin" />}
          Transaction {tranId.slice(-12)}
        </p>
      )}
      <div className="flex justify-center gap-3">
        <Button asChild className="border-0 bg-gradient-primary shadow-glow">
          <Link to="/tickets">View my tickets</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/events">Browse more events</Link>
        </Button>
      </div>
    </div>
  );
}
