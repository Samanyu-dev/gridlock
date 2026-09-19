import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Share2, UserPlus, Trophy, TrendingUp, Repeat } from 'lucide-react'
import { Delta, Skeleton } from '../../components/bits'
import { ShareButton } from '../../components/ShareButton'
import { api } from '../../lib/api'
import { flagEmoji } from '../../lib/format'
import type { LeagueActivityEvent, LeagueDetail } from '../../lib/types'

const EVENT_ICON = { join: UserPlus, round_win: Trophy, boost: TrendingUp, transfer: Repeat } as const

export default function League() {
  const { code } = useParams()
  const [lg, setLg] = useState<LeagueDetail | null>(null)
  const [activity, setActivity] = useState<LeagueActivityEvent[] | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (code) api.league(code).then(setLg).catch(() => {}) }, [code])
  useEffect(() => { if (code) api.leagueActivity(code).then((r) => setActivity(r.events)).catch(() => setActivity([])) }, [code])

  const copy = () => {
    navigator.clipboard?.writeText(lg!.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }
  const share = () => {
    const text = `Join my GRIDLOCK league "${lg!.name}" — code ${lg!.code}`
    if (navigator.share) navigator.share({ title: 'GRIDLOCK League', text }).catch(() => {})
    else copy()
  }

  if (!lg) return <div className="page container"><Skeleton h={160} /></div>
  const me = lg.members.find((m) => m.is_me)
  const myRank = me?.league_rank

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
                {me && (
                  <ShareButton
                    label="Share standing"
                    filename={`gridlock-${lg.code}-standing.png`}
                    spec={{
                      eyebrow: lg.name, title: `${me.team_name} · #${myRank} of ${lg.member_count}`,
                      bigStat: me.total.toLocaleString(), bigStatLabel: 'Season points',
                      rows: [
                        { label: 'Rank', value: `#${myRank}` },
                        { label: 'Last race', value: `${me.last_race >= 0 ? '+' : ''}${me.last_race}` },
                        { label: 'Managers', value: `${lg.member_count}` },
                      ],
                    }}
                  />
                )}
              </div>
              <span className="eyebrow">{lg.member_count} managers{myRank ? ` · you're #${myRank}` : ''}</span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tower">
              <thead><tr><th>Rank</th><th></th><th>Team</th><th className="hide-mobile">Manager</th><th className="r hide-mobile">Last race</th><th className="r hide-mobile">Gap</th><th className="r">Total</th><th></th></tr></thead>
              <tbody>
                {lg.members.map((m) => (
                  <tr key={m.manager + m.league_rank} style={{ background: m.is_me ? 'color-mix(in srgb, var(--red) 9%, transparent)' : undefined }}>
                    <td><span className={`pos pos-${m.league_rank}`}>{String(m.league_rank).padStart(2, '0')}</span></td>
                    <td><Delta value={m.movement} /></td>
                    <td><span style={{ fontWeight: 600 }}>{flagEmoji(m.country)} {m.team_name}{m.is_me && <span className="tag-pts" style={{ background: 'var(--red-glow)', color: '#fff', marginLeft: 6 }}>YOU</span>}</span></td>
                    <td className="hide-mobile text-dim">{m.manager}</td>
                    <td className="r hide-mobile num text-dim">{m.last_race}</td>
                    <td className="r hide-mobile num text-faint">{m.gap_to_leader ? `−${m.gap_to_leader.toLocaleString()}` : '—'}</td>
                    <td className="r num" style={{ fontWeight: 800, fontSize: 16 }}>{m.total.toLocaleString()}</td>
                    <td className="r">{!m.is_me && <Link to={`/h2h/${m.manager.replace(/^@/, '')}`} className="btn btn-ghost btn-sm">Compare</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel panel-pad" style={{ marginTop: 20 }}>
          <span className="section-title" style={{ fontSize: 16, display: 'block', marginBottom: 10 }}>Activity</span>
          {activity === null && <Skeleton h={120} />}
          {activity && activity.length === 0 && <p className="text-faint" style={{ fontSize: 13 }}>Nothing yet — activity appears here as rounds complete and picks lock in.</p>}
          {activity && activity.length > 0 && (
            <div className="col gap-1">
              {activity.map((e, i) => {
                const Icon = EVENT_ICON[e.type as keyof typeof EVENT_ICON] || UserPlus
                return (
                  <div key={i} className="row gap-2" style={{ padding: '7px 0', alignItems: 'flex-start' }}>
                    <Icon size={15} className="text-faint" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 13 }}>{e.text}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
