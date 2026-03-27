import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import { chooseLocalizedText } from "@/lib/localization";
import type {
  MetricSeries,
  OutputLanguage,
  ReportRecord,
  TestStatus,
  TestEvaluation,
  TestValueEntry,
  TrendDataPoint,
  TrendInsight,
} from "@/lib/report-types";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export type StoredMetricRow = {
  id: string;
  report_id: string;
  metric_name: string;
  metric_value: number;
  unit: string;
  created_at: string;
};

type StoredMetricSeed = {
  metric_name: string;
  metric_value: number;
  unit: string;
};

type TrackedMetricKey = "blood_glucose" | "cholesterol" | "hemoglobin";
type TrackedMetricVariant =
  | "glucose"
  | "fasting_glucose"
  | "postprandial_glucose"
  | "cholesterol_total"
  | "hemoglobin";
type ResolvedTrackedMetric = {
  metricKey: TrackedMetricKey;
  variantKey: TrackedMetricVariant;
  label: string;
  score: number;
};

const TRENDS_NOT_READY_MESSAGE =
  "Health trend metrics are not initialized for this Supabase project yet. Apply the SQL in supabase/schema.sql to enable report metric analytics.";

const TRACKED_METRICS: Array<{
  key: TrackedMetricKey;
  label: string;
}> = [
  {
    key: "blood_glucose",
    label: "Glucose",
  },
  {
    key: "cholesterol",
    label: "Cholesterol",
  },
  {
    key: "hemoglobin",
    label: "Hemoglobin",
  },
];

function normalizeSupabaseTableName(tableName: string) {
  const normalized = tableName.trim().toLowerCase();
  return normalized.includes(".") ? normalized : `public.${normalized}`;
}

function isMissingSupabaseTableError(
  error: SupabaseLikeError | null | undefined,
  tableName: string
) {
  const normalizedTableName = normalizeSupabaseTableName(tableName);
  const message = error?.message?.toLowerCase() || "";
  const details = error?.details?.toLowerCase() || "";
  const code = error?.code?.toUpperCase() || "";

  return (
    message.includes(`could not find the table '${normalizedTableName}'`) ||
    message.includes(`relation "${normalizedTableName}" does not exist`) ||
    details.includes(normalizedTableName) ||
    ((code === "PGRST205" || code === "42P01") &&
      (message.includes(normalizedTableName) || details.includes(normalizedTableName)))
  );
}

function isMissingSupabaseColumnError(
  error: SupabaseLikeError | null | undefined,
  tableName: string
) {
  const message = error?.message?.toLowerCase() || "";
  const code = error?.code?.toUpperCase() || "";

  return (
    code === "42703" &&
    (message.includes(`column ${tableName.toLowerCase()}.`) ||
      message.includes(`column public.${tableName.toLowerCase()}.`))
  );
}

function throwStoredMetricsApiError(error: SupabaseLikeError | null | undefined) {
  if (
    isMissingSupabaseTableError(error, "report_metrics") ||
    isMissingSupabaseColumnError(error, "report_metrics")
  ) {
    throw new ApiError(TRENDS_NOT_READY_MESSAGE, 503);
  }
}

function normalizeMetricValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseInlineMetricValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/,/g, "");

  if (!normalized || normalized.includes("/") || normalized.includes(":")) {
    return null;
  }

  const match = normalized.match(/^[<>~]?\s*(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMetricUnit(unit: unknown) {
  return typeof unit === "string" ? unit.trim() : "";
}

function normalizeMetricName(metricName: string) {
  return metricName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildStoredMetricSeedKey(metricName: string, unit: string) {
  return `${normalizeMetricName(metricName)}::${normalizeMetricUnit(unit).toLowerCase()}`;
}

function addStoredMetricSeed(
  seeds: Map<string, StoredMetricSeed>,
  metricName: string,
  metricValue: number | null,
  unit: string
) {
  const normalizedMetricName = metricName.trim();

  if (!normalizedMetricName || metricValue === null || !Number.isFinite(metricValue)) {
    return;
  }

  seeds.set(buildStoredMetricSeedKey(normalizedMetricName, unit), {
    metric_name: normalizedMetricName,
    metric_value: Number(metricValue.toFixed(4)),
    unit: normalizeMetricUnit(unit),
  });
}

function buildStoredMetricSeedsFromEvaluations(evaluations: TestEvaluation[] = []) {
  const seeds = new Map<string, StoredMetricSeed>();

  for (const evaluation of evaluations) {
    addStoredMetricSeed(seeds, evaluation.name, evaluation.numericValue, evaluation.unit);
  }

  return Array.from(seeds.values());
}

function buildStoredMetricSeedsFromTests(testValues: TestValueEntry[] = []) {
  const seeds = new Map<string, StoredMetricSeed>();

  for (const test of testValues) {
    addStoredMetricSeed(seeds, test.name, parseInlineMetricValue(test.value), test.unit);
  }

  return Array.from(seeds.values());
}

function buildStoredMetricSeedsForReport(
  report: Pick<ReportRecord, "analysis_json" | "insights_json">
) {
  const evaluationSeeds = buildStoredMetricSeedsFromEvaluations(
    report.insights_json?.testEvaluations || []
  );

  if (evaluationSeeds.length > 0) {
    return evaluationSeeds;
  }

  return buildStoredMetricSeedsFromTests(report.analysis_json?.testValues || []);
}

function normalizeStoredMetricRows(records: unknown[]) {
  return records.reduce<StoredMetricRow[]>((rows, record) => {
    const row = record as Record<string, unknown>;
    const metricValue = normalizeMetricValue(row.metric_value);

    if (metricValue === null) {
      return rows;
    }

    rows.push({
      id: String(row.id || ""),
      report_id: String(row.report_id || ""),
      metric_name: String(row.metric_name || ""),
      metric_value: metricValue,
      unit: typeof row.unit === "string" ? row.unit : "",
      created_at: String(row.created_at || ""),
    });

    return rows;
  }, []);
}

function buildDerivedStoredMetricsForReport(
  report: Pick<ReportRecord, "id" | "analysis_json" | "insights_json" | "created_at" | "updated_at">
) {
  const createdAt = report.updated_at || report.created_at || new Date(0).toISOString();

  return buildStoredMetricSeedsForReport(report).map((seed, index) => ({
    id: `derived:${report.id}:${index}:${normalizeMetricName(seed.metric_name).replace(/\s+/g, "-") || "metric"}`,
    report_id: report.id,
    metric_name: seed.metric_name,
    metric_value: seed.metric_value,
    unit: seed.unit,
    created_at: createdAt,
  }));
}

async function replaceStoredMetricsForReport(
  supabase: SupabaseClient,
  report: Pick<ReportRecord, "id" | "analysis_json" | "insights_json">
) {
  const nextRows = buildStoredMetricSeedsForReport(report);
  const { error: deleteError } = await supabase
    .from("report_metrics")
    .delete()
    .eq("report_id", report.id);

  if (deleteError) {
    throwStoredMetricsApiError(deleteError);
    throw new Error(deleteError.message);
  }

  if (nextRows.length === 0) {
    return [] as StoredMetricRow[];
  }

  const { data, error } = await supabase
    .from("report_metrics")
    .insert(
      nextRows.map((row) => ({
        report_id: report.id,
        metric_name: row.metric_name,
        metric_value: row.metric_value,
        unit: row.unit,
      }))
    )
    .select("id, report_id, metric_name, metric_value, unit, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throwStoredMetricsApiError(error);
    throw new Error(error.message);
  }

  return normalizeStoredMetricRows(data || []);
}

function shouldSyncStoredMetricsForReport(
  report: Pick<ReportRecord, "id" | "analysis_json" | "insights_json" | "created_at" | "updated_at">,
  metricRowsByReportId: Map<string, StoredMetricRow[]>
) {
  if (buildStoredMetricSeedsForReport(report).length === 0) {
    return false;
  }

  const existingRows = metricRowsByReportId.get(report.id) || [];

  if (existingRows.length === 0) {
    return true;
  }

  const reportTimestamp = new Date(report.updated_at || report.created_at).getTime();

  if (!Number.isFinite(reportTimestamp)) {
    return false;
  }

  const latestStoredTimestamp = existingRows.reduce((latest, row) => {
    const rowTimestamp = new Date(row.created_at).getTime();
    return Number.isFinite(rowTimestamp) ? Math.max(latest, rowTimestamp) : latest;
  }, 0);

  return latestStoredTimestamp === 0 || reportTimestamp > latestStoredTimestamp;
}

function resolveTrackedMetric(metricName: string): ResolvedTrackedMetric | null {
  const normalized = normalizeMetricName(metricName);

  if (!normalized) {
    return null;
  }

  if (
    normalized === "glucose" ||
    normalized === "blood glucose" ||
    normalized === "blood sugar" ||
    normalized === "serum glucose" ||
    normalized === "random glucose" ||
    normalized === "random blood sugar"
  ) {
    return {
      metricKey: "blood_glucose",
      variantKey: "glucose",
      label: "Glucose",
      score: 5,
    };
  }

  if (
    normalized === "fbs" ||
    normalized === "fasting glucose" ||
    normalized === "fasting blood sugar" ||
    normalized === "fasting blood glucose"
  ) {
    return {
      metricKey: "blood_glucose",
      variantKey: "fasting_glucose",
      label: "Fasting Glucose",
      score: 5,
    };
  }

  if (
    normalized === "ppbs" ||
    normalized === "postprandial glucose" ||
    normalized === "post prandial glucose" ||
    normalized === "post prandial blood sugar" ||
    normalized === "post meal glucose" ||
    normalized === "post meal blood sugar"
  ) {
    return {
      metricKey: "blood_glucose",
      variantKey: "postprandial_glucose",
      label: "Postprandial Glucose",
      score: 5,
    };
  }

  if (
    normalized.includes("fasting") &&
    (normalized.includes("glucose") || normalized.includes("blood sugar"))
  ) {
    return {
      metricKey: "blood_glucose",
      variantKey: "fasting_glucose",
      label: "Fasting Glucose",
      score: 4,
    };
  }

  if (
    normalized.includes("post") &&
    (normalized.includes("glucose") || normalized.includes("blood sugar"))
  ) {
    return {
      metricKey: "blood_glucose",
      variantKey: "postprandial_glucose",
      label: "Postprandial Glucose",
      score: 4,
    };
  }

  if (normalized.includes("glucose") || normalized.includes("blood sugar")) {
    return {
      metricKey: "blood_glucose",
      variantKey: "glucose",
      label: "Glucose",
      score: 3,
    };
  }

  if (
    normalized === "cholesterol" ||
    normalized === "total cholesterol" ||
    normalized === "serum cholesterol"
  ) {
    return {
      metricKey: "cholesterol",
      variantKey: "cholesterol_total",
      label: "Cholesterol",
      score: 5,
    };
  }

  if (
    normalized.includes("hdl") ||
    normalized.includes("ldl") ||
    normalized.includes("triglyceride")
  ) {
    return null;
  }

  if (normalized.includes("cholesterol")) {
    return {
      metricKey: "cholesterol",
      variantKey: "cholesterol_total",
      label: "Cholesterol",
      score: 3,
    };
  }

  if (
    normalized === "hemoglobin" ||
    normalized === "haemoglobin" ||
    normalized === "hb"
  ) {
    return {
      metricKey: "hemoglobin",
      variantKey: "hemoglobin",
      label: "Hemoglobin",
      score: 5,
    };
  }

  if (normalized.includes("hemoglobin")) {
    return {
      metricKey: "hemoglobin",
      variantKey: "hemoglobin",
      label: "Hemoglobin",
      score: 4,
    };
  }

  return null;
}

function getVariantPriority(variantKey: TrackedMetricVariant) {
  switch (variantKey) {
    case "glucose":
      return 4;
    case "fasting_glucose":
      return 3;
    case "postprandial_glucose":
      return 2;
    case "cholesterol_total":
      return 4;
    case "hemoglobin":
      return 4;
    default:
      return 1;
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

function calculateDirection(latestValue: number, previousValue: number) {
  const delta = Number((latestValue - previousValue).toFixed(2));
  const threshold = Math.max(Math.abs(previousValue) * 0.05, 0.2);

  if (Math.abs(delta) < threshold) {
    return {
      direction: "stable" as const,
      delta,
    };
  }

  return {
    direction: delta > 0 ? ("up" as const) : ("down" as const),
    delta,
  };
}

function buildTrendSummary(
  series: MetricSeries,
  previous: TrendDataPoint,
  latest: TrendDataPoint,
  direction: "up" | "down" | "stable",
  language: OutputLanguage
) {
  const changeLabel =
    direction === "stable"
      ? chooseLocalizedText(language, {
          en: "stayed fairly stable",
          hi: "kaafi stable raha",
          hinglish: "kaafi stable raha",
        })
      : direction === "up"
        ? chooseLocalizedText(language, {
            en: "increased",
            hi: "badha",
            hinglish: "badha",
          })
        : chooseLocalizedText(language, {
            en: "decreased",
            hi: "ghata",
            hinglish: "ghata",
          });

  return chooseLocalizedText(language, {
    en: `${series.testName} ${changeLabel} from ${previous.value}${series.unit ? ` ${series.unit}` : ""} to ${latest.value}${series.unit ? ` ${series.unit}` : ""}.`,
    hi: `${series.testName} ${previous.value}${series.unit ? ` ${series.unit}` : ""} se ${latest.value}${series.unit ? ` ${series.unit}` : ""} tak ${changeLabel}.`,
    hinglish: `${series.testName} ${previous.value}${series.unit ? ` ${series.unit}` : ""} se ${latest.value}${series.unit ? ` ${series.unit}` : ""} tak ${changeLabel}.`,
  });
}

export async function listStoredReportMetrics(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("report_metrics")
    .select("id, report_id, metric_name, metric_value, unit, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throwStoredMetricsApiError(error);
    throw new Error(error.message);
  }

  return normalizeStoredMetricRows(data || []);
}

export async function listStoredReportMetricsSafely(supabase: SupabaseClient) {
  try {
    return await listStoredReportMetrics(supabase);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return [] as StoredMetricRow[];
    }

    throw error;
  }
}

export async function syncStoredMetricsForReportsSafely(
  supabase: SupabaseClient,
  reports: Array<
    Pick<ReportRecord, "id" | "analysis_json" | "insights_json" | "created_at" | "updated_at">
  >,
  existingRows: StoredMetricRow[] = []
) {
  const metricRowsByReportId = new Map<string, StoredMetricRow[]>();

  for (const row of existingRows) {
    const rows = metricRowsByReportId.get(row.report_id) || [];
    rows.push(row);
    metricRowsByReportId.set(row.report_id, rows);
  }

  const reportsNeedingSync = reports.filter((report) =>
    shouldSyncStoredMetricsForReport(report, metricRowsByReportId)
  );

  if (reportsNeedingSync.length === 0) {
    return existingRows;
  }

  try {
    for (const report of reportsNeedingSync) {
      await replaceStoredMetricsForReport(supabase, report);
    }

    return await listStoredReportMetricsSafely(supabase);
  } catch {
    return existingRows;
  }
}

export function mergeStoredMetricsWithDerivedReportMetrics(
  metricRows: StoredMetricRow[],
  reports: Array<
    Pick<ReportRecord, "id" | "analysis_json" | "insights_json" | "created_at" | "updated_at">
  >
) {
  const mergedRows = [...metricRows];
  const metricKeysByReportId = new Map<string, Set<string>>();

  for (const row of metricRows) {
    const keys = metricKeysByReportId.get(row.report_id) || new Set<string>();
    keys.add(buildStoredMetricSeedKey(row.metric_name, row.unit));
    metricKeysByReportId.set(row.report_id, keys);
  }

  for (const report of reports) {
    const existingKeys = metricKeysByReportId.get(report.id) || new Set<string>();

    for (const row of buildDerivedStoredMetricsForReport(report)) {
      const metricKey = buildStoredMetricSeedKey(row.metric_name, row.unit);

      if (existingKeys.has(metricKey)) {
        continue;
      }

      existingKeys.add(metricKey);
      mergedRows.push(row);
    }

    metricKeysByReportId.set(report.id, existingKeys);
  }

  return mergedRows;
}

export function buildStoredMetricSeries(
  metricRows: StoredMetricRow[],
  reports: ReportRecord[]
) {
  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const selectedPoints = new Map<
    string,
    {
      point: TrendDataPoint;
      score: number;
      insertedAt: string;
      variantKey: TrackedMetricVariant;
      label: string;
    }
  >();

  for (const row of metricRows) {
    const resolvedMetric = resolveTrackedMetric(row.metric_name);

    if (!resolvedMetric) {
      continue;
    }

    const report = reportsById.get(row.report_id);
    const point: TrendDataPoint = {
      reportId: row.report_id,
      reportLabel: report?.title || report?.original_filename || "Report",
      createdAt: report?.created_at || row.created_at,
      metricKey: resolvedMetric.metricKey,
      testName: resolvedMetric.label,
      value: row.metric_value,
      unit: row.unit,
      status: "unknown" satisfies TestStatus,
    };
    const selectionKey = `${resolvedMetric.metricKey}:${resolvedMetric.variantKey}:${row.report_id}`;
    const existing = selectedPoints.get(selectionKey);

    if (
      !existing ||
      resolvedMetric.score > existing.score ||
      (resolvedMetric.score === existing.score &&
        new Date(row.created_at).getTime() > new Date(existing.insertedAt).getTime())
    ) {
      selectedPoints.set(selectionKey, {
        point,
        score: resolvedMetric.score,
        insertedAt: row.created_at,
        variantKey: resolvedMetric.variantKey,
        label: resolvedMetric.label,
      });
    }
  }

  const grouped = new Map<
    TrackedMetricKey,
    Map<
      TrackedMetricVariant,
      {
        points: TrendDataPoint[];
        score: number;
        label: string;
      }
    >
  >();

  for (const { point, score, variantKey, label } of selectedPoints.values()) {
    const variants = grouped.get(point.metricKey as TrackedMetricKey) || new Map();
    const variantEntry = variants.get(variantKey) || {
      points: [],
      score: 0,
      label,
    };
    variantEntry.points.push(point);
    variantEntry.score += score;
    variants.set(variantKey, variantEntry);
    grouped.set(point.metricKey as TrackedMetricKey, variants);
  }

  return TRACKED_METRICS.map<MetricSeries | null>(({ key, label }) => {
    const variants = grouped.get(key);

    if (!variants || variants.size === 0) {
      return null;
    }

    const selectedVariant = Array.from(variants.entries())
      .map(([variantKey, variant]) => {
        const points = [...variant.points].sort(
          (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        );
        const preferredUnit = pickPreferredUnit(points);
        const normalizedPoints = (
          preferredUnit
            ? points.filter((point) => !point.unit || point.unit === preferredUnit)
            : points
        ).map((point) => ({
          ...point,
          testName: variant.label,
          unit: preferredUnit || point.unit,
        }));

        return {
          variantKey,
          score: variant.score,
          label: variant.label,
          preferredUnit,
          normalizedPoints,
        };
      })
      .filter((variant) => variant.normalizedPoints.length > 0)
      .sort((left, right) => {
        if (right.normalizedPoints.length !== left.normalizedPoints.length) {
          return right.normalizedPoints.length - left.normalizedPoints.length;
        }

        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return (
          getVariantPriority(right.variantKey) - getVariantPriority(left.variantKey)
        );
      })[0];

    if (!selectedVariant) {
      return null;
    }

    return {
      metricKey: key,
      testName: selectedVariant.label || label,
      unit: selectedVariant.preferredUnit,
      points: selectedVariant.normalizedPoints,
    } satisfies MetricSeries;
  }).filter((series): series is MetricSeries => Boolean(series));
}

export function buildStoredTrendInsights(
  metricSeries: MetricSeries[],
  language: OutputLanguage = "en"
) {
  return metricSeries
    .filter((series) => series.points.length >= 2)
    .map((series) => {
      const latest = series.points[series.points.length - 1];
      const previous = series.points[series.points.length - 2];
      const { direction, delta } = calculateDirection(latest.value, previous.value);
      const deltaPercent =
        previous.value !== 0
          ? Number((((latest.value - previous.value) / previous.value) * 100).toFixed(1))
          : null;

      return {
        metricKey: series.metricKey,
        testName: series.testName,
        unit: series.unit,
        latestValue: latest.value,
        previousValue: previous.value,
        direction,
        delta,
        deltaPercent,
        summary: buildTrendSummary(series, previous, latest, direction, language),
        status: latest.status,
      } satisfies TrendInsight;
    })
    .sort((left, right) => {
      const leftIndex = TRACKED_METRICS.findIndex((item) => item.key === left.metricKey);
      const rightIndex = TRACKED_METRICS.findIndex((item) => item.key === right.metricKey);
      return leftIndex - rightIndex;
    });
}
