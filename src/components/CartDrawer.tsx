import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Trash2, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

const formatPrice = (cents: number, currency: string) =>
  cents === 0 ? "Free" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

const useCountdown = (expiresAt: string) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const ItemRow = ({ item, onRemove }: { item: any; onRemove: () => void }) => {
  const left = useCountdown(item.expires_at);
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground truncate">
            {item.tier?.events?.title}
          </p>
          <p className="font-semibold truncate">{item.tier?.name}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {item.quantity} × {formatPrice(item.tier?.price_cents ?? 0, item.tier?.currency ?? "USD")}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-warning mt-2">
        <Clock className="h-3 w-3" /> Held for {left}
      </div>
    </div>
  );
};

export const CartDrawer = () => {
  const { items, count, removeItem, checkout } = useCart();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const total = items.reduce(
    (s, i) => s + (i.tier?.price_cents ?? 0) * i.quantity,
    0
  );
  const currency = items[0]?.tier?.currency ?? "USD";

  const handleCheckout = async () => {
    setBusy(true);
    try {
      if (total === 0) {
        // Free-only cart → instant reserve
        const { count: minted } = await checkout();
        toast.success(`${minted} ticket${minted === 1 ? "" : "s"} confirmed`);
        setOpen(false);
        navigate("/tickets");
        return;
      }
      // Paid (or mixed) cart → Stripe Checkout
      const { data, error } = await supabase.functions.invoke("create-checkout");
      if (error) throw error;
      if (!data?.url) throw new Error("No checkout URL returned");
      window.location.href = data.url as string;
    } catch (e: any) {
      toast.error(e.message ?? "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {count > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 bg-primary text-primary-foreground border-0 text-[10px]">
              {count}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Your cart</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Your cart is empty.
            </p>
          ) : (
            items.map((item) => (
              <ItemRow key={item.id} item={item} onRemove={() => removeItem(item.id)} />
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-display text-xl font-bold">{formatPrice(total, currency)}</span>
            </div>
            <Button
              className="w-full bg-gradient-primary border-0 shadow-glow"
              onClick={handleCheckout}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {total === 0 ? "Reserve free tickets" : "Pay with Stripe"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {total === 0
                ? "Free tickets are reserved instantly."
                : "Secure payment via Stripe (test mode)."}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
