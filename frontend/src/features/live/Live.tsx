import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Radio, Flag } from 'lucide-react'
import { Countdown } from '../../components/motion'
import { Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { flagEmoji } from '../../lib/format'
import type { LiveSnapshot } from '../../lib/types'

export default function Live() {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null)

  useEffect(() => { api.live().then(setSnap).catch(() => {}) }, [])

  if (!snap) return <div className="page container"><Skeleton h={80} /><div style={{ height: 16 }} /><Skeleton h={300} /></div>

  const race = snap.race

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><span className="eyebrow">Race centre</span><h1 className="page-title">Live</h1></div>

        <div className="panel panel-pad" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <Radio size={28} className="text-faint" style={{ margin: '0 auto 16px' }} />
          <h2 className="section-title" style={{ fontSize: 22, marginBottom: 8 }}>
            {snap.live ? "There's a session on right now" : 'No session live right now'}
          </h2>
          <p className="text-dim" style={{ maxWidth: 460, margin: '0 auto 20px' }}>
            {snap.reason || "GRIDLOCK doesn't fabricate a race — this fills in with real timing once a session is actually running."}
          </p>

          {race && (
            <div className="row center gap-3 wrap" style={{ marginBottom: 20 }}>
              <span className="chip"><Flag size={12} style={{ marginRight: 5 }} />{flagEmoji(race.country)} {race.name}</span>
              <span className="chip">{race.circuit}</span>
            </div>
          )}

          {race?.deadline && (
            <div className="col center" style={{ marginBottom: 24 }}>
              <span className="eyebrow" style={{ marginBottom: 8 }}>Team locks in</span>
              <Countdown iso={race.deadline} />
            </div>
          )}

          <div className="row center gap-2 wrap">
            <Link to="/team" className="btn btn-primary">Check my team</Link>
            <Link to="/races" className="btn btn-ghost">Full calendar</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
