import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Calendar, MapPin, Loader2, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";
import { TierList } from "@/components/TierList";

const EventDetail = () => {
  const { slug } = useParams();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("events")
      .select(
        "*, event_types(name), event_tag_map(event_tags(name)), profiles!events_organizer_id_fkey(name)"
      )
      .eq("slug", slug)
      .in("status", ["published", "approved"])
      .is("deleted_at", null)
      .maybeSingle()
      .then(({ data }) => {
        setEvent(data);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="container py-32 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container py-32 text-center">
        <h1 className="font-display text-3xl font-bold mb-3">Event not found</h1>
        <p className="text-muted-foreground mb-6">It may have been removed or unpublished.</p>
        <Button asChild>
          <Link to="/events">Back to events</Link>
        </Button>
      </div>
    );
  }

  const now = new Date();
  const isPast = new Date(event.ends_at) < now;
  const isOngoing = new Date(event.starts_at) <= now && new Date(event.ends_at) >= now;
  const tags = (event.event_tag_map ?? []).map((m: any) => m.event_tags?.name).filter(Boolean);

  return (
    <>
      <Helmet>
        <title>{event.title} — PULSE</title>
        <meta name="description" content={event.description?.slice(0, 160) ?? event.title} />
      </Helmet>

      <div className="relative">
        <div className="absolute inset-0 h-[420px] overflow-hidden">
          {event.banner_image ? (
            <img src={event.banner_image} alt="" className="w-full h-full object-cover opacity-40" />
          ) : (
            <div className="w-full h-full bg-gradient-hero opacity-50" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-background" />
        </div>

        <div className="container relative pt-8 pb-16">
          <Button asChild variant="ghost" size="sm" className="mb-6">
            <Link to="/events">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to events
            </Link>
          </Button>

          <div className="grid lg:grid-cols-[1fr_360px] gap-12 mt-8">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {event.event_types?.name && (
                  <Badge className="bg-primary/15 text-primary border-primary/30">
                    {event.event_types.name}
                  </Badge>
                )}
                {isOngoing && (
                  <Badge className="bg-success/20 text-success border-success/40">
                    Currently in progress
                  </Badge>
                )}
                {isPast && <Badge variant="secondary">Event ended</Badge>}
              </div>

              <h1 className="font-display text-4xl md:text-6xl font-bold leading-tight mb-6">
                {event.title}
              </h1>

              <div className="flex flex-wrap gap-6 text-muted-foreground mb-8">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>{format(new Date(event.starts_at), "EEE, MMM d, yyyy · h:mm a")}</span>
                </div>
                {(event.venue || event.city) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{[event.venue, event.city].filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </div>

              {event.description && (
                <div className="prose prose-invert max-w-none">
                  <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground/90">
                    {event.description}
                  </p>
                </div>
              )}

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-8 pt-8 border-t border-border/50">
                  {tags.map((t: string) => (
                    <span
                      key={t}
                      className="text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-muted text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <aside className="lg:sticky lg:top-24 self-start">
              <div className="rounded-2xl border border-border/50 bg-gradient-card p-6 shadow-card">
                <h3 className="font-display font-semibold text-lg mb-4">Tickets</h3>
                {!isPast ? (
                  <TierList eventId={event.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">This event has ended.</p>
                )}
                {event.profiles?.name && (
                  <p className="text-xs text-muted-foreground mt-6 pt-6 border-t border-border/50">
                    Organized by <span className="text-foreground">{event.profiles.name}</span>
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
};

export default EventDetail;
