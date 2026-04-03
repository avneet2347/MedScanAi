"use client";

import { useMemo, useState } from "react";
import type {
  AiComparisonConfidence,
  AiComparisonDifference,
  AiComparisonDirection,
  AiReportComparisonResult,
  ReportRecord,
} from "@/lib/report-types";

type Props = {
  authorizedFetchJson: (input: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  reports: ReportRecord[];
  selectedReportId: string | null;
};

type ComparisonDiagnostics = {
  requestedReportIds: string[];
  selectedReportIds: string[];
  missingReportIds: string[];
  comparableReportCount: number;
  reportsByReport: Array<{
    reportId: string;
    title: string;
    hasOcrText: boolean;
    hasAnalysis: boolean;
    hasInsights: boolean;
    hasComparableContent: boolean;
  }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDirection(direction: AiComparisonDirection) {
  switch (direction) {
    case "improved":
      return "Improved";
    case "worsened":
      return "Worsened";
    case "changed":
      return "Changed";
    case "stable":
      return "Stable";
    case "mixed":
      return "Mixed";
    default:
      return "Uncertain";
  }
}

function formatConfidence(confidence: AiComparisonConfidence) {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    default:
      return "Low confidence";
  }
}

function formatEngine(engine: AiReportComparisonResult["generatedBy"]) {
  switch (engine) {
    case "openai":
      return "OpenAI";
    case "gemini":
      return "Gemini";
    default:
      return "Fallback";
  }
}

function buildFallbackComparison(
  requestedReportIds: string[],
  reports: ReportRecord[]
): AiReportComparisonResult {
  const reportsById = new Map(reports.map((report) => [report.id, report]));

  return {
    reports: requestedReportIds
      .map((reportId) => reportsById.get(reportId))
      .filter((report): report is ReportRecord => Boolean(report))
      .sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      )
      .map((report) => ({
        id: report.id,
        title: report.title || report.original_filename || "Report",
        createdAt: report.created_at,
        reportStatus: report.report_status,
        overallRisk: report.insights_json?.overallRisk || "unknown",
      })),
    summary: "",
    healthImpact: "",
    keyDifferences: [],
    notes: [],
    followUpQuestions: [],
    generatedBy: "unknown",
  };
}

function normalizeComparisonResult(
  value: unknown,
  requestedReportIds: string[],
  reports: ReportRecord[]
) {
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { reports?: unknown }).reports) &&
    Array.isArray((value as { keyDifferences?: unknown }).keyDifferences)
  ) {
    return value as AiReportComparisonResult;
  }

  return buildFallbackComparison(requestedReportIds, reports);
}

function normalizeComparisonDiagnostics(
  value: unknown,
  requestedReportIds: string[],
  reports: ReportRecord[]
) {
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { reportsByReport?: unknown }).reportsByReport)
  ) {
    return value as ComparisonDiagnostics;
  }

  const reportsById = new Map(reports.map((report) => [report.id, report]));

  return {
    requestedReportIds,
    selectedReportIds: requestedReportIds,
    missingReportIds: requestedReportIds.filter((reportId) => !reportsById.has(reportId)),
    comparableReportCount: 0,
    reportsByReport: requestedReportIds.map((reportId) => {
      const report = reportsById.get(reportId);

      return {
        reportId,
        title: report?.title || report?.original_filename || "Report",
        hasOcrText: Boolean(report?.ocr_text),
        hasAnalysis: Boolean(report?.analysis_json),
        hasInsights: Boolean(report?.insights_json),
        hasComparableContent:
          Boolean(report?.ocr_text) ||
          Boolean(report?.analysis_json) ||
          Boolean(report?.insights_json),
      };
    }),
  } satisfies ComparisonDiagnostics;
}

function buildNoComparisonMessage(
  diagnostics: ComparisonDiagnostics | null,
  comparison: AiReportComparisonResult | null
) {
  if (!diagnostics) {
    return "No AI comparison data was returned.";
  }

  if (diagnostics.missingReportIds.length > 0) {
    return "Some selected reports are no longer available for comparison.";
  }

  if (diagnostics.comparableReportCount < 2) {
    return "At least two selected reports need OCR text or extracted analysis before AI comparison can run.";
  }

  const reportsWithoutContent = diagnostics.reportsByReport.filter(
    (report) => !report.hasComparableContent
  );

  if (reportsWithoutContent.length > 0) {
    return reportsWithoutContent.length === 1
      ? "AI comparison ran with limited data because one selected report is still missing OCR text or extracted analysis."
      : "AI comparison ran with limited data because some selected reports are still missing OCR text or extracted analysis.";
  }

  if (comparison?.summary) {
    return "AI reviewed the selected reports but did not identify any clear report-to-report differences.";
  }

  return "No AI comparison data was returned.";
}

