import { memo, useMemo } from "react";
import SectionEmptyState from "./SectionEmptyState";

const getCellTone = (avgRR) => {
  if (avgRR >= 0.8) {
    return "rgba(86, 122, 176, 0.55)";
  }
  if (avgRR >= 0.3) {
    return "rgba(70, 97, 140, 0.45)";
  }
  if (avgRR > 0) {
    return "rgba(55, 76, 109, 0.35)";
  }
  if (avgRR < -0.5) {
    return "rgba(81, 104, 138, 0.2)";
  }
  return "rgba(35, 49, 72, 0.35)";
};

const HeatmapMatrix = ({ heatmap }) => {
  const sessions = heatmap?.sessions || [];
  const setupTypes = heatmap?.setupTypes || [];
  const cells = heatmap?.cells || [];

  if (!sessions.length || !setupTypes.length) {
    return (
      <SectionEmptyState
        title="Session x Setup Heatmap"
        message="Need trades across sessions and setups to build heatmap."
      />
    );
  }

  const cellMap = useMemo(() => {
    const map = new Map();
    cells.forEach((cell) => {
      map.set(`${cell.session}::${cell.setupType}`, cell);
    });
    return map;
  }, [cells]);

  const findCell = (session, setupType) =>
    cellMap.get(`${session}::${setupType}`) || {
      totalTrades: 0,
      winRate: 0,
      averageRR: 0,
    };

  return (
    <section className="panel animate-riseIn">
      <h3 className="mb-3 text-sm font-semibold">Session x Setup Heatmap</h3>
      <div className="overflow-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-textMuted">Session / Setup</th>
              {setupTypes.map((setupType) => (
                <th key={setupType} className="px-2 py-2 text-left text-textMuted">
                  {setupType}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session}>
                <td className="px-2 py-2 text-textMain">{session}</td>
                {setupTypes.map((setupType) => {
                  const cell = findCell(session, setupType);
                  return (
                    <td key={`${session}-${setupType}`} className="px-2 py-2">
                      <div
                        className="rounded-md border border-border p-2"
                        style={{ background: getCellTone(cell.averageRR) }}
                      >
                        <p className="text-textMain">{cell.totalTrades} trades</p>
                        <p className="text-textMuted">Win {cell.winRate}%</p>
                        <p className="text-textMuted">RR {cell.averageRR}</p>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default memo(HeatmapMatrix);
