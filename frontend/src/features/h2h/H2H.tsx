import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Swords } from 'lucide-react'
import { Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import type { H2HReport, H2HRef } from '../../lib/types'

function AssetChip({ a }: { a: H2HRef }) {
  return <span className="row gap-1" style={{ alignItems: 'center' }}><span className="team-dot" style={{ background: a.color }} />{a.short || a.name}</span>
}

export default function H2H() {
  const { username } = useParams()
  const [data, setData] = useState<H2HReport | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!username) return
    setData(null); setErr('')
    api.h2h(username).then(setData).catch((e) => setErr(e.message))
  }, [username])

  if (err) return <div className="page container"><div className="panel panel-pad" style={{ color: 'var(--loss)' }}>{err}</div></div>
  if (!data) return <div className="page container"><Skeleton h={400} /></div>

  const { a, b } = data

  return (
    <div className="page">
      <div className="container">
        <Link to="/leagues" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Leagues</Link>

        <div className="panel panel-pad" style={{ marginBottom: 20 }}>
          <div className="row between wrap gap-3" style={{ alignItems: 'center' }}>
            <div className="col" style={{ alignItems: 'flex-start' }}>
              <span className="eyebrow">{a.username}</span>
              <span className="display" style={{ fontSize: 28 }}>{a.team_name}</span>
              <span className="num" style={{ fontWeight: 800, fontSize: 30, marginTop: 4 }}>{a.total.toLocaleString()}</span>
            </div>
            <Swords className="text-faint" size={28} />
            <div className="col" style={{ alignItems: 'flex-end' }}>
              <span className="eyebrow">{b.username}</span>
              <span className="display" style={{ fontSize: 28 }}>{b.team_name}</span>
              <span className="num" style={{ fontWeight: 800, fontSize: 30, marginTop: 4 }}>{b.total.toLocaleString()}</span>
            </div>
          </div>
          <div className="row center" style={{ marginTop: 16, gap: 6 }}>
            <span className="chip" style={{ color: data.gap >= 0 ? 'var(--gain)' : 'var(--loss)', borderColor: data.gap >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
              {data.gap >= 0 ? `${a.username} +${data.gap}` : `${b.username} +${-data.gap}`}
            </span>
          </div>
        </div>

        <div className="panel panel-pad" style={{ marginBottom: 20 }}>
          <span className="section-title" style={{ fontSize: 16 }}>Historical H2H record (rounds won this season)</span>
          <div className="row between" style={{ marginTop: 12 }}>
            <div className="col center"><span className="num" style={{ fontWeight: 800, fontSize: 24 }}>{data.rounds_record.a}</span><span className="eyebrow">{a.username}</span></div>
            <div className="col center"><span className="num" style={{ fontWeight: 800, fontSize: 24 }}>{data.rounds_record.ties}</span><span className="eyebrow">ties</span></div>
            <div className="col center"><span className="num" style={{ fontWeight: 800, fontSize: 24 }}>{data.rounds_record.b}</span><span className="eyebrow">{b.username}</span></div>
          </div>
        </div>

        <div className="grid g2" style={{ marginBottom: 20 }}>
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 15 }}>Captain</span>
            <div className="row between" style={{ marginTop: 10 }}>
              <span>{a.captain ? <AssetChip a={a.captain} /> : '—'}</span>
              <span>{b.captain ? <AssetChip a={b.captain} /> : '—'}</span>
            </div>
          </div>
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 15 }}>Constructors</span>
            <div className="row between" style={{ marginTop: 10 }}>
              <span className="col gap-1">{a.constructors.map((c) => <AssetChip key={c.id} a={c} />)}</span>
              <span className="col gap-1" style={{ alignItems: 'flex-end' }}>{b.constructors.map((c) => <AssetChip key={c.id} a={c} />)}</span>
            </div>
          </div>
        </div>

        <div className="grid g2">
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 15 }}>{a.username}'s differentials</span>
            <p className="text-faint" style={{ fontSize: 12, marginBottom: 8 }}>Drivers only they own</p>
            <div className="col gap-2">{a.differentials.length ? a.differentials.map((d) => <AssetChip key={d.id} a={d} />) : <span className="text-faint" style={{ fontSize: 13 }}>None</span>}</div>
          </div>
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 15 }}>{b.username}'s differentials</span>
            <p className="text-faint" style={{ fontSize: 12, marginBottom: 8 }}>Drivers only they own</p>
            <div className="col gap-2">{b.differentials.length ? b.differentials.map((d) => <AssetChip key={d.id} a={d} />) : <span className="text-faint" style={{ fontSize: 13 }}>None</span>}</div>
          </div>
        </div>

        <div className="panel panel-pad" style={{ marginTop: 20 }}>
          <span className="section-title" style={{ fontSize: 15 }}>Shared drivers ({data.shared_drivers.length})</span>
          <div className="row gap-3 wrap" style={{ marginTop: 10 }}>
            {data.shared_drivers.length ? data.shared_drivers.map((d) => <AssetChip key={d.id} a={d} />) : <span className="text-faint" style={{ fontSize: 13 }}>None</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
