"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import { generateHealthInsights } from "@/lib/insights";
import { buildTrendInsights } from "@/lib/report-analytics";
import type {
  HealthInsights,
  MedicalAnalysis,
  OutputLanguage,
  RiskLevel,
} from "@/lib/report-types";
import styles from "./ResultViewer.module.css";

declare global {
  interface Window {
    setResult?: (value: unknown) => void;
    openMedScanFeature?: (feature: FeatureModuleKey) => boolean;
  }
}

type ChatMessage = {
  role: "user" | "assistant";
  message: string;
};

type ViewerResult = {
  reportId: string;
  filename: string;
  createdAt: string;
  language: OutputLanguage;
  extractedText: string;
  analysis: MedicalAnalysis | null;
  insights: HealthInsights | null;
  preprocessing?: {
    applied: boolean;
    mode: string;
  };
  chatMessages: ChatMessage[];
};

const HISTORY_KEY = "medscan-local-history-v2";

function formatDate(value?: string) {
  if (!value) {
    return "Unknown date";
  }

  return new Date(value).toLocaleString("en-IN");
}

function formatLabel(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function riskToneClass(risk?: RiskLevel | string | null) {
  switch (risk) {
    case "critical":
      return styles.toneCritical;
    case "high":
      return styles.toneHigh;
    case "moderate":
      return styles.toneModerate;
    default:
      return styles.toneLow;
  }
}

function statusToneClass(status?: string | null) {
  switch (status) {
    case "high":
    case "abnormal":
      return styles.toneHigh;
    case "low":
    case "borderline":
      return styles.toneModerate;
    case "normal":
      return styles.toneLow;
    default:
      return styles.neutral;
  }
}

function normalizeResult(value: unknown): ViewerResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const nestedReport =
    typeof payload.report === "object" && payload.report
      ? (payload.report as Record<string, unknown>)
      : null;
  const reportId =
    typeof payload.reportId === "string" && payload.reportId.trim()
      ? payload.reportId
      : typeof nestedReport?.id === "string" && nestedReport.id.trim()
        ? nestedReport.id
        : `local-${Date.now()}`;

  return {
    reportId,
    filename:
      (typeof payload.filename === "string" && payload.filename) ||
      (typeof nestedReport?.title === "string" && nestedReport.title) ||
      (typeof nestedReport?.original_filename === "string" &&
        nestedReport.original_filename) ||
      "Medical report",
    createdAt:
      (typeof payload.createdAt === "string" && payload.createdAt) ||
      (typeof nestedReport?.created_at === "string" && nestedReport.created_at) ||
      new Date().toISOString(),
    language:
      payload.language === "hi" || payload.language === "hinglish"
        ? payload.language
        : "en",
    extractedText:
      typeof payload.extractedText === "string" ? payload.extractedText.slice(0, 6000) : "",
    analysis: (payload.analysis as MedicalAnalysis | null | undefined) || null,
    insights: (payload.insights as HealthInsights | null | undefined) || null,
    preprocessing:
      typeof payload.preprocessing === "object" && payload.preprocessing
        ? (payload.preprocessing as ViewerResult["preprocessing"])
        : undefined,
    chatMessages: Array.isArray(payload.chatMessages)
      ? (payload.chatMessages as ChatMessage[])
      : [],
  };
}

function readHistory() {
  if (typeof window === "undefined") {
    return [] as ViewerResult[];
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);

    if (!raw) {
      return [] as ViewerResult[];
    }

    const parsed = JSON.parse(raw) as unknown[];
    return parsed
      .map((item) => normalizeResult(item))
      .filter((item): item is ViewerResult => Boolean(item));
  } catch {
    return [] as ViewerResult[];
  }
}

