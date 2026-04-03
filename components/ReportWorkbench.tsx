"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import type {
  ChatMessageRecord,
  DoctorRecommendation,
  ReportConfidenceSummary,
  ReportDetail,
  ReportRecord,
} from "@/lib/report-types";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { extractError, syncBrowserSessionWithServer } from "@/lib/browser-auth";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  readActiveTheme,
  setThemePreference,
} from "@/lib/theme";
import WorkspaceShell, {
  type WorkspaceNotice,
  type WorkspacePageId,
} from "@/components/workspace/WorkspaceShell";

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const supabase = getBrowserSupabaseClient();

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || "").trim() || (email || "").trim();

  if (!source) {
    return "M";
  }

  const tokens = source.split(/\s+/).filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0]?.charAt(0) || ""}${tokens[1]?.charAt(0) || ""}`.toUpperCase();
  }

  return source.slice(0, 1).toUpperCase();
}

function mergeChatMessages(
  existingMessages: ChatMessageRecord[],
  incomingMessages: ChatMessageRecord[]
) {
  const merged = new Map<string, ChatMessageRecord>();

  for (const message of existingMessages) {
    merged.set(message.id, message);
  }

  for (const message of incomingMessages) {
    merged.set(message.id, message);
  }

  return Array.from(merged.values()).sort((left, right) => {
    const createdAtDelta =
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime();

    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    if (left.role !== right.role) {
      return left.role === "user" ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });
}

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
  const [doctorRecommendations, setDoctorRecommendations] = useState<DoctorRecommendation[]>([]);
  const [doctorRecommendationLoading, setDoctorRecommendationLoading] = useState(false);
  const [doctorRecommendationError, setDoctorRecommendationError] = useState<string | null>(null);
  const [confidenceSummary, setConfidenceSummary] = useState<ReportConfidenceSummary | null>(null);
  const [confidenceLoading, setConfidenceLoading] = useState(false);
  const [confidenceError, setConfidenceError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [notice, setNotice] = useState<WorkspaceNotice>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [listening, setListening] = useState(false);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [humanizingMessageId, setHumanizingMessageId] = useState<string | null>(null);
  const [humanizedMessages, setHumanizedMessages] = useState<Record<string, string>>({});
  const [activePage, setActivePage] = useState<WorkspacePageId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const selectedReportIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedReportIdRef.current = selectedReportId;
  }, [selectedReportId]);

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
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshedData.session?.access_token) {
          throw new Error("You are not signed in.");
        }

        token = refreshedData.session.access_token;
        void syncBrowserSessionWithServer(refreshedData.session).catch(() => undefined);
      }

      let { response, payload } = await requestWithToken(token);

      if (response.status === 401) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

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

  const loadHistory = useCallback(
    async (preferredReportId?: string) => {
      const payload = await authorizedFetchJson("/api/reports/history");
      const nextReports = (payload.reports as ReportRecord[] | undefined) || [];

      setReports(nextReports);

      const activeId =
        preferredReportId ||
        (selectedReportId && nextReports.some((report) => report.id === selectedReportId)
          ? selectedReportId
          : nextReports[0]?.id || null);

      setSelectedReportId(activeId);
    },
    [authorizedFetchJson, selectedReportId]
  );

  const loadReport = useCallback(
    async (reportId: string, options?: { background?: boolean }) => {
      if (!options?.background) {
        setReportLoading(true);
      }

      try {
        const payload = await authorizedFetchJson(`/api/reports/${reportId}`, {
          cache: "no-store",
        });
        const nextReport = (payload.report as ReportDetail | undefined) || null;

        setSelectedReport((current) => {
          if (selectedReportIdRef.current !== reportId) {
            return current;
          }

          if (!nextReport) {
            return nextReport;
          }

          if (!current || current.id !== reportId) {
            return nextReport;
          }

          return nextReport;
        });
      } finally {
        if (!options?.background) {
          setReportLoading(false);
        }
      }
    },
    [authorizedFetchJson]
  );

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

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession ?? null);
      setAuthChecked(true);

      if (nextSession) {
        void syncBrowserSessionWithServer(nextSession).catch(() => undefined);
      } else {
        setProfile(null);
        void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      }

      if (
        nextSession &&
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")
      ) {
        router.replace("/workspace");
      }
    });

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

    void (async () => {
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

  useEffect(() => {
    setHumanizingMessageId(null);
    setHumanizedMessages({});
  }, [selectedReportId]);

  useEffect(() => {
    if (!session || !selectedReportId) {
      setDoctorRecommendations([]);
      setDoctorRecommendationError(null);
      setDoctorRecommendationLoading(false);
      return;
    }

    let active = true;
    setDoctorRecommendationLoading(true);
    setDoctorRecommendationError(null);

    authorizedFetchJson(`/api/recommendations/doctors?reportId=${encodeURIComponent(selectedReportId)}`)
      .then((payload) => {
        if (!active) {
          return;
        }

        setDoctorRecommendations((payload.recommendations as DoctorRecommendation[] | undefined) || []);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setDoctorRecommendations([]);
        setDoctorRecommendationError(
          error instanceof Error ? error.message : "Unable to load doctor recommendations."
        );
      })
      .finally(() => {
        if (active) {
          setDoctorRecommendationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authorizedFetchJson, selectedReportId, session]);

  useEffect(() => {
    if (!session || !selectedReportId) {
      setConfidenceSummary(null);
      setConfidenceError(null);
      setConfidenceLoading(false);
      return;
    }

    let active = true;
    setConfidenceLoading(true);
    setConfidenceError(null);

    authorizedFetchJson(`/api/analytics/confidence?reportId=${encodeURIComponent(selectedReportId)}`)
      .then((payload) => {
        if (!active) {
          return;
        }

        setConfidenceSummary((payload.confidence as ReportConfidenceSummary | undefined) || null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setConfidenceSummary(null);
        setConfidenceError(error instanceof Error ? error.message : "Unable to load AI confidence.");
      })
      .finally(() => {
        if (active) {
          setConfidenceLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authorizedFetchJson, selectedReportId, session]);

  useEffect(() => {
    const syncThemeState = () => {
      setDark(readActiveTheme() === "dark");
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY) {
        return;
      }

      syncThemeState();
    };

    syncThemeState();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(THEME_CHANGE_EVENT, syncThemeState);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, syncThemeState);
    };
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      await fetch("/api/auth/logout", { method: "POST" });
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
      await authorizedFetchJson(`/api/reports/${uploadedReport.id}/ocr`, { method: "POST" });

      setPipelineStatus("Generating structured medical explanation...");
      await authorizedFetchJson(`/api/reports/${uploadedReport.id}/explanation`, {
        method: "POST",
      });

      setPipelineStatus("Computing health insights and risk flags...");
      await authorizedFetchJson(`/api/reports/${uploadedReport.id}/insights`);

      await loadHistory(uploadedReport.id);
      await loadReport(uploadedReport.id);

      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setActivePage("dashboard");
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

    const reportId = selectedReportId;
    const question = chatInput.trim();

    if (!reportId || !question) {
      return;
    }

    const optimisticUserMessage: ChatMessageRecord = {
      id: `temp-user-${Date.now()}`,
      report_id: reportId,
      user_id: selectedReport?.user_id || session?.user.id || "",
      role: "user",
      message: question,
      response_json: null,
      created_at: new Date().toISOString(),
    };

    setChatLoading(true);
    setNotice(null);
    setChatInput("");
    setSelectedReport((current) => {
      if (!current || current.id !== reportId) {
        return current;
      }

      return {
        ...current,
        chat_messages: [...current.chat_messages, optimisticUserMessage],
      };
    });

    try {
      const payload = await authorizedFetchJson("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId,
          message: question,
        }),
      });

      const savedMessages = (payload.messages as ChatMessageRecord[] | undefined) || [];
      const reply =
        typeof payload.reply === "string" && payload.reply.trim()
          ? payload.reply.trim()
          : null;
      const fallbackMessages = savedMessages.length
        ? savedMessages
        : [
            {
              ...optimisticUserMessage,
              id: `${optimisticUserMessage.id}-confirmed`,
            },
            ...(reply
              ? [
                  {
                    id: `temp-assistant-${Date.now()}`,
                    report_id: reportId,
                    user_id: selectedReport?.user_id || session?.user.id || "",
                    role: "assistant" as const,
                    message: reply,
                    response_json: null,
                    created_at: new Date().toISOString(),
                  },
                ]
              : []),
          ];

      setSelectedReport((current) => {
        if (!current || current.id !== reportId) {
          return current;
        }

        return {
          ...current,
          chat_messages: mergeChatMessages(
            current.chat_messages.filter((message) => message.id !== optimisticUserMessage.id),
            fallbackMessages
          ),
        };
      });

      void loadReport(reportId, { background: true }).catch(() => undefined);
    } catch (error) {
      setSelectedReport((current) => {
        if (!current || current.id !== reportId) {
          return current;
        }

        return {
          ...current,
          chat_messages: current.chat_messages.filter(
            (message) => message.id !== optimisticUserMessage.id
          ),
        };
      });
      setChatInput(question);
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to get chat response.",
      });
    } finally {
      setChatLoading(false);
    }
  }

  function handleMicInput() {
    if (typeof window === "undefined") {
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!Recognition) {
      setSpeechNotice("Speech-to-text is not supported in this browser.");
      return;
    }

    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang =
        selectedReport?.insights_json?.preferredLanguage === "hi" ? "hi-IN" : "en-IN";
      recognition.onresult = (speechEvent) => {
        const transcript = Array.from(speechEvent.results)
          .slice(speechEvent.resultIndex)
          .map((result) => result[0]?.transcript || "")
          .join(" ")
          .trim();

        if (!transcript) {
          return;
        }

        setChatInput((current) => (current.trim() ? `${current.trim()} ${transcript}` : transcript));
        setSpeechNotice(null);
      };
      recognition.onerror = (speechError) => {
        if (speechError.error === "not-allowed") {
          setSpeechNotice("Microphone access was blocked. Allow microphone access to use voice input.");
        } else if (speechError.error && speechError.error !== "aborted") {
          setSpeechNotice("Voice input could not be captured. Please try again.");
        }
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setListening(false);
      };
      setSpeechNotice(null);
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
      setSpeechNotice("Voice input could not be started in this browser.");
    }
  }

  function handleSpeakMessage(messageId: string, message: string) {
    if (typeof window === "undefined") {
      return;
    }

    const synthesis = window.speechSynthesis;

    if (!synthesis) {
      setSpeechNotice("Text-to-speech is not supported in this browser.");
      return;
    }

    if (speakingMessageId === messageId) {
      synthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang =
      selectedReport?.insights_json?.preferredLanguage === "hi" ? "hi-IN" : "en-IN";
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => {
      setSpeakingMessageId(null);
      setSpeechNotice("Text-to-speech could not read this reply aloud.");
    };
    setSpeechNotice(null);
    setSpeakingMessageId(messageId);
    synthesis.speak(utterance);
  }

  function handleToggleTheme() {
    const nextTheme = dark ? "light" : "dark";
    setThemePreference(nextTheme);
    setDark(nextTheme === "dark");
  }

  async function handleHumanizeMessage(messageId: string, message: string) {
    if (!selectedReportId) {
      return;
    }

    if (humanizedMessages[messageId]) {
      setHumanizedMessages((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      return;
    }

    setHumanizingMessageId(messageId);
    setNotice(null);

    try {
      const payload = await authorizedFetchJson("/api/chat/humanize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: selectedReportId,
          message,
        }),
      });
      const humanizedReply =
        typeof payload.reply === "string" && payload.reply.trim() ? payload.reply.trim() : message;

      setHumanizedMessages((current) => ({
        ...current,
        [messageId]: humanizedReply,
      }));
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to humanize the assistant reply.",
      });
    } finally {
      setHumanizingMessageId((current) => (current === messageId ? null : current));
    }
  }

  if (!session) {
    return null;
  }

  return (
    <WorkspaceShell
      activePage={activePage}
      sidebarOpen={sidebarOpen}
      dark={dark}
      notice={notice}
      profileName={profile?.full_name?.trim() || session.user.email || "MedScan user"}
      avatarText={getInitials(profile?.full_name, session.user.email)}
      file={file}
      processing={processing}
      pipelineStatus={pipelineStatus}
      reports={reports}
      selectedReportId={selectedReportId}
      selectedReport={selectedReport}
      reportLoading={reportLoading}
      doctorRecommendations={doctorRecommendations}
      doctorRecommendationLoading={doctorRecommendationLoading}
      doctorRecommendationError={doctorRecommendationError}
      confidenceSummary={confidenceSummary}
      confidenceLoading={confidenceLoading}
      confidenceError={confidenceError}
      chatInput={chatInput}
      chatLoading={chatLoading}
      listening={listening}
      speechNotice={speechNotice}
      speakingMessageId={speakingMessageId}
      humanizingMessageId={humanizingMessageId}
      humanizedMessages={humanizedMessages}
      uploadInputRef={fileInputRef}
      authorizedFetchJson={authorizedFetchJson}
      onShowPage={(pageId) => {
        setActivePage(pageId);
        setSidebarOpen(false);
      }}
      onToggleSidebar={() => setSidebarOpen((open) => !open)}
      onCloseSidebar={() => setSidebarOpen(false)}
      onToggleTheme={handleToggleTheme}
      onSignOut={handleSignOut}
      onSelectFile={(event) => setFile(event.target.files?.[0] || null)}
      onAnalyze={handleAnalyze}
      onSelectReport={setSelectedReportId}
      onChatInputChange={setChatInput}
      onAskQuestion={handleAskQuestion}
      onMicInput={handleMicInput}
      onSpeakMessage={handleSpeakMessage}
      onHumanizeMessage={handleHumanizeMessage}
    />
  );
}
