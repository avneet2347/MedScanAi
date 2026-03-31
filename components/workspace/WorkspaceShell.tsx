"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from "react";
import BrandWordmark from "@/components/BrandWordmark";
import type {
  ChatMessageRecord,
  DoctorRecommendation,
  HealthInsights,
  MedicalAnalysis,
  ReportConfidenceSummary,
  ReportDetail,
  ReportRecord,
} from "@/lib/report-types";
import WorkspaceHealthTrendsPanel from "@/components/WorkspaceHealthTrendsPanel";
import WorkspaceReportComparisonPanel from "@/components/WorkspaceReportComparisonPanel";
import WorkspaceRemindersPanel from "@/components/WorkspaceRemindersPanel";
import styles from "./WorkspaceShell.module.css";
import {
  AlertIcon,
  BellIcon,
  ChatIcon,
  CheckIcon,
  CompareIcon,
  DashboardIcon,
  DoctorIcon,
  FileIcon,
  InfoIcon,
  MenuIcon,
  MicIcon,
  SignOutIcon,
  TrendsIcon,
  UploadIcon,
} from "./workspace-icons";

export type WorkspacePageId =
  | "dashboard"
  | "upload"
  | "trends"
  | "compare"
  | "reminders"
  | "chat";

export type WorkspaceNotice = {
  type: "error" | "success" | "info";
  text: string;
} | null;

