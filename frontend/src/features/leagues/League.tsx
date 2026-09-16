import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Share2 } from 'lucide-react'
import { Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { flagEmoji } from '../../lib/format'
import type { LeagueDetail } from '../../lib/types'

export default function League() {
  const { code } = useParams()
  const { username } = useSession()
  const [lg, setLg] = useState<LeagueDetail | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (code) api.league(code, username || undefined).then(setLg).catch(() => {}) }, [code, username])

  const copy = () => {
    navigator.clipboard?.writeText(lg!.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }
  const share = () => {
    const text = `Join my GRIDLOCK league "${lg!.name}" — code ${lg!.code}`
    if (navigator.share) navigator.share({ title: 'GRIDLOCK League', text }).catch(() => {})
    else copy()
  }

  if (!lg) return <div className="page container"><Skeleton h={160} /></div>
  const myRank = lg.members.find((m) => m.is_me)?.league_rank

  return (
    <div className="page">
      <div className="container">
        <Link to="/leagues" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}><ArrowLeft size={15} /> Leagues</Link>

        <div className="panel panel-pad" style={{ marginBottom: 20 }}>
          <div className="row between wrap gap-2">
            <div>
              <span className="eyebrow">{lg.privacy === 'public' ? 'Public' : 'Private'} · {lg.type === 'h2h' ? 'Head-to-head' : 'Classic'} league</span>
              <h1 className="display" style={{ fontSize: 'clamp(28px,4vw,44px)', margin: '4px 0' }}>{lg.name}</h1>
              <span className="text-dim">{lg.description || `Created by ${lg.creator}`}</span>
            </div>
            <div className="col gap-2" style={{ alignItems: 'flex-end' }}>
              <div className="row gap-2">
                <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {lg.code}</button>
                <button className="btn btn-primary btn-sm" onClick={share}><Share2 size={14} /> Invite</button>
              </div>
              <span className="eyebrow">{lg.member_count} managers{myRank ? ` · you're #${myRank}` : ''}</span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tower">
              <thead><tr><th>Rank</th><th>Team</th><th className="hide-mobile">Manager</th><th className="r hide-mobile">Last race</th><th className="r">Total</th></tr></thead>
              <tbody>
                {lg.members.map((m) => (
                  <tr key={m.manager + m.league_rank} style={{ background: m.is_me ? 'color-mix(in srgb, var(--red) 9%, transparent)' : undefined }}>
                    <td><span className={`pos pos-${m.league_rank}`}>{String(m.league_rank).padStart(2, '0')}</span></td>
                    <td><span style={{ fontWeight: 600 }}>{flagEmoji(m.country)} {m.team_name}{m.is_me && <span className="tag-pts" style={{ background: 'var(--red-glow)', color: '#fff', marginLeft: 6 }}>YOU</span>}</span></td>
                    <td className="hide-mobile text-dim">{m.manager}</td>
                    <td className="r hide-mobile num text-dim">{m.last_race}</td>
                    <td className="r num" style={{ fontWeight: 800, fontSize: 16 }}>{m.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
