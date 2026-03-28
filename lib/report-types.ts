export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type OutputLanguage = "en" | "hi" | "hinglish";
export type ConfidenceLevel = "low" | "medium" | "high";
export type TestStatus =
  | "normal"
  | "high"
  | "low"
  | "borderline"
  | "abnormal"
  | "unknown";

export interface ConditionInsight {
  name: string;
  confidence: "low" | "medium" | "high";
  evidence: string;
  explanation: string;
}

export interface MedicineEntry {
  name: string;
  dosage: string;
  frequency: string;
  purpose: string;
  notes: string;
}

export interface TestValueEntry {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: TestStatus;
  explanation: string;
}

export interface TestEvaluation {
  name: string;
  metricKey: string;
  value: string;
  numericValue: number | null;
  unit: string;
  referenceRange: string;
  status: TestStatus;
  severity: RiskLevel;
  isAbnormal: boolean;
  explanation: string;
  normalRangeSummary: string;
}

export interface RiskPrediction {
  condition: string;
  probability: number;
  severity: RiskLevel;
  rationale: string[];
  preventiveSteps: string[];
  suggestedSpecialist: string;
}

export interface MedicineDetail {
  name: string;
  category: string;
  summary: string;
  uses: string[];
  commonSideEffects: string[];
  precautions: string[];
  interactionWarnings: string[];
  timingAdvice: string;
  source: "knowledge-base" | "heuristic";
}

export interface InteractionCheck {
  title: string;
  medicines: string[];
  severity: RiskLevel;
  explanation: string;
  recommendation: string;
}

export interface LifestyleRecommendation {
  title: string;
  category: "diet" | "activity" | "hydration" | "monitoring";
  details: string;
}

export interface MedicineReminder {
  medicineName: string;
  dosage: string;
  schedule: string;
  instructions: string;
}

export interface EmergencyAssessment {
  requiresUrgentCare: boolean;
  severity: RiskLevel;
  headline: string;
  action: string;
  criticalTests: string[];
}

export interface DoctorRecommendation {
  specialist: string;
  priority: RiskLevel;
  reason: string;
}

export interface AuthenticityProof {
  algorithm: string;
  issuedAt: string;
  documentHash: string;
  ocrHash: string;
  analysisHash: string;
  blockHash: string;
  verificationMessage: string;
}

export interface TrendDataPoint {
  reportId: string;
  reportLabel: string;
  createdAt: string;
  metricKey: string;
  testName: string;
  value: number;
  unit: string;
  status: TestStatus;
}

export interface TrendInsight {
  metricKey: string;
  testName: string;
  unit: string;
  latestValue: number;
  previousValue: number | null;
  direction: "up" | "down" | "stable" | "mixed";
  delta: number | null;
  deltaPercent: number | null;
  summary: string;
  status: TestStatus;
}

export interface MetricSeries {
  metricKey: string;
  testName: string;
  unit: string;
  points: TrendDataPoint[];
}

export interface ComparisonValue extends TrendDataPoint {
  differenceFromFirst: number | null;
  differenceFromPrevious: number | null;
  percentChangeFromFirst: number | null;
  percentChangeFromPrevious: number | null;
}

export interface ComparisonMetric {
  metricKey: string;
  testName: string;
  unit: string;
  units: string[];
  hasUnitMismatch: boolean;
  values: ComparisonValue[];
  direction: "up" | "down" | "stable" | "mixed";
  delta: number | null;
  deltaPercent: number | null;
  summary: string;
}

export interface ReportComparisonSummary {
  id: string;
  title: string;
  createdAt: string;
  reportStatus: string;
  overallRisk: RiskLevel | "unknown";
}

export interface ReportComparisonResult {
  reports: ReportComparisonSummary[];
  metrics: ComparisonMetric[];
}

export type AiComparisonDirection =
  | "improved"
  | "worsened"
  | "changed"
  | "stable"
  | "mixed"
  | "uncertain";

export type AiComparisonConfidence = "high" | "medium" | "low";

export interface AiComparisonValue {
  reportId: string;
  reportTitle: string;
  reportDate: string;
  value: string;
  note: string;
}

