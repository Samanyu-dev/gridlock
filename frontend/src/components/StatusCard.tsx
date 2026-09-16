import { Flag, Car, Ban, Timer, Swords, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'

/** Broadcast race-status cards (reference "Saudi Arabian GP" set). Flat, solid
 *  or chevron-striped fills, each state distinct by colour + icon + label. */

type Variant = 'green' | 'yellow' | 'red' | 'purple' | 'dotd' | 'battle' | 'info'

const META: Record<Variant, { bg: string; fg: string; icon: typeof Flag }> = {
  green:  { bg: 'var(--gain)',   fg: '#04140b', icon: Flag },
  yellow: { bg: 'var(--caution)',fg: '#1a1400', icon: Car },
  red:    { bg: 'var(--red-2)',  fg: '#fff',    icon: Ban },
  purple: { bg: '',              fg: '#fff',    icon: Timer },   // gradient handled below
  dotd:   { bg: 'var(--surface-2)', fg: 'var(--text)', icon: Trophy },
  battle: { bg: 'var(--surface-2)', fg: 'var(--text)', icon: Swords },
  info:   { bg: 'var(--surface-2)', fg: 'var(--text)', icon: Flag },
}

function Shell({ variant, children, style }: { variant: Variant; children: ReactNode; style?: React.CSSProperties }) {
  const m = META[variant]
  const bg = variant === 'purple'
    ? 'linear-gradient(100deg, #8B2FE8 0%, #E1179C 100%)'
    : m.bg || 'var(--surface-2)'
  const solid = ['green', 'yellow', 'red', 'purple'].includes(variant)
  return (
    <div className="panel" style={{
      padding: 16, minHeight: 96, position: 'relative', overflow: 'hidden',
      background: bg, color: m.fg, border: solid ? '1px solid transparent' : '1px solid var(--line)',
      ...style,
    }}>
      {variant === 'purple' && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.25,
          background: 'repeating-linear-gradient(115deg, rgba(255,255,255,.35) 0 3px, transparent 3px 22px)' }} />
      )}
      <div className="row between" style={{ position: 'relative' }}>
        <span className="eyebrow" style={{ color: solid ? m.fg : 'var(--text-faint)', opacity: solid ? 0.7 : 1 }}>Race</span>
        <span className="brand" style={{ fontSize: 12, gap: 4, opacity: 0.85 }}>◣</span>
      </div>
      <div style={{ position: 'relative', marginTop: 8 }}>{children}</div>
    </div>
  )
}

export function StatusCard(props: {
  variant: Variant
  title?: string; subtitle?: string
  time?: string; driver?: string
  a?: string; b?: string; delta?: string
  style?: React.CSSProperties
}) {
  const { variant, title, subtitle, time, driver, a, b, delta, style } = props
  const m = META[variant]
  const Icon = m.icon
  const solid = ['green', 'yellow', 'red', 'purple'].includes(variant)

  if (variant === 'battle') {
    return (
      <Shell variant={variant} style={style}>
        <span className="eyebrow" style={{ color: 'var(--text-faint)' }}>Battle for {title || 'the lead'}</span>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="num" style={{ fontWeight: 800, fontSize: 18 }}>{a}</span>
          <span className="num" style={{ fontWeight: 800, color: 'var(--gain)' }}>{delta}</span>
          <span className="num" style={{ fontWeight: 800, fontSize: 18 }}>{b}</span>
        </div>
      </Shell>
    )
  }
  if (variant === 'purple') {
    return (
      <Shell variant={variant} style={style}>
        <div className="row between">
          <div>
            <div className="display" style={{ fontSize: 22 }}>Fastest Lap</div>
            <div className="num" style={{ fontWeight: 700, marginTop: 4 }}>{time}</div>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <Icon size={22} />
            <span className="num" style={{ fontWeight: 800, marginTop: 8 }}>{driver}</span>
          </div>
        </div>
      </Shell>
    )
  }
  if (variant === 'dotd') {
    return (
      <Shell variant={variant} style={style}>
        <div className="row between">
          <div>
            <div className="display" style={{ fontSize: 18, lineHeight: 1.05 }}>Driver of<br />the Day</div>
            <span className="num" style={{ fontWeight: 800, marginTop: 10, display: 'block' }}>{driver}</span>
          </div>
          <Trophy size={26} style={{ color: 'var(--caution)' }} />
        </div>
      </Shell>
    )
  }
  // green / yellow / red / info
  return (
    <Shell variant={variant} style={style}>
      <div className="row between">
        <div>
          <div className="display" style={{ fontSize: 24, letterSpacing: '-.01em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, marginTop: 4, opacity: solid ? 0.8 : 1 }}>{subtitle}</div>}
        </div>
        <Icon size={26} style={{ opacity: 0.9 }} />
      </div>
    </Shell>
  )
}

/** Track-status → the right flag card. */
export function trackStatusCard(status: string) {
  switch (status) {
    case 'RED': return <StatusCard variant="red" title="Red Flag" subtitle="Session Stopped" />
    case 'SC': case 'YELLOW': return <StatusCard variant="yellow" title="Safety Car" subtitle="Caution on track" />
    default: return <StatusCard variant="green" title="Green Flag" subtitle="Track Clear" />
  }
}
