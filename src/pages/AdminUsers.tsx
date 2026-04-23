import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, ShieldOff, ShieldCheck, Rocket } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { toast } from "sonner";

const AdminUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    setUsers((profs ?? []).map((p: any) => ({ ...p, roles: rolesByUser.get(p.user_id) ?? [] })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSuspend = async (u: any) => {
    const { error } = await supabase.from("profiles").update({ is_suspended: !u.is_suspended }).eq("user_id", u.user_id);
    if (error) toast.error(error.message); else { toast.success(u.is_suspended ? "User unsuspended" : "User suspended"); load(); }
  };

  const grantOrganizer = async (u: any) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: u.user_id, role: "organizer" });
    if (error) toast.error(error.message); else { toast.success("Organizer role granted"); load(); }
  };

  const revokeOrganizer = async (u: any) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", u.user_id).eq("role", "organizer");
    if (error) toast.error(error.message); else { toast.success("Organizer role revoked"); load(); }
  };

  const filtered = users.filter((u) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return u.email?.toLowerCase().includes(s) || u.name?.toLowerCase().includes(s);
  });

  return (
    <>
      <Helmet><title>All users — Admin — PULSE</title></Helmet>
      <div className="container py-12">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link to="/admin"><ArrowLeft className="mr-2 h-4 w-4" /> Back to admin</Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-4xl font-bold mb-2">All users</h1>
            <p className="text-muted-foreground">Manage roles and account status.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-card border-border/50">
            <p className="text-muted-foreground">No users found.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => {
              const isOrganizer = u.roles.includes("organizer");
              const isAdmin = u.roles.includes("admin");
              return (
                <Card key={u.id} className="p-5 bg-gradient-card border-border/50">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{u.name ?? u.email}</h3>
                        {isAdmin && <Badge className="bg-accent/20 text-accent border-accent/40">admin</Badge>}
                        {isOrganizer && <Badge className="bg-primary/20 text-primary border-primary/40">organizer</Badge>}
                        {u.roles.includes("attendee") && !isOrganizer && !isAdmin && <Badge variant="secondary">attendee</Badge>}
                        {u.is_suspended && <Badge variant="destructive">suspended</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                      <p className="text-xs text-muted-foreground mt-1">Joined {format(new Date(u.created_at), "MMM d, yyyy")}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!isAdmin && (isOrganizer ? (
                        <Button size="sm" variant="outline" onClick={() => revokeOrganizer(u)}>Revoke organizer</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => grantOrganizer(u)}>
                          <Rocket className="mr-2 h-4 w-4" /> Make organizer
                        </Button>
                      ))}
                      {!isAdmin && (
                        <Button size="sm" variant={u.is_suspended ? "outline" : "destructive"} onClick={() => toggleSuspend(u)}>
                          {u.is_suspended ? <><ShieldCheck className="mr-2 h-4 w-4" /> Unsuspend</> : <><ShieldOff className="mr-2 h-4 w-4" /> Suspend</>}
                        </Button>
                      )}
                    </div>
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

export default AdminUsers;
