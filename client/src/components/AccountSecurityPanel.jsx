import { useState } from "react";
import {
  disableTwoFactorAuth,
  enableTwoFactorAuth,
  requestEmailVerification,
  verifyEmailToken,
} from "../api/tradesApi";

const AccountSecurityPanel = ({ user, token, onUserUpdate }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [debugToken, setDebugToken] = useState("");

  const resetFeedback = () => {
    setError("");
    setMessage("");
  };

  const handleRequestVerification = async () => {
    setBusy(true);
    resetFeedback();
    setDebugToken("");
    try {
      const payload = await requestEmailVerification(token);
      setMessage(payload.message || "Verification token generated.");
      setDebugToken(payload.debugToken || "");
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!verifyToken.trim()) {
      setError("Enter verification token.");
      return;
    }

    setBusy(true);
    resetFeedback();
    try {
      await verifyEmailToken({ token: verifyToken.trim() });
      onUserUpdate({
        ...user,
        emailVerified: true,
      });
      setMessage("Email verified successfully.");
      setVerifyToken("");
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleTwoFactor = async () => {
    if (!passwordConfirm) {
      setError("Enter password confirmation.");
      return;
    }
    setBusy(true);
    resetFeedback();
    try {
      const payload = user?.twoFactorEnabled
        ? await disableTwoFactorAuth(token, passwordConfirm)
        : await enableTwoFactorAuth(token, passwordConfirm);
      onUserUpdate(payload.user || user);
      setPasswordConfirm("");
      setMessage(payload.message || "Security settings updated.");
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Account Security</h3>
        <span className="chip">{user?.twoFactorEnabled ? "2FA On" : "2FA Off"}</span>
      </div>

      <div className="space-y-3">
        <div className="rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
          <p className="text-textMain">
            Email status: <span className="font-medium">{user?.emailVerified ? "Verified" : "Not verified"}</span>
          </p>
          {!user?.emailVerified ? (
            <div className="mt-2 space-y-2">
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={handleRequestVerification}
                disabled={busy}
              >
                {busy ? "Generating..." : "Generate verification token"}
              </button>
              <div className="flex flex-wrap gap-2">
                <input
                  className="input !h-9 text-sm"
                  value={verifyToken}
                  onChange={(event) => setVerifyToken(event.target.value)}
                  placeholder="Paste verification token"
                />
                <button type="button" className="chip text-textMain transition hover:border-accent" onClick={handleVerifyEmail} disabled={busy}>
                  Verify
                </button>
              </div>
              {debugToken ? <p className="text-xs text-accent">Dev token: {debugToken}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
          <p className="text-textMain">Two-factor login (email code)</p>
          <p className="mt-1">Protects your account with a one-time verification code at login.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="input !h-9 text-sm"
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="Confirm password"
            />
            <button type="button" className="chip text-textMain transition hover:border-accent" onClick={handleToggleTwoFactor} disabled={busy}>
              {busy ? "Saving..." : user?.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
            </button>
          </div>
        </div>
      </div>

      {message ? <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 p-2 text-sm text-accent">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
};

export default AccountSecurityPanel;
