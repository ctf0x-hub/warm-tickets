import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { EventCard, EventCardData } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Search, X } from "lucide-react";
import { Helmet } from "react-helmet-async";

type Tab = "upcoming" | "ongoing" | "past";

const EventsCatalog = () => {
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const tab = (params.get("tab") as Tab) || "upcoming";
  const q = params.get("q") || "";
  const typeId = params.get("type") || "all";
  const sort = params.get("sort") || "date_asc";
  const city = params.get("city") || "";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (!v || v === "all") next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  // Debounced search input
  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setParam("q", qInput || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  useEffect(() => {
    supabase
      .from("event_types")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTypes(data ?? []));
    supabase
      .from("event_tags")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTags(data ?? []));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const now = new Date().toISOString();
      let query = supabase
        .from("events")
        .select(
          "id, title, slug, venue, city, starts_at, ends_at, banner_image, type_id, event_types(name), event_tag_map(event_tags(name))"
        )
        .in("status", ["published", "approved"])
        .is("deleted_at", null);

      if (tab === "upcoming") query = query.gt("starts_at", now);
      if (tab === "past") query = query.lt("ends_at", now);
      if (tab === "ongoing")
        query = query.lte("starts_at", now).gte("ends_at", now);

      if (typeId !== "all") query = query.eq("type_id", typeId);
      if (city) query = query.ilike("city", `%${city}%`);
      if (q) query = query.textSearch("search_vector", q, { type: "websearch" });

      const ascending = sort === "date_asc";
      query = query.order("starts_at", { ascending });

      const { data, error } = await query.limit(60);
      if (error) console.error(error);

      setEvents(
        (data ?? []).map((e: any) => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          venue: e.venue,
          city: e.city,
          starts_at: e.starts_at,
          banner_image: e.banner_image,
          type_name: e.event_types?.name,
          tags: (e.event_tag_map ?? []).map((m: any) => m.event_tags?.name).filter(Boolean),
        }))
      );
      setLoading(false);
    };
    load();
  }, [tab, q, typeId, sort, city]);

  const activeFilters = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    if (q) out.push({ key: "q", label: `"${q}"` });
    if (typeId !== "all") {
      const t = types.find((x) => x.id === typeId);
      if (t) out.push({ key: "type", label: t.name });
    }
    if (city) out.push({ key: "city", label: city });
    return out;
  }, [q, typeId, city, types]);

  return (
    <>
      <Helmet>
        <title>Discover events — PULSE</title>
        <meta name="description" content="Browse upcoming concerts, conferences, festivals and more on PULSE." />
      </Helmet>

      <div className="container py-12">
        <div className="mb-8">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">
            Discover events
          </h1>
          <p className="text-muted-foreground text-lg">
            From sold-out shows to hidden gems — find what moves you.
          </p>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur p-4 mb-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_200px_180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events, venues, tags..."
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeId} onValueChange={(v) => setParam("type", v)}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="City"
              value={city}
              onChange={(e) => setParam("city", e.target.value || null)}
            />
            <Select value={sort} onValueChange={(v) => setParam("sort", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_asc">Date · soonest</SelectItem>
                <SelectItem value="date_desc">Date · latest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground">Active:</span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    if (f.key === "q") setQInput("");
                    setParam(f.key, null);
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-smooth"
                >
                  {f.label} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setParam("tab", v === "upcoming" ? null : v)}>
          <TabsList className="mb-6">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>

          <TabsContent value={tab}>
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-20 rounded-2xl border border-dashed border-border/60 bg-card/40">
                <p className="text-muted-foreground">No events match your filters.</p>
                <Button
                  variant="ghost"
                  className="mt-4"
                  onClick={() => setParams({}, { replace: true })}
                >
                  Clear all filters
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default EventsCatalog;
