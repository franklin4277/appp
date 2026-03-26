import { PAIRS, SESSIONS, SETUP_TYPES } from "../utils/options";

const FiltersBar = ({ filters, onChange }) => {
  const handleReset = () => {
    onChange("pair", "");
    onChange("session", "");
    onChange("setupType", "");
    onChange("cleanOnly", false);
  };

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Filters</h2>
        <div className="flex items-center gap-2">
          <span className="chip">Live analytics</span>
          <button
            type="button"
            className="chip text-textMain transition hover:border-accent"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="label">Pair</span>
          <div>
            <input
              className="input"
              list="filter-pairs"
              value={filters.pair}
              onChange={(event) => onChange("pair", event.target.value)}
              placeholder="Type or pick a pair"
            />
            <datalist id="filter-pairs">
              {PAIRS.map((pair) => (
                <option key={pair} value={pair} />
              ))}
            </datalist>
          </div>
        </label>

        <label>
          <span className="label">Session</span>
          <div>
            <input
              className="input"
              list="filter-sessions"
              value={filters.session}
              onChange={(event) => onChange("session", event.target.value)}
              placeholder="Type session"
            />
            <datalist id="filter-sessions">
              {SESSIONS.map((session) => (
                <option key={session} value={session} />
              ))}
            </datalist>
          </div>
        </label>

        <label>
          <span className="label">Setup Type</span>
          <div>
            <input
              className="input"
              list="filter-setups"
              value={filters.setupType}
              onChange={(event) => onChange("setupType", event.target.value)}
              placeholder="Type setup"
            />
            <datalist id="filter-setups">
              {SETUP_TYPES.map((setupType) => (
                <option key={setupType} value={setupType} />
              ))}
            </datalist>
          </div>
        </label>

        <label className="flex min-h-[72px] items-center rounded-md border border-border bg-panelMuted px-3 text-sm text-textMain">
          <input
            type="checkbox"
            className="mr-2"
            checked={filters.cleanOnly}
            onChange={(event) => onChange("cleanOnly", event.target.checked)}
          />
          A+ setups only
        </label>
      </div>
    </section>
  );
};

export default FiltersBar;