type Props = {
  activePage: WorkspacePageId;
  sidebarOpen: boolean;
  dark: boolean;
  notice: WorkspaceNotice;
  profileName: string;
  userEmail: string;
  avatarText: string;
  file: File | null;
  processing: boolean;
  pipelineStatus: string;
  reports: ReportRecord[];
  selectedReportId: string | null;
  selectedReport: ReportDetail | null;
  reportLoading: boolean;
  doctorRecommendations: DoctorRecommendation[];
  doctorRecommendationLoading: boolean;
  doctorRecommendationError: string | null;
  confidenceSummary: ReportConfidenceSummary | null;
  confidenceLoading: boolean;
  confidenceError: string | null;
  chatInput: string;
  chatLoading: boolean;
  listening: boolean;
  speechNotice: string | null;
  speakingMessageId: string | null;
  humanizingMessageId: string | null;
  humanizedMessages: Record<string, string>;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  authorizedFetchJson: (input: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  onShowPage: (pageId: WorkspacePageId) => void;
  onToggleSidebar: () => void;
  onCloseSidebar: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onSelectFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  onSelectReport: (reportId: string) => void;
  onChatInputChange: (value: string) => void;
  onAskQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onMicInput: () => void;
  onSpeakMessage: (messageId: string, message: string) => void;
  onHumanizeMessage: (messageId: string, message: string) => void;
};

const PAGE_TITLES: Record<WorkspacePageId, string> = {
  dashboard: "Dashboard",
  upload: "Upload Report",
  trends: "Health Trends",
  compare: "Compare Reports",
  reminders: "Reminders",
  chat: "Chat / Assistant",
};

const CHAT_SCROLL_LATEST_THRESHOLD = 96;

function formatDate(value?: string | null) {
  if (!value) {
    return "Unknown date";
  }

  return new Date(value).toLocaleString("en-IN");
}

function formatShortDate(value?: string | null) {
  if (!value) {
    return "Unknown date";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(value?: number | null) {
  if (!value) {
    return "0 KB";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatConfidenceLevel(value?: "low" | "medium" | "high") {
  if (!value) {
    return "Unknown";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatLabel(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getReportBadgeTone(status?: string | null) {
  const normalized = (status || "").toLowerCase();

  if (normalized === "ready" || normalized === "analysis_complete" || normalized === "ocr_complete") {
    return styles.badgeReady;
  }

  if (normalized.includes("failed")) {
    return styles.badgeRisk;
  }

  if (normalized === "uploaded") {
    return styles.badgeLow;
  }

  return styles.badgeNeutral;
}

function getSeverityClassName(value?: string | null) {
  const normalized = (value || "").toLowerCase();

  if (normalized === "critical") {
    return styles.severityCritical;
  }

  if (normalized === "high" || normalized === "abnormal") {
    return styles.severityHigh;
  }

  if (normalized === "medium" || normalized === "moderate" || normalized === "borderline") {
    return styles.severityMedium;
  }

  if (normalized === "low" || normalized === "normal") {
    return styles.severityLow;
  }

  return styles.severityNeutral;
}

function getConfidenceWidth(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function getOcrPreviewLines(text?: string | null) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => (value || "").trim()).filter(Boolean))
  );
}

function buildDisplayPrecautions(
  analysis?: MedicalAnalysis | null,
  insights?: HealthInsights | null
) {
  return (
    analysis?.precautions?.length ? analysis.precautions : insights?.generalGuidance || []
  ).slice(0, 6);
}

function buildDisplayMedicines(
  analysis?: MedicalAnalysis | null,
  selectedReport?: ReportDetail | null
) {
  if (analysis?.medicines?.length) {
    return analysis.medicines.map((item) => ({
      ...item,
      source: "analysis" as const,
    }));
  }

  return (selectedReport?.ocr_structured?.medicines || []).slice(0, 10).map((name, index) => ({
    name,
    dosage: selectedReport?.ocr_structured?.dosage?.[index] || "",
    frequency: "",
    purpose: "",
    notes: "Recovered from structured OCR output.",
    source: "ocr" as const,
  }));
}

function buildRiskSectionState(
  insights?: HealthInsights | null,
  emergencyAlertMessages: string[] = [],
  ruleAlerts: HealthInsights["alerts"] = []
) {
  if (!insights) {
    return {
      label: "Pending",
      tone: "neutral",
      summary: "Health insights will appear after analysis.",
      highlights: [] as string[],
      hasRisk: false,
    };
  }

  const abnormalFindings = insights.abnormalFindings || [];
  const hasRisk =
    insights.overallRisk !== "low" ||
    abnormalFindings.length > 0 ||
    emergencyAlertMessages.length > 0 ||
    ruleAlerts.length > 0;

  if (!hasRisk) {
    return {
      label: "No Risk",
      tone: "low",
      summary:
        "No clearly abnormal value or urgent alert was identified from the extracted report data.",
      highlights: dedupeStrings([
        insights.summary,
        insights.safetyNotice,
      ]).slice(0, 2),
      hasRisk: false,
    };
  }

  return {
    label: formatLabel(insights.overallRisk),
    tone: insights.overallRisk,
    summary: insights.summary || "Potential risk was identified from the extracted report data.",
    highlights: dedupeStrings([
      ...emergencyAlertMessages,
      ...ruleAlerts.slice(0, 2).map((alert) => `${alert.title}: ${alert.reason}`),
      ...abnormalFindings.slice(0, 3).map((item) => `${item.name}: ${item.value}`),
    ]).slice(0, 4),
    hasRisk: true,
  };
}

function getReportDisplayName(report?: Pick<ReportRecord, "title" | "original_filename"> | null) {
  return report?.title?.trim() || report?.original_filename || "Untitled report";
}

function buildChatQuickPrompts(analysis?: MedicalAnalysis | null) {
  return dedupeStrings([
    analysis?.followUpQuestions?.[0],
    analysis?.followUpQuestions?.[1],
    analysis?.testValues?.[0] ? `Explain my ${analysis.testValues[0].name} result.` : null,
    analysis?.testValues?.[1] ? `Is ${analysis.testValues[1].name} concerning?` : null,
    "Summarize this report in simple language.",
    "What precautions should I follow?",
  ]).slice(0, 4);
}

function shouldShowScrollLatestButton(element: HTMLDivElement) {
  return element.scrollHeight - element.clientHeight - element.scrollTop > CHAT_SCROLL_LATEST_THRESHOLD;
}

function scrollChatToLatest(element: HTMLDivElement, behavior: ScrollBehavior) {
  element.scrollTo({
    top: element.scrollHeight,
    behavior,
  });
}

export default function WorkspaceShell({
  activePage,
  sidebarOpen,
  dark,
  notice,
  profileName,
  userEmail,
  avatarText,
  file,
  processing,
  pipelineStatus,
  reports,
  selectedReportId,
  selectedReport,
  reportLoading,
  doctorRecommendations,
  doctorRecommendationLoading,
  doctorRecommendationError,
  confidenceSummary,
  confidenceLoading,
  confidenceError,
  chatInput,
  chatLoading,
  listening,
  speechNotice,
  speakingMessageId,
  humanizingMessageId,
  humanizedMessages,
  uploadInputRef,
  authorizedFetchJson,
  onShowPage,
  onToggleSidebar,
  onCloseSidebar,
  onToggleTheme,
  onSignOut,
  onSelectFile,
  onAnalyze,
  onSelectReport,
  onChatInputChange,
  onAskQuestion,
  onMicInput,
  onSpeakMessage,
  onHumanizeMessage,
}: Props) {
  const analysis = selectedReport?.analysis_json as MedicalAnalysis | null | undefined;
  const insights = selectedReport?.insights_json as HealthInsights | null | undefined;
  const chatMessages = selectedReport?.chat_messages || [];
  const emergencyAlerts = selectedReport?.health_alerts || [];
  const ruleAlerts = insights?.alerts || [];
  const readyReports = reports.filter((report) => report.report_status === "ready").length;
  const readyPercentage = reports.length > 0 ? Math.round((readyReports / reports.length) * 100) : 0;
  const riskFlagsCount = emergencyAlerts.length + ruleAlerts.length;
  const selectedMedicines = buildDisplayMedicines(analysis, selectedReport);
  const selectedTests = analysis?.testValues || [];
  const displayPrecautions = buildDisplayPrecautions(analysis, insights);
  const ocrPreviewLines = getOcrPreviewLines(selectedReport?.ocr_text);
  const riskSection = buildRiskSectionState(
    insights,
    emergencyAlerts.map((alert) => alert.message),
    ruleAlerts
  );
  const confidenceReasons = confidenceSummary
    ? dedupeStrings([
        ...confidenceSummary.analysis.reasons,
        ...confidenceSummary.ocr.reasons,
      ]).slice(0, 4)
    : [];
  const topDoctorRecommendations = doctorRecommendations.slice(0, 2);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const reportSelectorRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatAreaRef = useRef<HTMLDivElement | null>(null);
  const activeSectionRef = useRef<HTMLElement | null>(null);
  const shouldStickChatToBottomRef = useRef(true);
  const [showScrollLatestButton, setShowScrollLatestButton] = useState(false);
  const quickPrompts = buildChatQuickPrompts(analysis);
  const chatDisabled = chatLoading || !selectedReport?.analysis_json;
  const latestMessageId = chatMessages[chatMessages.length - 1]?.id || null;
  const latestMessageRole = chatMessages[chatMessages.length - 1]?.role || null;
  const chatHeroStats = selectedReport
    ? [
        {
          value: String(chatMessages.length),
          label: "Messages",
          hint: chatMessages.length ? "Saved in this report thread" : "Start the first follow-up",
        },
        {
          value: String(selectedMedicines.length),
          label: "Medicines",
          hint: selectedMedicines.length ? "Available for dosage or precaution questions" : "No medicines extracted yet",
        },
        {
          value: String(selectedTests.length),
          label: "Tests",
          hint: selectedTests.length ? "Values ready for explanation" : "No structured test values yet",
        },
        {
          value: String(riskFlagsCount),
          label: "Risk flags",
          hint: riskFlagsCount ? "Flagged items to clarify with the assistant" : "No active alerts detected",
        },
      ]
    : [
        {
          value: String(reports.length),
          label: "Reports",
          hint: reports.length ? "Saved in your private workspace" : "Upload your first report to begin",
        },
        {
          value: String(readyReports),
          label: "AI ready",
          hint: readyReports ? "Reports ready for grounded chat" : "Waiting for completed analysis",
        },
        {
          value: `${readyPercentage}%`,
          label: "Coverage",
          hint: reports.length ? "Saved reports with analysis complete" : "Coverage grows after upload",
        },
        {
          value: "3",
          label: "Modes",
          hint: "Text, voice input, and humanized replies",
        },
      ];
  const chatScopeBadges = [
    "Report-grounded answers",
    "Voice input ready",
    "Humanized replies",
    "Private saved history",
  ];
  const chatFocusItems = dedupeStrings([
    analysis?.documentType || null,
    ...selectedMedicines.slice(0, 2).map((item) => item.name),
    ...selectedTests.slice(0, 2).map((item) => item.name),
    analysis?.followUpQuestions?.[0] || null,
  ]).slice(0, 5);
  const emptyChatPrompts = quickPrompts.length
    ? quickPrompts
    : [
        "Summarize this report in simple language.",
        "Which findings should I discuss with a doctor?",
        "What precautions should I follow next?",
      ];

  function handlePageOpen(pageId: WorkspacePageId) {
    onShowPage(pageId);
    onCloseSidebar();
  }

  useEffect(() => {
    if (!reportMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!reportSelectorRef.current?.contains(event.target as Node)) {
        setReportMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [reportMenuOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      activeSectionRef.current?.scrollIntoView({
        block: "start",
        inline: "nearest",
        behavior: "auto",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "chat" || !chatAreaRef.current) {
      shouldStickChatToBottomRef.current = true;
      return;
    }

    const area = chatAreaRef.current;

    const syncScrollButton = () => {
      const shouldShowButton = shouldShowScrollLatestButton(area);
      shouldStickChatToBottomRef.current = !shouldShowButton;
      setShowScrollLatestButton(shouldShowButton);
    };

    const frame = window.requestAnimationFrame(syncScrollButton);
    area.addEventListener("scroll", syncScrollButton, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      area.removeEventListener("scroll", syncScrollButton);
    };
  }, [activePage, selectedReportId]);

  useEffect(() => {
    if (activePage !== "chat" || !chatAreaRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const area = chatAreaRef.current;

      if (!area) {
        return;
      }

      scrollChatToLatest(area, "auto");
      shouldStickChatToBottomRef.current = true;
      setShowScrollLatestButton(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activePage, selectedReportId]);

  useEffect(() => {
    if (activePage !== "chat" || !chatAreaRef.current) {
      return;
    }

    if (!shouldStickChatToBottomRef.current && latestMessageRole !== "user") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const area = chatAreaRef.current;

      if (!area) {
        return;
      }

      scrollChatToLatest(area, latestMessageRole === "user" ? "smooth" : "auto");
      shouldStickChatToBottomRef.current = true;
      setShowScrollLatestButton(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activePage, latestMessageId, latestMessageRole, chatLoading]);

  function handleScrollToLatest() {
    const area = chatAreaRef.current;

    if (!area) {
      return;
    }

    scrollChatToLatest(area, "smooth");
    shouldStickChatToBottomRef.current = true;
    setShowScrollLatestButton(false);
  }

  function handleQuickPromptSelect(prompt: string) {
    onChatInputChange(prompt);
    chatInputRef.current?.focus();
  }

  return (
    <div className={styles.shell}>
      <div
        className={joinClassNames(
          styles.sidebarOverlay,
          sidebarOpen ? styles.overlayVisible : undefined
        )}
        onClick={onCloseSidebar}
      />

      <aside className={joinClassNames(styles.sidebar, sidebarOpen ? styles.sidebarOpen : undefined)}>
        <button
          type="button"
          className={styles.sidebarLogo}
          onClick={() => handlePageOpen("dashboard")}
          aria-label="Go to dashboard"
        >
          <div className={styles.logoIcon}>
            <span className={styles.logoEmoji} aria-hidden="true">🩺</span>
          </div>
          <BrandWordmark className={styles.logoText} />
        </button>

        <div className={styles.sidebarSectionLabel}>Main</div>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "dashboard" ? styles.navActive : undefined)}
          onClick={() => handlePageOpen("dashboard")}
        >
          <DashboardIcon className={styles.navIcon} />
          Dashboard
        </button>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "upload" ? styles.navActive : undefined)}
          onClick={() => handlePageOpen("upload")}
        >
          <UploadIcon className={styles.navIcon} />
          Upload Report
        </button>

        <div className={styles.sidebarSectionLabel}>Insights</div>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "trends" ? styles.navActive : undefined)}
          onClick={() => handlePageOpen("trends")}
        >
          <TrendsIcon className={styles.navIcon} />
          Health Trends
        </button>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "compare" ? styles.navActive : undefined)}
          onClick={() => handlePageOpen("compare")}
        >
          <CompareIcon className={styles.navIcon} />
          Compare Reports
        </button>

        <div className={styles.sidebarSectionLabel}>Tools</div>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "reminders" ? styles.navActive : undefined)}
          onClick={() => handlePageOpen("reminders")}
        >
          <BellIcon className={styles.navIcon} />
          Reminders
          <span className={styles.navBadge}>{selectedMedicines.length}</span>
        </button>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "chat" ? styles.navActive : undefined)}
          onClick={() => handlePageOpen("chat")}
        >
          <ChatIcon className={styles.navIcon} />
          Chat / Assistant
        </button>

        <div className={styles.sidebarFooter}>
          <div className={styles.userPill}>
            <div className={styles.avatar}>{avatarText}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{profileName}</div>
              <div className={styles.userEmail}>{userEmail}</div>
            </div>
          </div>
        </div>
      </aside>

      <header className={styles.topbar}>
        <button type="button" className={styles.menuToggle} onClick={onToggleSidebar}>
          <MenuIcon />
        </button>
        <span className={joinClassNames(styles.topbarTitle, styles.serif)}>{PAGE_TITLES[activePage]}</span>
        <span className={styles.topbarPill}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
          </svg>
          Authenticated
        </span>
        <div className={styles.topbarActions}>
          <button type="button" className={styles.themeToggle} onClick={onToggleTheme} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} />
          <button type="button" className={styles.iconBtn} onClick={onSignOut} aria-label="Sign out">
            <SignOutIcon />
          </button>
        </div>
      </header>

      <main className={joinClassNames(styles.main, activePage === "chat" ? styles.mainChat : undefined)}>
        {notice ? (
          <div
            className={joinClassNames(
              styles.notice,
              notice.type === "success"
                ? styles.noticeSuccess
                : notice.type === "error"
                  ? styles.noticeError
                  : styles.noticeInfo
            )}
          >
            {notice.text}
          </div>
        ) : null}

        <section
          ref={activePage === "dashboard" ? activeSectionRef : null}
          className={joinClassNames(styles.pageSection, activePage === "dashboard" ? styles.pageSectionActive : undefined)}
        >
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Your personalized dashboard</div>
              <div className={styles.sectionSubtitle}>Reports, OCR, explanations, risk flags, and chat history scoped to this account.</div>
            </div>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <div className={joinClassNames(styles.statIcon, styles.statBlue)}>
                <FileIcon />
              </div>
              <div className={styles.statLabel}>Total Reports</div>
              <div className={joinClassNames(styles.statValue, styles.serif)}>{reports.length}</div>
              <div className={joinClassNames(styles.statChange, styles.statNeu)}>All time</div>
            </div>

            <div className={styles.statCard}>
              <div className={joinClassNames(styles.statIcon, styles.statGreen)}>
                <CheckIcon />
              </div>
              <div className={styles.statLabel}>Ready</div>
              <div className={joinClassNames(styles.statValue, styles.serif)}>{readyReports}</div>
              <div className={joinClassNames(styles.statChange, styles.statPos)}>
                {reports.length > 0 ? `${readyPercentage}% processed` : "No reports yet"}
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={joinClassNames(styles.statIcon, styles.statAmber)}>
                <AlertIcon />
              </div>
              <div className={styles.statLabel}>Risk Flags</div>
              <div className={joinClassNames(styles.statValue, styles.serif)}>{riskFlagsCount}</div>
              <div className={joinClassNames(styles.statChange, styles.statNeu)}>
                {selectedReport ? formatLabel(selectedReport.report_status) : "Select a report"}
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={joinClassNames(styles.statIcon, styles.statIndigo)}>
                <ChatIcon />
              </div>
              <div className={styles.statLabel}>Chat Messages</div>
              <div className={joinClassNames(styles.statValue, styles.serif)}>{chatMessages.length}</div>
              <div className={joinClassNames(styles.statChange, styles.statNeu)}>
                {selectedReport ? "For selected report" : "No report selected"}
              </div>
            </div>
          </div>

          <div className={styles.contentGrid}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Recent Reports</div>

              {reports.length === 0 ? (
                <div className={styles.emptyCard}>Upload a medical report to populate your workspace history.</div>
              ) : (
                reports.slice(0, 6).map((report) => {
                  const isActive = selectedReportId === report.id;

                  return (
                    <button
                      key={report.id}
                      type="button"
                      className={joinClassNames(styles.reportItem, isActive ? styles.reportItemActive : undefined)}
                      onClick={() => onSelectReport(report.id)}
                    >
                      <div className={styles.reportThumb}>
                        <FileIcon />
                      </div>

                      <div className={styles.reportContent}>
                        <div className={styles.reportName}>{report.title || report.original_filename}</div>
                        <div className={styles.reportMeta}>
                          {[report.mime_type, formatFileSize(report.file_size), formatDate(report.created_at)].filter(Boolean).join(" | ")}
                        </div>

                        {isActive && confidenceSummary ? (
                          <div className={styles.confidenceWrap}>
                            <div className={styles.confidenceLabel}>
                              <span>AI Confidence</span>
                              <span>{confidenceSummary.analysis.score}%</span>
                            </div>
                            <div className={styles.confidenceBar}>
                              <div
                                className={styles.confidenceFill}
                                style={{ width: `${getConfidenceWidth(confidenceSummary.analysis.score)}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <span className={joinClassNames(styles.reportBadge, getReportBadgeTone(report.report_status))}>
                        {formatLabel(report.report_status)}
                      </span>
                    </button>
                  );
                })
              )}

              <div className={joinClassNames(styles.infoBox, styles.infoBlue)}>
                <InfoIcon />
                {selectedReport ? (
                  <span>
                    Selected report: <strong>{selectedReport.title || selectedReport.original_filename}</strong>
                  </span>
                ) : (
                  <span>Your uploads, extracted text, explanations, and chat history stay scoped to this signed-in account.</span>
                )}
              </div>
            </div>

            <div className={styles.sideStack}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Scan Snapshot</div>

                {reportLoading ? (
                  <div className={styles.emptyCard}>Loading OCR and report details...</div>
                ) : !selectedReport ? (
                  <div className={styles.emptyCard}>Select a report to review the stored OCR output.</div>
                ) : (
                  <>
                    <div className={styles.ocrSummary}>
                      <strong>{analysis?.documentType || "Medical report"}</strong>
                      <span>{selectedReport.ocr_engine || "OCR pending"}</span>
                    </div>

                    <div className={styles.metricPillRow}>
                      <span className={styles.metricPill}>{selectedTests.length} tests</span>
                      <span className={styles.metricPill}>{selectedMedicines.length} medicines</span>
                      <span className={styles.metricPill}>{ocrPreviewLines.length} visible lines</span>
                    </div>

                    {ocrPreviewLines.length > 0 ? (
                      <div className={styles.ocrPreview}>
                        {ocrPreviewLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyInline}>OCR text is not available yet.</div>
                    )}

                    <div className={styles.stepRow}>
                      <div className={joinClassNames(styles.stepPill, analysis?.plainLanguageSummary ? styles.stepDone : undefined)}>
                        <CheckIcon />
                        Plain language
                      </div>
                      <div className={joinClassNames(styles.stepPill, insights?.summary ? styles.stepDone : undefined)}>
                        <CheckIcon />
                        Risk assessed
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Doctor Recommendations</div>

                {doctorRecommendationLoading ? (
                  <div className={styles.emptyCard}>Reviewing stored findings for doctor suggestions...</div>
                ) : doctorRecommendationError ? (
                  <div className={styles.emptyCard}>{doctorRecommendationError}</div>
                ) : topDoctorRecommendations.length === 0 ? (
                  <div className={styles.emptyCard}>No doctor recommendation is available for the selected report.</div>
                ) : (
                  topDoctorRecommendations.map((item) => (
                    <div key={item.specialist} className={styles.docRec}>
                      <div className={styles.docRecIcon}>
                        <DoctorIcon />
                      </div>
                      <div className={styles.docRecCopy}>
                        <div className={styles.docRecTitle}>{item.specialist}</div>
                        <div className={styles.docRecDesc}>{item.reason}</div>
                      </div>
                      <span className={joinClassNames(styles.severityBadge, getSeverityClassName(item.priority))}>
                        {formatLabel(item.priority)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Risk Snapshot</div>

                {reportLoading ? (
                  <div className={styles.emptyCard}>Loading risk layers...</div>
                ) : (
                  <>
                    <div className={styles.summaryBadgeRow}>
                      <span
                        className={joinClassNames(
                          styles.severityBadge,
                          getSeverityClassName(riskSection.tone)
                        )}
                      >
                        {riskSection.label}
                      </span>
                    </div>
                    <p className={styles.sectionNote}>{riskSection.summary}</p>
                    {riskSection.highlights.length > 0 ? (
                      <ul className={styles.summaryHighlights}>
                        {riskSection.highlights.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className={styles.inlineStatusRow}>
                        <CheckIcon className={styles.inlineStatusIcon} />
                        No additional risk highlight is available.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {!selectedReport ? (
            <div className={styles.card}>
              <div className={styles.emptyState}>
                <h3>No report selected</h3>
                <p>Upload a medical document and pick a report from the list to review stored OCR, extracted findings, reminders, trends, comparison data, and chat context.</p>
              </div>
            </div>
          ) : reportLoading ? (
            <div className={styles.card}>
              <div className={styles.emptyState}>
                <h3>Loading report</h3>
                <p>Fetching the latest OCR, explanation, insights, and chat context.</p>
              </div>
            </div>
          ) : (
            <>
              {emergencyAlerts.length > 0 ? (
                <section className={styles.emergencyBannerStack} aria-label="Emergency risk alerts">
                  {emergencyAlerts.map((alert) => (
                    <article key={alert.id} className={styles.emergencyBanner}>
                      <div className={styles.emergencyBannerHead}>
                        <span className={styles.emergencyBannerLabel}>Emergency risk detection</span>
                        <span className={joinClassNames(styles.severityBadge, getSeverityClassName(alert.alert_type))}>
                          {formatLabel(alert.alert_type)}
                        </span>
                      </div>
                      <p>{alert.message}</p>
                    </article>
                  ))}
                </section>
              ) : null}

              <div className={styles.selectedReportHead}>
                <div>
                  <h3 className={styles.serif}>{selectedReport.title || selectedReport.original_filename}</h3>
                  <p>{[selectedReport.original_filename, selectedReport.mime_type, formatFileSize(selectedReport.file_size)].filter(Boolean).join(" | ")}</p>
                </div>
                <span className={joinClassNames(styles.reportBadge, getReportBadgeTone(selectedReport.report_status))}>
                  {formatLabel(selectedReport.report_status)}
                </span>
              </div>

              <div className={styles.summaryGrid}>
                <article className={joinClassNames(styles.card, styles.summaryCard)}>
                  <span className={styles.cardLabel}>OCR Overview</span>
                  <p>{analysis?.overview || "Analysis not generated yet."}</p>
                  {ocrPreviewLines.length > 0 ? (
                    <ul className={styles.summaryHighlights}>
                      {ocrPreviewLines.slice(0, 3).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
                <article className={joinClassNames(styles.card, styles.summaryCard)}>
                  <span className={styles.cardLabel}>Plain Language Explanation</span>
                  <p>
                    {analysis?.plainLanguageSummary ||
                      "Plain-language explanation will appear after AI processing."}
                  </p>
                </article>
                <article className={joinClassNames(styles.card, styles.summaryCard)}>
                  <div className={styles.summaryBadgeRow}>
                    <span className={styles.cardLabel}>Risk Section</span>
                    <span
                      className={joinClassNames(
                        styles.severityBadge,
                        getSeverityClassName(riskSection.tone)
                      )}
                    >
                      {riskSection.label}
                    </span>
                  </div>
                  <p>{riskSection.summary}</p>
                  {riskSection.highlights.length > 0 ? (
                    <ul className={styles.summaryHighlights}>
                      {riskSection.highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              </div>

              <div className={styles.detailGrid}>
                <section className={joinClassNames(styles.card, styles.detailCard)}>
                  <div className={styles.detailHead}>
                    <h3>AI Confidence Score</h3>
                    <span>{confidenceLoading ? "Loading..." : confidenceSummary ? `${confidenceSummary.overall.score}%` : "Unavailable"}</span>
                  </div>
                  <p className={styles.sectionNote}>Confidence is appended as metadata from OCR quality and AI output completeness.</p>
                  {confidenceLoading ? (
                    <div className={styles.emptyInline}>Calculating OCR and AI confidence metadata.</div>
                  ) : confidenceError ? (
                    <div className={styles.emptyInline}>{confidenceError}</div>
                  ) : confidenceSummary ? (
                    <div className={styles.confidenceCardGrid}>
                      <article className={styles.miniCard}>
                        <span className={styles.cardLabel}>OCR confidence</span>
                        <strong>{confidenceSummary.ocr.score}%</strong>
                        <span className={joinClassNames(styles.severityBadge, getSeverityClassName(confidenceSummary.ocr.level))}>
                          {formatConfidenceLevel(confidenceSummary.ocr.level)}
                        </span>
                      </article>
                      <article className={styles.miniCard}>
                        <span className={styles.cardLabel}>AI confidence</span>
                        <strong>{confidenceSummary.analysis.score}%</strong>
                        <span className={joinClassNames(styles.severityBadge, getSeverityClassName(confidenceSummary.analysis.level))}>
                          {formatConfidenceLevel(confidenceSummary.analysis.level)}
                        </span>
                      </article>
                      <article className={styles.miniCard}>
                        <span className={styles.cardLabel}>Overall</span>
                        <strong>{confidenceSummary.overall.score}%</strong>
                        <span className={joinClassNames(styles.severityBadge, getSeverityClassName(confidenceSummary.overall.level))}>
                          {formatConfidenceLevel(confidenceSummary.overall.level)}
                        </span>
                      </article>
                    </div>
                  ) : (
                    <div className={styles.emptyInline}>Confidence metadata is not available yet.</div>
                  )}
                  {confidenceReasons.length > 0 ? (
                    <ul className={styles.reasonList}>
                      {confidenceReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section className={joinClassNames(styles.card, styles.detailCard)}>
                  <div className={styles.detailHead}>
                    <h3>Medicines</h3>
                    <span>{selectedMedicines.length}</span>
                  </div>
                  {selectedMedicines.length === 0 ? (
                    <div className={styles.emptyInline}>No medicines extracted.</div>
                  ) : (
                    <div className={styles.stackList}>
                      {selectedMedicines.map((medicine) => (
                        <article key={`${medicine.name}-${medicine.dosage}-${medicine.frequency}`} className={styles.listCard}>
                          <strong>{medicine.name}</strong>
                          <span>{[medicine.dosage, medicine.frequency].filter(Boolean).join(" | ") || "Schedule unavailable"}</span>
                          <p>{medicine.purpose || medicine.notes || "No additional notes extracted."}</p>
                          {"source" in medicine && medicine.source === "ocr" ? (
                            <small>Recovered directly from OCR structure because AI medicine extraction was empty.</small>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className={joinClassNames(styles.card, styles.detailCard)}>
                  <div className={styles.detailHead}>
                    <h3>Doctor Recommendations</h3>
                    <span>{doctorRecommendationLoading ? "Loading..." : doctorRecommendations.length}</span>
                  </div>
                  <p className={styles.sectionNote}>Suggested from stored detected conditions and risk signals without changing the original AI analysis.</p>
                  {doctorRecommendationLoading ? (
                    <div className={styles.emptyInline}>Reviewing stored findings to match the most relevant doctor types.</div>
                  ) : doctorRecommendationError ? (
                    <div className={styles.emptyInline}>{doctorRecommendationError}</div>
                  ) : doctorRecommendations.length === 0 ? (
                    <div className={styles.emptyInline}>No doctor recommendation is available for this report.</div>
                  ) : (
                    <div className={styles.stackList}>
                      {doctorRecommendations.map((item) => (
                        <article key={item.specialist} className={styles.listCard}>
                          <div className={styles.listCardHead}>
                            <strong>{item.specialist}</strong>
                            <span className={joinClassNames(styles.severityBadge, getSeverityClassName(item.priority))}>
                              {formatLabel(item.priority)}
                            </span>
                          </div>
                          <p>{item.reason}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className={joinClassNames(styles.card, styles.detailCard)}>
                  <div className={styles.detailHead}>
                    <h3>Precautions</h3>
                    <span>Safety-first</span>
                  </div>
                  <div className={styles.bulletGrid}>
                    <div className={styles.bulletCard}>
                      <strong>Precautions</strong>
                      {displayPrecautions.length ? (
                        <ul>
                          {displayPrecautions.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className={styles.emptyInline}>No precautions extracted yet.</div>
                      )}
                    </div>
                    <div className={styles.bulletCard}>
                        <strong>Questions to ask</strong>
                        {analysis?.followUpQuestions?.length ? (
                          <ul>
                            {analysis.followUpQuestions.map((item) => (
                              <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className={styles.emptyInline}>No follow-up questions extracted yet.</div>
                      )}
                    </div>
                  </div>
                  <div className={joinClassNames(styles.infoBox, styles.infoAmber)}>
                    <AlertIcon />
                    {insights?.safetyNotice || "This workspace provides educational support and does not replace clinical care."}
                  </div>
                </section>

                <section className={joinClassNames(styles.card, styles.detailCard, styles.span2)}>
                  <div className={styles.detailHead}>
                    <h3>Extracted Test Values</h3>
                    <span>{selectedTests.length}</span>
                  </div>
                  {selectedTests.length === 0 ? (
                    <div className={styles.emptyInline}>No structured test values were extracted.</div>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.dataTable}>
                        <thead>
                          <tr>
                            <th>Test</th>
                            <th>Value</th>
                            <th>Reference</th>
                            <th>Status</th>
                            <th>Meaning</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTests.map((test) => (
                            <tr key={`${test.name}-${test.value}`}>
                              <td>{test.name}</td>
                              <td>{[test.value, test.unit].filter(Boolean).join(" ")}</td>
                              <td>{test.referenceRange || "Not provided"}</td>
                              <td>
                                <span className={joinClassNames(styles.severityBadge, getSeverityClassName(test.status))}>
                                  {formatLabel(test.status)}
                                </span>
                              </td>
                              <td>{test.explanation || "No interpretation available."}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className={joinClassNames(styles.card, styles.detailCard, styles.span2)}>
                  <div className={styles.detailHead}>
                    <h3>OCR Text</h3>
                    <span>{selectedReport.ocr_engine || "Pending"}</span>
                  </div>
                  <pre className={styles.ocrText}>{selectedReport.ocr_text || "OCR text not available yet."}</pre>
                </section>
              </div>
            </>
          )}
        </section>

        <section
          ref={activePage === "upload" ? activeSectionRef : null}
          className={joinClassNames(styles.pageSection, activePage === "upload" ? styles.pageSectionActive : undefined)}
        >
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Upload Report</div>
              <div className={styles.sectionSubtitle}>Supported formats: JPG, PNG, PDF</div>
            </div>
          </div>

          <div className={joinClassNames(styles.card, styles.uploadCard)}>
            <div className={styles.uploadZone} onClick={() => uploadInputRef.current?.click()}>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={onSelectFile}
                className={styles.hiddenFileInput}
                disabled={processing}
              />

              <div className={styles.uploadIcon}>
                <UploadIcon />
              </div>

              <div className={styles.uploadTitle}>
                {file ? "Report ready for analysis" : "Drop your medical report here"}
              </div>
              <div className={styles.uploadSub}>
                {file ? `${file.name} (${formatFileSize(file.size)})` : "or click to browse files"}
              </div>

              <div className={styles.uploadTypes}>
                <span className={styles.typePill}>JPG</span>
                <span className={styles.typePill}>PNG</span>
                <span className={styles.typePill}>PDF</span>
              </div>

              <button
                type="button"
                className={styles.btnPrimary}
                onClick={(event) => {
                  event.stopPropagation();
                  uploadInputRef.current?.click();
                }}
              >
                <UploadIcon />
                Choose a medical report
              </button>
            </div>

            {file ? <div className={styles.fileInfo}>Selected: {file.name} ({formatFileSize(file.size)})</div> : null}

            <div className={styles.actionRow}>
              <button type="button" className={styles.btnPrimary} onClick={onAnalyze} disabled={!file || processing}>
                {processing ? "Processing..." : "Upload and analyze"}
              </button>
            </div>

            {pipelineStatus ? (
              <div className={joinClassNames(styles.infoBox, styles.infoBlue)}>
                <InfoIcon />
                {pipelineStatus}
              </div>
            ) : null}

            <div className={joinClassNames(styles.infoBox, styles.infoBlue)}>
              <InfoIcon />
              Your uploads are scoped to this account. Reports are analyzed privately and not shared.
            </div>
          </div>
        </section>

        <section
          ref={activePage === "trends" ? activeSectionRef : null}
          className={joinClassNames(styles.pageSection, activePage === "trends" ? styles.pageSectionActive : undefined)}
        >
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Health Trends</div>
              <div className={styles.sectionSubtitle}>Time-based charts for glucose, cholesterol, and hemoglobin using stored metrics only.</div>
            </div>
            <span className={styles.headerTag}>Stored metrics only</span>
          </div>
          <WorkspaceHealthTrendsPanel authorizedFetchJson={authorizedFetchJson} reports={reports} />
        </section>

        <section
          ref={activePage === "compare" ? activeSectionRef : null}
          className={joinClassNames(styles.pageSection, activePage === "compare" ? styles.pageSectionActive : undefined)}
        >
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Compare Reports</div>
              <div className={styles.sectionSubtitle}>Select two or more reports to compare them using AI-generated insights from OCR text and extracted analysis.</div>
            </div>
            <span className={styles.headerTag}>AI generated</span>
          </div>
          <WorkspaceReportComparisonPanel authorizedFetchJson={authorizedFetchJson} reports={reports} selectedReportId={selectedReportId} />
        </section>

        <section
          ref={activePage === "reminders" ? activeSectionRef : null}
          className={joinClassNames(styles.pageSection, activePage === "reminders" ? styles.pageSectionActive : undefined)}
        >
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Medicine Reminders</div>
              <div className={styles.sectionSubtitle}>Set reminder times from medicines extracted in your selected report.</div>
            </div>
          </div>
          <WorkspaceRemindersPanel
            authorizedFetchJson={authorizedFetchJson}
            selectedReport={reportLoading ? null : selectedReport}
          />
        </section>

        <section
          ref={activePage === "chat" ? activeSectionRef : null}
          className={joinClassNames(
            styles.pageSection,
            styles.chatPageSection,
            activePage === "chat" ? styles.pageSectionActive : undefined
          )}
        >
          <div className={styles.chatViewport}>
            <div className={styles.chatPageHeader}>
              <div className={styles.chatPageIntro}>
                <div className={styles.chatEyebrow}>Grounded medical assistant</div>
                <div className={joinClassNames(styles.chatPageTitle, styles.serif)}>AI Assistant</div>
                <div className={styles.chatPageSubtitle}>
                  Ask follow-up questions about your report findings, medicines, test values, or symptoms while keeping the same grounded chat workflow.
                </div>
                <div className={styles.chatHeroTags}>
                  {chatScopeBadges.map((item) => (
                    <span key={item} className={styles.chatHeroTag}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.chatHeroCard}>
                <div className={styles.chatHeroCardEyebrow}>
                  {selectedReport ? "Loaded report" : "Workspace glance"}
                </div>
                <div className={styles.chatHeroCardTitle}>
                  {selectedReport ? getReportDisplayName(selectedReport) : "Chat workspace overview"}
                </div>
                <div className={styles.chatHeroCardMeta}>
                  {selectedReport
                    ? `${formatShortDate(selectedReport.created_at)} - ${
                        selectedReport.analysis_json
                          ? "Structured analysis is ready for grounded follow-up questions."
                          : "Analysis is still processing before chat can answer."
                      }`
                    : reports.length
                      ? "Pick a saved report to ask grounded questions about findings, medicines, or symptoms."
                      : "Upload a report to unlock a report-grounded assistant conversation."}
                </div>

                <div className={styles.chatHeroStats}>
                  {chatHeroStats.map((item) => (
                    <div key={item.label} className={styles.chatHeroStat}>
                      <span className={styles.chatHeroStatValue}>{item.value}</span>
                      <span className={styles.chatHeroStatLabel}>{item.label}</span>
                      <span className={styles.chatHeroStatHint}>{item.hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.chatTopRow}>
              <div
                ref={reportSelectorRef}
                className={joinClassNames(
                  styles.chatReportSelector,
                  reportMenuOpen ? styles.chatReportSelectorOpen : undefined
                )}
              >
                <button
                  type="button"
                  className={styles.chatReportTrigger}
                  onClick={() => {
                    if (reports.length) {
                      setReportMenuOpen((open) => !open);
                    }
                  }}
                  aria-expanded={reportMenuOpen}
                  aria-haspopup="listbox"
                  disabled={!reports.length}
                >
                  <FileIcon className={styles.chatReportTriggerIcon} />
                  <span className={styles.chatReportTriggerText}>
                    {selectedReport ? getReportDisplayName(selectedReport) : reports.length ? "Select a report" : "No reports available"}
                  </span>
                  <span className={styles.chatReportChevron} aria-hidden="true">
                    v
                  </span>
                </button>

                {reportMenuOpen && reports.length ? (
                  <div className={styles.chatReportDropdown} role="listbox" aria-label="Select report for chat">
                    {reports.map((report) => {
                      const isActive = report.id === selectedReportId;

                      return (
                        <button
                          key={report.id}
                          type="button"
                          className={joinClassNames(
                            styles.chatReportOption,
                            isActive ? styles.chatReportOptionActive : undefined
                          )}
                          onClick={() => {
                            onSelectReport(report.id);
                            setReportMenuOpen(false);
                          }}
                        >
                          <span className={styles.chatReportOptionDot} aria-hidden="true" />
                          <span className={styles.chatReportOptionBody}>
                            <span className={styles.chatReportOptionMain}>{getReportDisplayName(report)}</span>
                            <span className={styles.chatReportOptionMeta}>
                              {formatShortDate(report.created_at)} - {formatLabel(report.report_status)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <span className={styles.chatCount}>
                {chatMessages.length} message{chatMessages.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className={joinClassNames(styles.card, styles.chatCard)}>
              {!selectedReport ? (
                <div className={styles.chatEmptyState}>
                  Select a report to start asking about medicines, values, report sections, or symptoms.
                </div>
              ) : reportLoading ? (
                <div className={styles.chatEmptyState}>Loading report chat context...</div>
              ) : null}

              {selectedReport && !reportLoading ? (
                <>
                  <div className={styles.chatCardHeader}>
                    <div className={styles.chatCardHeaderMain}>
                      <div className={styles.chatHeaderIcon}>
                        <ChatIcon />
                      </div>
                      <div className={styles.chatCardHeading}>
                        <div className={joinClassNames(styles.chatCardTitle, styles.serif)}>MediScan AI Chat</div>
                        <div className={styles.chatCardSubtitle}>
                          {getReportDisplayName(selectedReport)} - {formatShortDate(selectedReport.created_at)}
                        </div>
                      </div>
                    </div>

                    <div className={styles.chatCardHeaderAside}>
                      <span
                        className={joinClassNames(
                          styles.chatReadyPill,
                          selectedReport.analysis_json ? styles.chatReadyPillActive : styles.chatReadyPillPending
                        )}
                      >
                        <span className={styles.chatReadyDot} aria-hidden="true" />
                        {selectedReport.analysis_json ? "AI Ready" : "Analysis pending"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.chatCardBody}>
                    <div className={styles.chatWorkspaceGrid}>
                      <div className={styles.chatConversationColumn}>
                        <div className={styles.chatConversationHeader}>
                          <div className={styles.chatConversationEyebrow}>Conversation thread</div>
                          <div className={styles.chatConversationHint}>
                            {selectedReport.analysis_json
                              ? "Replies stay anchored to OCR text, extracted findings, and structured analysis from this report."
                              : "Analysis needs to finish before report-grounded follow-up replies can be generated."}
                          </div>
                        </div>

                        <div className={styles.chatAreaWrap}>
                          <div
                            ref={chatAreaRef}
                            className={styles.chatArea}
                            role="log"
                            aria-live="polite"
                            aria-relevant="additions text"
                          >
                            <div className={styles.chatThread}>
                              {chatMessages.length === 0 && !chatLoading ? (
                                <div className={styles.chatEmpty}>
                                  <span className={styles.chatEmptyBadge}>
                                    {selectedReport.analysis_json ? "Assistant ready" : "Analysis pending"}
                                  </span>
                                  <div className={styles.chatEmptyTitle}>Start with a grounded question</div>
                                  <p className={styles.chatEmptyText}>
                                    Ask about a medicine, test value, report section, or symptoms like fever or headache while keeping the selected report in scope.
                                  </p>
                                  <div className={styles.chatEmptyPromptGrid}>
                                    {emptyChatPrompts.map((prompt) => (
                                      <button
                                        key={prompt}
                                        type="button"
                                        className={styles.chatQuickPrompt}
                                        onClick={() => handleQuickPromptSelect(prompt)}
                                        disabled={chatDisabled}
                                      >
                                        {prompt}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : chatMessages.length > 0 ? (
                                chatMessages.map((message: ChatMessageRecord) => (
                                  <div
                                    key={message.id}
                                    className={joinClassNames(
                                      styles.chatMessageRow,
                                      message.role === "assistant" ? styles.chatMessageRowAssistant : styles.chatMessageRowUser
                                    )}
                                  >
                                    <div className={styles.chatMessageLabel}>
                                      <span
                                        className={joinClassNames(
                                          styles.chatMessagePill,
                                          message.role === "assistant"
                                            ? styles.chatMessagePillAssistant
                                            : styles.chatMessagePillUser
                                        )}
                                      >
                                        {message.role === "assistant" ? "AI" : "You"}
                                      </span>
                                      <span>{message.role === "assistant" ? "MediScan AI" : "You"}</span>
                                    </div>

                                    <article
                                      className={joinClassNames(
                                        styles.chatBubble,
                                        message.role === "assistant" ? styles.chatAssistant : styles.chatUser
                                      )}
                                    >
                                      <p>{message.message}</p>
                                      {message.role === "assistant" ? (
                                        <>
                                          <div className={styles.chatBubbleActions}>
                                            <button
                                              type="button"
                                              className={styles.speakButton}
                                              disabled={humanizingMessageId === message.id}
                                              onClick={() => onHumanizeMessage(message.id, message.message)}
                                            >
                                              {humanizingMessageId === message.id
                                                ? "Humanizing..."
                                                : humanizedMessages[message.id]
                                                  ? "Hide humanized"
                                                  : "Humanize"}
                                            </button>
                                            <button
                                              type="button"
                                              className={styles.speakButton}
                                              onClick={() => onSpeakMessage(message.id, message.message)}
                                            >
                                              {speakingMessageId === message.id ? "Stop voice" : "Read aloud"}
                                            </button>
                                          </div>

                                          {humanizedMessages[message.id] ? (
                                            <div className={styles.humanizedReply}>
                                              <strong>Humanized</strong>
                                              <p>{humanizedMessages[message.id]}</p>
                                            </div>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </article>

                                    <div className={styles.chatMessageTime}>{formatDate(message.created_at)}</div>
                                  </div>
                                ))
                              ) : null}

                              {chatLoading ? (
                                <div className={joinClassNames(styles.chatMessageRow, styles.chatMessageRowAssistant)}>
                                  <div className={styles.chatMessageLabel}>
                                    <span className={joinClassNames(styles.chatMessagePill, styles.chatMessagePillAssistant)}>
                                      AI
                                    </span>
                                    <span>MediScan AI</span>
                                  </div>
                                  <div
                                    className={joinClassNames(
                                      styles.chatBubble,
                                      styles.chatAssistant,
                                      styles.chatTypingBubble
                                    )}
                                  >
                                    <span className={styles.chatTypingDot} />
                                    <span className={styles.chatTypingDot} />
                                    <span className={styles.chatTypingDot} />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {showScrollLatestButton ? (
                            <button
                              type="button"
                              className={styles.chatScrollLatestButton}
                              onClick={handleScrollToLatest}
                              aria-label="Scroll to latest message"
                              title="Scroll to latest message"
                            >
                              <svg
                                className={styles.chatScrollLatestIcon}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                aria-hidden="true"
                              >
                                <path d="M12 5v14" />
                                <path d="m6 13 6 6 6-6" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <aside className={styles.chatAssistantRail}>
                        <div className={joinClassNames(styles.supportCard, styles.chatRailCard)}>
                          <div className={styles.chatRailHeader}>
                            <div className={styles.chatRailTitle}>Starter prompts</div>
                            <div className={styles.chatRailText}>
                              Tap one to seed the composer with a grounded follow-up question.
                            </div>
                          </div>

                          <div className={styles.chatQuickPrompts}>
                            {emptyChatPrompts.map((prompt) => (
                              <button
                                key={prompt}
                                type="button"
                                className={styles.chatQuickPrompt}
                                onClick={() => handleQuickPromptSelect(prompt)}
                                disabled={chatDisabled}
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className={joinClassNames(styles.supportCard, styles.chatRailCard)}>
                          <div className={styles.chatRailHeader}>
                            <div className={styles.chatRailTitle}>Context in scope</div>
                            <div className={styles.chatRailText}>
                              These topics are already present in the loaded report context.
                            </div>
                          </div>

                          {chatFocusItems.length ? (
                            <div className={styles.chatTopicList}>
                              {chatFocusItems.map((item) => (
                                <span key={item} className={styles.chatTopicPill}>
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className={styles.emptyInline}>No structured context has been extracted yet.</div>
                          )}
                        </div>

                        <div className={styles.chatSupportGrid}>
                          <div className={joinClassNames(styles.supportCard, styles.chatSupportCard)}>
                            <div className={styles.chatSupportTitle}>Precautions</div>
                            {displayPrecautions.length ? (
                              <ul>
                                {displayPrecautions.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className={styles.emptyInline}>No precautions extracted yet.</div>
                            )}
                          </div>

                          <div className={joinClassNames(styles.supportCard, styles.chatSupportCard)}>
                            <div className={styles.chatSupportTitle}>Questions to ask</div>
                            {analysis?.followUpQuestions?.length ? (
                              <ul>
                                {analysis.followUpQuestions.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className={styles.emptyInline}>No follow-up questions extracted yet.</div>
                            )}
                          </div>
                        </div>

                        <div className={joinClassNames(styles.infoBox, styles.infoAmber, styles.chatInfoBox)}>
                          <AlertIcon />
                          <span>
                            {insights?.safetyNotice || "This tool provides educational insights and cannot replace medical diagnosis, emergency care, or prescription decisions."}
                          </span>
                        </div>

                        {!selectedReport.analysis_json ? (
                          <div className={styles.voiceNote}>
                            The report needs structured analysis before chat can answer follow-up questions.
                          </div>
                        ) : null}

                        {speechNotice ? <div className={styles.voiceNote}>{speechNotice}</div> : null}
                      </aside>
                    </div>
                  </div>

                  <form className={styles.chatInputRow} onSubmit={onAskQuestion}>
                    <button
                      type="button"
                      className={joinClassNames(styles.chatMic, listening ? styles.chatMicActive : undefined)}
                      onClick={onMicInput}
                      disabled={chatDisabled}
                      aria-label={listening ? "Stop voice input" : "Start voice input"}
                    >
                      <MicIcon />
                    </button>
                    <div className={styles.chatInputWrap}>
                      <input
                        ref={chatInputRef}
                        className={styles.chatInput}
                        value={chatInput}
                        onChange={(event) => onChatInputChange(event.target.value)}
                        placeholder="Ask about a medicine, test value, report section, or symptom..."
                        disabled={chatDisabled}
                      />
                      <div className={styles.chatInputHint}>
                        <span>
                          {selectedReport
                            ? `Context: ${getReportDisplayName(selectedReport)}`
                            : "Select a report to unlock grounded chat"}
                        </span>
                        <span>
                          {listening
                            ? "Listening for voice input..."
                            : chatDisabled
                              ? "Follow-up replies unlock after analysis is ready."
                              : "Press Enter to send."}
                        </span>
                      </div>
                    </div>
                    <button type="submit" className={styles.chatSendButton} disabled={chatDisabled}>
                      <span>{chatLoading ? "Thinking..." : "Ask"}</span>
                      <span className={styles.chatSendArrow} aria-hidden="true">
                        {"->"}
                      </span>
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
