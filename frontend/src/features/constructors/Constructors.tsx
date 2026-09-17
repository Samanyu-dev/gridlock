import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '../../components/bits'
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
          {!rows && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={256} />)}
          {rows?.map((c) => (
            <Link key={c.id} to={`/constructors/${c.slug}`} className="team-card"
              style={{ ['--team-color' as string]: c.color, ['--team-accent' as string]: c.accessible_color }}>
              <span className="team-card__scrim" />
              <span className="team-card__top">
                <span className="col gap-1">
                  <span className="team-card__name">{c.name}</span>
                  <span className="row gap-3 wrap">
                    {c.drivers.slice(0, 2).map((d) => (
                      <span key={d.id} className="row gap-1" style={{ alignItems: 'center' }}>
                        <span className="team-card__driver-pic">
                          <img src={d.image_url} alt="" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                        </span>
                        <span className="team-card__driver-name">{d.short}</span>
                      </span>
                    ))}
                  </span>
                </span>
                {c.logo_url && <span className="team-card__logo"><img src={c.logo_url} alt="" /></span>}
              </span>
              <span className="row between" style={{ position: 'relative', zIndex: 2, marginTop: 12 }}>
                {[['Pts', c.points], ['Price', money(c.price)], ['Reliability', `${c.reliability}%`], ['Owned', `${c.ownership}%`]].map(([k, v], i) => (
                  <span key={i} className="col"><span className="eyebrow" style={{ opacity: 0.75 }}>{k}</span><span className="num" style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{v}</span></span>
                ))}
              </span>
              {c.car_url && <img className="team-card__car" src={c.car_url} alt="" />}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
