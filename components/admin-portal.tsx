"use client";

import { Download, Home, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  summarizeAdminAnalytics,
  type AdminAnalytics,
  type CategoryAnalyticsRow,
  type TokenScatterAnalytics
} from "@/lib/admin-analytics";
import type { AdminTimesheetRecord } from "@/lib/types";

type AdminResponse = {
  entries?: AdminTimesheetRecord[];
  error?: string;
};

const REFRESH_INTERVAL_MS = 15_000;
const CHART_BLUE = "#4a6fa5";
const CHART_RED = "#c94f47";
const GRID_LINE = "#d8dee8";
const INK = "#17202a";

function formatDate(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatHours(value: number) {
  return value.toLocaleString([], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString();
}

function formatDecimal(value: number, digits = 2) {
  return value.toLocaleString([], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPercent(value: number) {
  return `${formatDecimal(value, 1)}%`;
}

function formatCorrelation(value: number | null) {
  return value === null ? "n/a" : value.toFixed(2);
}

function formatTokens(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return Math.round(value).toLocaleString();
}

function formatTokenTick(value: number) {
  if (value >= 1_000_000) {
    return `${formatDecimal(value / 1_000_000, value % 1_000_000 === 0 ? 0 : 1)}M`;
  }

  if (value >= 1_000) {
    return `${formatDecimal(value / 1_000, value % 1_000 === 0 ? 0 : 1)}K`;
  }

  return String(value);
}

function formatWeekRange(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return "Invalid week";
  }

  const formatter = new Intl.DateTimeFormat([], { month: "short", day: "numeric", timeZone: "UTC" });

  return `${formatter.format(start)}-${formatter.format(end)}`;
}

function formatLastUpdated(value: Date | null) {
  if (value === null) {
    return "Not refreshed yet";
  }

  return `Last updated ${value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
}

function totalTurns(entry: AdminTimesheetRecord) {
  return entry.problems.reduce((sum, problem) => sum + problem.turns.length, 0);
}

function totalTokens(entry: AdminTimesheetRecord) {
  return entry.problems.reduce((sum, problem) => sum + (problem.tokenUsage ?? 0), 0);
}

function problemLanguageSummary(entry: AdminTimesheetRecord) {
  return entry.problems
    .map((problem) =>
      [problem.primaryProgrammingLanguage, problem.secondaryProgrammingLanguages].filter(Boolean).join(" / ")
    )
    .join("; ");
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-panel">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-stone-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-panel">
      <p className="text-xs font-semibold uppercase tracking-normal text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm text-stone-600">{detail}</p>
    </div>
  );
}

function HorizontalBarChart({
  rows,
  value,
  formatValue,
  secondary
}: {
  rows: CategoryAnalyticsRow[];
  value: (row: CategoryAnalyticsRow) => number;
  formatValue: (value: number) => string;
  secondary?: (row: CategoryAnalyticsRow) => string;
}) {
  const maxValue = Math.max(1, ...rows.map(value));

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const rowValue = value(row);
        const width = `${(rowValue / maxValue) * 100}%`;

        return (
          <div className="grid gap-2 sm:grid-cols-[11rem_1fr]" key={row.category}>
            <div className="text-sm font-medium text-stone-700">
              {row.category}
              {secondary ? <span className="block text-xs font-normal text-stone-500">{secondary(row)}</span> : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-7 flex-1 rounded bg-stone-100">
                <div className="h-7 rounded bg-[#4a6fa5]" style={{ width }} />
              </div>
              <span className="w-16 text-right text-sm font-semibold text-ink">{formatValue(rowValue)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeltaBarChart({ rows }: { rows: CategoryAnalyticsRow[] }) {
  const maxDelta = Math.max(1, ...rows.map((row) => Math.abs(row.deltaShare)));

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = `${(Math.abs(row.deltaShare) / maxDelta) * 100}%`;
        const isPositive = row.deltaShare >= 0;

        return (
          <div className="grid gap-2 sm:grid-cols-[13rem_1fr]" key={row.category}>
            <div className="text-sm font-medium text-stone-700">
              {row.category}
              <span className="block text-xs font-normal text-stone-500">
                obs {formatPercent(row.share)} | ideal {formatPercent(row.idealShare)}
              </span>
            </div>
            <div className="grid grid-cols-2 items-center gap-0">
              <div className="flex h-7 justify-end border-r border-stone-500 bg-stone-50">
                {!isPositive ? <div className="h-7 rounded-l bg-[#c94f47]" style={{ width }} /> : null}
              </div>
              <div className="flex h-7 justify-start bg-stone-50">
                {isPositive ? <div className="h-7 rounded-r bg-[#4a6fa5]" style={{ width }} /> : null}
              </div>
              <span className="col-span-2 mt-1 text-right text-xs font-semibold text-ink">
                {row.deltaShare > 0 ? "+" : ""}
                {formatDecimal(row.deltaShare, 1)} pp
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThroughputHistogramChart({ analytics }: { analytics: AdminAnalytics["weeklyThroughput"] }) {
  const width = 640;
  const height = 300;
  const padding = { top: 28, right: 26, bottom: 52, left: 54 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const highestValue = Math.max(analytics.target, ...analytics.bins.map((bin) => bin.count), 1);
  const yMax = Math.max(1, Math.ceil((highestValue * 1.12) / 50) * 50);
  const xAxisY = height - padding.bottom;
  const tickValues = Array.from(new Set([0, analytics.target, yMax])).sort((a, b) => a - b);

  function yPosition(value: number) {
    return padding.top + (1 - value / yMax) * plotHeight;
  }

  if (analytics.bins.length === 0) {
    return <div className="rounded-lg bg-stone-50 p-6 text-sm text-stone-600">No completed timesheets for this chart yet.</div>;
  }

  const slotWidth = plotWidth / analytics.bins.length;
  const barWidth = Math.min(72, slotWidth * 0.58);
  const windowDescription =
    analytics.totalWeeks > analytics.windowSize
      ? `Showing latest ${analytics.bins.length} of ${analytics.totalWeeks} weeks.`
      : `Showing ${analytics.bins.length} week${analytics.bins.length === 1 ? "" : "s"}.`;

  return (
    <div>
      <svg
        aria-label="Weekly submitted timesheet throughput trend"
        className="h-auto w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {tickValues.map((tick) => {
          const y = yPosition(tick);

          return (
            <g key={tick}>
              <line stroke={GRID_LINE} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text fill="#6b7280" fontSize="11" textAnchor="end" x={padding.left - 8} y={y + 4}>
                {formatInteger(tick)}
              </text>
            </g>
          );
        })}
        <line
          stroke={CHART_RED}
          strokeDasharray="6 5"
          strokeWidth="2"
          x1={padding.left}
          x2={width - padding.right}
          y1={yPosition(analytics.target)}
          y2={yPosition(analytics.target)}
        />
        <text fill={CHART_RED} fontSize="12" fontWeight="600" textAnchor="end" x={width - padding.right} y={yPosition(analytics.target) - 8}>
          {formatInteger(analytics.target)} target
        </text>
        <line stroke={INK} x1={padding.left} x2={padding.left} y1={padding.top} y2={xAxisY} />
        <line stroke={INK} x1={padding.left} x2={width - padding.right} y1={xAxisY} y2={xAxisY} />
        {analytics.bins.map((bin, index) => {
          const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2;
          const y = yPosition(bin.count);
          const barHeight = Math.max(0, xAxisY - y);

          return (
            <g key={bin.weekStart}>
              <rect fill={CHART_BLUE} height={barHeight} rx="5" width={barWidth} x={x} y={xAxisY - barHeight}>
                <title>
                  {formatWeekRange(bin.weekStart, bin.weekEnd)}: {formatInteger(bin.count)} submitted timesheets
                </title>
              </rect>
              <text fill={INK} fontSize="12" fontWeight="600" textAnchor="middle" x={x + barWidth / 2} y={Math.max(padding.top + 12, y - 8)}>
                {formatInteger(bin.count)}
              </text>
              <text fill="#6b7280" fontSize="11" textAnchor="middle" x={x + barWidth / 2} y={height - padding.bottom + 20}>
                {bin.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
        {windowDescription} Counted by each timesheet&apos;s completion week; gaps are shown as zero-throughput weeks.
      </p>
    </div>
  );
}

function HistogramChart({ analytics }: { analytics: AdminAnalytics }) {
  const bins = analytics.tokenUsage.histogramBins;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[56rem]">
          <div className="grid h-64 grid-cols-[repeat(14,minmax(0,1fr))] gap-2 border-b border-l border-stone-300 px-2 pt-3">
            {bins.map((bin) => {
              const height = `${Math.max(bin.count === 0 ? 2 : 8, (bin.count / maxCount) * 100)}%`;

              return (
                <div className="flex h-full flex-col items-center justify-end gap-1" key={bin.label}>
                  <span className="text-xs font-semibold text-ink">{formatInteger(bin.count)}</span>
                  <div
                    aria-label={`${bin.label}: ${bin.count} timesheets`}
                    className="w-full rounded-t"
                    style={{ backgroundColor: bin.isOutlierBucket ? CHART_RED : CHART_BLUE, height }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-2 text-center text-[0.65rem] leading-4 text-stone-600">
            {bins.map((bin) => (
              <span className="break-words" key={bin.label}>
                {bin.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
        Reported rows: {formatInteger(analytics.tokenUsage.reportedRows)}; blank token rows:{" "}
        {formatInteger(analytics.tokenUsage.blankRows)}; mean: {formatTokens(analytics.tokenUsage.mean)}; median:{" "}
        {formatTokens(analytics.tokenUsage.median)}; IQR upper outlier fence:{" "}
        {formatTokens(analytics.tokenUsage.highOutlierCutoff)}; outliers: {formatInteger(analytics.tokenUsage.outlierCount)}
        {analytics.tokenUsage.max !== null ? `; max: ${formatTokens(analytics.tokenUsage.max)}` : ""}.
      </p>
    </div>
  );
}

function ScatterPlot({ analytics }: { analytics: TokenScatterAnalytics }) {
  const width = 640;
  const height = 320;
  const padding = { top: 20, right: 24, bottom: 48, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxLogToken = Math.max(8, Math.ceil(Math.max(0, ...analytics.points.map((point) => point.logTokenUsage))));
  const xMax = Math.max(1, analytics.xMax);
  const yTicks = Array.from({ length: maxLogToken + 1 }, (_, exponent) => 10 ** exponent);
  const xTicks = Array.from({ length: 5 }, (_, index) => (xMax / 4) * index);

  function xPosition(value: number) {
    return padding.left + (value / xMax) * plotWidth;
  }

  function yPosition(logValue: number) {
    return padding.top + (1 - logValue / maxLogToken) * plotHeight;
  }

  if (analytics.points.length === 0) {
    return <div className="rounded-lg bg-stone-50 p-6 text-sm text-stone-600">No reported token usage for this chart yet.</div>;
  }

  return (
    <div>
      <svg aria-label={analytics.xLabel} className="h-auto w-full overflow-visible" role="img" viewBox={`0 0 ${width} ${height}`}>
        {yTicks.map((tick) => {
          const y = yPosition(Math.log10(tick));

          return (
            <g key={tick}>
              <line stroke={GRID_LINE} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text fill="#6b7280" fontSize="11" textAnchor="end" x={padding.left - 8} y={y + 4}>
                {formatTokenTick(tick)}
              </text>
            </g>
          );
        })}
        {xTicks.map((tick) => {
          const x = xPosition(tick);

          return (
            <g key={tick}>
              <line stroke={GRID_LINE} x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} />
              <text fill="#6b7280" fontSize="11" textAnchor="middle" x={x} y={height - padding.bottom + 18}>
                {formatDecimal(tick, tick % 1 === 0 ? 0 : 1)}
              </text>
            </g>
          );
        })}
        <line stroke={INK} x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        <line stroke={INK} x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
        {analytics.points.map((point) => (
          <circle
            cx={xPosition(point.x)}
            cy={yPosition(point.logTokenUsage)}
            fill={point.isOutlier ? CHART_RED : CHART_BLUE}
            key={`${point.id}-${analytics.xLabel}`}
            r={4}
          >
            <title>
              {point.label}: {formatDecimal(point.x, 2)} x, {formatTokens(point.tokenUsage)} tokens
            </title>
          </circle>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-stone-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#4a6fa5]" />
          Non-outlier rows
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#c94f47]" />
          IQR high outliers
        </span>
      </div>
    </div>
  );
}

function AnalyticsDashboard({ analytics }: { analytics: AdminAnalytics }) {
  const filter = analytics.outlierFilter;

  return (
    <section className="mb-6 space-y-6" data-testid="admin-analytics">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          detail={`${filter.includedRows} included of ${filter.totalRows} submitted work sessions`}
          label="Problems analyzed"
          value={formatInteger(analytics.taskCount)}
        />
        <StatCard detail="Classified task-category turns" label="Total turns" value={formatInteger(analytics.totalTurns)} />
        <StatCard
          detail="Average reported hours per work session"
          label="Average handling time"
          value={`${formatDecimal(analytics.averageHandlingHours, 2)} hrs`}
        />
        <StatCard
          detail={`${formatInteger(analytics.tokenUsage.blankRows)} problems missing token usage`}
          label="Token rows"
          value={formatInteger(analytics.tokenUsage.reportedRows)}
        />
        <StatCard
          detail={`Removed above ${formatTokens(filter.tokenUsageMax)}`}
          label="Token outliers removed"
          value={formatInteger(filter.excludedForTokens)}
        />
      </div>

      <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">
        Filtered out {formatInteger(filter.excludedRows)} obvious outlier work sessions before calculating dashboard metrics. Hours range:{" "}
        {formatDecimal(filter.reportedHoursMin, 2)}-{filter.reportedHoursMax === null ? "n/a" : formatDecimal(filter.reportedHoursMax, 2)}{" "}
        hrs; token cutoff: {formatTokens(filter.tokenUsageMax)}. Reason counts: {formatInteger(filter.excludedForHours)} hour outliers,{" "}
        {formatInteger(filter.excludedForTokens)} token outliers.
      </p>

      <ChartCard
        description="Submitted timesheets completed per UTC week. Shows a moving window of the latest five weeks with the 500/week target line."
        title="Weekly Throughput Trend"
      >
        <ThroughputHistogramChart analytics={analytics.weeklyThroughput} />
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          description="Metric: count of turns assigned to each category across all problems."
          title="Raw Category Distribution Across All Turns"
        >
          <HorizontalBarChart
            formatValue={formatInteger}
            rows={analytics.categoryRowsByCount}
            value={(row) => row.count}
          />
        </ChartCard>
        <ChartCard
          description={`Metric: category turn count divided by ${formatInteger(analytics.totalTurns)} total turns.`}
          title="Category Share Of All Turns"
        >
          <HorizontalBarChart
            formatValue={formatPercent}
            rows={analytics.categoryRowsByCount}
            value={(row) => row.share}
          />
        </ChartCard>
        <ChartCard
          description={`Metric: category turn count divided by ${formatInteger(analytics.taskCount)} problems.`}
          title="Average Category Distribution Per Task"
        >
          <HorizontalBarChart
            formatValue={(value) => formatDecimal(value, 2)}
            rows={analytics.categoryRowsByCount}
            value={(row) => row.averagePerTask}
          />
        </ChartCard>
        <ChartCard
          description="Observed share minus ideal share, in percentage points. Blue is above target; red is below target."
          title="Delta vs Ideal Turn Category Distribution"
        >
          <DeltaBarChart rows={analytics.categoryRows} />
        </ChartCard>
      </div>

      <ChartCard
        description="Histogram of reported token usage by problem. Values are bucketed by token range; high outlier buckets are muted red."
        title="Token Usage Distribution"
      >
        <HistogramChart analytics={analytics} />
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          description="Scatter plot of each problem with reported tokens. Token axis is logarithmic to show both the main cluster and outliers."
          title="Turn Count vs Token Usage"
        >
          <ScatterPlot analytics={analytics.tokenUsage.turnsScatter} />
          <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
            Reported rows: {formatInteger(analytics.tokenUsage.reportedRows)}; blank token rows:{" "}
            {formatInteger(analytics.tokenUsage.blankRows)}; outliers: {formatInteger(analytics.tokenUsage.outlierCount)}; corr(turns,
            log10(tokens)): {formatCorrelation(analytics.tokenUsage.turnsScatter.correlation)}.
          </p>
        </ChartCard>
        <ChartCard
          description="Scatter plot of each problem with its parent work-session hours and token usage. Token axis is logarithmic to keep outliers visible."
          title="Reported Hours vs Token Usage"
        >
          <ScatterPlot analytics={analytics.tokenUsage.hoursScatter} />
          <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
            Reported rows: {formatInteger(analytics.tokenUsage.reportedRows)}; blank token rows:{" "}
            {formatInteger(analytics.tokenUsage.blankRows)}; outliers: {formatInteger(analytics.tokenUsage.outlierCount)}; corr(hours,
            log10(tokens)): {formatCorrelation(analytics.tokenUsage.hoursScatter.correlation)}.
          </p>
        </ChartCard>
      </div>
    </section>
  );
}

export function AdminPortal({ adminEmail }: { adminEmail: string }) {
  const [entries, setEntries] = useState<AdminTimesheetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const analytics = useMemo(() => summarizeAdminAnalytics(entries), [entries]);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries(initialLoad: boolean) {
      if (initialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const response = await fetch("/api/admin/timesheets", { cache: "no-store" });
        const data = (await response.json()) as AdminResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load admin timesheets.");
        }

        if (!cancelled) {
          setEntries(data.entries ?? []);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load admin timesheets.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadEntries(true);
    const refreshId = setInterval(() => {
      void loadEntries(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshId);
    };
  }, []);

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink">Admin Portal</h1>
              <p className="text-sm text-stone-600">Signed in as {adminEmail}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
              href="/"
            >
              <Home aria-hidden="true" className="h-4 w-4" />
              User portal
            </Link>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-fern px-3 text-sm font-medium text-white transition hover:bg-[#285f51] focus:outline-none focus:ring-2 focus:ring-fern focus:ring-offset-2"
              href="/api/admin/timesheets/export"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Download CSV
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {!loading && !error && entries.length > 0 ? <AnalyticsDashboard analytics={analytics} /> : null}

        <div className="rounded-lg border border-stone-200 bg-white shadow-panel">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">All Timesheets</h2>
              <p className="text-sm text-stone-600">{entries.length} work sessions across all users</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>
                {refreshing ? "Refreshing" : formatLastUpdated(lastUpdated)} · Updates every {REFRESH_INTERVAL_MS / 1000}s
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-5 py-6 text-sm text-stone-600">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Loading timesheets
            </div>
          ) : null}

          {error ? <div className="px-5 py-6 text-sm text-red-700">{error}</div> : null}

          {!loading && !error && entries.length === 0 ? (
            <div className="px-5 py-6 text-sm text-stone-600">No timesheets submitted yet.</div>
          ) : null}

          {!loading && !error && entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-normal text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Problems</th>
                    <th className="px-4 py-3">Login email</th>
                    <th className="px-4 py-3">Workforce email</th>
                    <th className="px-4 py-3">Languages</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Total turns</th>
                    <th className="px-4 py-3">Tokens</th>
                    <th className="px-4 py-3">Blocked</th>
                    <th className="px-4 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="max-w-64 px-4 py-3 font-medium text-ink">
                        <div className="space-y-1">
                          {entry.problems.map((problem) => (
                            <a className="block hover:underline" href={problem.taskUrl} key={problem.id}>
                              {problem.liveCompareProblemId}
                            </a>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-700">{entry.auth0Email ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-stone-700">{entry.workforceEmail}</td>
                      <td className="min-w-48 px-4 py-3 text-stone-700">
                        {problemLanguageSummary(entry)}
                      </td>
                      <td className="min-w-56 px-4 py-3 text-stone-700">
                        {formatDate(entry.startAt)}
                        <br />
                        {formatDate(entry.endAt)}
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        {formatHours(entry.reportedHours)}
                        {entry.totalHoursOverride !== null ? (
                          <span className="block text-xs text-stone-500">
                            Auto: {formatHours(entry.calculatedHours)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-stone-700">{totalTurns(entry)}</td>
                      <td className="px-4 py-3 text-stone-700">{totalTokens(entry).toLocaleString()}</td>
                      <td className="px-4 py-3 text-stone-700">
                        {entry.problems.some((problem) => problem.blockedOnTaigaBug) ? "Yes" : "No"}
                      </td>
                      <td className="min-w-72 px-4 py-3 text-stone-700">
                        {entry.problems.map((problem) => `${problem.liveCompareProblemId}: ${problem.summary}`).join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
