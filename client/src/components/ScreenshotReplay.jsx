import { memo, useEffect, useMemo, useRef, useState } from "react";
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const closeButtonRef = useRef(null);
  const overlayRef = useRef(null);
  const lastFocused = useRef(null);

  useEffect(() => {
    if (!selectedTradeId) {
      return;
    }
    const nextIndex = imageTrades.findIndex((item) => item?._id === selectedTradeId);
    if (nextIndex >= 0) {
      setIndex(nextIndex);
    }
  }, [imageTrades, selectedTradeId]);

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    lastFocused.current = document.activeElement;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [lightbox]);

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setLightbox(null);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((prev) => Math.min(prev + 0.25, 4));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((prev) => Math.max(prev - 0.25, 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((prev) => Math.min(prev + 1, imageTrades.length - 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Tab") {
        const focusable = overlayRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || !focusable.length) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (lastFocused.current && typeof lastFocused.current.focus === "function") {
        lastFocused.current.focus();
      }
    };
  }, [imageTrades.length, lightbox]);

  const handleZoom = (delta) => {
    setZoom((prev) => {
      const next = Math.min(Math.max(prev + delta, 1), 4);
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleWheel = (event) => {
    if (!lightbox) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.2 : 0.2;
    handleZoom(delta);
  };

  const handlePointerDown = (event) => {
    if (zoom <= 1) {
      return;
    }
    setIsDragging(true);
    lastPoint.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event) => {
    if (!isDragging) {
      return;
    }
    const dx = event.clientX - lastPoint.current.x;
    const dy = event.clientY - lastPoint.current.y;
    lastPoint.current = { x: event.clientX, y: event.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

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
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
          ref={overlayRef}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-lg bg-black/40 p-2"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/90">
              <span>{lightbox.label || "Screenshot preview"}</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs text-white"
                  onClick={() => handleZoom(-0.25)}
                >
                  Zoom -
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs text-white"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs text-white"
                  onClick={() => handleZoom(0.25)}
                >
                  Zoom +
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/70 bg-white text-xs font-semibold text-black"
                  onClick={() => setLightbox(null)}
                >
                  Exit
                </button>
              </div>
            </div>
            <button
              type="button"
              className="sticky left-full top-2 z-10 mb-2 -mr-2 inline-flex rounded-full border border-white/40 bg-black/80 px-3 py-1 text-xs text-white"
              onClick={() => setLightbox(null)}
              ref={closeButtonRef}
            >
              Close
            </button>
            <div
              className={`relative flex aspect-square w-full max-w-[90vh] items-center justify-center overflow-hidden rounded-lg bg-black/60 ${
                zoom > 1 ? "cursor-grab" : "cursor-zoom-in"
              } ${isDragging ? "cursor-grabbing" : ""}`}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onDoubleClick={() => {
                if (zoom === 1) {
                  setZoom(2);
                } else {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }
              }}
            >
              <img
                src={lightbox.src}
                alt={lightbox.label || "Screenshot preview"}
                className="h-full w-full max-w-none select-none object-contain"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                decoding="async"
                fetchPriority="high"
                draggable="false"
              />
            </div>
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
