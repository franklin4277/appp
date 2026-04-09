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
  const lastNonAuthPathRef = useRef(String(window.location.pathname || "").replace(/\/+$/, "") || "/");
  const isAuthRoute = publicPath === "/login" || publicPath === "/signup";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isWarmableNetworkError = (error) =>
    Boolean(
      error?.isNetworkError ||
        error?.code === "NETWORK_UNREACHABLE" ||
        error?.code === "REQUEST_TIMEOUT"
    );

  const wakeBackend = async ({ maxMs = 45_000, visible = true } = {}) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (visible) {
        setHealthStatus({ state: "offline", attempt: 0, error: "" });
      }
      return false;
    }

    const seq = wakeSeqRef.current + 1;
    wakeSeqRef.current = seq;

    const deadline = Date.now() + Math.max(8000, maxMs);
    let attempt = 0;
    let lastError = "";

    while (Date.now() < deadline) {
      attempt += 1;
      if (visible) {
        setHealthStatus({ state: "checking", attempt, error: "" });
      }

      try {
        const payload = await fetchApiHealth({ timeoutMs: 12_000 });
        if (wakeSeqRef.current !== seq) {
          return false;
        }
        if (payload?.ok) {
          if (visible) {
            setHealthStatus({ state: "ok", attempt, error: "" });
          }
          return true;
        }
        lastError = "Health check returned an unexpected response.";
      } catch (error) {
        lastError = error?.message || "Cannot reach the server.";
      }

      if (wakeSeqRef.current !== seq) {
        return false;
      }
      if (visible) {
        setHealthStatus({ state: "checking", attempt, error: lastError });
      }
      await sleep(2500);
    }

    if (wakeSeqRef.current !== seq) {
      return false;
    }
    if (visible) {
      setHealthStatus({ state: "error", attempt, error: lastError || "Cannot reach the server." });
    }
    return false;
  };

  useEffect(() => {
    // Best-effort warmup so the auth request doesn't feel like it hangs on cold starts.
    void fetchApiHealth({ timeoutMs: 8000 }).catch(() => {});
  }, []);

  useEffect(() => {
    const syncPath = () => {
      setPublicPath(String(window.location.pathname || "").replace(/\/+$/, "") || "/");
    };

    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

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

  useEffect(() => {
    if (!isAuthRoute) {
      lastNonAuthPathRef.current = publicPath || "/";
      return;
    }

    setMode(publicPath === "/signup" ? "register" : "login");
    setAuthModalOpen(true);
    void wakeBackend({ visible: false });
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

  const runPrimaryAuthRequest = () =>
    mode === "register"
      ? registerUser({ name: name || "Trader", email, password })
      : loginUser({ email, password });

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

      const warmPromise = wakeBackend({ maxMs: 25_000, visible: false });
      let payload;

      try {
        payload = await runPrimaryAuthRequest();
      } catch (submitError) {
        if (!isWarmableNetworkError(submitError)) {
          throw submitError;
        }

        const woke = await warmPromise;
        if (!woke) {
          throw submitError;
        }

        payload = await runPrimaryAuthRequest();
      }

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
    const resolvedMode = nextMode === "register" ? "register" : "login";
    const nextPath = resolvedMode === "register" ? "/signup" : "/login";
    if (publicPath !== nextPath) {
      window.history.pushState({}, "", nextPath);
      setPublicPath(nextPath);
    }
    setMode(resolvedMode);
    setAuthModalOpen(true);
    void wakeBackend({ visible: false });
  };

  const closeAuth = () => {
    wakeSeqRef.current += 1;
    setAuthModalOpen(false);
    if (publicPath === "/login" || publicPath === "/signup") {
      const fallbackPath = lastNonAuthPathRef.current || "/";
      if (fallbackPath !== publicPath) {
        window.history.pushState({}, "", fallbackPath);
        setPublicPath(fallbackPath);
      }
    }
  };

  const navigatePublic = (nextPath) => {
    const normalizedPath = String(nextPath || "/").replace(/\/+$/, "") || "/";
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

  const handleSocialAuthPlaceholder = (provider) => {
    setError("");
    setMessage(`${provider} sign-in is coming soon. Use email and password for now.`);
  };

  const isFeaturesPage = publicPath === "/features";
  const isPrivacyPage = publicPath === "/privacy";
  const isTermsPage = publicPath === "/terms";
  const isContactPage = publicPath === "/contact";
  const isHomePage = !isFeaturesPage && !isPrivacyPage && !isTermsPage && !isContactPage;

  const landingHomeSections = (
    <>
      <section className="landing-home-hero landing-home-hero-compact reveal">
        <div className="landing-workstation-shell panel animate-riseIn">
          <div className="landing-workstation-brand">
            <div className="landing-workstation-brandlock">
              <BrandLogo className="brand-logo landing-workstation-logo" />
              <div>
                <strong>Journex</strong>
                <span>Trading Workstation</span>
              </div>
            </div>
            <button type="button" className="landing-home-topbar-cta" onClick={() => openAuth("register")}>
              Get started
            </button>
          </div>

          <div className="landing-workstation-grid">
            <div className="landing-workstation-story">
              <div className="landing-workstation-kicker">Professional trading journal</div>
              <h2 className="landing-workstation-title">Trade with more structure, review with more clarity.</h2>
              <p className="landing-workstation-text">
                Journex brings your trades, screenshots, notes, and coaching into one calm workspace built for serious review.
              </p>

              <div className="landing-workstation-featurelist">
                <article className="landing-workstation-feature">
                  <strong>Advanced analytics</strong>
                  <span>Track expectancy, win rate, drawdown, and the setups that actually work.</span>
                </article>
                <article className="landing-workstation-feature">
                  <strong>Risk discipline</strong>
                  <span>Keep account goals, funded rules, and trade limits in one control center.</span>
                </article>
                <article className="landing-workstation-feature">
                  <strong>Visual review</strong>
                  <span>Save screenshots and replay the trade story with context still attached.</span>
                </article>
              </div>
            </div>

            <div className="landing-workstation-access">
              <div className="landing-workstation-access-copy">
                <p className="landing-workstation-access-kicker">Workspace access</p>
                <h3>Ready to trade smarter?</h3>
                <p>Open your Journex workspace or create an account to start building a cleaner review process.</p>
              </div>

              <div className="landing-home-showcase-actions landing-workstation-actions">
                <button type="button" className="landing-home-showcase-btn landing-home-showcase-btn-primary" onClick={() => openAuth("register")}>
                  Get started
                </button>
                <button type="button" className="landing-home-showcase-btn landing-home-showcase-btn-secondary" onClick={() => openAuth("login")}>
                  Log in
                </button>
              </div>

              <div className="landing-workstation-metrics">
                <div className="landing-workstation-metric">
                  <span>Review flow</span>
                  <strong>Screenshots + notes + coaching</strong>
                </div>
                <div className="landing-workstation-metric">
                  <span>Risk center</span>
                  <strong>Account-aware tracking</strong>
                </div>
                <div className="landing-workstation-metric">
                  <span>Built for</span>
                  <strong>Forex, crypto, and funded traders</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-home-support panel animate-riseIn">
          <p className="landing-home-support-kicker">Inside the workstation</p>
          <div className="landing-home-support-grid">
            <article className="landing-home-support-item">
              <strong>Log clearly</strong>
              <span>Capture the trade, the screenshot, and the context without losing the workflow.</span>
            </article>
            <article className="landing-home-support-item">
              <strong>Review faster</strong>
              <span>Come back later with the full story still attached instead of relying on memory.</span>
            </article>
            <article className="landing-home-support-item">
              <strong>Improve steadily</strong>
              <span>Use playbooks, coaching, and risk controls to build a repeatable process.</span>
            </article>
          </div>
        </div>
      </section>
    </>
  );

  const featuresPageSections = (
    <>
      <section className="landing-features-page-hero reveal">
        <div className="landing-features-page-grid">
          <div className="landing-features-page-copy">
            <p className="landing-kicker">Product tour</p>
            <h3 className="landing-features-page-title">A complete review workflow built for traders who want more than a spreadsheet.</h3>
            <p className="landing-features-page-text">
              Journex is designed to capture the full trade story: the numbers, the screenshots, the behavior, and the
              patterns that matter when you sit down to review seriously.
            </p>

            <div className="landing-features-page-actions">
              <button type="button" className="btn-primary" onClick={() => openAuth("register")}>
                Get Started
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigatePublic("/")}>
                Back Home
              </button>
            </div>

            <div className="landing-features-page-highlights">
              <div>
                <span>Log clearly</span>
                <strong>Trade details stay connected.</strong>
              </div>
              <div>
                <span>Review visually</span>
                <strong>Screenshots and notes stay attached.</strong>
              </div>
              <div>
                <span>See patterns</span>
                <strong>Sessions and setups become easier to compare.</strong>
              </div>
            </div>
          </div>

          <div className="panel landing-features-page-surface">
            <div className="landing-features-page-surface-head">
              <div>
                <p className="landing-card-kicker">Inside the workspace</p>
                <h4>Built around review, not clutter</h4>
              </div>
              <span>Journex</span>
            </div>

            <div className="landing-features-page-surface-grid">
              <article className="landing-features-page-surface-card">
                <p className="landing-card-kicker">Trade capture</p>
                <strong>Entry, stop, target, exit, session, setup</strong>
              </article>
              <article className="landing-features-page-surface-card">
                <p className="landing-card-kicker">Visual replay</p>
                <strong>Before and after screenshots on the same trade</strong>
              </article>
              <article className="landing-features-page-surface-card">
                <p className="landing-card-kicker">Insight layer</p>
                <strong>Behavior notes and analytics in the same flow</strong>
              </article>
            </div>

            <div className="landing-features-page-trace">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section reveal">
        <div className="landing-section-title landing-features-page-titleblock">
          <p className="landing-kicker">Core features</p>
          <h3>The essentials you need to journal well without unnecessary complexity.</h3>
          <p>Everything here supports one job: making your trades easier to review honestly.</p>
        </div>

        <div className="landing-features-page-capability-grid">
          <article className="panel landing-features-page-capability">
            <span className="landing-features-page-capability-index">01</span>
            <h4>Structured trade entry</h4>
            <p>Capture pair, pricing, session, setup, notes, and screenshots in one place.</p>
          </article>
          <article className="panel landing-features-page-capability">
            <span className="landing-features-page-capability-index">02</span>
            <h4>Replay and review</h4>
            <p>Open past trades with their screenshots and notes still attached.</p>
          </article>
          <article className="panel landing-features-page-capability">
            <span className="landing-features-page-capability-index">03</span>
            <h4>Analytics and patterns</h4>
            <p>Track outcomes across setups, sessions, and behavior so useful patterns are easier to spot.</p>
          </article>
        </div>
      </section>

      <section className="landing-section reveal">
        <div className="landing-features-page-sequence">
          <div className="landing-features-page-sequence-copy">
            <p className="landing-kicker">Simple workflow</p>
            <h3>Log the trade, keep the context, come back and learn from it.</h3>
            <p>
              Journex is designed to stay out of the way while preserving the details you need later.
            </p>
          </div>

          <div className="landing-features-page-sequence-steps">
            <article className="panel landing-features-page-step">
              <span>1</span>
              <div>
                <h4>Record the trade</h4>
                <p>Save the numbers while the trade is still fresh.</p>
              </div>
            </article>
            <article className="panel landing-features-page-step">
              <span>2</span>
              <div>
                <h4>Attach the context</h4>
                <p>Add screenshots and notes that explain the decision.</p>
              </div>
            </article>
            <article className="panel landing-features-page-step">
              <span>3</span>
              <div>
                <h4>Review later</h4>
                <p>See what happened and what deserves repeating.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section reveal">
        <div className="panel landing-features-page-proof">
          <div className="landing-features-page-proof-copy">
            <p className="landing-kicker">Why it matters</p>
            <h3>Journex helps you turn stored trades into useful review habits.</h3>
            <p>
              The product is simple on purpose: enough structure to stay consistent, enough context to actually learn.
            </p>
          </div>

          <div className="landing-features-page-proof-points">
            <div>
              <span>Clarity</span>
              <strong>The important information stays together.</strong>
            </div>
            <div>
              <span>Consistency</span>
              <strong>Review becomes easier to maintain.</strong>
            </div>
            <div>
              <span>Focus</span>
              <strong>You can spend more time learning and less time organizing.</strong>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  const privacyPageSections = (
    <section className="landing-section landing-legal-section reveal">
      <div className="landing-section-title landing-utility-simple-title">
        <p className="landing-kicker">Privacy</p>
        <h3>How Journex handles your journal data</h3>
        <p>
          Journex stores account details, trades, screenshots, and review notes so your workspace stays synced,
          available, and useful when it is time to review.
        </p>
        <div className="landing-utility-actions">
          <button type="button" className="landing-utility-action-primary" onClick={() => navigatePublic("/")}>
            Back Home
          </button>
          <button type="button" className="landing-utility-action-secondary" onClick={() => navigatePublic("/features")}>
            View Features
          </button>
        </div>
      </div>
      <div className="landing-legal-grid">
        <article className="panel landing-legal-card">
          <h4>What we store</h4>
          <p>Account information, journal entries, screenshots, settings, and activity required to power analytics and review workflows.</p>
        </article>
        <article className="panel landing-legal-card">
          <h4>Why we store it</h4>
          <p>Your data is used to authenticate your workspace, sync trades, generate insights, and preserve your trading history across sessions.</p>
        </article>
        <article className="panel landing-legal-card">
          <h4>Your control</h4>
          <p>You can manage account preferences inside the app, and you can contact support if you need help with account access or data questions.</p>
        </article>
      </div>
    </section>
  );

  const termsPageSections = (
    <section className="landing-section landing-legal-section reveal">
      <div className="landing-section-title landing-utility-simple-title">
        <p className="landing-kicker">Terms</p>
        <h3>Using Journex responsibly</h3>
        <p>
          Journex is a journaling and analysis tool for traders. It is built to support review and organization, not to
          provide financial advice or trading guarantees.
        </p>
        <div className="landing-utility-actions">
          <button type="button" className="landing-utility-action-primary" onClick={() => navigatePublic("/")}>
            Back Home
          </button>
          <button type="button" className="landing-utility-action-secondary" onClick={() => navigatePublic("/features")}>
            View Features
          </button>
        </div>
      </div>
      <div className="landing-legal-grid">
        <article className="panel landing-legal-card">
          <h4>Platform use</h4>
          <p>Use the platform lawfully, keep your login secure, and avoid uploading content you do not have permission to store.</p>
        </article>
        <article className="panel landing-legal-card">
          <h4>Analytics and insights</h4>
          <p>Insights are informational and based on the journal data you provide. They are designed to support review, not replace decision-making.</p>
        </article>
        <article className="panel landing-legal-card">
          <h4>Availability</h4>
          <p>We aim to keep the service available and stable, but access may occasionally be interrupted by maintenance, updates, or infrastructure issues.</p>
        </article>
      </div>
    </section>
  );

  const contactPageSections = (
    <section className="landing-section landing-contact-section reveal">
      <div className="landing-section-title landing-utility-simple-title">
        <p className="landing-kicker">Contact</p>
        <h3>Get in touch with Journex</h3>
        <p>If you need help with access, product feedback, or setup questions, the details below will point you to the right place.</p>
        <div className="landing-utility-actions">
          <button type="button" className="landing-utility-action-primary" onClick={() => navigatePublic("/")}>
            Back Home
          </button>
          <button type="button" className="landing-utility-action-secondary" onClick={() => navigatePublic("/features")}>
            View Features
          </button>
        </div>
      </div>
      <div className="landing-contact-grid">
        <article className="panel landing-contact-card">
          <h4>Email support</h4>
          <p>support@journex.app</p>
          <small>Best for login help, account questions, and product support.</small>
        </article>
        <article className="panel landing-contact-card">
          <h4>Product feedback</h4>
          <p>feedback@journex.app</p>
          <small>Share feature ideas, workflow issues, and suggestions for future releases.</small>
        </article>
      </div>
    </section>
  );

  const publicSections = isFeaturesPage
    ? featuresPageSections
    : isPrivacyPage
      ? privacyPageSections
      : isTermsPage
        ? termsPageSections
        : isContactPage
          ? contactPageSections
          : landingHomeSections;

  const authPanelContent = (
    <>
      <div className="auth-modal-header auth-workstation-header">
        <div>
          <h3 className="auth-modal-title">{authTitle}</h3>
          <p className="auth-modal-subtitle">Enter your credentials to access your workspace</p>
        </div>
        {!isAuthRoute ? (
          <button type="button" className="btn-secondary auth-modal-close" onClick={closeAuth}>
            Close
          </button>
        ) : null}
      </div>

      {healthStatus.state === "checking" ? (
        <div className="auth-status-box mb-3">
          Waking up server... (attempt {healthStatus.attempt}){healthStatus.error ? `: ${healthStatus.error}` : ""}
        </div>
      ) : healthStatus.state === "error" ? (
        <div className="auth-status-box auth-status-box-error mb-3">
          <span>Backend unreachable: {healthStatus.error || "Check VITE_API_URL and backend status."}</span>
          <button type="button" className="btn-secondary auth-status-action" onClick={() => void wakeBackend()}>
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
          <div className="auth-modal-actions">
            <button className="btn-primary flex-1" type="submit" disabled={loading}>
              {loading ? "Checking..." : "Verify"}
            </button>
            <button
              type="button"
              className="btn-secondary"
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
          <div className="auth-modal-actions">
            <button className="btn-primary flex-1" type="submit" disabled={loading}>
              {loading ? "Please wait..." : "Update password"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setMode("login")}>
              Back
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handlePrimarySubmit} className="space-y-3">
          {mode === "register" ? (
            <label>
              <span className="label">Full Name</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="John Trader"
                required
              />
            </label>
          ) : null}
          <label>
            <span className="label">Email Address</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="trader@example.com"
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
              <span className="label">Confirm Password</span>
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
          {mode === "login" ? (
            <div className="auth-workstation-inline">
              <label className="auth-remember-row">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <button
                type="button"
                className="auth-workstation-link"
                onClick={handleResetRequest}
                disabled={loading}
              >
                Forgot password?
              </button>
            </div>
          ) : null}
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "register" ? "Create account" : "Sign In"}
          </button>
          <div className="auth-workstation-divider">
            <span>OR CONTINUE WITH</span>
          </div>
          <div className="auth-workstation-socials">
            <button
              type="button"
              className="btn-secondary auth-social-btn"
              onClick={() => handleSocialAuthPlaceholder("Google")}
              disabled={loading}
            >
              Google
            </button>
            <button
              type="button"
              className="btn-secondary auth-social-btn"
              onClick={() => handleSocialAuthPlaceholder("GitHub")}
              disabled={loading}
            >
              GitHub
            </button>
          </div>
          {!twoFactorPending && mode !== "reset" ? (
            <button
              type="button"
              className="auth-switch auth-switch-centered"
              onClick={() => openAuth(mode === "register" ? "login" : "register")}
            >
              {mode === "register" ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          ) : null}
          <p className="auth-workstation-terms">
            By continuing, you agree to our{" "}
            <button type="button" className="auth-workstation-link" onClick={() => navigatePublic("/terms")}>
              Terms of Service
            </button>{" "}
            and{" "}
            <button type="button" className="auth-workstation-link" onClick={() => navigatePublic("/privacy")}>
              Privacy Policy
            </button>
          </p>
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
    </>
  );

  if (isAuthRoute) {
    return (
      <main className="auth-workstation-page">
        <section className="auth-workstation-layout">
          <aside className="auth-workstation-side panel">
            <div className="auth-workstation-branding">
              <button type="button" className="landing-workstation-brandlock auth-workstation-brandlock" onClick={() => navigatePublic("/")}>
                <BrandLogo className="brand-logo landing-workstation-logo" />
                <div>
                  <strong>Journex</strong>
                  <span>Trading Workstation</span>
                </div>
              </button>
            </div>

            <div className="auth-workstation-benefits">
              <article className="auth-workstation-benefit">
                <strong>Advanced Analytics</strong>
                <span>Deep performance insights with win rate, profit factor, and edge analysis across all your trades.</span>
              </article>
              <article className="auth-workstation-benefit">
                <strong>Risk Management</strong>
                <span>Set account limits, max drawdown alerts, and daily loss thresholds to protect your capital.</span>
              </article>
              <article className="auth-workstation-benefit">
                <strong>Professional Grade</strong>
                <span>Built for serious traders who demand precision, speed, and institutional-quality tools.</span>
              </article>
            </div>

            <p className="auth-workstation-footnote">
              Join disciplined traders using Journex to review more clearly and perform more consistently.
            </p>
          </aside>

          <section className="auth-workstation-main">
            <div className="auth-workstation-card panel animate-riseIn">
              <div className="auth-workstation-mobile-brand">
                <BrandLogo className="brand-logo landing-workstation-logo" />
                <div>
                  <strong>Journex</strong>
                  <span>Trading Workstation</span>
                </div>
              </div>
              {authPanelContent}
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={`landing-page ${isHomePage ? "landing-page-home" : "landing-page-secondary"}`}>
      <div className={`landing-wrap ${isHomePage ? "landing-wrap-home" : "landing-wrap-features"}`}>
        {publicSections}

        <footer className="landing-footer">
          <div>
            <strong>Journex</strong>
            <p>Trading journal built for clarity.</p>
          </div>
          <div className="landing-footer-links">
            <button type="button" className="landing-link-button" onClick={() => navigatePublic("/features")}>
              Features
            </button>
            <button type="button" className="landing-link-button" onClick={() => navigatePublic("/privacy")}>
              Privacy
            </button>
            <button type="button" className="landing-link-button" onClick={() => navigatePublic("/terms")}>
              Terms
            </button>
            <button type="button" className="landing-link-button" onClick={() => navigatePublic("/contact")}>
              Contact
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
          onClick={closeAuth}
        >
          <aside className="panel animate-riseIn auth-modal-card" onClick={(event) => event.stopPropagation()}>
            {authPanelContent}
          </aside>
        </div>
      ) : null}
    </main>
  );
};

export default AuthPanel;

