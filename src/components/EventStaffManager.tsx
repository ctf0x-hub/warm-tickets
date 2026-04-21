import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Staff = {
  id: string;
  user_id: string;
  invited_email: string;
  created_at: string;
};

export const EventStaffManager = ({ eventId }: { eventId: string }) => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("event_staff")
      .select("id, user_id, invited_email, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    setStaff(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const add = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const { data, error } = await supabase.rpc("add_event_staff_by_email", {
        _event_id: eventId,
        _email: trimmed,
      });
      if (error) throw error;
      const result = data as { ok: boolean; message?: string };
      if (!result?.ok) throw new Error(result?.message ?? "Could not add");
      toast.success("Staff member added");
      setEmail("");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("event_staff").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    setStaff((s) => s.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="staff-email">Add staff by email</Label>
        <p className="text-xs text-muted-foreground mb-2">
          The person must already have an account on PULSE.
        </p>
        <div className="flex gap-2">
          <Input
            id="staff-email"
            type="email"
            placeholder="staff@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add} disabled={adding || !email.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Current staff ({staff.length})</p>
        {loading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : staff.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border/50 rounded-lg">
            No staff added yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {staff.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/50 bg-card/50"
              >
                <span className="text-sm truncate">{s.invited_email}</span>
                <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
