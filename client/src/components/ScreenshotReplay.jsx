import { memo, useMemo, useState } from "react";
import SectionEmptyState from "./SectionEmptyState";

const hasImage = (trade) =>
  Boolean(
    trade?.screenshots?.before ||
      trade?.screenshots?.after ||
      trade?.offlineMeta?.screenshotBeforeName ||
      trade?.offlineMeta?.screenshotAfterName
  );

const ScreenshotReplay = ({ trades = [] }) => {
  const imageTrades = useMemo(() => trades.filter(hasImage), [trades]);
  const [index, setIndex] = useState(0);

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
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <article className="rounded-md border border-border bg-panelMuted p-2">
          <p className="mb-1 text-xs uppercase tracking-wide text-textMuted">{beforeLabel}</p>
          {trade.screenshots?.before ? (
            <img
              src={trade.screenshots.before}
              alt="Before trade chart"
              className="h-52 w-full rounded-md object-cover"
              loading="lazy"
              decoding="async"
            />
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
            <img
              src={trade.screenshots.after}
              alt="After trade chart"
              className="h-52 w-full rounded-md object-cover"
              loading="lazy"
              decoding="async"
            />
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
    </section>
  );
};

export default memo(ScreenshotReplay);
