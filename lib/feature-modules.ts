export const featureModuleKeys = [
  "medicine-analysis",
  "interaction-check",
  "lab-report-flags",
  "disease-prediction",
  "diet-lifestyle",
  "specialist-match",
  "medicine-reminders",
  "voice-explanation",
] as const;

export type FeatureModuleKey = (typeof featureModuleKeys)[number];
