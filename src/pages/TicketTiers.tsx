import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

type Tier = {
  id?: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  total_seats: number;
  sold_seats?: number;
  sales_start_at: string;
  sales_end_at: string;
  max_per_order: number;
  sort_order: number;
  _new?: boolean;
};

const empty = (sort: number): Tier => ({
  name: "",
  description: "",
  price_cents: 0,
  currency: "USD",
  total_seats: 100,
  sales_start_at: "",
  sales_end_at: "",
  max_per_order: 10,
  sort_order: sort,
  _new: true,
});

const TicketTiers = () => {
  const { id: eventId } = useParams();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventTitle, setEventTitle] = useState("");

  useEffect(() => {
    if (!eventId) return;
    Promise.all([
      supabase.from("events").select("title").eq("id", eventId).maybeSingle(),
      supabase.from("ticket_tiers").select("*").eq("event_id", eventId).order("sort_order"),
    ]).then(([ev, t]) => {
      setEventTitle(ev.data?.title ?? "");
      setTiers(
        (t.data ?? []).map((row: any) => ({
          ...row,
          description: row.description ?? "",
          sales_start_at: row.sales_start_at?.slice(0, 16) ?? "",
          sales_end_at: row.sales_end_at?.slice(0, 16) ?? "",
        }))
      );
      setLoading(false);
    });
  }, [eventId]);

  const update = (i: number, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };

  const handleSave = async () => {
    if (!eventId) return;
    setSaving(true);
    try {
      for (const t of tiers) {
        if (!t.name.trim()) throw new Error("Each tier needs a name");
        const payload: any = {
          event_id: eventId,
          name: t.name.trim(),
          description: t.description || null,
          price_cents: Math.round(t.price_cents),
          currency: t.currency,
          total_seats: t.total_seats,
          sales_start_at: t.sales_start_at ? new Date(t.sales_start_at).toISOString() : null,
          sales_end_at: t.sales_end_at ? new Date(t.sales_end_at).toISOString() : null,
          max_per_order: t.max_per_order,
          sort_order: t.sort_order,
        };
        if (t.id) {
          const { error } = await supabase.from("ticket_tiers").update(payload).eq("id", t.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("ticket_tiers").insert(payload);
          if (error) throw error;
        }
      }
      toast.success("Tiers saved");
      // reload to get fresh ids
      const { data } = await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order");
      setTiers(
        (data ?? []).map((row: any) => ({
          ...row,
          description: row.description ?? "",
          sales_start_at: row.sales_start_at?.slice(0, 16) ?? "",
          sales_end_at: row.sales_end_at?.slice(0, 16) ?? "",
        }))
      );
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (i: number) => {
    const t = tiers[i];
    if (t.id) {
      if ((t.sold_seats ?? 0) > 0) {
        toast.error("Can't delete a tier with sold tickets");
        return;
      }
      const { error } = await supabase.from("ticket_tiers").delete().eq("id", t.id);
      if (error) return toast.error(error.message);
    }
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  };

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Ticket tiers — PULSE</title>
      </Helmet>
      <div className="container max-w-3xl py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to={`/organizer/events/${eventId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to event
          </Link>
        </Button>

        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold">Ticket tiers</h1>
          <p className="text-muted-foreground mt-1">{eventTitle}</p>
        </div>

        <div className="space-y-4">
          {tiers.map((t, i) => (
            <Card key={t.id ?? `new-${i}`} className="p-5 bg-gradient-card border-border/50 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <Label>Tier name *</Label>
                  <Input
                    value={t.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="General Admission"
                    className="mt-1.5"
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(i)} className="mt-7">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={t.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={t.price_cents / 100}
                    onChange={(e) => update(i, { price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input
                    value={t.currency}
                    onChange={(e) => update(i, { currency: e.target.value.toUpperCase().slice(0, 3) })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Total seats</Label>
                  <Input
                    type="number"
                    value={t.total_seats}
                    onChange={(e) => update(i, { total_seats: parseInt(e.target.value) || 0 })}
                    className="mt-1.5"
                  />
                  {t.sold_seats !== undefined && t.sold_seats > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{t.sold_seats} sold</p>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Sales start</Label>
                  <Input
                    type="datetime-local"
                    value={t.sales_start_at}
                    onChange={(e) => update(i, { sales_start_at: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Sales end</Label>
                  <Input
                    type="datetime-local"
                    value={t.sales_end_at}
                    onChange={(e) => update(i, { sales_end_at: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Max per order</Label>
                  <Input
                    type="number"
                    value={t.max_per_order}
                    onChange={(e) => update(i, { max_per_order: parseInt(e.target.value) || 1 })}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </Card>
          ))}

          <Button
            variant="outline"
            onClick={() => setTiers([...tiers, empty(tiers.length)])}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" /> Add tier
          </Button>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving} className="bg-gradient-primary border-0 shadow-glow">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save all tiers
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default TicketTiers;
