/** A stylized circuit outline that draws itself. Deterministic per-slug shape
 *  so each race gets a distinct-looking trace (future-ready for real SVG track data). */
export function CircuitTrace({ seed, color = 'var(--red)', height = 200 }: { seed: string; color?: string; height?: number }) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff
  const rand = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return (h % 1000) / 1000 }
  const cx = 200, cy = 110
  const pts: [number, number][] = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 60 + rand() * 55
    pts.push([cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r])
  }
  let d = `M ${pts[0][0].toFixed(0)} ${pts[0][1].toFixed(0)}`
  for (let i = 1; i <= n; i++) {
    const p0 = pts[(i - 1) % n], p1 = pts[i % n]
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2
    d += ` Q ${p0[0].toFixed(0)} ${p0[1].toFixed(0)} ${mx.toFixed(0)} ${my.toFixed(0)}`
  }
  d += ' Z'
  return (
    <svg className="trace" viewBox="0 0 400 220" width="100%" height={height} aria-hidden style={{ ['--len' as string]: 1400 }}>
      <path d={d} fill="none" stroke="var(--line)" strokeWidth="10" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" style={{ ['--len' as string]: 1400 }} />
    </svg>
  )
}
