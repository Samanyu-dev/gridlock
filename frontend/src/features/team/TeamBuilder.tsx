import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X, Search, Info, Check } from 'lucide-react'
import { Avatar, PriceDelta, FormPill } from '../../components/bits'
import { CountUp } from '../../components/motion'
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
  const [view, setView] = useState<'lineup' | 'market'>('lineup')
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers')
  const [sort, setSort] = useState('points')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    api.drivers({ sort: 'points' }).then((r) => setDrivers(r.drivers)).catch(() => {})
    api.constructors().then((r) => setConstructors(r.constructors)).catch(() => {})
    if (authed) api.me().then((m) => {
      if (m.team) {
        setSelDrivers(m.team.driver_ids); setSelConstructors(m.team.constructor_ids)
        setCaptain(m.team.captain_id); setBoost(m.team.active_boost)
      }
    }).catch(() => {})
  }, [authed])

  const dMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers])
  const cMap = useMemo(() => new Map(constructors.map((c) => [c.id, c])), [constructors])
  const maxD = meta?.config.roster.drivers ?? 10
  const maxC = meta?.config.roster.constructors ?? 2

  const squadValue = useMemo(() => {
    let c = 0
    selDrivers.forEach((id) => (c += dMap.get(id)?.price ?? 0))
    selConstructors.forEach((id) => (c += cMap.get(id)?.price ?? 0))
    return Math.round(c * 10) / 10
  }, [selDrivers, selConstructors, dMap, cMap])
  const complete = selDrivers.length === maxD && selConstructors.length === maxC

  const toggleDriver = (d: Driver) => {
    if (selDrivers.includes(d.id)) {
      setSelDrivers((s) => s.filter((x) => x !== d.id))
      if (captain === d.id) setCaptain(null)
    } else if (selDrivers.length < maxD) {
      setSelDrivers((s) => [...s, d.id])
    }
  }
  const toggleConstructor = (c: Constructor) => {
    if (selConstructors.includes(c.id)) setSelConstructors((s) => s.filter((x) => x !== c.id))
    else if (selConstructors.length < maxC) setSelConstructors((s) => [...s, c.id])
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

  const save = async () => {
    if (!authed || !complete) return
    setSaving(true)
    try {
      const res = await api.saveTeam({
        driver_ids: selDrivers, constructor_ids: selConstructors,
        captain_id: captain, active_boost: boost,
      })
      const t = res.transfers
      const penaltyNote = t && t.penalty ? ` · ${t.penalized} extra transfer${t.penalized > 1 ? 's' : ''} (−${t.penalty} pts)` : ''
      setToast(`Team locked in — projected rank #${res.rank.toLocaleString()} of ${res.field_size.toLocaleString()}${penaltyNote}`)
      setTimeout(() => setToast(null), 4500)
    } catch (e) { setToast((e as Error).message); setTimeout(() => setToast(null), 4500) }
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
          <div className="seg only-mobile">
            <button className={view === 'lineup' ? 'active' : ''} onClick={() => setView('lineup')}>Lineup</button>
            <button className={view === 'market' ? 'active' : ''} onClick={() => setView('market')}>Market</button>
          </div>
        </div>

        {/* Sticky squad-progress bar — no budget cap, just fill the grid. */}
        <div className="panel panel-pad" style={{ position: 'sticky', top: 68, zIndex: 12, marginBottom: 20 }}>
          <div className="row between wrap gap-2">
            <div className="row gap-4">
              <div><div className="eyebrow">Squad</div><div className="num" style={{ fontWeight: 800, fontSize: 22 }}>
                <CountUp value={selDrivers.length + selConstructors.length} /> <span className="text-faint" style={{ fontSize: 14 }}>/ {maxD + maxC}</span></div></div>
              <div className="hide-mobile"><div className="eyebrow">Squad value</div><div className="num" style={{ fontWeight: 800, fontSize: 22 }}>
                {money(squadValue)}</div></div>
            </div>
            <button className="btn btn-primary" disabled={!complete || saving} onClick={save}>
              {saving ? 'Saving…' : complete ? 'Save team' : `Add ${maxD - selDrivers.length + maxC - selConstructors.length} more`}
            </button>
          </div>
          <div className="bar" style={{ marginTop: 12 }}>
            <span style={{ width: `${Math.min(100, ((selDrivers.length + selConstructors.length) / (maxD + maxC)) * 100)}%` }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="tb-grid">
          {/* LINEUP */}
          <div style={{ display: view === 'lineup' ? 'block' : undefined }} className={view === 'market' ? 'hide-mobile' : ''}>
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
                        onClick={d ? undefined : () => setView('market')}>
                        <span className="grid-box__pos">P{i + 1}</span>
                        {d ? (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setCaptain(captain === d.id ? null : d.id) }} title="Captain"
                              style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 8, border: 'none',
                                background: captain === d.id ? 'var(--red)' : 'var(--surface-3)', color: '#fff', fontWeight: 800, fontSize: 12, boxShadow: 'var(--neo-raised-sm)' }}>C</button>
                            <button onClick={(e) => { e.stopPropagation(); toggleDriver(d) }} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: 'var(--text-faint)' }}><X size={15} /></button>
                            <Avatar name={d.name} number={d.number} color={d.constructor.color} size={44} />
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{d.short}</div>
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

            <BoostBar boosts={meta?.config.boosts || []} active={boost} onSelect={setBoost} />
          </div>

          {/* MARKET */}
          <div className={view === 'lineup' ? 'hide-mobile' : ''}>
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
                    const roomLeft = sel || selDrivers.length < maxD
                    return (
                      <div key={d.id} className="row between race-edge" style={{ ['--accent' as string]: d.constructor.color, padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--line-soft)', opacity: roomLeft ? 1 : 0.45 }}>
                        <button className="row gap-2 grow" style={{ background: 'transparent', border: 'none', color: 'var(--text)', textAlign: 'left' }} onClick={() => setDrawer(d.slug)}>
                          <Avatar name={d.name} number={d.number} color={d.constructor.color} size={38} />
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
                  const roomLeft = sel || selConstructors.length < maxC
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
