import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkline, PriceDelta, Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import type { Constructor } from '../../lib/types'

export default function Constructors() {
  const [rows, setRows] = useState<Constructor[] | null>(null)
  useEffect(() => { api.constructors().then((r) => setRows(r.constructors)).catch(() => {}) }, [])

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><span className="eyebrow">The paddock</span><h1 className="page-title">Constructors</h1></div>
        <div className="grid g2">
          {!rows && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={130} />)}
          {rows?.map((c) => (
            <Link key={c.id} to={`/constructors/${c.slug}`} className="panel panel-pad race-edge" style={{ ['--accent' as string]: c.color }}>
              <div className="row between">
                <div>
                  <h3 className="section-title" style={{ fontSize: 18 }}>{c.name}</h3>
                  <span className="eyebrow">{c.drivers.map((d) => d.short).join(' · ')}</span>
                </div>
                <Sparkline data={c.last5} color={c.color} width={90} height={40} />
              </div>
              <div className="row between" style={{ marginTop: 16 }}>
                {[['Pts', c.points], ['Price', money(c.price)], ['Reliability', `${c.reliability}%`], ['Owned', `${c.ownership}%`]].map(([k, v], i) => (
                  <div key={i}><div className="eyebrow">{k}</div><div className="num" style={{ fontWeight: 700, fontSize: 17, marginTop: 3 }}>{v}</div></div>
                ))}
                <PriceDelta value={c.price_delta} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
