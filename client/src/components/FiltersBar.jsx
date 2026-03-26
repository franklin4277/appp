import { PAIRS, SESSIONS, SETUP_TYPES } from "../utils/options";

const FiltersBar = ({ filters, onChange }) => {
  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Filters</h2>
        <span className="chip">Live analytics</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label>
          <span className="label">Pair</span>
          <select
            className="input"
            value={filters.pair}
            onChange={(event) => onChange("pair", event.target.value)}
          >
            <option value="">All pairs</option>
            {PAIRS.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">Session</span>
          <select
            className="input"
            value={filters.session}
            onChange={(event) => onChange("session", event.target.value)}
          >
            <option value="">All sessions</option>
            {SESSIONS.map((session) => (
              <option key={session} value={session}>
                {session}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">Setup Type</span>
          <select
            className="input"
            value={filters.setupType}
            onChange={(event) => onChange("setupType", event.target.value)}
          >
            <option value="">All setups</option>
            {SETUP_TYPES.map((setupType) => (
              <option key={setupType} value={setupType}>
                {setupType}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-end pb-2 text-sm text-textMain">
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
