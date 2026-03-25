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

export async function ensureUserProfile(
  supabase: SupabaseClient,
  user: User,
  fullName?: string | null
) {
  const payload = {
    id: user.id,
    email: user.email ?? "",
    full_name:
      fullName ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
  };

  const { error } = await supabase.from("profiles").upsert(payload, {
    onConflict: "id",
  });

  if (error) {
    throw new Error(error.message);
  }
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
    throw new ApiError(error?.message || "Report not found.", 404);
  }

  return data as ReportRecord;
}

export async function getReportDetail(supabase: SupabaseClient, reportId: string) {
  const { data, error } = await supabase
    .from("medical_reports")
    .select("*, chat_messages(*)")
    .eq("id", reportId)
    .single();

  if (error || !data) {
    throw new ApiError(error?.message || "Report not found.", 404);
  }

  return {
    ...data,
    chat_messages: ((data.chat_messages as ChatMessageRecord[] | null) || []).sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    ),
  } as ReportDetail;
}

export async function listReportsForUser(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("medical_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
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
    throw new Error(error.message);
  }

  return (data || []) as ChatMessageRecord[];
}
