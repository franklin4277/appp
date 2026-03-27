import { useCallback, useEffect, useState } from "react";
import {
  createWeeklyReviewShare,
  fetchWeeklyReview,
  listWeeklyReviewShares,
  revokeWeeklyReviewShare,
} from "../api/tradesApi";

const toCsvBlob = (review) => {
  const rows = [
    ["Period", `${review.periodStart} to ${review.periodEnd}`],
    ["Total Trades", review.summary.totalTrades],
    ["Win Rate", `${review.summary.winRate}%`],
    ["Net RR", review.summary.netRR],
    ["Average RR", review.summary.averageRR],
    ["Best Setup", review.summary.bestSetup.label],
    ["Best Setup Trades", review.summary.bestSetup.total],
    ["Best Setup Win Rate", `${review.summary.bestSetup.winRate}%`],
    ["Best Setup Avg RR", review.summary.bestSetup.averageRR],
    ["Biggest Mistake", review.summary.biggestMistake.label],
    ["Mistake Count", review.summary.biggestMistake.count],
    ["Top Emotion", review.summary.emotionPattern.label],
    ["Emotion Trades", review.summary.emotionPattern.total],
    ["Emotion Win Rate", `${review.summary.emotionPattern.winRate}%`],
    ["Emotion Avg RR", review.summary.emotionPattern.averageRR],
    ...review.summary.actionPlan.map((item, index) => [`Action Plan ${index + 1}`, item]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          if (/[",\n]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    )
    .join("\n");

  return new Blob([csv], { type: "text/csv;charset=utf-8;" });
};

const openPrintView = (review) => {
  const html = `
  <html>
    <head>
      <title>Weekly Trading Review</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
        h1 { margin: 0 0 8px; }
        h2 { margin: 18px 0 8px; font-size: 16px; }
        p { margin: 4px 0; }
        ul { margin: 8px 0 0 18px; }
      </style>
    </head>
    <body>
      <h1>Weekly Trading Review</h1>
      <p><strong>Period:</strong> ${review.periodStart} to ${review.periodEnd}</p>
      <p><strong>Total Trades:</strong> ${review.summary.totalTrades}</p>
      <p><strong>Win Rate:</strong> ${review.summary.winRate}%</p>
      <p><strong>Net RR:</strong> ${review.summary.netRR}</p>
      <p><strong>Average RR:</strong> ${review.summary.averageRR}</p>

      <h2>Best Setup</h2>
      <p>${review.summary.bestSetup.label}</p>
      <p>${review.summary.bestSetup.total} trades | ${review.summary.bestSetup.winRate}% win | RR ${review.summary.bestSetup.averageRR}</p>

      <h2>Biggest Mistake</h2>
      <p>${review.summary.biggestMistake.label} (${review.summary.biggestMistake.count})</p>

      <h2>Emotion Pattern</h2>
      <p>${review.summary.emotionPattern.label}</p>
      <p>${review.summary.emotionPattern.total} trades | ${review.summary.emotionPattern.winRate}% win | RR ${review.summary.emotionPattern.averageRR}</p>

      <h2>Action Plan</h2>
      <ul>${review.summary.actionPlan.map((item) => `<li>${item}</li>`).join("")}</ul>
    </body>
  </html>`;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

const WeeklyReviewReport = ({ token, profileId = "" }) => {
  const [busy, setBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shares, setShares] = useState([]);
  const [expiryDays, setExpiryDays] = useState("14");

  const loadReport = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetchWeeklyReview({ profileId }, token);
      setReport(response);
      return response;
    } catch (loadError) {
      setError(loadError.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = async () => {
    const review = report || (await loadReport());
    if (!review) {
      return;
    }

    const blob = toCsvBlob(review);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-review-${review.periodEnd || new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = async () => {
    const review = report || (await loadReport());
    if (!review) {
      return;
    }
    openPrintView(review);
  };

  const refreshShares = useCallback(async () => {
    setShareBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await listWeeklyReviewShares(token);
      setShares(payload.data || []);
    } catch (shareError) {
      setError(shareError.message);
    } finally {
      setShareBusy(false);
    }
  }, [token]);

  const handleCreateShare = async () => {
    setShareBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await createWeeklyReviewShare(token, {
        profileId,
        expiresInDays: Math.min(Math.max(Number(expiryDays) || 14, 1), 90),
      });
      setShareUrl(payload.shareUrl || "");
      setMessage("Read-only share link created.");
      await refreshShares();
    } catch (shareError) {
      setError(shareError.message);
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShare = async (shareId) => {
    if (!shareId) {
      return;
    }
    const shouldRevoke = window.confirm("Revoke this share link?");
    if (!shouldRevoke) {
      return;
    }

    setShareBusy(true);
    setError("");
    setMessage("");
    try {
      await revokeWeeklyReviewShare(token, shareId);
      setMessage("Share link revoked.");
      await refreshShares();
    } catch (shareError) {
      setError(shareError.message);
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Share link copied.");
    } catch {
      setError("Could not copy link automatically.");
    }
  };

  useEffect(() => {
    refreshShares();
  }, [refreshShares]);

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Weekly Review Export</h3>
        <span className="chip">{busy ? "Generating..." : "Summary"}</span>
      </div>

      <p className="text-sm text-textMuted">
        Export your weekly performance summary as CSV or print-friendly PDF.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={loadReport} disabled={busy}>
          Refresh weekly summary
        </button>
        <button type="button" className="chip text-textMain transition hover:border-accent" onClick={handleExportCsv} disabled={busy}>
          Export weekly CSV
        </button>
        <button type="button" className="chip text-textMain transition hover:border-accent" onClick={handlePrintPdf} disabled={busy}>
          Print to PDF
        </button>
        <button
          type="button"
          className="chip text-textMain transition hover:border-accent"
          onClick={handleCreateShare}
          disabled={shareBusy}
        >
          {shareBusy ? "Sharing..." : "Create read-only link"}
        </button>
        <input
          className="input !h-9 !w-28 text-xs"
          type="number"
          min="1"
          max="90"
          value={expiryDays}
          onChange={(event) => setExpiryDays(event.target.value)}
          aria-label="Share expiry in days"
          title="Share expiry in days"
        />
        <button
          type="button"
          className="chip text-textMain transition hover:border-accent"
          onClick={refreshShares}
          disabled={shareBusy}
        >
          {shareBusy ? "Loading..." : "View links"}
        </button>
      </div>

      {report ? (
        <div className="mt-3 rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
          <p>
            {report.periodStart} to {report.periodEnd} | {report.summary.totalTrades} trades | Win {report.summary.winRate}%
          </p>
          <p className="mt-1">Best setup: {report.summary.bestSetup.label}</p>
          <p className="mt-1">Biggest mistake: {report.summary.biggestMistake.label}</p>
          <p className="mt-1">Emotion edge: {report.summary.emotionPattern.label}</p>
        </div>
      ) : null}

      {shareUrl ? (
        <div className="mt-3 rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
          <p className="font-medium text-textMain">Latest share link</p>
          <p className="mt-1 break-all">{shareUrl}</p>
          <button
            type="button"
            className="chip mt-2 text-textMain transition hover:border-accent"
            onClick={copyShareLink}
          >
            Copy link
          </button>
        </div>
      ) : null}

      {shares.length ? (
        <div className="mt-3 rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
          <p className="font-medium text-textMain">Active shared reports</p>
          <div className="mt-2 space-y-2">
            {shares.map((share) => (
              <div key={share.id} className="rounded-md border border-border/70 p-2">
                <p className="text-textMain">{share.title || "Weekly report"}</p>
                <p className="text-xs">
                  {share.periodStart} to {share.periodEnd} | expires {share.expiresAt?.slice(0, 10)}
                </p>
                <button
                  type="button"
                  className="chip mt-2 text-textMain transition hover:border-danger"
                  onClick={() => handleRevokeShare(share.id)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 p-2 text-sm text-accent">{message}</p> : null}
    </section>
  );
};

export default WeeklyReviewReport;
