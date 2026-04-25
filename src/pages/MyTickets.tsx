import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, MapPin, CheckCircle2, XCircle, Eye, EyeOff, MapPinCheck } from "lucide-react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { Helmet } from "react-helmet-async";

const TicketCard = ({ t }: { t: any }) => {
  const [showCode, setShowCode] = useState(false);
  const cancelled = t.status === "cancelled";
  const scans: Array<{ name: string | null; scanned_at: string }> = (t.ticket_scans ?? [])
    .slice()
    .sort((a: any, b: any) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime())
    .map((s: any) => ({ name: s.event_checkpoints?.name ?? null, scanned_at: s.scanned_at }));

  return (
    <Card className="overflow-hidden bg-gradient-card border-border/50">
      <div className="grid sm:grid-cols-[1fr_auto] gap-6 p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge className="bg-primary/15 text-primary border-primary/30">
              {t.ticket_tiers?.name}
            </Badge>
            {scans.map((s, i) => (
              <Badge key={i} className="bg-success/20 text-success border-success/40">
                <MapPinCheck className="h-3 w-3 mr-1" />
                {s.name ?? "Scanned"}
              </Badge>
            ))}
            {cancelled && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" /> Cancelled
              </Badge>
            )}
          </div>
          <Link to={`/events/${t.events?.slug}`}>
            <h2 className="font-display text-2xl font-bold hover:text-primary transition-smooth">
              {t.events?.title}
            </h2>
          </Link>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-3">
            {t.events?.starts_at && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                {format(new Date(t.events.starts_at), "EEE, MMM d · h:mm a")}
              </div>
            )}
            {(t.events?.venue || t.events?.city) && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                {[t.events.venue, t.events.city].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-4 transition-smooth"
          >
            {showCode ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showCode ? "Hide code" : "Show code (manual entry)"}
          </button>
          {showCode && (
            <p className="text-xs text-muted-foreground mt-2 font-mono break-all select-all">
              {t.qr_code}
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 mx-auto sm:mx-0">
          <div
            className={`bg-white p-4 rounded-2xl shadow-card flex items-center justify-center ${
              cancelled ? "opacity-30 grayscale" : ""
            }`}
          >
            <QRCodeSVG value={t.qr_code} size={176} level="M" />
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {cancelled ? "Cancelled" : "Show at the door"}
          </p>
        </div>
      </div>
    </Card>
  );
};

const MyTickets = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("tickets")
      .select("*, ticket_tiers(name, price_cents, currency), events(title, slug, starts_at, venue, city, banner_image), ticket_scans(scanned_at, event_checkpoints(name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTickets(data ?? []);
        setLoading(false);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet><title>My tickets — PULSE</title></Helmet>
      <div className="container max-w-4xl py-10">
        <h1 className="font-display text-4xl font-bold mb-2">My tickets</h1>
        <p className="text-muted-foreground mb-8">Show the QR at the door for entry.</p>

        {tickets.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-card border-border/50">
            <p className="text-muted-foreground mb-4">You don't have any tickets yet.</p>
            <Button asChild className="bg-gradient-primary border-0">
              <Link to="/events">Discover events</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tickets.map((t) => (
              <TicketCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default MyTickets;
