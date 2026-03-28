import { chooseLocalizedText } from "@/lib/localization";
import type {
  ComparisonMetric,
  ComparisonValue,
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
  canonicalMetricKey: string;
  matchKey: string;
  label: string;
  score: number;
  sortOrder: number;
};

function normalizeMetricName(metricName: string) {
  return metricName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeMetricUnit(unit: string) {
  return unit.toLowerCase().replace(/\s+/g, "").trim();
}

function slugifyMetricName(metricName: string) {
  return normalizeMetricName(metricName).replace(/\s+/g, "_");
}

function getComparisonMetricSortOrder(metricKey: string) {
  switch (metricKey) {
    case "hba1c":
      return 1;
    case "fasting_glucose":
      return 2;
    case "postprandial_glucose":
      return 3;
    case "blood_glucose":
      return 4;
    case "blood_pressure":
      return 5;
    case "hemoglobin":
      return 6;
    case "creatinine":
      return 7;
    case "cholesterol":
      return 8;
    case "hdl_cholesterol":
      return 9;
    case "ldl_cholesterol":
      return 10;
    case "triglycerides":
      return 11;
    case "tsh":
      return 12;
    case "potassium":
      return 13;
    case "sodium":
      return 14;
    default:
      return 99;
  }
}

function resolveComparisonMetric(metricName: string): ResolvedComparisonMetric | null {
  const normalized = normalizeMetricName(metricName);

  if (!normalized) {
    return null;
  }

  if (normalized.includes("hba1c") || normalized.includes("glycated hemoglobin")) {
    return {
      canonicalMetricKey: "hba1c",
      matchKey: normalized,
      label: "HbA1c",
      score: normalized === "hba1c" || normalized === "glycated hemoglobin" ? 5 : 4,
      sortOrder: getComparisonMetricSortOrder("hba1c"),
    };
  }

  if (
    normalized === "fbs" ||
    normalized === "fasting glucose" ||
    normalized === "fasting blood sugar" ||
    normalized === "fasting blood glucose" ||
    (normalized.includes("fasting") &&
      (normalized.includes("glucose") || normalized.includes("blood sugar")))
  ) {
    return {
      canonicalMetricKey: "fasting_glucose",
      matchKey: normalized,
      label: "Fasting Glucose",
      score:
        normalized === "fbs" ||
        normalized === "fasting glucose" ||
        normalized === "fasting blood sugar" ||
        normalized === "fasting blood glucose"
          ? 5
          : 4,
      sortOrder: getComparisonMetricSortOrder("fasting_glucose"),
    };
  }

  if (
    normalized === "ppbs" ||
    normalized === "postprandial glucose" ||
    normalized === "post prandial glucose" ||
    normalized === "post prandial blood sugar" ||
    normalized === "post meal glucose" ||
    normalized === "post meal blood sugar" ||
    ((normalized.includes("post") || normalized.includes("meal")) &&
      (normalized.includes("glucose") || normalized.includes("blood sugar")))
  ) {
    return {
      canonicalMetricKey: "postprandial_glucose",
      matchKey: normalized,
      label: "Postprandial Glucose",
      score:
        normalized === "ppbs" ||
        normalized === "postprandial glucose" ||
        normalized === "post prandial glucose" ||
        normalized === "post prandial blood sugar" ||
        normalized === "post meal glucose" ||
        normalized === "post meal blood sugar"
          ? 5
          : 4,
      sortOrder: getComparisonMetricSortOrder("postprandial_glucose"),
    };
  }

  if (
    normalized === "glucose" ||
    normalized === "blood glucose" ||
    normalized === "blood sugar" ||
    normalized === "serum glucose" ||
    normalized === "random glucose" ||
    normalized === "random blood sugar" ||
    normalized.includes("glucose") ||
    normalized.includes("blood sugar")
  ) {
    return {
      canonicalMetricKey: "blood_glucose",
      matchKey: normalized,
      label: "Glucose",
      score:
        normalized === "glucose" ||
        normalized === "blood glucose" ||
        normalized === "blood sugar" ||
        normalized === "serum glucose" ||
        normalized === "random glucose" ||
        normalized === "random blood sugar"
          ? 5
          : 4,
      sortOrder: getComparisonMetricSortOrder("blood_glucose"),
    };
  }

  if (normalized === "bp" || normalized.includes("blood pressure")) {
    return {
      canonicalMetricKey: "blood_pressure",
      matchKey: normalized,
      label: "Blood Pressure",
      score: normalized === "bp" || normalized === "blood pressure" ? 5 : 4,
      sortOrder: getComparisonMetricSortOrder("blood_pressure"),
    };
  }

  if (
    normalized === "hemoglobin" ||
    normalized === "haemoglobin" ||
    normalized === "hb" ||
    normalized.includes("hemoglobin")
  ) {
    return {
      canonicalMetricKey: "hemoglobin",
      matchKey: normalized,
      label: "Hemoglobin",
      score:
        normalized === "hemoglobin" || normalized === "haemoglobin" || normalized === "hb"
          ? 5
          : 4,
      sortOrder: getComparisonMetricSortOrder("hemoglobin"),
    };
  }

  if (normalized.includes("hdl")) {
    return {
      canonicalMetricKey: "hdl_cholesterol",
      matchKey: normalized,
      label: "HDL Cholesterol",
      score: 5,
      sortOrder: getComparisonMetricSortOrder("hdl_cholesterol"),
    };
  }

  if (normalized.includes("ldl")) {
    return {
      canonicalMetricKey: "ldl_cholesterol",
      matchKey: normalized,
      label: "LDL Cholesterol",
      score: 5,
      sortOrder: getComparisonMetricSortOrder("ldl_cholesterol"),
    };
  }

  if (normalized.includes("triglyceride")) {
    return {
      canonicalMetricKey: "triglycerides",
      matchKey: normalized,
      label: "Triglycerides",
      score: 5,
      sortOrder: getComparisonMetricSortOrder("triglycerides"),
    };
  }

  if (
    normalized === "cholesterol" ||
    normalized === "total cholesterol" ||
    normalized === "serum cholesterol" ||
    normalized.includes("cholesterol")
  ) {
    return {
      canonicalMetricKey: "cholesterol",
      matchKey: normalized,
      label: "Cholesterol",
      score:
        normalized === "cholesterol" ||
        normalized === "total cholesterol" ||
        normalized === "serum cholesterol"
          ? 5
          : 4,
      sortOrder: getComparisonMetricSortOrder("cholesterol"),
    };
  }

  if (normalized.includes("creatinine")) {
    return {
      canonicalMetricKey: "creatinine",
      matchKey: normalized,
      label: "Creatinine",
      score: 5,
      sortOrder: getComparisonMetricSortOrder("creatinine"),
    };
  }

  if (normalized.includes("tsh") || normalized.includes("thyroid stimulating hormone")) {
    return {
      canonicalMetricKey: "tsh",
      matchKey: normalized,
      label: "TSH",
      score:
        normalized.includes("tsh") || normalized.includes("thyroid stimulating hormone") ? 5 : 4,
      sortOrder: getComparisonMetricSortOrder("tsh"),
    };
  }

  if (normalized.includes("potassium")) {
    return {
      canonicalMetricKey: "potassium",
      matchKey: normalized,
      label: "Potassium",
      score: 5,
      sortOrder: getComparisonMetricSortOrder("potassium"),
    };
  }

  if (normalized.includes("sodium")) {
    return {
      canonicalMetricKey: "sodium",
      matchKey: normalized,
      label: "Sodium",
      score: 5,
      sortOrder: getComparisonMetricSortOrder("sodium"),
    };
  }

  return {
    canonicalMetricKey: slugifyMetricName(metricName),
    matchKey: normalized,
    label: formatMetricLabel(slugifyMetricName(metricName), metricName),
    score: 1,
    sortOrder: 99,
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
  const counts = new Map<
    string,
    {
      count: number;
      label: string;
    }
  >();

  for (const point of points) {
    const unit = point.unit.trim();
    const normalizedUnit = normalizeMetricUnit(unit);

    if (!unit || !normalizedUnit) {
      continue;
    }

    const existing = counts.get(normalizedUnit);
    counts.set(normalizedUnit, {
      count: (existing?.count || 0) + 1,
      label: existing?.label || unit,
    });
  }

  return (
    Array.from(counts.values()).sort((left, right) => right.count - left.count)[0]?.label || ""
  );
}

function listDistinctUnits(points: TrendDataPoint[]) {
  const units = new Map<string, string>();

  for (const point of points) {
    const unit = point.unit.trim();
    const normalizedUnit = normalizeMetricUnit(unit);

    if (!unit || !normalizedUnit || units.has(normalizedUnit)) {
      continue;
    }

    units.set(normalizedUnit, unit);
  }

  return Array.from(units.values());
}

function areUnitsCompatible(leftUnit: string, rightUnit: string) {
  const left = normalizeMetricUnit(leftUnit);
  const right = normalizeMetricUnit(rightUnit);

  return !left || !right || left === right;
}

function calculateDelta(currentValue: number, previousValue: number) {
  return Number((currentValue - previousValue).toFixed(2));
}

function calculateDeltaPercent(currentValue: number, previousValue: number) {
  if (previousValue === 0) {
    return null;
  }

  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

function buildComparisonValues(points: TrendDataPoint[]): ComparisonValue[] {
  const first = points[0] || null;

  return points.map((point, index) => {
    const previous = index > 0 ? points[index - 1] : null;
    const canCompareWithFirst = Boolean(first) && areUnitsCompatible(point.unit, first.unit);
    const canCompareWithPrevious = previous
      ? areUnitsCompatible(point.unit, previous.unit)
      : false;

    return {
      ...point,
      differenceFromFirst:
        first && index > 0 && canCompareWithFirst ? calculateDelta(point.value, first.value) : null,
      differenceFromPrevious:
        previous && canCompareWithPrevious ? calculateDelta(point.value, previous.value) : null,
      percentChangeFromFirst:
        first && index > 0 && canCompareWithFirst
          ? calculateDeltaPercent(point.value, first.value)
          : null,
      percentChangeFromPrevious:
        previous && canCompareWithPrevious
          ? calculateDeltaPercent(point.value, previous.value)
          : null,
    };
  });
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

  if (!first || !latest) {
    return chooseLocalizedText(language, {
      en: "No comparable metric values were available.",
      hi: "Compare karne ke liye metric values available nahi the.",
      hinglish: "Compare karne ke liye metric values available nahi the.",
    });
  }

  if (metric.hasUnitMismatch) {
    return chooseLocalizedText(language, {
      en: `${metric.testName} values were found, but the units differ across reports, so a net difference could not be calculated.`,
      hi: `${metric.testName} ke values mile, lekin reports me units alag hain, isliye net difference calculate nahi ho saka.`,
      hinglish: `${metric.testName} ke values mile, lekin reports me units alag hain, isliye net difference calculate nahi ho saka.`,
    });
  }

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
      matchKey: string;
      canonicalMetricKey: string;
      sortOrder: number;
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
      metricKey: resolvedMetric.matchKey,
      testName: resolvedMetric.label,
      value: row.metric_value,
      unit: row.unit,
      status: "unknown",
    };

    const selectionKey = `${resolvedMetric.matchKey}:${row.report_id}`;
    const existing = selectedPoints.get(selectionKey);

    if (
      !existing ||
      resolvedMetric.score > existing.score ||
      (resolvedMetric.score === existing.score &&
        new Date(row.created_at).getTime() >= new Date(existing.insertedAt).getTime())
    ) {
      selectedPoints.set(selectionKey, {
        point,
        matchKey: resolvedMetric.matchKey,
        canonicalMetricKey: resolvedMetric.canonicalMetricKey,
        sortOrder: resolvedMetric.sortOrder,
        score: resolvedMetric.score,
        insertedAt: row.created_at,
      });
    }
  }

  return Array.from(selectedPoints.values());
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
  const metricMetaByKey = new Map<
    string,
    {
      testName: string;
      canonicalMetricKey: string;
      sortOrder: number;
      score: number;
    }
  >();

  for (const entry of buildStoredComparisonPoints(metricRows, normalizedReports)) {
    const list = grouped.get(entry.matchKey) || [];
    list.push(entry.point);
    grouped.set(entry.matchKey, list);

    const existingMeta = metricMetaByKey.get(entry.matchKey);
    if (
      !existingMeta ||
      entry.sortOrder < existingMeta.sortOrder ||
      (entry.sortOrder === existingMeta.sortOrder && entry.score > existingMeta.score)
    ) {
      metricMetaByKey.set(entry.matchKey, {
        testName: entry.point.testName,
        canonicalMetricKey: entry.canonicalMetricKey,
        sortOrder: entry.sortOrder,
        score: entry.score,
      });
    }
  }

  const metrics = Array.from(grouped.entries())
    .map(([metricKey, rawPoints]) => {
      const metricMeta = metricMetaByKey.get(metricKey);
      const points = [...rawPoints].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
      const preferredUnit = pickPreferredUnit(points);
      const distinctUnits = listDistinctUnits(points);
      const hasUnitMismatch = distinctUnits.length > 1;
      const normalizedPoints = points.filter((point) =>
        normalizedReports.some((report) => report.id === point.reportId)
      );

      if (normalizedPoints.length < 2) {
        return null;
      }

      const valuesByReportId = new Map(
        normalizedPoints.map((point) => [point.reportId, point])
      );
      const orderedPoints = normalizedReports
        .map((report) => valuesByReportId.get(report.id) || null)
        .filter((point): point is TrendDataPoint => Boolean(point));

      if (orderedPoints.length < 2) {
        return null;
      }

      const comparisonValues = buildComparisonValues(orderedPoints);
      const first = comparisonValues[0];
      const latest = comparisonValues[comparisonValues.length - 1];
      const canCalculateNetDifference =
        Boolean(first) &&
        Boolean(latest) &&
        comparisonValues.every((point) => areUnitsCompatible(point.unit, first.unit));
      const delta =
        first && latest && canCalculateNetDifference
          ? calculateDelta(latest.value, first.value)
          : null;
      const deltaPercent =
        first && latest && canCalculateNetDifference
          ? calculateDeltaPercent(latest.value, first.value)
          : null;
      const direction =
        delta === null ? "mixed" : formatComparisonDirection(delta, first.value, language).direction;

      const metric: ComparisonMetric = {
        metricKey,
        testName:
          metricMeta?.testName ||
          latest?.testName ||
          formatMetricLabel(metricMeta?.canonicalMetricKey || metricKey, metricKey),
        unit: preferredUnit,
        units: distinctUnits,
        hasUnitMismatch,
        values: comparisonValues,
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
    .sort((left, right) => {
      if (right.values.length !== left.values.length) {
        return right.values.length - left.values.length;
      }

      if (left.hasUnitMismatch !== right.hasUnitMismatch) {
        return Number(left.hasUnitMismatch) - Number(right.hasUnitMismatch);
      }

      const sortOrderDelta =
        (metricMetaByKey.get(left.metricKey)?.sortOrder || 99) -
        (metricMetaByKey.get(right.metricKey)?.sortOrder || 99);

      if (sortOrderDelta !== 0) {
        return sortOrderDelta;
      }

      const deltaMagnitude = Math.abs(right.deltaPercent || 0) - Math.abs(left.deltaPercent || 0);

      if (deltaMagnitude !== 0) {
        return deltaMagnitude;
      }

      return left.testName.localeCompare(right.testName);
    });

  return {
    reports: reportSummaries,
    metrics,
  };
}
