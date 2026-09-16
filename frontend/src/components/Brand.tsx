export function BrandGlyph({ size = 26 }: { size?: number }) {
  // A racing apex traced into a "G": the signature GRIDLOCK mark.
  return (
    <svg className="brand-glyph" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="7" fill="url(#bg-grad)" />
      <path d="M23 10.5C21.7 8.7 19.5 7.6 17 7.6c-4.6 0-8 3.6-8 8.4s3.4 8.4 8 8.4c3.9 0 6.7-2.4 7.4-6H16.5"
        stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="17" cy="16" r="1.7" fill="#fff" />
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
