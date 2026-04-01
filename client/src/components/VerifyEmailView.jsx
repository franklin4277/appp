import { useEffect, useMemo, useState } from "react";
import { verifyEmailToken } from "../api/tradesApi";
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

const VerifyEmailView = ({ token = "" }) => {
  const trimmedToken = useMemo(() => String(token || "").trim(), [token]);
  const [loading, setLoading] = useState(() => Boolean(trimmedToken));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    stripTokenFromUrl();
  }, []);

  useEffect(() => {
    if (!trimmedToken) {
      setLoading(false);
      setError("Verification token is missing.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setMessage("");

    verifyEmailToken({ token: trimmedToken })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setMessage(payload.message || "Email verified.");
      })
      .catch((requestError) => {
        if (cancelled) {
          return;
        }
        setError(requestError.message || "Email verification failed.");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trimmedToken]);

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
              <h2 className="landing-hero-title !text-[clamp(1.8rem,4vw,2.6rem)]">Verify email</h2>
              <p className="landing-hero-copy mt-3 !mx-0 !max-w-none">
                {loading ? "Verifying your email address..." : "Email verification status:"}
              </p>

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

              <div className="mt-6 flex flex-wrap gap-2">
                <button type="button" className="btn-primary min-w-[210px]" onClick={() => window.location.assign("/")}>
                  Continue
                </button>
              </div>
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

export default VerifyEmailView;

