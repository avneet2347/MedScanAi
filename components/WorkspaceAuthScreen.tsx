"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./WorkspaceAuthScreen.module.css";
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

function joinClassNames(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

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
  const [dark, setDark] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    const syncTheme = () => setDark(readActiveTheme() === "dark");
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== THEME_STORAGE_KEY) {
        return;
      }
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

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const isSignupMode = mode === "signup";
  const strength = passwordStrength(password);
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "#c0392b", "#c07020", "#4a8c6e", "#1a6b4a"][strength];
  const activeNotice = clientError ? { type: "error" as const, text: clientError } : notice;
  const actionEmail = verificationEmail || email.trim().toLowerCase() || "your inbox";

  const heroHighlights = isSignupMode
    ? [
        {
          code: "01",
          title: "Protected onboarding",
          text: "Create your account with encrypted authentication and account-scoped report history.",
        },
        {
          code: "02",
          title: "Verification first",
          text: "Every signup sends a confirmation link before dashboard access is unlocked.",
        },
        {
          code: "03",
          title: "Workspace ready",
          text: "OCR, explanations, risk flags, and AI chat stay tied to the same secure login.",
        },
      ]
    : [
        {
          code: "OCR",
          title: "Fast clinical extraction",
          text: "Turn prescriptions and lab reports into grounded, readable results in seconds.",
        },
        {
          code: "RX",
          title: "Medication-aware analysis",
          text: "Flag possible interactions and high-risk markers without leaving your workspace.",
        },
        {
          code: "SEC",
          title: "Private by design",
          text: "Session sync, protected auth, and account-scoped history keep patient data contained.",
        },
      ];

  const journeySteps = [
    {
      step: "1",
      title: "Account details",
      text: "Use the same signup flow you already have for name, email, and password.",
    },
    {
      step: "2",
      title: "Email confirmation",
      text: "A secure verification link is sent before the workspace is unlocked.",
    },
    {
      step: "3",
      title: "Workspace access",
      text: "After confirmation, your authenticated MediScan workspace is ready to go.",
    },
  ];

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

  const handleForgotPasswordClick = () => {
    setClientError("Password reset is not wired up yet. If you want, I can add that flow next.");
  };

  const noticeTone =
    activeNotice?.type === "error"
      ? styles.noticeError
      : activeNotice?.type === "success"
        ? styles.noticeSuccess
        : activeNotice?.type === "info"
          ? styles.noticeInfo
          : "";

  const confirmPasswordState =
    confirmPassword && confirmPassword !== password
      ? styles.inputInvalid
      : confirmPassword && confirmPassword === password
        ? styles.inputValid
        : "";

  return (
    <div className={joinClassNames(styles.authScreen, dark && styles.dark)}>
      <div className={joinClassNames(styles.ambient, styles.ambientOne)} aria-hidden="true" />
      <div className={joinClassNames(styles.ambient, styles.ambientTwo)} aria-hidden="true" />
      <div className={joinClassNames(styles.ambient, styles.ambientThree)} aria-hidden="true" />

      <div className={styles.authLayout}>
        <aside className={styles.heroPanel}>
          <div className={styles.heroSurface}>
            <div className={styles.heroTopbar}>
              <Link className={styles.heroHome} href="/">
                <span className={styles.heroHomeArrow} aria-hidden="true">
                  <span className={styles.heroHomeArrowInner} />
                </span>
                <span>Back to Home</span>
              </Link>
            </div>

            <div className={styles.heroBrand}>
              <div className={styles.heroLogo} aria-hidden="true">
                <span className={styles.heroLogoMark} />
              </div>
              <div className={styles.heroBrandCopy}>
                <div className={styles.heroWordmark}>
                  <span>Medi</span>
                  <em>Scan</em>
                  <span className={styles.heroAiTag}>AI</span>
                </div>
                <div className={styles.heroBrandSub}>Clinical Intelligence</div>
              </div>
            </div>

            <div className={styles.heroContent}>
              <div className={styles.heroPill}>
                <span className={styles.liveDot} aria-hidden="true" />
                <span>{isSignupMode ? "Secure onboarding" : "AI-powered platform"}</span>
              </div>

              <h1 className={styles.heroTitle}>
                {isSignupMode ? (
                  <>
                    Create a secure
                    <br />
                    <em className={styles.heroAccent}>MediScan AI account</em>
                  </>
                ) : (
                  <>
                    Clinical intelligence
                    <br />
                    <em className={styles.heroAccent}>at your fingertips</em>
                  </>
                )}
              </h1>

              <p className={styles.heroCopy}>
                {isSignupMode
                  ? "Keep every upload, OCR result, explanation, and AI conversation linked to one protected medical workspace from the moment you sign up."
                  : "Sign in to continue reviewing reports, monitoring flagged values, and keeping every analysis scoped to your authenticated MediScan workspace."}
              </p>

              <div className={styles.heroFeatureList}>
                {heroHighlights.map((item) => (
                  <div className={styles.heroFeature} key={item.code}>
                    <div className={styles.heroFeatureCode}>{item.code}</div>
                    <div>
                      <div className={styles.heroFeatureTitle}>{item.title}</div>
                      <div className={styles.heroFeatureText}>{item.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              {isSignupMode ? (
                <div className={styles.journeyCard}>
                  <div className={styles.journeyLabel}>Access Journey</div>
                  <div className={styles.journeySteps}>
                    {journeySteps.map((item) => (
                      <div className={styles.journeyStep} key={item.step}>
                        <div className={styles.journeyStepNumber}>{item.step}</div>
                        <div>
                          <div className={styles.journeyStepTitle}>{item.title}</div>
                          <div className={styles.journeyStepText}>{item.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.heroNoteCard}>
                  <div className={styles.heroNoteLabel}>Workspace Promise</div>
                  <div className={styles.heroNoteCopy}>
                    Your uploads, extracted text, explanations, and chat history stay scoped to
                    this signed-in account.
                  </div>
                </div>
              )}
            </div>

            <div className={styles.heroFooter}>
              {["HIPAA", "AES-256", "ISO 27001"].map((badge) => (
                <span className={styles.trustBadge} key={badge}>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <section className={styles.formPanel}>
          <div className={styles.panelShell}>
            {activeNotice ? (
              <div className={joinClassNames(styles.noticeBanner, noticeTone)} aria-live="polite" role="status">
                <span className={styles.noticeDot} aria-hidden="true" />
                <span>{activeNotice.text}</span>
              </div>
            ) : null}

            {authResult ? (
              <div className={joinClassNames(styles.formCard, styles.successMode)}>
                <div className={styles.cardShell}>
                  <div className={styles.cardHead}>
                    <div className={joinClassNames(styles.panelIcon, styles.successIcon)} aria-hidden="true">
                      OK
                    </div>
                    <div>
                      <div className={styles.panelBadge}>
                        {authResult === "login-success" ? "Session restored" : "Verification sent"}
                      </div>
                      <Link className={styles.formHomeLink} href="/">
                        Home
                      </Link>
                    </div>
                  </div>

                  <h2 className={styles.formTitle}>
                    {authResult === "login-success" ? "Welcome back" : "Account created"}
                  </h2>
                  <p className={styles.formCopy}>
                    {authResult === "login-success"
                      ? "Your dashboard is opening now and your secured workspace is being restored."
                      : `A verification link has been sent to ${actionEmail}. Confirm your email, then sign in to continue to your workspace.`}
                  </p>

                  {authResult === "login-success" ? (
                    <button className={styles.btnSubmit} disabled type="button">
                      Opening Workspace...
                    </button>
                  ) : (
                    <div className={styles.successActions}>
                      <button
                        className={styles.btnSubmit}
                        onClick={() => handleModeChange("login")}
                        type="button"
                      >
                        Continue to Sign In
                      </button>
                      <button
                        className={styles.btnSecondary}
                        onClick={onResendVerification}
                        disabled={resendLoading}
                        type="button"
                      >
                        {resendLoading ? "Sending..." : "Resend verification email"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.formCard}>
                <div className={styles.cardShell}>
                  <div className={styles.cardHead}>
                    <div className={styles.panelIcon} aria-hidden="true">
                      {isSignupMode ? "ID" : "RX"}
                    </div>
                    <div>
                      <div className={styles.panelBadge}>
                        {isSignupMode ? "Account setup" : "Secure sign in"}
                      </div>
                      <Link className={styles.formHomeLink} href="/">
                        Back to Home
                      </Link>
                    </div>
                  </div>

                  <h2 className={styles.formTitle}>
                    {isSignupMode ? "Create your account" : "Welcome back"}
                  </h2>
                  <p className={styles.formCopy}>
                    {isSignupMode
                      ? "Create your MediScan AI account to save report history, OCR insights, and clinical conversations in one protected workspace."
                      : "Sign in to continue working with your saved reports, analysis history, and personalized medical AI tools."}
                  </p>

                  <form onSubmit={handleSubmit} noValidate>
                    {isSignupMode ? (
                      <div className={styles.nameRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel} htmlFor="auth-first-name">
                            First Name
                          </label>
                          <div className={styles.inputWrap}>
                            <span className={styles.inputIcon}>ID</span>
                            <input
                              id="auth-first-name"
                              className={joinClassNames(styles.formInput, styles.hasIcon)}
                              type="text"
                              placeholder="Rahul"
                              value={firstName}
                              onChange={(event) => {
                                setClientError(null);
                                onFirstNameChange(event.target.value);
                              }}
                              autoComplete="given-name"
                            />
                          </div>
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.formLabel} htmlFor="auth-last-name">
                            Last Name
                          </label>
                          <div className={styles.inputWrap}>
                            <span className={styles.inputIcon}>LN</span>
                            <input
                              id="auth-last-name"
                              className={joinClassNames(styles.formInput, styles.hasIcon)}
                              type="text"
                              placeholder="Sharma"
                              value={lastName}
                              onChange={(event) => {
                                setClientError(null);
                                onLastNameChange(event.target.value);
                              }}
                              autoComplete="family-name"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="auth-email">
                        Email Address
                      </label>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon}>@</span>
                        <input
                          id="auth-email"
                          className={joinClassNames(styles.formInput, styles.hasIcon)}
                          type="email"
                          placeholder="rahul@example.com"
                          value={email}
                          onChange={(event) => {
                            setClientError(null);
                            onEmailChange(event.target.value);
                          }}
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="auth-password">
                        Password
                      </label>
                      <div className={styles.inputWrap}>
                        <span className={styles.inputIcon}>PW</span>
                        <input
                          id="auth-password"
                          className={joinClassNames(styles.formInput, styles.hasIcon, styles.hasToggle)}
                          type={showPass ? "text" : "password"}
                          placeholder={isSignupMode ? "Create a strong password" : "Enter your password"}
                          value={password}
                          onChange={(event) => {
                            setClientError(null);
                            onPasswordChange(event.target.value);
                          }}
                          autoComplete={isSignupMode ? "new-password" : "current-password"}
                          required
                        />
                        <button
                          type="button"
                          className={styles.inputToggle}
                          onClick={() => setShowPass((value) => !value)}
                        >
                          {showPass ? "Hide" : "Show"}
                        </button>
                      </div>

                      {isSignupMode && password ? (
                        <div className={styles.strengthRow}>
                          <div className={styles.strengthBars}>
                            {[1, 2, 3, 4].map((index) => (
                              <div
                                key={index}
                                className={styles.strengthBar}
                                style={{ background: index <= strength ? strengthColor : undefined }}
                              />
                            ))}
                          </div>
                          <span className={styles.strengthLabel} style={{ color: strengthColor }}>
                            {strengthLabel}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {isSignupMode ? (
                      <>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel} htmlFor="auth-confirm-password">
                            Confirm Password
                          </label>
                          <div className={styles.inputWrap}>
                            <span className={styles.inputIcon}>OK</span>
                            <input
                              id="auth-confirm-password"
                              className={joinClassNames(
                                styles.formInput,
                                styles.hasIcon,
                                styles.hasToggle,
                                confirmPasswordState
                              )}
                              type={showPass2 ? "text" : "password"}
                              placeholder="Re-enter password"
                              value={confirmPassword}
                              onChange={(event) => {
                                setClientError(null);
                                setConfirmPassword(event.target.value);
                              }}
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className={styles.inputToggle}
                              onClick={() => setShowPass2((value) => !value)}
                            >
                              {showPass2 ? "Hide" : "Show"}
                            </button>
                          </div>

                          {confirmPassword && confirmPassword !== password ? (
                            <div className={joinClassNames(styles.fieldHint, styles.fieldHintError)}>
                              Passwords do not match.
                            </div>
                          ) : null}
                          {confirmPassword && confirmPassword === password ? (
                            <div className={joinClassNames(styles.fieldHint, styles.fieldHintSuccess)}>
                              Passwords match.
                            </div>
                          ) : null}
                        </div>

                        <div className={styles.checkRow}>
                          <div
                            className={joinClassNames(styles.checkBox, agree && styles.checkBoxChecked)}
                            onClick={toggleCheckbox}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleCheckbox();
                              }
                            }}
                            role="checkbox"
                            aria-checked={agree}
                            tabIndex={0}
                          >
                            {agree ? <span className={styles.checkMark}>OK</span> : null}
                          </div>
                          <p className={styles.checkText}>
                            I agree to the <Link href="/terms">Terms of Service</Link> and{" "}
                            <Link href="/privacy">Privacy Policy</Link>. I understand my medical
                            data is protected under HIPAA guidelines.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className={styles.forgotRow}>
                        <button
                          className={styles.forgotLink}
                          onClick={handleForgotPasswordClick}
                          type="button"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}

                    <button className={styles.btnSubmit} disabled={authLoading} type="submit">
                      {authLoading
                        ? isSignupMode
                          ? "Creating account..."
                          : "Signing in..."
                        : isSignupMode
                          ? "Create Account"
                          : "Sign In to MediScan"}
                    </button>
                  </form>

                  <p className={styles.switchCopy}>
                    {isSignupMode ? "Already have an account?" : "New to MediScan?"}{" "}
                    <button
                      className={styles.switchLink}
                      onClick={() => handleModeChange(isSignupMode ? "login" : "signup")}
                      type="button"
                    >
                      {isSignupMode ? "Sign in" : "Create an account"}
                    </button>
                  </p>

                  <div className={styles.securityCard}>
                    <div className={styles.securityCardTitle}>Protected medical workspace</div>
                    <div className={styles.securityCardCopy}>
                      Your data is encrypted in transit and scoped to your authenticated account.
                    </div>
                  </div>

                  {verificationEmail || isSignupMode ? (
                    <div className={styles.verificationCard}>
                      <div className={styles.verificationPill}>
                        {verificationEmail ? "Verification email pending" : "Email verification required"}
                      </div>
                      <p className={styles.verificationCopy}>
                        {verificationEmail
                          ? `Use ${verificationEmail} to confirm your account before logging in.`
                          : "Every signup sends a confirmation link before dashboard access is unlocked."}
                      </p>
                      <button
                        className={styles.btnSecondary}
                        onClick={onResendVerification}
                        disabled={resendLoading || !actionEmail}
                        type="button"
                      >
                        {resendLoading ? "Sending..." : "Resend verification email"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
