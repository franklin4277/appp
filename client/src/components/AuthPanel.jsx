import { useState } from "react";
import {
  confirmPasswordReset,
  loginUser,
  registerUser,
  requestPasswordReset,
  verifyTwoFactorLogin,
} from "../api/tradesApi";

const AuthPanel = ({ onAuthenticated }) => {
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
        setDebugSecret(payload.debugCode || "");
        setMessage("Enter the 2FA code to complete login.");
        return;
      }

      if (payload.debug?.emailVerificationToken) {
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
      setDebugSecret(payload.debugToken || "");
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
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-0 sm:p-4">
      <section className="journal-shell app-journal w-full max-w-4xl p-0 sm:p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <aside className="panel animate-riseIn">
            <div className="brand-block">
              <img src="/pwa-192x192.png" alt="Trading Journal logo" className="brand-logo" />
              <div>
                <p className="section-kicker">Welcome Back</p>
                <h1 className="hero-title brand-title mt-1">The Trading Journal</h1>
              </div>
            </div>
            <p className="hero-meta">PERSONAL ACCOUNT | PRIVATE DATA | RULE-BASED EXECUTION</p>
            <p className="mt-3 text-sm text-textMuted">
              Keep your process consistent, protect your edge, and review behavior patterns with a clean
              session-based journal.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="chip">Fast journaling</span>
              <span className="chip">Behavior analytics</span>
              <span className="chip">Rule guardrails</span>
            </div>
          </aside>

          {twoFactorPending ? (
            <form onSubmit={handleTwoFactorSubmit} className="panel animate-riseIn space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Two-factor verification</h2>
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-accent"
                  onClick={() => {
                    setTwoFactorPending(null);
                    setTwoFactorCode("");
                  }}
                >
                  Back
                </button>
              </div>
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
              {debugSecret ? (
                <p className="rounded-md border border-accent/40 bg-accent/10 p-2 text-xs text-accent">
                  Dev code: {debugSecret}
                </p>
              ) : null}
              {error ? (
                <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>
              ) : null}
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                {loading ? "Checking..." : "Verify and log in"}
              </button>
            </form>
          ) : mode === "reset" ? (
            <form onSubmit={handleResetConfirm} className="panel animate-riseIn space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Reset password</h2>
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-accent"
                  onClick={() => setMode("login")}
                >
                  Back to login
                </button>
              </div>

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

              {debugSecret ? (
                <p className="rounded-md border border-accent/40 bg-accent/10 p-2 text-xs text-accent">
                  Dev token: {debugSecret}
                </p>
              ) : null}
              {message ? (
                <p className="rounded-md border border-accent/40 bg-accent/10 p-2 text-sm text-accent">{message}</p>
              ) : null}
              {error ? (
                <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>
              ) : null}

              <button className="btn-primary w-full" type="submit" disabled={loading}>
                {loading ? "Please wait..." : "Update password"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePrimarySubmit} className="panel animate-riseIn space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">{mode === "register" ? "Create account" : "Log in"}</h2>
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-accent"
                  onClick={() => setMode((prev) => (prev === "register" ? "login" : "register"))}
                >
                  {mode === "register" ? "Have account?" : "New account"}
                </button>
              </div>

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

              {message ? (
                <p className="rounded-md border border-accent/40 bg-accent/10 p-2 text-sm text-accent">{message}</p>
              ) : null}
              {error ? (
                <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>
              ) : null}
              {debugSecret ? (
                <p className="rounded-md border border-accent/40 bg-accent/10 p-2 text-xs text-accent">
                  Dev token/code: {debugSecret}
                </p>
              ) : null}

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
        </div>
      </section>
    </main>
  );
};

export default AuthPanel;
