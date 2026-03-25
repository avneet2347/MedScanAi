import { NextResponse } from "next/server";
import { getErrorMessage, getErrorStatus, jsonError } from "@/lib/api-utils";
import { normalizeOutputLanguage } from "@/lib/localization";
import { generateChatReply } from "@/lib/openai-service";
import type { HealthInsights, MedicalAnalysis } from "@/lib/report-types";

export const runtime = "nodejs";

type LightweightReport = {
  title?: string | null;
  createdAt?: string;
  analysis?: MedicalAnalysis | null;
  insights?: HealthInsights | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          question?: string;
          language?: string;
          currentReport?: {
            title?: string | null;
            createdAt?: string;
            ocrText?: string | null;
            analysis?: MedicalAnalysis | null;
            insights?: HealthInsights | null;
            chatHistory?: string;
          };
          history?: LightweightReport[];
        }
      | null;

    const question = body?.question?.trim();

    if (!question) {
      return jsonError("question is required.");
    }

    if (!body?.currentReport) {
      return jsonError("currentReport is required.");
    }

    const language = normalizeOutputLanguage(body.language);
    const reply = await generateChatReply({
      question,
      language,
      currentReport: {
        title: body.currentReport.title,
        createdAt: body.currentReport.createdAt,
        ocrText: body.currentReport.ocrText,
        analysis: body.currentReport.analysis,
        insights: body.currentReport.insights,
        chatHistory: body.currentReport.chatHistory,
      },
      history:
        body.history?.map((item) => ({
          title: item.title,
          createdAt: item.createdAt,
          analysis: item.analysis,
          insights: item.insights,
        })) || [],
    });

    return NextResponse.json({ reply });
  } catch (error) {
    return jsonError(
      getErrorMessage(error, "Chat request failed."),
      getErrorStatus(error, 500)
    );
  }
}
