import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { generateChatReply } from "@/lib/openai-service";
import { ensureReportInsights } from "@/lib/report-pipeline";
import {
  ensureUserProfile,
  getReportDetail,
  listReportsForUser,
  saveChatExchange,
} from "@/lib/reports";
import { requireAuthenticatedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const reportId = body?.reportId?.trim();
    const question = body?.message?.trim();

    if (!reportId) {
      return jsonError("reportId is required.");
    }

    if (!question) {
      return jsonError("message is required.");
    }

    const { user, dataClient } = await requireAuthenticatedUser(request);
    await ensureUserProfile(dataClient, user);

    await ensureReportInsights(dataClient, reportId, user.id, false);
    const report = await getReportDetail(dataClient, reportId);
    const reportHistory = (await listReportsForUser(dataClient))
      .filter((item) => item.id !== reportId)
      .slice(0, 6);
    const chatHistory = report.chat_messages
      .slice(-8)
      .map((message) => `${message.role.toUpperCase()}: ${message.message}`)
      .join("\n");
    const reply = await generateChatReply({
      question,
      userId: user.id,
      language: report.insights_json?.preferredLanguage || "en",
      currentReport: {
        title: report.title || report.original_filename,
        createdAt: report.created_at,
        ocrText: report.ocr_text,
        analysis: report.analysis_json,
        insights: report.insights_json,
        chatHistory,
      },
      history: reportHistory.map((item) => ({
        title: item.title || item.original_filename,
        createdAt: item.created_at,
        analysis: item.analysis_json,
        insights: item.insights_json,
      })),
    });
    const messages = await saveChatExchange(dataClient, {
      reportId,
      userId: user.id,
      userMessage: question,
      assistantMessage: reply,
    });

    return NextResponse.json({
      message: "Chat response generated.",
      reply,
      messages,
    });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Chat request failed."),
      getErrorStatus(error, 500)
    );
  }
}
