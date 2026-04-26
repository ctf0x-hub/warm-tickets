import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

const AdminApprovals = () => {
  const { user } = useAuth();
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    // 1) Real pending requests
    const { data: requests, error: reqErr } = await supabase
      .from("event_approval_requests")
      .select("*, events(title, slug, organizer_id, status)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (reqErr) console.error("approvals: requests error", reqErr);

    const requested = requests ?? [];
    const requestedEventIds = new Set(requested.map((r: any) => r.event_id));

    // 2) Orphan pending events (status set directly without a request row)
    const { data: orphanEvents, error: orphErr } = await supabase
      .from("events")
      .select("id, title, slug, organizer_id, status, created_at, venue, city, starts_at, ends_at, description, terms, banner_image")
      .in("status", ["pending_approval", "pending_edit_approval"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (orphErr) console.error("approvals: orphan events error", orphErr);

    const orphans = (orphanEvents ?? [])
      .filter((e: any) => !requestedEventIds.has(e.id))
      .map((e: any) => ({
        id: `orphan-${e.id}`,
        event_id: e.id,
        organizer_id: e.organizer_id,
        request_type: e.status === "pending_edit_approval" ? "edit" : "publish",
        status: "pending",
        created_at: e.created_at,
        snapshot: {
          venue: e.venue, city: e.city,
          starts_at: e.starts_at, ends_at: e.ends_at,
          description: e.description,
          banner_image: e.banner_image,
        },
        events: { title: e.title, slug: e.slug, organizer_id: e.organizer_id, status: e.status, banner_image: e.banner_image },
        profiles: null,
        _orphan: true,
      }));

    // 2b) Fetch full event details (banner) for non-orphan requests
    const requestedIds = requested.map((r: any) => r.event_id);
    if (requestedIds.length) {
      const { data: evs } = await supabase
        .from("events")
        .select("id, banner_image, venue, city, starts_at, ends_at, description, slug, title, status")
        .in("id", requestedIds);
      const byEvId = new Map((evs ?? []).map((e: any) => [e.id, e]));
      requested.forEach((r: any) => {
        const e = byEvId.get(r.event_id);
        if (e) {
          r.events = { ...(r.events || {}), ...e };
          r.snapshot = { banner_image: e.banner_image, ...(r.snapshot || {}) };
        }
      });
    }

    // 3) Fetch organizer profiles separately (no FK between events/requests and profiles)
    const merged = [...requested, ...orphans];
    const organizerIds = Array.from(new Set(merged.map((r: any) => r.organizer_id).filter(Boolean)));
    if (organizerIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", organizerIds);
      const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
      merged.forEach((r: any) => { r.profiles = byId.get(r.organizer_id) ?? null; });
    }

    // 4) Fetch ticket tiers for each event
    const allEventIds = Array.from(new Set(merged.map((r: any) => r.event_id)));
    if (allEventIds.length) {
      const { data: tiers } = await supabase
        .from("ticket_tiers")
        .select("id, event_id, name, description, price_cents, currency, total_seats, sold_seats, sort_order")
        .in("event_id", allEventIds)
        .order("sort_order", { ascending: true });
      const tiersByEvent = new Map<string, any[]>();
      (tiers ?? []).forEach((t: any) => {
        const arr = tiersByEvent.get(t.event_id) ?? [];
        arr.push(t);
        tiersByEvent.set(t.event_id, arr);
      });
      merged.forEach((r: any) => { r.tiers = tiersByEvent.get(r.event_id) ?? []; });
    }

    setReqs(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const decide = async (req: any, approve: boolean) => {
    if (!user) return;
    setActingId(req.id);
    try {
      const note = notes[req.id]?.trim() || null;

      if (!req._orphan) {
        const { error: reqErr } = await supabase
          .from("event_approval_requests")
          .update({
            status: approve ? "approved" : "rejected",
            reviewed_by: user.id,
            review_note: note,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", req.id);
        if (reqErr) throw reqErr;
      }

      // Update event status
      let newEventStatus: string;
      if (approve) {
        newEventStatus = "approved";
      } else {
        // rejection: edit-requests revert to approved (live), publish-requests go to draft
        newEventStatus = req.request_type === "edit" ? "approved" : "draft";
      }

      const updates: any = { status: newEventStatus };
      if (!approve) updates.rejection_reason = note;

      const { error: evErr } = await supabase.from("events").update(updates).eq("id", req.event_id);
      if (evErr) throw evErr;

      toast.success(approve ? "Approved" : "Rejected");
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <>
      <Helmet><title>Approval queue — PULSE Admin</title></Helmet>
      <div className="container max-w-4xl py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Approval queue</h1>
        <p className="text-muted-foreground mb-8">{reqs.length} pending request{reqs.length === 1 ? "" : "s"}</p>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : reqs.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-card border-dashed">
            <p className="text-muted-foreground">All caught up. ✨</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {reqs.map((r) => {
              const snap = r.snapshot || {};
              const banner = snap.banner_image || r.events?.banner_image;
              const tiers = r.tiers || [];
              const fmtMoney = (cents: number, currency?: string) => {
                const cur = (currency || "BDT").toUpperCase();
                const amount = (cents || 0) / 100;
                if (cur === "BDT") return `৳${amount.toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                try {
                  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(amount);
                } catch {
                  return `${cur} ${amount.toFixed(2)}`;
                }
              };
              return (
                <Card key={r.id} className="p-6 bg-gradient-card border-border/50 overflow-hidden">
                  {banner && (
                    <div className="mb-4 -mx-6 -mt-6 overflow-hidden border-b border-border/40">
                      <img src={banner} alt={r.events?.title || "Event banner"} className="w-full h-48 object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                    <div>
                      <Badge className="mb-2 bg-primary/15 text-primary border-primary/30 capitalize">{r.request_type} request</Badge>
                      <h3 className="font-display text-xl font-bold">{r.events?.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        by {r.profiles?.name || r.profiles?.email} · {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    {r.events?.slug && (
                      <a
                        href={`/events/${r.events.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Preview ↗
                      </a>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-sm mb-4 p-4 rounded-lg bg-muted/40 border border-border/40">
                    <div><span className="text-muted-foreground">Venue:</span> {snap.venue || "—"}</div>
                    <div><span className="text-muted-foreground">City:</span> {snap.city || "—"}</div>
                    <div><span className="text-muted-foreground">Starts:</span> {snap.starts_at ? format(new Date(snap.starts_at), "MMM d, yyyy h:mm a") : "—"}</div>
                    <div><span className="text-muted-foreground">Ends:</span> {snap.ends_at ? format(new Date(snap.ends_at), "MMM d, yyyy h:mm a") : "—"}</div>
                    {snap.description && (
                      <div className="sm:col-span-2 pt-2 border-t border-border/40">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">Description</span>
                        <p className="mt-1 whitespace-pre-wrap">{snap.description}</p>
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Ticket tiers ({tiers.length})
                    </h4>
                    {tiers.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic p-3 rounded-lg bg-muted/30 border border-dashed border-border/40">
                        No ticket tiers configured yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {tiers.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{t.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {t.sold_seats}/{t.total_seats} sold
                                </Badge>
                              </div>
                              {t.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-display font-bold text-primary">
                                {t.price_cents === 0 ? "Free" : fmtMoney(t.price_cents, t.currency)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Textarea
                    placeholder="Optional note for the organizer..."
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                    rows={2}
                    className="mb-3"
                  />

                  <div className="flex gap-2 justify-end">
                    <Button
                      onClick={() => decide(r, false)}
                      disabled={actingId === r.id}
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                    <Button
                      onClick={() => decide(r, true)}
                      disabled={actingId === r.id}
                      className="bg-gradient-primary border-0 shadow-glow"
                    >
                      <Check className="mr-2 h-4 w-4" /> Approve & publish
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminApprovals;
