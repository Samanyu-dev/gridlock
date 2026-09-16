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
  const { username } = useSession()
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
    if (username) api.me(username).then((m) => {
      if (m.team) {
        setSelDrivers(m.team.driver_ids); setSelConstructors(m.team.constructor_ids)
        setCaptain(m.team.captain_id); setBoost(m.team.active_boost)
      }
    }).catch(() => {})
  }, [username])

  const dMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers])
  const cMap = useMemo(() => new Map(constructors.map((c) => [c.id, c])), [constructors])
  const budget = meta?.config.budget ?? 100
  const maxD = meta?.config.roster.drivers ?? 5
  const maxC = meta?.config.roster.constructors ?? 2

  const cost = useMemo(() => {
    let c = 0
    selDrivers.forEach((id) => (c += dMap.get(id)?.price ?? 0))
    selConstructors.forEach((id) => (c += cMap.get(id)?.price ?? 0))
    return Math.round(c * 10) / 10
  }, [selDrivers, selConstructors, dMap, cMap])
  const remaining = Math.round((budget - cost) * 10) / 10
  const complete = selDrivers.length === maxD && selConstructors.length === maxC

  const toggleDriver = (d: Driver) => {
    if (selDrivers.includes(d.id)) {
      setSelDrivers((s) => s.filter((x) => x !== d.id))
      if (captain === d.id) setCaptain(null)
    } else if (selDrivers.length < maxD && remaining - d.price >= -1e-6) {
      setSelDrivers((s) => [...s, d.id])
    }
  }
  const toggleConstructor = (c: Constructor) => {
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

  const save = async () => {
    if (!username || !complete) return
    setSaving(true)
    try {
      const res = await api.saveTeam({
        username, driver_ids: selDrivers, constructor_ids: selConstructors,
        captain_id: captain, active_boost: boost,
      })
      setToast(`Team locked in — projected rank #${res.rank.toLocaleString()} of ${res.field_size.toLocaleString()}`)
      setTimeout(() => setToast(null), 4000)
    } catch (e) { setToast((e as Error).message); setTimeout(() => setToast(null), 4000) }
    finally { setSaving(false) }
  }

  const warn = remaining < 0

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
            <button className="btn btn-primary" disabled={!complete || warn || saving} onClick={save}>
              {saving ? 'Saving…' : complete ? 'Save team' : `Add ${maxD - selDrivers.length + maxC - selConstructors.length} more`}
            </button>
          </div>
          <div className={`bar ${warn ? 'warn' : ''}`} style={{ marginTop: 12 }}>
            <span style={{ width: `${Math.min(100, (cost / budget) * 100)}%` }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="tb-grid">
          {/* LINEUP */}
          <div style={{ display: view === 'lineup' ? 'block' : undefined }} className={view === 'market' ? 'hide-mobile' : ''}>
            <span className="eyebrow">Drivers · {selDrivers.length}/{maxD}</span>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginTop: 10, marginBottom: 20 }}>
              {Array.from({ length: maxD }).map((_, i) => {
                const d = dMap.get(selDrivers[i])
                return (
                  <motion.div key={i} layout className="panel" style={{ padding: 12, minHeight: 128, position: 'relative', borderColor: d ? d.constructor.color + '66' : undefined }}>
                    {d ? (
                      <div className="col center" style={{ gap: 6, textAlign: 'center' }}>
                        <button onClick={() => setCaptain(captain === d.id ? null : d.id)} title="Captain"
                          style={{ position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 6, border: 'none',
                            background: captain === d.id ? 'var(--red)' : 'var(--surface-3)', color: '#fff', fontWeight: 800, fontSize: 12 }}>C</button>
                        <button onClick={() => toggleDriver(d)} style={{ position: 'absolute', top: 6, right: 6, background: 'transparent', border: 'none', color: 'var(--text-faint)' }}><X size={15} /></button>
                        <Avatar name={d.name} number={d.number} color={d.constructor.color} size={46} />
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{d.short}</div>
                        <div className="eyebrow">{money(d.price)}</div>
                      </div>
                    ) : (
                      <button onClick={() => setView('market')} className="col center grow" style={{ width: '100%', height: '100%', background: 'transparent', border: '1px dashed var(--line)', borderRadius: 8, color: 'var(--text-faint)', gap: 6, minHeight: 104 }}>
                        <Plus size={22} /><span className="eyebrow">Add driver</span>
                      </button>
                    )}
                  </motion.div>
                )
              })}
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
                    const afford = sel || (selDrivers.length < maxD && remaining - d.price >= -1e-6)
                    return (
                      <div key={d.id} className="row between race-edge" style={{ ['--accent' as string]: d.constructor.color, padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--line-soft)', opacity: afford ? 1 : 0.45 }}>
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
                          <button className={`btn btn-sm ${sel ? 'btn-ghost' : 'btn-primary'}`} disabled={!afford} onClick={() => toggleDriver(d)} style={{ padding: 8 }}>
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
                  const afford = sel || (selConstructors.length < maxC && remaining - c.price >= -1e-6)
                  return (
                    <div key={c.id} className="row between race-edge" style={{ ['--accent' as string]: c.color, padding: '12px 12px 12px 16px', borderBottom: '1px solid var(--line-soft)', opacity: afford ? 1 : 0.45 }}>
                      <div className="col"><span style={{ fontWeight: 600 }}>{c.name}</span><span className="eyebrow">{c.points} pts · {c.reliability}% reliability · {c.ownership}% owned</span></div>
                      <div className="row gap-3">
                        <div className="col" style={{ alignItems: 'flex-end' }}><span className="num" style={{ fontWeight: 700 }}>{money(c.price)}</span><PriceDelta value={c.price_delta} /></div>
                        <button className={`btn btn-sm ${sel ? 'btn-ghost' : 'btn-primary'}`} disabled={!afford} onClick={() => toggleConstructor(c)} style={{ padding: 8 }}>
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
