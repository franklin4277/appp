import { useEffect, useMemo, useRef, useState } from "react";
import {
  confirmPasswordReset,
  fetchApiHealth,
  loginUser,
  registerUser,
  requestPasswordReset,
  verifyTwoFactorLogin,
} from "../api/tradesApi";

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
  const isPrivacyPage = publicPath === "/privacy";
  const isTermsPage = publicPath === "/terms";
  const isContactPage = publicPath === "/contact";
  const isHomePage = !isFeaturesPage && !isPrivacyPage && !isTermsPage && !isContactPage;

  const landingHomeSections = (
    <>
      <section className="landing-home-hero reveal">
        <div className="landing-home-grid">
          <div className="landing-home-copy animate-riseIn">
            <div className="landing-home-brandline">
              <div className="landing-home-brandmark" aria-hidden="true">
                <span />
              </div>
              <div className="landing-home-brandcopy">
                <p className="landing-home-brandname">Journex</p>
                <p className="landing-home-brandmeta">Trading journal for disciplined execution</p>
              </div>
            </div>

            <p className="landing-kicker landing-home-kicker">Structured review. Clearer decisions.</p>
            <h2 className="landing-home-title">The calm, professional workspace your trading review process has been missing.</h2>
            <p className="landing-home-text">
              Journex brings trade logging, screenshot review, behavioral notes, and analytics into one focused flow so
              you can review execution with less noise and more confidence.
            </p>

            <div className="landing-home-actions">
              <button type="button" className="btn-primary landing-home-primary" onClick={() => openAuth("register")}>
                Get Started
              </button>
              <button type="button" className="btn-secondary landing-home-secondary" onClick={() => navigatePublic("/features")}>
                View Features
              </button>
            </div>

            <div className="landing-home-signals">
              <article className="landing-home-signal panel">
                <span>One place for every trade</span>
                <strong>Entries, exits, notes, and screenshots stay connected.</strong>
              </article>
              <article className="landing-home-signal panel">
                <span>Made for deliberate review</span>
                <strong>See what happened, why it happened, and what to repeat.</strong>
              </article>
              <article className="landing-home-signal panel">
                <span>Built to grow with you</span>
                <strong>Flexible enough for edge review, behavior tracking, and future automation.</strong>
              </article>
            </div>
          </div>

          <div className="landing-home-visual animate-riseIn">
            <div className="landing-home-float landing-home-float-top">Screenshot replay ready</div>
            <div className="landing-home-float landing-home-float-bottom">Behavior patterns visible</div>

            <div className="landing-home-workspace panel reveal">
              <div className="landing-home-windowbar">
                <div className="landing-home-windowdots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <small>Journex workspace</small>
              </div>

              <div className="landing-home-metric-row">
                <article className="landing-home-metric-card">
                  <span>Trade log</span>
                  <strong>Structured and fast</strong>
                </article>
                <article className="landing-home-metric-card">
                  <span>Review flow</span>
                  <strong>Visual and contextual</strong>
                </article>
                <article className="landing-home-metric-card">
                  <span>Insights</span>
                  <strong>Behavior-first</strong>
                </article>
              </div>

              <div className="landing-home-chart-card">
                <div className="landing-home-chart-head">
                  <div>
                    <p className="landing-card-kicker">Performance rhythm</p>
                    <h3 className="landing-card-title">Clarity across sessions</h3>
                  </div>
                  <span className="landing-home-chart-tag">Review-ready</span>
                </div>

                <div className="landing-home-chart">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="landing-home-review-grid">
                <article className="landing-home-review-card">
                  <p className="landing-card-kicker">Replay</p>
                  <div className="landing-home-review-shot">
                    <span>Before screenshot</span>
                    <span>After screenshot</span>
                  </div>
                </article>
                <article className="landing-home-review-card">
                  <p className="landing-card-kicker">Execution notes</p>
                  <ul className="landing-home-note-list">
                    <li>Session tagged</li>
                    <li>Setup recorded</li>
                    <li>Behavior reviewed</li>
                  </ul>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-home-section reveal">
        <div className="landing-section-title landing-home-section-title">
          <p className="landing-kicker">Built for the review loop</p>
          <h3>Everything on the surface is designed to help you review with less friction.</h3>
          <p>
            Journex keeps the workflow simple: log the trade once, keep the visual context attached, and come back later
            with enough structure to learn from what actually happened.
          </p>
        </div>

        <div className="landing-home-pillars">
          <article className="panel landing-home-pillar">
            <span className="landing-home-pillar-index">01</span>
            <h4>Capture the full trade</h4>
            <p>Entry, exit, session, setup, notes, and screenshots stay in one place instead of being scattered.</p>
          </article>
          <article className="panel landing-home-pillar">
            <span className="landing-home-pillar-index">02</span>
            <h4>Review with context</h4>
            <p>Replay the trade later with the same visual evidence and notes that informed the original decision.</p>
          </article>
          <article className="panel landing-home-pillar">
            <span className="landing-home-pillar-index">03</span>
            <h4>Improve with patterns</h4>
            <p>Behavior tags, sessions, and setup tracking make it easier to notice what habits deserve more attention.</p>
          </article>
        </div>
      </section>

      <section className="landing-home-section reveal">
        <div className="landing-home-story">
          <div className="landing-home-story-copy">
            <p className="landing-kicker">What Journex feels like</p>
            <h3>Professional enough to trust, simple enough to use every day.</h3>
            <p>
              The landing experience now mirrors the product itself: structured, spacious, and built around focused review
              instead of flashy distraction.
            </p>
          </div>

          <div className="landing-home-bento">
            <article className="panel landing-home-bento-card landing-home-bento-card-large">
              <p className="landing-card-kicker">Workflow</p>
              <h4>From entry to replay in one continuous system</h4>
              <p>Log trades quickly, then revisit the same trade later with screenshots, notes, and context still intact.</p>
            </article>
            <article className="panel landing-home-bento-card">
              <p className="landing-card-kicker">Review</p>
              <h4>Visual context stays attached</h4>
              <p>Before and after screenshots remain part of the trade review instead of getting lost in separate folders.</p>
            </article>
            <article className="panel landing-home-bento-card">
              <p className="landing-card-kicker">Insight</p>
              <h4>Behavior is easier to spot</h4>
              <p>Sessions, setup tags, and disciplined note-taking make patterns easier to see over time.</p>
            </article>
            <article className="panel landing-home-bento-card">
              <p className="landing-card-kicker">Growth</p>
              <h4>Ready for deeper modules</h4>
              <p>Edge detection, automation, and richer analytics can fit into the same foundation without breaking the flow.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-home-section reveal">
        <div className="panel landing-home-endorsement">
          <div className="landing-home-endorsement-copy">
            <p className="landing-kicker">Why traders stay consistent</p>
            <h3>Journex makes good review habits feel lighter, faster, and easier to repeat.</h3>
            <p>
              When the workspace is calm and structured, it is easier to keep journaling, spot repeat behaviors, and
              build a process you can trust under pressure.
            </p>
          </div>

          <div className="landing-home-endorsement-points">
            <div>
              <span>Focused experience</span>
              <strong>Important actions and signals stay visible without visual overload.</strong>
            </div>
            <div>
              <span>Practical review</span>
              <strong>The product helps you move from raw trades to usable lessons more naturally.</strong>
            </div>
            <div>
              <span>Room to grow</span>
              <strong>As your process matures, Journex can support deeper analytics and edge-focused review.</strong>
            </div>
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

  const privacyPageSections = (
    <section className="landing-section landing-legal-section reveal">
      <div className="landing-section-title">
        <p className="landing-kicker">Privacy</p>
        <h3>How Journex handles your data</h3>
        <p>Journex stores account details, trade records, screenshots, and review notes only to deliver your journal experience and keep your workspace synced.</p>
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
      <div className="landing-section-title">
        <p className="landing-kicker">Terms</p>
        <h3>Using Journex responsibly</h3>
        <p>Journex is a journaling and analysis tool for traders. It does not provide financial advice, guarantees, or trade execution outcomes.</p>
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
      <div className="landing-section-title">
        <p className="landing-kicker">Contact</p>
        <h3>Get in touch with Journex</h3>
        <p>If you need help with access, product feedback, or setup questions, use the details below and we will point you in the right direction.</p>
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

