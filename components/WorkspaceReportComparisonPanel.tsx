"use client";

import { useMemo, useState } from "react";
import type {
  ComparisonMetric,
  ReportComparisonResult,
  ReportRecord,
  TrendDataPoint,
} from "@/lib/report-types";

type Props = {
  authorizedFetchJson: (input: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  reports: ReportRecord[];
  selectedReportId: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

function formatDelta(value: number | null, unit: string) {
  if (value === null) {
    return "n/a";
  }

  return `${value > 0 ? "+" : ""}${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
}

function formatDeltaPercent(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return `${value > 0 ? "+" : ""}${formatNumber(value)}%`;
}

function formatDirection(direction: ComparisonMetric["direction"]) {
  if (direction === "up") {
    return "Increase";
  }

  if (direction === "down") {
    return "Decrease";
  }

  if (direction === "mixed") {
    return "Mixed";
  }

  return "Stable";
}

function buildValuesByReportId(values: TrendDataPoint[]) {
  return new Map(values.map((value) => [value.reportId, value]));
}

export default function WorkspaceReportComparisonPanel({
  authorizedFetchJson,
  reports,
  selectedReportId,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<ReportComparisonResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const compareCandidates = useMemo(() => reports.slice(0, 8), [reports]);
  const reportIdsSet = useMemo(() => new Set(reports.map((report) => report.id)), [reports]);

  const defaultSelectedIds = useMemo(
    () =>
      [selectedReportId, reports.find((item) => item.id !== selectedReportId)?.id]
        .filter(Boolean)
        .slice(0, 2) as string[],
    [reports, selectedReportId]
  );

  const effectiveSelectedIds = useMemo(() => {
    const validSelectedIds = selectedIds.filter((reportId) => reportIdsSet.has(reportId)).slice(0, 6);
    return validSelectedIds.length > 0 ? validSelectedIds : defaultSelectedIds;
  }, [defaultSelectedIds, reportIdsSet, selectedIds]);

  async function runComparison() {
    if (effectiveSelectedIds.length < 2) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const payload = await authorizedFetchJson("/api/reports/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportIds: effectiveSelectedIds,
        }),
      });

      setComparison((payload.comparison as ReportComparisonResult | undefined) || null);
    } catch (error) {
      setComparison(null);
      setErrorMessage(error instanceof Error ? error.message : "Unable to compare stored metrics.");
    } finally {
      setLoading(false);
    }
  }

  function toggleReport(reportId: string) {
    setComparison(null);
    setErrorMessage("");

    setSelectedIds((current) => {
      const baseSelection =
        current.filter((id) => reportIdsSet.has(id)).length > 0
          ? current.filter((id) => reportIdsSet.has(id))
          : defaultSelectedIds;

      if (baseSelection.includes(reportId)) {
        return baseSelection.filter((item) => item !== reportId);
      }

      if (baseSelection.length >= 6) {
        return baseSelection;
      }

      return [...baseSelection, reportId];
    });
  }

  return (
    <section className="workspace-addon-card">
      <div className="workspace-addon-header">
        <div>
          <h3>Compare Reports</h3>
          <p>
            Compare multiple reports using saved extracted numeric metrics from analyzed reports.
            Net increases are highlighted in red and net decreases in green.
          </p>
        </div>

        <div className="workspace-addon-meta">
          <span className="metric-chip">saved metrics</span>
          <span className="metric-chip subtle">{effectiveSelectedIds.length} selected</span>
          <button
            type="button"
            className="compare-button"
            disabled={effectiveSelectedIds.length < 2 || loading}
            onClick={runComparison}
          >
            {loading ? "Comparing..." : "Compare selected"}
          </button>
        </div>
      </div>

      <div className="compare-selector">
        {compareCandidates.length === 0 ? (
          <div className="workspace-addon-empty">No reports available for comparison yet.</div>
        ) : (
          compareCandidates.map((report) => (
            <label
              key={report.id}
              className={`compare-chip ${effectiveSelectedIds.includes(report.id) ? "active" : ""}`}
            >
              <input
                type="checkbox"
                checked={effectiveSelectedIds.includes(report.id)}
                onChange={() => toggleReport(report.id)}
              />
              <span>{report.title || report.original_filename}</span>
              <small>{formatDate(report.created_at)}</small>
            </label>
          ))
        )}
      </div>

      {errorMessage ? <div className="workspace-addon-empty">{errorMessage}</div> : null}

      {comparison ? (
        <div className="comparison-results">
          <div className="comparison-report-row">
            {comparison.reports.map((report) => (
              <article key={report.id} className="comparison-report-card">
                <strong>{report.title}</strong>
                <span>{formatDate(report.createdAt)}</span>
                <small>{report.reportStatus}</small>
              </article>
            ))}
          </div>

          {comparison.metrics.length === 0 ? (
            <div className="workspace-addon-empty">
              The selected reports do not share enough comparable numeric metrics yet.
            </div>
          ) : (
            <div className="comparison-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    {comparison.reports.map((report) => (
                      <th key={report.id}>
                        <div className="table-report-head">
                          <strong>{report.title}</strong>
                          <span>{formatDate(report.createdAt)}</span>
                        </div>
                      </th>
                    ))}
                    <th>Difference</th>
                    <th>% Change</th>
                  </tr>
                </thead>

                <tbody>
                  {comparison.metrics.map((metric) => {
                    const valuesByReportId = buildValuesByReportId(metric.values);

                    return (
                      <tr key={metric.metricKey}>
                        <td className="metric-cell">
                          <strong>{metric.testName}</strong>
                          <span>{metric.unit || "Unit unavailable"}</span>
                        </td>

                        {comparison.reports.map((report) => {
                          const value = valuesByReportId.get(report.id);

                          return (
                            <td
                              key={`${metric.metricKey}-${report.id}`}
                              className={value ? "value-cell" : "value-cell value-missing"}
                            >
                              {value ? (
                                <>
                                  <strong>{formatNumber(value.value)}</strong>
                                  <span>{metric.unit || value.unit || " "}</span>
                                </>
                              ) : (
                                <span className="missing-copy">--</span>
                              )}
                            </td>
                          );
                        })}

                        <td className={`delta-cell delta-${metric.direction}`}>
                          <strong>{formatDelta(metric.delta, metric.unit)}</strong>
                          <span>{formatDirection(metric.direction)}</span>
                        </td>

                        <td className={`delta-cell delta-${metric.direction}`}>
                          <strong>{formatDeltaPercent(metric.deltaPercent)}</strong>
                          <span>Net change</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="workspace-addon-empty">
          Select two or more reports to compare stored metric differences and percentage changes.
        </div>
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

        .compare-button {
          border: none;
          border-radius: 999px;
          padding: 12px 16px;
          font-weight: 700;
          color: white;
          background: linear-gradient(135deg, var(--ws-accent), var(--ws-accent-2));
          cursor: pointer;
        }

        .compare-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .compare-selector {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }

        .compare-chip {
          display: grid;
          gap: 4px;
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          padding: 12px 14px;
          background: var(--ws-surface-soft);
          cursor: pointer;
        }

        .compare-chip input {
          display: none;
        }

        .compare-chip.active {
          border-color: rgba(14, 165, 233, 0.42);
          box-shadow: inset 0 0 0 1px rgba(14, 165, 233, 0.22);
        }

        .compare-chip span {
          font-weight: 700;
        }

        .compare-chip small {
          color: var(--ws-muted);
        }

        .workspace-addon-empty {
          border: 1px dashed var(--ws-border-strong);
          border-radius: 18px;
          padding: 16px;
          color: var(--ws-muted);
          background: var(--ws-surface-soft);
          line-height: 1.7;
        }

        .comparison-results {
          display: grid;
          gap: 16px;
        }

        .comparison-report-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .comparison-report-card {
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.32);
        }

        .comparison-report-card span,
        .comparison-report-card small {
          display: block;
          color: var(--ws-muted);
          margin-top: 4px;
        }

        .comparison-table-wrap {
          border-radius: 22px;
          overflow: auto;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
        }

        table {
          width: 100%;
          min-width: 860px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 14px 16px;
          text-align: left;
          border-bottom: 1px solid var(--ws-border);
          vertical-align: top;
        }

        thead th {
          background: rgba(148, 163, 184, 0.08);
          color: var(--ws-muted);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        tbody tr:last-child td {
          border-bottom: none;
        }

        .table-report-head {
          display: grid;
          gap: 4px;
        }

        .table-report-head strong {
          color: var(--ws-text);
          font-size: 12px;
          letter-spacing: normal;
          text-transform: none;
        }

        .table-report-head span {
          color: var(--ws-muted);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: normal;
          text-transform: none;
        }

        .metric-cell strong,
        .value-cell strong,
        .delta-cell strong {
          display: block;
          color: var(--ws-text);
        }

        .metric-cell span,
        .value-cell span,
        .delta-cell span {
          display: block;
          margin-top: 4px;
          color: var(--ws-muted);
          font-size: 0.8rem;
        }

        .value-cell {
          min-width: 120px;
        }

        .value-missing {
          color: var(--ws-muted);
          background: rgba(148, 163, 184, 0.06);
        }

        .missing-copy {
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .delta-cell {
          min-width: 136px;
          border-left: 1px solid rgba(148, 163, 184, 0.12);
        }

        .delta-up {
          background: rgba(248, 113, 113, 0.12);
        }

        .delta-up strong {
          color: var(--ws-danger);
        }

        .delta-down {
          background: rgba(34, 197, 94, 0.12);
        }

        .delta-down strong {
          color: var(--ws-success);
        }

        .delta-stable,
        .delta-mixed {
          background: rgba(14, 165, 233, 0.08);
        }

        .delta-stable strong,
        .delta-mixed strong {
          color: var(--ws-accent);
        }

        @media (max-width: 720px) {
          .workspace-addon-header {
            flex-direction: column;
          }

          .workspace-addon-meta {
            justify-content: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
