import { Flag, Car, Ban, Timer, Swords, Trophy, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { Brand } from './Brand'
import { Avatar } from './bits'

/** Broadcast race-control cards (reference "Saudi Arabian GP" set). Large,
 *  dark-headed, color-blocked — each state distinct by colour + icon + label. */

type Variant = 'green' | 'yellow' | 'red' | 'purple' | 'dotd' | 'battle' | 'info'

const META: Record<Variant, { bg: string; fg: string; icon: typeof Flag }> = {
  green: { bg: 'var(--gain)', fg: '#04140b', icon: Flag },
  yellow: { bg: 'var(--caution)', fg: '#1a1400', icon: Car },
  red: { bg: 'var(--red-2)', fg: '#fff', icon: Ban },
  purple: { bg: '', fg: '#fff', icon: Timer }, // gradient handled below
  dotd: { bg: 'var(--surface-2)', fg: 'var(--text)', icon: Trophy },
  battle: { bg: 'var(--surface-2)', fg: 'var(--text)', icon: Swords },
  info: { bg: 'var(--surface-2)', fg: 'var(--text)', icon: Flag },
}

function Card({ variant, children, tall }: { variant: Variant; children: ReactNode; tall?: boolean }) {
  const m = META[variant]
  const bg = variant === 'purple' ? 'linear-gradient(100deg, #8B2FE8 0%, #E1179C 100%)' : m.bg || 'var(--surface-2)'
  return (
    <div className={`rc-card${tall ? ' rc-card--tall' : ''}`}>
      <div className="rc-card__head">
        <Brand size={12} />
        <span className="rc-card__tag">Race</span>
      </div>
      <div className="rc-card__body" style={{ background: bg, color: m.fg, flex: 1 }}>
        {variant === 'purple' && <div className="rc-chevrons" aria-hidden />}
        {children}
      </div>
    </div>
  )
}

export function StatusCard(props: {
  variant: Variant
  title?: string; subtitle?: string
  time?: string; driver?: string
  a?: string; b?: string; delta?: string
}) {
  const { variant, title, subtitle, time, driver, a, b, delta } = props
  const m = META[variant]
  const Icon = m.icon
  const solid = variant === 'green' || variant === 'yellow' || variant === 'red' || variant === 'purple'

  if (variant === 'battle') {
    return (
      <Card variant={variant}>
        <span className="eyebrow" style={{ color: 'var(--text-faint)' }}>Battle for {title || 'the lead'}</span>
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="rc-card__title" style={{ fontSize: 22 }}>{a}</span>
          <span className="rc-card__title" style={{ fontSize: 22, color: 'var(--gain)' }}>{delta}</span>
          <span className="rc-card__title" style={{ fontSize: 22 }}>{b}</span>
        </div>
      </Card>
    )
  }
  if (variant === 'purple') {
    return (
      <Card variant={variant}>
        <div className="row between" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <div className="rc-card__title">Fastest Lap</div>
            <div className="num" style={{ fontWeight: 700, marginTop: 6, fontSize: 18 }}>{time}</div>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <Icon size={24} />
            <span className="rc-card__title" style={{ fontSize: 20, marginTop: 10 }}>{driver}</span>
          </div>
        </div>
      </Card>
    )
  }
  if (variant === 'dotd') {
    return (
      <Card variant={variant}>
        <div className="row between">
          <div>
            <div className="rc-card__title" style={{ fontSize: 20, lineHeight: 1.05 }}>Driver of<br />the Day</div>
            <span className="rc-card__title" style={{ fontSize: 22, marginTop: 10, display: 'block' }}>{driver}</span>
          </div>
          <Avatar name={driver || '??'} color="var(--caution)" size={48} />
        </div>
      </Card>
    )
  }
  // green / yellow / red / info
  return (
    <Card variant={variant}>
      <div className="row between">
        <div>
          <div className="rc-card__title">{title}</div>
          {subtitle && <div className="rc-card__sub" style={{ marginTop: 6, opacity: solid ? 0.82 : 1 }}>{subtitle}</div>}
        </div>
        <Icon size={30} style={{ opacity: 0.9 }} />
      </div>
    </Card>
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

/** Tall "Starting Grid" / running-order card + a Watch Live affordance. */
export function StartingGridCard({ rows, deadline, title = 'Starting Grid' }: {
  rows: { position: number; short: string; name: string; constructor: string; color: string }[]
  deadline?: ReactNode
  title?: string
}) {
  return (
    <div className="rc-card rc-card--tall">
      <div className="rc-card__head">
        <Brand size={12} />
        <span className="rc-card__tag">Race</span>
      </div>
      <div className="row gap-2" style={{ padding: '16px 18px 10px' }}>
        <Flag size={16} className="red" />
        <span style={{ fontWeight: 700 }}>{title}</span>
      </div>
      <div className="rc-card__list">
        {rows.slice(0, 5).map((r) => (
          <div key={r.position} className="rc-card__row">
            <Avatar name={r.name} color={r.color} size={34} />
            <b className="num">{r.position}.</b>
            <strong style={{ flex: 1 }}>{r.name}</strong>
            <span className="text-faint" style={{ fontSize: 13 }}>{r.constructor}</span>
          </div>
        ))}
      </div>
      <button className="rc-card__watch">
        <Play size={14} /> <b>Watch Live</b> {deadline}
      </button>
    </div>
  )
}
