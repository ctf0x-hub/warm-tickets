import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type CartItem = {
  id: string;
  tier_id: string;
  quantity: number;
  expires_at: string;
  tier?: {
    name: string;
    price_cents: number;
    currency: string;
    event_id: string;
    events?: { title: string; slug: string };
  };
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  addItem: (tierId: string, quantity: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  checkout: () => Promise<{ count: number }>;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("cart_reservations")
      .select("id, tier_id, quantity, expires_at, ticket_tiers!inner(name, price_cents, currency, event_id, events!inner(title, slug))")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString());
    setItems(
      (data ?? []).map((r: any) => ({
        id: r.id,
        tier_id: r.tier_id,
        quantity: r.quantity,
        expires_at: r.expires_at,
        tier: r.ticket_tiers,
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // periodic refresh to drop expired holds from UI
  useEffect(() => {
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const addItem = async (tierId: string, quantity: number) => {
    if (!user) throw new Error("Sign in to add tickets");
    const { error } = await supabase.from("cart_reservations").insert({
      user_id: user.id,
      tier_id: tierId,
      quantity,
    });
    if (error) throw error;
    await refresh();
  };

  const removeItem = async (id: string) => {
    if (!user) return;
    await supabase.from("cart_reservations").delete().eq("id", id);
    await refresh();
  };

  const checkout = async () => {
    const { data, error } = await supabase.rpc("checkout_cart");
    if (error) throw error;
    await refresh();
    return { count: (data ?? []).length };
  };

  return (
    <CartContext.Provider
      value={{
        items,
        count: items.reduce((s, i) => s + i.quantity, 0),
        loading,
        refresh,
        addItem,
        removeItem,
        checkout,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
