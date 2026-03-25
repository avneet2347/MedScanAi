import type { OutputLanguage } from "@/lib/report-types";

type LocalizedCopy = {
  en: string;
  hi?: string;
  hinglish?: string;
};

export function normalizeOutputLanguage(value: unknown): OutputLanguage {
  if (value === "hi" || value === "hinglish") {
    return value;
  }

  return "en";
}

export function chooseLocalizedText(
  language: OutputLanguage,
  copy: LocalizedCopy
) {
  if (language === "hi") {
    return copy.hi || copy.en;
  }

  if (language === "hinglish") {
    return copy.hinglish || copy.hi || copy.en;
  }

  return copy.en;
}

export function formatProbability(probability: number) {
  return `${Math.max(0, Math.min(100, Math.round(probability)))}%`;
}

export function languageLabel(language: OutputLanguage) {
  return chooseLocalizedText(language, {
    en: "English",
    hi: "Hindi",
    hinglish: "Hinglish",
  });
}

export function severityLabel(
  severity: "low" | "moderate" | "high" | "critical",
  language: OutputLanguage
) {
  switch (severity) {
    case "critical":
      return chooseLocalizedText(language, {
        en: "Critical",
        hi: "गंभीर",
        hinglish: "Critical",
      });
    case "high":
      return chooseLocalizedText(language, {
        en: "High",
        hi: "उच्च",
        hinglish: "High",
      });
    case "moderate":
      return chooseLocalizedText(language, {
        en: "Moderate",
        hi: "मध्यम",
        hinglish: "Moderate",
      });
    default:
      return chooseLocalizedText(language, {
        en: "Low",
        hi: "कम",
        hinglish: "Low",
      });
  }
}
