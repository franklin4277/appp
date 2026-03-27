import { useState } from "react";
import { loginUser, registerUser } from "../api/tradesApi";

const AuthPanel = ({ onAuthenticated }) => {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload =
        mode === "register"
          ? await registerUser({ name: name || "Trader", email, password })
          : await loginUser({ email, password });

      onAuthenticated(payload);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-4">
      <section className="journal-shell w-full max-w-4xl p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <aside className="panel animate-riseIn">
            <p className="section-kicker">Welcome Back</p>
            <h1 className="hero-title mt-1">The Trading Journal</h1>
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

          <form onSubmit={handleSubmit} className="panel animate-riseIn space-y-3">
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

          {error ? <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}

          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "register" ? "Create account" : "Log in"}
          </button>
          </form>
        </div>
      </section>
    </main>
  );
};

export default AuthPanel;