export default function WorkspaceReportComparisonPanel({
  authorizedFetchJson,
  reports,
  selectedReportId,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<AiReportComparisonResult | null>(null);
  const [comparisonDiagnostics, setComparisonDiagnostics] = useState<ComparisonDiagnostics | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [hasCompared, setHasCompared] = useState(false);

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

  function renderDifferenceCard(difference: AiComparisonDifference) {
    return (
      <article key={difference.id} className={`difference-card direction-${difference.direction}`}>
        <div className="difference-head">
          <div>
            <strong>{difference.label}</strong>
            <span>{formatDirection(difference.direction)}</span>
          </div>
          <span className="confidence-pill">{formatConfidence(difference.confidence)}</span>
        </div>

        <p className="difference-summary">{difference.summary}</p>

        <div className="difference-values">
          {difference.values.map((value) => (
            <div key={`${difference.id}-${value.reportId}`} className="difference-value">
              <strong>{value.reportTitle}</strong>
              <small>{formatDate(value.reportDate)}</small>
              <span>{value.value}</span>
              {value.note ? <p>{value.note}</p> : null}
            </div>
          ))}
        </div>

        <div className="difference-impact">
          <small>Health impact</small>
          <p>{difference.healthImpact}</p>
        </div>
      </article>
    );
  }

  async function runComparison() {
    const requestedReportIds = effectiveSelectedIds
      .filter((reportId) => reportIdsSet.has(reportId))
      .slice(0, 6);

    if (requestedReportIds.length < 2) {
      return;
    }

    setLoading(true);
    setComparison(null);
    setComparisonDiagnostics(null);
    setErrorMessage("");
    setHasCompared(false);

    try {
      const payload = await authorizedFetchJson("/api/reports/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportIds: requestedReportIds,
        }),
      });

      setComparison(normalizeComparisonResult(payload.comparison, requestedReportIds, reports));
      setComparisonDiagnostics(
        normalizeComparisonDiagnostics(payload.diagnostics, requestedReportIds, reports)
      );
      setHasCompared(true);
    } catch (error) {
      setComparison(null);
      setComparisonDiagnostics(null);
      setHasCompared(true);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to generate an AI comparison."
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleReport(reportId: string) {
    setComparison(null);
    setComparisonDiagnostics(null);
    setErrorMessage("");
    setHasCompared(false);

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
            Compare multiple reports using AI-generated insights from OCR text and extracted report
            analysis. The comparison highlights meaningful changes, likely health impact, and
            follow-up questions to review with a clinician.
          </p>
        </div>

        <div className="workspace-addon-meta">
          <span className="metric-chip">AI generated</span>
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

      {loading ? (
        <div className="workspace-addon-empty">
          Generating an AI comparison from the selected reports...
        </div>
      ) : errorMessage ? (
        <div className="workspace-addon-empty">{errorMessage}</div>
      ) : comparison ? (
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

          <div className="comparison-status-row">
            <span className="metric-chip">{formatEngine(comparison.generatedBy)}</span>
            <span className="metric-chip subtle">
              {comparison.keyDifferences.length} key change
              {comparison.keyDifferences.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="comparison-overview-grid">
            <article className="comparison-overview-card comparison-overview-primary">
              <small>Summary</small>
              <p>{comparison.summary || buildNoComparisonMessage(comparisonDiagnostics, comparison)}</p>
            </article>

            <article className="comparison-overview-card">
              <small>Health impact</small>
              <p>
                {comparison.healthImpact ||
                  "No clear health impact could be determined from the available report data."}
              </p>
            </article>
          </div>

          {comparison.keyDifferences.length === 0 ? (
            <div className="workspace-addon-empty">
              {buildNoComparisonMessage(comparisonDiagnostics, comparison)}
            </div>
          ) : (
            <div className="difference-grid">
              {comparison.keyDifferences.map(renderDifferenceCard)}
            </div>
          )}

          {comparison.notes.length > 0 ? (
            <article className="comparison-list-card">
              <strong>Notes</strong>
              <ul>
                {comparison.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
          ) : null}

          {comparison.followUpQuestions.length > 0 ? (
            <article className="comparison-list-card">
              <strong>Questions to ask</strong>
              <ul>
                {comparison.followUpQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      ) : hasCompared ? (
        <div className="workspace-addon-empty">
          {buildNoComparisonMessage(comparisonDiagnostics, comparison)}
        </div>
      ) : (
        <div className="workspace-addon-empty">
          Select two or more reports to compare them using AI-generated insights.
        </div>
      )}

      <style jsx>{`
        .workspace-addon-card {
          border: 1px solid var(--ws-border);
          border-radius: 28px;
          padding: 24px;
          background: linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface));
          min-width: 0;
          overflow: hidden;
        }

        .workspace-addon-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .workspace-addon-header > div {
          min-width: 0;
        }

        .workspace-addon-header h3 {
          margin: 0 0 6px;
          font-size: 1.1rem;
        }

        .workspace-addon-header p {
          margin: 0;
          color: var(--ws-muted);
          line-height: 1.7;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .workspace-addon-meta {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }

        .metric-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 8px 12px;
          border: 1px solid rgba(74, 140, 110, 0.22);
          background: rgba(74, 140, 110, 0.12);
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
          grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
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
          min-width: 0;
          overflow: hidden;
        }

        .compare-chip input {
          display: none;
        }

        .compare-chip.active {
          border-color: rgba(74, 140, 110, 0.42);
          box-shadow: inset 0 0 0 1px rgba(74, 140, 110, 0.22);
        }

        .compare-chip span,
        .compare-chip small {
          min-width: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
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
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .comparison-results {
          display: grid;
          gap: 16px;
        }

        .comparison-report-row,
        .comparison-overview-grid,
        .difference-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
          gap: 12px;
        }

        .comparison-status-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .comparison-report-card,
        .comparison-overview-card,
        .difference-card,
        .comparison-list-card {
          border: 1px solid var(--ws-border);
          border-radius: 18px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.36);
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
        }

        .comparison-report-card strong,
        .comparison-report-card span,
        .comparison-report-card small,
        .comparison-overview-card p,
        .difference-card strong,
        .difference-card span,
        .difference-card p,
        .difference-card small,
        .comparison-list-card strong,
        .comparison-list-card li {
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
        }

        .comparison-report-card span,
        .comparison-report-card small {
          display: block;
          color: var(--ws-muted);
          margin-top: 4px;
        }

        .comparison-overview-card {
          display: grid;
          gap: 8px;
        }

        .comparison-overview-primary {
          background: linear-gradient(145deg, rgba(74, 140, 110, 0.14), rgba(255, 255, 255, 0.52));
        }

        .comparison-overview-card small {
          color: var(--ws-muted);
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .comparison-overview-card p {
          margin: 0;
          color: var(--ws-text-soft);
          line-height: 1.7;
        }

        .difference-card {
          display: grid;
          gap: 14px;
        }

        .difference-card.direction-improved {
          border-color: rgba(34, 197, 94, 0.22);
          background: rgba(34, 197, 94, 0.08);
        }

        .difference-card.direction-worsened {
          border-color: rgba(248, 113, 113, 0.22);
          background: rgba(248, 113, 113, 0.08);
        }

        .difference-card.direction-changed,
        .difference-card.direction-stable,
        .difference-card.direction-mixed,
        .difference-card.direction-uncertain {
          background: rgba(74, 140, 110, 0.06);
        }

        .difference-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .difference-head > div {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .difference-head strong {
          font-size: 1rem;
          color: var(--ws-text);
        }

        .difference-head span {
          color: var(--ws-muted);
          font-size: 0.82rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .confidence-pill {
          flex-shrink: 0;
          border-radius: 999px;
          padding: 7px 10px;
          border: 1px solid var(--ws-border);
          background: rgba(255, 255, 255, 0.62);
          color: var(--ws-text-soft);
          font-size: 0.74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .difference-summary {
          margin: 0;
          color: var(--ws-text-soft);
          line-height: 1.7;
        }

        .difference-values {
          display: grid;
          gap: 10px;
        }

        .difference-value {
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 14px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.52);
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .difference-value strong {
          color: var(--ws-text);
        }

        .difference-value small {
          color: var(--ws-muted);
        }

        .difference-value span {
          color: var(--ws-text-soft);
          font-weight: 700;
        }

        .difference-value p,
        .difference-impact p {
          margin: 0;
          color: var(--ws-muted);
          line-height: 1.6;
        }

        .difference-impact {
          display: grid;
          gap: 4px;
        }

        .difference-impact small {
          color: var(--ws-muted);
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .comparison-list-card {
          display: grid;
          gap: 10px;
        }

        .comparison-list-card strong {
          color: var(--ws-text);
        }

        .comparison-list-card ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 8px;
          color: var(--ws-text-soft);
          line-height: 1.7;
        }

        @media (max-width: 720px) {
          .workspace-addon-header,
          .difference-head {
            flex-direction: column;
          }

          .workspace-addon-meta {
            justify-content: flex-start;
          }

          .confidence-pill {
            align-self: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
