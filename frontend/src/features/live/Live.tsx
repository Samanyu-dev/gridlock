import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Radio, Users, Swords } from 'lucide-react'
import { Countdown } from '../../components/motion'
import { Skeleton, SprintBadge } from '../../components/bits'
import { ShareButton } from '../../components/ShareButton'
import { StateBadge } from '../../components/ScoreBreakdown'
import { api } from '../../lib/api'
import { flagEmoji } from '../../lib/format'
import { useSession } from '../../lib/session'
import { getCircuitAsset } from '../../lib/gl3d/circuitManifest'
import type { LeaderboardRow, LeagueDetail, LiveBattleReport, Meta, MeResponse, OptimalTeamReport, OwnershipReport, RaceFull, WeekendScore } from '../../lib/types'

const DIFFERENTIAL_THRESHOLD = 20

// Same nested-lazy pattern as the circuit page: only fetch the 3D chunk
// when this round's circuit actually has a manifest asset.
const CircuitStage3D = lazy(() => import('../../components/gl3d').then((m) => ({ default: m.CircuitStage })))
const CIRCUIT_ASSET_BY_NAME: Record<string, string> = {
  'Circuit de Monaco': 'monaco',
  'Silverstone Circuit': 'silverstone',
  'Circuit de Spa-Francorchamps': 'spa-francorchamps',
}

