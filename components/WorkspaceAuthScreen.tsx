"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  readActiveTheme,
} from "@/lib/theme";

type AuthMode = "login" | "signup";
type Notice = { type: "error" | "success" | "info"; text: string } | null;
type AuthResult = "signup-success" | "login-success" | null;

type Props = {
  mode: AuthMode;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  authLoading: boolean;
  resendLoading: boolean;
  verificationEmail: string;
  notice: Notice;
  authResult: AuthResult;
  onModeChange: (mode: AuthMode) => void;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onResendVerification: () => void;
};

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

export default function WorkspaceAuthScreen({
  mode,
  firstName,
  lastName,
  email,
  password,
  authLoading,
  resendLoading,
  verificationEmail,
  notice,
  authResult,
  onModeChange,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onResendVerification,
}: Props) {
  const [dark, setDark] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    const syncTheme = () => setDark(readActiveTheme() === "dark");
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY) return;
      syncTheme();
    };
    const onTheme = () => syncTheme();
    syncTheme();
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_CHANGE_EVENT, onTheme);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, onTheme);
    };
  }, []);

  const isSignupMode = mode === "signup";
  const strength = passwordStrength(password);
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "#f87171", "#fb923c", "#facc15", "#4ade80"][strength];
  const activeNotice = clientError ? { type: "error" as const, text: clientError } : notice;
  const actionEmail = verificationEmail || email.trim().toLowerCase() || "your inbox";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (isSignupMode) {
      if (!confirmPassword.trim()) {
        event.preventDefault();
        setClientError("Please confirm your password before creating the account.");
        return;
      }
      if (confirmPassword !== password) {
        event.preventDefault();
        setClientError("Passwords do not match.");
        return;
      }
    }
    setClientError(null);
    onSubmit(event);
  };

  const toggleCheckbox = () => setAgree((value) => !value);
  const handleModeChange = (nextMode: AuthMode) => {
    setClientError(null);
    onModeChange(nextMode);
  };
  const handleFirstNameChange = (value: string) => {
    setClientError(null);
    onFirstNameChange(value);
  };
  const handleLastNameChange = (value: string) => {
    setClientError(null);
    onLastNameChange(value);
  };
  const handleEmailChange = (value: string) => {
    setClientError(null);
    onEmailChange(value);
  };
  const handlePasswordChange = (value: string) => {
    setClientError(null);
    onPasswordChange(value);
  };
  const handleConfirmPasswordChange = (value: string) => {
    setClientError(null);
    setConfirmPassword(value);
  };
  const handleForgotPasswordClick = () => {
    setClientError("Password reset is not wired up yet. If you want, I can add that flow next.");
  };

  return (
    <>
      <div className={`auth-screen ${dark ? "dark" : "light"}`}>
        <div className="auth-page">
          <section className="auth-panel">
            {activeNotice ? <div className={`notice-banner notice-${activeNotice.type}`}>{activeNotice.text}</div> : null}

            {authResult ? (
              <div className="form-card">
                <div className="card-topbar">
                  <Link className="home-link" href="/">
                    <span className="home-link-icon" aria-hidden="true">←</span>
                    <span>Back to Home</span>
                  </Link>
                </div>
                <div className="card-body">
                  <div className="success-card">
                  <div className="success-icon">✅</div>
                  <div className="success-title">{authResult === "login-success" ? "Welcome back!" : "Account created!"}</div>
                  <p className="success-sub">
                    {authResult === "login-success"
                      ? "Your dashboard is loading now. We are securely restoring your personalized workspace."
                      : `A verification link has been sent to ${actionEmail}. Confirm your email, then sign in to continue to your dashboard.`}
                  </p>
                  {authResult === "login-success" ? (
                    <button className="btn-dashboard" disabled type="button">Opening Dashboard...</button>
                  ) : (
                    <div className="success-actions">
                      <button className="btn-dashboard" onClick={() => handleModeChange("login")} type="button">Continue to Sign In →</button>
                      <button className="btn-secondary" onClick={onResendVerification} disabled={resendLoading} type="button">
                        {resendLoading ? "Sending..." : "Resend verification email"}
                      </button>
                    </div>
                  )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-card">
                <div className="card-topbar">
                  <Link className="home-link" href="/">
                    <span className="home-link-icon" aria-hidden="true">←</span>
                    <span>Back to Home</span>
                  </Link>
                </div>
                <div className="form-eyebrow">🏥 MediScan AI</div>
                <div className="card-body">
                <h1 className="form-title">
                  {isSignupMode ? <>Create your<br />account</> : <>Sign in to your<br />account</>}
                </h1>
                <p className="form-sub">
                  {isSignupMode ? (
                    <>Already have an account? <button className="inline-link" onClick={() => handleModeChange("login")} type="button">Sign in</button></>
                  ) : (
                    <>New to MediScan? <button className="inline-link" onClick={() => handleModeChange("signup")} type="button">Create an account</button></>
                  )}
                </p>

                <form onSubmit={handleSubmit} noValidate>
                  {isSignupMode ? (
                    <>
                      <div className="name-row">
                        <div className="form-group no-gap">
                          <label className="form-label" htmlFor="auth-first-name">First Name</label>
                          <div className="input-wrap">
                            <span className="input-icon">👤</span>
                            <input id="auth-first-name" className="form-input has-icon" type="text" placeholder="Rahul" value={firstName} onChange={(event) => handleFirstNameChange(event.target.value)} autoComplete="given-name" />
                          </div>
                        </div>
                        <div className="form-group no-gap">
                          <label className="form-label" htmlFor="auth-last-name">Last Name</label>
                          <div className="input-wrap">
                            <input id="auth-last-name" className="form-input" type="text" placeholder="Sharma" value={lastName} onChange={(event) => handleLastNameChange(event.target.value)} autoComplete="family-name" />
                          </div>
                        </div>
                      </div>
                      <div className="form-spacer" />
                    </>
                  ) : null}

                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-email">Email Address</label>
                    <div className="input-wrap">
                      <span className="input-icon">✉️</span>
                      <input id="auth-email" className="form-input has-icon" type="email" placeholder="rahul@example.com" value={email} onChange={(event) => handleEmailChange(event.target.value)} autoComplete="email" required />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-password">Password</label>
                    <div className="input-wrap">
                      <span className="input-icon">🔒</span>
                      <input
                        id="auth-password"
                        className="form-input has-icon has-toggle"
                        type={showPass ? "text" : "password"}
                        placeholder={isSignupMode ? "Create a strong password" : "Enter your password"}
                        value={password}
                        onChange={(event) => handlePasswordChange(event.target.value)}
                        autoComplete={isSignupMode ? "new-password" : "current-password"}
                        required
                      />
                      <button type="button" className="input-toggle" onClick={() => setShowPass((value) => !value)}>{showPass ? "🙈" : "👁️"}</button>
                    </div>
                    {isSignupMode && password ? (
                      <div className="strength-row">
                        <div className="strength-bars">
                          {[1, 2, 3, 4].map((index) => <div key={index} className="strength-bar" style={{ background: index <= strength ? strengthColor : undefined }} />)}
                        </div>
                        <span className="strength-label" style={{ color: strengthColor }}>{strengthLabel}</span>
                      </div>
                    ) : null}
                  </div>

                  {isSignupMode ? (
                    <div className="form-group">
                      <label className="form-label" htmlFor="auth-confirm-password">Confirm Password</label>
                      <div className="input-wrap">
                        <span className="input-icon">🔑</span>
                        <input
                          id="auth-confirm-password"
                          className="form-input has-icon has-toggle"
                          type={showPass2 ? "text" : "password"}
                          placeholder="Re-enter password"
                          value={confirmPassword}
                          onChange={(event) => handleConfirmPasswordChange(event.target.value)}
                          autoComplete="new-password"
                          style={confirmPassword && confirmPassword !== password ? { borderColor: "var(--red)" } : confirmPassword && confirmPassword === password ? { borderColor: "var(--green)" } : undefined}
                        />
                        <button type="button" className="input-toggle" onClick={() => setShowPass2((value) => !value)}>{showPass2 ? "🙈" : "👁️"}</button>
                      </div>
                      {confirmPassword && confirmPassword !== password ? <div className="field-hint error">⚠ Passwords do not match</div> : null}
                      {confirmPassword && confirmPassword === password ? <div className="field-hint success">✓ Passwords match</div> : null}
                    </div>
                  ) : (
                    <div className="forgot-row">
                      <button className="forgot-link" onClick={handleForgotPasswordClick} type="button">Forgot password?</button>
                    </div>
                  )}

                  {isSignupMode ? (
                    <div className="check-row">
                      <div className={`check-box${agree ? " checked" : ""}`} onClick={toggleCheckbox} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleCheckbox(); } }} role="checkbox" aria-checked={agree} tabIndex={0}>
                        {agree ? <span className="check-mark">✓</span> : null}
                      </div>
                      <p className="check-text">
                        I agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>. I understand my medical data is protected under HIPAA guidelines.
                      </p>
                    </div>
                  ) : null}

                  <button className="btn-submit" disabled={authLoading} type="submit">
                    {authLoading ? (isSignupMode ? "Creating account..." : "Signing in...") : isSignupMode ? "Create Account →" : "Sign In to MediScan →"}
                  </button>
                </form>

                <p className="form-note"><span>🔒 Secured</span> · 256-bit SSL encryption · No card required</p>

                {(verificationEmail || isSignupMode) ? (
                  <div className="verification-card">
                    <div className="verification-pill">{verificationEmail ? "Verification email pending" : "Email verification required"}</div>
                    <p className="verification-copy">
                      {verificationEmail ? `Use ${verificationEmail} to confirm your account before logging in.` : "Every signup sends a confirmation link before dashboard access is unlocked."}
                    </p>
                    <button className="btn-secondary verification-button" onClick={onResendVerification} disabled={resendLoading || !actionEmail} type="button">
                      {resendLoading ? "Sending..." : "Resend verification email"}
                    </button>
                  </div>
                ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <style jsx>{`
        :global(*),
        :global(*::before),
        :global(*::after) {
          box-sizing: border-box;
        }

        :global(html),
        :global(body) {
          margin: 0;
          max-width: 100%;
          overflow-x: hidden;
          background: #f8fafc;
        }

        :global(body.dark) {
          background: #060d18;
        }

        .auth-screen {
          --font-sans: var(--workspace-font-sans), "DM Sans", "Segoe UI", sans-serif;
          --font-serif: var(--workspace-font-serif), Georgia, serif;
          --font-mono: var(--workspace-font-mono), "JetBrains Mono", monospace;
          --bg: #f8fafc;
          --bg-subtle: #f1f5f9;
          --surface: #ffffff;
          --border: #e2e8f0;
          --border-med: #cbd5e1;
          --ink: #0f172a;
          --ink2: #1e293b;
          --ink3: #334155;
          --muted: #64748b;
          --muted2: #94a3b8;
          --blue: #0369a1;
          --blue-lt: #e0f2fe;
          --blue-brd: #bae6fd;
          --red: #dc2626;
          --red-lt: #fee2e2;
          --red-brd: #fecaca;
          --orange: #ea580c;
          --green: #16a34a;
          --green-lt: #dcfce7;
          --accent: #0369a1;
          --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.04);
          --shadow-md: 0 8px 22px rgba(15, 23, 42, 0.08);
          --shadow-lg: 0 24px 64px rgba(15, 23, 42, 0.12);
          --shadow-xl: 0 32px 90px rgba(15, 23, 42, 0.14);
          min-height: 100vh;
          font-family: var(--font-sans);
          background: var(--bg);
          color: var(--ink);
          transition: background 0.3s, color 0.3s;
        }

        .auth-screen.dark {
          --bg: #060d18;
          --bg-subtle: #0c1729;
          --surface: #0f1e30;
          --border: #1e3047;
          --border-med: #243a57;
          --ink: #f0f6ff;
          --ink2: #dce9f8;
          --ink3: #9db8d4;
          --muted: #6b8aaa;
          --muted2: #4a6680;
          --blue: #38bdf8;
          --blue-lt: rgba(56, 189, 248, 0.08);
          --blue-brd: rgba(56, 189, 248, 0.18);
          --red: #f87171;
          --red-lt: rgba(248, 113, 113, 0.09);
          --red-brd: rgba(248, 113, 113, 0.2);
          --orange: #fb923c;
          --green: #4ade80;
          --green-lt: rgba(74, 222, 128, 0.09);
          --accent: #38bdf8;
          --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.4);
          --shadow-md: 0 10px 24px rgba(0, 0, 0, 0.32);
          --shadow-lg: 0 24px 60px rgba(0, 0, 0, 0.42);
          --shadow-xl: 0 32px 88px rgba(0, 0, 0, 0.55);
        }

        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(32px, 6vw, 64px) 18px;
          overflow-x: hidden;
          background:
            radial-gradient(circle at top, rgba(14, 165, 233, 0.14), transparent 34%),
            radial-gradient(circle at left bottom, rgba(3, 105, 161, 0.08), transparent 30%),
            linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
        }

        .auth-screen.dark .auth-page {
          background:
            radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 28%),
            radial-gradient(circle at left bottom, rgba(3, 105, 161, 0.18), transparent 30%),
            linear-gradient(180deg, #07111f 0%, var(--bg) 100%);
        }

        .auth-panel {
          width: min(100%, 580px);
          max-width: 580px;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .notice-banner,
        .form-card {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }

        .notice-banner {
          margin: 0 auto 1rem;
          padding: 1rem 1.15rem;
          border-radius: 20px;
          border: 1px solid var(--border);
          font-size: 0.85rem;
          line-height: 1.65;
          box-shadow: var(--shadow-sm);
          backdrop-filter: blur(12px);
        }

        .notice-error {
          background: var(--red-lt);
          border-color: var(--red-brd);
          color: var(--red);
        }

        .notice-success {
          background: var(--green-lt);
          border-color: rgba(22, 163, 74, 0.2);
          color: var(--green);
        }

        .notice-info {
          background: var(--blue-lt);
          border-color: var(--blue-brd);
          color: var(--blue);
        }

        .form-card {
          position: relative;
          overflow: hidden;
          animation: rise 0.55s ease both;
          padding: clamp(28px, 5vw, 42px);
          border-radius: 34px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(255, 255, 255, 0.95));
          box-shadow: var(--shadow-xl);
          backdrop-filter: blur(14px);
          min-width: 0;
        }

        .form-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 150px;
          background: linear-gradient(180deg, rgba(14, 165, 233, 0.12), transparent);
          pointer-events: none;
        }

        .form-card > * {
          position: relative;
          z-index: 1;
        }

        .auth-screen.dark .form-card {
          border-color: rgba(56, 189, 248, 0.14);
          background: linear-gradient(180deg, rgba(15, 30, 48, 0.98), rgba(12, 23, 41, 0.96));
          box-shadow: var(--shadow-xl);
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(18px);
          }

          to {
            opacity: 1;
            transform: none;
          }
        }

        .card-topbar {
          width: min(100%, 472px);
          margin: 0 auto 1.3rem;
          display: flex;
          justify-content: flex-start;
        }

        .card-body {
          width: min(100%, 472px);
          margin: 0 auto;
        }

        .home-link,
        .home-link:visited {
          display: inline-flex;
          align-items: center;
          gap: 0.62rem;
          padding: 0.48rem 0.9rem 0.48rem 0.48rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.8);
          box-shadow: var(--shadow-sm);
          color: var(--ink2);
          font-size: 0.82rem;
          font-weight: 700;
          line-height: 1;
          text-decoration: none;
          transition: transform 0.2s, background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s;
        }

        .auth-screen.dark .home-link,
        .auth-screen.dark .home-link:visited {
          background: rgba(12, 23, 41, 0.86);
        }

        .home-link:hover {
          transform: translateY(-1px);
          background: var(--blue-lt);
          border-color: var(--blue-brd);
          color: var(--blue);
          box-shadow: var(--shadow-md);
        }

        .home-link-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.8rem;
          height: 1.8rem;
          border-radius: 999px;
          background: var(--blue-lt);
          border: 1px solid var(--blue-brd);
          color: var(--blue);
          font-size: 0.92rem;
          font-weight: 700;
        }

        .form-eyebrow,
        .verification-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.88rem;
          background: var(--blue-lt);
          border: 1px solid var(--blue-brd);
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--blue);
          box-shadow: 0 8px 18px rgba(14, 165, 233, 0.08);
        }

        .form-eyebrow {
          margin: 0 0 1.35rem;
        }

        .form-title,
        .success-title {
          font-family: var(--font-serif);
          font-weight: 400;
          color: var(--ink);
          letter-spacing: -0.03em;
        }

        .form-title {
          margin: 0 0 0.8rem;
          font-size: clamp(2rem, 3.6vw, 2.75rem);
          line-height: 0.96;
          max-width: 10ch;
        }

        .form-sub {
          margin: 0 0 2rem;
          color: var(--muted);
          font-size: 0.98rem;
          line-height: 1.65;
          max-width: 30rem;
        }

        .inline-link,
        .forgot-link {
          color: var(--blue);
          font-weight: 700;
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          font: inherit;
          text-decoration: none;
        }

        .inline-link:hover,
        .forgot-link:hover {
          color: var(--accent);
          text-decoration: underline;
          text-decoration-thickness: 1.5px;
          text-underline-offset: 0.14em;
        }

        .name-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 1rem;
          width: 100%;
        }

        .name-row > * {
          min-width: 0;
        }

        .form-group {
          margin-bottom: 1.22rem;
          min-width: 0;
        }

        .form-group.no-gap {
          margin-bottom: 0;
        }

        .form-spacer {
          margin-bottom: 1.22rem;
        }

        .form-label {
          display: block;
          margin-bottom: 0.55rem;
          color: var(--ink2);
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .input-wrap {
          position: relative;
          width: 100%;
          min-width: 0;
        }

        .form-input {
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          padding: 1rem 1.05rem;
          border-radius: 16px;
          border: 1.5px solid var(--border);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.98));
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 24px rgba(15, 23, 42, 0.06);
          font-family: var(--font-sans);
          font-size: 1rem;
          color: var(--ink);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s, transform 0.2s;
        }

        .auth-screen.dark .form-input {
          background: linear-gradient(180deg, rgba(15, 30, 48, 0.96), rgba(12, 23, 41, 0.96));
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), 0 12px 28px rgba(0, 0, 0, 0.25);
        }

        .form-input:hover {
          border-color: var(--border-med);
        }

        .form-input::placeholder {
          color: var(--muted2);
        }

        .form-input:focus {
          border-color: var(--accent);
          transform: translateY(-1px);
          box-shadow: 0 0 0 4px rgba(3, 105, 161, 0.1), 0 14px 30px rgba(14, 165, 233, 0.12);
        }

        .auth-screen.dark .form-input:focus {
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.13), 0 14px 32px rgba(0, 0, 0, 0.35);
        }

        .form-input.has-icon {
          padding-left: 3rem;
        }

        .form-input.has-toggle {
          padding-right: 3.35rem;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          font-size: 1rem;
          opacity: 0.62;
          pointer-events: none;
        }

        .input-toggle {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          width: 2rem;
          height: 2rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 999px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: color 0.2s, background 0.2s, border-color 0.2s;
        }

        .input-toggle:hover {
          color: var(--blue);
          background: var(--blue-lt);
          border-color: var(--blue-brd);
        }

        .strength-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          margin-top: 0.55rem;
        }

        .strength-bars {
          display: flex;
          gap: 4px;
        }

        .strength-bar {
          width: 30px;
          height: 4px;
          border-radius: 999px;
          background: var(--border);
          transition: background 0.25s;
        }

        .strength-label {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .field-hint {
          margin-top: 0.45rem;
          font-size: 0.74rem;
          font-weight: 600;
        }

        .field-hint.error {
          color: var(--red);
        }

        .field-hint.success {
          color: var(--green);
        }

        .forgot-row {
          display: flex;
          justify-content: flex-end;
          margin: -0.15rem 0 1.4rem;
        }

        .forgot-link {
          font-size: 0.9rem;
        }

        .check-row {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin: 0.1rem 0 1.5rem;
          padding: 0.95rem 1rem;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(241, 245, 249, 0.76));
        }

        .auth-screen.dark .check-row {
          background: linear-gradient(180deg, rgba(15, 30, 48, 0.74), rgba(12, 23, 41, 0.8));
        }

        .check-box {
          width: 19px;
          height: 19px;
          margin-top: 0.12rem;
          border-radius: 6px;
          flex-shrink: 0;
          background: var(--surface);
          border: 1.5px solid var(--border-med);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
        }

        .check-box:hover {
          transform: translateY(-1px);
        }

        .check-box.checked {
          background: var(--accent);
          border-color: var(--accent);
          box-shadow: 0 10px 18px rgba(14, 165, 233, 0.18);
        }

        .check-mark {
          color: #fff;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .check-text {
          font-size: 0.8rem;
          color: var(--muted);
          line-height: 1.7;
        }

        .check-text :global(a) {
          color: var(--blue);
          text-decoration: none;
          font-weight: 700;
        }

        .check-text :global(a:hover) {
          text-decoration: underline;
          text-decoration-thickness: 1.5px;
          text-underline-offset: 0.14em;
        }

        .btn-submit,
        .btn-dashboard {
          display: block;
          width: 100%;
          max-width: 100%;
          padding: 1rem 1.1rem;
          border-radius: 18px;
          background: linear-gradient(135deg, #0369a1, #0ea5e9);
          border: none;
          font-family: var(--font-sans);
          font-size: 1rem;
          font-weight: 800;
          color: #fff;
          cursor: pointer;
          box-shadow: 0 16px 30px rgba(14, 116, 144, 0.22), 0 6px 16px rgba(3, 105, 161, 0.18);
          transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
          letter-spacing: 0.01em;
        }

        .btn-submit {
          margin: 0.55rem 0 1.45rem;
        }

        .btn-submit:hover,
        .btn-dashboard:hover {
          transform: translateY(-2px);
          box-shadow: 0 22px 34px rgba(14, 116, 144, 0.24), 0 10px 18px rgba(3, 105, 161, 0.22);
        }

        .btn-submit:active,
        .btn-dashboard:active {
          transform: translateY(0);
        }

        .btn-submit:disabled,
        .btn-dashboard:disabled,
        .btn-secondary:disabled {
          cursor: not-allowed;
          opacity: 0.7;
          transform: none;
          box-shadow: none;
        }

        .btn-secondary {
          display: block;
          width: 100%;
          max-width: 100%;
          padding: 0.92rem 1rem;
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.98));
          border: 1px solid var(--border);
          color: var(--ink2);
          font-family: var(--font-sans);
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
          transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
        }

        .auth-screen.dark .btn-secondary {
          background: linear-gradient(180deg, rgba(15, 30, 48, 0.95), rgba(12, 23, 41, 0.98));
        }

        .btn-secondary:hover {
          background: var(--bg-subtle);
          border-color: var(--border-med);
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }

        .success-card {
          max-width: 440px;
          margin: 0 auto;
          padding: 0.2rem 0 0.1rem;
          text-align: center;
        }

        .success-icon {
          width: 76px;
          height: 76px;
          border-radius: 24px;
          background: var(--green-lt);
          border: 2px solid rgba(22, 163, 74, 0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.2rem;
          margin: 0 auto 1.3rem;
          box-shadow: 0 14px 26px rgba(22, 163, 74, 0.12);
        }

        .success-title {
          margin-bottom: 0.7rem;
          font-size: clamp(1.85rem, 3vw, 2.25rem);
          line-height: 1.02;
        }

        .success-sub {
          margin: 0 0 1.9rem;
          font-size: 0.95rem;
          color: var(--muted);
          line-height: 1.7;
        }

        .success-actions {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .form-note {
          margin-top: 0.35rem;
          padding-top: 1.05rem;
          border-top: 1px solid var(--border);
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem;
          text-align: center;
          font-size: 0.78rem;
          color: var(--muted2);
          line-height: 1.7;
        }

        .form-note span {
          color: var(--green);
          font-weight: 700;
        }

        .verification-card {
          margin-top: 1.55rem;
          padding: 1.15rem 1.1rem;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(241, 245, 249, 0.92));
          border: 1px solid var(--border);
          box-shadow: 0 16px 28px rgba(15, 23, 42, 0.06);
          min-width: 0;
        }

        .auth-screen.dark .verification-card {
          background: linear-gradient(180deg, rgba(15, 30, 48, 0.95), rgba(12, 23, 41, 0.98));
          box-shadow: 0 14px 26px rgba(0, 0, 0, 0.28);
        }

        .verification-pill {
          margin-bottom: 0.8rem;
        }

        .verification-copy {
          margin: 0 0 1rem;
          color: var(--muted);
          font-size: 0.84rem;
          line-height: 1.7;
        }

        .verification-button {
          margin-bottom: 0;
        }

        .home-link:focus-visible,
        .inline-link:focus-visible,
        .forgot-link:focus-visible,
        .input-toggle:focus-visible,
        .btn-submit:focus-visible,
        .btn-dashboard:focus-visible,
        .btn-secondary:focus-visible,
        .check-box:focus-visible {
          outline: 3px solid rgba(14, 165, 233, 0.22);
          outline-offset: 3px;
        }

        @media (max-width: 640px) {
          .auth-page {
            align-items: flex-start;
            padding: 20px 12px 28px;
          }

          .auth-panel {
            width: 100%;
            max-width: none;
          }

          .form-card {
            padding: 24px 18px;
            border-radius: 28px;
          }

          .card-topbar,
          .card-body {
            width: 100%;
          }

          .card-topbar {
            margin-bottom: 1rem;
          }

          .form-eyebrow {
            margin-bottom: 1.2rem;
          }

          .form-title {
            font-size: 1.9rem;
          }

          .form-sub {
            margin-bottom: 1.75rem;
            font-size: 0.93rem;
          }

          .home-link {
            font-size: 0.78rem;
          }

          .name-row {
            grid-template-columns: 1fr;
            gap: 0.8rem;
          }

          .check-row {
            padding: 0.9rem;
          }

          .form-note {
            justify-content: flex-start;
            text-align: left;
          }

          .success-card {
            max-width: none;
            text-align: left;
          }

          .success-icon {
            margin: 0 0 1.2rem;
          }

          .forgot-row {
            margin: -0.05rem 0 1.25rem;
          }
        }
      `}</style>
    </>
  );
}
