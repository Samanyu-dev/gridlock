import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Countdown } from '../../components/motion'
import { CircuitTrace } from './CircuitTrace'
import { Skeleton, SprintBadge } from '../../components/bits'
import { api } from '../../lib/api'
import { flagEmoji, localTime, localWeekday, statusLabel, userTimezone } from '../../lib/format'
import type { ClassificationRow, QualiRow, RaceFull } from '../../lib/types'

const TABS = ['Overview', 'Schedule', 'Results', 'Grid']
const SPRINT_TABS = ['Overview', 'Schedule', 'Sprint Grid', 'Sprint Results', 'Grid', 'Results']

function QualiTable({ rows, empty }: { rows: QualiRow[]; empty: string }) {
  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="tower">
            <thead><tr><th>Pos</th><th>Driver</th><th className="hide-mobile">Team</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.driver_id}>
                  <td><span className={`pos pos-${row.position}`}>{String(row.position).padStart(2, '0')}</span></td>
                  <td><span className="row gap-2"><span className="team-dot" style={{ background: row.color, height: 16 }} />{row.name}</span></td>
                  <td className="hide-mobile text-dim">{row.constructor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty"><p className="text-dim">{empty}</p></div>}
    </div>
  )
}

function ResultsTable({ rows, empty }: { rows: ClassificationRow[]; empty: string }) {
  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="tower">
            <thead><tr><th>Pos</th><th>Driver</th><th className="hide-mobile">Team</th><th className="r">Grid</th><th className="r">+/-</th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.driver_id}>
                  <td><span className={`pos pos-${i + 1}`}>{row.finish ? String(row.finish).padStart(2, '0') : statusLabel(row.status)}</span></td>
                  <td><span className="row gap-2"><span className="team-dot" style={{ background: row.color, height: 16 }} />{row.name} {row.fastest_lap && <span className="tag-pts tag-fl">FL</span>}{row.dotd && <span className="tag-pts" style={{ background: 'rgba(59,158,255,0.15)', color: 'var(--info)' }}>DOTD</span>}</span></td>
                  <td className="hide-mobile text-dim">{row.constructor}</td>
                  <td className="r num">P{row.grid}</td>
                  <td className="r">{row.delta !== null && row.delta !== 0 ? <span className="num" style={{ color: row.delta > 0 ? 'var(--gain)' : 'var(--loss)', fontWeight: 700 }}>{row.delta > 0 ? '+' : ''}{row.delta}</span> : <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="empty"><p className="text-dim">{empty}</p></div>}
    </div>
  )
}

export default function RaceDetail() {
  const { slug } = useParams()
  const [r, setR] = useState<RaceFull | null>(null)
  const [tab, setTab] = useState('Overview')
  useEffect(() => { if (slug) api.race(slug).then(setR).catch(() => {}) }, [slug])
  if (!r) return <div className="page container"><Skeleton h={220} /></div>
  const done = r.status === 'completed'
  const tabs = r.is_sprint ? SPRINT_TABS : TABS

  return (
    <div className="page">
      <div className="container">
        <Link to="/races" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Calendar</Link>

        <div className="panel" style={{ overflow: 'hidden', marginBottom: 20 }}>
          <div className="row between wrap" style={{ padding: 28 }}>
            <div>
              <span className="eyebrow row gap-2" style={{ alignItems: 'center' }}>Round {r.round}{r.is_sprint && <SprintBadge />}</span>
              <h1 className="display" style={{ fontSize: 'clamp(30px,5vw,54px)', margin: '4px 0' }}>{flagEmoji(r.country)} {r.name}</h1>
              <span className="text-dim"><Link to={`/circuits/${r.slug}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{r.circuit}</Link> · {r.laps} laps · {r.length_km} km · {r.weather}</span>
            </div>
            <div style={{ width: 260, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {r.circuit_image_url
                ? <img src={r.circuit_image_url} alt={r.circuit} style={{ height: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                : <CircuitTrace seed={r.slug} height={150} />}
            </div>
          </div>
          {!done && (
            <div className="row between wrap gap-2" style={{ padding: '16px 28px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <span className="eyebrow">Fantasy deadline · {userTimezone()}</span>
              <Countdown iso={r.deadline} />
            </div>
          )}
        </div>

        <div className="seg" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {tabs.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {tab === 'Overview' && (
          <div className="grid g4">
            {[['Laps', r.laps], ['Length', `${r.length_km} km`], ['Distance', `${(r.laps * r.length_km).toFixed(0)} km`], ['Weather', r.weather],
              ['Winner', done ? r.winner?.short ?? '—' : 'TBD'], ['Fastest lap', done ? r.fastest_lap?.short ?? '—' : 'TBD'],
              ['Driver of the Day', done ? r.dotd?.short ?? '—' : 'TBD'], ['Status', r.status.toUpperCase()]].map(([k, v], i) => (
              <div key={i} className="panel stat"><div className="k">{k}</div><div className="v" style={{ fontSize: 22 }}>{v}</div></div>
            ))}
          </div>
        )}

        {tab === 'Schedule' && (
          <div className="panel" style={{ overflow: 'hidden' }}>
            {r.sessions.map((s, i) => {
              const isSprintSession = s.kind === 'SPRINT' || s.kind === 'SQ'
              return (
                <div key={s.kind} className="row between" style={{ padding: '14px 20px', borderBottom: i < r.sessions.length - 1 ? '1px solid var(--line-soft)' : 'none', background: s.kind === 'RACE' ? 'var(--surface-2)' : 'transparent' }}>
                  <span className="row gap-2"><span className="chip" style={{ minWidth: 60, justifyContent: 'center', color: s.kind === 'RACE' ? 'var(--red)' : isSprintSession ? 'var(--caution)' : undefined, borderColor: isSprintSession ? 'var(--caution)' : undefined }}>{s.kind}</span><span style={{ fontWeight: 600 }}>{s.label}</span></span>
                  <span className="num text-dim">{localWeekday(s.start)} · {localTime(s.start)}</span>
                </div>
              )
            })}
            <div className="text-faint" style={{ padding: '10px 20px', fontSize: 12 }}>Times shown in your local timezone ({userTimezone()}).</div>
          </div>
        )}

        {tab === 'Results' && (done
          ? <ResultsTable rows={r.classification} empty="No race classification recorded." />
          : <div className="panel empty"><p className="text-dim">Results drop after the chequered flag.</p></div>
        )}

        {tab === 'Grid' && (done
          ? <QualiTable rows={r.quali} empty="No qualifying data recorded." />
          : <div className="panel empty"><p className="text-dim">Qualifying grid appears after Saturday.</p></div>
        )}

        {tab === 'Sprint Results' && (done
          ? <ResultsTable rows={r.sprint_classification} empty="No sprint classification recorded." />
          : <div className="panel empty"><p className="text-dim">Sprint results drop after the sprint race.</p></div>
        )}

        {tab === 'Sprint Grid' && (done
          ? <QualiTable rows={r.sprint_quali} empty="No sprint qualifying data recorded." />
          : <div className="panel empty"><p className="text-dim">Sprint grid appears after sprint qualifying.</p></div>
        )}
      </div>
    </div>
  )
}
