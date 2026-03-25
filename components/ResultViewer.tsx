"use client";

import { useEffect, useState } from "react";
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
  const reportId =
    typeof payload.reportId === "string" && payload.reportId.trim()
      ? payload.reportId
      : `local-${Date.now()}`;

  return {
    reportId,
    filename:
      (typeof payload.filename === "string" && payload.filename) || "Medical report",
    createdAt:
      (typeof payload.createdAt === "string" && payload.createdAt) ||
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

function summaryText(result: ViewerResult | null) {
  if (!result) {
    return "";
  }

  return [
    result.analysis?.plainLanguageSummary,
    result.insights?.summary,
    result.insights?.emergencyAssessment?.headline,
  ]
    .filter(Boolean)
    .join(" ");
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
    setSelectedMedicine(result?.insights?.medicineDetails?.[0]?.name || null);
  }, [result]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  if (hidden || !result) {
    return null;
  }

  const currentResult = result;
  const medicineDetails = currentResult.insights?.medicineDetails || [];
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
  const reportSummary = summaryText(currentResult);
  const insightSummary =
    currentResult.insights?.summary ||
    currentResult.analysis?.overview ||
    "AI summary will appear here once the report is analyzed.";
  const plainExplanation =
    currentResult.analysis?.plainLanguageSummary ||
    currentResult.analysis?.overview ||
    "No explanation available.";
  const riskPredictions = (currentResult.insights?.riskPredictions || []).slice(0, 3);
  const testEvaluations = (currentResult.insights?.testEvaluations || []).slice(0, 8);
  const doctorRecommendations = (currentResult.insights?.doctorRecommendations || []).slice(0, 3);
  const historyItems = filteredHistory.slice(0, 6);
  const abnormalCount = currentResult.insights?.testEvaluations
    ? currentResult.insights.testEvaluations.filter((item) => item.isAbnormal).length
    : currentResult.insights?.abnormalFindings?.length || 0;
  const quickGuidance = Array.from(
    new Set(
      [
        ...(currentResult.insights?.generalGuidance || []),
        ...(currentResult.analysis?.precautions || []),
      ].filter(Boolean)
    )
  ).slice(0, 3);
  const documentType = currentResult.analysis?.documentType || "Medical report";

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
      insights: currentResult.insights,
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

  return (
    <div className={styles.panel}>
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
            <button type="button" onClick={() => setHidden(true)} className={styles.closeButton}>
              Close
            </button>
          </div>

          <div className={styles.chipRow}>
            <span className={`${styles.chip} ${styles.neutral}`}>
              {currentResult.language === "hinglish" ? "Hinglish" : currentResult.language.toUpperCase()}
            </span>
            <span className={`${styles.chip} ${riskToneClass(currentResult.insights?.overallRisk)}`}>
              Risk: {formatLabel(currentResult.insights?.overallRisk || "low")}
            </span>
            {currentResult.preprocessing?.applied ? (
              <span className={`${styles.chip} ${styles.chipAccent}`}>OCR cleanup applied</span>
            ) : null}
          </div>
        </div>

        <section className={`${styles.heroCard} ${riskToneClass(currentResult.insights?.overallRisk)}`}>
          <div className={styles.heroLabel}>Report snapshot</div>
          <p className={styles.heroSummary}>{insightSummary}</p>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Overall risk</span>
              <strong className={styles.statValue}>
                {formatLabel(currentResult.insights?.overallRisk || "low")}
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

        {currentResult.insights?.emergencyAssessment ? (
          <section
            className={`${styles.alertCard} ${riskToneClass(
              currentResult.insights.emergencyAssessment.severity
            )}`}
          >
            <h4 className={styles.alertTitle}>
              {currentResult.insights.emergencyAssessment.headline}
            </h4>
            <p className={styles.alertText}>{currentResult.insights.emergencyAssessment.action}</p>
            {currentResult.insights.emergencyAssessment.criticalTests.length > 0 ? (
              <div className={styles.tagRow}>
                {currentResult.insights.emergencyAssessment.criticalTests.map((item) => (
                  <span key={item} className={styles.tag}>
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className={styles.sectionCard}>
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

        <section className={styles.sectionCard}>
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

        <section className={styles.sectionCard}>
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

        <section className={styles.sectionCard}>
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

        <section className={styles.sectionCard}>
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

        {currentResult.insights?.authenticity ? (
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
                    {currentResult.insights.authenticity.algorithm}
                  </strong>
                </div>
                <div className={styles.valueCard}>
                  <span className={styles.valueLabel}>Issued</span>
                  <strong className={styles.valueStrong}>
                    {formatDate(currentResult.insights.authenticity.issuedAt)}
                  </strong>
                </div>
              </div>
              <div className={styles.detailPanel}>
                <span className={styles.detailLabel}>Block hash</span>
                <p className={`${styles.detailBody} ${styles.monoText}`}>
                  {currentResult.insights.authenticity.blockHash.slice(0, 24)}...
                </p>
              </div>
              <p className={styles.detailText}>
                {currentResult.insights.authenticity.verificationMessage}
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
                Ask about risks, medicines, abnormal values, or historical trends.
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
              placeholder="Ask about report context or trends"
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
  );
}
