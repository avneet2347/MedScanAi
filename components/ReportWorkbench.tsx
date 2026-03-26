"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import type {
  ChatMessageRecord,
  HealthInsights,
  MedicalAnalysis,
  ReportDetail,
  ReportRecord,
} from "@/lib/report-types";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { extractError, syncBrowserSessionWithServer } from "@/lib/browser-auth";

type Notice = {
  type: "error" | "success" | "info";
  text: string;
} | null;

const supabase = getBrowserSupabaseClient();

function formatDate(value?: string | null) {
  if (!value) {
    return "Unknown date";
  }

  return new Date(value).toLocaleString();
}

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
};

export default function ReportWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState("");

  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const authorizedFetchJson = useCallback(
    async (input: string, init?: RequestInit): Promise<Record<string, unknown>> => {
      const requestWithToken = async (token: string) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${token}`);

        const response = await fetch(input, {
          ...init,
          headers,
        });

        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return { response, payload };
      };

      const { data } = await supabase.auth.getSession();
      let token = data.session?.access_token;

      if (!token) {
        const { data: refreshedData, error: refreshError } =
          await supabase.auth.refreshSession();

        if (refreshError || !refreshedData.session?.access_token) {
          throw new Error("You are not signed in.");
        }

        token = refreshedData.session.access_token;
        void syncBrowserSessionWithServer(refreshedData.session).catch(() => undefined);
      }

      let { response, payload } = await requestWithToken(token);

      if (response.status === 401) {
        const { data: refreshedData, error: refreshError } =
          await supabase.auth.refreshSession();

        if (refreshError || !refreshedData.session?.access_token) {
          throw new Error(extractError(payload, "Your session has expired. Please sign in again."));
        }

        void syncBrowserSessionWithServer(refreshedData.session).catch(() => undefined);
        ({ response, payload } = await requestWithToken(refreshedData.session.access_token));
      }

      if (!response.ok) {
        throw new Error(extractError(payload, "Request failed."));
      }

      return payload;
    },
    []
  );

  const loadHistory = useCallback(async (preferredReportId?: string) => {
    const payload = await authorizedFetchJson("/api/reports/history");
    const nextReports = (payload.reports as ReportRecord[] | undefined) || [];

    setReports(nextReports);

    const activeId =
      preferredReportId ||
      (selectedReportId &&
      nextReports.some((report) => report.id === selectedReportId)
        ? selectedReportId
        : nextReports[0]?.id || null);

    setSelectedReportId(activeId);
  }, [authorizedFetchJson, selectedReportId]);

  const loadReport = useCallback(async (reportId: string) => {
    setReportLoading(true);

    try {
      const payload = await authorizedFetchJson(`/api/reports/${reportId}`);
      setSelectedReport((payload.report as ReportDetail | undefined) || null);
    } finally {
      setReportLoading(false);
    }
  }, [authorizedFetchJson]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      const nextSession = data.session ?? null;
      setSession(nextSession);
      setAuthChecked(true);

      if (nextSession) {
        void syncBrowserSessionWithServer(nextSession).catch(() => undefined);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) {
          return;
        }

        setSession(nextSession ?? null);
        setAuthChecked(true);

        if (nextSession) {
          void syncBrowserSessionWithServer(nextSession).catch(() => undefined);
        } else {
          setProfile(null);
          void fetch("/api/auth/logout", {
            method: "POST",
          }).catch(() => undefined);
        }

        if (
          nextSession &&
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")
        ) {
          router.replace("/workspace");
        }
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!authChecked || session) {
      return;
    }

    const requestedMode = searchParams.get("mode");
    const confirmed = searchParams.get("confirmed") === "1";

    if (requestedMode === "signup") {
      router.replace("/signup");
      return;
    }

    if (requestedMode === "login" || confirmed) {
      router.replace(confirmed ? "/login?confirmed=1" : "/login");
      return;
    }

    router.replace("/login");
  }, [authChecked, router, searchParams, session]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setReports([]);
      setSelectedReport(null);
      setSelectedReportId(null);
      return;
    }

    (async () => {
      try {
        const sessionPayload = await authorizedFetchJson("/api/auth/session");
        setProfile((sessionPayload.profile as ProfileRecord | null | undefined) || null);
        await loadHistory();
      } catch (error) {
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to load report history.",
        });
      }
    })();
  }, [authorizedFetchJson, loadHistory, session]);

  useEffect(() => {
    if (!session || !selectedReportId) {
      return;
    }

    loadReport(selectedReportId).catch((error) => {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load report details.",
      });
    });
  }, [loadReport, selectedReportId, session]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      setNotice({
        type: "info",
        text: "You have been signed out.",
      });
      router.replace("/login");
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to sign out.",
      });
    }
  }

  async function handleAnalyze() {
    if (!file) {
      setNotice({
        type: "error",
        text: "Choose a JPG, PNG, or PDF file first.",
      });
      return;
    }

    setProcessing(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setPipelineStatus("Uploading file to secure storage...");
      const uploadPayload = await authorizedFetchJson("/api/reports/upload", {
        method: "POST",
        body: formData,
      });

      const uploadedReport = uploadPayload.report as ReportRecord;
      setSelectedReportId(uploadedReport.id);

      setPipelineStatus("Extracting report text with OCR...");
      await authorizedFetchJson(`/api/reports/${uploadedReport.id}/ocr`, {
        method: "POST",
      });

      setPipelineStatus("Generating structured medical explanation...");
      await authorizedFetchJson(`/api/reports/${uploadedReport.id}/explanation`, {
        method: "POST",
      });

      setPipelineStatus("Computing health insights and risk flags...");
      await authorizedFetchJson(`/api/reports/${uploadedReport.id}/insights`);

      await loadHistory(uploadedReport.id);
      await loadReport(uploadedReport.id);

      setFile(null);
      setNotice({
        type: "success",
        text: "Report processed successfully.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Report processing failed.",
      });
    } finally {
      setProcessing(false);
      setPipelineStatus("");
    }
  }

  async function handleAskQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedReportId || !chatInput.trim()) {
      return;
    }

    setChatLoading(true);
    setNotice(null);

    try {
      await authorizedFetchJson("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: selectedReportId,
          message: chatInput.trim(),
        }),
      });

      setChatInput("");
      await loadReport(selectedReportId);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to get chat response.",
      });
    } finally {
      setChatLoading(false);
    }
  }

  const analysis = selectedReport?.analysis_json as MedicalAnalysis | null | undefined;
  const insights = selectedReport?.insights_json as HealthInsights | null | undefined;
  const chatMessages = selectedReport?.chat_messages || [];

  if (!session) {
    return null;
  }

  return (
    <div className="workspace-shell">
      <div className="workspace-glow workspace-glow-a" />
      <div className="workspace-glow workspace-glow-b" />

      <header className="topbar">
        <div>
          <div className="eyebrow">MedScanAI</div>
          <h1>Your personalized dashboard</h1>
          <p>
            Your reports, OCR, explanations, risk flags, and chat history are loaded only for this account.
          </p>
        </div>

        <div className="topbar-actions">
          <span className="status-chip online">Authenticated</span>
          <button className="ghost-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {notice ? (
        <div className={`notice notice-${notice.type}`}>{notice.text}</div>
      ) : null}

      <main className="workspace-grid">
        <section className="panel sidebar-panel">
          <div className="panel-header">
            <div>
              <h2>Access</h2>
            </div>
            <span className="status-chip online">Ready</span>
          </div>

          <div className="profile-card">
            <div className="profile-pill">Signed in</div>
            <strong>{profile?.full_name?.trim() || session.user.email}</strong>
            {profile?.full_name?.trim() ? (
              <span className="profile-meta">{session.user.email}</span>
            ) : null}
            <p>Your uploads, extracted text, explanations, and chat history are scoped to this account.</p>
          </div>

          <div className="panel-divider" />

          <div className="panel-header">
            <h2>Upload</h2>
            <span>JPG, PNG, PDF</span>
          </div>

          <div className={`upload-box ${file ? "has-file" : ""}`}>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              disabled={processing}
            />
            <div className="upload-copy">
              <strong>{file ? file.name : "Choose a medical report"}</strong>
              <p>
                {file
                  ? `${Math.round(file.size / 1024)} KB ready for processing`
                  : "Files are stored in Supabase Storage and linked to your authenticated account."}
              </p>
            </div>
          </div>

          <button
            className="primary-button"
            disabled={!file || processing}
            onClick={handleAnalyze}
          >
            {processing ? "Processing..." : "Upload and analyze"}
          </button>

          {pipelineStatus ? (
            <div className="inline-status">{pipelineStatus}</div>
          ) : null}

          <div className="panel-divider" />

          <div className="panel-header">
            <h2>History</h2>
            <span>{reports.length} report(s)</span>
          </div>

          <div className="history-list">
            {reports.length === 0 ? (
              <div className="empty-state compact">No reports processed yet.</div>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  className={`history-item ${
                    selectedReportId === report.id ? "active" : ""
                  }`}
                  onClick={() => setSelectedReportId(report.id)}
                >
                  <strong>{report.title || report.original_filename}</strong>
                  <span>{report.report_status}</span>
                  <small>{formatDate(report.created_at)}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel content-panel">
          <div className="panel-header">
            <h2>Report review</h2>
            <span>
              {selectedReport ? formatDate(selectedReport.created_at) : "No report selected"}
            </span>
          </div>

          {!selectedReport ? (
            <div className="empty-state">
              <h3>No report selected</h3>
              <p>
                Sign in, upload a medical document, and the workspace will store OCR,
                structured findings, risk insights, and chat history in Supabase.
              </p>
            </div>
          ) : reportLoading ? (
            <div className="empty-state">
              <h3>Loading report</h3>
              <p>Fetching the latest OCR, explanation, insights, and chat context.</p>
            </div>
          ) : (
            <>
              <div className="report-head">
                <div>
                  <h3>{selectedReport.title || selectedReport.original_filename}</h3>
                  <p>
                    {selectedReport.original_filename} · {selectedReport.mime_type} ·{" "}
                    {Math.round(selectedReport.file_size / 1024)} KB
                  </p>
                </div>
                <span className={`status-chip status-${selectedReport.report_status.replace(/_/g, "-")}`}>
                  {selectedReport.report_status}
                </span>
              </div>

              <div className="summary-grid">
                <article className="summary-card">
                  <span className="card-label">Overview</span>
                  <p>{analysis?.overview || "Analysis not generated yet."}</p>
                </article>
                <article className="summary-card">
                  <span className="card-label">Plain language</span>
                  <p>
                    {analysis?.plainLanguageSummary ||
                      "Plain-language explanation will appear after AI processing."}
                  </p>
                </article>
                <article className="summary-card">
                  <span className="card-label">Risk</span>
                  <p>{insights?.summary || "Health insights will appear after analysis."}</p>
                </article>
              </div>

              <div className="detail-grid">
                <section className="detail-card">
                  <div className="panel-header">
                    <h3>Possible conditions</h3>
                    <span>{analysis?.possibleConditions?.length || 0}</span>
                  </div>
                  <div className="pill-list">
                    {(analysis?.possibleConditions || []).length === 0 ? (
                      <div className="empty-inline">No condition hypotheses detected.</div>
                    ) : (
                      analysis?.possibleConditions.map((item) => (
                        <div key={`${item.name}-${item.evidence}`} className="pill-item">
                          <strong>{item.name}</strong>
                          <span>{item.confidence} confidence</span>
                          <p>{item.explanation}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="detail-card">
                  <div className="panel-header">
                    <h3>Medicines</h3>
                    <span>{analysis?.medicines?.length || 0}</span>
                  </div>
                  <div className="pill-list">
                    {(analysis?.medicines || []).length === 0 ? (
                      <div className="empty-inline">No medicines extracted.</div>
                    ) : (
                      analysis?.medicines.map((medicine) => (
                        <div key={`${medicine.name}-${medicine.dosage}`} className="pill-item">
                          <strong>{medicine.name}</strong>
                          <span>
                            {[medicine.dosage, medicine.frequency]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <p>{medicine.purpose || medicine.notes}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <section className="detail-card">
                <div className="panel-header">
                  <h3>Health alerts</h3>
                  <span>{insights?.alerts?.length || 0}</span>
                </div>
                <div className="alert-list">
                  {(insights?.alerts || []).length === 0 ? (
                    <div className="empty-inline">No rule-based alerts generated.</div>
                  ) : (
                      insights?.alerts.map((alert) => (
                        <article key={`${alert.title}-${alert.reason}`} className="alert-item">
                          <div className="alert-title-row">
                            <strong>{alert.title}</strong>
                            <span className={`severity severity-${alert.severity}`}>
                              {alert.severity}
                            </span>
                          </div>
                          <p>{alert.reason}</p>
                          <small>{alert.recommendation}</small>
                        </article>
                      ))
                  )}
                </div>
              </section>

              <section className="detail-card">
                <div className="panel-header">
                  <h3>Extracted test values</h3>
                  <span>{analysis?.testValues?.length || 0}</span>
                </div>
                {(analysis?.testValues || []).length === 0 ? (
                  <div className="empty-inline">No structured test values were extracted.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Test</th>
                          <th>Value</th>
                          <th>Reference</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis?.testValues.map((test) => (
                          <tr key={`${test.name}-${test.value}`}>
                            <td>{test.name}</td>
                            <td>{[test.value, test.unit].filter(Boolean).join(" ")}</td>
                            <td>{test.referenceRange || "Not provided"}</td>
                            <td>
                              <span className={`severity severity-${test.status}`}>
                                {test.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <div className="detail-grid">
                <section className="detail-card">
                  <div className="panel-header">
                    <h3>Precautions and follow-up</h3>
                    <span>Safety-first</span>
                  </div>
                  <div className="bullet-columns">
                    <div>
                      <h4>Precautions</h4>
                      <ul>
                        {(analysis?.precautions || []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4>Questions to ask</h4>
                      <ul>
                        {(analysis?.followUpQuestions || []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="safety-note">
                    {insights?.safetyNotice ||
                      "This workspace provides educational support and does not replace clinical care."}
                  </p>
                </section>

                <section className="detail-card">
                  <div className="panel-header">
                    <h3>OCR text</h3>
                    <span>{selectedReport.ocr_engine || "pending"}</span>
                  </div>
                  <pre className="ocr-text">
                    {selectedReport.ocr_text || "OCR text not available yet."}
                  </pre>
                </section>
              </div>

              <section className="detail-card">
                <div className="panel-header">
                  <h3>Report chat</h3>
                  <span>{chatMessages.length} messages</span>
                </div>

                <div className="chat-thread">
                  {chatMessages.length === 0 ? (
                    <div className="empty-inline">
                      Ask follow-up questions once the report has been processed.
                    </div>
                  ) : (
                    chatMessages.map((message: ChatMessageRecord) => (
                      <div
                        key={message.id}
                        className={`chat-bubble chat-${message.role}`}
                      >
                        <strong>{message.role === "assistant" ? "AI" : "You"}</strong>
                        <p>{message.message}</p>
                      </div>
                    ))
                  )}
                </div>

                <form className="chat-form" onSubmit={handleAskQuestion}>
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Ask about a medicine, test value, or report section..."
                    disabled={chatLoading || !selectedReport.analysis_json}
                  />
                  <button
                    className="primary-button"
                    disabled={chatLoading || !selectedReport.analysis_json}
                  >
                    {chatLoading ? "Thinking..." : "Ask"}
                  </button>
                </form>
              </section>
            </>
          )}
        </section>
      </main>

      <style jsx>{`
        :global(body) {
          margin: 0;
          background: #edf4fb;
        }

        :global(body.dark) {
          background: #08111f;
        }

        .workspace-shell {
          --ws-bg: #edf4fb;
          --ws-surface: rgba(255, 255, 255, 0.74);
          --ws-surface-strong: rgba(255, 255, 255, 0.92);
          --ws-surface-soft: rgba(248, 250, 252, 0.88);
          --ws-border: rgba(148, 163, 184, 0.22);
          --ws-border-strong: rgba(100, 116, 139, 0.22);
          --ws-text: #0f172a;
          --ws-text-soft: #334155;
          --ws-muted: #64748b;
          --ws-muted-soft: #94a3b8;
          --ws-accent: #0369a1;
          --ws-accent-2: #0ea5e9;
          --ws-success: #15803d;
          --ws-success-bg: rgba(34, 197, 94, 0.12);
          --ws-warning: #b45309;
          --ws-warning-bg: rgba(245, 158, 11, 0.14);
          --ws-danger: #b91c1c;
          --ws-danger-bg: rgba(248, 113, 113, 0.14);
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          padding: 32px clamp(16px, 3vw, 30px) 42px;
          background:
            radial-gradient(circle at 0% 0%, rgba(14, 165, 233, 0.2), transparent 28%),
            radial-gradient(circle at 100% 10%, rgba(59, 130, 246, 0.12), transparent 26%),
            linear-gradient(180deg, #f4f8fc 0%, var(--ws-bg) 100%);
          color: var(--ws-text);
          font-family: var(--workspace-font-sans), "Segoe UI", sans-serif;
        }

        :global(body.dark) .workspace-shell {
          --ws-bg: #08111f;
          --ws-surface: rgba(11, 20, 36, 0.74);
          --ws-surface-strong: rgba(12, 22, 40, 0.92);
          --ws-surface-soft: rgba(15, 23, 42, 0.88);
          --ws-border: rgba(56, 189, 248, 0.14);
          --ws-border-strong: rgba(125, 211, 252, 0.2);
          --ws-text: #f8fbff;
          --ws-text-soft: #d1deed;
          --ws-muted: #8ea4bf;
          --ws-muted-soft: #5f7893;
          --ws-accent: #38bdf8;
          --ws-accent-2: #0ea5e9;
          --ws-success: #4ade80;
          --ws-success-bg: rgba(74, 222, 128, 0.14);
          --ws-warning: #fbbf24;
          --ws-warning-bg: rgba(251, 191, 36, 0.14);
          --ws-danger: #f87171;
          --ws-danger-bg: rgba(248, 113, 113, 0.16);
          background:
            radial-gradient(circle at 0% 0%, rgba(14, 165, 233, 0.16), transparent 26%),
            radial-gradient(circle at 100% 0%, rgba(3, 105, 161, 0.16), transparent 24%),
            linear-gradient(180deg, #050d19 0%, var(--ws-bg) 100%);
        }

        .workspace-shell :global(*) {
          box-sizing: border-box;
        }

        .workspace-shell button,
        .workspace-shell input,
        .workspace-shell table,
        .workspace-shell pre {
          font: inherit;
        }

        .workspace-glow {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
          filter: blur(80px);
          opacity: 0.45;
        }

        .workspace-glow-a {
          width: 280px;
          height: 280px;
          top: -90px;
          right: -40px;
          background: rgba(14, 165, 233, 0.28);
        }

        .workspace-glow-b {
          width: 240px;
          height: 240px;
          left: -90px;
          bottom: 14%;
          background: rgba(3, 105, 161, 0.14);
        }

        .topbar,
        .panel {
          position: relative;
          z-index: 1;
          border: 1px solid var(--ws-border);
          background: linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface));
          backdrop-filter: blur(22px);
          box-shadow:
            0 18px 48px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.24);
        }

        :global(body.dark) .topbar,
        :global(body.dark) .panel {
          box-shadow:
            0 24px 60px rgba(2, 6, 23, 0.42),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .topbar {
          max-width: 1400px;
          margin: 0 auto 24px;
          padding: 30px 32px;
          border-radius: 30px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(14, 165, 233, 0.12);
          border: 1px solid rgba(14, 165, 233, 0.18);
          color: var(--ws-accent);
          font-family: var(--workspace-font-mono), monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .topbar h1 {
          margin: 18px 0 0;
          color: var(--ws-text);
          font-family: var(--workspace-font-serif), Georgia, serif;
          font-size: clamp(2.4rem, 4vw, 3.75rem);
          font-weight: 400;
          line-height: 1.02;
          letter-spacing: -0.04em;
        }

        .topbar p {
          max-width: 780px;
          margin: 18px 0 0;
          color: var(--ws-muted);
          font-size: 1rem;
          line-height: 1.8;
        }

        .topbar-actions {
          min-width: 240px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
        }

        .status-chip,
        .profile-pill,
        .card-label,
        .severity,
        .inline-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .status-chip {
          padding: 8px 12px;
          border: 1px solid transparent;
          background: var(--ws-surface-soft);
          color: var(--ws-muted);
        }

        .status-chip.online,
        .status-chip.status-ready {
          background: var(--ws-success-bg);
          border-color: rgba(34, 197, 94, 0.2);
          color: var(--ws-success);
        }

        .status-chip.offline,
        .status-chip.status-uploaded {
          background: rgba(148, 163, 184, 0.14);
          border-color: rgba(148, 163, 184, 0.18);
          color: var(--ws-muted);
        }

        .status-chip.status-ocr-complete,
        .status-chip.status-analysis-complete {
          background: rgba(14, 165, 233, 0.14);
          border-color: rgba(14, 165, 233, 0.2);
          color: var(--ws-accent);
        }

        .status-chip.status-ocr-failed,
        .status-chip.status-analysis-failed,
        .status-chip.status-insights-failed {
          background: var(--ws-danger-bg);
          border-color: rgba(248, 113, 113, 0.22);
          color: var(--ws-danger);
        }

        .ghost-button,
        .primary-button,
        .segmented button,
        .history-item {
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            background 0.18s ease,
            box-shadow 0.18s ease,
            color 0.18s ease;
        }

        .ghost-button,
        .primary-button,
        .segmented button {
          appearance: none;
          -webkit-appearance: none;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .ghost-button {
          padding: 12px 16px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
          color: var(--ws-text);
          font-size: 14px;
          font-weight: 700;
        }

        .ghost-button:hover {
          transform: translateY(-1px);
          border-color: var(--ws-border-strong);
          background: var(--ws-surface-strong);
        }

        .primary-button {
          border: none;
          padding: 14px 18px;
          background: linear-gradient(135deg, var(--ws-accent), var(--ws-accent-2));
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          box-shadow: 0 18px 32px rgba(3, 105, 161, 0.22);
        }

        .primary-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 22px 36px rgba(3, 105, 161, 0.28);
        }

        .primary-button:disabled,
        .ghost-button:disabled,
        .history-item:disabled,
        .chat-form button:disabled,
        .segmented button:disabled {
          opacity: 0.58;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .notice {
          position: relative;
          z-index: 1;
          max-width: 1400px;
          margin: 0 auto 18px;
          padding: 14px 18px;
          border-radius: 18px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
          color: var(--ws-text-soft);
          font-size: 14px;
          line-height: 1.6;
        }

        .notice-success {
          border-color: rgba(34, 197, 94, 0.22);
          background: rgba(34, 197, 94, 0.09);
          color: var(--ws-success);
        }

        .notice-error {
          border-color: rgba(248, 113, 113, 0.24);
          background: rgba(248, 113, 113, 0.1);
          color: var(--ws-danger);
        }

        .notice-info {
          border-color: rgba(14, 165, 233, 0.2);
          background: rgba(14, 165, 233, 0.08);
          color: var(--ws-accent);
        }

        .workspace-grid {
          position: relative;
          z-index: 1;
          max-width: 1400px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 360px minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }

        .workspace-grid.auth-only {
          max-width: 1400px;
          grid-template-columns: minmax(360px, 480px) minmax(0, 1fr);
          align-items: stretch;
        }

        .panel {
          border-radius: 30px;
          min-width: 0;
        }

        .sidebar-panel,
        .content-panel {
          padding: 24px;
          display: grid;
          gap: 20px;
          min-width: 0;
        }

        .sidebar-panel {
          position: sticky;
          top: 24px;
        }

        .auth-sidebar-panel {
          position: static;
          top: auto;
          align-self: start;
          gap: 18px;
        }

        .panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .panel-header h2,
        .panel-header h3 {
          margin: 0;
          color: var(--ws-text);
          font-size: 1.02rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .panel-header span {
          color: var(--ws-muted);
          font-size: 12px;
          font-weight: 700;
        }

        .auth-access-header {
          align-items: flex-start;
          margin-bottom: 4px;
        }

        .auth-access-copy {
          margin: 10px 0 0;
          color: var(--ws-muted);
          font-size: 0.96rem;
          line-height: 1.75;
        }

        .stack-form {
          display: grid;
          gap: 16px;
          width: 100%;
        }

        .inline-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .auth-form-card {
          display: grid;
          gap: 18px;
          padding: 22px;
          border-radius: 28px;
          border: 1px solid var(--ws-border);
          background:
            linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface)),
            radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 36%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.18),
            0 18px 30px rgba(15, 23, 42, 0.04);
        }

        .auth-form-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .auth-form-head-copy {
          display: grid;
          gap: 10px;
        }

        .auth-form-kicker {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(14, 165, 233, 0.18);
          background: rgba(14, 165, 233, 0.12);
          color: var(--ws-accent);
          font-family: var(--workspace-font-mono), monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .auth-form-head h3 {
          margin: 0;
          color: var(--ws-text);
          font-family: var(--workspace-font-serif), Georgia, serif;
          font-size: clamp(1.8rem, 2.6vw, 2.35rem);
          font-weight: 400;
          line-height: 1.02;
          letter-spacing: -0.04em;
        }

        .auth-form-head p {
          margin: 0;
          color: var(--ws-muted);
          line-height: 1.8;
        }

        .auth-form-badge {
          flex-shrink: 0;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(14, 165, 233, 0.16);
          background: rgba(14, 165, 233, 0.08);
          color: var(--ws-accent);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .auth-form-badge.pending {
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.18);
          color: var(--ws-warning);
        }

        .auth-submit-button,
        .auth-resend-button {
          width: 100%;
        }

        .auth-resend-row {
          display: grid;
          gap: 12px;
          padding: 16px 18px;
          border-radius: 22px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
        }

        .auth-resend-copy {
          display: grid;
          gap: 6px;
        }

        .auth-resend-copy strong {
          color: var(--ws-text);
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .auth-resend-copy span {
          color: var(--ws-muted);
          font-size: 0.92rem;
          line-height: 1.65;
        }

        .auth-assurance-grid {
          display: grid;
          gap: 12px;
        }

        .auth-assurance-card {
          display: grid;
          gap: 8px;
          padding: 16px 18px;
          border-radius: 22px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
        }

        .auth-assurance-card strong {
          color: var(--ws-text);
          font-size: 0.96rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .auth-assurance-card p {
          margin: 0;
          color: var(--ws-muted);
          line-height: 1.7;
        }

        .auth-support-copy {
          margin: 0;
          color: var(--ws-muted);
          font-size: 0.94rem;
          line-height: 1.7;
        }

        .auth-info-card {
          background:
            linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface)),
            radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 38%);
        }

        .auth-showcase-panel {
          align-content: start;
          gap: 22px;
          min-height: 100%;
        }

        .auth-hero-card,
        .auth-journey-card,
        .auth-feature-card,
        .auth-stat-card,
        .auth-step-card {
          border: 1px solid var(--ws-border);
          background: linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .auth-hero-card,
        .auth-journey-card {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          padding: 28px;
        }

        .auth-hero-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top right, rgba(14, 165, 233, 0.16), transparent 26%),
            linear-gradient(135deg, rgba(14, 165, 233, 0.08), transparent 44%);
          pointer-events: none;
        }

        .auth-kicker {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(14, 165, 233, 0.18);
          background: rgba(14, 165, 233, 0.12);
          color: var(--ws-accent);
          font-family: var(--workspace-font-mono), monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .auth-showcase-title {
          position: relative;
          z-index: 1;
          margin: 18px 0 0;
          max-width: 740px;
          color: var(--ws-text);
          font-family: var(--workspace-font-serif), Georgia, serif;
          font-size: clamp(2.1rem, 3vw, 3.4rem);
          font-weight: 400;
          line-height: 1.02;
          letter-spacing: -0.04em;
        }

        .auth-showcase-copy {
          position: relative;
          z-index: 1;
          max-width: 760px;
          margin: 18px 0 0;
          color: var(--ws-muted);
          font-size: 1rem;
          line-height: 1.85;
        }

        .auth-signal-strip {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 22px;
        }

        .auth-signal-pill {
          display: inline-flex;
          align-items: center;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
          color: var(--ws-text-soft);
          font-size: 12px;
          font-weight: 700;
        }

        .auth-stat-grid,
        .auth-feature-grid,
        .auth-journey-grid {
          display: grid;
          gap: 16px;
        }

        .auth-stat-grid {
          position: relative;
          z-index: 1;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin-top: 24px;
        }

        .auth-stat-card {
          border-radius: 22px;
          padding: 18px;
          display: grid;
          gap: 8px;
          background:
            linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface)),
            radial-gradient(circle at top right, rgba(14, 165, 233, 0.08), transparent 44%);
        }

        .auth-stat-card strong {
          color: var(--ws-text);
          font-size: 1.55rem;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .auth-stat-card span {
          color: var(--ws-muted);
          font-size: 0.88rem;
          line-height: 1.55;
        }

        .auth-feature-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .auth-feature-card {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          padding: 22px;
          display: grid;
          gap: 10px;
        }

        .auth-feature-card::after {
          content: "";
          position: absolute;
          inset: auto -10% -40% auto;
          width: 140px;
          height: 140px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.12), transparent 68%);
          pointer-events: none;
        }

        .auth-feature-tag {
          position: relative;
          z-index: 1;
          color: var(--ws-accent);
          font-family: var(--workspace-font-mono), monospace;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.18em;
        }

        .auth-feature-card h3 {
          position: relative;
          z-index: 1;
          margin: 0;
          color: var(--ws-text);
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .auth-feature-card p {
          position: relative;
          z-index: 1;
          margin: 0;
          color: var(--ws-muted);
          line-height: 1.8;
        }

        .auth-journey-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-top: 8px;
        }

        .auth-step-card {
          border-radius: 22px;
          padding: 20px;
          display: grid;
          gap: 10px;
        }

        .auth-step-number {
          width: fit-content;
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(14, 165, 233, 0.12);
          border: 1px solid rgba(14, 165, 233, 0.18);
          color: var(--ws-accent);
          font-family: var(--workspace-font-mono), monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
        }

        .auth-step-card strong {
          color: var(--ws-text);
          font-size: 1rem;
        }

        .auth-step-card p {
          margin: 0;
          color: var(--ws-muted);
          line-height: 1.75;
        }

        .segmented {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          padding: 5px;
          border-radius: 18px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
        }

        .segmented button {
          border: none;
          padding: 12px 14px;
          background: transparent;
          color: var(--ws-muted);
          font-size: 14px;
          font-weight: 700;
        }

        .segmented button.active {
          background: linear-gradient(135deg, var(--ws-accent), var(--ws-accent-2));
          color: #ffffff;
          box-shadow: 0 14px 26px rgba(3, 105, 161, 0.18);
        }

        .field {
          display: grid;
          gap: 8px;
        }

        .field span {
          color: var(--ws-muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .field input,
        .chat-form input {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          min-width: 0;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
          color: var(--ws-text);
          font-size: 14px;
          outline: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .field input::placeholder,
        .chat-form input::placeholder {
          color: var(--ws-muted-soft);
        }

        .field input:focus,
        .chat-form input:focus {
          border-color: rgba(14, 165, 233, 0.44);
          box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.12);
          background: var(--ws-surface-strong);
        }

        .field input:-webkit-autofill,
        .chat-form input:-webkit-autofill {
          -webkit-text-fill-color: var(--ws-text);
          -webkit-box-shadow: 0 0 0 1000px var(--ws-surface-strong) inset;
          transition: background-color 9999s ease-in-out 0s;
        }

        .profile-card,
        .summary-card,
        .detail-card,
        .history-item,
        .upload-box,
        .empty-state,
        .empty-inline,
        .pill-item,
        .alert-item {
          border: 1px solid var(--ws-border);
          background: linear-gradient(180deg, var(--ws-surface-strong), var(--ws-surface));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        .profile-card {
          display: grid;
          gap: 10px;
          padding: 20px;
          border-radius: 24px;
        }

        .profile-card strong {
          font-size: 1.02rem;
          color: var(--ws-text);
        }

        .profile-meta {
          color: var(--ws-muted);
          font-size: 0.92rem;
        }

        .profile-card p {
          margin: 0;
          color: var(--ws-muted);
          line-height: 1.7;
        }

        .profile-pill {
          width: fit-content;
          padding: 8px 12px;
          background: rgba(14, 165, 233, 0.12);
          border: 1px solid rgba(14, 165, 233, 0.18);
          color: var(--ws-accent);
        }

        .panel-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--ws-border-strong), transparent);
        }

        .upload-box {
          display: grid;
          gap: 14px;
          padding: 18px;
          border-radius: 24px;
          border-style: dashed;
        }

        .upload-box.has-file {
          border-style: solid;
          border-color: rgba(14, 165, 233, 0.3);
        }

        .upload-box input {
          width: 100%;
          color: var(--ws-muted);
        }

        .upload-box input::file-selector-button {
          margin-right: 12px;
          padding: 11px 15px;
          border-radius: 14px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
          color: var(--ws-text);
          font-weight: 700;
          cursor: pointer;
          transition: border-color 0.18s ease, background 0.18s ease;
        }

        .upload-box input::file-selector-button:hover {
          border-color: var(--ws-border-strong);
          background: var(--ws-surface-strong);
        }

        .upload-copy strong {
          display: block;
          color: var(--ws-text);
          font-size: 1rem;
          font-weight: 800;
        }

        .upload-copy p {
          margin: 8px 0 0;
          color: var(--ws-muted);
          line-height: 1.7;
        }

        .inline-status {
          width: fit-content;
          padding: 8px 12px;
          background: rgba(14, 165, 233, 0.1);
          border: 1px solid rgba(14, 165, 233, 0.18);
          color: var(--ws-accent);
        }

        .history-list,
        .chat-thread {
          display: grid;
          gap: 10px;
          padding-right: 4px;
        }

        .history-list {
          max-height: 320px;
          overflow: auto;
        }

        .history-item {
          width: 100%;
          padding: 16px;
          border-radius: 20px;
          text-align: left;
          cursor: pointer;
          display: grid;
          gap: 6px;
        }

        .history-item:hover {
          transform: translateY(-1px);
          border-color: var(--ws-border-strong);
        }

        .history-item.active {
          border-color: rgba(14, 165, 233, 0.28);
          box-shadow:
            0 18px 30px rgba(3, 105, 161, 0.12),
            inset 0 0 0 1px rgba(14, 165, 233, 0.12);
        }

        .history-item strong {
          color: var(--ws-text);
          font-size: 14px;
          line-height: 1.5;
        }

        .history-item span,
        .history-item small {
          color: var(--ws-muted);
        }

        .empty-state,
        .empty-inline {
          border-radius: 24px;
          padding: 24px;
          color: var(--ws-muted);
        }

        .empty-state {
          min-height: 220px;
          display: grid;
          align-content: center;
          gap: 10px;
        }

        .empty-state h3 {
          margin: 0;
          color: var(--ws-text);
          font-family: var(--workspace-font-serif), Georgia, serif;
          font-size: 1.8rem;
          font-weight: 400;
          letter-spacing: -0.03em;
        }

        .empty-state p,
        .empty-inline {
          margin: 0;
          line-height: 1.75;
        }

        .compact {
          min-height: 0;
          padding: 18px;
        }

        .report-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .report-head h3 {
          margin: 0;
          color: var(--ws-text);
          font-family: var(--workspace-font-serif), Georgia, serif;
          font-size: 2rem;
          font-weight: 400;
          letter-spacing: -0.03em;
        }

        .report-head p {
          margin: 10px 0 0;
          color: var(--ws-muted);
          line-height: 1.7;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .summary-card,
        .detail-card {
          border-radius: 24px;
          padding: 20px;
          min-width: 0;
        }

        .summary-card {
          display: grid;
          gap: 12px;
          min-height: 176px;
        }

        .card-label {
          width: fit-content;
          padding: 8px 12px;
          background: rgba(14, 165, 233, 0.12);
          border: 1px solid rgba(14, 165, 233, 0.18);
          color: var(--ws-accent);
          font-family: var(--workspace-font-mono), monospace;
        }

        .summary-card p,
        .detail-card p {
          margin: 0;
          color: var(--ws-text-soft);
          line-height: 1.75;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .pill-list,
        .alert-list {
          display: grid;
          gap: 12px;
        }

        .pill-item,
        .alert-item {
          border-radius: 18px;
          padding: 16px;
          display: grid;
          gap: 8px;
        }

        .pill-item strong,
        .alert-item strong {
          color: var(--ws-text);
          font-size: 14px;
        }

        .pill-item span,
        .alert-item small {
          color: var(--ws-muted);
          font-size: 12px;
        }

        .alert-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .severity {
          padding: 6px 10px;
          border: 1px solid transparent;
          background: rgba(148, 163, 184, 0.14);
          color: var(--ws-muted);
        }

        .severity-high,
        .severity-critical,
        .severity-abnormal,
        .severity-ocr-failed,
        .severity-analysis-failed {
          background: var(--ws-danger-bg);
          border-color: rgba(248, 113, 113, 0.22);
          color: var(--ws-danger);
        }

        .severity-low,
        .severity-moderate {
          background: var(--ws-warning-bg);
          border-color: rgba(245, 158, 11, 0.22);
          color: var(--ws-warning);
        }

        .severity-normal,
        .severity-ready,
        .severity-analysis-complete {
          background: var(--ws-success-bg);
          border-color: rgba(34, 197, 94, 0.18);
          color: var(--ws-success);
        }

        .table-wrap {
          border-radius: 22px;
          overflow: auto;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
        }

        .table-wrap table {
          width: 100%;
          min-width: 680px;
          border-collapse: collapse;
        }

        .table-wrap th,
        .table-wrap td {
          padding: 14px 16px;
          text-align: left;
          border-bottom: 1px solid var(--ws-border);
          font-size: 14px;
        }

        .table-wrap thead th {
          color: var(--ws-muted);
          background: rgba(148, 163, 184, 0.08);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .table-wrap tbody tr:last-child td {
          border-bottom: none;
        }

        .table-wrap td {
          color: var(--ws-text-soft);
        }

        .bullet-columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .bullet-columns h4 {
          margin: 0 0 10px;
          color: var(--ws-text);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }

        .bullet-columns ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 10px;
          color: var(--ws-text-soft);
          line-height: 1.7;
        }

        .safety-note {
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(245, 158, 11, 0.2);
          background: var(--ws-warning-bg);
          color: var(--ws-warning);
        }

        .ocr-text {
          margin: 0;
          padding: 18px;
          border-radius: 20px;
          background: rgba(15, 23, 42, 0.05);
          color: var(--ws-text-soft);
          font-family: var(--workspace-font-mono), monospace;
          font-size: 12.5px;
          line-height: 1.8;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 420px;
          overflow: auto;
        }

        :global(body.dark) .ocr-text {
          background: rgba(2, 6, 23, 0.42);
        }

        .chat-thread {
          max-height: 360px;
          overflow: auto;
        }

        .chat-bubble {
          max-width: min(100%, 780px);
          padding: 16px 18px;
          border-radius: 20px;
          border: 1px solid var(--ws-border);
          background: var(--ws-surface-soft);
        }

        .chat-assistant {
          background: linear-gradient(180deg, rgba(14, 165, 233, 0.08), var(--ws-surface-strong));
          border-color: rgba(14, 165, 233, 0.18);
        }

        .chat-user {
          justify-self: end;
          background: rgba(2, 132, 199, 0.08);
          border-color: rgba(14, 165, 233, 0.18);
        }

        .chat-bubble strong {
          color: var(--ws-text);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .chat-bubble p {
          margin: 8px 0 0;
          color: var(--ws-text-soft);
          line-height: 1.75;
        }

        .chat-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
        }

        @media (max-width: 1180px) {
          .workspace-grid {
            grid-template-columns: 320px minmax(0, 1fr);
          }

          .workspace-grid.auth-only {
            grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
          }
        }

        @media (max-width: 980px) {
          .topbar {
            padding: 26px;
            flex-direction: column;
          }

          .topbar-actions {
            width: 100%;
            align-items: flex-start;
          }

          .workspace-grid {
            grid-template-columns: 1fr;
          }

          .sidebar-panel {
            position: static;
          }

          .workspace-grid.auth-only {
            grid-template-columns: 1fr;
          }

          .summary-grid,
          .detail-grid,
          .auth-feature-grid,
          .auth-journey-grid,
          .auth-stat-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .workspace-shell {
            padding: 16px 12px 28px;
          }

          .topbar,
          .panel {
            border-radius: 24px;
          }

          .topbar,
          .sidebar-panel,
          .content-panel {
            padding: 18px;
          }

          .topbar h1 {
            margin-top: 16px;
            font-size: clamp(2rem, 12vw, 2.8rem);
          }

          .panel-header,
          .auth-form-head,
          .report-head,
          .alert-title-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .summary-card,
          .detail-card,
          .upload-box,
          .empty-state,
          .empty-inline,
          .profile-card {
            border-radius: 20px;
            padding: 18px;
          }

          .bullet-columns,
          .chat-form {
            grid-template-columns: 1fr;
          }

          .primary-button,
          .ghost-button,
          .chat-form button {
            width: 100%;
          }
        }

        @media (max-width: 560px) {
          .workspace-shell {
            padding-inline: 10px;
          }

          .segmented {
            grid-template-columns: 1fr;
          }

          .table-wrap table {
            min-width: 560px;
          }

          .history-list,
          .chat-thread {
            max-height: 280px;
          }
        }
      `}</style>
    </div>
  );
}
