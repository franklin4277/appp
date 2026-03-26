import { useState } from "react";
import { exportTradesCsv, importTradesCsv } from "../api/tradesApi";

const DataTools = ({ token, filters, onImported }) => {
  const [importFile, setImportFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleExport = async () => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const blob = await exportTradesCsv(filters, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `trading-journal-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("CSV export downloaded.");
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await importTradesCsv(importFile, token);
      setMessage(
        `Import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.totalRows} rows scanned.`
      );
      setImportFile(null);
      onImported();
    } catch (importError) {
      setError(importError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel animate-riseIn">
      <h3 className="mb-3 text-sm font-semibold">Data Tools</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-panelMuted p-3">
          <p className="text-xs uppercase tracking-wide text-textMuted">Export</p>
          <p className="mt-1 text-sm text-textMuted">Download trades as CSV for backup and external analysis.</p>
          <button type="button" className="btn-primary mt-3" onClick={handleExport} disabled={busy}>
            Export CSV
          </button>
        </div>

        <div className="rounded-md border border-border bg-panelMuted p-3">
          <p className="text-xs uppercase tracking-wide text-textMuted">Import</p>
          <p className="mt-1 text-sm text-textMuted">Upload CSV to restore or merge trade history.</p>
          <input
            className="input mt-3"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setImportFile(event.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="btn-primary mt-2"
            onClick={handleImport}
            disabled={!importFile || busy}
          >
            Import CSV
          </button>
        </div>
      </div>

      {message ? <p className="mt-3 rounded-md border border-border bg-panelMuted p-2 text-sm text-textMain">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
};

export default DataTools;

