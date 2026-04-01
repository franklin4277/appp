import { memo, useEffect, useMemo, useState } from "react";
import SectionEmptyState from "./SectionEmptyState";

const hasImage = (trade) =>
  Boolean(
    trade?.screenshots?.before ||
      trade?.screenshots?.after ||
      trade?.offlineMeta?.screenshotBeforeName ||
      trade?.offlineMeta?.screenshotAfterName
  );

const ScreenshotReplay = ({ trades = [], selectedTradeId = "", onSelectTrade } = {}) => {
  const imageTrades = useMemo(() => trades.filter(hasImage), [trades]);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    if (!selectedTradeId) {
      return;
    }
    const nextIndex = imageTrades.findIndex((item) => item?._id === selectedTradeId);
    if (nextIndex >= 0) {
      setIndex(nextIndex);
    }
  }, [imageTrades, selectedTradeId]);

  const trade = imageTrades[index] || null;
  if (!trade) {
    return (
      <SectionEmptyState
        title="Screenshot Replay"
        message="Add before/after screenshots to review execution side-by-side."
      />
    );
  }

  const beforeLabel = trade.screenshots?.before ? "Before chart" : trade.offlineMeta?.screenshotBeforeName || "Before";
  const afterLabel = trade.screenshots?.after ? "After chart" : trade.offlineMeta?.screenshotAfterName || "After";

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Screenshot Replay</h3>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className="chip text-textMain transition hover:border-accent"
            onClick={() => setIndex((prev) => Math.max(prev - 1, 0))}
            disabled={index === 0}
          >
            Prev
          </button>
          <span className="chip">
            {index + 1} / {imageTrades.length}
          </span>
          <button
            type="button"
            className="chip text-textMain transition hover:border-accent"
            onClick={() => setIndex((prev) => Math.min(prev + 1, imageTrades.length - 1))}
            disabled={index >= imageTrades.length - 1}
          >
            Next
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-textMuted">
        {trade.pair} | {trade.session} | {trade.setupType} | RR {trade.rrAchieved}
        {typeof onSelectTrade === "function" ? (
          <button
            type="button"
            className="ml-2 text-xs text-textMain underline underline-offset-2"
            onClick={() => onSelectTrade(trade)}
          >
            Open trade
          </button>
        ) : null}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <article className="rounded-md border border-border bg-panelMuted p-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-textMuted">{beforeLabel}</p>
          {trade.screenshots?.before ? (
            <button
              type="button"
              className="group relative h-52 w-full overflow-hidden rounded-md"
              onClick={() =>
                setLightbox({
                  src: trade.screenshots.before,
                  label: beforeLabel,
                })
              }
            >
              <img
                src={trade.screenshots.before}
                alt="Before trade chart"
                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                loading="lazy"
                decoding="async"
              />
              <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide text-white">
                Click to zoom
              </span>
            </button>
          ) : (
            <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-border text-xs text-textMuted">
              {trade.offlineMeta?.screenshotBeforeName
                ? `Queued file: ${trade.offlineMeta.screenshotBeforeName}`
                : "No before image"}
            </div>
          )}
          {trade.screenshots?.beforeNote ? (
            <p className="mt-2 text-xs text-textMuted">Note: {trade.screenshots.beforeNote}</p>
          ) : null}
        </article>

        <article className="rounded-md border border-border bg-panelMuted p-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-textMuted">{afterLabel}</p>
          {trade.screenshots?.after ? (
            <button
              type="button"
              className="group relative h-52 w-full overflow-hidden rounded-md"
              onClick={() =>
                setLightbox({
                  src: trade.screenshots.after,
                  label: afterLabel,
                })
              }
            >
              <img
                src={trade.screenshots.after}
                alt="After trade chart"
                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                loading="lazy"
                decoding="async"
              />
              <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide text-white">
                Click to zoom
              </span>
            </button>
          ) : (
            <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-border text-xs text-textMuted">
              {trade.offlineMeta?.screenshotAfterName
                ? `Queued file: ${trade.offlineMeta.screenshotAfterName}`
                : "No after image"}
            </div>
          )}
          {trade.screenshots?.afterNote ? (
            <p className="mt-2 text-xs text-textMuted">Note: {trade.screenshots.afterNote}</p>
          ) : null}
        </article>
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-h-full w-full max-w-5xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs text-white"
              onClick={() => setLightbox(null)}
            >
              Close
            </button>
            <img
              src={lightbox.src}
              alt={lightbox.label || "Screenshot preview"}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
            {lightbox.label ? (
              <p className="mt-2 text-center text-xs text-white/80">{lightbox.label}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default memo(ScreenshotReplay);
