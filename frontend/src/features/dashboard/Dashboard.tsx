import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Circle, Sparkles, Flag, TrendingUp } from 'lucide-react'
import { Countdown, CountUp } from '../../components/motion'
import { Avatar, Skeleton } from '../../components/bits'
import { ScoreBreakdown } from '../../components/ScoreBreakdown'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { useMeta } from '../../lib/meta'
import { flagEmoji, money } from '../../lib/format'
import type { Driver, Constructor, Insight, MeResponse } from '../../lib/types'

export default function Dashboard() {
  const { authed, profile } = useSession()
  const meta = useMeta()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [drivers, setDrivers] = useState<Map<number, Driver>>(new Map())
  const [constructors, setConstructors] = useState<Map<number, Constructor>>(new Map())
  const [insights, setInsights] = useState<Insight[]>([])

  useEffect(() => {
    if (authed) api.me().then(setMe).catch(() => {})
    api.drivers().then((r) => setDrivers(new Map(r.drivers.map((d) => [d.id, d])))).catch(() => {})
    api.constructors().then((r) => setConstructors(new Map(r.constructors.map((c) => [c.id, c])))).catch(() => {})
    api.insights().then((r) => setInsights(r.insights)).catch(() => {})
  }, [authed])

  const nr = meta?.next_race
  const team = me?.team
  const hasTeam = !!team?.driver_ids?.length
  const checklist = [
    { label: 'Team complete', done: (team?.driver_ids.length ?? 0) === (meta?.config.roster.drivers ?? 5) && (team?.constructor_ids.length ?? 0) === (meta?.config.roster.constructors ?? 2) },
    { label: 'Captain selected', done: !!team?.captain_id },
    { label: 'Boost armed', done: !!team?.active_boost },
    { label: 'Transfers available', done: false },
  ]

  return (
    <div className="page">
      <div className="container">
        {/* Hero */}
        <motion.div className="panel panel-glow" style={{ overflow: 'hidden', marginBottom: 20 }}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="row between wrap gap-3" style={{ padding: 24, background: 'linear-gradient(120deg, rgba(255,33,48,0.10), transparent 60%)' }}>
            <div>
              <span className="eyebrow">Next Race · Round {nr?.round}</span>
              <h1 className="display" style={{ fontSize: 'clamp(30px,5vw,52px)', margin: '6px 0' }}>
                {flagEmoji(nr?.country)} {nr ? nr.name : <Skeleton w={280} h={44} />}
              </h1>
              <span className="text-dim">{nr?.circuit} · {nr?.location}, {nr?.country_name} · {nr?.weather}</span>
            </div>
            <div className="col" style={{ alignItems: 'flex-end' }}>
              <span className="eyebrow" style={{ marginBottom: 10 }}>Team locks in</span>
              {nr && <Countdown iso={nr.deadline} />}
              <Link to="/team" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>
                {hasTeam ? 'Manage team' : 'Build team'} <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Fantasy overview */}
        <div className="grid g4" style={{ marginBottom: 20 }}>
          {hasTeam && me?.score ? (
            <>
              <Stat k="Total points" v={<CountUp value={me.score.total} />} sub="Projected season" accent="var(--red)" />
              <Stat k="Overall rank" v={<>#<CountUp value={me.rank ?? 0} /></>} sub={`Top ${me.percentile}%`} accent="var(--info)" />
              <Stat k="Last race" v={<CountUp value={me.score.last_race_points} />} sub={`Round ${(meta?.next_round ?? 1) - 1}`} accent="var(--gain)" />
              <Stat k="Captain bonus" v={<CountUp value={me.score.captain_bonus} />} sub="1.5× multiplier" accent="var(--purple)" />
            </>
          ) : (
            <div className="panel panel-pad g4" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
              <Sparkles size={22} style={{ color: 'var(--red)' }} />
              <h3 className="section-title" style={{ margin: '10px 0 6px' }}>You haven't built your grid yet</h3>
              <p className="text-dim" style={{ marginBottom: 16 }}>Draft five drivers and two constructors to join the {meta?.season} season.</p>
              <Link to="/team" className="btn btn-primary">Build my team <ArrowRight size={16} /></Link>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }} className="dash-grid">
          {/* Team snapshot */}
          <div className="panel panel-pad">
            <div className="row between" style={{ marginBottom: 16 }}>
              <span className="section-title" style={{ fontSize: 16 }}>{profile?.team_name || 'My Grid'}</span>
              <Link to="/team" className="eyebrow" style={{ color: 'var(--info)' }}>Edit lineup →</Link>
            </div>
            {hasTeam ? (
              <>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                  {team!.driver_ids.map((id) => {
                    const d = drivers.get(id)
                    if (!d) return <Skeleton key={id} h={110} />
                    return (
                      <div key={id} className="col center panel" style={{ padding: 10, gap: 6, textAlign: 'center', position: 'relative', borderColor: d.constructor.color + '55' }}>
                        {team!.captain_id === id && <span style={{ position: 'absolute', top: 5, left: 5, background: 'var(--red)', color: '#fff', width: 20, height: 20, borderRadius: 5, fontWeight: 800, fontSize: 11, display: 'grid', placeItems: 'center' }}>C</span>}
                        <Avatar name={d.name} number={d.number} color={d.constructor.color} size={40} />
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{d.short}</div>
                        <div className="eyebrow">{d.last5[d.last5.length - 1] ?? 0} pts</div>
                      </div>
                    )
                  })}
                </div>
                <div className="grid g2" style={{ marginTop: 12 }}>
                  {team!.constructor_ids.map((id) => {
                    const c = constructors.get(id)
                    if (!c) return <Skeleton key={id} h={54} />
                    return (
                      <div key={id} className="row between panel race-edge" style={{ ['--accent' as string]: c.color, padding: '10px 12px' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                        <span className="eyebrow">{money(c.price)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="empty"><Flag className="glyph" /><p className="text-dim">No lineup yet — the garage is empty.</p></div>
            )}
          </div>

          {/* Weekend checklist */}
          <div className="col gap-3">
            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 16 }}>Weekend checklist</span>
              <div className="col gap-1" style={{ marginTop: 12 }}>
                {checklist.map((c) => (
                  <div key={c.label} className="row gap-2" style={{ padding: '8px 0' }}>
                    {c.done ? <Check size={18} style={{ color: 'var(--gain)' }} /> : <Circle size={18} className="text-faint" />}
                    <span style={{ color: c.done ? 'var(--text)' : 'var(--text-dim)', textDecoration: c.done ? 'none' : 'none' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Auditable weekend ledger */}
        {me?.weekend && me.weekend.assets.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <ScoreBreakdown weekend={me.weekend} />
          </div>
        )}

        {/* Insights */}
        <div style={{ marginTop: 20 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="section-title" style={{ fontSize: 16 }}><TrendingUp size={16} style={{ verticalAlign: -2 }} /> Paddock insights</span>
            <span className="chip" style={{ padding: '3px 8px' }}>Demo data</span>
          </div>
          <div className="grid g3">
            {insights.map((ins, i) => (
              <motion.div key={i} className="panel panel-pad race-edge" style={{ ['--accent' as string]: 'var(--info)' }}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <p style={{ fontSize: 14, lineHeight: 1.5 }}>{ins.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .dash-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

function Stat({ k, v, sub, accent }: { k: string; v: React.ReactNode; sub: string; accent: string }) {
  return (
    <div className="panel stat race-edge" style={{ ['--accent' as string]: accent }}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="sub">{sub}</div>
    </div>
  )
}
