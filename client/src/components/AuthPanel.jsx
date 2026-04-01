import { useEffect, useMemo, useRef, useState } from "react";
import {
  confirmPasswordReset,
  fetchApiHealth,
  loginUser,
  registerUser,
  requestPasswordReset,
  verifyTwoFactorLogin,
} from "../api/tradesApi";
import BrandLogo from "./BrandLogo";

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
  const [deliveryHint, setDeliveryHint] = useState("");
  const [healthStatus, setHealthStatus] = useState({ state: "idle", attempt: 0, error: "" });
  const wakeSeqRef = useRef(0);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const wakeBackend = async ({ maxMs = 45_000 } = {}) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setHealthStatus({ state: "offline", attempt: 0, error: "" });
      return false;
    }

    const seq = wakeSeqRef.current + 1;
    wakeSeqRef.current = seq;

    const deadline = Date.now() + Math.max(8000, maxMs);
    let attempt = 0;
    let lastError = "";

    while (Date.now() < deadline) {
      attempt += 1;
      setHealthStatus({ state: "checking", attempt, error: "" });

      try {
        const payload = await fetchApiHealth({ timeoutMs: 12_000 });
        if (wakeSeqRef.current !== seq) {
          return false;
        }
        if (payload?.ok) {
          setHealthStatus({ state: "ok", attempt, error: "" });
          return true;
        }
        lastError = "Health check returned an unexpected response.";
      } catch (error) {
        lastError = error?.message || "Cannot reach the server.";
      }

      if (wakeSeqRef.current !== seq) {
        return false;
      }
      setHealthStatus({ state: "checking", attempt, error: lastError });
      await sleep(2500);
    }

    if (wakeSeqRef.current !== seq) {
      return false;
    }
    setHealthStatus({ state: "error", attempt, error: lastError || "Cannot reach the server." });
    return false;
  };

  useEffect(() => {
    // Best-effort warmup so the auth request doesn't feel like it hangs on cold starts.
    void fetchApiHealth({ timeoutMs: 8000 }).catch(() => {});
  }, []);

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
    setDeliveryHint("");

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

  const handleOpenAuth = () => {
    setMode("login");
    setAuthModalOpen(true);
    void wakeBackend();
  };

  const handleResetRequest = async () => {
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail) {
      setError("Enter your email to request reset.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setDebugSecret("");
    setDeliveryHint("");
    try {
      const payload = await requestPasswordReset({ email: normalizedEmail });
      setMessage(payload.message || "Reset instructions generated.");
      if (payload.delivery && !payload.delivery.sent && payload.delivery.error) {
        setError(payload.delivery.error);
      }
      if (payload.delivery?.hint) {
        setDeliveryHint(payload.delivery.hint);
      }
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
    setDeliveryHint("");
    try {
      const payload = await confirmPasswordReset({
        token: String(resetToken || "").trim(),
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
              <BrandLogo className="brand-logo brand-logo-landing" />
              <h1 className="landing-brand-title">Journex</h1>
            </div>
          </header>

          <section className="landing-body">
            <div className="panel animate-riseIn landing-hero">
              <h2 className="landing-hero-title">Trading journal, analytics, and review.</h2>
              <p className="landing-hero-copy mt-3">Sign in to continue.</p>
              <div className="landing-cta mt-6">
                <button
                  type="button"
                  className="btn-primary landing-cta-primary"
                  onClick={handleOpenAuth}
                >
                  Continue
                </button>
              </div>
            </div>

            <footer id="footer" className="panel animate-riseIn landing-footer">
              <p className="text-sm text-textMuted">(c) {new Date().getFullYear()} Journex</p>
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
                    onClick={() => {
                      wakeSeqRef.current += 1;
                      setAuthModalOpen(false);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              {healthStatus.state === "checking" ? (
                <div className="mb-3 rounded-md border border-border/70 bg-panelMuted p-2 text-xs text-textMuted">
                  Waking up server... (attempt {healthStatus.attempt}){healthStatus.error ? `: ${healthStatus.error}` : ""}
                </div>
              ) : healthStatus.state === "error" ? (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
                  <span>Backend unreachable: {healthStatus.error || "Check VITE_API_URL and backend status."}</span>
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    onClick={() => void wakeBackend()}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

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
            {deliveryHint ? <p className="mt-2 text-xs text-textMuted">Delivery hint: {deliveryHint}</p> : null}
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
