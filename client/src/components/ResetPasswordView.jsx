import { useEffect, useMemo, useState } from "react";
import { confirmPasswordReset } from "../api/tradesApi";
import BrandLogo from "./BrandLogo";

const stripTokenFromUrl = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) {
      return;
    }
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch {
    // Ignore URL parsing failures.
  }
};

const ResetPasswordView = ({ initialToken = "" }) => {
  const [token, setToken] = useState(() => String(initialToken || ""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return Boolean(token.trim()) && newPassword.length >= 8 && confirmPassword.length >= 8 && !loading;
  }, [token, newPassword, confirmPassword, loading]);

  useEffect(() => {
    stripTokenFromUrl();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const payload = await confirmPasswordReset({ token: token.trim(), newPassword });
      setMessage(payload.message || "Password updated. Please sign in again.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(submitError.message || "Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell w-full min-h-screen p-0">
      <section className="journal-shell app-journal landing-shell w-full p-0">
        <div className="landing-inner">
          <header className="landing-navbar">
            <div className="brand-block landing-brand-block">
              <BrandLogo className="brand-logo brand-logo-landing" />
              <h1 className="landing-brand-title">Journex</h1>
            </div>
          </header>

          <section className="landing-body">
            <div className="panel animate-riseIn landing-hero text-left">
              <h2 className="landing-hero-title !text-[clamp(1.8rem,4vw,2.6rem)]">Reset password</h2>
              <p className="landing-hero-copy mt-3 !mx-0 !max-w-none">
                Enter the reset token from your email and choose a new password.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-3">
                <label>
                  <span className="label">Reset token</span>
                  <input
                    className="input"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Paste reset token"
                    required
                  />
                </label>
                <label>
                  <span className="label">New password</span>
                  <input
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  <span className="label">Confirm password</span>
                  <input
                    className="input"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat new password"
                    minLength={8}
                    required
                  />
                </label>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-primary min-w-[210px]" type="submit" disabled={!canSubmit}>
                    {loading ? "Updating..." : "Update password"}
                  </button>
                  <button
                    type="button"
                    className="landing-cta-secondary"
                    onClick={() => window.location.assign("/")}
                    disabled={loading}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>

              {message ? (
                <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-2 text-sm text-accent">
                  {message}
                </p>
              ) : null}
              {error ? (
                <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </div>

            <footer id="footer" className="panel animate-riseIn landing-footer">
              <p className="text-sm text-textMuted">(c) {new Date().getFullYear()} Journex</p>
            </footer>
          </section>
        </div>
      </section>
    </main>
  );
};

export default ResetPasswordView;

