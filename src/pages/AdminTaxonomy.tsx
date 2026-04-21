import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const AdminTaxonomy = () => {
  const [types, setTypes] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [newType, setNewType] = useState("");
  const [newTag, setNewTag] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: t }, { data: g }] = await Promise.all([
      supabase.from("event_types").select("*").order("name"),
      supabase.from("event_tags").select("*").order("name"),
    ]);
    setTypes(t ?? []);
    setTags(g ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addType = async () => {
    if (!newType.trim()) return;
    const { error } = await supabase.from("event_types").insert({ name: newType.trim(), slug: slugify(newType) });
    if (error) return toast.error(error.message);
    setNewType("");
    load();
  };
  const removeType = async (id: string) => {
    const { error } = await supabase.from("event_types").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  const addTag = async () => {
    if (!newTag.trim()) return;
    const { error } = await supabase.from("event_tags").insert({ name: newTag.trim(), slug: slugify(newTag) });
    if (error) return toast.error(error.message);
    setNewTag("");
    load();
  };
  const removeTag = async (id: string) => {
    const { error } = await supabase.from("event_tags").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <>
      <Helmet><title>Taxonomy — PULSE Admin</title></Helmet>
      <div className="container max-w-4xl py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Taxonomy</h1>
        <p className="text-muted-foreground mb-8">Manage event types and tags.</p>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6 bg-gradient-card border-border/50">
              <h3 className="font-display font-semibold text-lg mb-4">Event types</h3>
              <div className="flex gap-2 mb-4">
                <Input placeholder="New type name" value={newType} onChange={(e) => setNewType(e.target.value)} />
                <Button onClick={addType} size="icon" className="bg-gradient-primary border-0 shrink-0"><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2">
                {types.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/40">
                    <span className="text-sm">{t.name}</span>
                    <Button onClick={() => removeType(t.id)} variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 bg-gradient-card border-border/50">
              <h3 className="font-display font-semibold text-lg mb-4">Tags</h3>
              <div className="flex gap-2 mb-4">
                <Input placeholder="New tag name" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
                <Button onClick={addTag} size="icon" className="bg-gradient-primary border-0 shrink-0"><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <div key={t.id} className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-muted border border-border/40 text-sm">
                    {t.name}
                    <button onClick={() => removeTag(t.id)} className="h-5 w-5 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminTaxonomy;
