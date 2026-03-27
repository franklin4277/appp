const SectionEmptyState = ({ title, message, hint = "" }) => (
  <section className="panel animate-riseIn">
    <p className="section-kicker">Waiting For Data</p>
    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
    <p className="text-sm text-textMuted">{message}</p>
    {hint ? <p className="mt-2 text-xs text-textMuted">{hint}</p> : null}
  </section>
);

export default SectionEmptyState;
