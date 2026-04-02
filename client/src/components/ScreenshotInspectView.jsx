import { useEffect, useMemo, useState } from "react";
import { fetchTradeById } from "../api/tradesApi";
import { PAGE_STORAGE_KEY } from "../utils/appNavigation";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const ScreenshotInspectView = ({ tradeId = "", token = "" }) => {
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [fillMode, setFillMode] = useState("fit");

  const [selectedSlot, setSelectedSlot] = useState(() => {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("slot") === "after" ? "after" : "before";
  });

  useEffect(() => {
    if (!tradeId || !token) {
      setLoading(false);
      setError("Missing trade or session.");
      return;
    }

    let mounted = true;
    setLoading(true);
    setError("");

    fetchTradeById(tradeId, token)
      .then((response) => {
        if (!mounted) return;
        setTrade(response || null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Could not load trade.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [tradeId, token]);

  const imageUrl = useMemo(() => {
    if (!trade) return "";
    return selectedSlot === "after" ? trade.screenshots?.after : trade.screenshots?.before;
  }, [selectedSlot, trade]);

  const hasBefore = Boolean(trade?.screenshots?.before);
  const hasAfter = Boolean(trade?.screenshots?.after);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
  };

  useEffect(() => {
    resetView();
  }, [selectedSlot, imageUrl]);

  const handleZoom = (delta) => {
    setZoom((prev) => clamp(prev + delta, 1, 4));
  };

  const handleWheel = (event) => {
    event.preventDefault();
    handleZoom(event.deltaY > 0 ? -0.2 : 0.2);
  };

  const handlePointerDown = (event) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.dataset.lastX = String(event.clientX);
    event.currentTarget.dataset.lastY = String(event.clientY);
  };

  const handlePointerMove = (event) => {
    if (!isDragging) return;
    const lastX = Number(event.currentTarget.dataset.lastX || 0);
    const lastY = Number(event.currentTarget.dataset.lastY || 0);
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    event.currentTarget.dataset.lastX = String(event.clientX);
    event.currentTarget.dataset.lastY = String(event.clientY);
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handlePointerUp = (event) => {
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const goBack = () => {
    localStorage.setItem(PAGE_STORAGE_KEY, "review");
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo(0, 0);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] bg-background">
        <main className="mx-auto flex min-h-screen w-full max-w-[720px] items-center justify-center p-4">
          <section className="panel text-sm text-textMuted">Loading screenshot...</section>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] bg-background">
        <main className="mx-auto flex min-h-screen w-full max-w-[720px] items-center justify-center p-4">
          <section className="panel text-sm text-danger">{error}</section>
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-background overflow-auto">
      <main className="min-h-screen w-full p-4">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Screenshot Inspect</h2>
            <p className="text-xs text-textMuted">
              {trade?.pair} | {trade?.session} | {trade?.setupType}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={goBack}>
              Return to Review
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className={`chip ${selectedSlot === "before" ? "border-accent text-textMain" : "text-textMuted"}`}
              onClick={() => setSelectedSlot("before")}
              disabled={!hasBefore}
            >
              Before
            </button>
            <button
              type="button"
              className={`chip ${selectedSlot === "after" ? "border-accent text-textMain" : "text-textMuted"}`}
              onClick={() => setSelectedSlot("after")}
              disabled={!hasAfter}
            >
              After
            </button>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className="rounded-full border border-border bg-panelMuted px-3 py-1 text-xs text-textMain"
              onClick={() => {
                if (hasBefore) setSelectedSlot("before");
              }}
              disabled={!hasBefore}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded-full border border-border bg-panelMuted px-3 py-1 text-xs text-textMain"
              onClick={() => {
                if (hasAfter) setSelectedSlot("after");
              }}
              disabled={!hasAfter}
            >
              Next
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className="rounded-full border border-border bg-panelMuted px-3 py-1 text-xs text-textMain"
              onClick={() => setFillMode((prev) => (prev === "fit" ? "fill" : "fit"))}
            >
              {fillMode === "fit" ? "Fill screen" : "Fit screen"}
            </button>
            <button
              type="button"
              className="rounded-full border border-border bg-panelMuted px-3 py-1 text-xs text-textMain"
              onClick={() => handleZoom(-0.25)}
            >
              Zoom -
            </button>
            <button
              type="button"
              className="rounded-full border border-border bg-panelMuted px-3 py-1 text-xs text-textMain"
              onClick={resetView}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-full border border-border bg-panelMuted px-3 py-1 text-xs text-textMain"
              onClick={() => handleZoom(0.25)}
            >
              Zoom +
            </button>
          </div>
        </div>

        <div
          className={`relative flex h-[82vh] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-panelMuted ${
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
              resetView();
            }
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${selectedSlot} screenshot`}
              className={`h-full w-full max-w-none select-none ${
                fillMode === "fill" ? "object-cover" : "object-contain"
              }`}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              decoding="async"
              fetchPriority="high"
              draggable="false"
            />
          ) : (
            <p className="text-sm text-textMuted">No screenshot available for this slot.</p>
          )}
        </div>
      </section>
    </main>
    </div>
  );
};

export default ScreenshotInspectView;
