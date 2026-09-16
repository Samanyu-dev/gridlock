import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Avatar, Sparkline, FormPill, Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { flagEmoji, money, statusLabel } from '../../lib/format'
import type { DriverFull } from '../../lib/types'

export default function DriverProfile() {
  const { slug } = useParams()
  const [d, setD] = useState<DriverFull | null>(null)
  useEffect(() => { if (slug) api.driver(slug).then(setD).catch(() => {}) }, [slug])

  if (!d) return <div className="page container"><Skeleton h={200} /><div style={{ height: 16 }} /><Skeleton h={300} /></div>
  const color = d.constructor.color

  return (
    <div className="page">
      <div className="container">
        <Link to="/drivers" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> All drivers</Link>

        {/* Hero */}
        <div className="panel" style={{ overflow: 'hidden', marginBottom: 20 }}>
          <div className="row between wrap gap-3" style={{ padding: 28, background: `linear-gradient(130deg, ${color}2e, transparent 65%)` }}>
            <div className="row gap-3">
              <Avatar name={d.name} number={d.number} color={color} size={92} />
              <div>
                <span className="eyebrow">#{d.number} · {d.constructor.name}</span>
                <h1 className="display" style={{ fontSize: 'clamp(30px,5vw,52px)', margin: '4px 0' }}>{d.name}</h1>
                <span className="text-dim">{flagEmoji(d.country)} {d.country_name}</span>
              </div>
            </div>
            <Link to="/team" className="btn btn-primary">Add to team</Link>
          </div>
          <div className="row" style={{ borderTop: '1px solid var(--line)' }}>
            {[['Price', money(d.price)], ['Season pts', d.points], ['Form', <FormPill key="f" value={d.form} />], ['Owned', `${d.ownership}%`], ['Value', `${d.value}/M`]].map(([k, v], i) => (
              <div key={i} className="grow" style={{ padding: 16, borderLeft: i ? '1px solid var(--line)' : 'none' }}>
                <div className="eyebrow">{k}</div><div className="num" style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }} className="dash-grid">
          {/* Points chart */}
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 16 }}>Fantasy points · last {d.last5.length} rounds</span>
            <div style={{ marginTop: 16 }}><Sparkline data={d.last5} color={color} width={620} height={120} /></div>
            <div className="row between" style={{ marginTop: 20 }}>
              <span className="eyebrow">Last race breakdown · Round {d.history[d.history.length - 1]?.round}</span>
            </div>
            <div className="col gap-1" style={{ marginTop: 10 }}>
              {d.last_breakdown.map((b, i) => (
                <div key={i} className="row between" style={{ padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                  <span style={{ fontSize: 13 }}>{b.label}</span>
                  <span className="num" style={{ fontWeight: 700, color: b.points >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{b.points >= 0 ? '+' : ''}{b.points}</span>
                </div>
              ))}
              {!d.last_breakdown.length && <span className="text-faint" style={{ fontSize: 13 }}>No scoring events recorded.</span>}
            </div>
          </div>

          {/* Stats */}
          <div className="col gap-3">
            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 16 }}>Season stats</span>
              <div className="grid g2" style={{ marginTop: 12, gap: 8 }}>
                {[['Avg qualifying', d.stats.avg_quali ?? '—'], ['Avg finish', d.stats.avg_finish ?? '—'], ['Podiums', d.stats.podiums], ['Wins', d.stats.wins], ['Pos. gained', d.stats.positions_gained], ['Fastest laps', d.stats.fastest_laps], ['DNFs', d.stats.dnfs], ['Races', d.stats.races]].map(([k, v]) => (
                  <div key={k as string} className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="text-dim" style={{ fontSize: 13 }}>{k}</span><span className="num" style={{ fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {d.teammate && (
              <div className="panel panel-pad">
                <span className="section-title" style={{ fontSize: 16 }}>Teammate</span>
                <Link to={`/drivers/${d.teammate.slug}`} className="row between" style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
                  <span className="row gap-2"><Avatar name={d.teammate.name} number={d.teammate.number} color={color} size={34} /><span style={{ fontWeight: 600 }}>{d.teammate.name}</span></span>
                  <span className="num" style={{ fontWeight: 700 }}>{d.teammate.points} pts</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Race history */}
        <div className="panel" style={{ overflow: 'hidden', marginTop: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tower">
              <thead><tr><th>Rd</th><th>Grand Prix</th><th className="r">Grid</th><th className="r">Finish</th><th className="r">Pts</th></tr></thead>
              <tbody>
                {[...d.history].reverse().map((h) => (
                  <tr key={h.round}>
                    <td className="eyebrow">R{h.round}</td>
                    <td>{flagEmoji(h.country)} {h.race}</td>
                    <td className="r num">P{h.grid}</td>
                    <td className="r"><span className="chip" style={{ padding: '2px 7px' }}>{h.finish ? `P${h.finish}` : statusLabel(h.status)}</span></td>
                    <td className="r num" style={{ fontWeight: 800, color: h.points >= 0 ? 'var(--text)' : 'var(--loss)' }}>{h.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .dash-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
