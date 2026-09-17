import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Avatar, Sparkline, Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import type { ConstructorFull } from '../../lib/types'

export default function ConstructorProfile() {
  const { slug } = useParams()
  const [c, setC] = useState<ConstructorFull | null>(null)
  useEffect(() => { if (slug) api.constructor(slug).then(setC).catch(() => {}) }, [slug])
  if (!c) return <div className="page container"><Skeleton h={200} /></div>

  return (
    <div className="page">
      <div className="container">
        <Link to="/constructors" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Constructors</Link>
        <div className="panel" style={{ overflow: 'hidden', marginBottom: 20 }}>
          <div className="row between wrap gap-3" style={{ padding: 28, background: `linear-gradient(130deg, ${c.color}30, transparent 65%)` }}>
            <div>
              <span className="eyebrow">Constructor</span>
              <h1 className="display" style={{ fontSize: 'clamp(30px,5vw,52px)', margin: '4px 0' }}>{c.name}</h1>
            </div>
            <Sparkline data={c.last5} color={c.color} width={160} height={60} />
          </div>
          <div className="row" style={{ borderTop: '1px solid var(--line)' }}>
            {[['Price', money(c.price)], ['Season pts', c.points], ['Form', c.form.toFixed(1)], ['Reliability', `${c.reliability}%`], ['Owned', `${c.ownership}%`]].map(([k, v], i) => (
              <div key={i} className="grow" style={{ padding: 16, borderLeft: i ? '1px solid var(--line)' : 'none' }}>
                <div className="eyebrow">{k}</div><div className="num" style={{ fontWeight: 800, fontSize: 22, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid g2" style={{ marginBottom: 20 }}>
          {c.drivers_full.map((d) => (
            <Link key={d.id} to={`/drivers/${d.slug}`} className="panel panel-pad row between">
              <span className="row gap-2"><Avatar name={d.name} number={d.number} color={c.color} size={44} image={d.image_url} /><div className="col"><span style={{ fontWeight: 600 }}>{d.name}</span><span className="eyebrow">{money(d.price)} · form {d.form}</span></div></span>
              <span className="num" style={{ fontWeight: 800, fontSize: 20 }}>{d.points}</span>
            </Link>
          ))}
        </div>

        <div className="panel panel-pad">
          <span className="section-title" style={{ fontSize: 16 }}>Points by round</span>
          <div className="row gap-1" style={{ marginTop: 16, alignItems: 'flex-end', height: 120 }}>
            {c.history.map((h) => {
              const max = Math.max(...c.history.map((x) => x.points), 1)
              return (
                <div key={h.round} className="grow col center" style={{ gap: 6 }}>
                  <div style={{ width: '100%', maxWidth: 24, height: `${(h.points / max) * 90}px`, background: c.color, borderRadius: '3px 3px 0 0', minHeight: 3 }} title={`R${h.round}: ${h.points}`} />
                  <span className="eyebrow" style={{ fontSize: 9 }}>{h.round}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
