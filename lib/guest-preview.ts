import type {
  HealthInsights,
  MedicalAnalysis,
  OutputLanguage,
} from "@/lib/report-types";

export const GUEST_PREVIEW_LIMIT_COOKIE = "medscan_free_preview_used";
export const GUEST_PREVIEW_LIMIT_STORAGE_KEY = "medscan_free_preview_used";
export const GUEST_PREVIEW_LIMIT_MAX_AGE = 60 * 60 * 24 * 30;

export type GuestReportPreview = {
  id: string;
  filename: string;
  createdAt: string;
  extractedText: string;
  analysis: MedicalAnalysis;
  insights: HealthInsights;
};

export type GuestReportPreviewResponse = {
  success: true;
  language: OutputLanguage;
  preview: GuestReportPreview;
};
