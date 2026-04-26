import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ImagePlus, Upload, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Send, Save, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { EventStaffManager } from "@/components/EventStaffManager";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) +
  "-" + Math.random().toString(36).slice(2, 7);

const EventEditor = () => {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    title: "",
    description: "",
    terms: "",
    venue: "",
    city: "",
    starts_at: "",
    ends_at: "",
    banner_image: "",
    type_id: "",
    status: "draft" as string,
  });

  useEffect(() => {
    supabase.from("event_types").select("id, name").order("name").then(({ data }) => setTypes(data ?? []));
    supabase.from("event_tags").select("id, name").order("name").then(({ data }) => setTags(data ?? []));
  }, []);

  useEffect(() => {
    if (isNew) return;
    supabase
      .from("events")
      .select("*, event_tag_map(tag_id)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          toast.error("Event not found");
          navigate("/organizer");
          return;
        }
        setForm({
          title: data.title,
          description: data.description ?? "",
          terms: (data as any).terms ?? "",
          venue: data.venue ?? "",
          city: data.city ?? "",
          starts_at: data.starts_at?.slice(0, 16) ?? "",
          ends_at: data.ends_at?.slice(0, 16) ?? "",
          banner_image: data.banner_image ?? "",
          type_id: data.type_id ?? "",
          status: data.status,
        });
        setSelectedTags(new Set((data.event_tag_map ?? []).map((m: any) => m.tag_id)));
        setLoading(false);
      });
  }, [id, isNew, navigate]);

  const handleSave = async (asDraft = true) => {
    if (!user) return;
    if (!form.title || !form.starts_at || !form.ends_at) {
      return toast.error("Title and dates are required");
    }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title,
        description: form.description,
        venue: form.venue,
        city: form.city,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        banner_image: form.banner_image || null,
        type_id: form.type_id || null,
        organizer_id: user.id,
      };

      let eventId = id;
      if (isNew) {
        payload.slug = slugify(form.title);
        payload.status = "draft";
        const { data, error } = await supabase.from("events").insert(payload).select("id").single();
        if (error) throw error;
        eventId = data.id;
      } else {
        if (asDraft && form.status === "published") {
          // editing a published event keeps it published; submit will create edit request
        }
        const { error } = await supabase.from("events").update(payload).eq("id", id);
        if (error) throw error;
      }

      // sync tags
      if (eventId) {
        await supabase.from("event_tag_map").delete().eq("event_id", eventId);
        if (selectedTags.size > 0) {
          await supabase.from("event_tag_map").insert(
            Array.from(selectedTags).map((tag_id) => ({ event_id: eventId, tag_id }))
          );
        }
      }

      toast.success(isNew ? "Event created" : "Event saved");
      if (isNew) navigate(`/organizer/events/${eventId}`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!user || isNew) return;
    setSubmitting(true);
    try {
      // snapshot
      const { data: ev } = await supabase.from("events").select("*").eq("id", id).single();
      if (!ev) throw new Error("Event not found");

      const isEdit = ev.status === "published" || ev.status === "approved";
      const newStatus = isEdit ? "pending_edit_approval" : "pending_approval";

      const { error: reqErr } = await supabase.from("event_approval_requests").insert({
        event_id: id,
        organizer_id: user.id,
        request_type: isEdit ? "edit" : "publish",
        snapshot: ev as any,
        status: "pending",
      });
      if (reqErr) throw reqErr;

      const { error: updErr } = await supabase
        .from("events")
        .update({ status: newStatus as any })
        .eq("id", id);
      if (updErr) throw updErr;

      toast.success("Submitted for admin review");
      navigate("/organizer");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isLive = form.status === "published" || form.status === "approved";
  const canSubmit = !isNew && (form.status === "draft" || form.status === "rejected" || isLive);

  return (
    <>
      <Helmet>
        <title>{isNew ? "New event" : "Edit event"} — PULSE</title>
      </Helmet>
      <div className="container max-w-3xl py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to={isNew ? "/organizer" : `/organizer/events/${id}/analytics`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Link>
        </Button>

        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <h1 className="font-display text-3xl font-bold">
            {isNew ? "Create event" : "Edit event"}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {!isNew && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/organizer/events/${id}/tiers`}>Manage tiers</Link>
              </Button>
            )}
            {!isNew && <Badge variant="outline">{form.status.replace(/_/g, " ")}</Badge>}
          </div>
        </div>

        <Card className="p-6 bg-gradient-card border-border/50 space-y-5">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              rows={6}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="starts">Starts at *</Label>
              <Input
                id="starts"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="ends">Ends at *</Label>
              <Input
                id="ends"
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="banner">Banner image URL</Label>
            <Input
              id="banner"
              value={form.banner_image}
              onChange={(e) => setForm({ ...form, banner_image: e.target.value })}
              placeholder="https://..."
              className="mt-1.5"
            />
          </div>

          <div>
            <Label>Event type *</Label>
            <Select value={form.type_id} onValueChange={(v) => setForm({ ...form, type_id: v })}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((t) => {
                const active = selectedTags.has(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => {
                      const next = new Set(selectedTags);
                      if (active) next.delete(t.id);
                      else next.add(t.id);
                      setSelectedTags(next);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-smooth ${
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-glow"
                        : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border/50 flex-wrap">
            <Button onClick={() => handleSave(true)} disabled={saving} variant="outline">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save draft
            </Button>
            {canSubmit && (
              <Button
                onClick={handleSubmitForApproval}
                disabled={submitting}
                className="bg-gradient-primary border-0 shadow-glow"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="mr-2 h-4 w-4" />
                {isLive ? "Submit edit for review" : "Submit for approval"}
              </Button>
            )}
          </div>
        </Card>

        {!isNew && (
          <Card className="p-6 bg-gradient-card border-border/50 mt-6">
            <h2 className="font-display text-xl font-bold mb-1">Door staff</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Staff you add here can scan tickets at the door for this event.
            </p>
            <EventStaffManager eventId={id!} />
          </Card>
        )}
      </div>
    </>
  );
};

export default EventEditor;
