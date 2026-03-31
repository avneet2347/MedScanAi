"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandWordmark from "@/components/BrandWordmark";
import MedScanChrome from "@/components/MedScanChrome";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import {
  GUEST_PREVIEW_LIMIT_STORAGE_KEY,
  type GuestReportPreview,
  type GuestReportPreviewResponse,
} from "@/lib/guest-preview";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  readActiveTheme,
  setThemePreference,
} from "@/lib/theme";

/* ─────────────────────────── DATA ─────────────────────────── */
const labValues = [
  { name: "HbA1c",      value: "8.2%",  ref: "< 5.7%",        status: "HIGH",   color: "#dc2626" },
  { name: "Hemoglobin", value: "9.4",   ref: "13–17 g/dL",    status: "LOW",    color: "#ea580c" },
  { name: "Creatinine", value: "0.9",   ref: "0.6–1.2 mg/dL", status: "NORMAL", color: "#16a34a" },
  { name: "TSH",        value: "6.8",   ref: "0.4–4.0 mIU/L", status: "HIGH",   color: "#dc2626" },
  { name: "Cholesterol",value: "182",   ref: "< 200 mg/dL",   status: "NORMAL", color: "#16a34a" },
  { name: "Vitamin D",  value: "14",    ref: "30–100 ng/mL",  status: "LOW",    color: "#ea580c" },
];

const features = [
  { key: "medicine-analysis" as FeatureModuleKey, icon: "💊", tag: "PHARMACOLOGY",  title: "Medicine Analysis",  desc: "Dosage, mechanism, contraindications, and side-effects explained without jargon.",           accent: "#0284c7" },
  { key: "interaction-check" as FeatureModuleKey, icon: "⚗️", tag: "DRUG SAFETY",   title: "Interaction Check",  desc: "Cross-references every medicine against known harmful combinations with severity grading.",    accent: "#dc2626" },
  { key: "lab-report-flags" as FeatureModuleKey, icon: "🩸", tag: "PATHOLOGY",     title: "Lab Report Flags",   desc: "CBC, LFT, KFT, HbA1c — abnormal values highlighted with clinical context and risk level.",   accent: "#ea580c" },
  { key: "disease-prediction" as FeatureModuleKey, icon: "🧠", tag: "DIAGNOSTICS",   title: "Disease Prediction", desc: "ML models trained on clinical datasets infer risk patterns from symptoms and reports.",       accent: "#7c3aed" },
  { key: "diet-lifestyle" as FeatureModuleKey, icon: "🥗", tag: "NUTRITION",     title: "Diet & Lifestyle",   desc: "Therapeutic diet plans and activity guidance aligned directly with your diagnosis.",           accent: "#16a34a" },
  { key: "specialist-match" as FeatureModuleKey, icon: "🩺", tag: "REFERRAL",      title: "Specialist Match",   desc: "Recommends the right specialty — Cardiologist, Endocrinologist, Nephrologist, and more.",     accent: "#0284c7" },
  { key: "medicine-reminders" as FeatureModuleKey, icon: "🔔", tag: "COMPLIANCE",    title: "Medicine Reminders", desc: "Automated dose schedules with push notifications to improve adherence and outcomes.",          accent: "#b45309" },
  { key: "voice-explanation" as FeatureModuleKey, icon: "🗣️", tag: "ACCESSIBILITY", title: "Voice Explanation",  desc: "Reports narrated aloud in English, Hindi, or Hinglish for every patient.",                   accent: "#be185d" },
];

const steps = [
  { num: "01", emoji: "📤", label: "Upload",      desc: "Prescription or lab report — PDF, photo, or scan accepted." },
  { num: "02", emoji: "👁️", label: "OCR Reads",   desc: "Tesseract OCR extracts report text using grayscale, contrast tuning, and sharpening." },
  { num: "03", emoji: "🧬", label: "NLP Decodes", desc: "Complex medical terms converted to plain language instantly." },
  { num: "04", emoji: "⚡", label: "Act on It",   desc: "Interactions, risks, diet, referrals — all in under 2 seconds." },
];

const stats = [
  { n: "OCR",  u: "",    l: "Tesseract Powered" },
  { n: "500+", u: "",    l: "Interactions Checked" },
  { n: "<2",   u: "s",   l: "Analysis Time" },
  { n: "3",    u: "",    l: "Languages" },
  { n: "10K+", u: "",    l: "Reports Analyzed" },
];

const supabase = getBrowserSupabaseClient();
const LANDING_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
const LANDING_ALLOWED_FILE_PATTERN = /\.(pdf|png|jpe?g)$/i;

function isSupportedLandingFile(file: File) {
  const normalizedType = file.type.toLowerCase();

  if (normalizedType) {
    return LANDING_ALLOWED_MIME_TYPES.has(normalizedType);
  }

  return LANDING_ALLOWED_FILE_PATTERN.test(file.name);
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return payload.error;
  }

  return fallback;
}

