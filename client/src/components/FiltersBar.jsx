import { PAIRS, SESSIONS, SETUP_TYPES } from "../utils/options";

const FiltersBar = ({ filters, onChange, options = {} }) => {
  const pairs = options.pairs?.length ? options.pairs : PAIRS;
  const sessions = options.sessions?.length ? options.sessions : SESSIONS;
  const setupTypes = options.setupTypes?.length ? options.setupTypes : SETUP_TYPES;

  const handleReset = () => {
    onChange("pair", "");
    onChange("session", "");
    onChange("setupType", "");
    onChange("cleanOnly", false);
  };

  const activeCount = [filters.pair, filters.session, filters.setupType, filters.cleanOnly ? "clean" : ""].filter(
    Boolean
  ).length;

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Filters</h2>
        <div className="flex items-center gap-2">
          <span className="chip">Live analytics</span>
          <span className="chip">{activeCount} active</span>
          <button
            type="button"
            className="chip text-textMain transition hover:border-accent"
            onClick={handleReset}
            disabled={activeCount === 0}
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
              {pairs.map((pair) => (
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
              {sessions.map((session) => (
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
              {setupTypes.map((setupType) => (
                <option key={setupType} value={setupType} />
              ))}
            </datalist>
          </div>
        </label>

        <button
          type="button"
          className={`flex min-h-[72px] items-center rounded-xl border px-3 text-sm transition ${
            filters.cleanOnly
              ? "border-accent bg-accent/20 text-textMain"
              : "border-border bg-panelMuted text-textMuted hover:border-accent"
          }`}
          onClick={() => onChange("cleanOnly", !filters.cleanOnly)}
          aria-pressed={filters.cleanOnly}
        >
          <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-sm border border-border text-[10px]">
            {filters.cleanOnly ? "A" : ""}
          </span>
          A+ setups only
        </button>
      </div>
    </section>
  );
};

export default FiltersBar;