export interface AiComparisonDifference {
  id: string;
  label: string;
  direction: AiComparisonDirection;
  summary: string;
  healthImpact: string;
  confidence: AiComparisonConfidence;
  values: AiComparisonValue[];
}

export interface AiReportComparisonResult {
  reports: ReportComparisonSummary[];
  summary: string;
  healthImpact: string;
  keyDifferences: AiComparisonDifference[];
  notes: string[];
  followUpQuestions: string[];
  generatedBy: "openai" | "gemini" | "unknown";
}

export interface ConfidenceScore {
  level: ConfidenceLevel;
  score: number;
  reasons: string[];
}

export interface ReportConfidenceSummary {
  reportId: string;
  ocr: ConfidenceScore;
  analysis: ConfidenceScore;
  overall: ConfidenceScore;
}

export interface ReminderTimeSlot {
  time: string;
  label?: string | null;
}

export const REMINDER_ALARM_TONES = ["default", "soft", "beep", "alert"] as const;
export type ReminderAlarmTone = (typeof REMINDER_ALARM_TONES)[number];

export interface MedicineReminderRecord {
  id: string;
  user_id: string;
  report_id: string | null;
  medicine_name: string;
  dosage: string | null;
  schedule: string;
  instructions: string | null;
  reminder_times: ReminderTimeSlot[];
  alarm_tone: ReminderAlarmTone;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedicalAnalysis {
  documentType: string;
  overview: string;
  plainLanguageSummary: string;
  possibleConditions: ConditionInsight[];
  medicines: MedicineEntry[];
  testValues: TestValueEntry[];
  precautions: string[];
  followUpQuestions: string[];
  safetyFlags: string[];
}

export interface AbnormalFinding {
  name: string;
  value: string;
  referenceRange: string;
  status: TestStatus;
  severity: RiskLevel;
  explanation: string;
}

export interface HealthAlert {
  title: string;
  severity: RiskLevel;
  reason: string;
  recommendation: string;
}

export type StoredHealthAlertSeverity = "low" | "medium" | "high" | "critical";

export interface StoredHealthAlertRecord {
  id: string;
  report_id: string;
  alert_type: StoredHealthAlertSeverity;
  message: string;
  created_at: string;
}

export interface StoredAiConfidenceRecord {
  id: string;
  report_id: string;
  ocr_confidence: number;
  ai_confidence: number;
  created_at: string;
}

export interface HealthInsights {
  overallRisk: RiskLevel;
  summary: string;
  abnormalFindings: AbnormalFinding[];
  alerts: HealthAlert[];
  generalGuidance: string[];
  safetyNotice: string;
  preferredLanguage?: OutputLanguage;
  testEvaluations?: TestEvaluation[];
  riskPredictions?: RiskPrediction[];
  medicineDetails?: MedicineDetail[];
  interactionChecks?: InteractionCheck[];
  lifestyleRecommendations?: LifestyleRecommendation[];
  medicineReminders?: MedicineReminder[];
  emergencyAssessment?: EmergencyAssessment;
  doctorRecommendations?: DoctorRecommendation[];
  authenticity?: AuthenticityProof | null;
}

export interface OcrResult {
  text: string;
  engine: string;
  confidence: "low" | "medium" | "high";
  rawText?: string;
  warnings?: string[];
  structured?: {
    medicines: string[];
    dosage: string[];
    instructions: string[];
    possible_conditions: string[];
  };
}

export interface ReportRecord {
  id: string;
  user_id: string;
  title: string | null;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_bucket: string;
  storage_path: string;
  ocr_text: string | null;
  ocr_engine: string | null;
  ocr_status: string;
  analysis_json: MedicalAnalysis | null;
  insights_json: HealthInsights | null;
  report_status: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  report_id: string;
  user_id: string;
  role: "user" | "assistant";
  message: string;
  response_json: Json | null;
  created_at: string;
}

export interface ReportDetail extends ReportRecord {
  chat_messages: ChatMessageRecord[];
  health_alerts: StoredHealthAlertRecord[];
}
