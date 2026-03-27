import { chooseLocalizedText } from "@/lib/localization";
import type {
  ComparisonMetric,
  OutputLanguage,
  ReportComparisonResult,
  ReportComparisonSummary,
  ReportRecord,
  TrendDataPoint,
} from "@/lib/report-types";

type ComparableReport = Pick<
  ReportRecord,
  "id" | "title" | "original_filename" | "created_at" | "report_status" | "insights_json"
>;

type StoredMetricRow = {
  id: string;
  report_id: string;
  metric_name: string;
  metric_value: number;
  unit: string;
  created_at: string;
};

type ResolvedComparisonMetric = {
  metricKey: string;
  label: string;
  score: number;
};

function normalizeMetricName(metricName: string) {
  return metricName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugifyMetricName(metricName: string) {
  return normalizeMetricName(metricName).replace(/\s+/g, "_");
}

function toComparisonMetricKey(metricName: string) {
  const normalized = normalizeMetricName(metricName);

  if (!normalized) {
    return "";
  }

  if (normalized.includes("hba1c") || normalized.includes("glycated hemoglobin")) {
    return "hba1c";
  }

  if (
    normalized === "glucose" ||
    normalized === "blood glucose" ||
    normalized === "blood sugar" ||
    normalized === "serum glucose"
  ) {
    return "blood_glucose";
  }

  if (
    normalized === "fbs" ||
    normalized === "fasting blood sugar" ||
    normalized === "fasting glucose"
  ) {
    return "fasting_glucose";
  }

  if (
    normalized === "ppbs" ||
    normalized === "postprandial glucose" ||
    normalized === "post prandial glucose" ||
    normalized === "post prandial blood sugar"
  ) {
    return "postprandial_glucose";
  }

  if (normalized === "bp" || normalized === "blood pressure") {
    return "blood_pressure";
  }

  if (normalized === "hemoglobin" || normalized === "hb") {
    return "hemoglobin";
  }

  if (normalized === "cholesterol" || normalized === "total cholesterol") {
    return "cholesterol";
  }

  if (normalized.includes("hdl")) {
    return "hdl_cholesterol";
  }

  if (normalized.includes("ldl")) {
    return "ldl_cholesterol";
  }

  if (normalized.includes("triglyceride")) {
    return "triglycerides";
  }

  if (normalized.includes("creatinine")) {
    return "creatinine";
  }

  if (normalized.includes("tsh") || normalized.includes("thyroid stimulating hormone")) {
    return "tsh";
  }

  if (normalized.includes("potassium")) {
    return "potassium";
  }

  if (normalized.includes("sodium")) {
    return "sodium";
  }

  return slugifyMetricName(metricName);
}

function resolveComparisonMetric(metricName: string): ResolvedComparisonMetric | null {
  const metricKey = toComparisonMetricKey(metricName);
  const normalized = normalizeMetricName(metricName);

  if (!metricKey) {
    return null;
  }

  if (metricKey === "hba1c") {
    return {
      metricKey,
      label: "HbA1c",
      score: normalized === "hba1c" || normalized === "glycated hemoglobin" ? 5 : 4,
    };
  }

  if (metricKey === "blood_glucose") {
    return {
      metricKey,
      label: "Glucose",
      score:
        normalized === "glucose" ||
        normalized === "blood glucose" ||
        normalized === "blood sugar" ||
        normalized === "serum glucose"
          ? 5
          : 4,
    };
  }

  if (metricKey === "fasting_glucose") {
    return {
      metricKey,
      label: "Fasting Glucose",
      score:
        normalized === "fbs" ||
        normalized === "fasting blood sugar" ||
        normalized === "fasting glucose"
          ? 5
          : 4,
    };
  }

  if (metricKey === "postprandial_glucose") {
    return {
      metricKey,
      label: "Postprandial Glucose",
      score:
        normalized === "ppbs" ||
        normalized === "postprandial glucose" ||
        normalized === "post prandial glucose" ||
        normalized === "post prandial blood sugar"
          ? 5
          : 4,
    };
  }

  if (metricKey === "blood_pressure") {
    return {
      metricKey,
      label: "Blood Pressure",
      score: normalized === "bp" || normalized === "blood pressure" ? 5 : 4,
    };
  }

  if (metricKey === "hemoglobin") {
    return {
      metricKey,
      label: "Hemoglobin",
      score:
        normalized === "hemoglobin" || normalized === "haemoglobin" || normalized === "hb"
          ? 5
          : 4,
    };
  }

  if (metricKey === "cholesterol") {
    return {
      metricKey,
      label: "Cholesterol",
      score:
        normalized === "cholesterol" ||
        normalized === "total cholesterol" ||
        normalized === "serum cholesterol"
          ? 5
          : 4,
    };
  }

  if (metricKey === "hdl_cholesterol") {
    return {
      metricKey,
      label: "HDL Cholesterol",
      score: normalized.includes("hdl") ? 5 : 4,
    };
  }

  if (metricKey === "ldl_cholesterol") {
    return {
      metricKey,
      label: "LDL Cholesterol",
      score: normalized.includes("ldl") ? 5 : 4,
    };
  }

  if (metricKey === "triglycerides") {
    return {
      metricKey,
      label: "Triglycerides",
      score: normalized.includes("triglyceride") ? 5 : 4,
    };
  }

  if (metricKey === "creatinine") {
    return {
      metricKey,
      label: "Creatinine",
      score: normalized.includes("creatinine") ? 5 : 4,
    };
  }

  if (metricKey === "tsh") {
    return {
      metricKey,
      label: "TSH",
      score:
        normalized.includes("tsh") || normalized.includes("thyroid stimulating hormone") ? 5 : 4,
    };
  }

  if (metricKey === "potassium") {
    return {
      metricKey,
      label: "Potassium",
      score: normalized.includes("potassium") ? 5 : 4,
    };
  }

  if (metricKey === "sodium") {
    return {
      metricKey,
      label: "Sodium",
      score: normalized.includes("sodium") ? 5 : 4,
    };
  }

  return {
    metricKey,
    label: formatMetricLabel(metricKey, metricName),
    score: 1,
  };
}

function formatMetricLabel(metricKey: string, fallbackLabel: string) {
  switch (metricKey) {
    case "blood_glucose":
      return "Glucose";
    case "fasting_glucose":
      return "Fasting Glucose";
    case "postprandial_glucose":
      return "Postprandial Glucose";
    case "blood_pressure":
      return "Blood Pressure";
    case "hemoglobin":
      return "Hemoglobin";
    case "hba1c":
      return "HbA1c";
    case "cholesterol":
      return "Cholesterol";
    case "hdl_cholesterol":
      return "HDL Cholesterol";
    case "ldl_cholesterol":
      return "LDL Cholesterol";
    case "triglycerides":
      return "Triglycerides";
    case "tsh":
      return "TSH";
    default:
      if (fallbackLabel.trim()) {
        return fallbackLabel;
      }

      return metricKey
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function pickPreferredUnit(points: TrendDataPoint[]) {
  const counts = new Map<string, number>();

  for (const point of points) {
    const unit = point.unit.trim();

    if (!unit) {
      continue;
    }

    counts.set(unit, (counts.get(unit) || 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function formatComparisonDirection(
  delta: number,
  previousValue: number,
  language: OutputLanguage
) {
  const threshold = Math.max(Math.abs(previousValue) * 0.05, 0.2);

  if (Math.abs(delta) < threshold) {
    return {
      direction: "stable" as const,
      label: chooseLocalizedText(language, {
        en: "stayed stable",
        hi: "stable raha",
        hinglish: "stable raha",
      }),
    };
  }

  return delta > 0
    ? {
        direction: "up" as const,
        label: chooseLocalizedText(language, {
          en: "increased",
          hi: "badha",
          hinglish: "badha",
        }),
      }
    : {
        direction: "down" as const,
        label: chooseLocalizedText(language, {
          en: "decreased",
          hi: "ghata",
          hinglish: "ghata",
        }),
      };
}

function buildMetricSummary(
  metric: ComparisonMetric,
  language: OutputLanguage
) {
  const first = metric.values[0];
  const latest = metric.values[metric.values.length - 1];

  return chooseLocalizedText(language, {
    en: `${metric.testName} ${metric.direction === "stable" ? "stayed stable" : metric.direction === "up" ? "increased" : "decreased"} from ${first.value}${metric.unit ? ` ${metric.unit}` : ""} to ${latest.value}${metric.unit ? ` ${metric.unit}` : ""}.${metric.deltaPercent !== null ? ` Net change: ${metric.deltaPercent > 0 ? "+" : ""}${metric.deltaPercent}%.` : ""}`,
    hi: `${metric.testName} ${first.value}${metric.unit ? ` ${metric.unit}` : ""} se ${latest.value}${metric.unit ? ` ${metric.unit}` : ""} tak ${metric.direction === "stable" ? "stable raha" : metric.direction === "up" ? "badha" : "ghata"}.${metric.deltaPercent !== null ? ` Net change: ${metric.deltaPercent > 0 ? "+" : ""}${metric.deltaPercent}%.` : ""}`,
    hinglish: `${metric.testName} ${first.value}${metric.unit ? ` ${metric.unit}` : ""} se ${latest.value}${metric.unit ? ` ${metric.unit}` : ""} tak ${metric.direction === "stable" ? "stable raha" : metric.direction === "up" ? "badha" : "ghata"}.${metric.deltaPercent !== null ? ` Net change: ${metric.deltaPercent > 0 ? "+" : ""}${metric.deltaPercent}%.` : ""}`,
  });
}

function buildStoredComparisonPoints(
  metricRows: StoredMetricRow[],
  reports: ComparableReport[]
) {
  const reportIds = new Set(reports.map((report) => report.id));
  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const selectedPoints = new Map<
    string,
    {
      point: TrendDataPoint;
      score: number;
      insertedAt: string;
    }
  >();

  for (const row of metricRows) {
    if (!reportIds.has(row.report_id)) {
      continue;
    }

    const report = reportsById.get(row.report_id);
    const resolvedMetric = resolveComparisonMetric(row.metric_name);

    if (!report || !resolvedMetric) {
      continue;
    }

    const point: TrendDataPoint = {
      reportId: row.report_id,
      reportLabel: report.title || report.original_filename || "Report",
      createdAt: report.created_at || row.created_at,
      metricKey: resolvedMetric.metricKey,
      testName: resolvedMetric.label,
      value: row.metric_value,
      unit: row.unit,
      status: "unknown",
    };

    const selectionKey = `${resolvedMetric.metricKey}:${row.report_id}`;
    const existing = selectedPoints.get(selectionKey);

    if (
      !existing ||
      resolvedMetric.score > existing.score ||
      (resolvedMetric.score === existing.score &&
        new Date(row.created_at).getTime() >= new Date(existing.insertedAt).getTime())
    ) {
      selectedPoints.set(selectionKey, {
        point,
        score: resolvedMetric.score,
        insertedAt: row.created_at,
      });
    }
  }

  return Array.from(selectedPoints.values()).map((entry) => entry.point);
}

export function buildReportComparison(
  metricRows: StoredMetricRow[],
  reports: ComparableReport[],
  language: OutputLanguage = "en"
): ReportComparisonResult {
  const normalizedReports = [...reports].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );

  const reportSummaries: ReportComparisonSummary[] = normalizedReports.map((report) => ({
    id: report.id,
    title: report.title || report.original_filename || "Report",
    createdAt: report.created_at,
    reportStatus: report.report_status,
    overallRisk: report.insights_json?.overallRisk || "unknown",
  }));

  const grouped = new Map<string, TrendDataPoint[]>();

  for (const point of buildStoredComparisonPoints(metricRows, normalizedReports)) {
    const list = grouped.get(point.metricKey) || [];
    list.push(point);
    grouped.set(point.metricKey, list);
  }

  const metrics = Array.from(grouped.entries())
    .map(([metricKey, rawPoints]) => {
      const points = [...rawPoints].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
      const preferredUnit = pickPreferredUnit(points);
      const normalizedPoints = (
        preferredUnit
          ? points.filter((point) => !point.unit || point.unit === preferredUnit)
          : points
      )
        .map((point) => ({
          ...point,
          unit: preferredUnit || point.unit,
        }))
        .filter((point) =>
          normalizedReports.some((report) => report.id === point.reportId)
        );

      if (normalizedPoints.length < normalizedReports.length) {
        return null;
      }

      const valuesByReportId = new Map(
        normalizedPoints.map((point) => [point.reportId, point])
      );
      const orderedPoints = normalizedReports
        .map((report) => valuesByReportId.get(report.id) || null)
        .filter((point): point is TrendDataPoint => Boolean(point));

      if (orderedPoints.length < normalizedReports.length) {
        return null;
      }

      const first = orderedPoints[0];
      const latest = orderedPoints[orderedPoints.length - 1];
      const delta = Number((latest.value - first.value).toFixed(2));
      const deltaPercent =
        first.value !== 0
          ? Number((((latest.value - first.value) / first.value) * 100).toFixed(1))
          : null;
      const { direction } = formatComparisonDirection(delta, first.value, language);

      const metric: ComparisonMetric = {
        metricKey,
        testName: latest.testName || formatMetricLabel(metricKey, metricKey),
        unit: preferredUnit,
        values: orderedPoints,
        direction,
        delta,
        deltaPercent,
        summary: "",
      };

      return {
        ...metric,
        summary: buildMetricSummary(metric, language),
      } satisfies ComparisonMetric;
    })
    .filter((metric): metric is ComparisonMetric => Boolean(metric))
    .sort((left, right) => Math.abs(right.deltaPercent || 0) - Math.abs(left.deltaPercent || 0));

  return {
    reports: reportSummaries,
    metrics,
  };
}
