import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Camera,
  CameraOff,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type ScanResult = {
  ok: boolean;
  code: string;
  message: string;
  attendee_email?: string | null;
  tier_name?: string | null;
  checked_in_at?: string | null;
};

const COOLDOWN_MS = 1500; // ignore the same code within this window

const ScanResultCard = ({ result }: { result: ScanResult }) => {
  const variant = result.ok
    ? "success"
    : result.code === "already_checked_in"
      ? "warning"
      : "error";

  const styles = {
    success: "border-success/50 bg-success/10",
    warning: "border-warning/50 bg-warning/10",
    error: "border-destructive/50 bg-destructive/10",
  }[variant];

  const Icon = result.ok ? CheckCircle2 : result.code === "already_checked_in" ? AlertTriangle : XCircle;
  const iconClass = result.ok
    ? "text-success"
    : result.code === "already_checked_in"
      ? "text-warning"
      : "text-destructive";

  return (
    <Card className={`p-5 border-2 ${styles}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-7 w-7 shrink-0 ${iconClass}`} />
        <div className="min-w-0">
          <p className="font-display font-bold text-lg">{result.message}</p>
          {result.attendee_email && (
            <p className="text-sm text-muted-foreground truncate">{result.attendee_email}</p>
          )}
          {result.tier_name && (
            <Badge variant="outline" className="mt-1.5">{result.tier_name}</Badge>
          )}
          {result.checked_in_at && (
            <p className="text-xs text-muted-foreground mt-2">
              Originally scanned {format(new Date(result.checked_in_at), "PPp")}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};

const EventScan = () => {
  const { id: eventId } = useParams();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [eventTitle, setEventTitle] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState({ ok: 0, dup: 0, fail: 0 });
  const [loading, setLoading] = useState(true);

  // Authorize and load event
  useEffect(() => {
    if (!user || !eventId) return;
    let mounted = true;
    (async () => {
      const [{ data: ev }, { data: canScan }] = await Promise.all([
        supabase.from("events").select("title").eq("id", eventId).maybeSingle(),
        supabase.rpc("can_scan_event", { _event_id: eventId, _user_id: user.id }),
      ]);
      if (!mounted) return;
      setEventTitle(ev?.title ?? "Event");
      setAuthorized(Boolean(canScan));
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user, eventId]);

  // Enumerate cameras once authorized
  useEffect(() => {
    if (!authorized) return;
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((d) => {
        setDevices(d);
        // Prefer back camera if labelled
        const back = d.find((x) => /back|rear|environment/i.test(x.label));
        setDeviceId(back?.deviceId ?? d[0]?.deviceId);
      })
      .catch(() => setDevices([]));
  }, [authorized]);

  const handleScan = useCallback(
    async (code: string) => {
      if (!eventId || busy) return;
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.at < COOLDOWN_MS) return;
      lastScanRef.current = { code, at: now };

      setBusy(true);
      try {
        const { data, error } = await supabase.rpc("check_in_ticket", {
          _qr_code: code,
          _event_id: eventId,
        });
        if (error) throw error;
        const r = data as unknown as ScanResult;
        setLastResult(r);
        setStats((s) => ({
          ok: s.ok + (r.ok ? 1 : 0),
          dup: s.dup + (r.code === "already_checked_in" ? 1 : 0),
          fail: s.fail + (!r.ok && r.code !== "already_checked_in" ? 1 : 0),
        }));
        // brief haptic where supported
        if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [40, 40, 40]);
      } catch (e: any) {
        toast.error(e.message ?? "Scan failed");
      } finally {
        // small delay so user sees result before next scan can register
        setTimeout(() => setBusy(false), 400);
      }
    },
    [eventId, busy]
  );

  const startScanning = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result) => {
          if (result) handleScan(result.getText());
        }
      );
      controlsRef.current = controls;
      setScanning(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Camera permission denied");
    }
  }, [deviceId, handleScan]);

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  // Stop on unmount
  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  // Restart when device changes mid-session
  useEffect(() => {
    if (scanning) {
      stopScanning();
      // give time to release device before restart
      const t = setTimeout(startScanning, 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authorized === false) {
    return <Navigate to="/organizer" replace />;
  }

  return (
    <>
      <Helmet>
        <title>Scan tickets — {eventTitle}</title>
      </Helmet>
      <div className="container max-w-2xl py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to={`/organizer/events/${eventId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to event
          </Link>
        </Button>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <Users className="inline h-3 w-3 mr-1" /> Door scanner
          </p>
          <h1 className="font-display text-3xl font-bold">{eventTitle}</h1>
        </div>

        <Card className="overflow-hidden bg-card border-border/50 mb-4">
          <div className="relative aspect-square bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
                <Camera className="h-12 w-12 opacity-60" />
                <p className="text-sm opacity-80">Camera is off</p>
              </div>
            )}
            {scanning && (
              <>
                <div className="absolute inset-12 border-2 border-primary/70 rounded-2xl shadow-glow pointer-events-none" />
                {busy && (
                  <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" /> processing
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2">
              {scanning ? (
                <Button onClick={stopScanning} variant="outline">
                  <CameraOff className="mr-2 h-4 w-4" /> Stop
                </Button>
              ) : (
                <Button onClick={startScanning} className="bg-gradient-primary border-0 shadow-glow">
                  <Camera className="mr-2 h-4 w-4" /> Start scanning
                </Button>
              )}
            </div>
            {devices.length > 1 && (
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Camera" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d, i) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </Card>

        {lastResult && (
          <div className="mb-4">
            <ScanResultCard result={lastResult} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center bg-success/10 border-success/30">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Checked in</p>
            <p className="font-display text-3xl font-bold text-success">{stats.ok}</p>
          </Card>
          <Card className="p-4 text-center bg-warning/10 border-warning/30">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Duplicates</p>
            <p className="font-display text-3xl font-bold text-warning">{stats.dup}</p>
          </Card>
          <Card className="p-4 text-center bg-destructive/10 border-destructive/30">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Rejected</p>
            <p className="font-display text-3xl font-bold text-destructive">{stats.fail}</p>
          </Card>
        </div>
      </div>
    </>
  );
};

export default EventScan;
