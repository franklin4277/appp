import { useMemo, useState } from "react";
import {
  confirmPasswordReset,
  loginUser,
  registerUser,
  requestPasswordReset,
  verifyTwoFactorLogin,
} from "../api/tradesApi";

const LandingBrandMark = ({ className = "" }) => (
  <span className={className} aria-hidden="true">
    <svg viewBox="0 0 24 24" role="presentation" className="h-full w-full">
      <defs>
        <linearGradient id="landing-brand-mark" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#landing-brand-mark)" />
      <path
        d="M6.5 14.25L10 10.75L12.7 13.15L17.5 8.5"
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15.35 8.5H17.5V10.65" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  </span>
);

const AuthPanel = ({ onAuthenticated }) => {
  const showDebugSecrets = Boolean(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEBUG_AUTH_SECRETS === "true");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [twoFactorPending, setTwoFactorPending] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [debugSecret, setDebugSecret] = useState("");

  const authTitle = useMemo(() => {
    if (twoFactorPending) {
      return "Two-factor verification";
    }
    if (mode === "reset") {
      return "Reset password";
    }
    return mode === "register" ? "Create account" : "Sign in";
  }, [mode, twoFactorPending]);

  const handlePrimarySubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setDebugSecret("");

    try {
      const payload =
        mode === "register"
          ? await registerUser({ name: name || "Trader", email, password })
          : await loginUser({ email, password });

      if (payload.requiresTwoFactor) {
        setTwoFactorPending({
          email,
          challengeId: payload.challengeId,
        });
        setDebugSecret(showDebugSecrets ? payload.debugCode || "" : "");
        setMessage("Enter the 2FA code to complete login.");
        return;
      }

      if (showDebugSecrets && payload.debug?.emailVerificationToken) {
        setDebugSecret(payload.debug.emailVerificationToken);
      }

      onAuthenticated(payload);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (event) => {
    event.preventDefault();
    if (!twoFactorPending) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const payload = await verifyTwoFactorLogin({
        email: twoFactorPending.email,
        challengeId: twoFactorPending.challengeId,
        code: twoFactorCode,
      });
      setTwoFactorPending(null);
      setTwoFactorCode("");
      onAuthenticated(payload);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async () => {
    if (!email) {
      setError("Enter your email to request reset.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setDebugSecret("");
    try {
      const payload = await requestPasswordReset({ email });
      setMessage(payload.message || "Reset instructions generated.");
      setDebugSecret(showDebugSecrets ? payload.debugToken || "" : "");
      setMode("reset");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const payload = await confirmPasswordReset({
        token: resetToken,
        newPassword: resetPassword,
      });
      setMessage(payload.message || "Password updated. You can now log in.");
      setMode("login");
      setResetToken("");
      setResetPassword("");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell mx-auto min-h-screen w-full max-w-none p-0">
      <section className="journal-shell app-journal landing-shell w-full p-0">
        <div className="landing-inner">
          <header className="landing-navbar">
            <div className="brand-block landing-brand-block">
              <LandingBrandMark className="brand-logo-landing" />
              <h1 className="landing-brand-title">TradeEdge</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="landing-cta-secondary"
                onClick={() => {
                  setMode("login");
                  setAuthModalOpen(true);
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn-primary landing-cta-primary"
                onClick={() => {
                  setMode("register");
                  setAuthModalOpen(true);
                }}
              >
                Get Started
              </button>
            </div>
          </header>

          <section className="mt-4 space-y-4">
            <div className="panel animate-riseIn landing-hero">
              <h2 className="landing-hero-title">Trading journal, analytics, and review.</h2>
              <p className="landing-hero-copy mt-3">Sign in to continue.</p>
              <div className="landing-cta mt-6">
                <button
                  type="button"
                  className="btn-primary landing-cta-primary"
                  onClick={() => {
                    setMode("register");
                    setAuthModalOpen(true);
                  }}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className="landing-cta-secondary"
                  onClick={() => {
                    setMode("login");
                    setAuthModalOpen(true);
                  }}
                >
                  Sign in
                </button>
              </div>
            </div>

            <footer id="footer" className="panel animate-riseIn landing-footer">
              <p className="text-sm text-textMuted">(c) {new Date().getFullYear()} TradeEdge</p>
            </footer>
          </section>
        </div>

        {authModalOpen ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Authentication" onClick={() => setAuthModalOpen(false)}>
            <aside className="panel animate-riseIn auth-modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{authTitle}</h3>
                <div className="flex items-center gap-2">
                  {!twoFactorPending && mode !== "reset" ? (
                    <button
                      type="button"
                      className="chip text-textMain transition hover:border-accent"
                      onClick={() => setMode((prev) => (prev === "register" ? "login" : "register"))}
                    >
                      {mode === "register" ? "Have account?" : "Create account"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    onClick={() => setAuthModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>

            {twoFactorPending ? (
              <form onSubmit={handleTwoFactorSubmit} className="space-y-3">
                <p className="text-sm text-textMuted">
                  Enter the verification code sent for <span className="font-medium">{twoFactorPending.email}</span>.
                </p>
                <label>
                  <span className="label">Verification code</span>
                  <input
                    className="input"
                    value={twoFactorCode}
                    onChange={(event) => setTwoFactorCode(event.target.value)}
                    placeholder="6-digit code"
                    required
                  />
                </label>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" type="submit" disabled={loading}>
                    {loading ? "Checking..." : "Verify"}
                  </button>
                  <button
                    type="button"
                    className="chip text-textMain"
                    onClick={() => {
                      setTwoFactorPending(null);
                      setTwoFactorCode("");
                    }}
                  >
                    Back
                  </button>
                </div>
              </form>
            ) : mode === "reset" ? (
              <form onSubmit={handleResetConfirm} className="space-y-3">
                <label>
                  <span className="label">Reset token</span>
                  <input
                    className="input"
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                    placeholder="Paste reset token"
                    required
                  />
                </label>
                <label>
                  <span className="label">New password</span>
                  <input
                    className="input"
                    type="password"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    required
                  />
                </label>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" type="submit" disabled={loading}>
                    {loading ? "Please wait..." : "Update password"}
                  </button>
                  <button type="button" className="chip text-textMain" onClick={() => setMode("login")}>
                    Back
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handlePrimarySubmit} className="space-y-3">
                {mode === "register" ? (
                  <label>
                    <span className="label">Name</span>
                    <input
                      className="input"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </label>
                ) : null}
                <label>
                  <span className="label">Email</span>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label>
                  <span className="label">Password</span>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    required
                  />
                </label>
                <button className="btn-primary w-full" type="submit" disabled={loading}>
                  {loading ? "Please wait..." : mode === "register" ? "Create account" : "Log in"}
                </button>
                {mode === "login" ? (
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    onClick={handleResetRequest}
                    disabled={loading}
                  >
                    Forgot password
                  </button>
                ) : null}
              </form>
            )}

            {message ? (
              <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 p-2 text-sm text-accent">{message}</p>
            ) : null}
            {error ? (
              <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>
            ) : null}
            {showDebugSecrets && debugSecret ? (
              <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 p-2 text-xs text-accent">
                Dev token/code: {debugSecret}
              </p>
            ) : null}
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default AuthPanel;
