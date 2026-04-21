import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutCancel() {
  return (
    <div className="container max-w-xl py-24 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
        <XCircle className="h-9 w-9 text-destructive" />
      </div>
      <h1 className="font-display text-4xl font-bold mb-3">Checkout cancelled</h1>
      <p className="text-muted-foreground mb-8">
        No charge was made. Your seats are still held until the timer runs out.
      </p>
      <div className="flex gap-3 justify-center">
        <Button asChild className="bg-gradient-primary border-0 shadow-glow">
          <Link to="/events">Back to events</Link>
        </Button>
      </div>
    </div>
  );
}
