import { useState } from "react";
import {
  clearTrustedDevicePin,
  disableTwoFactorAuth,
  enableTwoFactorAuth,
  fetchEmailDeliveryStatus,
  getTrustedDeviceState,
  lockTrustedDevice,
  persistCachedAuthProfile,
  requestEmailVerification,
  sendEmailDeliveryTest,
  setTrustedDevicePin,
  unlockTrustedDevice,
  verifyEmailToken,
} from "../api/tradesApi";

const AccountSecurityPanel = ({ user, token, onUserUpdate }) => {
  const showDebugSecrets = Boolean(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEBUG_AUTH_SECRETS === "true");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [debugToken, setDebugToken] = useState("");
  const [deliveryHint, setDeliveryHint] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [smtpInfo, setSmtpInfo] = useState(null);
  const [trustedPin, setTrustedPin] = useState("");
  const [trustedPinConfirm, setTrustedPinConfirm] = useState("");
  const [trustedState, setTrustedState] = useState(() => getTrustedDeviceState());

  const resetFeedback = () => {
    setError("");
    setMessage("");
    setDeliveryHint("");
  };

  const handleRequestVerification = async () => {
    setBusy(true);
    resetFeedback();
    setDebugToken("");
    try {
      const payload = await requestEmailVerification(token);
      setMessage(payload.message || "Verification token generated.");
      setDebugToken(showDebugSecrets ? payload.debugToken || payload.fallbackToken || "" : "");
      setDeliveryHint(payload.delivery?.hint || "");
      if (!payload.delivery?.sent && payload.delivery?.error) {
        setError(payload.delivery.error);
      }
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckEmailDelivery = async () => {
    setBusy(true);
    resetFeedback();
    try {
      const payload = await fetchEmailDeliveryStatus(token);
      setSmtpInfo(payload.mailer || null);
      if (payload.mailer?.configured) {
        setMessage("SMTP mailer is configured.");
      } else {
        setError("SMTP mailer is not fully configured.");
      }
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSendTestEmail = async () => {
    setBusy(true);
    resetFeedback();
    try {
      const payload = await sendEmailDeliveryTest(token, testEmail || user?.email || "");
      setSmtpInfo(payload.mailer || null);
      if (payload.delivery?.sent) {
        setMessage(`Test email sent to ${payload.recipient}.`);
      } else {
        setError(payload.delivery?.error || "Test email failed.");
        setDeliveryHint(payload.delivery?.hint || "");
      }
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

  const refreshTrustedState = () => {
    setTrustedState(getTrustedDeviceState());
  };

  const handleEnableTrustedDevice = async () => {
    const pin = String(trustedPin || "").trim();
    const confirm = String(trustedPinConfirm || "").trim();
    if (pin.length < 4) {
      setError("Trusted-device PIN must be at least 4 characters.");
      return;
    }
    if (pin !== confirm) {
      setError("PIN confirmation does not match.");
      return;
    }

    setBusy(true);
    resetFeedback();
    try {
      await setTrustedDevicePin(pin);
      await persistCachedAuthProfile(user);
      setTrustedPin("");
      setTrustedPinConfirm("");
      refreshTrustedState();
      setMessage("Trusted device encryption enabled for offline session cache.");
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockTrustedDevice = async () => {
    setBusy(true);
    resetFeedback();
    try {
      await unlockTrustedDevice(trustedPin);
      await persistCachedAuthProfile(user);
      setTrustedPin("");
      setTrustedPinConfirm("");
      refreshTrustedState();
      setMessage("Trusted device unlocked.");
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLockTrustedDevice = () => {
    lockTrustedDevice();
    refreshTrustedState();
    setMessage("Trusted device locked.");
    setError("");
  };

  const handleDisableTrustedDevice = async () => {
    clearTrustedDevicePin();
    await persistCachedAuthProfile(user);
    refreshTrustedState();
    setMessage("Trusted device encryption disabled on this browser.");
    setError("");
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
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={handleCheckEmailDelivery}
                disabled={busy}
              >
                {busy ? "Checking..." : "Check SMTP"}
              </button>
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={handleSendTestEmail}
                disabled={busy}
              >
                {busy ? "Sending..." : "Send test email"}
              </button>
            </div>
            <input
              className="input !h-9 text-sm"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              placeholder="Test email (optional)"
            />
            {smtpInfo ? (
              <div className="rounded-md border border-border/70 bg-panel p-2 text-xs">
                <p>
                  SMTP: {smtpInfo.configured ? "Configured" : "Not configured"} | Host: {smtpInfo.host || "-"} | Port:{" "}
                  {smtpInfo.port || "-"}
                </p>
                <p>
                  Secure: {smtpInfo.secure ? "true" : "false"} | Require TLS:{" "}
                  {smtpInfo.requireTls ? "true" : "false"} | From: {smtpInfo.from || "-"}
                </p>
              </div>
            ) : null}
          </div>

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
              {showDebugSecrets && debugToken ? <p className="text-xs text-accent">Dev token: {debugToken}</p> : null}
              {deliveryHint ? <p className="text-xs text-textMuted">Delivery hint: {deliveryHint}</p> : null}
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

        <div className="rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
          <p className="text-textMain">Trusted device offline unlock</p>
          <p className="mt-1">
            Encrypts local offline session cache with a PIN on this browser only.
          </p>
          <p className="mt-1 text-xs">
            Status: {trustedState.enabled ? (trustedState.unlocked ? "Enabled and unlocked" : "Enabled and locked") : "Disabled"}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              className="input !h-9 text-sm"
              type="password"
              value={trustedPin}
              onChange={(event) => setTrustedPin(event.target.value)}
              placeholder={trustedState.enabled ? "Enter PIN" : "Create PIN"}
            />
            <input
              className="input !h-9 text-sm"
              type="password"
              value={trustedPinConfirm}
              onChange={(event) => setTrustedPinConfirm(event.target.value)}
              placeholder={trustedState.enabled ? "Confirm new PIN (optional)" : "Confirm PIN"}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {!trustedState.enabled ? (
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={handleEnableTrustedDevice}
                disabled={busy}
              >
                {busy ? "Saving..." : "Enable trusted device"}
              </button>
            ) : (
              <>
                {!trustedState.unlocked ? (
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    onClick={handleUnlockTrustedDevice}
                    disabled={busy}
                  >
                    {busy ? "Unlocking..." : "Unlock"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    onClick={handleLockTrustedDevice}
                    disabled={busy}
                  >
                    Lock
                  </button>
                )}
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-danger"
                  onClick={handleDisableTrustedDevice}
                  disabled={busy}
                >
                  Disable trusted device
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {message ? <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 p-2 text-sm text-accent">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
};

export default AccountSecurityPanel;
