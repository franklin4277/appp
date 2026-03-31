import { useEffect, useMemo, useState } from "react";
import {
  confirmPasswordReset,
  loginUser,
  registerUser,
  requestPasswordReset,
  verifyTwoFactorLogin,
} from "../api/tradesApi";
import BrandLogo from "./BrandLogo";
import ThemeToggle from "./ThemeToggle";
import { applyTheme, resolveInitialTheme } from "../utils/theme";

const marketingFeatures = [
  {
    icon: "journal",
    title: "Trade Logging",
    text: "Log complete trades in under 60 seconds with screenshots, RR, and context notes.",
  },
  {
    icon: "behavior",
    title: "Smart Analytics",
    text: "Get clean dashboards for expectancy, drawdown, equity curve, and setup quality.",
  },
  {
    icon: "behavior",
    title: "Behavior Tracking",
    text: "Track FOMO, revenge, and discipline drift so you can fix costly habits faster.",
  },
  {
    icon: "session",
    title: "Session Performance (Asia/London/NY)",
    text: "Identify your strongest session and focus where your edge is statistically proven.",
  },
];

const workflowSteps = [
  "Log trade details and screenshots immediately after execution.",
  "Review setup tags and behavior feedback to confirm rule alignment.",
  "Use analytics to double down on A+ setups and cut low-quality entries.",
];

const testimonials = [
  {
    quote: "Built for serious traders. It finally feels like a real trading operating system.",
    author: "Nicolas T.",
    role: "Full-time FX Trader",
  },
  {
    quote: "I can now see exactly when my edge appears and when my behavior slips.",
    author: "Samuel K.",
    role: "Intraday FX Trader",
  },
  {
    quote: "Journaling went from a chore to a process I actually want to keep doing daily.",
    author: "Nadia M.",
    role: "Prop Firm Candidate",
  },
];

const heroStats = [
  { label: "Avg win rate", value: "68%" },
  { label: "Avg R:R", value: "2.4x" },
  { label: "Trades logged", value: "10k+" },
];

const FeatureIcon = ({ type = "journal" }) => {
  if (type === "behavior") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M4 18h16M6 14h12M8 10h8M10 6h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "session") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          d="M4 18h16M7 18V9m5 9V6m5 12v-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M6 4h12a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 4h6M9 11h6M9 14h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
};

const AuthPanel = ({ onAuthenticated }) => {
  const showDebugSecrets = Boolean(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEBUG_AUTH_SECRETS === "true");
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
  const [theme, setTheme] = useState(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const authTitle = useMemo(() => {
    if (twoFactorPending) {
      return "Two-factor verification";
    }
    if (mode === "reset") {
      return "Reset password";
    }
    return mode === "register" ? "Create account" : "Log in";
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
    <main className="app-shell mx-auto min-h-screen w-full max-w-[1600px] p-0 sm:p-4">
      <section className="journal-shell app-journal w-full p-0 sm:p-4 md:p-6">
        <header className="landing-navbar">
          <div className="brand-block">
            <BrandLogo />
            <div>
              <p className="section-kicker">Trading Journal Platform</p>
              <h1 className="brand-title">The Trading Journal</h1>
            </div>
          </div>
          <nav className="hidden items-center gap-3 text-sm text-textMuted md:flex">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#testimonials">Testimonials</a>
            <a href="#footer">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))} />
            <button type="button" className="btn-primary !py-1.5" onClick={() => setMode("login")}>
              Get Started
            </button>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-4">
            <div className="panel animate-riseIn landing-hero">
              <div className="flex flex-wrap items-center gap-2">
                <p className="section-kicker">Built for serious traders</p>
                <span className="free-badge">Free forever</span>
              </div>
              <h2 className="hero-title mt-2">Turn Your Trading Data Into Consistent Profit</h2>
              <p className="mt-3 max-w-2xl text-sm text-textMuted">
                Track, analyze, and improve your trading with powerful insights, not spreadsheets.
                No subscriptions and no locked analytics.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => setMode("register")}>
                  Start Free
                </button>
                <button type="button" className="chip text-textMain" onClick={() => setMode("login")}>
                  Sign In
                </button>
              </div>
              <div className="landing-stats mt-5">
                {heroStats.map((item) => (
                  <div key={item.label} className="landing-stat">
                    <p className="landing-stat-value">{item.value}</p>
                    <p className="landing-stat-label">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <section id="features" className="panel animate-riseIn space-y-3">
              <div className="section-title">
                <h3>Features</h3>
                <p>Built for real execution</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {marketingFeatures.map((feature) => (
                  <article key={feature.title} className="soft-frame">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent/45 bg-accent/15 text-accent">
                      <FeatureIcon type={feature.icon} />
                    </span>
                    <h4 className="mt-2 text-sm font-semibold">{feature.title}</h4>
                    <p className="mt-2 text-xs text-textMuted">{feature.text}</p>
                  </article>
                ))}
              </div>
            </section>

            <section id="how-it-works" className="panel animate-riseIn space-y-3">
              <div className="section-title">
                <h3>How It Works</h3>
                <p>Simple 3-step flow</p>
              </div>
              <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {workflowSteps.map((step, index) => (
                  <li key={step} className="soft-frame text-sm text-textMuted">
                    <p className="text-xs font-semibold text-accent">Step {index + 1}</p>
                    <p className="mt-1">{step}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section id="testimonials" className="panel animate-riseIn space-y-3">
              <div className="section-title">
                <h3>Testimonials</h3>
                <p>Trusted by active traders</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {testimonials.map((item) => (
                  <blockquote key={item.author} className="soft-frame">
                    <p className="text-sm text-textMain">"{item.quote}"</p>
                    <footer className="mt-2 text-xs text-textMuted">
                      {item.author} - {item.role}
                    </footer>
                  </blockquote>
                ))}
              </div>
            </section>

            <footer id="footer" className="panel animate-riseIn">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-textMuted">(c) {new Date().getFullYear()} The Trading Journal</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <a className="chip text-textMain" href="#features">
                    Features
                  </a>
                  <a className="chip text-textMain" href="#how-it-works">
                    How it works
                  </a>
                  <a className="chip text-textMain" href="#testimonials">
                    Testimonials
                  </a>
                </div>
              </div>
            </footer>
          </section>

          <aside className="panel animate-riseIn auth-card-shell">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{authTitle}</h3>
              {!twoFactorPending && mode !== "reset" ? (
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-accent"
                  onClick={() => setMode((prev) => (prev === "register" ? "login" : "register"))}
                >
                  {mode === "register" ? "Have account?" : "Create account"}
                </button>
              ) : null}
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
      </section>
    </main>
  );
};

export default AuthPanel;
