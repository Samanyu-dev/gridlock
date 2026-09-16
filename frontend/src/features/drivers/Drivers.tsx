import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Avatar, FormPill, PriceDelta, Sparkline, Skeleton } from '../../components/bits'
import { DriverDrawer } from '../team/DriverDrawer'
import { api } from '../../lib/api'
import { flagEmoji, money } from '../../lib/format'
import type { Driver } from '../../lib/types'

const SORTS = [['points', 'Points'], ['form', 'Form'], ['price', 'Price'], ['value', 'Value'], ['ownership', 'Owned']]

export default function Drivers() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null)
  const [sort, setSort] = useState('points')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState<string | null>(null)

  useEffect(() => { api.drivers({ sort: 'points' }).then((r) => setDrivers(r.drivers)).catch(() => {}) }, [])

  const rows = useMemo(() => {
    if (!drivers) return []
    let a = [...drivers]
    if (search) a = a.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    const k: Record<string, (d: Driver) => number> = {
      points: (d) => d.points, form: (d) => d.form, price: (d) => d.price, value: (d) => d.value, ownership: (d) => d.ownership,
    }
    a.sort((x, y) => (k[sort] || k.points)(y) - (k[sort] || k.points)(x))
    return a
  }, [drivers, search, sort])

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <span className="eyebrow">The field</span>
          <h1 className="page-title">Drivers</h1>
        </div>

        <div className="row gap-2 wrap" style={{ marginBottom: 16 }}>
          <div className="row grow" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '0 12px', maxWidth: 320 }}>
            <Search size={15} className="text-faint" />
            <input className="input" style={{ border: 'none', background: 'transparent' }} placeholder="Search drivers…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="seg">
            {SORTS.map(([v, l]) => <button key={v} className={sort === v ? 'active' : ''} onClick={() => setSort(v)}>{l}</button>)}
          </div>
        </div>

        <div className="panel" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tower">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Pos</th><th>Driver</th><th className="hide-mobile">Team</th>
                  <th className="r hide-mobile">Form</th><th className="r hide-mobile">Last 5</th>
                  <th className="r">Price</th><th className="r">Pts</th><th className="r hide-mobile">Own</th>
                </tr>
              </thead>
              <tbody>
                {!drivers && Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}><td colSpan={8}><Skeleton h={28} /></td></tr>
                ))}
                {rows.map((d, i) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setDrawer(d.slug)}>
                    <td><span className={`pos pos-${i + 1}`}>{String(i + 1).padStart(2, '0')}</span></td>
                    <td>
                      <div className="row gap-2">
                        <Avatar name={d.name} number={d.number} color={d.constructor.color} size={34} />
                        <div className="col"><span style={{ fontWeight: 600 }}>{d.name}</span><span className="eyebrow only-mobile">{d.constructor.short}</span></div>
                      </div>
                    </td>
                    <td className="hide-mobile"><span className="row gap-1"><span className="team-dot" style={{ background: d.constructor.color, height: 16 }} /> {d.constructor.name}</span></td>
                    <td className="r hide-mobile"><FormPill value={d.form} /></td>
                    <td className="r hide-mobile"><div style={{ display: 'inline-block' }}><Sparkline data={d.last5} color={d.constructor.color} width={80} height={26} /></div></td>
                    <td className="r"><div className="col" style={{ alignItems: 'flex-end' }}><span className="num" style={{ fontWeight: 700 }}>{money(d.price)}</span><PriceDelta value={d.price_delta} /></div></td>
                    <td className="r num" style={{ fontWeight: 800, fontSize: 16 }}>{d.points}</td>
                    <td className="r hide-mobile num text-dim">{d.ownership}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-faint" style={{ fontSize: 12, marginTop: 12 }}>{flagEmoji('IT')} All drivers are original & fictional. Tap a row for full analytics.</p>
      </div>
      <DriverDrawer slug={drawer} selected={false} onClose={() => setDrawer(null)} />
    </div>
  )
}
