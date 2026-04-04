import { memo } from "react";

const SectionEmptyState = ({ title, message, hint = "" }) => (
  <section className="panel animate-riseIn">
    <div className="saas-empty-state">
      <strong>{title}</strong>
      <p>{message}</p>
      {hint ? <p>{hint}</p> : null}
    </div>
  </section>
);

export default memo(SectionEmptyState);
