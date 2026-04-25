import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Camera,
  CameraOff,
  Users,
  MapPin,
  Plus,
  Trash2,
  Settings2,
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

type Checkpoint = { id: string; name: string; sort_order: number };
type Booth = { id: string; checkpoint_id: string; name: string; sort_order: number };

const COOLDOWN_MS = 3000;
const POPUP_AUTO_CLOSE_MS = 2500;
const LS_PREFIX = "pulse_scan";

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

const ManageDialog = ({
  eventId,
  checkpoints,
  booths,
  onChanged,
}: {
  eventId: string;
  checkpoints: Checkpoint[];
  booths: Booth[];
  onChanged: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [newCheckpoint, setNewCheckpoint] = useState("");
  const [newBooth, setNewBooth] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const addCheckpoint = async () => {
    const name = newCheckpoint.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase
      .from("event_checkpoints")
      .insert({ event_id: eventId, name, sort_order: checkpoints.length });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewCheckpoint("");
    onChanged();
  };

  const addBooth = async (checkpointId: string) => {
    const name = (newBooth[checkpointId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    const count = booths.filter((b) => b.checkpoint_id === checkpointId).length;
    const { error } = await supabase
      .from("event_booths")
      .insert({ checkpoint_id: checkpointId, name, sort_order: count });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewBooth((s) => ({ ...s, [checkpointId]: "" }));
    onChanged();
  };

  const removeCheckpoint = async (id: string) => {
    if (!confirm("Delete this checkpoint and its booths?")) return;
    const { error } = await supabase.from("event_checkpoints").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const removeBooth = async (id: string) => {
    const { error } = await supabase.from("event_booths").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" /> Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkpoints & booths</DialogTitle>
          <DialogDescription>
            Set up entry points (e.g. "Main Gate") and lanes inside them ("Booth 1", "Booth 2").
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex gap-2">
            <Input
              placeholder="New checkpoint name"
              value={newCheckpoint}
              onChange={(e) => setNewCheckpoint(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCheckpoint()}
            />
            <Button onClick={addCheckpoint} disabled={busy || !newCheckpoint.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {checkpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No checkpoints yet. Add one above.
            </p>
          ) : (
            <div className="space-y-3">
              {checkpoints.map((cp) => {
                const cpBooths = booths.filter((b) => b.checkpoint_id === cp.id);
                return (
                  <Card key={cp.id} className="p-3 bg-card border-border/50">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" /> {cp.name}
                      </p>
                      <Button size="icon" variant="ghost" onClick={() => removeCheckpoint(cp.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {cpBooths.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2 pl-6">
                        {cpBooths.map((b) => (
                          <Badge key={b.id} variant="secondary" className="gap-1">
                            {b.name}
                            <button
                              onClick={() => removeBooth(b.id)}
                              className="ml-1 hover:text-destructive"
                              aria-label="Remove booth"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pl-6">
                      <Input
                        placeholder="New booth"
                        value={newBooth[cp.id] ?? ""}
                        onChange={(e) => setNewBooth((s) => ({ ...s, [cp.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addBooth(cp.id)}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" variant="outline" onClick={() => addBooth(cp.id)} disabled={busy}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const EventScan = () => {
  const { id: eventId } = useParams();
  const { user, isAdmin } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [eventTitle, setEventTitle] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [stats, setStats] = useState({ ok: 0, dup: 0, fail: 0 });
  const [loading, setLoading] = useState(true);

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [checkpointId, setCheckpointId] = useState<string>("");
  const [boothId, setBoothId] = useState<string>("");
  // refs so handleScan always reads the latest selection without re-binding the camera
  const checkpointRef = useRef("");
  const boothRef = useRef("");
  useEffect(() => { checkpointRef.current = checkpointId; }, [checkpointId]);
  useEffect(() => { boothRef.current = boothId; }, [boothId]);

  const loadCheckpoints = useCallback(async () => {
    if (!eventId) return;
    const [{ data: cps }, { data: bs }] = await Promise.all([
      supabase.from("event_checkpoints").select("id,name,sort_order").eq("event_id", eventId).order("sort_order"),
      supabase
        .from("event_booths")
        .select("id,checkpoint_id,name,sort_order, event_checkpoints!inner(event_id)")
        .eq("event_checkpoints.event_id", eventId)
        .order("sort_order"),
    ]);
    setCheckpoints((cps ?? []) as Checkpoint[]);
    setBooths(((bs ?? []) as any[]).map(({ event_checkpoints, ...b }) => b as Booth));
  }, [eventId]);

  // Authorize and load event
  useEffect(() => {
    if (!user || !eventId) return;
    let mounted = true;
    (async () => {
      const [{ data: ev }, { data: canScan }] = await Promise.all([
        supabase.from("events").select("title, organizer_id").eq("id", eventId).maybeSingle(),
        supabase.rpc("can_scan_event", { _event_id: eventId, _user_id: user.id }),
      ]);
      if (!mounted) return;
      setEventTitle(ev?.title ?? "Event");
      setAuthorized(Boolean(canScan));
      setCanManage(Boolean(isAdmin || (ev && ev.organizer_id === user.id)));
      await loadCheckpoints();
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user, eventId, isAdmin, loadCheckpoints]);

  // Restore last selected checkpoint/booth for this event
  useEffect(() => {
    if (!eventId || checkpoints.length === 0) return;
    const cp = localStorage.getItem(`${LS_PREFIX}_cp_${eventId}`) ?? "";
    const b = localStorage.getItem(`${LS_PREFIX}_booth_${eventId}`) ?? "";
    if (cp && checkpoints.some((c) => c.id === cp)) {
      setCheckpointId(cp);
      if (b && booths.some((x) => x.id === b && x.checkpoint_id === cp)) setBoothId(b);
    }
  }, [eventId, checkpoints, booths]);

  // Persist selections
  useEffect(() => {
    if (eventId) localStorage.setItem(`${LS_PREFIX}_cp_${eventId}`, checkpointId);
  }, [eventId, checkpointId]);
  useEffect(() => {
    if (eventId) localStorage.setItem(`${LS_PREFIX}_booth_${eventId}`, boothId);
  }, [eventId, boothId]);

  // Enumerate cameras once authorized
  useEffect(() => {
    if (!authorized) return;
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((d) => {
        setDevices(d);
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
          _checkpoint_id: checkpointRef.current || null,
          _booth_id: boothRef.current || null,
        } as any);
        if (error) throw error;
        const r = data as unknown as ScanResult;
        setLastResult(r);
        setResultOpen(true);
        setStats((s) => ({
          ok: s.ok + (r.ok ? 1 : 0),
          dup: s.dup + (r.code === "already_checked_in" ? 1 : 0),
          fail: s.fail + (!r.ok && r.code !== "already_checked_in" ? 1 : 0),
        }));
        if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [40, 40, 40]);
      } catch (e: any) {
        toast.error(e.message ?? "Scan failed");
      } finally {
        setTimeout(() => setBusy(false), COOLDOWN_MS);
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

  // Auto-close result popup so the next scan can show
  useEffect(() => {
    if (!resultOpen) return;
    const t = setTimeout(() => setResultOpen(false), POPUP_AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [resultOpen, lastResult]);

  useEffect(() => () => controlsRef.current?.stop(), []);

  useEffect(() => {
    if (scanning) {
      stopScanning();
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

  const currentBooths = booths.filter((b) => b.checkpoint_id === checkpointId);
  const currentCheckpoint = checkpoints.find((c) => c.id === checkpointId);
  const currentBooth = booths.find((b) => b.id === boothId);

  return (
    <>
      <Helmet>
        <title>Scan tickets — {eventTitle}</title>
      </Helmet>
      <div className="container max-w-2xl py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to={`/organizer/events/${eventId}/analytics`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to analytics
          </Link>
        </Button>

        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <Users className="inline h-3 w-3 mr-1" /> Door scanner
          </p>
          <h1 className="font-display text-3xl font-bold">{eventTitle}</h1>
          {(currentCheckpoint || currentBooth) && (
            <p className="text-sm text-muted-foreground mt-1">
              <MapPin className="inline h-3 w-3 mr-1 text-primary" />
              {currentCheckpoint?.name}
              {currentBooth && ` · ${currentBooth.name}`}
            </p>
          )}
        </div>

        {/* Checkpoint & booth selectors */}
        <Card className="p-4 mb-4 bg-gradient-card border-border/50">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Scan location
            </Label>
            {canManage && (
              <ManageDialog
                eventId={eventId!}
                checkpoints={checkpoints}
                booths={booths}
                onChanged={loadCheckpoints}
              />
            )}
          </div>

          {checkpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "No checkpoints yet — add one to track where scans happen."
                : "Organizer has not set up checkpoints. Scans will be recorded without a location."}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Checkpoint</Label>
                <Select
                  value={checkpointId}
                  onValueChange={(v) => {
                    setCheckpointId(v);
                    setBoothId(""); // reset booth when checkpoint changes
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select checkpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {checkpoints.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Booth</Label>
                <Select
                  value={boothId}
                  onValueChange={setBoothId}
                  disabled={!checkpointId || currentBooths.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !checkpointId
                          ? "Pick a checkpoint first"
                          : currentBooths.length === 0
                            ? "No booths"
                            : "Select booth"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {currentBooths.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Selection stays the same for every scan until you change it manually.
          </p>
        </Card>

        <Card className="overflow-hidden bg-card border-border/50 mb-4">
          <div className="relative aspect-square bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
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
