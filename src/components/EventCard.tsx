import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Calendar, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface EventCardData {
  id: string;
  title: string;
  slug: string;
  venue: string | null;
  city: string | null;
  starts_at: string;
  banner_image: string | null;
  type_name?: string | null;
  tags?: string[];
}

export const EventCard = ({ event }: { event: EventCardData }) => {
  return (
    <Link
      to={`/events/${event.slug}`}
      className="group relative block overflow-hidden rounded-2xl bg-gradient-card border border-border/50 transition-smooth hover:border-primary/50 hover:shadow-elegant hover:-translate-y-1"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {event.banner_image ? (
          <img
            src={event.banner_image}
            alt={event.title}
            loading="lazy"
            className="h-full w-full object-cover transition-smooth group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-hero opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        {event.type_name && (
          <Badge className="absolute top-3 left-3 bg-background/80 backdrop-blur border-primary/30 text-primary">
            {event.type_name}
          </Badge>
        )}
      </div>

      <div className="p-5 space-y-3">
        <h3 className="font-display text-lg font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-smooth">
          {event.title}
        </h3>

        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{format(new Date(event.starts_at), "MMM d, yyyy · h:mm a")}</span>
          </div>
          {(event.venue || event.city) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">
                {[event.venue, event.city].filter(Boolean).join(", ")}
              </span>
            </div>
          )}
        </div>

        {event.tags && event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {event.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};
