"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type {
  ChatMessageRecord,
  HealthInsights,
  MedicalAnalysis,
  ReportDetail,
  ReportRecord,
} from "@/lib/report-types";
import { getBrowserSupabaseClient } from "@/lib/supabase";

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

function extractError(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "error" in data) {
    const error = (data as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  return fallback;
}

export default function ReportWorkbench() {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

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
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      throw new Error("You are not signed in.");
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(input, {
      ...init,
      headers,
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

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

      setSession(data.session ?? null);
      setAuthChecked(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) {
          return;
        }

        setSession(nextSession ?? null);
        setAuthChecked(true);
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setReports([]);
      setSelectedReport(null);
      setSelectedReportId(null);
      return;
    }

    loadHistory().catch((error) => {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load report history.",
      });
    });
  }, [loadHistory, session]);

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

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setNotice(null);

    try {
      const response = await fetch(
        authMode === "signup" ? "/api/auth/signup" : "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fullName,
            email,
            password,
          }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(extractError(payload, "Authentication failed."));
      }

      const nextSession = payload.session as
        | { access_token?: string; refresh_token?: string }
        | undefined;

      if (nextSession?.access_token && nextSession.refresh_token) {
        await supabase.auth.setSession({
          access_token: nextSession.access_token,
          refresh_token: nextSession.refresh_token,
        });
      }

      setFullName("");
      setEmail("");
      setPassword("");
      setNotice({
        type: "success",
        text:
          (payload.message as string | undefined) ||
          "Authentication completed successfully.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Authentication failed.",
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setNotice({
      type: "info",
      text: "You have been signed out.",
    });
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

  return (
    <div className="workspace-shell">
      <div className="workspace-glow workspace-glow-a" />
      <div className="workspace-glow workspace-glow-b" />

      <header className="topbar">
        <div>
          <div className="eyebrow">AI2Health</div>
          <h1>Medical report workspace</h1>
          <p>
            Secure upload, OCR, structured explanations, risk flags, and
            report-grounded chat backed by Supabase and OpenAI.
          </p>
        </div>

        <div className="topbar-actions">
          <span className={`status-chip ${session ? "online" : "offline"}`}>
            {session ? "Authenticated" : "Sign in required"}
          </span>
          {session ? (
            <button className="ghost-button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className={`notice notice-${notice.type}`}>{notice.text}</div>
      ) : null}

      <main className="workspace-grid">
        <section className="panel sidebar-panel">
          <div className="panel-header">
            <h2>Access</h2>
            <span>{authChecked ? "Ready" : "Loading session..."}</span>
          </div>

          {!session ? (
            <form className="stack-form" onSubmit={handleAuthSubmit}>
              <div className="segmented">
                <button
                  className={authMode === "login" ? "active" : ""}
                  type="button"
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  className={authMode === "signup" ? "active" : ""}
                  type="button"
                  onClick={() => setAuthMode("signup")}
                >
                  Sign up
                </button>
              </div>

              {authMode === "signup" ? (
                <label className="field">
                  <span>Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Drishti Singh"
                  />
                </label>
              ) : null}

              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                />
              </label>

              <button className="primary-button" disabled={authLoading}>
                {authLoading
                  ? "Processing..."
                  : authMode === "signup"
                    ? "Create account"
                    : "Login"}
              </button>
            </form>
          ) : (
            <div className="profile-card">
              <div className="profile-pill">Signed in</div>
              <strong>{session.user.email}</strong>
              <p>Your uploads, extracted text, explanations, and chat history are scoped to this account.</p>
            </div>
          )}

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
              disabled={!session || processing}
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
            disabled={!session || !file || processing}
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
              <div className="empty-state compact">
                {session
                  ? "No reports processed yet."
                  : "Sign in to enable persistent report history."}
              </div>
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
    </div>
  );
}
