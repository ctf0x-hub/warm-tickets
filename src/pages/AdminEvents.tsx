import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Trash2, RotateCcw } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { toast } from "sonner";

const statusVariants: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-warning/20 text-warning border-warning/40",
  approved: "bg-success/20 text-success border-success/40",
  published: "bg-primary/20 text-primary border-primary/40",
  pending_edit_approval: "bg-warning/20 text-warning border-warning/40",
  cancelled: "bg-destructive/20 text-destructive border-destructive/40",
  rejected: "bg-destructive/20 text-destructive border-destructive/40",
};

const AdminEvents = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });
    const ids = Array.from(new Set((data ?? []).map((e: any) => e.organizer_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("user_id, name, email").in("user_id", ids)
      : { data: [] as any[] };
    const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    setEvents((data ?? []).map((e: any) => ({ ...e, organizer: byId.get(e.organizer_id) })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const softDelete = async (id: string) => {
    const { error } = await supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Event removed"); load(); }
  };
  const restore = async (id: string) => {
    const { error } = await supabase.from("events").update({ deleted_at: null }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Event restored"); load(); }
  };

  const filtered = events.filter((e) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return e.title?.toLowerCase().includes(s) || e.slug?.toLowerCase().includes(s) || e.organizer?.email?.toLowerCase().includes(s);
  });

  return (
    <>
      <Helmet><title>All events — Admin — PULSE</title></Helmet>
      <div className="container py-12">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link to="/admin"><ArrowLeft className="mr-2 h-4 w-4" /> Back to admin</Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-bold mb-2">All events</h1>
            <p className="text-muted-foreground">Browse and manage every event on the platform.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, slug, organizer…" className="pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-card border-border/50">
            <p className="text-muted-foreground">No events found.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => (
              <Card key={e.id} className="p-5 bg-gradient-card border-border/50">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex gap-4 min-w-0 flex-1">
                    {e.banner_image && (
                      <img src={e.banner_image} alt="" className="h-20 w-32 object-cover rounded-md flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-display font-semibold text-lg truncate">{e.title}</h3>
                        <Badge className={statusVariants[e.status] ?? ""}>{e.status}</Badge>
                        {e.deleted_at && <Badge variant="destructive">deleted</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(e.starts_at), "MMM d, yyyy · h:mm a")}
                        {e.venue && ` · ${e.venue}`}{e.city && `, ${e.city}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Organizer: {e.organizer?.name ?? e.organizer?.email ?? e.organizer_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/events/${e.slug}`}>Preview</Link>
                    </Button>
                    {e.deleted_at ? (
                      <Button size="sm" variant="outline" onClick={() => restore(e.id)}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" onClick={() => softDelete(e.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminEvents;
