const BrandLogo = ({ className = "brand-logo" }) => (
  <div className={className} aria-hidden="true">
    <svg viewBox="0 0 48 48" className="h-full w-full" role="presentation">
      <defs>
        <linearGradient id="logo-bg" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="logo-bars" x1="10" y1="10" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#DBEAFE" />
          <stop offset="1" stopColor="#E9D5FF" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="43" height="43" rx="11" fill="#0F172A" stroke="url(#logo-bg)" />
      <rect x="10" y="24" width="6.5" height="12" rx="2.2" fill="url(#logo-bars)" opacity="0.85" />
      <rect x="20.5" y="17" width="6.5" height="19" rx="2.2" fill="url(#logo-bars)" opacity="0.9" />
      <rect x="31" y="10" width="6.5" height="26" rx="2.2" fill="url(#logo-bars)" />
      <path
        d="M9 30L16.5 24L24.5 27L33 16L39.5 20"
        stroke="#F8FAFC"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  </div>
);

export default BrandLogo;
