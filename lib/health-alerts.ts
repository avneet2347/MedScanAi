import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import { chooseLocalizedText } from "@/lib/localization";
import type {
  HealthInsights,
  OutputLanguage,
  StoredHealthAlertRecord,
  StoredHealthAlertSeverity,
  TestEvaluation,
} from "@/lib/report-types";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

type StoredHealthAlertInsert = {
  report_id: string;
  alert_type: StoredHealthAlertSeverity;
  message: string;
};

const HEALTH_ALERTS_NOT_READY_MESSAGE =
  "Emergency health alerts are not initialized for this Supabase project yet. Apply the SQL in supabase/schema.sql to enable health alert storage.";

const severityRank: Record<StoredHealthAlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

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

function throwHealthAlertsApiError(error: SupabaseLikeError | null | undefined) {
  if (
    isMissingSupabaseTableError(error, "health_alerts") ||
    isMissingSupabaseColumnError(error, "health_alerts")
  ) {
    throw new ApiError(HEALTH_ALERTS_NOT_READY_MESSAGE, 503);
  }
}

function normalizeHealthAlertRecord(record: Record<string, unknown>) {
  return {
    id: String(record.id || ""),
    report_id: String(record.report_id || ""),
    alert_type: (record.alert_type || "medium") as StoredHealthAlertSeverity,
    message: String(record.message || ""),
    created_at: String(record.created_at || ""),
  } satisfies StoredHealthAlertRecord;
}

function mapRiskLevelToAlertSeverity(
  severity: "low" | "moderate" | "high" | "critical"
): StoredHealthAlertSeverity {
  return severity === "moderate" ? "medium" : severity;
}

function buildEvaluationAlertMessage(
  evaluation: TestEvaluation,
  language: OutputLanguage
) {
  const valueLabel = [evaluation.value, evaluation.unit].filter(Boolean).join(" ").trim();
  const directionLabel =
    evaluation.status === "low"
      ? chooseLocalizedText(language, {
          en: "very low",
          hi: "bahut kam",
          hinglish: "bahut low",
        })
      : chooseLocalizedText(language, {
          en: "very high",
          hi: "bahut zyada",
          hinglish: "bahut high",
        });
  const actionLabel =
    evaluation.severity === "critical"
      ? chooseLocalizedText(language, {
          en: "Seek urgent medical review immediately if symptoms are present.",
          hi: "Agar symptoms hon to turant urgent medical review lein.",
          hinglish: "Agar symptoms hon to turant urgent medical review lein.",
        })
      : evaluation.severity === "high"
        ? chooseLocalizedText(language, {
            en: "Arrange prompt clinician follow-up.",
            hi: "Jaldi clinician follow-up arrange karein.",
            hinglish: "Jaldi clinician follow-up arrange karein.",
          })
        : chooseLocalizedText(language, {
            en: "Review this with a clinician soon.",
            hi: "Isko clinician ke sath jaldi review karein.",
            hinglish: "Isko clinician ke sath jaldi review karein.",
          });

  return chooseLocalizedText(language, {
    en: `${evaluation.name} ${valueLabel ? `(${valueLabel}) ` : ""}looks ${directionLabel}. ${evaluation.explanation} ${actionLabel}`,
    hi: `${evaluation.name}${valueLabel ? ` (${valueLabel})` : ""} ${directionLabel} lag raha hai. ${evaluation.explanation} ${actionLabel}`,
    hinglish: `${evaluation.name}${valueLabel ? ` (${valueLabel})` : ""} ${directionLabel} lag raha hai. ${evaluation.explanation} ${actionLabel}`,
  });
}

function buildAssessmentAlertMessage(insights: HealthInsights, language: OutputLanguage) {
  const assessment = insights.emergencyAssessment;

  if (!assessment || assessment.severity === "low") {
    return null;
  }

  const testsLabel =
    assessment.criticalTests.length > 0
      ? chooseLocalizedText(language, {
          en: ` Flagged tests: ${assessment.criticalTests.join(", ")}.`,
          hi: ` Flagged tests: ${assessment.criticalTests.join(", ")}.`,
          hinglish: ` Flagged tests: ${assessment.criticalTests.join(", ")}.`,
        })
      : "";

  return {
    report_id: "",
    alert_type: mapRiskLevelToAlertSeverity(assessment.severity),
    message: `${assessment.headline}. ${assessment.action}${testsLabel}`.trim(),
  } satisfies StoredHealthAlertInsert;
}

