import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Helmet } from "react-helmet-async";

const statusColors: Record<string, string> = {
  pending: "bg-warning/20 text-warning border-warning/40",
  approved: "bg-success/20 text-success border-success/40",
  rejected: "bg-destructive/20 text-destructive border-destructive/40",
};

const OrganizerApprovals = () => {
  const { user } = useAuth();
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("event_approval_requests")
      .select("*, events(title, slug)")
      .eq("organizer_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setReqs(data ?? []);
        setLoading(false);
      });
  }, [user]);

  return (
    <>
      <Helmet><title>Approval requests — PULSE</title></Helmet>
      <div className="container max-w-4xl py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Approval requests</h1>
        <p className="text-muted-foreground mb-8">Track every event you've submitted for review.</p>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : reqs.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-card border-dashed">
            <p className="text-muted-foreground">No requests yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {reqs.map((r) => (
              <Card key={r.id} className="p-5 bg-gradient-card border-border/50">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-lg">{r.events?.title}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {r.request_type} request · submitted {format(new Date(r.created_at), "MMM d, yyyy")}
                    </p>
                    {r.review_note && (
                      <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50 text-sm">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">Reviewer note</span>
                        <p className="mt-1 text-foreground/90">{r.review_note}</p>
                      </div>
                    )}
                  </div>
                  <Badge className={statusColors[r.status] ?? ""}>{r.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default OrganizerApprovals;
