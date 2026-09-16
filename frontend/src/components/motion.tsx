import { useEffect, useRef, useState } from 'react'
import { countdownTo, pad, urgency } from '../lib/format'

/** Number that rolls up to its value when it changes. */
export function CountUp({ value, duration = 800, decimals = 0, prefix = '', suffix = '' }: {
  value: number; duration?: number; decimals?: number; prefix?: string; suffix?: string
}) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) { setDisplay(to); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <span className="num">{prefix}{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
}

/** Big segmented countdown with escalating urgency. */
export function Countdown({ iso, compact = false }: { iso: string; compact?: boolean }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const c = countdownTo(iso)
  const u = urgency(iso)
  const color = u === 'urgent' ? 'var(--red)' : u === 'soon' ? 'var(--caution)' : 'var(--text)'

  if (c.past) return <span className="chip" style={{ color: 'var(--text-faint)' }}>TEAM LOCKED</span>

  if (compact) {
    return (
      <span className="num" style={{ color, fontWeight: 700, letterSpacing: '0.02em' }}>
        {c.days > 0 && `${c.days}d `}{pad(c.hours)}:{pad(c.mins)}:{pad(c.secs)}
      </span>
    )
  }
  const units: [number, string][] = [[c.days, 'Days'], [c.hours, 'Hrs'], [c.mins, 'Min'], [c.secs, 'Sec']]
  return (
    <div className="countdown" style={{ color }}>
      {units.map(([n, l], i) => (
        <div key={l} style={{ display: 'contents' }}>
          {i > 0 && <span className="cd-sep">:</span>}
          <div className="cd-unit"><div className="n">{pad(n)}</div><div className="l">{l}</div></div>
        </div>
      ))}
    </div>
  )
}
