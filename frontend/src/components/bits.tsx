import { useState } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { initials } from '../lib/format'

/** Driver headshot when `image` is given (falls back to a team-colored
 *  monogram with car number if there's no image, or it fails to load). */
export function Avatar({ name, number, color, size = 44, image }: {
  name: string; number?: number; color: string; size?: number; image?: string
}) {
  const [broken, setBroken] = useState(false)
  if (image && !broken) {
    return (
      <span className="avatar" style={{ width: size, height: size, background: shade(color, -55) }}>
        <img src={image} alt={name} onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
        {number !== undefined && <span className="num">{number}</span>}
      </span>
    )
  }
  return (
    <span className="avatar" style={{
      width: size, height: size, fontSize: size * 0.36,
      background: `linear-gradient(150deg, ${color} 0%, ${shade(color, -40)} 100%)`,
      boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08)`,
    }}>
      {initials(name).toUpperCase()}
      {number !== undefined && <span className="num">{number}</span>}
    </span>
  )
}

function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '')
  if (c.length !== 6) return hex
  const n = parseInt(c, 16)
  const r = Math.max(0, Math.min(255, (n >> 16) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Inline SVG sparkline for a points series. */
export function Sparkline({ data, color = 'var(--red)', width = 120, height = 34 }: {
  data: number[]; color?: string; width?: number; height?: number
}) {
  if (!data.length) return <svg width={width} height={height} />
  const max = Math.max(...data, 1), min = Math.min(...data, 0)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * (width - 4) + 2
    const y = height - 3 - ((v - min) / range) * (height - 6)
    return [x, y]
  })
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={area} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} />
    </svg>
  )
}

/** Last-N form bars, colored by relative magnitude. */
export function FormBars({ data, max = 40 }: { data: number[]; max?: number }) {
  return (
    <div className="formbars">
      {data.map((v, i) => {
        const h = Math.max(3, Math.min(34, (v / max) * 34))
        const col = v >= 25 ? 'var(--gain)' : v >= 12 ? 'var(--caution)' : v <= 0 ? 'var(--loss)' : 'var(--text-faint)'
        return <span key={i} style={{ height: h, background: col }} title={String(v)} />
      })}
    </div>
  )
}

/** Movement / delta arrow with number. */
export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0
  if (value === 0) return <span className="delta text-faint"><Minus size={12} /></span>
  const Icon = positive ? ArrowUp : ArrowDown
  return (
    <span className="delta" style={{ color: positive ? 'var(--gain)' : 'var(--loss)' }}>
      <Icon size={12} />{Math.abs(value)}
    </span>
  )
}

export function PriceDelta({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) return <span className="text-faint num" style={{ fontSize: 12 }}>—</span>
  const up = value > 0
  return (
    <span className="num" style={{ color: up ? 'var(--gain)' : 'var(--loss)', fontSize: 12, fontWeight: 600 }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}
    </span>
  )
}

export function TeamBadge({ color }: { color: string }) {
  return <span className="team-dot" style={{ background: color }} />
}

export function Skeleton({ w = '100%', h = 16, style }: { w?: number | string; h?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} />
}

/** A subtle form rating pill (0-10). */
export function FormPill({ value }: { value: number }) {
  const col = value >= 7 ? 'var(--gain)' : value >= 4 ? 'var(--caution)' : 'var(--loss)'
  return (
    <span className="num" style={{ color: col, fontWeight: 700, fontSize: 13 }}>{value.toFixed(1)}</span>
  )
}
