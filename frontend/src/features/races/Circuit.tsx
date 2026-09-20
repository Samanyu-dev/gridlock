import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { Countdown } from '../../components/motion'
import { CircuitTrace } from './CircuitTrace'
import { Skeleton, SprintBadge } from '../../components/bits'
import { api } from '../../lib/api'
import { flagEmoji, localTime, localWeekday, userTimezone } from '../../lib/format'
import { getCircuitAssetForRace } from '../../lib/gl3d/circuitManifest'
import type { Driver, Constructor, RaceFull } from '../../lib/types'

// three.js/R3F only loads when this circuit actually has a 3D asset, so
// this stays a nested lazy import rather than a top-level one.
const CircuitStage3D = lazy(() => import('../../components/gl3d').then((m) => ({ default: m.CircuitStage })))

export default function Circuit() {
  const { slug } = useParams()
  const [r, setR] = useState<RaceFull | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [constructors, setConstructors] = useState<Constructor[]>([])

  useEffect(() => { if (slug) api.race(slug).then(setR).catch(() => {}) }, [slug])
  useEffect(() => {
    api.drivers({ sort: 'form' }).then((res) => setDrivers(res.drivers.slice(0, 5))).catch(() => {})
    api.constructors({ sort: 'form' }).then((res) => setConstructors(res.constructors.slice(0, 3))).catch(() => {})
  }, [])

  if (!r) return <div className="page container"><Skeleton h={220} /></div>
  const done = r.status === 'completed'
  const podium = r.classification.filter((c) => c.finish && c.finish <= 3)
  const circuitAsset = getCircuitAssetForRace(r.circuit)

  return (
    <div className="page">
      <div className="container">
        <Link to="/races" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Calendar</Link>

        <div className="panel" style={{ overflow: 'hidden', marginBottom: 20 }}>
          {circuitAsset ? (
            <div style={{ height: 340, position: 'relative' }}>
              <Suspense fallback={<div style={{ height: '100%', background: '#05060a' }} />}>
                <CircuitStage3D asset={circuitAsset} preset="HERO" detail="full" />
              </Suspense>
              <div className="row between" style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 20, background: 'linear-gradient(180deg, rgba(5,6,10,.75), transparent)' }}>
                <span className="eyebrow row gap-2" style={{ alignItems: 'center', color: '#fff' }}>{flagEmoji(r.country)} {r.country_name}{r.is_sprint && <SprintBadge />}</span>
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, background: 'linear-gradient(0deg, rgba(5,6,10,.85), transparent)' }}>
                <h1 className="display" style={{ fontSize: 'clamp(28px,4.5vw,48px)', margin: 0, color: '#fff' }}>{r.circuit}</h1>
                <span style={{ color: 'var(--text-dim)' }}>Host of Round {r.round} · {r.name} · drag to orbit, scroll to zoom</span>
              </div>
            </div>
          ) : (
            <div className="row between wrap" style={{ padding: 28 }}>
              <div>
                <span className="eyebrow row gap-2" style={{ alignItems: 'center' }}>{flagEmoji(r.country)} {r.country_name}{r.is_sprint && <SprintBadge />}</span>
                <h1 className="display" style={{ fontSize: 'clamp(30px,5vw,54px)', margin: '4px 0' }}>{r.circuit}</h1>
                <span className="text-dim">Host of Round {r.round} · {r.name}</span>
              </div>
              <div style={{ width: 260, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {r.circuit_image_url
                  ? <img src={r.circuit_image_url} alt={r.circuit} style={{ height: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  : <CircuitTrace seed={r.slug} height={150} />}
              </div>
            </div>
          )}
          {!done && (
            <div className="row between wrap gap-2" style={{ padding: '16px 28px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <span className="eyebrow">Fantasy deadline · {userTimezone()}</span>
              <Countdown iso={r.deadline} />
            </div>
          )}
        </div>

        <div className="grid g4" style={{ marginBottom: 20 }}>
          {[['Laps', r.laps], ['Length', `${r.length_km} km`], ['Distance', `${(r.laps * r.length_km).toFixed(0)} km`], ['Weather', r.weather]].map(([k, v], i) => (
            <div key={i} className="panel stat"><div className="k">{k}</div><div className="v" style={{ fontSize: 22 }}>{v}</div></div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }} className="dash-grid">
          <div className="col gap-3">
            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 16 }}>Session schedule</span>
              <div className="col gap-1" style={{ marginTop: 10 }}>
                {r.sessions.map((s) => (
                  <div key={s.kind} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <span className="row gap-2"><span className="chip" style={{ minWidth: 60, justifyContent: 'center' }}>{s.kind}</span><span style={{ fontWeight: 600 }}>{s.label}</span></span>
                    <span className="num text-dim">{localWeekday(s.start)} · {localTime(s.start)}</span>
                  </div>
                ))}
              </div>
              <div className="text-faint" style={{ marginTop: 8, fontSize: 12 }}>Times shown in your local timezone ({userTimezone()}).</div>
            </div>

            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 16 }}>GRIDLOCK history at {r.circuit}</span>
              {done ? (
                <>
                  <p className="text-faint" style={{ fontSize: 12, marginBottom: 10 }}>This round's podium</p>
                  <div className="col gap-1">
                    {podium.map((p, i) => (
                      <div key={p.driver_id} className="row between" style={{ padding: '6px 0' }}>
                        <span className="row gap-2"><span className={`pos pos-${i + 1}`}>{i + 1}</span><span className="team-dot" style={{ background: p.color }} />{p.name}</span>
                        <span className="text-dim">{p.constructor}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-dim" style={{ fontSize: 13 }}>Awaiting this round's race weekend.</p>
              )}
              <p className="text-faint" style={{ fontSize: 12, marginTop: 12 }}>
                GRIDLOCK is in its first season — multi-year form at this circuit will build up here as it's revisited in future seasons.
              </p>
              <Link to={`/races/${r.slug}`} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>View full weekend →</Link>
            </div>
          </div>

          <div className="col gap-3">
            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 15 }}><TrendingUp size={14} style={{ verticalAlign: -2 }} /> In form heading in</span>
              <div className="col gap-1" style={{ marginTop: 10 }}>
                {drivers.map((d) => (
                  <Link key={d.id} to={`/drivers/${d.slug}`} className="row between" style={{ padding: '6px 0' }}>
                    <span className="row gap-2"><span className="team-dot" style={{ background: d.constructor.color }} />{d.name}</span>
                    <span className="num" style={{ fontWeight: 700 }}>{d.form.toFixed(1)}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 15 }}>Constructors in form</span>
              <div className="col gap-1" style={{ marginTop: 10 }}>
                {constructors.map((c) => (
                  <Link key={c.id} to={`/constructors/${c.slug}`} className="row between" style={{ padding: '6px 0' }}>
                    <span className="row gap-2"><span className="team-dot" style={{ background: c.color }} />{c.name}</span>
                    <span className="num" style={{ fontWeight: 700 }}>{c.form.toFixed(1)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .dash-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
