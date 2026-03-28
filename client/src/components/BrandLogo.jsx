const BrandLogo = ({ className = "brand-logo" }) => (
  <div className={className} aria-hidden="true">
    <svg viewBox="0 0 48 48" className="h-full w-full" role="presentation">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#0f1a2d" />
      <rect x="9" y="10" width="8" height="28" rx="2.5" fill="#7d96bd" />
      <rect x="20" y="16" width="8" height="22" rx="2.5" fill="#9bb0d2" />
      <rect x="31" y="7" width="8" height="31" rx="2.5" fill="#5e769b" />
      <path d="M8 31L17 23L25 27L33 15L40 20" stroke="#dfe9fb" strokeWidth="2.2" fill="none" />
    </svg>
  </div>
);

export default BrandLogo;