export default function Home() {
  const router = useRouter();
  const [file, setFile]         = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lang, setLang]         = useState<"en" | "hi" | "hinglish">("en");
  const [dark, setDark]         = useState(true);
  const [tick, setTick]         = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [freePreviewUsed, setFreePreviewUsed] = useState(false);
  const [guestPreview, setGuestPreview] = useState<GuestReportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncThemeState = () => {
      setDark(readActiveTheme() === "dark");
    };

    syncThemeState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY) {
        return;
      }

      syncThemeState();
    };

    const handleThemeChange = () => {
      syncThemeState();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 40);

    return () => {
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setFreePreviewUsed(window.localStorage.getItem(GUEST_PREVIEW_LIMIT_STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setHasSession(Boolean(data.session));
      setAuthChecked(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setHasSession(Boolean(nextSession));
      setAuthChecked(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const rememberFreePreviewUsage = () => {
    setFreePreviewUsed(true);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(GUEST_PREVIEW_LIMIT_STORAGE_KEY, "1");
    }
  };

  const clearSelectedFile = () => {
    setFile(null);

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const goToWorkspace = () => {
    router.push("/workspace");
  };

  const openWorkspace = (mode: "login" | "signup") => {
    router.push(mode === "login" ? "/login" : "/signup");
  };

  const selectLandingFile = (nextFile: File | null) => {
    if (!nextFile) {
      return;
    }

    if (!hasSession && freePreviewUsed) {
      setPreviewError("Your free report preview is already used. Create an account or sign in to continue.");
      clearSelectedFile();
      return;
    }

    if (!isSupportedLandingFile(nextFile)) {
      setPreviewError("Please upload a PDF, PNG, or JPG file.");
      clearSelectedFile();
      return;
    }

    setPreviewError(null);
    setGuestPreview(null);
    setFile(nextFile);
  };

  const openUploadChooser = () => {
    if (hasSession) {
      goToWorkspace();
      return;
    }

    if (freePreviewUsed) {
      setPreviewError("Your free report preview is already used. Create an account or sign in to continue.");
      return;
    }

    fileRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const nextFile = e.dataTransfer.files?.[0] || null;

    if (!nextFile) {
      return;
    }

    selectLandingFile(nextFile);
  };

  const scrollToTop = (event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault();

    if (typeof window !== "undefined") {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  const handleAnalyzeButtonClick = async () => {
    if (hasSession) {
      goToWorkspace();
      return;
    }

    if (!file) {
      if (freePreviewUsed) {
        openWorkspace("signup");
      } else {
        openUploadChooser();
      }

      return;
    }

    if (freePreviewUsed) {
      openWorkspace("signup");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("language", lang);

      const response = await fetch("/api/guest-report-preview", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 403) {
          rememberFreePreviewUsage();
        }

        throw new Error(getApiErrorMessage(payload, "Unable to analyze this report right now."));
      }

      const previewResponse = payload as GuestReportPreviewResponse | null;
      const preview = previewResponse?.preview || null;

      if (!preview) {
        throw new Error("Report preview data was not returned.");
      }

      setGuestPreview(preview);
      rememberFreePreviewUsage();
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "Unable to analyze this report right now."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFeatureActivation = () => {
    openWorkspace("signup");
  };

  const scrollToSection = (sectionId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const toggleTheme = () => {
    const nextTheme = dark ? "light" : "dark";
    setThemePreference(nextTheme);
    setDark(nextTheme === "dark");
  };

  const ecgOffset = -(tick * 1.5) % 400;
  const signedIn = authChecked && hasSession;
  const guestPreviewLocked = !signedIn && freePreviewUsed;
  const uploadHeading = signedIn
    ? "Welcome Back To Your Workspace."
    : guestPreviewLocked
      ? "Create An Account To Keep Going."
      : "Upload Your First Report Free.";
  const uploadSubheading = signedIn
    ? "You are already signed in. Open your private workspace for saved uploads, OCR, assistant chat, and full report history."
    : guestPreviewLocked
      ? "Your free preview is complete. Create an account to save reports, unlock more uploads, and continue with secure analysis."
      : "Try one report without creating an account. After your first preview, create an account to continue uploading and keep everything securely saved.";
  const dropTitle = file
    ? file.name
    : signedIn
      ? "Open your workspace to upload and save reports"
      : guestPreviewLocked
        ? "Your free upload is complete"
        : "Drop one PDF, PNG, or JPG report here";
  const dropSubtitle = file
    ? signedIn
      ? "You are signed in. Continue in your workspace to analyze and save this report."
      : `${(file.size / 1024).toFixed(0)} KB - analyse this first report for free, then create an account to continue.`
    : signedIn
      ? "Use the workspace uploader for full report analysis, saved history, and follow-up assistant answers."
      : guestPreviewLocked
        ? "Sign up or sign in to unlock your next report upload and keep your analysis history private."
        : "No signup required for the first upload. Results are grounded in OCR-extracted report data only.";
  const analyzeButtonLabel = signedIn
    ? "Open Workspace"
    : previewLoading
      ? "Analysing Report..."
      : guestPreviewLocked
        ? "Create Free Account"
        : file
          ? "Analyse First Report Free"
          : "Choose Report";
  const dropZoneClassName = `drop-zone${dragging ? " dragging" : ""}${signedIn ? " signed-in" : ""}${guestPreviewLocked ? " locked" : ""}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }

        /* ── TOKENS ── */
        :root {
          --font-sans:  'DM Sans', sans-serif;
          --font-serif: 'DM Serif Display', serif;
          --font-mono:  'JetBrains Mono', monospace;

          /* light */
          --bg:         #f8fafc;
          --bg-subtle:  #f1f5f9;
          --surface:    #ffffff;
          --surface2:   #f8fafc;
          --border:     #e2e8f0;
          --border-med: #cbd5e1;
          --ink:        #0f172a;
          --ink2:       #1e293b;
          --ink3:       #334155;
          --muted:      #64748b;
          --muted2:     #94a3b8;

          --blue:       #0369a1;
          --blue-lt:    #e0f2fe;
          --blue-brd:   #bae6fd;
          --teal:       #0f766e;
          --teal-lt:    #ccfbf1;
          --teal-brd:   #99f6e4;
          --red:        #dc2626;
          --red-lt:     #fee2e2;
          --red-brd:    #fecaca;
          --orange:     #ea580c;
          --orange-lt:  #ffedd5;
          --green:      #16a34a;
          --green-lt:   #dcfce7;

          --accent:     #0369a1;
          --accent2:    #0284c7;

          --shadow-sm:  0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.04);
          --shadow-md:  0 4px 16px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.04);
          --shadow-lg:  0 20px 50px rgba(15,23,42,0.10), 0 8px 20px rgba(15,23,42,0.05);
          --shadow-xl:  0 32px 80px rgba(15,23,42,0.14), 0 12px 32px rgba(15,23,42,0.07);
        }

        /* ────── DARK MODE TOKENS ────── */
        body.dark {
          --bg:         #060d18;
          --bg-subtle:  #0c1729;
          --surface:    #0f1e30;
          --surface2:   #132237;
          --border:     #1e3047;
          --border-med: #243a57;
          --ink:        #f0f6ff;
          --ink2:       #dce9f8;
          --ink3:       #9db8d4;
          --muted:      #6b8aaa;
          --muted2:     #4a6680;

          --blue:       #38bdf8;
          --blue-lt:    rgba(56,189,248,0.08);
          --blue-brd:   rgba(56,189,248,0.18);
          --teal:       #2dd4bf;
          --teal-lt:    rgba(45,212,191,0.08);
          --teal-brd:   rgba(45,212,191,0.18);
          --red:        #f87171;
          --red-lt:     rgba(248,113,113,0.09);
          --red-brd:    rgba(248,113,113,0.2);
          --orange:     #fb923c;
          --orange-lt:  rgba(251,146,60,0.09);
          --green:      #4ade80;
          --green-lt:   rgba(74,222,128,0.09);

          --accent:     #38bdf8;
          --accent2:    #7dd3fc;

          --shadow-sm:  0 1px 4px rgba(0,0,0,0.4);
          --shadow-md:  0 6px 20px rgba(0,0,0,0.4);
          --shadow-lg:  0 20px 50px rgba(0,0,0,0.5);
          --shadow-xl:  0 32px 80px rgba(0,0,0,0.55);
        }

        body {
          font-family: var(--font-sans);
          background: var(--bg);
          color: var(--ink);
          overflow-x: hidden;
          transition: background 0.3s, color 0.3s;
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
        }

        /* ────── DARK MODE ────── */
        body.dark {
          --bg:         #060d18;
          --bg-subtle:  #0c1729;
          --surface:    #0f1e30;
          --surface2:   #132237;
          --border:     #1e3047;
          --border-med: #243a57;
          --ink:        #f0f6ff;
          --ink2:       #dce9f8;
          --ink3:       #9db8d4;
          --muted:      #6b8aaa;
          --muted2:     #4a6680;

          --blue:       #38bdf8;
          --blue-lt:    rgba(56,189,248,0.08);
          --blue-brd:   rgba(56,189,248,0.18);
          --teal:       #2dd4bf;
          --teal-lt:    rgba(45,212,191,0.08);
          --teal-brd:   rgba(45,212,191,0.18);
          --red:        #f87171;
          --red-lt:     rgba(248,113,113,0.09);
          --red-brd:    rgba(248,113,113,0.2);
          --orange:     #fb923c;
          --orange-lt:  rgba(251,146,60,0.09);
          --green:      #4ade80;
          --green-lt:   rgba(74,222,128,0.09);

          --accent:     #38bdf8;
          --accent2:    #7dd3fc;

          --shadow-sm:  0 1px 4px rgba(0,0,0,0.4);
          --shadow-md:  0 6px 20px rgba(0,0,0,0.4);
          --shadow-lg:  0 20px 50px rgba(0,0,0,0.5);
          --shadow-xl:  0 32px 80px rgba(0,0,0,0.55);
        }

        /* ────── GLOBAL UTILITIES ────── */
        .container { max-width: 1180px; margin: 0 auto; padding: 0 2rem; }

        /* ────── NAV ────── */
        .nav {
          position: sticky; top: 0; z-index: 500;
          height: 64px;
          display: flex; align-items: center;
          padding: 0 2.5rem;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
          transition: background 0.3s, border-color 0.3s;
        }
        .nav-logo {
          display: flex; align-items: center; gap: 0.72rem;
          font-family: var(--font-serif);
          font-size: 1.3rem;
          color: var(--ink);
          --brand-wordmark-base: var(--ink);
          --brand-wordmark-accent: var(--accent);
          --brand-wordmark-size: 1.3rem;
          --brand-wordmark-weight: 400;
          --brand-wordmark-letter-spacing: -0.03em;
          --brand-wordmark-gap: 0.18rem;
          text-decoration: none;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .nav-logo-mark {
          width: 34px; height: 34px; border-radius: 9px;
          background: linear-gradient(135deg, #0369a1, #0ea5e9);
          display: flex; align-items: center; justify-content: center;
          font-size: 1rem;
          box-shadow: 0 3px 12px rgba(3,105,161,0.35);
          flex-shrink: 0;
        }
        .nav-links {
          display: flex; gap: 0.25rem; list-style: none;
          margin-left: 2.5rem;
        }
        .nav-links a {
          display: block;
          padding: 0.4rem 0.85rem;
          border-radius: 7px;
          color: var(--muted);
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 500;
          transition: color 0.2s, background 0.2s;
        }
        .nav-links a:hover { color: var(--ink); background: var(--bg-subtle); }
        .nav-right { display: flex; align-items: center; gap: 0.75rem; margin-left: auto; }

        .status-pill {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.3rem 0.8rem;
          background: var(--green-lt);
          border: 1px solid rgba(22,163,74,0.2);
          border-radius: 50px;
          font-size: 0.7rem; font-weight: 600;
          color: var(--green);
          transition: background 0.3s;
        }
        .pulse-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--green);
          animation: blink 1.4s ease infinite;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

        .btn { 
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.48rem 1.1rem; border-radius: 8px;
          font-family: var(--font-sans); font-size: 0.85rem; font-weight: 600;
          cursor: pointer; border: none; transition: all 0.2s;
          text-decoration: none; white-space: nowrap;
        }
        .btn-outline {
          background: transparent;
          border: 1px solid var(--border-med);
          color: var(--ink3);
        }
        .btn-outline:hover { background: var(--bg-subtle); border-color: var(--muted2); }
        .btn-solid {
          background: var(--accent);
          color: #fff;
          box-shadow: 0 2px 8px rgba(3,105,161,0.3);
        }
        .btn-solid:hover { background: var(--accent2); box-shadow: 0 4px 16px rgba(3,105,161,0.4); transform: translateY(-1px); }

        .theme-toggle {
          width: 40px; height: 40px; border-radius: 9px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 1rem;
          transition: background 0.2s, border-color 0.2s;
          flex-shrink: 0;
        }
        .theme-toggle:hover { background: var(--border); }

        /* ────── HERO ────── */
        .hero {
          position: relative;
          min-height: calc(100vh - 64px);
          display: grid; grid-template-columns: 1fr 1fr;
          align-items: center; gap: 4rem;
          max-width: 1180px; margin: 0 auto;
          padding: 5rem 2rem 4rem;
        }
        .hero::before {
          content: '';
          position: fixed; inset: 0; z-index: -1;
          background: var(--bg);
          transition: background 0.3s;
        }

        /* subtle grid bg */
        .hero-bg-grid {
          position: fixed; inset: 0; z-index: -1; pointer-events: none;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 52px 52px;
          opacity: 0.5;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 10%, black 40%, transparent 100%);
        }

        .hero-eyebrow {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.3rem 0.9rem;
          background: var(--blue-lt);
          border: 1px solid var(--blue-brd);
          border-radius: 50px;
          font-size: 0.7rem; font-weight: 700; letter-spacing: 1.5px;
          text-transform: uppercase; color: var(--blue);
          margin-bottom: 1.6rem;
          animation: fade-up 0.6s ease both;
        }
        @keyframes fade-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }

        .hero h1 {
          font-family: var(--font-serif);
          font-size: clamp(2.8rem, 5.5vw, 4.5rem);
          font-weight: 400;
          line-height: 1.08;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin-bottom: 1.4rem;
          animation: fade-up 0.6s 0.08s ease both;
        }
        .hero h1 .highlight {
          font-style: italic;
          background: linear-gradient(135deg, #0369a1, #0ea5e9 55%, #06b6d4);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .hero-sub {
          font-size: 1.05rem; line-height: 1.75;
          color: var(--muted);
          max-width: 460px;
          margin-bottom: 2.2rem;
          animation: fade-up 0.6s 0.16s ease both;
        }
        .hero-ctas {
          display: flex; gap: 0.75rem; flex-wrap: wrap;
          animation: fade-up 0.6s 0.22s ease both;
        }
        .btn-hero-primary {
          padding: 0.78rem 1.8rem;
          background: linear-gradient(135deg, #0369a1, #0ea5e9);
          color: #fff;
          border-radius: 10px;
          font-family: var(--font-sans); font-size: 0.92rem; font-weight: 600;
          border: none; cursor: pointer;
          box-shadow: 0 4px 20px rgba(3,105,161,0.35);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-hero-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(3,105,161,0.45); }
        .btn-hero-ghost {
          padding: 0.78rem 1.8rem;
          background: var(--surface);
          color: var(--ink3);
          border-radius: 10px;
          font-family: var(--font-sans); font-size: 0.92rem; font-weight: 600;
          border: 1px solid var(--border-med); cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .btn-hero-ghost:hover { background: var(--bg-subtle); border-color: var(--muted2); }

        .trust-badges {
          display: flex; gap: 0.6rem; flex-wrap: wrap;
          margin-top: 1.8rem;
          animation: fade-up 0.6s 0.3s ease both;
        }
        .trust-badge {
          display: flex; align-items: center; gap: 0.35rem;
          padding: 0.28rem 0.75rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 50px;
          font-size: 0.72rem; font-weight: 500; color: var(--muted);
          box-shadow: var(--shadow-sm);
        }

        /* ────── PATIENT CARD ────── */
        .patient-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: var(--shadow-xl);
          animation: fade-up 0.7s 0.1s ease both;
          transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
        }
        .pc-header {
          background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
          padding: 1.2rem 1.5rem;
          display: flex; align-items: center; justify-content: space-between;
        }
        body.dark .pc-header {
          background: linear-gradient(135deg, #030912 0%, #091829 100%);
        }
        .pc-avatar {
          width: 42px; height: 42px; border-radius: 50%;
          background: rgba(255,255,255,0.12);
          border: 2px solid rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.2rem;
        }
        .pc-name { font-weight: 600; font-size: 0.9rem; color: #fff; }
        .pc-meta { font-family: var(--font-mono); font-size: 0.65rem; color: rgba(255,255,255,0.45); margin-top: 0.1rem; }
        .pc-live {
          display: flex; align-items: center; gap: 0.35rem;
          padding: 0.25rem 0.65rem;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 50px;
          font-size: 0.65rem; font-weight: 700; color: rgba(255,255,255,0.85);
          letter-spacing: 0.5px;
        }

        .pc-ecg {
          background: var(--bg-subtle);
          padding: 0.8rem 1.4rem;
          border-bottom: 1px solid var(--border);
          transition: background 0.3s;
        }
        .pc-ecg-label {
          font-family: var(--font-mono); font-size: 0.58rem; font-weight: 600;
          color: var(--accent); letter-spacing: 2px; text-transform: uppercase;
          margin-bottom: 0.4rem;
        }

        .pc-vitals {
          display: grid; grid-template-columns: repeat(3, 1fr);
          border-bottom: 1px solid var(--border);
        }
        .pc-vital {
          padding: 0.9rem 1.2rem;
          border-right: 1px solid var(--border);
          position: relative;
        }
        .pc-vital:last-child { border-right: none; }
        .pc-vital-label { font-size: 0.6rem; font-weight: 700; color: var(--muted2); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 0.2rem; }
        .pc-vital-val { font-family: var(--font-mono); font-size: 1.2rem; font-weight: 700; color: var(--ink); line-height: 1; }
        .pc-vital-unit { font-size: 0.6rem; color: var(--muted); margin-top: 0.1rem; }
        .pc-vital-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: var(--bg-subtle); }
        .pc-vital-fill { height: 100%; border-radius: 0 2px 2px 0; }

        .pc-labs { padding: 1rem 1.4rem; }
        .pc-labs-title {
          font-size: 0.6rem; font-weight: 700; color: var(--muted2);
          letter-spacing: 2px; text-transform: uppercase;
          margin-bottom: 0.7rem;
        }
        .pc-lab-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.38rem 0;
          border-bottom: 1px solid var(--bg-subtle);
        }
        .pc-lab-row:last-child { border-bottom: none; }
        .pc-lab-name { font-size: 0.78rem; font-weight: 500; color: var(--ink3); }
        .pc-lab-right { display: flex; align-items: center; gap: 0.5rem; }
        .pc-lab-val { font-family: var(--font-mono); font-size: 0.76rem; font-weight: 700; }
        .badge {
          padding: 0.12rem 0.44rem;
          border-radius: 4px;
          font-size: 0.58rem; font-weight: 800; letter-spacing: 0.5px;
        }
        .badge-high { background: var(--red-lt);    color: var(--red);    border: 1px solid var(--red-brd); }
        .badge-low  { background: var(--orange-lt); color: var(--orange); border: 1px solid rgba(234,88,12,0.2); }
        .badge-norm { background: var(--green-lt);  color: var(--green);  border: 1px solid rgba(22,163,74,0.2); }

        .pc-footer {
          padding: 0.8rem 1.4rem;
          background: var(--bg-subtle);
          border-top: 1px solid var(--border);
          display: flex; align-items: center; gap: 0.5rem;
          transition: background 0.3s;
        }
        .ai-chip {
          display: flex; align-items: center; gap: 0.3rem;
          background: linear-gradient(135deg, #0369a1, #0ea5e9);
          border-radius: 5px; padding: 0.22rem 0.55rem;
          font-size: 0.65rem; font-weight: 700; color: #fff;
          letter-spacing: 0.3px;
        }
        .pc-footer-txt { font-size: 0.72rem; color: var(--muted); }

        /* ────── STATS BAND ────── */
        .stats-band {
          background: linear-gradient(135deg, #0c1e35 0%, #0f2744 50%, #0a1929 100%);
          padding: 2.5rem 3rem;
          display: flex; justify-content: center; gap: 5rem; flex-wrap: wrap;
        }
        body.dark .stats-band {
          background: linear-gradient(135deg, #040b15 0%, #070f1f 100%);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }        .stat-item { text-align: center; }
        .stat-val { font-family: var(--font-serif); font-size: 2.2rem; color: #fff; line-height: 1; }
        .stat-unit { font-size: 1rem; color: #38bdf8; font-weight: 700; }
        .stat-label { font-size: 0.7rem; color: rgba(255,255,255,0.4); letter-spacing: 1px; text-transform: uppercase; margin-top: 0.3rem; }

        /* ────── SECTION HEADER ────── */
        .section-eyebrow {
          display: flex; align-items: center; gap: 0.55rem;
          font-size: 0.68rem; font-weight: 700; letter-spacing: 3px;
          text-transform: uppercase; color: var(--accent);
          margin-bottom: 0.75rem;
        }
        .section-eyebrow::before { content: ''; width: 20px; height: 2px; background: currentColor; border-radius: 2px; }
        .section-h {
          font-family: var(--font-serif);
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 400; line-height: 1.12;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin-bottom: 1rem;
        }
        .section-sub {
          font-size: 1rem; line-height: 1.72;
          color: var(--muted);
          max-width: 480px;
        }

        /* ────── UPLOAD SECTION ────── */
        .upload-section {
          padding: 6rem 2rem;
          max-width: 1180px; margin: 0 auto;
          display: grid; grid-template-columns: 1.15fr 0.85fr;
          gap: 5rem; align-items: start;
        }

        .drop-zone {
          position: relative;
          border: 2px dashed var(--border-med);
          border-radius: 16px;
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          background: var(--surface);
          transition: all 0.25s;
          overflow: hidden;
        }
        .drop-zone::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, rgba(3,105,161,0.04), transparent 70%);
          pointer-events: none;
        }
        .drop-zone:hover { border-color: var(--accent); background: var(--blue-lt); }
        .drop-zone.dragging { border-color: var(--accent2); background: var(--blue-lt); box-shadow: 0 0 0 6px rgba(3,105,161,0.08); }
        .drop-zone.locked {
          cursor: default;
          border-style: solid;
          background: var(--bg-subtle);
        }
        .drop-zone.locked:hover {
          border-color: var(--border-med);
          background: var(--bg-subtle);
        }
        .drop-zone.signed-in { border-style: solid; }
        .drop-icon-wrap {
          width: 72px; height: 72px; border-radius: 18px;
          background: var(--blue-lt);
          border: 1px solid var(--blue-brd);
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; margin: 0 auto 1.2rem;
          transition: transform 0.2s;
        }
        .drop-zone:hover .drop-icon-wrap { transform: scale(1.06); }
        .drop-title { font-size: 1rem; font-weight: 600; color: var(--ink); margin-bottom: 0.4rem; }
        .drop-sub   { font-size: 0.82rem; color: var(--muted); margin-bottom: 1.1rem; }
        .fmt-chips { display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap; }
        .fmt-chip {
          padding: 0.2rem 0.55rem;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: 4px;
          font-family: var(--font-mono); font-size: 0.65rem; font-weight: 600;
          color: var(--muted);
        }

        .lang-selector { margin-top: 1.5rem; }
        .lang-label { font-size: 0.7rem; font-weight: 700; color: var(--muted2); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 0.5rem; }
        .lang-btns { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .lang-btn {
          padding: 0.42rem 1rem;
          border-radius: 8px;
          border: 1.5px solid var(--border);
          background: var(--surface);
          font-family: var(--font-sans); font-size: 0.8rem; font-weight: 500;
          color: var(--muted); cursor: pointer;
          transition: all 0.2s;
        }
        .lang-btn.active { border-color: var(--accent); color: var(--accent); background: var(--blue-lt); font-weight: 700; }
        .lang-btn:hover:not(.active) { border-color: var(--border-med); color: var(--ink3); }

        .file-selected {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 0.55rem 1rem;
          background: var(--blue-lt);
          border: 1px solid var(--blue-brd);
          border-radius: 8px;
          font-size: 0.8rem; font-weight: 500; color: var(--blue);
          margin-top: 1rem;
          min-width: 0;
          word-break: break-word;
        }
        .file-remove {
          margin-left: auto;
          background: none; border: none;
          color: var(--red); cursor: pointer;
          font-size: 1.1rem; line-height: 1;
          padding: 0 0.1rem;
          transition: opacity 0.2s;
        }
        .file-remove:hover { opacity: 0.7; }

        .btn-analyze {
          margin-top: 1.2rem;
          width: 100%;
          padding: 0.85rem;
          border-radius: 10px;
          background: linear-gradient(135deg, #0369a1, #0ea5e9);
          border: none;
          font-family: var(--font-sans); font-size: 0.95rem; font-weight: 600;
          color: #fff; cursor: pointer;
          box-shadow: 0 4px 20px rgba(3,105,161,0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-analyze:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(3,105,161,0.4); }
        .btn-analyze:disabled {
          cursor: wait;
          opacity: 0.72;
          transform: none;
          box-shadow: 0 4px 20px rgba(3,105,161,0.18);
        }
        .upload-inline-note {
          margin-top: 1rem;
          padding: 0.8rem 0.95rem;
          border-radius: 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--muted);
          font-size: 0.84rem;
          line-height: 1.6;
        }
        .upload-inline-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-top: 0.95rem;
        }
        .preview-card {
          margin-top: 1.3rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          box-shadow: var(--shadow-md);
          overflow: hidden;
        }
        .preview-head {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-subtle);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .preview-eyebrow {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 0.4rem;
        }
        .preview-title {
          font-family: var(--font-serif);
          font-size: 1.3rem;
          color: var(--ink);
        }
        .preview-meta {
          font-size: 0.82rem;
          color: var(--muted);
          text-align: right;
        }
        .preview-summary {
          padding: 1.1rem 1.25rem 0;
          color: var(--ink2);
          line-height: 1.75;
          font-size: 0.95rem;
        }
        .preview-badges {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          padding: 0.9rem 1.25rem 0;
        }
        .preview-badge {
          padding: 0.34rem 0.7rem;
          border-radius: 999px;
          background: var(--blue-lt);
          border: 1px solid var(--blue-brd);
          color: var(--accent);
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .preview-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          padding: 1rem 1.25rem 1.25rem;
        }
        .preview-panel {
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1rem;
          background: color-mix(in srgb, var(--surface) 88%, var(--bg-subtle) 12%);
        }
        .preview-panel-title {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 1.1px;
          text-transform: uppercase;
          color: var(--muted2);
          margin-bottom: 0.8rem;
        }
        .preview-list {
          list-style: none;
          display: grid;
          gap: 0.8rem;
        }
        .preview-item {
          display: grid;
          gap: 0.2rem;
        }
        .preview-item strong {
          color: var(--ink);
          font-size: 0.92rem;
          font-weight: 600;
        }
        .preview-item span,
        .preview-item small {
          color: var(--muted);
          line-height: 1.55;
        }
        .preview-item small { font-size: 0.76rem; }
        .preview-empty {
          color: var(--muted);
          font-size: 0.86rem;
          line-height: 1.6;
        }
        .preview-gate {
          border-top: 1px solid var(--border);
          background: var(--bg-subtle);
          padding: 1rem 1.25rem 1.15rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .preview-gate-copy {
          color: var(--muted);
          font-size: 0.88rem;
          line-height: 1.65;
          max-width: 540px;
        }
        .preview-gate-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        /* HOW IT WORKS */
        .hiw-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--shadow-md);
          transition: background 0.3s, border-color 0.3s;
        }
        .hiw-header {
          padding: 1.2rem 1.5rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-subtle);
          transition: background 0.3s;
        }
        .hiw-title { font-family: var(--font-serif); font-size: 1.25rem; color: var(--ink); }
        .hiw-sub { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
        .hiw-steps { padding: 0.5rem 0; }
        .hiw-step {
          display: flex; align-items: flex-start; gap: 1rem;
          padding: 1rem 1.5rem;
          position: relative; transition: background 0.15s;
        }
        .hiw-step:hover { background: var(--bg-subtle); }
        .hiw-step:not(:last-child)::after {
          content: '';
          position: absolute; left: calc(1.5rem + 15px); top: calc(1rem + 32px);
          width: 2px; height: calc(100% - 1rem);
          background: linear-gradient(to bottom, var(--border-med), transparent);
        }
        .hiw-num {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, #0369a1, #0ea5e9);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; color: #fff;
        }
        .hiw-emoji { font-size: 1rem; margin-top: 0.4rem; flex-shrink: 0; }
        .hiw-step-title { font-size: 0.85rem; font-weight: 700; color: var(--ink); margin-bottom: 0.18rem; }
        .hiw-step-desc  { font-size: 0.78rem; color: var(--muted); line-height: 1.55; }

        /* ────── FEATURES ────── */
        .features-section {
          background: linear-gradient(160deg, #0a1929 0%, #0c2040 55%, #071624 100%);
          padding: 6rem 2rem;
          position: relative; overflow: hidden;
        }
        body.dark .features-section {
          background: linear-gradient(160deg, #030810 0%, #040d1c 100%);
        }        .features-section::before {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 55% 45% at 85% 15%, rgba(14,165,233,0.09), transparent),
            radial-gradient(ellipse 40% 35% at 15% 85%, rgba(3,105,161,0.07), transparent);
        }
        .features-inner { max-width: 1180px; margin: 0 auto; position: relative; z-index: 1; }
        .features-head { text-align: center; margin-bottom: 3.5rem; }
        .features-head .section-eyebrow { justify-content: center; color: #7dd3fc; }
        .features-head .section-eyebrow::before { background: #7dd3fc; }
        .features-head .section-h { color: #f0f6ff; }
        .features-head .section-sub { color: rgba(240,246,255,0.45); margin: 0 auto; }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 1rem;
        }
        .feature-card {
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 14px;
          padding: 1.5rem 1.3rem;
          position: relative; overflow: hidden;
          transition: transform 0.2s, background 0.2s;
          cursor: pointer;
          outline: none;
        }
        .feature-card::after {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, var(--fc-accent), transparent);
          opacity: 0; transition: opacity 0.3s;
        }
        .feature-card:hover { transform: translateY(-4px); background: rgba(255,255,255,0.065); }
        .feature-card:hover::after { opacity: 1; }
        .feature-card:focus-visible { transform: translateY(-4px); background: rgba(255,255,255,0.065); }
        .feature-card:focus-visible::after { opacity: 1; }
        .feature-tag { font-family: var(--font-mono); font-size: 0.58rem; font-weight: 600; letter-spacing: 2px; margin-bottom: 0.75rem; }
        .feature-icon { font-size: 1.7rem; margin-bottom: 0.75rem; }
        .feature-title { font-size: 0.88rem; font-weight: 700; color: #f0f6ff; margin-bottom: 0.45rem; }
        .feature-desc  { font-size: 0.77rem; color: rgba(240,246,255,0.4); line-height: 1.62; }

        /* ────── LAB DEMO ────── */
        .lab-section {
          max-width: 1180px; margin: 0 auto;
          padding: 6rem 2rem;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 5rem; align-items: center;
        }
        .lab-bullets { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem; }
        .lab-bullet {
          display: flex; align-items: flex-start; gap: 0.65rem;
          padding: 0.75rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          font-size: 0.85rem; color: var(--muted);
          box-shadow: var(--shadow-sm);
          transition: background 0.3s, border-color 0.3s;
        }
        .lab-bullet-icon { font-size: 1rem; flex-shrink: 0; margin-top: 0.05rem; }

        .lab-table {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: var(--shadow-lg);
          transition: background 0.3s, border-color 0.3s;
        }
        .lt-head {
          background: var(--bg-subtle);
          padding: 0.95rem 1.5rem;
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--border);
          transition: background 0.3s;
        }
        .lt-head-left { display: flex; align-items: center; gap: 0.6rem; }
        .lt-icon { font-size: 1.1rem; }
        .lt-title { font-weight: 700; font-size: 0.85rem; color: var(--ink); }
        .lt-date  { font-family: var(--font-mono); font-size: 0.68rem; color: var(--muted); }
        .lt-cols {
          display: grid; grid-template-columns: 2fr 1.3fr 1.8fr 0.9fr;
          padding: 0.5rem 1.5rem;
          font-size: 0.62rem; font-weight: 700; color: var(--muted2);
          letter-spacing: 1px; text-transform: uppercase;
          border-bottom: 1px solid var(--border);
          background: var(--bg-subtle);
          transition: background 0.3s;
        }
        .lt-row {
          display: grid; grid-template-columns: 2fr 1.3fr 1.8fr 0.9fr;
          padding: 0.72rem 1.5rem; align-items: center;
          border-bottom: 1px solid var(--border);
          transition: background 0.15s;
        }
        .lt-row > span { min-width: 0; }
        .lt-row:last-child { border-bottom: none; }
        .lt-row:hover { background: var(--bg-subtle); }
        .lt-name { font-size: 0.82rem; font-weight: 600; color: var(--ink); }
        .lt-val  { font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; }
        .lt-ref  { font-family: var(--font-mono); font-size: 0.68rem; color: var(--muted); }
        .lt-foot {
          padding: 0.8rem 1.5rem;
          background: var(--bg-subtle);
          border-top: 1px solid var(--border);
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.75rem; color: var(--muted);
          transition: background 0.3s;
        }

        /* ────── ALERT STRIP ────── */
        .alert-wrap { max-width: 1180px; margin: 0 auto; padding: 0 2rem 5rem; }
        .alert-card {
          background: var(--surface);
          border: 1.5px solid var(--red-brd);
          border-radius: 18px;
          padding: 2.2rem 2.6rem;
          display: grid; grid-template-columns: auto 1fr auto;
          align-items: center; gap: 2rem;
          box-shadow: 0 8px 32px rgba(220,38,38,0.08);
          position: relative; overflow: hidden;
          transition: background 0.3s, border-color 0.3s;
        }
        .alert-card::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
          background: linear-gradient(to bottom, var(--red), var(--orange));
        }
        .alert-icon {
          width: 60px; height: 60px; border-radius: 16px;
          background: var(--red-lt);
          border: 1.5px solid var(--red-brd);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.75rem;
          animation: pulse-red 2s ease infinite;
        }
        @keyframes pulse-red { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.25)} 50%{box-shadow:0 0 0 10px rgba(220,38,38,0)} }
        .alert-title { font-family: var(--font-serif); font-size: 1.3rem; color: var(--red); margin-bottom: 0.4rem; }
        .alert-desc  { color: var(--muted); font-size: 0.88rem; line-height: 1.65; }
        .alert-badge {
          background: var(--red-lt);
          border: 1px solid var(--red-brd);
          border-radius: 10px;
          padding: 0.6rem 1.2rem;
          font-size: 0.68rem; font-weight: 800; color: var(--red);
          letter-spacing: 1px; text-align: center; white-space: nowrap;
          line-height: 1.6;
        }

        /* ────── CTA ────── */
        .cta-section {
          background: linear-gradient(150deg, #0a1929 0%, #0c2040 55%, #071624 100%);
          padding: 7rem 2rem; text-align: center;
          position: relative; overflow: hidden;
        }
        body.dark .cta-section { background: linear-gradient(150deg, #030810 0%, #050f20 100%); border-top: 1px solid var(--border); }
        .cta-section::before {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse 60% 45% at 50% 0%, rgba(14,165,233,0.12), transparent 65%);
        }
        .cta-inner { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; }
        .cta-section h2 { font-family: var(--font-serif); font-size: clamp(2.2rem, 5vw, 3.8rem); color: #fff; letter-spacing: -0.02em; margin-bottom: 1rem; line-height: 1.1; }
        .cta-section h2 em { font-style: italic; color: #7dd3fc; -webkit-text-fill-color: #7dd3fc; }
        .cta-section p { color: rgba(255,255,255,0.45); font-size: 1rem; margin-bottom: 2.4rem; }
        .cta-buttons { display: flex; gap: 0.9rem; justify-content: center; flex-wrap: wrap; }
        .btn-cta-primary {
          padding: 0.88rem 2.2rem;
          background: linear-gradient(135deg, #0ea5e9, #38bdf8);
          border: none; border-radius: 10px;
          font-family: var(--font-sans); font-size: 0.95rem; font-weight: 700;
          color: #0a1929; cursor: pointer;
          box-shadow: 0 8px 28px rgba(14,165,233,0.35);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(14,165,233,0.45); }
        .btn-cta-ghost {
          padding: 0.88rem 2.2rem;
          background: rgba(255,255,255,0.07);
          border: 1.5px solid rgba(255,255,255,0.18);
          border-radius: 10px;
          font-family: var(--font-sans); font-size: 0.95rem; font-weight: 600;
          color: rgba(255,255,255,0.85); cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .btn-cta-ghost:hover { background: rgba(255,255,255,0.13); border-color: rgba(255,255,255,0.3); }

        /* ────── FOOTER ────── */
        footer {
          background: #030810;
          padding: 1.8rem 2.5rem;
          display: flex; align-items: center;
          justify-content: space-between; flex-wrap: wrap; gap: 1rem;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .f-logo {
          display: inline-flex;
          align-items: center;
          color: #f0f6ff;
          --brand-wordmark-base: #f0f6ff;
          --brand-wordmark-accent: #38bdf8;
          --brand-wordmark-size: 1.3rem;
          --brand-wordmark-weight: 400;
          --brand-wordmark-letter-spacing: -0.03em;
          --brand-wordmark-gap: 0.18rem;
        }
        footer p { color: rgba(255,255,255,0.25); font-size: 0.75rem; }
        .f-links { display: flex; gap: 1.5rem; }
        .f-links a { color: rgba(255,255,255,0.28); text-decoration: none; font-size: 0.75rem; transition: color 0.2s; }
        .f-links a:hover { color: #38bdf8; }

        /* ────── RESPONSIVE ────── */
        @media (max-width: 1100px) {
          .nav { padding: 0 1.5rem; }
          .nav-links { margin-left: 1.4rem; }
          .hero,
          .upload-section,
          .lab-section { gap: 3rem; }
        }

        @media (max-width: 900px) {
          .nav { padding: 0 1.4rem; }
          .nav-links, .status-pill { display: none; }
          .hero { grid-template-columns: 1fr; min-height: auto; padding: 3.5rem 1.4rem 2rem; }
          .hero-card-col { display: none; }
          .upload-section { grid-template-columns: 1fr; padding: 4rem 1.4rem; gap: 2.5rem; }
          .lab-section { grid-template-columns: 1fr; padding: 4rem 1.4rem; gap: 2.5rem; }
          .stats-band { gap: 2rem; padding: 2rem 1.5rem; }
          .alert-card { grid-template-columns: auto 1fr; }
          .alert-badge { display: none; }
          .hero-sub, .section-sub { max-width: none; }
          .lt-head { gap: 0.75rem; flex-wrap: wrap; }
          footer { padding: 1.5rem 1.4rem; flex-direction: column; align-items: flex-start; }
        }

        @media (max-width: 640px) {
          .container { padding: 0 1rem; }
          .nav {
            height: auto;
            min-height: 64px;
            padding: 0.85rem 1rem;
            flex-wrap: wrap;
            gap: 0.75rem;
          }
          .nav-logo {
            font-size: 1.12rem;
            --brand-wordmark-size: 1.12rem;
          }
          .nav-right {
            width: 100%;
            margin-left: 0;
            justify-content: flex-start;
            flex-wrap: wrap;
            gap: 0.6rem;
          }
          .nav-right .btn {
            flex: 1 1 0;
            justify-content: center;
            padding-inline: 0.95rem;
          }
          .theme-toggle { margin-left: auto; }

          .hero {
            padding: 2.8rem 1rem 1.7rem;
            gap: 1.75rem;
          }
          .hero h1 { font-size: clamp(2.25rem, 11vw, 3.1rem); }
          .hero-sub { font-size: 0.95rem; line-height: 1.7; }
          .hero-ctas,
          .cta-buttons { flex-direction: column; }
          .btn-hero-primary,
          .btn-hero-ghost,
          .btn-cta-primary,
          .btn-cta-ghost {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .stats-band {
            padding: 1.8rem 1rem;
            gap: 1.25rem 1.75rem;
          }
          .stat-item {
            flex: 1 1 calc(50% - 1rem);
            min-width: 130px;
          }
          .stat-val { font-size: 1.8rem; }

          .upload-section,
          .lab-section { padding: 3rem 1rem; gap: 2rem; }
          .drop-zone { padding: 2.25rem 1.1rem; }
          .preview-grid { grid-template-columns: 1fr; }
          .drop-icon-wrap {
            width: 64px;
            height: 64px;
            border-radius: 16px;
          }

          .hiw-header { padding: 1rem 1.1rem; }
          .hiw-step {
            padding: 1rem 1.1rem;
            gap: 0.85rem;
          }
          .hiw-step:not(:last-child)::after {
            left: calc(1.1rem + 15px);
          }

          .features-section,
          .cta-section { padding-inline: 1rem; }
          .features-section { padding-block: 4rem; }
          .features-head { margin-bottom: 2.5rem; }
          .features-grid { grid-template-columns: 1fr; }
          .feature-card { padding: 1.25rem 1.1rem; }

          .lab-table { border-radius: 16px; }
          .lt-head {
            padding: 0.9rem 1rem;
            flex-direction: column;
            align-items: flex-start;
          }
          .lt-cols { display: none; }
          .lt-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.6rem 1rem;
            padding: 1rem;
          }
          .lt-row > span {
            display: flex;
            flex-direction: column;
            gap: 0.18rem;
          }
          .lt-row > span::before {
            font-size: 0.58rem;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--muted2);
          }
          .lt-row > span:nth-child(1)::before { content: "Parameter"; }
          .lt-row > span:nth-child(2)::before { content: "Value"; }
          .lt-row > span:nth-child(3)::before { content: "Reference"; }
          .lt-row > span:nth-child(4)::before { content: "Status"; }
          .lt-foot {
            padding: 0.9rem 1rem;
            align-items: flex-start;
          }

          .alert-wrap { padding: 0 1rem 4rem; }
          .alert-card {
            grid-template-columns: 1fr;
            padding: 1.4rem 1.25rem;
            gap: 1rem;
          }
          .alert-icon {
            width: 52px;
            height: 52px;
            border-radius: 14px;
          }

          .cta-section { padding-block: 4.5rem; }
          .cta-section p { margin-bottom: 1.75rem; }
          .f-links {
            flex-wrap: wrap;
            gap: 1rem;
          }
        }

        @media (max-width: 420px) {
          .nav-right .btn {
            flex-basis: 100%;
          }
          .theme-toggle { margin-left: 0; }
          .stat-item {
            flex-basis: 100%;
            min-width: 0;
          }
          .lt-row { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── GRID BG ── */}
      <MedScanChrome
        dark={dark}
        statusLabel="System Operational"
        onToggleTheme={toggleTheme}
        onBrandClick={scrollToTop}
        navLinks={[
          { label: "Access Flow", href: "#scan" },
          { label: "Features", href: "#features" },
          { label: "Lab Analysis", href: "#labs" },
        ]}
        secondaryAction={{
          label: "Sign In",
          variant: "outline",
          onClick: () => openWorkspace("login"),
        }}
        primaryAction={{
          label: "Get Started →",
          variant: "solid",
          onClick: () => openWorkspace("signup"),
        }}
      >

      {/* ────── NAV ────── */}

      {/* ────── HERO ────── */}
      <section className="hero">
        {/* left */}
        <div>
          <div className="hero-eyebrow">🏥 Clinical AI Platform</div>
          <h1>
            Understand Your<br />
            <span className="highlight">Medical Reports</span><br />
            Instantly
          </h1>
          <p className="hero-sub">
            Learn how MediScan AI turns prescriptions and lab reports into clear, useful
            guidance. Upload your first report free, then continue in your private
            workspace to save history, use assistant chat, and unlock more uploads.
          </p>
          <div className="hero-ctas">
            <button className="btn-hero-primary" onClick={() => scrollToSection("scan")}>
              See Access Flow
            </button>
            <button className="btn-hero-ghost" onClick={() => openWorkspace("login")}>Sign In</button>
          </div>
          <div className="trust-badges">
            {["🔒 HIPAA Compliant", "🧪 98.4% OCR Accuracy", "🌐 3 Languages", "⚡ <2s Analysis"].map(t => (
              <div key={t} className="trust-badge">{t}</div>
            ))}
          </div>
        </div>

        {/* right — patient card */}
        <div className="hero-card-col">
          <div className="patient-card">
            {/* header */}
            <div className="pc-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div className="pc-avatar">👤</div>
                <div>
                  <div className="pc-name">Rahul Sharma</div>
                  <div className="pc-meta">PID-2025-00847 · Male, 34y · O+</div>
                </div>
              </div>
              <div className="pc-live">
                <span className="pulse-dot" style={{ background: "#4ade80" }} />
                AI Analysis
              </div>
            </div>

            {/* ECG */}
            <div className="pc-ecg">
              <div className="pc-ecg-label">ECG — Lead II · Live Simulation</div>
              <svg style={{ width: "100%", height: "44px", overflow: "visible" }} viewBox="0 0 400 46" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="ecg-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#0369a1" stopOpacity="0" />
                    <stop offset="30%" stopColor="#0369a1" stopOpacity="1" />
                    <stop offset="70%" stopColor="#0ea5e9" stopOpacity="1" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 11, 22, 33, 44].map(y => (
                  <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="var(--border)" strokeWidth="0.8" />
                ))}
                {[-1, 0, 1].map(r => (
                  <path key={r}
                    d={`M${r * 200},23 L${r * 200 + 18},23 L${r * 200 + 25},23 L${r * 200 + 30},7 L${r * 200 + 34},41 L${r * 200 + 38},4 L${r * 200 + 42},37 L${r * 200 + 46},23 L${r * 200 + 57},23 L${r * 200 + 62},17 L${r * 200 + 67},23 L${r * 200 + 200},23`}
                    fill="none" stroke="url(#ecg-grad)" strokeWidth="1.75"
                    strokeDasharray="400" strokeDashoffset={ecgOffset + r * 200}
                  />
                ))}
              </svg>
            </div>

            {/* vitals */}
            <div className="pc-vitals">
              {[
                { l: "BP",    v: "128/84", u: "mmHg", pct: 65, c: "#0369a1" },
                { l: "Pulse", v: "78",     u: "bpm",  pct: 52, c: "#dc2626" },
                { l: "SpO₂", v: "98",     u: "%",    pct: 98, c: "#16a34a" },
              ].map(x => (
                <div className="pc-vital" key={x.l}>
                  <div className="pc-vital-label">{x.l}</div>
                  <div className="pc-vital-val">{x.v}</div>
                  <div className="pc-vital-unit">{x.u}</div>
                  <div className="pc-vital-bar">
                    <div className="pc-vital-fill" style={{ width: `${x.pct}%`, background: x.c }} />
                  </div>
                </div>
              ))}
            </div>

            {/* labs */}
            <div className="pc-labs">
              <div className="pc-labs-title">Recent Lab Values</div>
              {[
                { n: "Blood Glucose (Fasting)", v: "126 mg/dL", s: "H", vc: "var(--red)" },
                { n: "Hemoglobin",              v: "10.2 g/dL", s: "L", vc: "var(--orange)" },
                { n: "Creatinine",              v: "0.9 mg/dL", s: "N", vc: "var(--green)" },
              ].map(l => (
                <div className="pc-lab-row" key={l.n}>
                  <span className="pc-lab-name">{l.n}</span>
                  <div className="pc-lab-right">
                    <span className="pc-lab-val" style={{ color: l.vc }}>{l.v}</span>
                    <span className={`badge badge-${l.s === "H" ? "high" : l.s === "L" ? "low" : "norm"}`}>
                      {l.s === "H" ? "HIGH" : l.s === "L" ? "LOW" : "OK"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pc-footer">
              <div className="ai-chip">🤖 AI</div>
              <span className="pc-footer-txt">2 critical values · Drug check pending</span>
            </div>
          </div>
        </div>
      </section>

      {/* ────── STATS ────── */}
      <div className="stats-band">
        {stats.map(s => (
          <div className="stat-item" key={s.l}>
            <div className="stat-val">{s.n}<span className="stat-unit">{s.u}</span></div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ────── UPLOAD ────── */}
      <div className="upload-section" id="scan">
        {/* left: drop zone */}
        <div>
          <div className="section-eyebrow">Free Preview</div>
          <h2 className="section-h">{uploadHeading}</h2>
          <p className="section-sub">
            {uploadSubheading}
          </p>

          <div style={{ marginTop: "2rem" }}>
            <div
              className={dropZoneClassName}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={openUploadChooser}
              role="button" tabIndex={0}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openUploadChooser();
                }
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: "none" }}
                onChange={e => selectLandingFile(e.target.files?.[0] || null)}
              />
              <div className="drop-icon-wrap">{file ? "✅" : guestPreviewLocked ? "🔒" : signedIn ? "📂" : "🔬"}</div>
              <div className="drop-title">{dropTitle}</div>
              <div className="drop-sub">{dropSubtitle}</div>
              {!file && (
                <div className="fmt-chips">
                  {["PDF", "PNG", "JPG"].map(f => <span key={f} className="fmt-chip">{f}</span>)}
                </div>
              )}
            </div>

            {file && (
              <div className="file-selected">
                📄 {file.name}
                <button
                  className="file-remove"
                  onClick={e => {
                    e.stopPropagation();
                    clearSelectedFile();
                    setGuestPreview(null);
                    setPreviewError(null);
                  }}
                >
                  ×
                </button>
              </div>
            )}

            <div className="lang-selector">
              <div className="lang-label">Language preview</div>
              <div className="lang-btns">
                {(["en", "hi", "hinglish"] as const).map(l => (
                  <button
                    key={l}
                    type="button"
                    data-lang={l}
                    className={`lang-btn${lang === l ? " active" : ""}`}
                    onClick={() => setLang(l)}
                  >
                    {l === "en" ? "🇬🇧 English" : l === "hi" ? "🇮🇳 Hindi" : "🤝 Hinglish"}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn-analyze"
              type="button"
              onClick={handleAnalyzeButtonClick}
              disabled={previewLoading}
            >
              {analyzeButtonLabel}
            </button>

            {previewError && (
              <div className="upload-inline-note">
                {previewError}
              </div>
            )}

            {guestPreviewLocked && !guestPreview && (
              <div className="upload-inline-note">
                Create an account to unlock your next upload, save report history, and continue with secure assistant support.
                <div className="upload-inline-actions">
                  <button className="btn btn-solid" type="button" onClick={() => openWorkspace("signup")}>
                    Create Free Account
                  </button>
                  <button className="btn btn-outline" type="button" onClick={() => openWorkspace("login")}>
                    Sign In
                  </button>
                </div>
              </div>
            )}

            {guestPreview && (
              <div className="preview-card">
                <div className="preview-head">
                  <div>
                    <div className="preview-eyebrow">First Report Preview</div>
                    <div className="preview-title">{guestPreview.filename}</div>
                  </div>
                  <div className="preview-meta">
                    Based only on OCR-extracted report data
                    <br />
                    {new Date(guestPreview.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="preview-summary">
                  {guestPreview.analysis.plainLanguageSummary || guestPreview.insights.summary}
                </div>
                <div className="preview-badges">
                  <span className="preview-badge">Risk: {guestPreview.insights.overallRisk.toUpperCase()}</span>
                  <span className="preview-badge">
                    Findings: {guestPreview.insights.abnormalFindings.length}
                  </span>
                  <span className="preview-badge">
                    Medicines: {guestPreview.analysis.medicines.length}
                  </span>
                </div>
                <div className="preview-grid">
                  <div className="preview-panel">
                    <div className="preview-panel-title">Key Findings</div>
                    {guestPreview.insights.abnormalFindings.length ? (
                      <ul className="preview-list">
                        {guestPreview.insights.abnormalFindings.slice(0, 3).map((finding) => (
                          <li key={`${finding.name}-${finding.value}`} className="preview-item">
                            <strong>{finding.name}: {finding.value}</strong>
                            <span>{finding.explanation}</span>
                            <small>
                              Reference: {finding.referenceRange} • Severity: {finding.severity}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="preview-empty">
                        No abnormal findings were highlighted in the extracted report data.
                      </div>
                    )}
                  </div>
                  <div className="preview-panel">
                    <div className="preview-panel-title">Medicines In Report</div>
                    {guestPreview.analysis.medicines.length ? (
                      <ul className="preview-list">
                        {guestPreview.analysis.medicines.slice(0, 3).map((medicine) => (
                          <li key={`${medicine.name}-${medicine.dosage}-${medicine.frequency}`} className="preview-item">
                            <strong>{medicine.name}</strong>
                            <span>{medicine.dosage || "Dosage not clearly extracted"} • {medicine.frequency || "Schedule not clearly extracted"}</span>
                            <small>{medicine.purpose || medicine.notes || "Purpose was not clearly extracted from the report."}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="preview-empty">
                        No medicines were confidently extracted from this report.
                      </div>
                    )}
                  </div>
                  <div className="preview-panel">
                    <div className="preview-panel-title">Precautions</div>
                    {guestPreview.analysis.precautions.length ? (
                      <ul className="preview-list">
                        {guestPreview.analysis.precautions.slice(0, 3).map((precaution) => (
                          <li key={precaution} className="preview-item">
                            <span>{precaution}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="preview-empty">
                        No specific precautions were generated from the extracted report data.
                      </div>
                    )}
                  </div>
                  <div className="preview-panel">
                    <div className="preview-panel-title">Follow-Up Questions</div>
                    {guestPreview.analysis.followUpQuestions.length ? (
                      <ul className="preview-list">
                        {guestPreview.analysis.followUpQuestions.slice(0, 3).map((question) => (
                          <li key={question} className="preview-item">
                            <span>{question}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="preview-empty">
                        No follow-up questions were generated for this report.
                      </div>
                    )}
                  </div>
                </div>
                <div className="preview-gate">
                  <div className="preview-gate-copy">
                    This free preview is not saved to a private history. Create an account to unlock more uploads, keep report history, and continue with full workspace tools.
                  </div>
                  <div className="preview-gate-actions">
                    <button className="btn btn-solid" type="button" onClick={() => openWorkspace("signup")}>
                      Create Free Account
                    </button>
                    <button className="btn btn-outline" type="button" onClick={() => openWorkspace("login")}>
                      Sign In
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* right: how it works */}
        <div className="hiw-card">
          <div className="hiw-header">
            <div className="hiw-title">Four Steps to Health Clarity</div>
            <div className="hiw-sub">From raw scan to actionable insights.</div>
          </div>
          <div className="hiw-steps">
            {steps.map(s => (
              <div className="hiw-step" key={s.num}>
                <div className="hiw-num">{s.num}</div>
                <div className="hiw-emoji">{s.emoji}</div>
                <div>
                  <div className="hiw-step-title">{s.label}</div>
                  <div className="hiw-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────── FEATURES ────── */}
      <div className="features-section" id="features">
        <div className="features-inner">
          <div className="features-head">
            <div className="section-eyebrow">Clinical Intelligence</div>
            <h2 className="section-h">Everything Your Doctor Sees —<br />Explained to You</h2>
            <p className="section-sub">Eight powerful modules working together for complete health intelligence.</p>
          </div>
          <div className="features-grid">
            {features.map(f => (
              <div
                key={f.title}
                className="feature-card"
                style={{ "--fc-accent": f.accent } as React.CSSProperties}
                role="button"
                tabIndex={0}
                aria-label={`Create an account to use ${f.title}`}
                onClick={handleFeatureActivation}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleFeatureActivation();
                  }
                }}
              >
                <div className="feature-tag" style={{ color: f.accent }}>{f.tag}</div>
                <div className="feature-icon">{f.icon}</div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ────── LAB DEMO ────── */}
      <div className="lab-section" id="labs">
        <div>
          <div className="section-eyebrow">Lab Intelligence</div>
          <h2 className="section-h">Abnormal Values,<br />Flagged Instantly</h2>
          <p className="section-sub">
            Every parameter cross-checked against clinical reference ranges with colour-coded
            risk indicators and plain-language explanations.
          </p>
          <div className="lab-bullets">
            {[
              { icon: "🔴", text: "Critical HIGH values flagged with recommended next steps" },
              { icon: "🟠", text: "Borderline LOW values highlighted for close monitoring" },
              { icon: "🟢", text: "Normal range values confirmed with reassurance" },
            ].map(i => (
              <div key={i.text} className="lab-bullet">
                <span className="lab-bullet-icon">{i.icon}</span> {i.text}
              </div>
            ))}
          </div>
        </div>

        <div className="lab-table">
          <div className="lt-head">
            <div className="lt-head-left">
              <span className="lt-icon">🧪</span>
              <span className="lt-title">Comprehensive Blood Report</span>
            </div>
            <span className="lt-date">23 Mar 2025</span>
          </div>
          <div className="lt-cols">
            <span>Parameter</span><span>Value</span><span>Reference</span><span>Status</span>
          </div>
          {labValues.map(l => (
            <div className="lt-row" key={l.name}>
              <span className="lt-name">{l.name}</span>
              <span className="lt-val" style={{ color: l.color }}>{l.value}</span>
              <span className="lt-ref">{l.ref}</span>
              <span className={`badge ${l.status === "HIGH" ? "badge-high" : l.status === "LOW" ? "badge-low" : "badge-norm"}`}>
                {l.status}
              </span>
            </div>
          ))}
          <div className="lt-foot">
            <span>🤖</span>
            <span>AI flagged <strong style={{ color: "var(--red)" }}>3 abnormal values</strong> · Tap for explanation</span>
          </div>
        </div>
      </div>

      {/* ────── ALERT ────── */}
      <div className="alert-wrap">
        <div className="alert-card">
          <div className="alert-icon">🚨</div>
          <div>
            <div className="alert-title">Emergency Alert System</div>
            <div className="alert-desc">
              Critically dangerous values — blood sugar above 400, haemoglobin below 6,
              extreme potassium — trigger instant SMS and call alerts to the patient
              and their emergency contacts. Zero delay when seconds count.
            </div>
          </div>
          <div className="alert-badge">CRITICAL<br />CARE AI</div>
        </div>
      </div>

      {/* ────── CTA ────── */}
      <div className="cta-section">
        <div className="cta-inner">
          <h2>Your Health,<br /><em>Decoded</em></h2>
          <p>Create a verified account to unlock secure report analysis and your private history.</p>
          <div className="cta-buttons">
            <button className="btn-cta-primary" onClick={() => openWorkspace("signup")}>
              Create Account
            </button>
            <button className="btn-cta-ghost" onClick={() => openWorkspace("login")}>Sign In</button>
          </div>
        </div>
      </div>

      {/* ────── FOOTER ────── */}
      <footer>
        <div>
          <div className="f-logo">
            <BrandWordmark />
          </div>
          <p style={{ marginTop: "0.3rem" }}>AI-powered clinical intelligence for everyone.</p>
        </div>
        <div className="f-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/hipaa">HIPAA</Link>
          <Link href="/contact">Contact</Link>
          <a href="https://github.com/avneet2347/MedScanAi" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
      </MedScanChrome>

    </>
  );
}
