import { useEffect, useState, useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ArrowLeft,
  Ticket,
  DollarSign,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Pencil,
  ScanLine,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { format } from "date-fns";

type Analytics = {
  event: { id: string; starts_at: string; ends_at: string };
  totals: {
    sold: number;
    checked_in: number;
    cancelled: number;
    gross_cents: number;
    currency: string;
  };
  sold_series: { day: string; tickets: number; revenue_cents: number }[];
  scan_series: { minute: string; scans: number }[];
  tiers: {
    id: string;
    name: string;
    total_seats: number;
    price_cents: number;
    currency: string;
    sold: number;
    checked_in: number;
    revenue_cents: number;
  }[];
  scan_window: { start: string; end: string };
};

const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);

const KPI = ({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) => {
  const toneClass = {
    default: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    destructive: "text-destructive bg-destructive/10",
  }[tone];
  return (
    <Card className="p-5 bg-gradient-card border-border/50">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
      </div>
    </Card>
  );
};

const ChartCard = ({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
}) => (
  <Card className="p-5 bg-gradient-card border-border/50">
    <div className="mb-4">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    <div className="h-64">
      {empty ? (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          No data yet
        </div>
      ) : (
        children
      )}
    </div>
  </Card>
);

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

const EventAnalytics = () => {
  const { id: eventId } = useParams();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState<string>("");

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;

    const load = async () => {
      const [{ data: ev }, { data: rpc, error: rpcErr }] = await Promise.all([
        supabase.from("events").select("title").eq("id", eventId).maybeSingle(),
        supabase.rpc("event_analytics", { _event_id: eventId }),
      ]);
      if (!mounted) return;
      setEventTitle(ev?.title ?? "Event");
      if (rpcErr) {
        setError(rpcErr.message);
      } else {
        setData(rpc as unknown as Analytics);
      }
      setLoading(false);
    };

    load();
    // refresh every 30s for live event-day feel
    const t = setInterval(load, 30_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [eventId]);

  const eventStarted = useMemo(
    () => data && new Date(data.event.starts_at).getTime() <= Date.now(),
    [data]
  );

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error === "Forbidden") return <Navigate to="/organizer" replace />;

  if (error || !data) {
    return (
      <div className="container max-w-2xl py-20 text-center">
        <p className="text-destructive mb-4">{error ?? "Could not load analytics"}</p>
        <Button asChild variant="outline">
          <Link to="/organizer">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const { totals, sold_series, scan_series, tiers, currency, scan_window } = {
    ...data,
    currency: data.totals.currency,
  };

  const totalCapacity = tiers.reduce((s, t) => s + (t.total_seats ?? 0), 0);
  const sellThrough = totalCapacity > 0 ? Math.round((totals.sold / totalCapacity) * 100) : 0;
  const checkInRate = totals.sold > 0 ? Math.round((totals.checked_in / totals.sold) * 100) : 0;

  return (
    <>
      <Helmet>
        <title>Analytics — {eventTitle}</title>
      </Helmet>
      <div className="container max-w-6xl py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/organizer">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
          </Link>
        </Button>

        <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              <TrendingUp className="inline h-3 w-3 mr-1" /> Analytics
            </p>
            <h1 className="font-display text-3xl font-bold">{eventTitle}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link to={`/organizer/events/${eventId}`}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/organizer/events/${eventId}/scan`}>
                <ScanLine className="mr-1.5 h-3.5 w-3.5" /> Scan tickets
              </Link>
            </Button>
            <Badge variant="outline" className="text-xs">
              Auto-refreshing every 30s
            </Badge>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPI
            icon={Ticket}
            label="Tickets sold"
            value={totals.sold.toLocaleString()}
            sub={totalCapacity > 0 ? `${sellThrough}% of capacity` : undefined}
          />
          <KPI
            icon={DollarSign}
            label="Gross revenue"
            value={formatMoney(totals.gross_cents, currency)}
            tone="success"
          />
          <KPI
            icon={CheckCircle2}
            label="Checked in"
            value={totals.checked_in.toLocaleString()}
            sub={totals.sold > 0 ? `${checkInRate}% of sold` : undefined}
            tone="success"
          />
          <KPI
            icon={XCircle}
            label="Cancelled"
            value={totals.cancelled.toLocaleString()}
            tone={totals.cancelled > 0 ? "destructive" : "default"}
          />
        </div>

        {totalCapacity > 0 && (
          <Card className="p-5 bg-gradient-card border-border/50 mb-8">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Overall sell-through</p>
              <p className="text-sm text-muted-foreground">
                {totals.sold} / {totalCapacity}
              </p>
            </div>
            <Progress value={sellThrough} className="h-2" />
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <ChartCard
            title="Tickets sold per day"
            subtitle="Last 30 days"
            empty={sold_series.every((d) => d.tickets === 0)}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sold_series} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="ticketsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(d) => format(new Date(d), "MMM d")}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(d) => format(new Date(d), "EEE, MMM d")}
                />
                <Area
                  type="monotone"
                  dataKey="tickets"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#ticketsFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Revenue per day"
            subtitle={`Last 30 days · ${currency}`}
            empty={sold_series.every((d) => d.revenue_cents === 0)}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sold_series} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(d) => format(new Date(d), "MMM d")}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => formatMoney(v, currency)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(d) => format(new Date(d), "EEE, MMM d")}
                  formatter={(v: number) => [formatMoney(v, currency), "Revenue"]}
                />
                <Bar dataKey="revenue_cents" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard
          title="Scans per minute"
          subtitle={
            eventStarted
              ? `From event start · until ${format(new Date(scan_window.end), "p")}`
              : `Preview window · last 6 hours (event hasn't started)`
          }
          empty={scan_series.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scan_series} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="minute"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(d) => format(new Date(d), "HH:mm")}
                minTickGap={32}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(d) => format(new Date(d), "EEE HH:mm")}
              />
              <Line
                type="monotone"
                dataKey="scans"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="p-5 bg-gradient-card border-border/50 mt-4">
          <h3 className="font-display text-lg font-bold mb-4">Tier breakdown</h3>
          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No tiers created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/50">
                    <th className="py-2 pr-4">Tier</th>
                    <th className="py-2 pr-4 text-right">Sold</th>
                    <th className="py-2 pr-4 text-right">Capacity</th>
                    <th className="py-2 pr-4 text-right">Sell-through</th>
                    <th className="py-2 pr-4 text-right">Checked in</th>
                    <th className="py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => {
                    const pct =
                      t.total_seats > 0 ? Math.round((t.sold / t.total_seats) * 100) : 0;
                    return (
                      <tr key={t.id} className="border-b border-border/30 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.price_cents === 0
                              ? "Free"
                              : formatMoney(t.price_cents, t.currency)}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">{t.sold}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                          {t.total_seats}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={pct} className="h-1.5 w-20" />
                            <span className="tabular-nums text-xs w-9">{pct}%</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">{t.checked_in}</td>
                        <td className="py-3 text-right tabular-nums font-medium">
                          {formatMoney(t.revenue_cents, t.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
};

export default EventAnalytics;
