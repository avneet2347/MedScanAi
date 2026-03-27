"use client";

import type { ChangeEvent, FormEvent, RefObject } from "react";
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
  LogoIcon,
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
    .slice(0, 4);
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
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
  const selectedMedicines = analysis?.medicines || [];
  const selectedConditions = analysis?.possibleConditions || [];
  const selectedTests = analysis?.testValues || [];
  const ocrPreviewLines = getOcrPreviewLines(selectedReport?.ocr_text);
  const topDoctorRecommendations = doctorRecommendations.slice(0, 2);

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
        <div className={styles.sidebarLogo}>
          <div className={styles.logoIcon}>
            <LogoIcon />
          </div>
          <span className={joinClassNames(styles.logoText, styles.serif)}>
            MedScan<span>AI</span>
          </span>
        </div>

        <div className={styles.sidebarSectionLabel}>Main</div>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "dashboard" ? styles.navActive : undefined)}
          onClick={() => onShowPage("dashboard")}
        >
          <DashboardIcon className={styles.navIcon} />
          Dashboard
        </button>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "upload" ? styles.navActive : undefined)}
          onClick={() => onShowPage("upload")}
        >
          <UploadIcon className={styles.navIcon} />
          Upload Report
        </button>

        <div className={styles.sidebarSectionLabel}>Insights</div>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "trends" ? styles.navActive : undefined)}
          onClick={() => onShowPage("trends")}
        >
          <TrendsIcon className={styles.navIcon} />
          Health Trends
        </button>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "compare" ? styles.navActive : undefined)}
          onClick={() => onShowPage("compare")}
        >
          <CompareIcon className={styles.navIcon} />
          Compare Reports
        </button>

        <div className={styles.sidebarSectionLabel}>Tools</div>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "reminders" ? styles.navActive : undefined)}
          onClick={() => onShowPage("reminders")}
        >
          <BellIcon className={styles.navIcon} />
          Reminders
          <span className={styles.navBadge}>{selectedMedicines.length}</span>
        </button>
        <button
          type="button"
          className={joinClassNames(styles.navItem, activePage === "chat" ? styles.navActive : undefined)}
          onClick={() => onShowPage("chat")}
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

      <main className={styles.main}>
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

        <section className={joinClassNames(styles.pageSection, activePage === "dashboard" ? styles.pageSectionActive : undefined)}>
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
                <div className={styles.cardTitle}>OCR Overview</div>

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
                <div className={styles.cardTitle}>Doctor Recommendation</div>

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
                <div className={styles.cardTitle}>Health Alerts</div>

                {reportLoading ? (
                  <div className={styles.emptyCard}>Loading alert layers...</div>
                ) : emergencyAlerts.length === 0 && ruleAlerts.length === 0 ? (
                  <div className={styles.inlineStatusRow}>
                    <CheckIcon className={styles.inlineStatusIcon} />
                    No rule-based alerts generated
                  </div>
                ) : (
                  <div className={styles.stackList}>
                    {emergencyAlerts.map((alert) => (
                      <article key={alert.id} className={joinClassNames(styles.summaryAlert, styles.summaryAlertCritical)}>
                        <strong>{formatLabel(alert.alert_type)}</strong>
                        <p>{alert.message}</p>
                      </article>
                    ))}
                    {ruleAlerts.slice(0, 2).map((alert) => (
                      <article key={`${alert.title}-${alert.reason}`} className={styles.summaryAlert}>
                        <strong>{alert.title}</strong>
                        <p>{alert.reason}</p>
                      </article>
                    ))}
                  </div>
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
                  <span className={styles.cardLabel}>Overview</span>
                  <p>{analysis?.overview || "Analysis not generated yet."}</p>
                </article>
                <article className={joinClassNames(styles.card, styles.summaryCard)}>
                  <span className={styles.cardLabel}>Plain Language</span>
                  <p>{analysis?.plainLanguageSummary || "Plain-language explanation will appear after AI processing."}</p>
                </article>
                <article className={joinClassNames(styles.card, styles.summaryCard)}>
                  <span className={styles.cardLabel}>Risk</span>
                  <p>{insights?.summary || "Health insights will appear after analysis."}</p>
                </article>
              </div>

              <div className={styles.detailGrid}>
                <section className={joinClassNames(styles.card, styles.detailCard)}>
                  <div className={styles.detailHead}>
                    <h3>AI Confidence</h3>
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
                </section>

                <section className={joinClassNames(styles.card, styles.detailCard)}>
                  <div className={styles.detailHead}>
                    <h3>Possible Conditions</h3>
                    <span>{selectedConditions.length}</span>
                  </div>
                  {selectedConditions.length === 0 ? (
                    <div className={styles.emptyInline}>No condition hypotheses detected.</div>
                  ) : (
                    <div className={styles.stackList}>
                      {selectedConditions.map((item) => (
                        <article key={`${item.name}-${item.evidence}`} className={styles.listCard}>
                          <div className={styles.listCardHead}>
                            <strong>{item.name}</strong>
                            <span className={joinClassNames(styles.severityBadge, getSeverityClassName(item.confidence))}>
                              {formatLabel(item.confidence)}
                            </span>
                          </div>
                          <p>{item.explanation}</p>
                          <small>{item.evidence}</small>
                        </article>
                      ))}
                    </div>
                  )}
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
                        <article key={`${medicine.name}-${medicine.dosage}`} className={styles.listCard}>
                          <strong>{medicine.name}</strong>
                          <span>{[medicine.dosage, medicine.frequency].filter(Boolean).join(" | ") || "Schedule unavailable"}</span>
                          <p>{medicine.purpose || medicine.notes || "No additional notes extracted."}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className={joinClassNames(styles.card, styles.detailCard)}>
                  <div className={styles.detailHead}>
                    <h3>Health Alerts</h3>
                    <span>{ruleAlerts.length}</span>
                  </div>
                  {ruleAlerts.length === 0 ? (
                    <div className={styles.emptyInline}>No rule-based alerts generated.</div>
                  ) : (
                    <div className={styles.stackList}>
                      {ruleAlerts.map((alert) => (
                        <article key={`${alert.title}-${alert.reason}`} className={styles.listCard}>
                          <div className={styles.listCardHead}>
                            <strong>{alert.title}</strong>
                            <span className={joinClassNames(styles.severityBadge, getSeverityClassName(alert.severity))}>
                              {formatLabel(alert.severity)}
                            </span>
                          </div>
                          <p>{alert.reason}</p>
                          <small>{alert.recommendation}</small>
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
                    <h3>Precautions and Follow-up</h3>
                    <span>Safety-first</span>
                  </div>
                  <div className={styles.bulletGrid}>
                    <div className={styles.bulletCard}>
                      <strong>Precautions</strong>
                      {analysis?.precautions?.length ? (
                        <ul>
                          {analysis.precautions.map((item) => (
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

        <section className={joinClassNames(styles.pageSection, activePage === "upload" ? styles.pageSectionActive : undefined)}>
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

        <section className={joinClassNames(styles.pageSection, activePage === "trends" ? styles.pageSectionActive : undefined)}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Health Trends</div>
              <div className={styles.sectionSubtitle}>Time-based charts for glucose, cholesterol, and hemoglobin using stored metrics only.</div>
            </div>
            <span className={styles.headerTag}>Stored metrics only</span>
          </div>
          <WorkspaceHealthTrendsPanel authorizedFetchJson={authorizedFetchJson} reports={reports} />
        </section>

        <section className={joinClassNames(styles.pageSection, activePage === "compare" ? styles.pageSectionActive : undefined)}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Compare Reports</div>
              <div className={styles.sectionSubtitle}>Select two or more reports to compare stored metric differences and percentage change.</div>
            </div>
            <span className={styles.headerTag}>report_metrics only</span>
          </div>
          <WorkspaceReportComparisonPanel authorizedFetchJson={authorizedFetchJson} reports={reports} selectedReportId={selectedReportId} />
        </section>

        <section className={joinClassNames(styles.pageSection, activePage === "reminders" ? styles.pageSectionActive : undefined)}>
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

        <section className={joinClassNames(styles.pageSection, activePage === "chat" ? styles.pageSectionActive : undefined)}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={joinClassNames(styles.sectionTitle, styles.serif)}>Report Chat</div>
              <div className={styles.sectionSubtitle}>Ask follow-up questions once the selected report has been processed.</div>
            </div>
            <span className={styles.chatCount}>{chatMessages.length} messages</span>
          </div>

          <div className={joinClassNames(styles.card, styles.chatCard)}>
            {!selectedReport ? (
              <div className={styles.chatEmptyState}>Select a report to start asking questions about medicines, values, or report sections.</div>
            ) : reportLoading ? (
              <div className={styles.chatEmptyState}>Loading report chat context...</div>
            ) : (
              <>
                <div className={styles.chatReportMeta}>
                  <strong>{selectedReport.title || selectedReport.original_filename}</strong>
                  <span>{formatShortDate(selectedReport.created_at)}</span>
                </div>

                <div className={styles.chatArea}>
                  {chatMessages.length === 0 ? (
                    <div className={styles.chatEmpty}>No messages yet - ask about a medicine, test value, or report section.</div>
                  ) : (
                    chatMessages.map((message: ChatMessageRecord) => (
                      <article
                        key={message.id}
                        className={joinClassNames(
                          styles.chatBubble,
                          message.role === "assistant" ? styles.chatAssistant : styles.chatUser
                        )}
                      >
                        <div className={styles.chatBubbleHead}>
                          <strong>{message.role === "assistant" ? "AI" : "You"}</strong>
                          <span>{formatShortDate(message.created_at)}</span>
                        </div>
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
                    ))
                  )}
                </div>

                <div className={styles.chatSupportGrid}>
                  <div className={styles.supportCard}>
                    <div className={styles.cardTitle}>Precautions</div>
                    {analysis?.precautions?.length ? (
                      <ul>
                        {analysis.precautions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className={styles.emptyInline}>No precautions extracted yet.</div>
                    )}
                  </div>

                  <div className={styles.supportCard}>
                    <div className={styles.cardTitle}>Questions to ask</div>
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
                  {insights?.safetyNotice || "This tool provides educational insights and cannot replace medical diagnosis, emergency care, or prescription decisions."}
                </div>

                <form className={styles.chatInputRow} onSubmit={onAskQuestion}>
                  <button
                    type="button"
                    className={joinClassNames(styles.chatMic, listening ? styles.chatMicActive : undefined)}
                    onClick={onMicInput}
                    disabled={chatLoading || !selectedReport.analysis_json}
                    aria-label={listening ? "Stop voice input" : "Start voice input"}
                  >
                    <MicIcon />
                  </button>
                  <input
                    className={styles.chatInput}
                    value={chatInput}
                    onChange={(event) => onChatInputChange(event.target.value)}
                    placeholder="Ask about a medicine, test value, or report section..."
                    disabled={chatLoading || !selectedReport.analysis_json}
                  />
                  <button type="submit" className={styles.btnPrimary} disabled={chatLoading || !selectedReport.analysis_json}>
                    {chatLoading ? "Thinking..." : "Ask"}
                  </button>
                </form>

                {!selectedReport.analysis_json ? (
                  <div className={styles.voiceNote}>The report needs structured analysis before chat can answer follow-up questions.</div>
                ) : null}

                {speechNotice ? <div className={styles.voiceNote}>{speechNotice}</div> : null}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
