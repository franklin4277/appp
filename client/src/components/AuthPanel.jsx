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
  const [publicPath, setPublicPath] = useState(() => String(window.location.pathname || "").replace(/\/+$/, "") || "/");
  const [landingMenuOpen, setLandingMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
  const landingMenuRef = useRef(null);

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

  useEffect(() => {
    const syncPath = () => {
      setPublicPath(String(window.location.pathname || "").replace(/\/+$/, "") || "/");
      setLandingMenuOpen(false);
    };

    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  useEffect(() => {
    if (!landingMenuOpen) {
      return undefined;
    }

    const handlePointer = (event) => {
      if (landingMenuRef.current && !landingMenuRef.current.contains(event.target)) {
        setLandingMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setLandingMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [landingMenuOpen]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [publicPath]);

  const authTitle = useMemo(() => {
    if (twoFactorPending) {
      return "Two-factor verification";
    }
    if (mode === "reset") {
      return "Reset password";
    }
    return mode === "register" ? "Create account" : "Sign in";
  }, [mode, twoFactorPending]);

  useEffect(() => {
    setConfirmPassword("");
  }, [mode]);

  const handlePrimarySubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setDebugSecret("");
    setDeliveryHint("");

    try {
      if (mode === "register" && password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

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

  const openAuth = (nextMode) => {
    setLandingMenuOpen(false);
    setMode(nextMode || "login");
    setAuthModalOpen(true);
    void wakeBackend();
  };

  const navigatePublic = (nextPath) => {
    const normalizedPath = String(nextPath || "/").replace(/\/+$/, "") || "/";
    setLandingMenuOpen(false);
    if (normalizedPath !== publicPath) {
      window.history.pushState({}, "", normalizedPath);
      setPublicPath(normalizedPath);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const isFeaturesPage = publicPath === "/features";
  const menuPrimaryLabel = isFeaturesPage ? "Back Home" : "Login";
  const menuPrimaryAction = () => {
    if (isFeaturesPage) {
      navigatePublic("/");
      return;
    }
    openAuth("login");
  };

  const landingHomeSections = (
    <>
      <section className="landing-hero reveal">
        <div className="landing-hero-copy animate-riseIn">
          <p className="landing-kicker">Built for serious traders</p>
          <h2 className="landing-hero-title">Track. Analyze. Improve Your Trades.</h2>
          <p className="landing-hero-text">
            Journex gives you one focused place to log trades, review screenshots, and measure what is actually working
            so you can improve with structure instead of guesswork.
          </p>
          <div className="landing-cta">
            <button type="button" className="btn-primary landing-cta-primary" onClick={() => openAuth("register")}>
              Get Started
            </button>
            <button type="button" className="btn-secondary landing-cta-secondary" onClick={() => navigatePublic("/features")}>
              Explore Features
            </button>
          </div>
          <div className="landing-stats">
            <div className="landing-stat-card">
              <h3>120+</h3>
              <p>Weekly trades tracked</p>
            </div>
            <div className="landing-stat-card">
              <h3>4.8x</h3>
              <p>Avg R:R consistency</p>
            </div>
            <div className="landing-stat-card">
              <h3>24/7</h3>
              <p>Cloud sync</p>
            </div>
          </div>
          <div className="landing-trust">
            <span>Trusted by traders at</span>
            <div className="landing-trust-logos">
              <span>NovaFX</span>
              <span>AxisFlow</span>
              <span>PulseTrades</span>
              <span>TrendVault</span>
            </div>
          </div>
        </div>

        <div className="landing-hero-visual animate-riseIn">
          <div className="landing-hero-card panel reveal">
            <p className="landing-card-kicker">Dashboard</p>
            <h3 className="landing-card-title">Performance at a glance</h3>
            <div className="landing-card-grid">
              <div className="landing-card-chip">
                <span>Total Trades</span>
                <strong>128</strong>
              </div>
              <div className="landing-card-chip">
                <span>Win Rate</span>
                <strong>58.3%</strong>
              </div>
              <div className="landing-card-chip">
                <span>Net R</span>
                <strong>+12.6R</strong>
              </div>
            </div>
            <div className="landing-card-chart">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="landing-hero-art reveal">
            <div className="landing-hero-orb landing-hero-orb-primary" />
            <div className="landing-hero-orb landing-hero-orb-secondary" />
            <div className="landing-hero-orb landing-hero-orb-tertiary" />
            <div className="landing-hero-grid" />
          </div>
        </div>
      </section>

    </>
  );

  const featuresPageSections = (
    <>
      <section className="landing-section landing-features-hero reveal">
        <div className="landing-section-title">
          <p className="landing-kicker">Feature overview</p>
          <h3>Everything Journex gives you to review better and grow faster</h3>
          <p>
            A focused workflow for logging trades, analyzing behavior, and reviewing screenshot context without clutter
            on the landing page.
          </p>
        </div>
        <div className="landing-features-actions">
          <button type="button" className="btn-primary" onClick={() => openAuth("register")}>
            Get Started
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigatePublic("/")}>
            Back Home
          </button>
        </div>
      </section>

      <section className="landing-section reveal">
        <div className="landing-section-title">
          <h3>Everything you need to journal better</h3>
          <p>Stay consistent with structured workflows designed for traders.</p>
        </div>
        <div className="landing-feature-grid">
          <article className="panel landing-feature-card">
            <h4>Trade logging</h4>
            <p>Capture entries, exits, session, setup type, and screenshots in seconds.</p>
          </article>
          <article className="panel landing-feature-card">
            <h4>Performance analytics</h4>
            <p>Visualize win rate, expectancy, and risk metrics across sessions and setups.</p>
          </article>
          <article className="panel landing-feature-card">
            <h4>Risk management insights</h4>
            <p>Track discipline, guardrails, and behavioral patterns to protect your edge.</p>
          </article>
        </div>
      </section>

      <section className="landing-section landing-preview reveal">
        <div className="landing-section-title">
          <h3>Preview your workflow</h3>
          <p>From quick trade entry to full replay in one smooth flow.</p>
        </div>
        <div className="landing-preview-grid">
          <div className="panel landing-preview-card">
            <p className="landing-card-kicker">Recent trades</p>
            <ul className="landing-preview-list">
              <li>
                <span>EURUSD - Breakout</span>
                <strong className="landing-tag-win">+1.8R</strong>
              </li>
              <li>
                <span>GBPUSD - Pullback</span>
                <strong className="landing-tag-loss">-0.7R</strong>
              </li>
              <li>
                <span>XAUUSD - Reversal</span>
                <strong className="landing-tag-win">+2.4R</strong>
              </li>
            </ul>
          </div>
          <div className="panel landing-preview-card">
            <p className="landing-card-kicker">Screenshot review</p>
            <div className="landing-preview-shot">
              <span>Before</span>
              <span>After</span>
            </div>
            <p className="landing-preview-note">Open any trade to review full context.</p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-testimonials reveal">
        <div className="landing-section-title">
          <h3>Trusted by disciplined traders</h3>
          <p>Real feedback from traders building repeatable systems.</p>
        </div>
        <div className="landing-testimonial-grid">
          <article className="panel landing-testimonial-card">
            <p>"My win rate jumped once I tracked session habits. Journex keeps me accountable."</p>
            <span>- Aisha, FX swing trader</span>
          </article>
          <article className="panel landing-testimonial-card">
            <p>"The screenshot replay is powerful. I can finally review the why, not just the numbers."</p>
            <span>- Mark, crypto day trader</span>
          </article>
          <article className="panel landing-testimonial-card">
            <p>"Simple, clean, and focused. Exactly what a trading journal should be."</p>
            <span>- Daniel, funded trader</span>
          </article>
        </div>
      </section>

      <section className="landing-section landing-proof reveal">
        <div className="landing-section-title">
          <h3>Designed to hold more than a basic journal</h3>
          <p>Journex is built with enough structure to support deeper review modules as the product grows.</p>
        </div>
        <div className="landing-proof-grid">
          <article className="panel landing-proof-card">
            <p className="landing-card-kicker">Review loop</p>
            <h4>Numbers plus context</h4>
            <p>Each trade can carry screenshots, notes, and structured fields so decisions stay reviewable later.</p>
          </article>
          <article className="panel landing-proof-card">
            <p className="landing-card-kicker">Behavior layer</p>
            <h4>Pattern visibility</h4>
            <p>Sessions, setup types, and discipline checks make it easier to see what habits drive outcomes.</p>
          </article>
          <article className="panel landing-proof-card">
            <p className="landing-card-kicker">Expansion path</p>
            <h4>Room for more modules</h4>
            <p>Edge review, automation, coaching, and account-level analytics fit naturally into the same system.</p>
          </article>
        </div>
      </section>
    </>
  );

  return (
    <main className={`landing-page ${!isFeaturesPage ? "landing-page-home" : "landing-page-features"}`}>
      <div className={`landing-wrap ${!isFeaturesPage ? "landing-wrap-home" : "landing-wrap-features"}`}>
        <header className="landing-header">
          <button type="button" className="landing-brand landing-link-button" onClick={() => navigatePublic("/")}>
            <BrandLogo className="brand-logo brand-logo-landing" />
            <span className="landing-brand-title">Journex</span>
          </button>
          <div className="landing-menu" ref={landingMenuRef}>
            <button
              type="button"
              className="landing-menu-trigger"
              aria-expanded={landingMenuOpen}
              aria-haspopup="menu"
              onClick={() => setLandingMenuOpen((open) => !open)}
            >
              <span className="landing-menu-trigger-label">Menu</span>
              <span className="landing-menu-trigger-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            {landingMenuOpen ? (
              <div className="landing-menu-dropdown panel" role="menu" aria-label="Landing page menu">
                <div className="landing-menu-group">
                  <button
                    type="button"
                    role="menuitem"
                    className="landing-menu-item"
                    onClick={menuPrimaryAction}
                  >
                    {menuPrimaryLabel}
                  </button>
                </div>
                <div className="landing-menu-divider" />
                <div className="landing-menu-group">
                  <button
                    type="button"
                    role="menuitem"
                    className="landing-menu-item landing-menu-item-primary"
                    onClick={() => openAuth("register")}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </header>
        {!isFeaturesPage ? landingHomeSections : featuresPageSections}

        <footer className="landing-footer">
          <div>
            <strong>Journex</strong>
            <p>Trading journal built for clarity.</p>
          </div>
          <div className="landing-footer-links">
            <button type="button" className="landing-link-button" onClick={() => navigatePublic("/")}>
              Home
            </button>
            <button type="button" className="landing-link-button" onClick={() => navigatePublic("/features")}>
              Features
            </button>
            <button type="button" className="landing-link-button" onClick={() => openAuth("login")}>
              Login
            </button>
          </div>
          <p className="landing-footer-copy">(c) {new Date().getFullYear()} Journex. All rights reserved.</p>
        </footer>
      </div>

      {authModalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Authentication"
          onClick={() => setAuthModalOpen(false)}
        >
          <aside className="panel animate-riseIn auth-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-header">
              <div>
                <h3 className="auth-modal-title">{authTitle}</h3>
                <p className="auth-modal-subtitle">Secure access to your Journex workspace.</p>
              </div>
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
                {mode === "register" ? (
                  <label>
                    <span className="label">Confirm password</span>
                    <input
                      className="input"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Re-enter password"
                      minLength={8}
                      required
                    />
                  </label>
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
                {!twoFactorPending && mode !== "reset" ? (
                  <button
                    type="button"
                    className="auth-switch"
                    onClick={() => setMode((prev) => (prev === "register" ? "login" : "register"))}
                  >
                    {mode === "register" ? "Already have an account? Log in" : "New here? Create an account"}
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
    </main>
  );
};

export default AuthPanel;

