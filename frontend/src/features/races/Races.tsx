import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Countdown } from '../../components/motion'
import { Skeleton, SprintBadge } from '../../components/bits'
import { api } from '../../lib/api'
import { flagEmoji, localDateFull } from '../../lib/format'
import type { Race } from '../../lib/types'

export default function Races() {
  const [races, setRaces] = useState<Race[] | null>(null)
  useEffect(() => { api.races().then((r) => setRaces(r.races)).catch(() => {}) }, [])

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><span className="eyebrow">Season {new Date().getFullYear() + (races?.length ? 0 : 0)} calendar</span><h1 className="page-title">Race Calendar</h1></div>
        <div className="col gap-2">
          {!races && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={72} />)}
          {races?.map((r) => {
            const done = r.status === 'completed'
            const next = r.status === 'upcoming'
            return (
              <Link key={r.round} to={`/races/${r.slug}`} className="panel row between wrap gap-2 race-edge"
                style={{ ['--accent' as string]: done ? 'var(--line)' : 'var(--red)', padding: '16px 20px', opacity: done ? 0.85 : 1 }}>
                <div className="row gap-3">
                  <span className="display" style={{ fontSize: 26, color: 'var(--text-faint)', minWidth: 44 }}>{String(r.round).padStart(2, '0')}</span>
                  <div>
                    <div className="row gap-2">
                      <span style={{ fontWeight: 700, fontSize: 17 }}>{flagEmoji(r.country)} {r.name}</span>
                      {r.is_sprint && <SprintBadge />}
                    </div>
                    <span className="eyebrow">{r.circuit} · {localDateFull(r.race_start)}</span>
                  </div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end' }}>
                  {done ? (
                    <><span className="eyebrow">Winner</span><span style={{ fontWeight: 700 }}>{r.winner?.short ?? '—'}</span></>
                  ) : next ? (
                    <><span className="eyebrow">Team locks in</span><Countdown iso={r.deadline} compact /></>
                  ) : (
                    <><span className="eyebrow">Scheduled</span><span className="num text-dim">{localDateFull(r.race_start)}</span></>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
