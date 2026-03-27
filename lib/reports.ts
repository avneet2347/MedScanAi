import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-utils";
import type {
  ChatMessageRecord,
  HealthInsights,
  MedicalAnalysis,
  OcrResult,
  ReportDetail,
  ReportRecord,
} from "@/lib/report-types";
import { listHealthAlertsForReport } from "@/lib/health-alerts";

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
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

const REPORT_STORAGE_NOT_READY_MESSAGE =
  "Report storage is not initialized for this Supabase project yet. Apply the SQL in supabase/schema.sql to enable uploads, OCR, insights, and history.";

const CHAT_STORAGE_NOT_READY_MESSAGE =
  "Chat history storage is not initialized for this Supabase project yet. Apply the SQL in supabase/schema.sql to enable report conversations.";

const REPORT_SCHEMA_NOT_READY_MESSAGE =
  "Supabase table \"medical_reports\" is missing required columns for this app. Re-run supabase/schema.sql in the Supabase SQL Editor to repair the report schema.";

const CHAT_SCHEMA_NOT_READY_MESSAGE =
  "Supabase table \"chat_messages\" is missing required columns for this app. Re-run supabase/schema.sql in the Supabase SQL Editor to repair the chat schema.";

function throwMissingTableApiError(
  error: SupabaseLikeError | null | undefined,
  tableName: string,
  message: string
) {
  if (isMissingSupabaseTableError(error, tableName)) {
    throw new ApiError(message, 503);
  }
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

function throwMissingColumnApiError(
  error: SupabaseLikeError | null | undefined,
  tableName: string,
  message: string
) {
  if (isMissingSupabaseColumnError(error, tableName)) {
    throw new ApiError(message, 503);
  }
}

export type UserProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
};

export function buildUserProfileRecord(
  user: User,
  fullName?: string | null
): UserProfileRecord {
  return {
    id: user.id,
    email: user.email ?? "",
    full_name:
      fullName ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
  };
}

export function isMissingProfilesTableError(error?: SupabaseLikeError | null) {
  return isMissingSupabaseTableError(error, "profiles");
}

export function isMissingMedicalReportsTableError(error?: SupabaseLikeError | null) {
  return isMissingSupabaseTableError(error, "medical_reports");
}

export function isMissingChatMessagesTableError(error?: SupabaseLikeError | null) {
  return isMissingSupabaseTableError(error, "chat_messages");
}

export async function ensureUserProfile(
  supabase: SupabaseClient,
  user: User,
  fullName?: string | null
) {
  const payload = buildUserProfileRecord(user, fullName);

  const { error } = await supabase.from("profiles").upsert(payload, {
    onConflict: "id",
  });

  if (error && !isMissingProfilesTableError(error)) {
    throw new Error(error.message);
  }

  return payload;
}

export async function createReportRecord(
  supabase: SupabaseClient,
  payload: {
    user_id: string;
    title: string | null;
    original_filename: string;
    mime_type: string;
    file_size: number;
    storage_bucket: string;
    storage_path: string;
  }
) {
  const { data, error } = await supabase
    .from("medical_reports")
    .insert({
      ...payload,
      report_status: "uploaded",
      ocr_status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throwMissingTableApiError(error, "medical_reports", REPORT_STORAGE_NOT_READY_MESSAGE);
    throwMissingColumnApiError(error, "medical_reports", REPORT_SCHEMA_NOT_READY_MESSAGE);
    throw new Error(error?.message || "Failed to create report record.");
  }

  return data as ReportRecord;
}

export async function updateReportState(
  supabase: SupabaseClient,
  reportId: string,
  payload: Partial<Pick<ReportRecord, "ocr_status" | "report_status" | "ocr_text" | "ocr_engine">>
) {
  const { data, error } = await supabase
    .from("medical_reports")
    .update(payload)
    .eq("id", reportId)
    .select("*")
    .single();

  if (error || !data) {
    throwMissingTableApiError(error, "medical_reports", REPORT_STORAGE_NOT_READY_MESSAGE);
    throwMissingColumnApiError(error, "medical_reports", REPORT_SCHEMA_NOT_READY_MESSAGE);
    throw new Error(error?.message || "Failed to update report state.");
  }

  return data as ReportRecord;
}

export async function getReportById(supabase: SupabaseClient, reportId: string) {
  const { data, error } = await supabase
    .from("medical_reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (error || !data) {
    throwMissingTableApiError(error, "medical_reports", REPORT_STORAGE_NOT_READY_MESSAGE);
    throwMissingColumnApiError(error, "medical_reports", REPORT_SCHEMA_NOT_READY_MESSAGE);
    throw new ApiError(error?.message || "Report not found.", 404);
  }

  return data as ReportRecord;
}

export async function getReportDetail(supabase: SupabaseClient, reportId: string) {
  const report = await getReportById(supabase, reportId);
  const healthAlertsPromise = listHealthAlertsForReport(supabase, reportId);
  const { data: chatMessages, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingChatMessagesTableError(error)) {
      const healthAlerts = await healthAlertsPromise;
      return {
        ...report,
        chat_messages: [],
        health_alerts: healthAlerts,
      } as ReportDetail;
    }

    throwMissingColumnApiError(error, "chat_messages", CHAT_SCHEMA_NOT_READY_MESSAGE);

    throw new Error(error.message);
  }

  const healthAlerts = await healthAlertsPromise;

  return {
    ...report,
    chat_messages: (chatMessages || []) as ChatMessageRecord[],
    health_alerts: healthAlerts,
  } as ReportDetail;
}

