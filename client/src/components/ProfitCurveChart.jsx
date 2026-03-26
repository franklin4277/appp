const ProfitCurveChart = ({ points }) => {
  if (!points?.length) {
    return (
      <section className="panel animate-riseIn">
        <h3 className="mb-2 text-sm font-semibold">Profit Curve</h3>
        <p className="text-sm text-textMuted">No trades yet to build the curve.</p>
      </section>
    );
  }

  const width = 640;
  const height = 220;
  const padding = 20;
  const values = points.map((point) => point.cumulativeRR);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  const toPoint = (value, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / spread) * (height - padding * 2);
    return `${x},${y}`;
  };

  const polyline = points.map((point, index) => toPoint(point.cumulativeRR, index)).join(" ");

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Profit Curve (RR)</h3>
        <span className="chip">{points.length} points</span>
      </div>

      <svg className="h-56 w-full" viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#35506b"
          strokeWidth="1"
        />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#35506b" strokeWidth="1" />
        <polyline fill="none" stroke="#66d8b5" strokeWidth="2.5" points={polyline} />
        {points.map((point, index) => {
          const [x, y] = toPoint(point.cumulativeRR, index).split(",");
          return <circle key={`${point.date}-${index}`} cx={x} cy={y} r="2.5" fill="#66d8b5" />;
        })}
      </svg>

      <div className="mt-2 flex justify-between text-xs text-textMuted">
        <span>Min {min}</span>
        <span>Max {max}</span>
      </div>
    </section>
  );
};

export default ProfitCurveChart;