function persistHistory(history: ViewerResult[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
}

function mergeInsightsWithFallback(
  primary: HealthInsights | null,
  fallback: HealthInsights | null
) {
  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  return {
    ...fallback,
    ...primary,
    abnormalFindings:
      primary.abnormalFindings?.length ? primary.abnormalFindings : fallback.abnormalFindings,
    alerts: primary.alerts?.length ? primary.alerts : fallback.alerts,
    generalGuidance:
      primary.generalGuidance?.length ? primary.generalGuidance : fallback.generalGuidance,
    testEvaluations:
      primary.testEvaluations?.length ? primary.testEvaluations : fallback.testEvaluations,
    riskPredictions:
      primary.riskPredictions?.length ? primary.riskPredictions : fallback.riskPredictions,
    medicineDetails:
      primary.medicineDetails?.length ? primary.medicineDetails : fallback.medicineDetails,
    interactionChecks:
      primary.interactionChecks?.length ? primary.interactionChecks : fallback.interactionChecks,
    lifestyleRecommendations:
      primary.lifestyleRecommendations?.length
        ? primary.lifestyleRecommendations
        : fallback.lifestyleRecommendations,
    medicineReminders:
      primary.medicineReminders?.length ? primary.medicineReminders : fallback.medicineReminders,
    doctorRecommendations:
      primary.doctorRecommendations?.length
        ? primary.doctorRecommendations
        : fallback.doctorRecommendations,
    emergencyAssessment: primary.emergencyAssessment || fallback.emergencyAssessment,
    authenticity: primary.authenticity || fallback.authenticity || null,
  };
}

export default function ResultViewer() {
  const [result, setResult] = useState<ViewerResult | null>(null);
  const [history, setHistory] = useState<ViewerResult[]>([]);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "abnormal">("all");
  const [selectedMedicine, setSelectedMedicine] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [revealedFeaturePanels, setRevealedFeaturePanels] = useState<FeatureModuleKey[]>([]);
  const [focusedFeature, setFocusedFeature] = useState<FeatureModuleKey | null>(null);
  const [pendingFeature, setPendingFeature] = useState<FeatureModuleKey | null>(null);
  const sectionRefs = useRef<Partial<Record<FeatureModuleKey, HTMLElement | null>>>({});

  const activateFeature = useEffectEvent((feature: FeatureModuleKey) => {
    setHidden(false);
    setRevealedFeaturePanels((current) =>
      current.includes(feature) ? current : [...current, feature]
    );
    setFocusedFeature(null);
    window.requestAnimationFrame(() => {
      setFocusedFeature(feature);
    });
  });

  useEffect(() => {
    const savedHistory = readHistory();
    setHistory(savedHistory);
    setResult(savedHistory[0] || null);
  }, []);

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  useEffect(() => {
    window.setResult = (value: unknown) => {
      const normalized = normalizeResult(value);

      if (!normalized) {
        return;
      }

      setHidden(false);
      setRevealedFeaturePanels([]);
      setResult(normalized);
      setHistory((current) => {
        const next = [normalized, ...current.filter((item) => item.reportId !== normalized.reportId)];
        return next.slice(0, 10);
      });
    };

    return () => {
      delete window.setResult;
    };
  }, []);

  useEffect(() => {
    setSelectedMedicine(
      result?.insights?.medicineDetails?.[0]?.name || result?.analysis?.medicines?.[0]?.name || null
    );
    setRevealedFeaturePanels([]);
  }, [result]);

  useEffect(() => {
    window.openMedScanFeature = (feature: FeatureModuleKey) => {
      if (!result) {
        return false;
      }

      activateFeature(feature);
      return true;
    };

    return () => {
      delete window.openMedScanFeature;
    };
  }, [result]);

  useEffect(() => {
    const handleFocusFeature = (event: Event) => {
      const detail = (event as CustomEvent<{ feature?: FeatureModuleKey | null }>).detail;
      const feature = detail?.feature;

      if (!feature) {
        return;
      }

      if (result) {
        activateFeature(feature);
        return;
      }

      setPendingFeature(feature);
    };

    window.addEventListener("medscan:focus-feature", handleFocusFeature);

    return () => {
      window.removeEventListener("medscan:focus-feature", handleFocusFeature);
    };
  }, [result]);

  useEffect(() => {
    if (!result || !pendingFeature || typeof window === "undefined") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      activateFeature(pendingFeature);
      setPendingFeature(null);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [pendingFeature, result]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  const isVisible = Boolean(result) && !hidden;
  const previewResult = result;
  const previewFallbackInsights = previewResult?.analysis
    ? generateHealthInsights(previewResult.analysis, {
        language: previewResult.language,
        authenticity: previewResult.insights?.authenticity || null,
      })
    : null;
  const previewInsights = previewResult
    ? mergeInsightsWithFallback(previewResult.insights, previewFallbackInsights)
    : null;
  const previewReportSummary = previewResult
    ? [
        previewResult.analysis?.plainLanguageSummary,
        previewInsights?.summary,
        previewInsights?.emergencyAssessment?.headline,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  useEffect(() => {
    if (!isVisible || typeof window === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.speechSynthesis?.cancel();
        setSpeaking(false);
        setHidden(true);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !focusedFeature || typeof window === "undefined") {
      return;
    }

    const targetSection = sectionRefs.current[focusedFeature];

    if (targetSection) {
      window.requestAnimationFrame(() => {
        targetSection.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }

    if (focusedFeature === "voice-explanation" && previewReportSummary && previewResult) {
      const synthesis = window.speechSynthesis;

      if (synthesis) {
        synthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(previewReportSummary);
        utterance.lang = previewResult.language === "hi" ? "hi-IN" : "en-IN";
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        setSpeaking(true);
        synthesis.speak(utterance);
      }
    }

    const timeoutId = window.setTimeout(() => {
      setFocusedFeature(null);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [focusedFeature, isVisible, previewReportSummary, previewResult]);

  if (!result) {
    return null;
  }

  function handleClose() {
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }

    setSpeaking(false);
    setHidden(true);
  }

  const currentResult = result;
  const insights = previewInsights;
  const reportSummary = previewReportSummary;
  const medicineDetails = insights?.medicineDetails || [];
  const selectedMedicineDetail =
    medicineDetails.find((item) => item.name === selectedMedicine) || medicineDetails[0] || null;
  const filteredHistory = history.filter((item) => {
    const matchesSearch = item.filename.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) {
      return false;
    }

    if (riskFilter === "high") {
      return ["high", "critical"].includes(item.insights?.overallRisk || "");
    }

    if (riskFilter === "abnormal") {
      return (item.insights?.abnormalFindings?.length || 0) > 0;
    }

    return true;
  });
  const trends = buildTrendInsights(
    history
      .slice()
      .reverse()
      .map((item) => ({
        id: item.reportId,
        title: item.filename,
        createdAt: item.createdAt,
        analysis: item.analysis,
      })),
    currentResult.language
  );
  const insightSummary =
    insights?.summary ||
    currentResult.analysis?.overview ||
    "AI summary will appear here once the report is analyzed.";
  const plainExplanation =
    currentResult.analysis?.plainLanguageSummary ||
    currentResult.analysis?.overview ||
    "No explanation available.";
  const interactionChecks = (insights?.interactionChecks || []).slice(0, 4);
  const lifestyleRecommendations = (insights?.lifestyleRecommendations || []).slice(0, 4);
  const medicineReminders = (insights?.medicineReminders || []).slice(0, 6);
  const riskPredictions = (insights?.riskPredictions || []).slice(0, 3);
  const testEvaluations = (insights?.testEvaluations || []).slice(0, 8);
  const doctorRecommendations = (insights?.doctorRecommendations || []).slice(0, 3);
  const historyItems = filteredHistory.slice(0, 6);
  const abnormalCount =
    testEvaluations.filter((item) => item.isAbnormal).length ||
    insights?.abnormalFindings?.length ||
    0;
  const quickGuidance = Array.from(
    new Set(
      [
        ...(insights?.generalGuidance || []),
        ...(currentResult.analysis?.precautions || []),
      ].filter(Boolean)
    )
  ).slice(0, 3);
  const documentType = currentResult.analysis?.documentType || "Medical report";
  const showInteractionPanel = revealedFeaturePanels.includes("interaction-check");
  const showLifestylePanel = revealedFeaturePanels.includes("diet-lifestyle");
  const showReminderPanel = revealedFeaturePanels.includes("medicine-reminders");

  async function handleAskQuestion() {
    if (!chatInput.trim() || chatLoading) {
      return;
    }

    const userMessage = chatInput.trim();
    const chatMessages = [...currentResult.chatMessages, { role: "user" as const, message: userMessage }];
    const currentReport = {
      title: currentResult.filename,
      createdAt: currentResult.createdAt,
      ocrText: currentResult.extractedText,
      analysis: currentResult.analysis,
      insights,
      chatHistory: chatMessages
        .slice(-8)
        .map((item) => `${item.role.toUpperCase()}: ${item.message}`)
        .join("\n"),
    };

    setChatLoading(true);
    setChatInput("");
    setResult({ ...currentResult, chatMessages });

    try {
      const response = await fetch("/api/scan-slip/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userMessage,
          language: currentResult.language,
          currentReport,
          history: history
            .filter((item) => item.reportId !== currentResult.reportId)
            .map((item) => ({
              title: item.filename,
              createdAt: item.createdAt,
              analysis: item.analysis,
              insights: item.insights,
            })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { reply?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to generate chat reply.");
      }

      const nextResult = {
        ...currentResult,
        chatMessages: [...chatMessages, { role: "assistant" as const, message: payload.reply || "" }],
      };
      setResult(nextResult);
      setHistory((current) =>
        current.map((item) => (item.reportId === nextResult.reportId ? nextResult : item))
      );
    } catch (error) {
      const fallbackResult = {
        ...currentResult,
        chatMessages: [
          ...chatMessages,
          {
            role: "assistant" as const,
            message: error instanceof Error ? error.message : "Unable to generate chat reply.",
          },
        ],
      };
      setResult(fallbackResult);
      setHistory((current) =>
        current.map((item) => (item.reportId === fallbackResult.reportId ? fallbackResult : item))
      );
    } finally {
      setChatLoading(false);
    }
  }

  function speakSummary() {
    if (typeof window === "undefined" || !reportSummary) {
      return;
    }

    const synthesis = window.speechSynthesis;

    if (!synthesis) {
      return;
    }

    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(reportSummary);
    utterance.lang = currentResult.language === "hi" ? "hi-IN" : "en-IN";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synthesis.speak(utterance);
  }

  if (hidden) {
    return (
      <button type="button" onClick={() => setHidden(false)} className={styles.reopenButton}>
        <span className={styles.reopenEyebrow}>Latest analysis</span>
        <strong className={styles.reopenTitle}>{currentResult.filename}</strong>
        <span className={styles.reopenMeta}>
          Open the mini result screen to review the AI summary and flagged values.
        </span>
      </button>
    );
  }

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Medical report analysis result"
      >
        <div className={styles.chromeBar}>
          <div className={styles.chromeMeta}>
            <div className={styles.windowDots} aria-hidden="true">
              <span className={`${styles.windowDot} ${styles.windowDotClose}`} />
              <span className={`${styles.windowDot} ${styles.windowDotMinimize}`} />
              <span className={`${styles.windowDot} ${styles.windowDotExpand}`} />
            </div>
            <div>
              <div className={styles.chromeLabel}>AI Analysis Screen</div>
              <div className={styles.chromeHint}>
                Review the summary, key flags, medicines, and follow-up guidance.
              </div>
            </div>
          </div>
        </div>

        <div className={styles.scrollArea}>
          <div className={styles.stickyHeader}>
          <div className={styles.headerRow}>
            <div className={styles.headerText}>
              <p className={styles.eyebrow}>MedScanAI Result</p>
              <h3 className={styles.title}>{currentResult.filename}</h3>
              <div className={styles.metaLine}>
                <span>{formatDate(currentResult.createdAt)}</span>
                <span className={styles.metaDot} />
                <span>{documentType}</span>
              </div>
            </div>
            <button type="button" onClick={handleClose} className={styles.closeButton}>
              Minimize
            </button>
          </div>

          <div className={styles.chipRow}>
            <span className={`${styles.chip} ${styles.neutral}`}>
              {currentResult.language === "hinglish" ? "Hinglish" : currentResult.language.toUpperCase()}
            </span>
            <span className={`${styles.chip} ${riskToneClass(insights?.overallRisk)}`}>
              Risk: {formatLabel(insights?.overallRisk || "low")}
            </span>
            {currentResult.preprocessing?.applied ? (
              <span className={`${styles.chip} ${styles.chipAccent}`}>OCR cleanup applied</span>
            ) : null}
          </div>
          </div>

        <section className={`${styles.heroCard} ${riskToneClass(insights?.overallRisk)}`}>
          <div className={styles.heroLabel}>Report snapshot</div>
          <p className={styles.heroSummary}>{insightSummary}</p>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Overall risk</span>
              <strong className={styles.statValue}>
                {formatLabel(insights?.overallRisk || "low")}
              </strong>
              <span className={styles.statNote}>AI risk estimate</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Flagged values</span>
              <strong className={styles.statValue}>{abnormalCount}</strong>
              <span className={styles.statNote}>Need a closer look</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Medicines found</span>
              <strong className={styles.statValue}>{medicineDetails.length}</strong>
              <span className={styles.statNote}>Extracted from report</span>
            </div>
          </div>
        </section>

        {insights?.emergencyAssessment ? (
          <section
            className={`${styles.alertCard} ${riskToneClass(
              insights.emergencyAssessment.severity
            )}`}
          >
            <h4 className={styles.alertTitle}>
              {insights.emergencyAssessment.headline}
            </h4>
            <p className={styles.alertText}>{insights.emergencyAssessment.action}</p>
            {insights.emergencyAssessment.criticalTests.length > 0 ? (
              <div className={styles.tagRow}>
                {insights.emergencyAssessment.criticalTests.map((item) => (
                  <span key={item} className={styles.tag}>
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section
          ref={(node) => {
            sectionRefs.current["voice-explanation"] = node;
          }}
          className={styles.sectionCard}
        >
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Plain explanation</strong>
              <p className={styles.sectionHint}>
                Simplified so a non-medical reader can understand it quickly.
              </p>
            </div>
          </div>
          <p className={styles.bodyText}>{plainExplanation}</p>
          {quickGuidance.length > 0 ? (
            <ul className={styles.list}>
              {quickGuidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <div className={styles.actionRow}>
            <button
              type="button"
              onClick={speakSummary}
              disabled={!reportSummary}
              className={styles.secondaryButton}
            >
              {speaking ? "Speaking..." : "Read aloud"}
            </button>
            <button
              type="button"
              onClick={() => {
                window.speechSynthesis?.cancel();
                setSpeaking(false);
              }}
              className={styles.secondaryButton}
            >
              Stop
            </button>
          </div>
        </section>

        <section
          ref={(node) => {
            sectionRefs.current["disease-prediction"] = node;
          }}
          className={styles.sectionCard}
        >
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Predicted risks</strong>
              <p className={styles.sectionHint}>
                Likely concerns inferred from the values and report context.
              </p>
            </div>
          </div>
          {riskPredictions.length === 0 ? (
            <div className={styles.emptyState}>No predicted risks were generated for this report.</div>
          ) : (
            <div className={styles.infoStack}>
              {riskPredictions.map((item) => (
                <article
                  key={item.condition}
                  className={`${styles.infoCard} ${riskToneClass(item.severity)}`}
                >
                  <div className={styles.cardHead}>
                    <div>
                      <strong className={styles.cardTitle}>{item.condition}</strong>
                      <div className={styles.cardMeta}>
                        Suggested specialist: {item.suggestedSpecialist}
                      </div>
                    </div>
                    <div className={styles.chipRow}>
                      <span className={`${styles.badge} ${riskToneClass(item.severity)}`}>
                        {formatLabel(item.severity)}
                      </span>
                      <span className={styles.metricBadge}>{item.probability}%</span>
                    </div>
                  </div>
                  <p className={styles.detailText}>
                    {item.rationale.length > 0 ? item.rationale.join(" | ") : "No explanation provided."}
                  </p>
                  {item.preventiveSteps.length > 0 ? (
                    <ul className={styles.list}>
                      {item.preventiveSteps.slice(0, 2).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          ref={(node) => {
            sectionRefs.current["lab-report-flags"] = node;
          }}
          className={styles.sectionCard}
        >
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Normal vs abnormal values</strong>
              <p className={styles.sectionHint}>
                Each test is shown with its result, reference range, and interpretation.
              </p>
            </div>
          </div>
          {testEvaluations.length === 0 ? (
            <div className={styles.emptyState}>No structured test values are available for this report.</div>
          ) : (
            <div className={styles.infoStack}>
              {testEvaluations.map((item) => (
                <article
                  key={`${item.name}-${item.value}`}
                  className={`${styles.infoCard} ${item.isAbnormal ? riskToneClass(item.severity) : styles.neutral}`}
                >
                  <div className={styles.cardHead}>
                    <div>
                      <strong className={styles.cardTitle}>{item.name}</strong>
                      <div className={styles.cardMeta}>{item.normalRangeSummary}</div>
                    </div>
                    <span className={`${styles.badge} ${statusToneClass(item.status)}`}>
                      {formatLabel(item.status)}
                    </span>
                  </div>
                  <div className={styles.valueGrid}>
                    <div className={styles.valueCard}>
                      <span className={styles.valueLabel}>Result</span>
                      <strong className={styles.valueStrong}>
                        {[item.value, item.unit].filter(Boolean).join(" ")}
                      </strong>
                    </div>
                    <div className={styles.valueCard}>
                      <span className={styles.valueLabel}>Reference range</span>
                      <strong className={styles.valueStrong}>
                        {item.referenceRange || "Not provided"}
                      </strong>
                    </div>
                  </div>
                  <p className={styles.detailText}>{item.explanation || item.normalRangeSummary}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          ref={(node) => {
            sectionRefs.current["medicine-analysis"] = node;
          }}
          className={styles.sectionCard}
        >
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Medicines</strong>
              <p className={styles.sectionHint}>
                Tap a medicine to view its purpose, side effects, and precautions.
              </p>
            </div>
          </div>
          {medicineDetails.length === 0 ? (
            <div className={styles.emptyState}>No medicines were extracted from this report.</div>
          ) : (
            <>
              <div className={styles.pillTabs}>
                {medicineDetails.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setSelectedMedicine(item.name)}
                    className={`${styles.pillButton} ${
                      item.name === selectedMedicineDetail?.name ? styles.pillButtonActive : ""
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              {selectedMedicineDetail ? (
                <article className={styles.infoCard}>
                  <div className={styles.cardHead}>
                    <div>
                      <strong className={styles.cardTitle}>{selectedMedicineDetail.name}</strong>
                      <div className={styles.cardMeta}>
                        {selectedMedicineDetail.category} | {formatLabel(selectedMedicineDetail.source)}
                      </div>
                    </div>
                  </div>
                  <p className={styles.detailText}>{selectedMedicineDetail.summary}</p>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailPanel}>
                      <span className={styles.detailLabel}>Uses</span>
                      <p className={styles.detailBody}>
                        {selectedMedicineDetail.uses.length > 0
                          ? selectedMedicineDetail.uses.join(", ")
                          : "Not available"}
                      </p>
                    </div>
                    <div className={styles.detailPanel}>
                      <span className={styles.detailLabel}>Side effects</span>
                      <p className={styles.detailBody}>
                        {selectedMedicineDetail.commonSideEffects.length > 0
                          ? selectedMedicineDetail.commonSideEffects.join(", ")
                          : "Not available"}
                      </p>
                    </div>
                    <div className={`${styles.detailPanel} ${styles.detailFull}`}>
                      <span className={styles.detailLabel}>Precautions</span>
                      <p className={styles.detailBody}>
                        {selectedMedicineDetail.precautions.length > 0
                          ? selectedMedicineDetail.precautions.join(", ")
                          : "No special precautions captured."}
                      </p>
                    </div>
                  </div>
                </article>
              ) : null}
            </>
          )}
        </section>

        {showInteractionPanel ? (
          <section
            ref={(node) => {
              sectionRefs.current["interaction-check"] = node;
            }}
            className={styles.sectionCard}
          >
            <div className={styles.sectionHeader}>
              <div>
                <strong className={styles.sectionTitle}>Interaction checks</strong>
                <p className={styles.sectionHint}>
                  Medicine combinations cross-checked against report context and safety rules.
                </p>
              </div>
            </div>
            {interactionChecks.length === 0 ? (
              <div className={styles.emptyState}>
                No medicine interaction concerns were inferred from the extracted report data.
              </div>
            ) : (
              <div className={styles.infoStack}>
                {interactionChecks.map((item) => (
                  <article
                    key={`${item.title}-${item.medicines.join("-")}`}
                    className={`${styles.infoCard} ${riskToneClass(item.severity)}`}
                  >
                    <div className={styles.cardHead}>
                      <div>
                        <strong className={styles.cardTitle}>{item.title}</strong>
                        <div className={styles.cardMeta}>Safety review for extracted medicines</div>
                      </div>
                      <span className={`${styles.badge} ${riskToneClass(item.severity)}`}>
                        {formatLabel(item.severity)}
                      </span>
                    </div>
                    {item.medicines.length > 0 ? (
                      <div className={styles.tagRow}>
                        {item.medicines.map((medicine) => (
                          <span key={`${item.title}-${medicine}`} className={styles.tag}>
                            {medicine}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className={styles.detailText}>{item.explanation}</p>
                    <ul className={styles.list}>
                      <li>{item.recommendation}</li>
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {showLifestylePanel ? (
          <section
            ref={(node) => {
              sectionRefs.current["diet-lifestyle"] = node;
            }}
            className={styles.sectionCard}
          >
            <div className={styles.sectionHeader}>
              <div>
                <strong className={styles.sectionTitle}>Diet and lifestyle guidance</strong>
                <p className={styles.sectionHint}>
                  Recommendations generated from the findings already extracted from the report.
                </p>
              </div>
            </div>
            {lifestyleRecommendations.length === 0 ? (
              <div className={styles.emptyState}>
                No focused diet or lifestyle guidance was generated for this report.
              </div>
            ) : (
              <div className={styles.infoStack}>
                {lifestyleRecommendations.map((item) => (
                  <article key={`${item.category}-${item.title}`} className={styles.infoCard}>
                    <div className={styles.cardHead}>
                      <div>
                        <strong className={styles.cardTitle}>{item.title}</strong>
                        <div className={styles.cardMeta}>{formatLabel(item.category)}</div>
                      </div>
                    </div>
                    <p className={styles.detailText}>{item.details}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {showReminderPanel ? (
          <section
            ref={(node) => {
              sectionRefs.current["medicine-reminders"] = node;
            }}
            className={styles.sectionCard}
          >
            <div className={styles.sectionHeader}>
              <div>
                <strong className={styles.sectionTitle}>Medicine reminder plan</strong>
                <p className={styles.sectionHint}>
                  Schedules inferred from the extracted prescription frequency and timing cues.
                </p>
              </div>
            </div>
            {medicineReminders.length === 0 ? (
              <div className={styles.emptyState}>
                No medicine schedule could be inferred from this report.
              </div>
            ) : (
              <div className={styles.infoStack}>
                {medicineReminders.map((item) => (
                  <article key={`${item.medicineName}-${item.schedule}`} className={styles.infoCard}>
                    <div className={styles.cardHead}>
                      <div>
                        <strong className={styles.cardTitle}>{item.medicineName}</strong>
                        <div className={styles.cardMeta}>{item.dosage || "Dosage not extracted"}</div>
                      </div>
                      <span className={styles.metricBadge}>{item.schedule}</span>
                    </div>
                    <p className={styles.detailText}>{item.instructions}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Trends and comparison</strong>
              <p className={styles.sectionHint}>
                Compare repeated tests across uploaded reports over time.
              </p>
            </div>
          </div>
          {trends.length === 0 ? (
            <div className={styles.emptyState}>
              Upload multiple reports to compare lab values over time.
            </div>
          ) : (
            <div className={styles.infoStack}>
              {trends.slice(0, 4).map((trend) => (
                <article key={trend.metricKey} className={styles.infoCard}>
                  <strong className={styles.cardTitle}>{trend.testName}</strong>
                  <p className={styles.detailText}>{trend.summary}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          ref={(node) => {
            sectionRefs.current["specialist-match"] = node;
          }}
          className={styles.sectionCard}
        >
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Specialist recommendation</strong>
              <p className={styles.sectionHint}>
                Doctors who may be most relevant based on the findings.
              </p>
            </div>
          </div>
          {doctorRecommendations.length === 0 ? (
            <div className={styles.emptyState}>
              No specialist recommendation is available for this report.
            </div>
          ) : (
            <div className={styles.infoStack}>
              {doctorRecommendations.map((item) => (
                <article key={item.specialist} className={styles.infoCard}>
                  <div className={styles.cardHead}>
                    <div>
                      <strong className={styles.cardTitle}>{item.specialist}</strong>
                      <div className={styles.cardMeta}>Recommended next consultation</div>
                    </div>
                    <span className={`${styles.badge} ${riskToneClass(item.priority)}`}>
                      {formatLabel(item.priority)}
                    </span>
                  </div>
                  <p className={styles.detailText}>{item.reason}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        {insights?.authenticity ? (
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <strong className={styles.sectionTitle}>Authenticity hash</strong>
                <p className={styles.sectionHint}>Proof details generated for report verification.</p>
              </div>
            </div>
            <article className={styles.infoCard}>
              <div className={styles.valueGrid}>
                <div className={styles.valueCard}>
                  <span className={styles.valueLabel}>Algorithm</span>
                  <strong className={styles.valueStrong}>
                    {insights.authenticity.algorithm}
                  </strong>
                </div>
                <div className={styles.valueCard}>
                  <span className={styles.valueLabel}>Issued</span>
                  <strong className={styles.valueStrong}>
                    {formatDate(insights.authenticity.issuedAt)}
                  </strong>
                </div>
              </div>
              <div className={styles.detailPanel}>
                <span className={styles.detailLabel}>Block hash</span>
                <p className={`${styles.detailBody} ${styles.monoText}`}>
                  {insights.authenticity.blockHash.slice(0, 24)}...
                </p>
              </div>
              <p className={styles.detailText}>
                {insights.authenticity.verificationMessage}
              </p>
            </article>
          </section>
        ) : null}

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Context-aware chat</strong>
              <p className={styles.sectionHint}>
                Ask about medicines, risk, abnormal values, or past trends.
              </p>
            </div>
          </div>
          <div className={styles.chatList}>
            {currentResult.chatMessages.length === 0 ? (
              <div className={styles.emptyState}>
                Ask about risks, medicines, abnormal values, historical trends, or symptoms like fever and headache.
              </div>
            ) : (
              currentResult.chatMessages.slice(-6).map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`${styles.chatBubble} ${
                    message.role === "assistant"
                      ? styles.chatBubbleAssistant
                      : styles.chatBubbleUser
                  }`}
                >
                  <div className={styles.chatRole}>
                    {message.role === "assistant" ? "AI assistant" : "You"}
                  </div>
                  <div className={styles.chatMessage}>{message.message}</div>
                </div>
              ))
            )}
          </div>
          <div className={styles.inputRow}>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about report context, trends, or symptoms like fever or cough"
              className={styles.textInput}
            />
            <button
              type="button"
              onClick={handleAskQuestion}
              disabled={chatLoading}
              className={styles.primaryButton}
            >
              {chatLoading ? "..." : "Ask"}
            </button>
          </div>
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <strong className={styles.sectionTitle}>Report history</strong>
              <p className={styles.sectionHint}>Reopen past uploads or narrow the list with filters.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setHistory([]);
                setResult(null);
                window.localStorage.removeItem(HISTORY_KEY);
              }}
              className={styles.clearButton}
            >
              Clear
            </button>
          </div>
          <div className={styles.historyControls}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter reports"
              className={styles.textInput}
            />
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value as "all" | "high" | "abnormal")}
              className={styles.selectInput}
            >
              <option value="all">All</option>
              <option value="high">High risk</option>
              <option value="abnormal">Abnormal</option>
            </select>
          </div>
          {historyItems.length === 0 ? (
            <div className={styles.emptyState}>No saved reports match the current search or filter.</div>
          ) : (
            <div className={styles.historyList}>
              {historyItems.map((item) => (
                <article key={item.reportId} className={styles.historyItem}>
                  <div className={styles.historyTop}>
                    <button
                      type="button"
                      onClick={() => setResult(item)}
                      className={styles.historyButton}
                    >
                      <strong className={styles.historyTitle}>{item.filename}</strong>
                      <div className={styles.metaLine}>
                        <span>{formatDate(item.createdAt)}</span>
                        <span className={styles.metaDot} />
                        <span>{formatLabel(item.insights?.overallRisk || "low")} risk</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = history.filter((historyItem) => historyItem.reportId !== item.reportId);
                        setHistory(next);
                        if (currentResult.reportId === item.reportId) {
                          setResult(next[0] || null);
                        }
                      }}
                      className={styles.removeButton}
                    >
                      Remove
                    </button>
                  </div>
                  <div className={styles.historySummary}>
                    {item.insights?.summary || item.analysis?.plainLanguageSummary || "No summary available."}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
