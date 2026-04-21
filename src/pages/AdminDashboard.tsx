import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardList, Tag, Users } from "lucide-react";
import { Helmet } from "react-helmet-async";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ pending: 0, events: 0, users: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ count: pending }, { count: events }, { count: users }] = await Promise.all([
        supabase.from("event_approval_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("events").select("*", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("profiles").select("*", { count: "exact", head: true }).is("deleted_at", null),
      ]);
      setStats({ pending: pending ?? 0, events: events ?? 0, users: users ?? 0 });
      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    { title: "Pending approvals", value: stats.pending, icon: ClipboardList, link: "/admin/approvals", accent: "text-warning" },
    { title: "Total events", value: stats.events, icon: Tag, link: "/admin/events", accent: "text-primary" },
    { title: "Total users", value: stats.users, icon: Users, link: "/admin/users", accent: "text-accent" },
  ];

  return (
    <>
      <Helmet><title>Admin — PULSE</title></Helmet>
      <div className="container py-12">
        <h1 className="font-display text-4xl font-bold mb-2">Admin control</h1>
        <p className="text-muted-foreground mb-8">Platform overview and management.</p>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3 mb-8">
              {cards.map((c) => (
                <Link key={c.title} to={c.link}>
                  <Card className="p-6 bg-gradient-card border-border/50 hover:border-primary/40 transition-smooth hover:shadow-card cursor-pointer">
                    <div className="flex items-center justify-between mb-4">
                      <c.icon className={`h-6 w-6 ${c.accent}`} />
                    </div>
                    <div className="text-3xl font-display font-bold">{c.value}</div>
                    <div className="text-sm text-muted-foreground mt-1">{c.title}</div>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-6 bg-gradient-card border-border/50">
                <h3 className="font-display font-semibold text-lg mb-2">Manage taxonomy</h3>
                <p className="text-sm text-muted-foreground mb-4">Event types and tags.</p>
                <Button asChild variant="outline">
                  <Link to="/admin/taxonomy">Open taxonomy</Link>
                </Button>
              </Card>
              <Card className="p-6 bg-gradient-card border-border/50">
                <h3 className="font-display font-semibold text-lg mb-2">Approval queue</h3>
                <p className="text-sm text-muted-foreground mb-4">Review pending event submissions.</p>
                <Button asChild className="bg-gradient-primary border-0">
                  <Link to="/admin/approvals">Review queue</Link>
                </Button>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default AdminDashboard;
