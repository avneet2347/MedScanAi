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
            ) : (
              <div className="form-card">
                <div className="form-eyebrow">🏥 MediScan AI</div>
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
            )}
          </section>
        </div>
      </div>

      <style jsx>{`
        :global(*),:global(*::before),:global(*::after){box-sizing:border-box}
        :global(html),:global(body){margin:0;max-width:100%;overflow-x:hidden;background:#f8fafc} :global(body.dark){background:#060d18}
        .auth-screen{--font-sans:var(--workspace-font-sans),"DM Sans","Segoe UI",sans-serif;--font-serif:var(--workspace-font-serif),Georgia,serif;--font-mono:var(--workspace-font-mono),"JetBrains Mono",monospace;--bg:#f8fafc;--bg-subtle:#f1f5f9;--surface:#fff;--border:#e2e8f0;--border-med:#cbd5e1;--ink:#0f172a;--ink2:#1e293b;--ink3:#334155;--muted:#64748b;--muted2:#94a3b8;--blue:#0369a1;--blue-lt:#e0f2fe;--blue-brd:#bae6fd;--red:#dc2626;--red-lt:#fee2e2;--red-brd:#fecaca;--orange:#ea580c;--green:#16a34a;--green-lt:#dcfce7;--accent:#0369a1;--shadow-sm:0 1px 3px rgba(15,23,42,.07),0 1px 2px rgba(15,23,42,.04);--shadow-md:0 4px 16px rgba(15,23,42,.08);--shadow-lg:0 20px 50px rgba(15,23,42,.1);--shadow-xl:0 32px 80px rgba(15,23,42,.14);min-height:100vh;font-family:var(--font-sans);background:var(--bg);color:var(--ink);transition:background .3s,color .3s}
        .auth-screen.dark{--bg:#060d18;--bg-subtle:#0c1729;--surface:#0f1e30;--border:#1e3047;--border-med:#243a57;--ink:#f0f6ff;--ink2:#dce9f8;--ink3:#9db8d4;--muted:#6b8aaa;--muted2:#4a6680;--blue:#38bdf8;--blue-lt:rgba(56,189,248,.08);--blue-brd:rgba(56,189,248,.18);--red:#f87171;--red-lt:rgba(248,113,113,.09);--red-brd:rgba(248,113,113,.2);--orange:#fb923c;--green:#4ade80;--green-lt:rgba(74,222,128,.09);--accent:#38bdf8;--shadow-sm:0 1px 4px rgba(0,0,0,.4);--shadow-md:0 6px 20px rgba(0,0,0,.4);--shadow-lg:0 20px 50px rgba(0,0,0,.5);--shadow-xl:0 32px 80px rgba(0,0,0,.55)}
        .auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:clamp(24px,4vw,40px) 18px;overflow-x:hidden;background:
          radial-gradient(circle at top, rgba(14,165,233,.12), transparent 30%),
          radial-gradient(circle at bottom left, rgba(3,105,161,.08), transparent 32%),
          linear-gradient(180deg,#f8fbff 0%,var(--bg) 100%)} .auth-screen.dark .auth-page{background:
          radial-gradient(circle at top, rgba(56,189,248,.12), transparent 26%),
          radial-gradient(circle at bottom left, rgba(3,105,161,.18), transparent 28%),
          linear-gradient(180deg,#07111f 0%,var(--bg) 100%)}
        .auth-panel{width:min(100%,540px);max-width:540px;display:flex;flex-direction:column;align-items:stretch;justify-content:center;min-width:0}
        .notice-banner,.form-card{width:100%;max-width:100%;min-width:0} .notice-banner{margin-bottom:1rem;padding:1rem 1.05rem;border-radius:16px;border:1px solid var(--border);font-size:.83rem;line-height:1.6;box-shadow:var(--shadow-sm)} .notice-error{background:var(--red-lt);border-color:var(--red-brd);color:var(--red)} .notice-success{background:var(--green-lt);border-color:rgba(22,163,74,.2);color:var(--green)} .notice-info{background:var(--blue-lt);border-color:var(--blue-brd);color:var(--blue)}
        .form-card{animation:rise .55s ease both;padding:clamp(24px,4vw,36px);border-radius:32px;border:1px solid var(--border);background:linear-gradient(180deg,rgba(255,255,255,.94),var(--surface));box-shadow:var(--shadow-xl);backdrop-filter:blur(12px);min-width:0} .auth-screen.dark .form-card{background:linear-gradient(180deg,rgba(15,30,48,.98),rgba(15,30,48,.9));box-shadow:0 28px 80px rgba(0,0,0,.45)} @keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}} .form-eyebrow,.verification-pill{display:inline-flex;align-items:center;padding:.28rem .8rem;background:var(--blue-lt);border:1px solid var(--blue-brd);border-radius:50px;font-size:.68rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--blue)} .form-eyebrow{gap:.4rem;margin-bottom:1.15rem}
        .form-title,.success-title{font-family:var(--font-serif);font-weight:400;color:var(--ink)} .form-title{font-size:2rem;letter-spacing:-.02em;margin:0 0 .55rem;line-height:1.15} .form-sub{font-size:.9rem;color:var(--muted);margin:0 0 1.7rem;line-height:1.6} .inline-link,.forgot-link{color:var(--blue);font-weight:600;border:none;background:transparent;padding:0;cursor:pointer;font:inherit;text-decoration:none} .inline-link:hover,.forgot-link:hover{text-decoration:underline}
        .name-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.8rem;width:100%}.name-row > *{min-width:0}.form-group{margin-bottom:1.15rem;min-width:0}.form-group.no-gap{margin-bottom:0}.form-spacer{margin-bottom:1.15rem}.form-label{display:block;font-size:.78rem;font-weight:700;color:var(--ink3);margin-bottom:.45rem;letter-spacing:.3px}.input-wrap{position:relative;width:100%;min-width:0}
        .form-input{display:block;width:100%;max-width:100%;min-width:0;padding:.9rem 1rem;background:var(--surface);border:1.5px solid var(--border);border-radius:14px;font-family:var(--font-sans);font-size:.95rem;color:var(--ink);outline:none;transition:border-color .2s,box-shadow .2s,background .3s;box-shadow:var(--shadow-sm)} .form-input::placeholder{color:var(--muted2)} .form-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(3,105,161,.1)} .auth-screen.dark .form-input:focus{box-shadow:0 0 0 3px rgba(56,189,248,.12)} .form-input.has-icon{padding-left:2.6rem} .form-input.has-toggle{padding-right:2.8rem}
        .input-icon{position:absolute;left:.9rem;top:50%;transform:translateY(-50%);font-size:.95rem;pointer-events:none;opacity:.5} .input-toggle{position:absolute;right:.75rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:.8rem;color:var(--muted);padding:.2rem}.input-toggle:hover{color:var(--ink)}
        .strength-row{display:flex;align-items:center;gap:.5rem;margin-top:.45rem}.strength-bars{display:flex;gap:3px}.strength-bar{width:28px;height:3px;border-radius:2px;background:var(--border)}.strength-label{font-size:.68rem;font-weight:700}
        .field-hint{font-size:.72rem;margin-top:.35rem}.field-hint.error{color:var(--red)}.field-hint.success{color:var(--green)} .forgot-row{display:flex;justify-content:flex-end;margin-top:-.5rem;margin-bottom:1.1rem}
        .check-row{display:flex;align-items:flex-start;gap:.65rem;margin-bottom:1.5rem}.check-box{width:18px;height:18px;border-radius:4px;flex-shrink:0;background:var(--surface);border:1.5px solid var(--border-med);cursor:pointer;display:flex;align-items:center;justify-content:center;margin-top:.05rem}.check-box.checked{background:var(--accent);border-color:var(--accent)}.check-mark{color:#fff;font-size:.7rem;font-weight:700}.check-text{font-size:.78rem;color:var(--muted);line-height:1.5}.check-text :global(a){color:var(--blue);text-decoration:none;font-weight:500}.check-text :global(a:hover){text-decoration:underline}
        .btn-submit,.btn-dashboard{display:block;width:100%;max-width:100%;padding:.92rem;border-radius:14px;background:linear-gradient(135deg,#0369a1,#0ea5e9);border:none;font-family:var(--font-sans);font-size:.95rem;font-weight:700;color:#fff;cursor:pointer;box-shadow:0 4px 20px rgba(3,105,161,.32);transition:transform .2s,box-shadow .2s,opacity .2s;letter-spacing:.2px}.btn-submit{margin:.2rem 0 1.3rem}.btn-submit:hover,.btn-dashboard:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(3,105,161,.42)} .btn-submit:active,.btn-dashboard:active{transform:translateY(0)} .btn-submit:disabled,.btn-dashboard:disabled,.btn-secondary:disabled{cursor:not-allowed;opacity:.7;transform:none;box-shadow:none}
        .btn-secondary{display:block;width:100%;max-width:100%;padding:.88rem;border-radius:14px;background:var(--surface);border:1px solid var(--border);color:var(--ink3);font-family:var(--font-sans);font-size:.88rem;font-weight:700;cursor:pointer;transition:background .2s,border-color .2s,transform .2s}.btn-secondary:hover{background:var(--bg-subtle);border-color:var(--border-med);transform:translateY(-1px)}
        .success-card{text-align:center;padding:.25rem 0}.success-icon{width:72px;height:72px;border-radius:20px;background:var(--green-lt);border:2px solid rgba(22,163,74,.2);display:flex;align-items:center;justify-content:center;font-size:2.2rem;margin:0 auto 1.3rem}.success-title{font-size:1.7rem;margin-bottom:.5rem}.success-sub{font-size:.88rem;color:var(--muted);line-height:1.65;margin:0 0 1.8rem}.success-actions{display:flex;flex-direction:column;gap:.8rem}
        .form-note{text-align:center;font-size:.72rem;color:var(--muted2);margin-top:.5rem}.form-note span{color:var(--green);font-weight:600}
        .verification-card{margin-top:1.35rem;padding:1.05rem;border-radius:18px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-md);min-width:0} .verification-pill{margin-bottom:.75rem}.verification-copy{margin:0 0 .95rem;color:var(--muted);font-size:.8rem;line-height:1.6}.verification-button{margin-bottom:0}
        @media (max-width:640px){.auth-page{align-items:flex-start;padding:18px 12px}.auth-panel{width:100%}.form-card{padding:22px 18px;border-radius:24px}.name-row{grid-template-columns:1fr;gap:.75rem}.form-title{font-size:1.7rem}.success-card{padding:0}.forgot-row{margin-top:-.15rem}}
      `}</style>
    </>
  );
}
