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
    const { data: requests } = await supabase
      .from("event_approval_requests")
      .select("*, events(title, slug, organizer_id, status), profiles!event_approval_requests_organizer_id_fkey(name, email)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const requested = requests ?? [];
    const requestedEventIds = new Set(requested.map((r: any) => r.event_id));

    // 2) Orphan pending events (status set directly without a request row)
    const { data: orphanEvents } = await supabase
      .from("events")
      .select("id, title, slug, organizer_id, status, created_at, venue, city, starts_at, ends_at, description, profiles:profiles!events_organizer_id_fkey(name, email)")
      .in("status", ["pending_approval", "pending_edit_approval"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

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
        },
        events: { title: e.title, slug: e.slug, organizer_id: e.organizer_id, status: e.status },
        profiles: e.profiles,
        _orphan: true,
      }));

    setReqs([...requested, ...orphans]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const decide = async (req: any, approve: boolean) => {
    if (!user) return;
    setActingId(req.id);
    try {
      const note = notes[req.id]?.trim() || null;

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
              return (
                <Card key={r.id} className="p-6 bg-gradient-card border-border/50">
                  <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                    <div>
                      <Badge className="mb-2 bg-primary/15 text-primary border-primary/30 capitalize">{r.request_type} request</Badge>
                      <h3 className="font-display text-xl font-bold">{r.events?.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        by {r.profiles?.name || r.profiles?.email} · {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
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
