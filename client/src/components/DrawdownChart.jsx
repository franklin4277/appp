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

const DrawdownChart = ({ points = [] }) => {
  if (!points.length) {
    return <SectionEmptyState title="Drawdown Curve" message="Need more trades to calculate drawdown." />;
  }

  const sampled = useMemo(() => {
    const maxPoints = isCompactMobile() ? 120 : 240;
    return downsampleSeries(points, maxPoints);
  }, [points]);

  const width = 640;
  const height = 200;
  const padding = 20;
  const values = sampled.map((point) => point.drawdownRR);
  const min = Math.min(...values, -0.01);
  const max = Math.max(...values, 0);
  const spread = max - min || 1;

  const toPoint = (value, index) => {
    const x = padding + (index / Math.max(sampled.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / spread) * (height - padding * 2);
    return `${x},${y}`;
  };

  const polyline = sampled.map((point, index) => toPoint(point.drawdownRR, index)).join(" ");
  const worst = Math.min(...values);

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Drawdown Curve (RR)</h3>
        <span className="chip">Worst {worst}</span>
      </div>
      <svg className="h-44 w-full sm:h-48" viewBox={`0 0 ${width} ${height}`}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#304463" />
        <polyline fill="none" stroke="#d7898f" strokeWidth="2.2" points={polyline} />
      </svg>
      <p className="mt-2 text-xs text-textMuted">Closer to 0 is healthier. Deeper negatives indicate larger drawdowns.</p>
    </section>
  );
};

export default DrawdownChart;