export default function Live() {
  const { authed } = useSession()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [weekend, setWeekend] = useState<WeekendScore | null>(null)
  const [race, setRace] = useState<RaceFull | null>(null)
  const [round, setRound] = useState<LeaderboardRow[]>([])
  const [league, setLeague] = useState<LeagueDetail | null>(null)
  const [ownership, setOwnership] = useState<OwnershipReport | null>(null)
  const [tab, setTab] = useState<'quali' | 'race' | 'sprint_quali' | 'sprint'>('quali')
  const [showFull, setShowFull] = useState(false)
  const [rival, setRival] = useState('')
  const [battle, setBattle] = useState<LiveBattleReport | null>(null)
  const [battleErr, setBattleErr] = useState('')
  const [optimal, setOptimal] = useState<OptimalTeamReport | null>(null)

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
      api.leagues().then((r) => {
        if (r.mine[0]) {
          api.league(r.mine[0].code).then(setLeague).catch(() => {})
          api.ownership(r.mine[0].code).then(setOwnership).catch(() => {})
        } else {
          api.ownership().then(setOwnership).catch(() => {})
        }
      }).catch(() => {})
    }
  }, [authed])

  useEffect(() => {
    if (!rival) { setBattle(null); setBattleErr(''); return }
    setBattle(null); setBattleErr('')
    api.liveBattle(rival).then(setBattle).catch((e) => setBattleErr(e.message))
  }, [rival])

  useEffect(() => {
    if (!authed || !meta?.next_race || meta.next_race.round_state !== 'FINAL') { setOptimal(null); return }
    api.optimalTeam(meta.next_race.round).then(setOptimal).catch(() => setOptimal(null))
  }, [authed, meta])

  const ownershipByRef = new Map<string, { owned_pct: number; captain_pct?: number }>()
  if (ownership) {
    for (const d of ownership.drivers) ownershipByRef.set(`driver:${d.id}`, d)
    for (const c of ownership.constructors) ownershipByRef.set(`constructor:${c.id}`, c)
  }

  if (!meta) return <div className="page container"><Skeleton h={80} /><div style={{ height: 16 }} /><Skeleton h={400} /></div>

  const nr = meta.next_race
  const state = nr?.round_state ?? 'UPCOMING'
  const isSettled = state === 'PROVISIONAL' || state === 'FINAL'
  const captain = me?.team?.captain_id
  const underdog = me?.team?.active_boost === 'underdog' ? me.team.boost_driver_id : null
  const circuitAssetSlug = nr ? CIRCUIT_ASSET_BY_NAME[nr.circuit] : undefined
  const circuitAsset = circuitAssetSlug ? getCircuitAsset(circuitAssetSlug) : undefined

  return (
    <div className="page">
      <div className="container">
        {/* Weekend header */}
        <div className="panel" style={{ overflow: 'hidden', marginBottom: 16 }}>
          <div className="row between wrap gap-2" style={{ padding: 20, background: 'linear-gradient(120deg, rgba(255,33,48,0.12), transparent 55%)' }}>
            <div className="row gap-3">
              {state === 'LIVE' && <span className="chip chip-live" style={{ fontSize: 13 }}><span className="dot" />LIVE</span>}
              <div>
                <h1 className="display row gap-2" style={{ fontSize: 30, alignItems: 'center' }}>{flagEmoji(nr?.country)} {nr?.name ?? 'Season complete'}{nr?.is_sprint && <SprintBadge size="md" />}</h1>
                <span className="text-dim">{nr?.circuit} · {nr?.weather}</span>
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
            {weekend?.correction_notice && (
              <div className="panel panel-pad" style={{ borderColor: 'var(--caution)', color: 'var(--caution)', fontSize: 13 }}>
                {weekend.correction_notice}
              </div>
            )}
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
                        {(() => {
                          const o = ownershipByRef.get(a.ref)
                          if (!o) return null
                          if (a.ref === `driver:${captain}`) {
                            const eo = Math.round((o.owned_pct + (o.captain_pct ?? 0)) * 10) / 10
                            return <span className="eyebrow text-faint">Captain EO {eo}%</span>
                          }
                          if (o.owned_pct < DIFFERENTIAL_THRESHOLD) {
                            return <span className="tag-pts" style={{ color: 'var(--info)', borderColor: 'var(--info)' }}>Differential · {o.owned_pct}% owned</span>
                          }
                          return null
                        })()}
                      </span>
                      <span className="num" style={{ fontWeight: 700, color: a.subtotal >= 0 ? 'var(--text)' : 'var(--loss)' }}>{a.subtotal >= 0 ? '+' : ''}{a.subtotal}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optimal Team / Missed Points Analysis — only once the round is FINAL */}
            {optimal && (
              <div className="panel panel-pad">
                <div className="row between" style={{ alignItems: 'center' }}>
                  <span className="section-title" style={{ fontSize: 16 }}>Optimal team analysis</span>
                  <ShareButton
                    filename={`gridlock-optimal-round-${optimal.round}.png`}
                    spec={{
                      eyebrow: `Round ${optimal.round} efficiency`,
                      title: nr?.name ?? 'This round',
                      bigStat: `${optimal.efficiency}%`, bigStatLabel: 'Efficiency',
                      rows: [
                        { label: 'Your score', value: `${optimal.actual_total}` },
                        { label: 'Optimal', value: `${optimal.optimal_total}` },
                        { label: 'Missed', value: `${optimal.missed_points}` },
                      ],
                    }}
                  />
                </div>
                <div className="grid g3" style={{ marginTop: 12, gap: 8 }}>
                  <div className="col" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="eyebrow">Your score</span><span className="num" style={{ fontWeight: 800, fontSize: 20 }}>{optimal.actual_total}</span>
                  </div>
                  <div className="col" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="eyebrow">Optimal</span><span className="num" style={{ fontWeight: 800, fontSize: 20 }}>{optimal.optimal_total}</span>
                  </div>
                  <div className="col" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="eyebrow">Efficiency</span>
                    <span className="num" style={{ fontWeight: 800, fontSize: 20, color: optimal.efficiency >= 80 ? 'var(--gain)' : optimal.efficiency >= 50 ? 'var(--caution)' : 'var(--loss)' }}>{optimal.efficiency}%</span>
                  </div>
                </div>
                {optimal.breakdown.length > 0 && (
                  <>
                    <p className="text-faint" style={{ fontSize: 12, margin: '14px 0 8px' }}>Where points were left behind ({optimal.missed_points} total missed)</p>
                    <div className="col gap-1">
                      {optimal.breakdown.slice(0, 6).map((row) => (
                        <div key={row.ref} className="row between" style={{ padding: '5px 0', fontSize: 13 }}>
                          <span className="row gap-2"><span className="team-dot" style={{ background: row.color }} />{row.short || row.name}</span>
                          <span className="num text-dim">{row.mine} → <span style={{ color: 'var(--gain)', fontWeight: 700 }}>{row.optimal}</span></span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Session tabs: qualifying / sprint / race classification */}
            {race && (() => {
              const isQualiTab = tab === 'quali' || tab === 'sprint_quali'
              const rows = tab === 'quali' ? race.quali : tab === 'sprint_quali' ? race.sprint_quali : tab === 'sprint' ? race.sprint_classification : race.classification
              return (
                <div className="panel" style={{ overflow: 'hidden' }}>
                  <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                    <div className="seg" style={{ flexWrap: 'wrap' }}>
                      {race.is_sprint && <button className={tab === 'sprint_quali' ? 'active' : ''} onClick={() => setTab('sprint_quali')}>Sprint Grid</button>}
                      {race.is_sprint && <button className={tab === 'sprint' ? 'active' : ''} onClick={() => setTab('sprint')}>Sprint</button>}
                      <button className={tab === 'quali' ? 'active' : ''} onClick={() => setTab('quali')}>Qualifying</button>
                      <button className={tab === 'race' ? 'active' : ''} onClick={() => setTab('race')}>Race</button>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tower">
                      {isQualiTab ? (
                        <>
                          <thead><tr><th>P</th><th>Driver</th><th className="hide-mobile">Team</th></tr></thead>
                          <tbody>
                            {rows.length === 0 && <tr><td colSpan={3} className="text-faint" style={{ padding: 16 }}>No data yet.</td></tr>}
                            {(rows as typeof race.quali).slice(0, showFull ? undefined : 5).map((q) => (
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
                            {rows.length === 0 && <tr><td colSpan={4} className="text-faint" style={{ padding: 16 }}>No data yet.</td></tr>}
                            {(rows as typeof race.classification).slice(0, showFull ? undefined : 5).map((c) => (
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
                  {rows.length > 5 && (
                    <button className="row center gap-2" style={{ width: '100%', padding: 10, background: 'transparent', border: 'none', color: 'var(--text-faint)', borderTop: '1px solid var(--line-soft)' }} onClick={() => setShowFull((v) => !v)}>
                      {showFull ? 'Show less' : 'Show full classification'} <ChevronDown size={14} style={{ transform: showFull ? 'rotate(180deg)' : 'none' }} />
                    </button>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="col gap-3">
            {/* Circuit overview — only for circuits with a 3D asset so far */}
            {circuitAsset && (
              <div className="panel" style={{ overflow: 'hidden' }}>
                <div style={{ height: 220, position: 'relative' }}>
                  <Suspense fallback={<div style={{ height: '100%', background: '#05060a' }} />}>
                    <CircuitStage3D asset={circuitAsset} preset="TOP" detail="compact" interactive={false} />
                  </Suspense>
                  <span className="chip" style={{ position: 'absolute', top: 10, left: 10, color: 'var(--red)', borderColor: 'var(--red)' }}>{state}</span>
                </div>
                <div className="row between" style={{ padding: '8px 14px' }}>
                  <span className="eyebrow">{nr?.circuit}</span>
                  <Link to={`/circuits/${nr?.slug}`} className="eyebrow">Full circuit →</Link>
                </div>
              </div>
            )}

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

            {/* Live League Battle */}
            {league && league.members.filter((m) => !m.is_me).length > 0 && (
              <div className="panel panel-pad">
                <div className="row between" style={{ marginBottom: 10 }}>
                  <span className="section-title" style={{ fontSize: 15 }}><Swords size={14} style={{ verticalAlign: -2 }} /> Live battle</span>
                  <select className="select" style={{ width: 'auto', fontSize: 12 }} value={rival} onChange={(e) => setRival(e.target.value)}>
                    <option value="">Pick a rival…</option>
                    {league.members.filter((m) => !m.is_me).map((m) => (
                      <option key={m.manager} value={m.manager.replace(/^@/, '')}>{m.team_name}</option>
                    ))}
                  </select>
                </div>
                {battleErr && <p className="text-faint" style={{ fontSize: 13 }}>{battleErr}</p>}
                {rival && !battle && !battleErr && <Skeleton h={100} />}
                {battle && (
                  <>
                    <div className="row between" style={{ padding: '8px 0' }}>
                      <div className="col"><span className="eyebrow">You</span><span className="num" style={{ fontWeight: 800, fontSize: 22, color: 'var(--gain)' }}>+{battle.mine.total}</span></div>
                      <span className="chip" style={{ alignSelf: 'center', color: battle.swing >= 0 ? 'var(--gain)' : 'var(--loss)', borderColor: battle.swing >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                        {battle.swing >= 0 ? '+' : ''}{battle.swing} swing
                      </span>
                      <div className="col" style={{ alignItems: 'flex-end' }}><span className="eyebrow">{battle.rival_team_name}</span><span className="num" style={{ fontWeight: 800, fontSize: 22 }}>+{battle.rival.total}</span></div>
                    </div>
                    <p className="text-faint" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                      Projected gap after this round: {battle.gap_projected >= 0 ? '+' : ''}{battle.gap_projected} (was {battle.gap_before >= 0 ? '+' : ''}{battle.gap_before})
                    </p>
                    {battle.captain_battle.mine && battle.captain_battle.rival && (
                      <div className="row between" style={{ padding: '6px 0', borderTop: '1px solid var(--line-soft)', fontSize: 13 }}>
                        <span className="text-dim">Captain battle</span>
                        <span>{battle.captain_battle.mine.short} {battle.captain_battle.mine.subtotal} vs {battle.captain_battle.rival.subtotal} {battle.captain_battle.rival.short}</span>
                      </div>
                    )}
                    <div className="col gap-1" style={{ marginTop: 8 }}>
                      {battle.swings.slice(0, 6).map((sw) => (
                        <div key={sw.ref} className="row between" style={{ padding: '5px 0', fontSize: 13 }}>
                          <span className="row gap-2"><span className="team-dot" style={{ background: sw.color }} />{sw.short || sw.name}</span>
                          <span className="num" style={{ fontWeight: 700, color: sw.delta >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{sw.delta >= 0 ? '+' : ''}{sw.delta}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
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
