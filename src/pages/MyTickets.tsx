import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Calendar,
  MapPin,
  XCircle,
  Eye,
  EyeOff,
  MapPinCheck,
  Download,
  Share2,
  Ticket as TicketIcon,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type Scan = { name: string | null; scanned_at: string };

const TicketCard = ({ t }: { t: any }) => {
  const [showCode, setShowCode] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "share" | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const terms: string | null = t.events?.terms ?? null;

  const cancelled = t.status === "cancelled";
  const scans: Scan[] = (t.ticket_scans ?? [])
    .slice()
    .sort(
      (a: any, b: any) =>
        new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime()
    )
    .map((s: any) => ({
      name: s.event_checkpoints?.name ?? null,
      scanned_at: s.scanned_at,
    }));

  const eventUrl = `${window.location.origin}/events/${t.events?.slug}`;
  const banner = t.events?.banner_image;

  const downloadPdf = async () => {
    if (!pdfRef.current) return;
    setBusy("pdf");
    try {
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(img, "PNG", 0, 0, canvas.width, canvas.height);
      const safe = (t.events?.title || "ticket").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      pdf.save(`${safe}-ticket.pdf`);
    } catch (e) {
      toast.error("Could not generate PDF");
    } finally {
      setBusy(null);
    }
  };

  const shareTicket = async () => {
    setBusy("share");
    const shareData = {
      title: t.events?.title ?? "My ticket",
      text: `I'm going to ${t.events?.title}! 🎟️`,
      url: eventUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(eventUrl);
        toast.success("Event link copied to clipboard");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Could not share");
    } finally {
      setBusy(null);
    }
  };

  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Card className="overflow-hidden bg-gradient-card border-border/50 shadow-card">
      {banner && !imgFailed && (
        <div className="relative h-40 sm:h-48 overflow-hidden bg-muted">
          <img
            src={banner}
            alt={t.events?.title}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
            <Badge className="bg-primary/90 text-primary-foreground border-0 backdrop-blur">
              <TicketIcon className="h-3 w-3 mr-1" />
              {t.ticket_tiers?.name}
            </Badge>
            {cancelled && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" /> Cancelled
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-[1fr_auto] gap-6 p-6">
        <div className="min-w-0">
          <Link to={`/events/${t.events?.slug}`}>
            <h2 className="font-display text-2xl font-bold hover:text-primary transition-smooth leading-tight">
              {t.events?.title}
            </h2>
          </Link>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground mt-3">
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

          {scans.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Checkpoints
              </p>
              <div className="flex flex-wrap gap-1.5">
                {scans.map((s, i) => (
                  <Badge
                    key={i}
                    className="bg-success/15 text-success border border-success/30 hover:bg-success/20"
                  >
                    <MapPinCheck className="h-3 w-3 mr-1" />
                    {s.name ?? "Scanned"}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            <Button
              size="sm"
              variant="outline"
              onClick={downloadPdf}
              disabled={busy !== null || cancelled}
            >
              {busy === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={shareTicket}
              disabled={busy !== null}
            >
              {busy === "share" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Share
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCode((v) => !v)}
            >
              {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showCode ? "Hide code" : "Show code"}
            </Button>
            {terms && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowTerms((v) => !v)}
              >
                <FileText className="h-4 w-4" />
                Terms
                {showTerms ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>

          {showCode && (
            <p className="text-xs text-muted-foreground mt-3 font-mono break-all select-all bg-muted/40 p-2 rounded-md">
              {t.qr_code}
            </p>
          )}

          {showTerms && terms && (
            <div className="mt-3 p-3 rounded-md bg-muted/40 border border-border/40">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Ticket terms &amp; conditions
              </p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {terms}
              </p>
            </div>
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

      {/* Hidden printable layout used for PDF export */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
        <div
          ref={pdfRef}
          style={{
            width: 720,
            background: "#ffffff",
            color: "#0f172a",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {banner && (
            <img
              src={banner}
              alt=""
              crossOrigin="anonymous"
              style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
            />
          )}
          <div style={{ padding: 32, display: "grid", gridTemplateColumns: "1fr auto", gap: 32 }}>
            <div>
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "#eef2ff",
                  color: "#4338ca",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                {t.ticket_tiers?.name}
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.2 }}>
                {t.events?.title}
              </h1>
              {t.events?.starts_at && (
                <p style={{ margin: "4px 0", fontSize: 14, color: "#475569" }}>
                  📅 {format(new Date(t.events.starts_at), "EEEE, MMMM d, yyyy · h:mm a")}
                </p>
              )}
              {(t.events?.venue || t.events?.city) && (
                <p style={{ margin: "4px 0", fontSize: 14, color: "#475569" }}>
                  📍 {[t.events.venue, t.events.city].filter(Boolean).join(", ")}
                </p>
              )}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed #cbd5e1" }}>
                <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", margin: 0 }}>
                  Ticket code
                </p>
                <p style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all", margin: "4px 0 0" }}>
                  {t.qr_code}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ background: "#fff", padding: 12, border: "1px solid #e2e8f0", borderRadius: 12 }}>
                <QRCodeSVG value={t.qr_code} size={200} level="M" />
              </div>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", margin: 0 }}>
                Show at the door
              </p>
            </div>
          </div>
          {terms && (
            <div style={{ padding: "0 32px 32px", borderTop: "1px solid #e2e8f0" }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", margin: "16px 0 6px" }}>
                Ticket terms &amp; conditions
              </p>
              <p style={{ fontSize: 11, lineHeight: 1.5, color: "#475569", whiteSpace: "pre-wrap", margin: 0 }}>
                {terms}
              </p>
            </div>
          )}
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
      .select(
        "*, ticket_tiers(name, price_cents, currency), events(title, slug, starts_at, ends_at, venue, city, banner_image, terms), ticket_scans(scanned_at, event_checkpoints(name))"
      )
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

  const upcoming = tickets.filter(
    (t) => t.events?.ends_at && !isPast(new Date(t.events.ends_at)) && t.status !== "cancelled"
  );
  const past = tickets.filter(
    (t) => t.events?.ends_at && isPast(new Date(t.events.ends_at)) && t.status !== "cancelled"
  );
  const cancelled = tickets.filter((t) => t.status === "cancelled");

  const renderList = (list: any[], emptyText: string) =>
    list.length === 0 ? (
      <Card className="p-12 text-center bg-gradient-card border-border/50">
        <p className="text-muted-foreground">{emptyText}</p>
      </Card>
    ) : (
      <div className="grid gap-5">
        {list.map((t) => (
          <TicketCard key={t.id} t={t} />
        ))}
      </div>
    );

  return (
    <>
      <Helmet>
        <title>My tickets — PULSE</title>
      </Helmet>
      <div className="container max-w-4xl py-10">
        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="font-display text-4xl font-bold mb-2">My tickets</h1>
            <p className="text-muted-foreground">
              Show the QR at the door, download as PDF, or share with friends.
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            <TicketIcon className="h-3.5 w-3.5 mr-1.5" />
            {tickets.length} total
          </Badge>
        </div>

        {tickets.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-card border-border/50">
            <p className="text-muted-foreground mb-4">You don't have any tickets yet.</p>
            <Button asChild className="bg-gradient-primary border-0">
              <Link to="/events">Discover events</Link>
            </Button>
          </Card>
        ) : (
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="upcoming">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Upcoming ({upcoming.length})
              </TabsTrigger>
              <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled ({cancelled.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming">
              {renderList(upcoming, "No upcoming tickets.")}
            </TabsContent>
            <TabsContent value="past">
              {renderList(past, "No past events.")}
            </TabsContent>
            <TabsContent value="cancelled">
              {renderList(cancelled, "No cancelled tickets.")}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
};

export default MyTickets;
