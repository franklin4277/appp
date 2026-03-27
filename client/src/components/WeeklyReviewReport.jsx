import { useState } from "react";
import { fetchWeeklyReview } from "../api/tradesApi";

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
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

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

      {error ? <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
};

export default WeeklyReviewReport;
