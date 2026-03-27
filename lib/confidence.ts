import { chooseLocalizedText } from "@/lib/localization";
import type {
  ConfidenceLevel,
  ConfidenceScore,
  HealthInsights,
  MedicalAnalysis,
  OutputLanguage,
  ReportConfidenceSummary,
  ReportRecord,
} from "@/lib/report-types";

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 80) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

function buildConfidenceScore(score: number, reasons: string[]): ConfidenceScore {
  const boundedScore = clampScore(score);

  return {
    level: levelFromScore(boundedScore),
    score: boundedScore,
    reasons: reasons.filter(Boolean),
  };
}

function looksLikeFallbackAnalysis(analysis: MedicalAnalysis | null | undefined) {
  const plainLanguage = analysis?.plainLanguageSummary?.toLowerCase() || "";
  const overview = analysis?.overview?.toLowerCase() || "";

  return plainLanguage.includes("fallback parser") || overview.includes("fallback summary");
}

export function buildOcrConfidence(
  report: Pick<ReportRecord, "id" | "ocr_status" | "ocr_engine" | "ocr_text">,
  language: OutputLanguage = "en"
) {
  const engine = report.ocr_engine || "unknown";
  const text = report.ocr_text || "";
  const reasons: string[] = [];
  let score = 30;

  if (report.ocr_status === "completed" && text.trim()) {
    score += 25;
    reasons.push(
      chooseLocalizedText(language, {
        en: "Readable OCR text is available for this report.",
        hi: "Is report ke liye readable OCR text available hai.",
        hinglish: "Is report ke liye readable OCR text available hai.",
      })
    );
  }

  if (/openai|gemini/i.test(engine)) {
    score += 28;
    reasons.push(
      chooseLocalizedText(language, {
        en: "AI vision OCR was used for extraction.",
        hi: "Extraction ke liye AI vision OCR use hua.",
        hinglish: "Extraction ke liye AI vision OCR use hua.",
      })
    );
  } else if (/tesseract/i.test(engine)) {
    score += 16;
    reasons.push(
      chooseLocalizedText(language, {
        en: "Tesseract OCR was used as the text extractor.",
        hi: "Text extraction ke liye Tesseract OCR use hua.",
        hinglish: "Text extraction ke liye Tesseract OCR use hua.",
      })
    );
  }

  if (/heuristic-medical-cleanup/i.test(engine)) {
    score -= 8;
    reasons.push(
      chooseLocalizedText(language, {
        en: "Heuristic cleanup was needed after OCR, which lowers certainty slightly.",
        hi: "OCR ke baad heuristic cleanup ki zarurat padi, isliye certainty thodi kam hai.",
        hinglish: "OCR ke baad heuristic cleanup ki zarurat padi, isliye certainty thodi kam hai.",
      })
    );
  }

  if (/fallback-message/i.test(engine) || text.includes("OCR could not confidently extract")) {
    score = 18;
    reasons.push(
      chooseLocalizedText(language, {
        en: "The OCR system could not confidently read the uploaded document.",
        hi: "OCR system uploaded document ko confidently read nahi kar saka.",
        hinglish: "OCR system uploaded document ko confidently read nahi kar saka.",
      })
    );
  }

  if (text.length > 1200) {
    score += 8;
  } else if (text.length < 220) {
    score -= 10;
    reasons.push(
      chooseLocalizedText(language, {
        en: "Very little text was extracted from the file.",
        hi: "File se bahut kam text extract hua.",
        hinglish: "File se bahut kam text extract hua.",
      })
    );
  }

  return buildConfidenceScore(score, reasons);
}

export function buildAnalysisConfidence(payload: {
  analysis: MedicalAnalysis | null | undefined;
  insights: HealthInsights | null | undefined;
  ocrConfidence: ConfidenceScore;
  language?: OutputLanguage;
}) {
  const language = payload.language || "en";
  const analysis = payload.analysis;
  const insights = payload.insights;
  const reasons: string[] = [];
  let score = 25 + Math.round(payload.ocrConfidence.score * 0.22);

  if (analysis) {
    score += 20;
    reasons.push(
      chooseLocalizedText(language, {
        en: "Structured AI analysis is available for this report.",
        hi: "Is report ke liye structured AI analysis available hai.",
        hinglish: "Is report ke liye structured AI analysis available hai.",
      })
    );
  } else {
    return buildConfidenceScore(score - 10, reasons);
  }

  if (analysis.overview?.trim()) {
    score += 8;
  }

  if (analysis.plainLanguageSummary?.trim()) {
    score += 10;
  }

  if ((analysis.testValues?.length || 0) > 0) {
    score += Math.min(18, (analysis.testValues?.length || 0) * 3);
    reasons.push(
      chooseLocalizedText(language, {
        en: "Structured test values were extracted and interpreted.",
        hi: "Structured test values extract aur interpret kiye gaye.",
        hinglish: "Structured test values extract aur interpret kiye gaye.",
      })
    );
  }

  if ((analysis.medicines?.length || 0) > 0) {
    score += Math.min(12, (analysis.medicines?.length || 0) * 2);
  }

  if ((analysis.possibleConditions?.length || 0) > 0) {
    score += 6;
  }

  if (looksLikeFallbackAnalysis(analysis)) {
    score -= 18;
    reasons.push(
      chooseLocalizedText(language, {
        en: "Fallback analysis language was detected, so the AI interpretation may be less precise.",
        hi: "Fallback analysis detect hua, isliye AI interpretation kam precise ho sakta hai.",
        hinglish: "Fallback analysis detect hua, isliye AI interpretation kam precise ho sakta hai.",
      })
    );
  }

  if (insights?.testEvaluations?.length) {
    score += 8;
  }

  if (insights?.doctorRecommendations?.length || insights?.emergencyAssessment) {
    score += 5;
  }

  if (payload.ocrConfidence.level === "low") {
    score -= 12;
    reasons.push(
      chooseLocalizedText(language, {
        en: "Low OCR certainty reduces confidence in downstream AI interpretation.",
        hi: "Low OCR certainty ki wajah se downstream AI interpretation par confidence kam hota hai.",
        hinglish: "Low OCR certainty ki wajah se downstream AI interpretation par confidence kam hota hai.",
      })
    );
  }

  return buildConfidenceScore(score, reasons);
}

export function buildReportConfidenceSummary(payload: {
  report: Pick<ReportRecord, "id" | "ocr_status" | "ocr_engine" | "ocr_text" | "analysis_json" | "insights_json">;
  language?: OutputLanguage;
}): ReportConfidenceSummary {
  const language = payload.language || payload.report.insights_json?.preferredLanguage || "en";
  const ocr = buildOcrConfidence(payload.report, language);
  const analysis = buildAnalysisConfidence({
    analysis: payload.report.analysis_json,
    insights: payload.report.insights_json,
    ocrConfidence: ocr,
    language,
  });
  const overallScore = Math.round(ocr.score * 0.45 + analysis.score * 0.55);

  return {
    reportId: payload.report.id,
    ocr,
    analysis,
    overall: buildConfidenceScore(overallScore, [
      chooseLocalizedText(language, {
        en: "Overall confidence combines OCR quality and analysis completeness.",
        hi: "Overall confidence OCR quality aur analysis completeness ko combine karta hai.",
        hinglish: "Overall confidence OCR quality aur analysis completeness ko combine karta hai.",
      }),
    ]),
  };
}
