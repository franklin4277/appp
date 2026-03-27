import { useMemo, useState } from "react";

const monthStart = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
const monthEnd = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));

const dayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
};

const sessionHeatTone = (value) => {
  if (value >= 1.2) {
    return "rgba(86, 122, 176, 0.58)";
  }
  if (value >= 0.4) {
    return "rgba(72, 101, 145, 0.5)";
  }
  if (value > 0) {
    return "rgba(56, 79, 115, 0.44)";
  }
  if (value <= -1) {
    return "rgba(69, 83, 108, 0.22)";
  }
  return "rgba(35, 49, 72, 0.38)";
};

const buildMonthCells = (monthDate) => {
  const start = monthStart(monthDate);
  const end = monthEnd(monthDate);
  const firstWeekday = (start.getUTCDay() + 6) % 7;
  const totalDays = end.getUTCDate();

  const cells = [];
  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day)));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const CalendarConsistency = ({ trades = [] }) => {
  const [monthCursor, setMonthCursor] = useState(() => monthStart(new Date()));

  const dailyMap = useMemo(() => {
    const map = new Map();
    trades.forEach((trade) => {
      const key = dayKey(trade.tradeDate);
      if (!key) {
        return;
      }

      const entry = map.get(key) || { trades: 0, rr: 0, wins: 0 };
      entry.trades += 1;
      entry.rr += Number(trade.rrAchieved || 0);
      if (trade.result === "Win") {
        entry.wins += 1;
      }
      map.set(key, entry);
    });
    return map;
  }, [trades]);

  const sessionMap = useMemo(() => {
    const bucket = new Map();
    trades.forEach((trade) => {
      const session = String(trade.session || "Unknown");
      const stat = bucket.get(session) || { total: 0, rr: 0 };
      stat.total += 1;
      stat.rr += Number(trade.rrAchieved || 0);
      bucket.set(session, stat);
    });

    return [...bucket.entries()]
      .map(([session, stat]) => ({
        session,
        total: stat.total,
        avgRR: stat.total ? Math.round((stat.rr / stat.total) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.avgRR - a.avgRR);
  }, [trades]);

  const cells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  const monthLabel = monthCursor.toLocaleString([], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Consistency Calendar</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="chip text-textMain transition hover:border-accent"
            onClick={() =>
              setMonthCursor((prev) => monthStart(new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1))))
            }
          >
            Prev
          </button>
          <span className="chip">{monthLabel}</span>
          <button
            type="button"
            className="chip text-textMain transition hover:border-accent"
            onClick={() =>
              setMonthCursor((prev) => monthStart(new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1))))
            }
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-textMuted">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="rounded-md border border-border bg-panelMuted py-1">
            {day}
          </div>
        ))}

        {cells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="rounded-md border border-border/40 bg-panel/40 py-4" />;
          }

          const key = dayKey(date);
          const daily = dailyMap.get(key) || { trades: 0, rr: 0, wins: 0 };
          const rr = Math.round(daily.rr * 100) / 100;
          return (
            <div
              key={key}
              className="rounded-md border border-border px-1 py-1 text-left"
              style={{ background: sessionHeatTone(rr) }}
            >
              <p className="text-[11px] text-textMain">{date.getUTCDate()}</p>
              <p className="text-[10px] text-textMuted">{daily.trades}t</p>
              <p className="text-[10px] text-textMuted">RR {rr}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        {sessionMap.length ? (
          sessionMap.map((item) => (
            <div key={item.session} className="rounded-md border border-border bg-panelMuted px-3 py-2 text-xs">
              <p className="text-textMain">{item.session}</p>
              <p className="text-textMuted">
                {item.total} trades | Avg RR {item.avgRR}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-border bg-panelMuted p-2 text-xs text-textMuted md:col-span-3">
            Add trades to unlock calendar and session consistency.
          </p>
        )}
      </div>
    </section>
  );
};

export default CalendarConsistency;
