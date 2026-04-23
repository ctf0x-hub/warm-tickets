import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Calendar, MapPin, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-warning/20 text-warning border-warning/40",
  pending_edit_approval: "bg-warning/20 text-warning border-warning/40",
  published: "bg-success/20 text-success border-success/40",
  rejected: "bg-destructive/20 text-destructive border-destructive/40",
  cancelled: "bg-muted text-muted-foreground",
  approved: "bg-accent/20 text-accent border-accent/40",
};

const OrganizerDashboard = () => {
  const { user, roles, refreshRoles } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isOrganizer = roles.includes("organizer") || roles.includes("admin");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("events")
      .select("id, title, slug, status, starts_at, venue, city, banner_image")
      .eq("organizer_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setEvents(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isOrganizer) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isOrganizer]);

  const becomeOrganizer = async () => {
    const { error } = await supabase.rpc("become_organizer");
    if (error) return toast.error(error.message);
    await refreshRoles();
    toast.success("You're now an organizer!");
  };

  if (!isOrganizer) {
    return (
      <div className="container py-20 max-w-2xl">
        <Card className="p-10 bg-gradient-card border-border/50 text-center">
          <Sparkles className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="font-display text-3xl font-bold mb-3">Become an organizer</h1>
          <p className="text-muted-foreground mb-6">
            Create and manage your own events on PULSE. All events go through a quick admin
            review before going live.
          </p>
          <Button onClick={becomeOrganizer} size="lg" className="bg-gradient-primary border-0 shadow-glow">
            Activate organizer account
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Organizer dashboard — PULSE</title>
      </Helmet>
      <div className="container py-12">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold mb-2">Your events</h1>
            <p className="text-muted-foreground">Manage events, drafts and approval requests.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/organizer/approvals">Approval requests</Link>
            </Button>
            <Button asChild className="bg-gradient-primary border-0 shadow-glow">
              <Link to="/organizer/events/new">
                <Plus className="mr-2 h-4 w-4" /> New event
              </Link>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <Card className="p-16 text-center bg-gradient-card border-border/50 border-dashed">
            <h3 className="font-display text-xl font-semibold mb-2">No events yet</h3>
            <p className="text-muted-foreground mb-6">Create your first event to get started.</p>
            <Button asChild className="bg-gradient-primary border-0">
              <Link to="/organizer/events/new">Create event</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {events.map((e) => (
              <Link
                key={e.id}
                to={`/organizer/events/${e.id}/analytics`}
                className="block rounded-2xl border border-border/50 bg-gradient-card p-5 transition-smooth hover:border-primary/40 hover:shadow-card"
              >
                <div className="flex gap-5">
                  <div className="w-32 h-20 rounded-xl overflow-hidden bg-muted shrink-0">
                    {e.banner_image ? (
                      <img src={e.banner_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-hero opacity-50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-display font-semibold text-lg truncate">{e.title}</h3>
                      <Badge className={statusColors[e.status] ?? ""}>{e.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(e.starts_at), "MMM d, yyyy")}
                      </span>
                      {(e.venue || e.city) && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {[e.venue, e.city].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default OrganizerDashboard;
