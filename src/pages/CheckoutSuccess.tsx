import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const { refresh } = useCart();

  // Refresh cart so the drawer empties as the webhook clears holds.
  useEffect(() => {
    const t = setInterval(refresh, 2000);
    const stop = setTimeout(() => clearInterval(t), 20000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [refresh]);

  return (
    <div className="container max-w-xl py-24 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-6">
        <CheckCircle2 className="h-9 w-9 text-primary" />
      </div>
      <h1 className="font-display text-4xl font-bold mb-3">Payment received</h1>
      <p className="text-muted-foreground mb-2">
        We're confirming your tickets — this usually takes a few seconds.
      </p>
      {sessionId && (
        <p className="text-xs text-muted-foreground mb-8 inline-flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Session {sessionId.slice(-10)}
        </p>
      )}
      <div className="flex gap-3 justify-center">
        <Button asChild className="bg-gradient-primary border-0 shadow-glow">
          <Link to="/tickets">View my tickets</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/events">Browse more events</Link>
        </Button>
      </div>
    </div>
  );
}
