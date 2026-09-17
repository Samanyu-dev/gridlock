export function BrandGlyph({ size = 26 }: { size?: number }) {
  // A stylized F1 car in profile, mid-corner: nose, halo, rear wing, wheels.
  return (
    <svg className="brand-glyph" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="7" fill="url(#bg-grad)" />
      {/* rear wing */}
      <rect x="23.6" y="10" width="1.6" height="6.6" rx="0.5" fill="#fff" />
      <rect x="22.6" y="9" width="4.4" height="2" rx="0.7" fill="#fff" />
      {/* halo */}
      <path d="M14.2 13.6c.3-1.7 1.8-2.9 3.5-2.9h.8c1.4 0 2.6.9 3 2.2"
        stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* body, sidepod, nose + front wing */}
      <path d="M5.2 19.1c-.1-.9.5-1.7 1.4-1.9l2.6-.6 2.7-2.9c.9-1 2.2-1.5 3.5-1.5h7.4c1.1 0 2.1.6 2.6 1.6l1.2 2.4c.3.6-.1 1.4-.8 1.4H8.7c-.6 0-1.2.2-1.6.7l-.6.6c-.4.4-1.1.2-1.3-.3z" fill="#fff" />
      <rect x="3.6" y="17.6" width="4.2" height="1.7" rx="0.6" fill="#fff" />
      {/* wheels */}
      <circle cx="10.2" cy="21.3" r="2.9" fill="#15171a" stroke="#fff" strokeWidth="1.3" />
      <circle cx="22.6" cy="21.3" r="2.9" fill="#15171a" stroke="#fff" strokeWidth="1.3" />
      <defs>
        <linearGradient id="bg-grad" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#ff2130" />
          <stop offset="1" stopColor="#a10600" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Brand({ size = 20 }: { size?: number }) {
  return (
    <span className="brand" style={{ fontSize: size }}>
      <BrandGlyph size={size + 6} />
      GRIDLOCK
    </span>
  )
}
