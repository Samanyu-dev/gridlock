import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X, Search, Info, Check, Lock, ArrowRight, AlertTriangle } from 'lucide-react'
import { Avatar, PriceDelta, FormPill } from '../../components/bits'
import { CountUp, Countdown } from '../../components/motion'
import { DriverDrawer } from './DriverDrawer'
import { BoostBar } from './BoostBar'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { useMeta } from '../../lib/meta'
import { money } from '../../lib/format'
import type { Constructor, Driver } from '../../lib/types'

export default function TeamBuilder() {
  const { authed } = useSession()
  const meta = useMeta()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [constructors, setConstructors] = useState<Constructor[]>([])
  const [selDrivers, setSelDrivers] = useState<number[]>([])
  const [selConstructors, setSelConstructors] = useState<number[]>([])
  const [captain, setCaptain] = useState<number | null>(null)
  const [boost, setBoost] = useState<string | null>(null)
  const [boostDriver, setBoostDriver] = useState<number | null>(null)
  const [view, setView] = useState<'lineup' | 'market'>('lineup')
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers')
  const [sort, setSort] = useState('points')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const [savedTeam, setSavedTeam] = useState<{ driver_ids: number[]; constructor_ids: number[]; free_transfers: number } | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  useEffect(() => {
    api.drivers({ sort: 'points' }).then((r) => setDrivers(r.drivers)).catch(() => {})
    api.constructors().then((r) => setConstructors(r.constructors)).catch(() => {})
    if (authed) api.me().then((m) => {
      if (m.team) {
        setSelDrivers(m.team.driver_ids); setSelConstructors(m.team.constructor_ids)
        setCaptain(m.team.captain_id); setBoost(m.team.active_boost); setBoostDriver(m.team.boost_driver_id ?? null)
        setSavedTeam({ driver_ids: m.team.driver_ids, constructor_ids: m.team.constructor_ids, free_transfers: m.team.free_transfers })
      }
    }).catch(() => {})
  }, [authed])

  const locked = meta?.locked ?? false

  const dMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers])
  const cMap = useMemo(() => new Map(constructors.map((c) => [c.id, c])), [constructors])
  const budget = meta?.config.budget ?? 300
  const maxD = meta?.config.roster.drivers ?? 10
  const maxC = meta?.config.roster.constructors ?? 2

  const cost = useMemo(() => {
    let c = 0
    selDrivers.forEach((id) => (c += dMap.get(id)?.price ?? 0))
    selConstructors.forEach((id) => (c += cMap.get(id)?.price ?? 0))
    return Math.round(c * 10) / 10
  }, [selDrivers, selConstructors, dMap, cMap])
  const remaining = Math.round((budget - cost) * 10) / 10
  const complete = selDrivers.length === maxD && selConstructors.length === maxC
  const warn = remaining < 0
  const noCaptain = complete && !captain

  const toggleDriver = (d: Driver) => {
    if (locked) return
    if (selDrivers.includes(d.id)) {
      setSelDrivers((s) => s.filter((x) => x !== d.id))
      if (captain === d.id) setCaptain(null)
    } else if (selDrivers.length < maxD && remaining - d.price >= -1e-6) {
      setSelDrivers((s) => [...s, d.id])
    }
  }
  const toggleConstructor = (c: Constructor) => {
    if (locked) return
    if (selConstructors.includes(c.id)) setSelConstructors((s) => s.filter((x) => x !== c.id))
    else if (selConstructors.length < maxC && remaining - c.price >= -1e-6) setSelConstructors((s) => [...s, c.id])
  }

  const filtered = useMemo(() => {
    let arr = [...drivers]
    if (search) arr = arr.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()) || d.short.toLowerCase().includes(search.toLowerCase()))
    const key: Record<string, (d: Driver) => number> = {
      points: (d) => d.points, price: (d) => d.price, form: (d) => d.form, ownership: (d) => d.ownership, value: (d) => d.value,
    }
    arr.sort((a, b) => (key[sort] || key.points)(b) - (key[sort] || key.points)(a))
    return arr
  }, [drivers, search, sort])

  // Transfer Centre diff — who's actually changing, vs the last saved team.
  const outDrivers = useMemo(() => (savedTeam ? savedTeam.driver_ids.filter((id) => !selDrivers.includes(id)) : []), [savedTeam, selDrivers])
  const inDrivers = useMemo(() => (savedTeam ? selDrivers.filter((id) => !savedTeam.driver_ids.includes(id)) : []), [savedTeam, selDrivers])
  const outConstructors = useMemo(() => (savedTeam ? savedTeam.constructor_ids.filter((id) => !selConstructors.includes(id)) : []), [savedTeam, selConstructors])
  const inConstructors = useMemo(() => (savedTeam ? selConstructors.filter((id) => !savedTeam.constructor_ids.includes(id)) : []), [savedTeam, selConstructors])
  const transferCount = outDrivers.length + outConstructors.length
  const freeAvailable = savedTeam?.free_transfers ?? meta?.config.free_transfers ?? 1
  const penalizedCount = Math.max(0, transferCount - freeAvailable)
  const projectedPenalty = penalizedCount * (meta?.config.extra_transfer_cost ?? 5)

  const attemptSave = async () => {
    if (!authed || !complete || locked) return
    setServerErrors([])
    const check = await api.validateTeam({ driver_ids: selDrivers, constructor_ids: selConstructors, captain_id: captain }).catch(() => null)
    if (check && !check.valid) { setServerErrors(check.errors); return }
    if (noCaptain) return
    // First pick or no real changes: save straight away, no review needed.
    if (!savedTeam || transferCount === 0) { save(); return }
    setReviewOpen(true)
  }

  const save = async () => {
    setSaving(true)
    setReviewOpen(false)
    try {
      const res = await api.saveTeam({
        driver_ids: selDrivers, constructor_ids: selConstructors,
        captain_id: captain, active_boost: boost, boost_driver_id: boost ? boostDriver : null,
      })
      const t = res.transfers
      const penaltyNote = t && t.penalty ? ` · ${t.penalized} extra transfer${t.penalized > 1 ? 's' : ''} (−${t.penalty} pts)` : ''
      setToast(`Team locked in — projected rank #${res.rank.toLocaleString()} of ${res.field_size.toLocaleString()}${penaltyNote}`)
      setSavedTeam({ driver_ids: selDrivers, constructor_ids: selConstructors, free_transfers: res.team.free_transfers })
      setTimeout(() => setToast(null), 4500)
    } catch (e) { setServerErrors([(e as Error).message]) }
    finally { setSaving(false) }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-head row between wrap gap-2">
          <div>
            <span className="eyebrow">Team builder · Round {meta?.next_round}</span>
            <h1 className="page-title">My Grid</h1>
          </div>
          <div className="row gap-3 wrap" style={{ alignItems: 'center' }}>
            {meta?.deadline && (
              <div className="col" style={{ alignItems: 'flex-end' }}>
                <span className="eyebrow">{locked ? 'Team locked' : 'Locks in'}</span>
                <Countdown iso={meta.deadline} compact />
              </div>
            )}
            <div className="seg only-mobile">
              <button className={view === 'lineup' ? 'active' : ''} onClick={() => setView('lineup')}>Lineup</button>
              <button className={view === 'market' ? 'active' : ''} onClick={() => setView('market')}>Market</button>
            </div>
          </div>
        </div>

        {locked && (
          <div className="panel panel-pad row gap-2" style={{ marginBottom: 16, borderColor: 'var(--caution)' }}>
            <Lock size={18} style={{ color: 'var(--caution)' }} />
            <span className="text-dim">This round is locked — your squad, captain and boost are frozen until it ends.</span>
          </div>
        )}

        {/* Sticky budget bar */}
        <div className="panel panel-pad" style={{ position: 'sticky', top: 68, zIndex: 12, marginBottom: 20 }}>
          <div className="row between wrap gap-2">
            <div className="row gap-4">
              <div><div className="eyebrow">Budget</div><div className="num" style={{ fontWeight: 800, fontSize: 22 }}>
                {money(cost)} <span className="text-faint" style={{ fontSize: 14 }}>/ {money(budget)}</span></div></div>
              <div><div className="eyebrow">Remaining</div><div className="num" style={{ fontWeight: 800, fontSize: 22, color: warn ? 'var(--loss)' : 'var(--gain)' }}>
                <CountUp value={remaining} decimals={1} prefix="$" suffix="M" /></div></div>
              <div className="hide-mobile"><div className="eyebrow">Squad</div><div className="num" style={{ fontWeight: 800, fontSize: 22 }}>
                {selDrivers.length + selConstructors.length}/{maxD + maxC}</div></div>
            </div>
            <button className="btn btn-primary" disabled={!complete || warn || saving || locked} onClick={attemptSave}>
              {saving ? 'Saving…' : locked ? 'Locked' : complete ? 'Review & save' : `Add ${maxD - selDrivers.length + maxC - selConstructors.length} more`}
            </button>
          </div>
          <div className={`bar ${warn ? 'warn' : ''}`} style={{ marginTop: 12 }}>
            <span style={{ width: `${Math.min(100, (cost / budget) * 100)}%` }} />
          </div>
          {noCaptain && !locked && (
            <div className="row gap-2" style={{ marginTop: 12, color: 'var(--caution)', fontSize: 13 }}>
              <AlertTriangle size={14} /> Pick a captain before saving — they score double.
            </div>
          )}
          {serverErrors.length > 0 && (
            <div className="col gap-1" style={{ marginTop: 12 }}>
              {serverErrors.map((e, i) => (
                <div key={i} className="row gap-2" style={{ color: 'var(--loss)', fontSize: 13 }}><AlertTriangle size={14} /> {e}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="tb-grid">
          {/* LINEUP */}
          <div style={{ display: view === 'lineup' ? 'block' : undefined, opacity: locked ? 0.6 : 1, pointerEvents: locked ? 'none' : undefined }}
            className={view === 'market' ? 'hide-mobile' : ''}>
            <span className="eyebrow">Starting grid · {selDrivers.length}/{maxD}</span>
            <div className="starting-grid" style={{ marginTop: 10, marginBottom: 24 }}>
              <div className="starting-grid__flag" />
              <div className="starting-grid__track" />
              {Array.from({ length: Math.ceil(maxD / 2) }).map((_, row) => (
                <div key={row} className="grid-row-pair">
                  {[row * 2, row * 2 + 1].map((i) => {
                    if (i >= maxD) return null
                    const d = dMap.get(selDrivers[i])
                    return (
                      <motion.div key={i} layout className={`grid-box${i % 2 ? ' grid-box--right' : ''}${d ? '' : ' grid-box--empty'}`}
                        style={{ borderColor: d ? d.constructor.color + '66' : undefined }}
                        onClick={d || locked ? undefined : () => setView('market')}>
                        <span className="grid-box__pos">P{i + 1}</span>
                        {d ? (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); if (!locked) setCaptain(captain === d.id ? null : d.id) }} title={captain === d.id ? 'Captain — scores 2×' : 'Make captain'}
                              disabled={locked}
                              style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 8, border: 'none', cursor: locked ? 'default' : 'pointer',
                                background: captain === d.id ? 'var(--red)' : 'var(--surface-3)', color: '#fff', fontWeight: 800, fontSize: 12, boxShadow: 'var(--neo-raised-sm)' }}>C</button>
                            {!locked && <button onClick={(e) => { e.stopPropagation(); toggleDriver(d) }} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: 'var(--text-faint)' }}><X size={15} /></button>}
                            <Avatar name={d.name} number={d.number} color={d.constructor.color} size={44} image={d.image_url} />
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{d.short}{captain === d.id && <span className="tag-pts tag-fl" style={{ marginLeft: 5 }}>2×</span>}</div>
                            <div className="eyebrow">{d.constructor.short}</div>
                          </>
                        ) : (
                          <>
                            <Plus size={20} />
                            <span className="eyebrow">Add driver</span>
                          </>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              ))}
            </div>

            <span className="eyebrow">Constructors · {selConstructors.length}/{maxC}</span>
            <div className="grid g2" style={{ marginTop: 10, marginBottom: 20 }}>
              {Array.from({ length: maxC }).map((_, i) => {
                const c = cMap.get(selConstructors[i])
                return (
                  <div key={i} className="panel panel-pad race-edge" style={{ ['--accent' as string]: c?.color || 'var(--line)', minHeight: 76 }}>
                    {c ? (
                      <div className="row between">
                        <div><div style={{ fontWeight: 700 }}>{c.name}</div><div className="eyebrow">{money(c.price)} · {c.reliability}%</div></div>
                        <button onClick={() => toggleConstructor(c)} style={{ background: 'transparent', border: 'none', color: 'var(--text-faint)' }}><X size={16} /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setView('market'); setTab('constructors') }} className="row center grow" style={{ width: '100%', background: 'transparent', border: '1px dashed var(--line)', borderRadius: 8, color: 'var(--text-faint)', gap: 8, minHeight: 52 }}>
                        <Plus size={18} /><span className="eyebrow">Add constructor</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <BoostBar boosts={meta?.config.boosts || []} active={boost} onSelect={(id) => { setBoost(id); if (!id) setBoostDriver(null) }} />

            {boost === 'underdog' && (() => {
              const pointsRank = new Map(drivers.map((d, i) => [d.id, i + 1]))
              const eligible = selDrivers.filter((id) => (pointsRank.get(id) ?? 0) > 5)
              const excluded = selDrivers.length - eligible.length
              return (
                <div className="panel panel-pad" style={{ marginTop: 12 }}>
                  <span className="eyebrow">Pick your underdog — scores 2× if they finish P6–P10</span>
                  <div className="row gap-2 wrap" style={{ marginTop: 10 }}>
                    {eligible.length === 0 && <span className="text-faint" style={{ fontSize: 13 }}>None of your drivers are realistic P6–P10 picks — your whole squad is currently top-5 pace.</span>}
                    {eligible.map((id) => {
                      const d = dMap.get(id)
                      if (!d) return null
                      const picked = boostDriver === id
                      return (
                        <button key={id} className={`btn btn-sm ${picked ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBoostDriver(picked ? null : id)}>
                          {d.short}
                        </button>
                      )
                    })}
                  </div>
                  {excluded > 0 && <div className="text-faint" style={{ fontSize: 12, marginTop: 8 }}>{excluded} driver{excluded > 1 ? 's' : ''} hidden — currently running top-5 pace, not a realistic P6–P10 bet.</div>}
                </div>
              )
            })()}
          </div>

          {/* MARKET */}
          <div className={view === 'lineup' ? 'hide-mobile' : ''} style={{ opacity: locked ? 0.6 : 1, pointerEvents: locked ? 'none' : undefined }}>
            <div className="seg" style={{ marginBottom: 12 }}>
              <button className={tab === 'drivers' ? 'active' : ''} onClick={() => setTab('drivers')}>Drivers</button>
              <button className={tab === 'constructors' ? 'active' : ''} onClick={() => setTab('constructors')}>Constructors</button>
            </div>

            {tab === 'drivers' && (
              <>
                <div className="row gap-2" style={{ marginBottom: 12 }}>
                  <div className="row grow" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '0 12px' }}>
                    <Search size={15} className="text-faint" />
                    <input className="input" style={{ border: 'none', background: 'transparent' }} placeholder="Search drivers…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="points">Points</option><option value="price">Price</option>
                    <option value="form">Form</option><option value="value">Value</option><option value="ownership">Owned</option>
                  </select>
                </div>
                <div className="panel" style={{ overflow: 'hidden' }}>
                  {filtered.map((d) => {
                    const sel = selDrivers.includes(d.id)
                    const roomLeft = sel || (selDrivers.length < maxD && remaining - d.price >= -1e-6)
                    return (
                      <div key={d.id} className="row between race-edge" style={{ ['--accent' as string]: d.constructor.color, padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--line-soft)', opacity: roomLeft ? 1 : 0.45 }}>
                        <button className="row gap-2 grow" style={{ background: 'transparent', border: 'none', color: 'var(--text)', textAlign: 'left' }} onClick={() => setDrawer(d.slug)}>
                          <Avatar name={d.name} number={d.number} color={d.constructor.color} size={38} image={d.image_url} />
                          <div className="col">
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{d.name} <Info size={11} className="text-faint" /></span>
                            <span className="eyebrow">{d.constructor.short} · {d.ownership}% owned</span>
                          </div>
                        </button>
                        <div className="row gap-3">
                          <div className="col hide-mobile" style={{ alignItems: 'flex-end' }}><FormPill value={d.form} /><span className="eyebrow">form</span></div>
                          <div className="col" style={{ alignItems: 'flex-end', minWidth: 54 }}>
                            <span className="num" style={{ fontWeight: 700 }}>{money(d.price)}</span>
                            <PriceDelta value={d.price_delta} />
                          </div>
                          <button className={`btn btn-sm ${sel ? 'btn-ghost' : 'btn-primary'}`} disabled={!roomLeft} onClick={() => toggleDriver(d)} style={{ padding: 8 }}>
                            {sel ? <Check size={15} /> : <Plus size={15} />}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {tab === 'constructors' && (
              <div className="panel" style={{ overflow: 'hidden' }}>
                {constructors.map((c) => {
                  const sel = selConstructors.includes(c.id)
                  const roomLeft = sel || (selConstructors.length < maxC && remaining - c.price >= -1e-6)
                  return (
                    <div key={c.id} className="row between race-edge" style={{ ['--accent' as string]: c.color, padding: '12px 12px 12px 16px', borderBottom: '1px solid var(--line-soft)', opacity: roomLeft ? 1 : 0.45 }}>
                      <div className="col"><span style={{ fontWeight: 600 }}>{c.name}</span><span className="eyebrow">{c.points} pts · {c.reliability}% reliability · {c.ownership}% owned</span></div>
                      <div className="row gap-3">
                        <div className="col" style={{ alignItems: 'flex-end' }}><span className="num" style={{ fontWeight: 700 }}>{money(c.price)}</span><PriceDelta value={c.price_delta} /></div>
                        <button className={`btn btn-sm ${sel ? 'btn-ghost' : 'btn-primary'}`} disabled={!roomLeft} onClick={() => toggleConstructor(c)} style={{ padding: 8 }}>
                          {sel ? <Check size={15} /> : <Plus size={15} />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <DriverDrawer slug={drawer} selected={drawer ? selDrivers.includes(drivers.find((d) => d.slug === drawer)?.id ?? -1) : false}
        onAdd={() => { const d = drivers.find((x) => x.slug === drawer); if (d) toggleDriver(d) }} onClose={() => setDrawer(null)} />

      <AnimatePresence>
        {reviewOpen && (
          <motion.div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReviewOpen(false)}>
            <motion.div className="panel panel-glow panel-pad" style={{ width: 'min(480px, 92vw)' }}
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h3 className="section-title" style={{ marginBottom: 4 }}>Transfer centre</h3>
              <p className="text-dim" style={{ fontSize: 13, marginBottom: 16 }}>Review your changes before they lock in for round {meta?.next_round}.</p>

              <div className="col gap-2" style={{ marginBottom: 16 }}>
                {outDrivers.map((id, i) => (
                  <div key={`d${id}`} className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="row gap-2"><span style={{ color: 'var(--loss)' }}>{dMap.get(id)?.short ?? '—'}</span><ArrowRight size={14} className="text-faint" /><span style={{ color: 'var(--gain)', fontWeight: 700 }}>{dMap.get(inDrivers[i])?.short ?? '—'}</span></span>
                    <span className="eyebrow">{i < freeAvailable ? 'FREE' : `−${meta?.config.extra_transfer_cost ?? 5} pts`}</span>
                  </div>
                ))}
                {outConstructors.map((id, i) => (
                  <div key={`c${id}`} className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="row gap-2"><span style={{ color: 'var(--loss)' }}>{cMap.get(id)?.short ?? '—'}</span><ArrowRight size={14} className="text-faint" /><span style={{ color: 'var(--gain)', fontWeight: 700 }}>{cMap.get(inConstructors[i])?.short ?? '—'}</span></span>
                    <span className="eyebrow">{outDrivers.length + i < freeAvailable ? 'FREE' : `−${meta?.config.extra_transfer_cost ?? 5} pts`}</span>
                  </div>
                ))}
              </div>

              <div className="row between" style={{ marginBottom: 6 }}><span className="text-dim" style={{ fontSize: 13 }}>Budget impact</span><span className="num" style={{ fontWeight: 700 }}>{money(cost)} / {money(budget)}</span></div>
              <div className="row between" style={{ marginBottom: 6 }}><span className="text-dim" style={{ fontSize: 13 }}>Free transfers remaining</span><span className="num" style={{ fontWeight: 700 }}>{Math.max(0, freeAvailable - transferCount)}</span></div>
              {projectedPenalty > 0 && (
                <div className="row between" style={{ marginBottom: 6 }}><span className="text-dim" style={{ fontSize: 13 }}>Penalty</span><span className="num" style={{ fontWeight: 700, color: 'var(--loss)' }}>−{projectedPenalty} pts</span></div>
              )}

              <div className="row gap-2" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost grow" onClick={() => setReviewOpen(false)}>Back</button>
                <button className="btn btn-primary grow" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Confirm transfers'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            className="panel panel-glow" style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', padding: '14px 22px', zIndex: 70, borderColor: 'var(--red)', fontWeight: 600 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@media (max-width: 900px){ .tb-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
