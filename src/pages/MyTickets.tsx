import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { Helmet } from "react-helmet-async";

const MyTickets = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("tickets")
      .select("*, ticket_tiers(name, price_cents, currency), events(title, slug, starts_at, venue, city, banner_image)")
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
              <Card key={t.id} className="overflow-hidden bg-gradient-card border-border/50">
                <div className="grid sm:grid-cols-[1fr_auto] gap-6 p-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className="bg-primary/15 text-primary border-primary/30">
                        {t.ticket_tiers?.name}
                      </Badge>
                      {t.status === "checked_in" && (
                        <Badge variant="secondary">Checked in</Badge>
                      )}
                      {t.status === "cancelled" && (
                        <Badge variant="destructive">Cancelled</Badge>
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
                    <p className="text-xs text-muted-foreground mt-4 font-mono break-all">
                      {t.qr_code}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl flex items-center justify-center">
                    <QRCodeSVG value={t.qr_code} size={128} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default MyTickets;