export async function listReportsForUser(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("medical_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingMedicalReportsTableError(error)) {
      return [];
    }

    throwMissingColumnApiError(error, "medical_reports", REPORT_SCHEMA_NOT_READY_MESSAGE);

    throw new Error(error.message);
  }

  return (data || []) as ReportRecord[];
}

export async function saveOcrResult(
  supabase: SupabaseClient,
  reportId: string,
  ocr: OcrResult
) {
  const { data, error } = await supabase
    .from("medical_reports")
    .update({
      ocr_text: ocr.text,
      ocr_engine: ocr.engine,
      ocr_status: "completed",
      report_status: "ocr_complete",
    })
    .eq("id", reportId)
    .select("*")
    .single();

  if (error || !data) {
    throwMissingTableApiError(error, "medical_reports", REPORT_STORAGE_NOT_READY_MESSAGE);
    throwMissingColumnApiError(error, "medical_reports", REPORT_SCHEMA_NOT_READY_MESSAGE);
    throw new Error(error?.message || "Failed to save OCR result.");
  }

  return data as ReportRecord;
}

export async function saveAnalysis(
  supabase: SupabaseClient,
  reportId: string,
  analysis: MedicalAnalysis
) {
  const { data, error } = await supabase
    .from("medical_reports")
    .update({
      analysis_json: analysis,
      report_status: "analysis_complete",
    })
    .eq("id", reportId)
    .select("*")
    .single();

  if (error || !data) {
    throwMissingTableApiError(error, "medical_reports", REPORT_STORAGE_NOT_READY_MESSAGE);
    throwMissingColumnApiError(error, "medical_reports", REPORT_SCHEMA_NOT_READY_MESSAGE);
    throw new Error(error?.message || "Failed to save analysis.");
  }

  return data as ReportRecord;
}

export async function saveInsights(
  supabase: SupabaseClient,
  reportId: string,
  insights: HealthInsights
) {
  const { data, error } = await supabase
    .from("medical_reports")
    .update({
      insights_json: insights,
      report_status: "ready",
    })
    .eq("id", reportId)
    .select("*")
    .single();

  if (error || !data) {
    throwMissingTableApiError(error, "medical_reports", REPORT_STORAGE_NOT_READY_MESSAGE);
    throwMissingColumnApiError(error, "medical_reports", REPORT_SCHEMA_NOT_READY_MESSAGE);
    throw new Error(error?.message || "Failed to save insights.");
  }

  return data as ReportRecord;
}

export async function saveChatExchange(
  supabase: SupabaseClient,
  payload: {
    reportId: string;
    userId: string;
    userMessage: string;
    assistantMessage: string;
  }
) {
  const rows = [
    {
      report_id: payload.reportId,
      user_id: payload.userId,
      role: "user",
      message: payload.userMessage,
      response_json: null,
    },
    {
      report_id: payload.reportId,
      user_id: payload.userId,
      role: "assistant",
      message: payload.assistantMessage,
      response_json: null,
    },
  ];

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(rows)
    .select("*");

  if (error) {
    throwMissingTableApiError(error, "chat_messages", CHAT_STORAGE_NOT_READY_MESSAGE);
    throwMissingColumnApiError(error, "chat_messages", CHAT_SCHEMA_NOT_READY_MESSAGE);
    throw new Error(error.message);
  }

  return (data || []) as ChatMessageRecord[];
}
