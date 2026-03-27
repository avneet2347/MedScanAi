"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricSeries, ReportRecord, TrendInsight } from "@/lib/report-types";

type TrendsResponse = {
  metricSeries?: MetricSeries[];
  trendInsights?: TrendInsight[];
  reportsCount?: number;
  storedMetricsCount?: number;
};

type Props = {
  authorizedFetchJson: (input: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  reports: ReportRecord[];
};

type TrackedMetricKey = "blood_glucose" | "cholesterol" | "hemoglobin";

type MetricCardTone = {
  key: TrackedMetricKey;
  label: string;
  lineColor: string;
  glowColor: string;
};

type TrendChartPoint = {
  dateLabel: string;
  fullDate: string;
  reportLabel: string;
  value: number;
};

const TRACKED_METRICS: MetricCardTone[] = [
  {
    key: "blood_glucose",
    label: "Glucose",
    lineColor: "#0284c7",
    glowColor: "rgba(2, 132, 199, 0.16)",
  },
  {
    key: "cholesterol",
    label: "Cholesterol",
    lineColor: "#d97706",
    glowColor: "rgba(217, 119, 6, 0.16)",
  },
  {
    key: "hemoglobin",
    label: "Hemoglobin",
    lineColor: "#dc2626",
    glowColor: "rgba(220, 38, 38, 0.16)",
  },
];

function formatDisplayDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAxisDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatDirection(direction: TrendInsight["direction"]) {
  if (direction === "up") {
    return "Increasing";
  }

  if (direction === "down") {
    return "Decreasing";
  }

  if (direction === "mixed") {
    return "Variable";
  }

  return "Stable";
}

function buildChartData(series: MetricSeries): TrendChartPoint[] {
  return series.points.map((point) => ({
    dateLabel: formatAxisDate(point.createdAt),
    fullDate: formatDisplayDate(point.createdAt),
    reportLabel: point.reportLabel,
    value: point.value,
  }));
}

function getYAxisDomain(points: MetricSeries["points"]) {
  if (points.length === 0) {
    return [0, 1] as const;
  }

  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum;
  const padding = span === 0 ? Math.max(Math.abs(maximum) * 0.12, 1) : span * 0.18;

  return [
    Number((minimum - padding).toFixed(2)),
    Number((maximum + padding).toFixed(2)),
  ] as const;
}

function TrendTooltip({
  active,
  payload,
  unit,
}: Partial<TooltipContentProps<number, string>> & { unit: string }) {
  const point = payload?.[0]?.payload as TrendChartPoint | undefined;
  const rawValue = payload?.[0]?.value;
  const value =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number(rawValue)
        : null;

  if (!active || !point || value === null || Number.isNaN(value)) {
    return null;
  }

  return (
    <div className="trend-tooltip">
      <strong>{point.fullDate}</strong>
      <span>{point.reportLabel}</span>
      <p>
        {formatNumber(value)}
        {unit ? ` ${unit}` : ""}
      </p>
    </div>
  );
}

function TrendChart({
  accentColor,
  metricKey,
  series,
}: {
  accentColor: string;
  metricKey: string;
  series: MetricSeries;
}) {
  const chartData = useMemo(() => buildChartData(series), [series]);
  const yAxisDomain = useMemo(() => getYAxisDomain(series.points), [series.points]);

  return (
    <div
      className="trend-chart-shell"
      role="img"
      aria-label={`${series.testName} trend chart across saved reports`}
    >
      <ResponsiveContainer width="100%" height={236}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={`trend-fill-${metricKey}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={accentColor} stopOpacity={0.32} />
              <stop offset="95%" stopColor={accentColor} stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <CartesianGrid
            vertical={false}
            stroke="rgba(148, 163, 184, 0.24)"
            strokeDasharray="4 4"
          />

          <XAxis
            dataKey="dateLabel"
            tickLine={false}
            axisLine={false}
            minTickGap={18}
            tick={{ fill: "var(--ws-muted)", fontSize: 12 }}
          />

          <YAxis
            domain={yAxisDomain}
            tickLine={false}
            axisLine={false}
            width={46}
            tick={{ fill: "var(--ws-muted)", fontSize: 12 }}
            tickFormatter={(value: number) => formatNumber(value)}
          />

          <Tooltip
            cursor={{ stroke: accentColor, strokeOpacity: 0.24, strokeWidth: 2 }}
            content={<TrendTooltip unit={series.unit} />}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill={`url(#trend-fill-${metricKey})`}
            fillOpacity={1}
          />

          <Line
            type="monotone"
            dataKey="value"
            stroke={accentColor}
            strokeWidth={3}
            dot={{ r: 4, fill: accentColor, stroke: "#ffffff", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: accentColor, stroke: "#ffffff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function WorkspaceHealthTrendsPanel({
  authorizedFetchJson,
  reports,
}: Props) {
  const [metricSeries, setMetricSeries] = useState<MetricSeries[]>([]);
  const [trendInsights, setTrendInsights] = useState<TrendInsight[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [storedMetricsCount, setStoredMetricsCount] = useState(0);
  const [resolvedSignature, setResolvedSignature] = useState("");

  const reportSignature = useMemo(
    () => reports.map((report) => `${report.id}:${report.updated_at}`).join("|"),
    [reports]
  );

  useEffect(() => {
    let active = true;

    if (reports.length === 0) {
      return () => {
        active = false;
      };
    }

    authorizedFetchJson("/api/analytics/trends")
      .then((payload) => {
        if (!active) {
          return;
        }

        const parsed = payload as TrendsResponse;
        setMetricSeries(parsed.metricSeries || []);
        setTrendInsights(parsed.trendInsights || []);
        setStoredMetricsCount(parsed.storedMetricsCount || 0);
        setErrorMessage("");
        setResolvedSignature(reportSignature);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setMetricSeries([]);
        setTrendInsights([]);
        setStoredMetricsCount(0);
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load stored trend metrics."
        );
        setResolvedSignature(reportSignature);
      });

    return () => {
      active = false;
    };
  }, [authorizedFetchJson, reportSignature, reports.length]);

  const visibleStoredMetricsCount = reports.length === 0 ? 0 : storedMetricsCount;
  const visibleErrorMessage = reports.length === 0 ? "" : errorMessage;
  const activeLoading = reports.length > 0 && resolvedSignature !== reportSignature;

  const seriesByKey = useMemo(
    () =>
      new Map(
        (reports.length === 0 ? [] : metricSeries).map((series) => [series.metricKey, series])
      ),
    [metricSeries, reports.length]
  );

  const trendsByKey = useMemo(
    () =>
      new Map(
        (reports.length === 0 ? [] : trendInsights).map((trend) => [trend.metricKey, trend])
      ),
    [reports.length, trendInsights]
  );

  const metricCards = useMemo(
    () =>
      TRACKED_METRICS.map((metric) => ({
        ...metric,
        series: seriesByKey.get(metric.key) || null,
        trend: trendsByKey.get(metric.key) || null,
      })),
    [seriesByKey, trendsByKey]
  );

  const totalVisiblePoints = useMemo(
    () =>
      metricCards.reduce((count, metric) => count + (metric.series?.points.length || 0), 0),
    [metricCards]
  );

  return (
    <section className="workspace-addon-card">
      <div className="workspace-addon-header">
        <div>
          <h3>Health Trends</h3>
          <p>
            Time-based charts for glucose, cholesterol, and hemoglobin using saved extracted
            numeric metrics from your analyzed reports.
          </p>
        </div>

        <div className="workspace-addon-meta">
          <span className="metric-chip">Saved metrics</span>
          <span className="metric-chip subtle">{totalVisiblePoints} plotted points</span>
          <span className="metric-chip subtle">{visibleStoredMetricsCount} saved rows</span>
        </div>
      </div>

      {activeLoading ? (
        <div className="workspace-addon-empty">Loading saved trend analytics...</div>
      ) : visibleErrorMessage ? (
        <div className="workspace-addon-empty">{visibleErrorMessage}</div>
      ) : reports.length === 0 ? (
        <div className="workspace-addon-empty">
          Upload reports first. This section appears once extracted metrics have been stored.
        </div>
      ) : totalVisiblePoints === 0 ? (
        <div className="workspace-addon-empty">
          No stored glucose, cholesterol, or hemoglobin rows were found yet. This dashboard reads
          only from saved metrics and does not recalculate anything from the original files.
        </div>
      ) : (
        <>
          <div className="trend-chart-grid">
            {metricCards.map((metric) => {
              const series = metric.series;
              const latest = series?.points[series.points.length - 1] || null;
              const previous = series?.points[series.points.length - 2] || null;

              return (
                <article
                  key={metric.key}
                  className={`trend-card ${series ? "" : "trend-card-empty"}`}
                  style={
                    {
                      "--trend-line": metric.lineColor,
                      "--trend-glow": metric.glowColor,
                    } as CSSProperties
                  }
                >
                  <div className="trend-card-head">
                    <div>
                      <strong>{series?.testName || metric.label}</strong>
                      <span>
                        {series?.unit || "Unit unavailable"}
                        {series
                          ? ` | ${series.points.length} report${series.points.length === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </div>

                    <span className="trend-direction">
                      {metric.trend ? formatDirection(metric.trend.direction) : "Awaiting trend"}
                    </span>
                  </div>

                  {!series || !latest ? (
                    <div className="trend-chart-empty">
                      No stored {metric.label.toLowerCase()} values are available yet.
                    </div>
                  ) : (
                    <>
                      <div className="trend-stat-row">
                        <div className="trend-stat">
                          <small>Latest</small>
                          <strong>
                            {formatNumber(latest.value)}
                            {series.unit ? ` ${series.unit}` : ""}
                          </strong>
                        </div>

                        <div className="trend-stat trend-stat-secondary">
                          <small>Change</small>
                          <strong>
                            {previous
                              ? `${formatSignedNumber(latest.value - previous.value)}${
                                  series.unit ? ` ${series.unit}` : ""
                                }`
                              : "n/a"}
                          </strong>
                        </div>
                      </div>

                      <TrendChart
                        accentColor={metric.lineColor}
                        metricKey={metric.key}
                        series={series}
                      />

                      <div className="trend-axis-row">
                        <span>{formatDisplayDate(series.points[0].createdAt)}</span>
                        <span>{formatDisplayDate(latest.createdAt)}</span>
                      </div>

                      <p className="trend-summary">
                        {metric.trend
                          ? metric.trend.summary
                          : "At least two saved reports are needed before the trend direction can be calculated."}
                      </p>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          {(reports.length === 0 ? [] : trendInsights).length > 0 ? (
            <div className="trend-summary-list">
              {(reports.length === 0 ? [] : trendInsights).map((trend) => (
                <article key={trend.metricKey} className="trend-summary-item">
                  <div>
                    <strong>{trend.testName}</strong>
                    <p>{trend.summary}</p>
                  </div>

                  <span className={`trend-badge trend-${trend.direction}`}>
                    {formatDirection(trend.direction)}
                  </span>
                </article>
              ))}
            </div>
          ) : null}
        </>
      )}

      <style jsx>{`
        .workspace-addon-card {
          border: 1px solid var(--ws-border);
          border-radius: 28px;
          padding: 24px;
          background: linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface));
        }

        .workspace-addon-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .workspace-addon-header h3 {
          margin: 0 0 6px;
          font-size: 1.1rem;
        }

        .workspace-addon-header p {
          margin: 0;
          color: var(--ws-muted);
          font-size: 0.95rem;
          line-height: 1.7;
        }

        .workspace-addon-header code {
          font-family: var(--workspace-font-mono), monospace;
          color: var(--ws-text-soft);
        }

        .workspace-addon-meta {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .metric-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 8px 12px;
          border: 1px solid rgba(14, 165, 233, 0.22);
          background: rgba(14, 165, 233, 0.12);
          color: var(--ws-accent);
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .metric-chip.subtle {
          border-color: var(--ws-border);
          background: var(--ws-surface-soft);
          color: var(--ws-muted);
        }

        .workspace-addon-empty {
          border: 1px dashed var(--ws-border-strong);
          border-radius: 20px;
          padding: 18px;
          color: var(--ws-muted);
          background: var(--ws-surface-soft);
          line-height: 1.7;
        }

        .trend-chart-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
          gap: 16px;
        }

        .trend-card {
          --trend-line: var(--ws-accent);
          --trend-glow: rgba(14, 165, 233, 0.16);
          border: 1px solid var(--ws-border);
          border-radius: 24px;
          padding: 18px;
          background:
            radial-gradient(circle at top right, var(--trend-glow), transparent 34%),
            var(--ws-surface-soft);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .trend-card-empty {
          opacity: 0.86;
        }

        .trend-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .trend-card-head strong {
          display: block;
          font-size: 1rem;
        }

        .trend-card-head span {
          color: var(--ws-muted);
          font-size: 0.84rem;
        }

        .trend-direction {
          border-radius: 999px;
          padding: 7px 10px;
          background: rgba(255, 255, 255, 0.58);
          border: 1px solid var(--ws-border);
          font-size: 0.76rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .trend-chart-empty {
          min-height: 236px;
          display: grid;
          place-items: center;
          border: 1px dashed var(--ws-border-strong);
          border-radius: 18px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.32);
          color: var(--ws-muted);
          text-align: center;
          line-height: 1.7;
        }

        .trend-stat-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 10px;
        }

        .trend-stat {
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.48);
        }

        .trend-stat small {
          display: block;
          margin-bottom: 5px;
          color: var(--ws-muted);
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .trend-stat strong {
          font-size: 1.02rem;
        }

        .trend-stat-secondary strong {
          color: var(--trend-line);
        }

        .trend-chart-shell {
          width: 100%;
          height: 236px;
          border-radius: 20px;
          padding: 8px 8px 4px;
          background: rgba(255, 255, 255, 0.36);
          border: 1px solid rgba(255, 255, 255, 0.54);
        }

        .trend-axis-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 8px;
          color: var(--ws-muted);
          font-size: 0.78rem;
        }

        :global(.trend-tooltip) {
          display: grid;
          gap: 4px;
          min-width: 152px;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 18px 32px rgba(15, 23, 42, 0.1);
        }

        :global(.trend-tooltip strong) {
          color: var(--ws-text);
          font-size: 0.82rem;
        }

        :global(.trend-tooltip span) {
          color: var(--ws-muted);
          font-size: 0.78rem;
        }

        :global(.trend-tooltip p) {
          margin: 2px 0 0;
          color: var(--ws-text-soft);
          font-size: 0.96rem;
          font-weight: 700;
        }

        .trend-summary {
          margin: 14px 0 0;
          color: var(--ws-text-soft);
          line-height: 1.7;
        }

        .trend-summary-list {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }

        .trend-summary-item {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.36);
        }

        .trend-summary-item p {
          margin: 6px 0 0;
          color: var(--ws-text-soft);
          line-height: 1.7;
        }

        .trend-badge {
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 0.78rem;
          font-weight: 700;
          white-space: nowrap;
          border: 1px solid var(--ws-border);
        }

        .trend-up {
          color: var(--ws-danger);
          background: var(--ws-danger-bg);
        }

        .trend-down {
          color: var(--ws-success);
          background: var(--ws-success-bg);
        }

        .trend-stable,
        .trend-mixed {
          color: var(--ws-accent);
          background: rgba(14, 165, 233, 0.12);
        }

        @media (max-width: 720px) {
          .workspace-addon-header {
            flex-direction: column;
          }

          .workspace-addon-meta {
            justify-content: flex-start;
          }

          .trend-stat-row {
            grid-template-columns: 1fr;
          }

          .trend-chart-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