function dedupeHealthAlerts(alerts: StoredHealthAlertInsert[]) {
  const seen = new Set<string>();

  return alerts.filter((alert) => {
    const key = `${alert.alert_type}:${alert.message}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildEmergencyRiskAlerts(
  insights: HealthInsights,
  language: OutputLanguage = insights.preferredLanguage || "en"
) {
  const alerts: StoredHealthAlertInsert[] = [];
  const assessmentAlert = buildAssessmentAlertMessage(insights, language);

  if (assessmentAlert) {
    alerts.push(assessmentAlert);
  }

  const evaluationAlerts = (insights.testEvaluations || [])
    .filter((evaluation) => evaluation.isAbnormal && evaluation.severity !== "low")
    .sort((left, right) => {
      const leftSeverity = severityRank[mapRiskLevelToAlertSeverity(left.severity)];
      const rightSeverity = severityRank[mapRiskLevelToAlertSeverity(right.severity)];
      return rightSeverity - leftSeverity;
    })
    .slice(0, 4)
    .map((evaluation) => ({
      report_id: "",
      alert_type: mapRiskLevelToAlertSeverity(evaluation.severity),
      message: buildEvaluationAlertMessage(evaluation, language),
    }));

  alerts.push(...evaluationAlerts);

  return dedupeHealthAlerts(alerts);
}

export async function listHealthAlertsForReport(
  supabase: SupabaseClient,
  reportId: string
) {
  const { data, error } = await supabase
    .from("health_alerts")
    .select("id, report_id, alert_type, message, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });

  if (error) {
    if (
      isMissingSupabaseTableError(error, "health_alerts") ||
      isMissingSupabaseColumnError(error, "health_alerts")
    ) {
      return [] as StoredHealthAlertRecord[];
    }

    throw new Error(error.message);
  }

  return (data || []).map((record) =>
    normalizeHealthAlertRecord(record as Record<string, unknown>)
  );
}

export async function replaceHealthAlertsForReport(
  supabase: SupabaseClient,
  reportId: string,
  alerts: StoredHealthAlertInsert[]
) {
  const { error: deleteError } = await supabase
    .from("health_alerts")
    .delete()
    .eq("report_id", reportId);

  if (deleteError) {
    throwHealthAlertsApiError(deleteError);
    throw new Error(deleteError.message);
  }

  if (alerts.length === 0) {
    return [] as StoredHealthAlertRecord[];
  }

  const { data, error } = await supabase
    .from("health_alerts")
    .insert(
      alerts.map((alert) => ({
        report_id: reportId,
        alert_type: alert.alert_type,
        message: alert.message,
      }))
    )
    .select("id, report_id, alert_type, message, created_at");

  if (error) {
    throwHealthAlertsApiError(error);
    throw new Error(error.message);
  }

  return (data || [])
    .map((record) => normalizeHealthAlertRecord(record as Record<string, unknown>))
    .sort(
      (left, right) =>
        severityRank[right.alert_type] - severityRank[left.alert_type] ||
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
}

export async function syncReportHealthAlerts(
  supabase: SupabaseClient,
  reportId: string,
  insights: HealthInsights,
  language: OutputLanguage = insights.preferredLanguage || "en"
) {
  const alerts = buildEmergencyRiskAlerts(insights, language);
  return replaceHealthAlertsForReport(supabase, reportId, alerts);
}

export async function syncReportHealthAlertsSafely(
  supabase: SupabaseClient,
  reportId: string,
  insights: HealthInsights,
  language: OutputLanguage = insights.preferredLanguage || "en"
) {
  try {
    return await syncReportHealthAlerts(supabase, reportId, insights, language);
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return [] as StoredHealthAlertRecord[];
    }

    return [] as StoredHealthAlertRecord[];
  }
}
