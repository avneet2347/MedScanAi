import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import { buildReportConfidenceSummary } from "@/lib/confidence";
import type {
  OutputLanguage,
  ReportConfidenceSummary,
  ReportRecord,
  StoredAiConfidenceRecord,
} from "@/lib/report-types";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

const AI_CONFIDENCE_NOT_READY_MESSAGE =
  "AI confidence storage is not initialized for this Supabase project yet. Apply the SQL in supabase/schema.sql to enable confidence metadata.";

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

function throwAiConfidenceApiError(error: SupabaseLikeError | null | undefined) {
  if (
    isMissingSupabaseTableError(error, "ai_confidence") ||
    isMissingSupabaseColumnError(error, "ai_confidence")
  ) {
    throw new ApiError(AI_CONFIDENCE_NOT_READY_MESSAGE, 503);
  }
}

function normalizeAiConfidenceRecord(record: Record<string, unknown>) {
  return {
    id: String(record.id || ""),
    report_id: String(record.report_id || ""),
    ocr_confidence: Number(record.ocr_confidence || 0),
    ai_confidence: Number(record.ai_confidence || 0),
    created_at: String(record.created_at || ""),
  } satisfies StoredAiConfidenceRecord;
}

function confidencePayload(confidence: ReportConfidenceSummary) {
  return {
    ocr_confidence: confidence.ocr.score,
    ai_confidence: confidence.analysis.score,
  };
}

export async function getLatestAiConfidenceForReport(
  supabase: SupabaseClient,
  reportId: string
) {
  const { data, error } = await supabase
    .from("ai_confidence")
    .select("id, report_id, ocr_confidence, ai_confidence, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (
      isMissingSupabaseTableError(error, "ai_confidence") ||
      isMissingSupabaseColumnError(error, "ai_confidence")
    ) {
      return null;
    }

    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return normalizeAiConfidenceRecord(data as Record<string, unknown>);
}

async function insertAiConfidence(
  supabase: SupabaseClient,
  reportId: string,
  confidence: ReportConfidenceSummary
) {
  const { data, error } = await supabase
    .from("ai_confidence")
    .insert({
      report_id: reportId,
      ...confidencePayload(confidence),
    })
    .select("id, report_id, ocr_confidence, ai_confidence, created_at")
    .single();

  if (error || !data) {
    throwAiConfidenceApiError(error);
    throw new Error(error?.message || "Failed to store AI confidence metadata.");
  }

  return normalizeAiConfidenceRecord(data as Record<string, unknown>);
}

async function updateAiConfidence(
  supabase: SupabaseClient,
  confidenceId: string,
  confidence: ReportConfidenceSummary
) {
  const { data, error } = await supabase
    .from("ai_confidence")
    .update(confidencePayload(confidence))
    .eq("id", confidenceId)
    .select("id, report_id, ocr_confidence, ai_confidence, created_at")
    .single();

  if (error || !data) {
    throwAiConfidenceApiError(error);
    throw new Error(error?.message || "Failed to update AI confidence metadata.");
  }

  return normalizeAiConfidenceRecord(data as Record<string, unknown>);
}

export async function syncReportAiConfidence(
  supabase: SupabaseClient,
  report: Pick<
    ReportRecord,
    "id" | "ocr_status" | "ocr_engine" | "ocr_text" | "analysis_json" | "insights_json"
  >,
  language?: OutputLanguage
) {
  const confidence = buildReportConfidenceSummary({
    report,
    language,
  });
  const existing = await getLatestAiConfidenceForReport(supabase, report.id);
  const nextValues = confidencePayload(confidence);

  if (
    existing &&
    existing.ocr_confidence === nextValues.ocr_confidence &&
    existing.ai_confidence === nextValues.ai_confidence
  ) {
    return {
      confidence,
      storedConfidence: existing,
    };
  }

  const storedConfidence = existing
    ? await updateAiConfidence(supabase, existing.id, confidence)
    : await insertAiConfidence(supabase, report.id, confidence);

  return {
    confidence,
    storedConfidence,
  };
}

export async function syncReportAiConfidenceSafely(
  supabase: SupabaseClient,
  report: Pick<
    ReportRecord,
    "id" | "ocr_status" | "ocr_engine" | "ocr_text" | "analysis_json" | "insights_json"
  >,
  language?: OutputLanguage
) {
  const confidence = buildReportConfidenceSummary({
    report,
    language,
  });

  try {
    const storedConfidence = await syncReportAiConfidence(supabase, report, language);
    return storedConfidence;
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return {
        confidence,
        storedConfidence: null,
      };
    }

    return {
      confidence,
      storedConfidence: null,
    };
  }
}
