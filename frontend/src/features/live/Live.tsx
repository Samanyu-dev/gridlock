import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Radio } from 'lucide-react'
import { Countdown, CountUp } from '../../components/motion'
import { Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { useMeta } from '../../lib/meta'
import { flagEmoji } from '../../lib/format'
import type { LiveSnapshot, LiveEvent, MeResponse } from '../../lib/types'

const TYRE: Record<string, { c: string; l: string }> = {
  S: { c: 'var(--red)', l: 'S' }, M: { c: 'var(--caution)', l: 'M' },
  H: { c: '#e5e7eb', l: 'H' }, I: { c: 'var(--gain)', l: 'I' },
}

export default function Live() {
  const { username } = useSession()
  const meta = useMeta()
  const [snap, setSnap] = useState<LiveSnapshot | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [lap, setLap] = useState(0)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [myPts, setMyPts] = useState(0)
  const [updated, setUpdated] = useState(0)
  const evSeed = useRef(0)

  useEffect(() => {
    api.live().then((s) => { setSnap(s); setLap(s.lap); setEvents(s.events); setMyPts(120) }).catch(() => {})
    if (username) api.me(username).then(setMe).catch(() => {})
  }, [username])

  // Simulated live ticking (visual only — a real deploy streams via realtime).
  useEffect(() => {
    if (!snap) return
    const t = setInterval(() => {
      setLap((l) => Math.min(snap.total_laps, l + 1))
      setUpdated((u) => u + 1)
      // occasionally inject a new fantasy event
      if (Math.random() < 0.6) {
        const src = snap.board[Math.floor(Math.random() * Math.min(10, snap.board.length))]
        const kinds: LiveEvent[] = [
          { lap: lap + 1, short: src.short, color: src.color, points: 2, label: 'Position gained' },
          { lap: lap + 1, short: src.short, color: src.color, points: 5, label: 'Fastest lap' },
          { lap: lap + 1, short: src.short, color: src.color, points: 3, label: 'Overtake' },
        ]
        const ev = kinds[evSeed.current++ % kinds.length]
        setEvents((e) => [ev, ...e].slice(0, 12))
        setMyPts((p) => p + (Math.random() < 0.5 ? ev.points : 0))
      }
    }, 3500)
    return () => clearInterval(t)
  }, [snap, lap])

  const myDrivers = useMemo(() => new Set(me?.team?.driver_ids ?? []), [me])
  const nr = meta?.next_race

  if (!snap) return <div className="page container"><Skeleton h={80} /><div style={{ height: 16 }} /><Skeleton h={400} /></div>

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div className="panel" style={{ overflow: 'hidden', marginBottom: 16 }}>
          <div className="row between wrap gap-2" style={{ padding: 20, background: 'linear-gradient(120deg, rgba(255,33,48,0.12), transparent 55%)' }}>
            <div className="row gap-3">
              <span className="chip chip-live" style={{ fontSize: 13 }}><span className="dot" />LIVE</span>
              <div>
                <h1 className="display" style={{ fontSize: 30 }}>{flagEmoji(snap.race.country)} {snap.race.name}</h1>
                <span className="text-dim">{snap.race.circuit} · {snap.race.weather}</span>
              </div>
            </div>
            <div className="row gap-4">
              <div><div className="eyebrow">Lap</div><div className="display" style={{ fontSize: 32 }}>{lap}<span className="text-faint" style={{ fontSize: 18 }}>/{snap.total_laps}</span></div></div>
              <div><div className="eyebrow">Track</div><div className="chip" style={{ color: 'var(--gain)', borderColor: 'var(--gain)' }}>● GREEN</div></div>
            </div>
          </div>
          <div className="bar" style={{ borderRadius: 0 }}><span style={{ width: `${(lap / snap.total_laps) * 100}%` }} /></div>
        </div>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="chip" style={{ padding: '3px 8px' }}>Demo timing</span>
          <span className="eyebrow">Updated {updated === 0 ? 'now' : `${updated * 3}s ago`.replace('0s', 'now')} · <span style={{ color: 'var(--gain)' }}>● connected</span></span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }} className="live-grid">
          {/* Timing tower */}
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tower">
                <thead><tr><th>P</th><th>Driver</th><th className="r">Gap</th><th className="r">Tyre</th><th className="r hide-mobile">Pit</th></tr></thead>
                <tbody>
                  {snap.board.map((row) => {
                    const mine = myDrivers.has(row.driver_id)
                    const t = TYRE[row.tyre] || TYRE.M
                    return (
                      <tr key={row.driver_id} style={{ background: mine ? 'color-mix(in srgb, var(--red) 8%, transparent)' : undefined }}>
                        <td><span className={`pos pos-${row.position}`}>{String(row.position).padStart(2, '0')}</span></td>
                        <td><span className="row gap-2"><span className="team-dot" style={{ background: row.color, height: 16 }} /><span style={{ fontWeight: 600 }}>{row.short}</span>{mine && <span className="tag-pts" style={{ background: 'var(--red-glow)', color: '#fff' }}>MINE</span>}</span></td>
                        <td className="r num text-dim">{row.gap}</td>
                        <td className="r"><span className="num" style={{ color: t.c, fontWeight: 700 }}>{t.l}</span></td>
                        <td className="r hide-mobile num text-faint">{row.pits}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fantasy panel + events */}
          <div className="col gap-3">
            <div className="panel panel-pad" style={{ background: 'linear-gradient(160deg, rgba(255,33,48,0.10), transparent)' }}>
              <span className="eyebrow">My live fantasy points</span>
              <div className="display" style={{ fontSize: 56, margin: '4px 0' }}><CountUp value={myPts} /></div>
              <span className="tag-pts tag-gain">+{Math.round(myPts / Math.max(1, lap))} this lap</span>
            </div>

            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 15 }}>Live fantasy events</span>
              <div className="col gap-1" style={{ marginTop: 12 }}>
                <AnimatePresence initial={false}>
                  {events.map((e, i) => (
                    <motion.div key={`${e.lap}-${e.short}-${i}`} layout
                      initial={{ opacity: 0, x: 20, height: 0 }} animate={{ opacity: 1, x: 0, height: 'auto' }} exit={{ opacity: 0 }}
                      className="row between race-edge" style={{ ['--accent' as string]: e.color, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                      <span className="row gap-2"><span className="eyebrow">L{e.lap}</span><span style={{ fontWeight: 600, fontSize: 13 }}>{e.short}</span><span className="text-faint" style={{ fontSize: 12 }}>{e.label}</span></span>
                      {e.points > 0 && <span className="num" style={{ fontWeight: 700, color: 'var(--gain)' }}>+{e.points}</span>}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {nr && (
          <div className="panel panel-pad row between wrap gap-2" style={{ marginTop: 16 }}>
            <span className="row gap-2"><Radio size={16} className="red" /> <span className="text-dim">This is a demo live session. The real next race locks in:</span></span>
            <Countdown iso={nr.deadline} compact />
            <Link to="/team" className="btn btn-primary btn-sm">Check my team</Link>
          </div>
        )}
      </div>
      <style>{`@media (max-width: 900px){ .live-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
