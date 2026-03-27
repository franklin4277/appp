import { useMemo } from "react";
import SectionEmptyState from "./SectionEmptyState";

const downsampleSeries = (series = [], maxPoints = 220) => {
  if (series.length <= maxPoints) {
    return series;
  }

  const step = (series.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => series[Math.round(index * step)]);
};

const isCompactMobile = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(max-width: 768px)").matches;

const ProfitCurveChart = ({ points }) => {
  if (!points?.length) {
    return <SectionEmptyState title="Profit Curve" message="No trades yet to build the curve." />;
  }

  const sampled = useMemo(() => {
    const maxPoints = isCompactMobile() ? 120 : 240;
    return downsampleSeries(points, maxPoints);
  }, [points]);

  const width = 640;
  const height = 220;
  const padding = 20;
  const values = sampled.map((point) => point.cumulativeRR);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  const toPoint = (value, index) => {
    const x = padding + (index / Math.max(sampled.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / spread) * (height - padding * 2);
    return `${x},${y}`;
  };

  const polyline = sampled.map((point, index) => toPoint(point.cumulativeRR, index)).join(" ");
  const lastPoint = sampled[sampled.length - 1];
  const [lastX, lastY] = toPoint(lastPoint.cumulativeRR, sampled.length - 1).split(",");

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Profit Curve (RR)</h3>
        <span className="chip">
          {sampled.length}
          {sampled.length !== points.length ? ` of ${points.length}` : ""} points
        </span>
      </div>

      <svg className="h-52 w-full sm:h-56" viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#304463"
          strokeWidth="1"
        />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#304463" strokeWidth="1" />
        <polyline fill="none" stroke="#89a6ce" strokeWidth="2.5" points={polyline} />
        <circle cx={lastX} cy={lastY} r="3.2" fill="#d4e0f5" />
      </svg>

      <div className="mt-2 flex justify-between text-xs text-textMuted">
        <span>Min {min}</span>
        <span>Max {max}</span>
      </div>
    </section>
  );
};

export default ProfitCurveChart;
