import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Radio, Users } from 'lucide-react'
import { Countdown } from '../../components/motion'
import { Skeleton } from '../../components/bits'
import { StateBadge } from '../../components/ScoreBreakdown'
import { api } from '../../lib/api'
import { flagEmoji } from '../../lib/format'
import { useSession } from '../../lib/session'
import type { LeaderboardRow, LeagueDetail, Meta, MeResponse, RaceFull, WeekendScore } from '../../lib/types'

export default function Live() {
  const { authed } = useSession()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [weekend, setWeekend] = useState<WeekendScore | null>(null)
  const [race, setRace] = useState<RaceFull | null>(null)
  const [round, setRound] = useState<LeaderboardRow[]>([])
  const [league, setLeague] = useState<LeagueDetail | null>(null)
  const [tab, setTab] = useState<'quali' | 'race'>('quali')
  const [showFull, setShowFull] = useState(false)

  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m)
      const rid = m.next_round
      api.teamScore(rid).then(setWeekend).catch(() => {})
      api.leaderboardRound(rid, { limit: 5 }).then((r) => setRound(r.entries)).catch(() => {})
      if (m.next_race) api.race(m.next_race.slug).then(setRace).catch(() => {})
    }).catch(() => {})
    if (authed) {
      api.me().then(setMe).catch(() => {})
      api.leagues().then((r) => { if (r.mine[0]) api.league(r.mine[0].code).then(setLeague).catch(() => {}) }).catch(() => {})
    }
  }, [authed])

  if (!meta) return <div className="page container"><Skeleton h={80} /><div style={{ height: 16 }} /><Skeleton h={400} /></div>

  const nr = meta.next_race
  const state = nr?.round_state ?? 'UPCOMING'
  const isSettled = state === 'PROVISIONAL' || state === 'FINAL'
  const captain = me?.team?.captain_id
  const underdog = me?.team?.active_boost === 'underdog' ? me.team.boost_driver_id : null

  return (
    <div className="page">
      <div className="container">
        {/* Weekend header */}
        <div className="panel" style={{ overflow: 'hidden', marginBottom: 16 }}>
          <div className="row between wrap gap-2" style={{ padding: 20, background: 'linear-gradient(120deg, rgba(255,33,48,0.12), transparent 55%)' }}>
            <div className="row gap-3">
              {state === 'LIVE' && <span className="chip chip-live" style={{ fontSize: 13 }}><span className="dot" />LIVE</span>}
              <div>
                <h1 className="display" style={{ fontSize: 30 }}>{flagEmoji(nr?.country)} {nr?.name ?? 'Season complete'}</h1>
                <span className="text-dim">{nr?.circuit}{nr?.is_sprint ? ' · Sprint weekend' : ''} · {nr?.weather}</span>
              </div>
            </div>
            <div className="col" style={{ alignItems: 'flex-end' }}>
              <span className="eyebrow" style={{ marginBottom: 6 }}>
                {state === 'OPEN' && 'Team locks in'}
                {state === 'LOCKED' && 'Race starts in'}
                {state === 'LIVE' && 'Session in progress'}
                {state === 'PROVISIONAL' && 'Awaiting reconciliation'}
                {state === 'FINAL' && 'Round complete'}
              </span>
              {(state === 'OPEN' || state === 'LOCKED') && nr && <Countdown iso={state === 'OPEN' ? nr.deadline : nr.race_start} />}
              {(state === 'LIVE' || isSettled) && <StateBadge state={state === 'LIVE' ? 'live' : state === 'PROVISIONAL' ? 'provisional' : 'final'} />}
            </div>
          </div>
          {meta.last_synced_at && (
            <div className="row between" style={{ padding: '8px 20px', borderTop: '1px solid var(--line)', fontSize: 12 }}>
              <span className="text-faint">Data synced {new Date(meta.last_synced_at).toLocaleTimeString()}</span>
              {isSettled && state === 'PROVISIONAL' && <span style={{ color: 'var(--caution)' }}>Results are provisional until FIA reconciliation</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }} className="live-grid">
          <div className="col gap-3">
            {/* Your performance */}
            {me?.score ? (
              <div className="grid g4">
                <div className="panel stat"><div className="k">Round points</div><div className="v">{weekend?.total ?? 0}</div></div>
                <div className="panel stat"><div className="k">Rank</div><div className="v">#{me.rank}</div><div className="sub">of {me.field_size}</div></div>
                <div className="panel stat"><div className="k">Gap to leader</div><div className="v">{me.gap_to_leader ? `−${me.gap_to_leader}` : '—'}</div></div>
                <div className="panel stat"><div className="k">Season total</div><div className="v">{me.score.total}</div></div>
              </div>
            ) : authed && (
              <div className="panel panel-pad"><span className="text-dim">Build your team to see live points here.</span> <Link to="/team" className="btn btn-primary btn-sm" style={{ marginLeft: 10 }}>Build team</Link></div>
            )}

            {/* Your squad — real ledger, same format as the historical breakdown */}
            {weekend && weekend.assets.length > 0 && (
              <div className="panel panel-pad">
                <div className="row between" style={{ marginBottom: 4 }}>
                  <span className="section-title" style={{ fontSize: 16 }}>Your squad this round</span>
                  {underdog && <span className="tag-pts tag-fl">Underdog armed</span>}
                </div>
                <div className="col gap-1" style={{ marginTop: 10 }}>
                  {weekend.assets.map((a) => (
                    <div key={a.ref} className="row between race-edge" style={{ ['--accent' as string]: a.color, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                      <span className="row gap-2">
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{a.short || a.name}</span>
                        {a.ref === `driver:${captain}` && <span className="tag-pts tag-fl">2×</span>}
                        {a.ref === `driver:${underdog}` && <span className="tag-pts tag-gain">UNDERDOG</span>}
                      </span>
                      <span className="num" style={{ fontWeight: 700, color: a.subtotal >= 0 ? 'var(--text)' : 'var(--loss)' }}>{a.subtotal >= 0 ? '+' : ''}{a.subtotal}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Session tabs: qualifying / race classification */}
            {race && (
              <div className="panel" style={{ overflow: 'hidden' }}>
                <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                  <div className="seg">
                    <button className={tab === 'quali' ? 'active' : ''} onClick={() => setTab('quali')}>Qualifying</button>
                    <button className={tab === 'race' ? 'active' : ''} onClick={() => setTab('race')}>Race</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tower">
                    {tab === 'quali' ? (
                      <>
                        <thead><tr><th>P</th><th>Driver</th><th className="hide-mobile">Team</th></tr></thead>
                        <tbody>
                          {race.quali.length === 0 && <tr><td colSpan={3} className="text-faint" style={{ padding: 16 }}>No qualifying data yet.</td></tr>}
                          {race.quali.slice(0, showFull ? undefined : 5).map((q) => (
                            <tr key={q.driver_id}>
                              <td><span className="pos">{String(q.position).padStart(2, '0')}</span></td>
                              <td><span className="row gap-2"><span className="team-dot" style={{ background: q.color, height: 16 }} />{q.name}</span></td>
                              <td className="hide-mobile text-dim">{q.constructor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    ) : (
                      <>
                        <thead><tr><th>P</th><th>Driver</th><th className="hide-mobile">Team</th><th className="r">Δ</th></tr></thead>
                        <tbody>
                          {race.classification.length === 0 && <tr><td colSpan={4} className="text-faint" style={{ padding: 16 }}>No race data yet.</td></tr>}
                          {race.classification.slice(0, showFull ? undefined : 5).map((c) => (
                            <tr key={c.driver_id}>
                              <td><span className="pos">{c.finish ? String(c.finish).padStart(2, '0') : '—'}</span></td>
                              <td><span className="row gap-2"><span className="team-dot" style={{ background: c.color, height: 16 }} />{c.name}{c.fastest_lap && <span className="tag-pts tag-fl">FL</span>}</span></td>
                              <td className="hide-mobile text-dim">{c.constructor}</td>
                              <td className="r">{c.delta != null && <span className="delta" style={{ color: c.delta > 0 ? 'var(--gain)' : c.delta < 0 ? 'var(--loss)' : 'var(--text-faint)' }}>{c.delta > 0 ? `+${c.delta}` : c.delta}</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}
                  </table>
                </div>
                {(race.quali.length > 5 || race.classification.length > 5) && (
                  <button className="row center gap-2" style={{ width: '100%', padding: 10, background: 'transparent', border: 'none', color: 'var(--text-faint)', borderTop: '1px solid var(--line-soft)' }} onClick={() => setShowFull((v) => !v)}>
                    {showFull ? 'Show less' : 'Show full classification'} <ChevronDown size={14} style={{ transform: showFull ? 'rotate(180deg)' : 'none' }} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="col gap-3">
            {/* This round's biggest movers */}
            {round.length > 0 && (
              <div className="panel panel-pad">
                <span className="section-title" style={{ fontSize: 15 }}>Biggest scorers this round</span>
                <div className="col gap-1" style={{ marginTop: 10 }}>
                  {round.map((r) => (
                    <div key={r.manager} className="row between" style={{ padding: '6px 0' }}>
                      <span className="row gap-2"><span className={`pos pos-${r.rank}`}>{r.rank}</span>{r.team_name}</span>
                      <span className="num" style={{ fontWeight: 700, color: 'var(--gain)' }}>+{r.last_race}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mini league board */}
            {league && (
              <div className="panel panel-pad">
                <div className="row between" style={{ marginBottom: 10 }}>
                  <span className="section-title" style={{ fontSize: 15 }}><Users size={14} style={{ verticalAlign: -2 }} /> {league.name}</span>
                  <Link to={`/leagues/${league.code}`} className="eyebrow">View league</Link>
                </div>
                <div className="col gap-1">
                  {league.members.slice(0, 5).map((m) => (
                    <div key={m.manager} className="row between" style={{ padding: '6px 0', background: m.is_me ? 'color-mix(in srgb, var(--red) 9%, transparent)' : undefined }}>
                      <span className="row gap-2"><span className={`pos pos-${m.league_rank}`}>{m.league_rank}</span>{m.team_name}</span>
                      <span className="num" style={{ fontWeight: 700 }}>{m.total.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!authed && (
              <div className="panel panel-pad" style={{ textAlign: 'center' }}>
                <Radio size={22} className="text-faint" style={{ margin: '0 auto 10px' }} />
                <p className="text-dim" style={{ fontSize: 13, marginBottom: 12 }}>Sign in to see your live points and league position.</p>
                <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .live-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
