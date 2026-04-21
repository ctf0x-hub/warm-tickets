import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

type Tier = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  total_seats: number;
  sold_seats: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  max_per_order: number;
  sort_order: number;
};

const formatPrice = (cents: number, currency: string) =>
  cents === 0 ? "Free" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

export const TierList = ({ eventId }: { eventId: string }) => {
  const { user } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [holds, setHolds] = useState<Record<string, number>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const loadTiers = useCallback(async () => {
    const { data } = await supabase
      .from("ticket_tiers")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order");
    setTiers(data ?? []);
    setLoading(false);
  }, [eventId]);

  const loadHolds = useCallback(async () => {
    const { data } = await supabase
      .from("cart_reservations")
      .select("tier_id, quantity")
      .gt("expires_at", new Date().toISOString());
    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => {
      map[r.tier_id] = (map[r.tier_id] ?? 0) + r.quantity;
    });
    setHolds(map);
  }, []);

  useEffect(() => {
    loadTiers();
    loadHolds();
  }, [loadTiers, loadHolds]);

  // Realtime: tiers + reservations
  useEffect(() => {
    const ch = supabase
      .channel(`event-${eventId}-inventory`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_tiers", filter: `event_id=eq.${eventId}` },
        () => loadTiers()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart_reservations" },
        () => loadHolds()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventId, loadTiers, loadHolds]);

  const handleAdd = async (tier: Tier, quantity: number) => {
    if (!user) {
      toast.error("Sign in to reserve tickets");
      navigate("/auth");
      return;
    }
    setBusy(tier.id);
    try {
      await addItem(tier.id, quantity);
      toast.success(`${quantity} × ${tier.name} held for 5 min`);
      setQty({ ...qty, [tier.id]: 1 });
    } catch (e: any) {
      toast.error(e.message ?? "Could not reserve");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No tickets available yet.
      </p>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-3">
      {tiers.map((tier) => {
        const remaining = Math.max(0, tier.total_seats - tier.sold_seats - (holds[tier.id] ?? 0));
        const soldOut = remaining === 0;
        const notStarted = tier.sales_start_at && new Date(tier.sales_start_at) > now;
        const ended = tier.sales_end_at && new Date(tier.sales_end_at) < now;
        const disabled = soldOut || notStarted || ended;
        const q = Math.max(1, Math.min(qty[tier.id] ?? 1, tier.max_per_order, remaining || 1));

        return (
          <div
            key={tier.id}
            className="rounded-xl border border-border/50 bg-card/50 p-4 transition-smooth hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{tier.name}</p>
                {tier.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tier.description}</p>
                )}
              </div>
              <p className="font-display text-lg font-bold whitespace-nowrap">
                {formatPrice(tier.price_cents, tier.currency)}
              </p>
            </div>

            <div
              className="text-xs mb-3"
              aria-live="polite"
              role="status"
            >
              {soldOut ? (
                <span className="text-destructive font-medium">Sold out</span>
              ) : notStarted ? (
                <span className="text-muted-foreground">
                  Sales open {new Date(tier.sales_start_at!).toLocaleString()}
                </span>
              ) : ended ? (
                <span className="text-muted-foreground">Sales ended</span>
              ) : (
                <span className="text-success">{remaining} left</span>
              )}
            </div>

            {!disabled && (
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-border rounded-lg">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setQty({ ...qty, [tier.id]: Math.max(1, q - 1) })}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    value={q}
                    onChange={(e) =>
                      setQty({ ...qty, [tier.id]: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    className="h-8 w-12 text-center border-0 px-0"
                    min={1}
                    max={Math.min(tier.max_per_order, remaining)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      setQty({ ...qty, [tier.id]: Math.min(tier.max_per_order, remaining, q + 1) })
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="flex-1 bg-gradient-primary border-0"
                  onClick={() => handleAdd(tier, q)}
                  disabled={busy === tier.id}
                >
                  {busy === tier.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Add to cart
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
