import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Flag, Zap, Crown, Star, Medal, Sun, Moon, LogOut } from 'lucide-react'
import { CountUp } from '../../components/motion'
import { Avatar, Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { flagEmoji } from '../../lib/format'
import type { Driver, MeResponse } from '../../lib/types'

const ACHIEVEMENTS = [
  { icon: Flag, name: 'First Grid', desc: 'Built your first team', got: true },
  { icon: Star, name: 'Century', desc: 'Scored 100+ in a weekend', got: true },
  { icon: Zap, name: 'Purple Sector', desc: '5× fastest-lap bonus', got: false },
  { icon: Trophy, name: 'Top 10%', desc: 'Finish a weekend top 10%', got: false },
  { icon: Crown, name: 'League Champion', desc: 'Win a private league', got: false },
  { icon: Medal, name: 'Strategist', desc: '50+ pts from boosts', got: false },
]

export default function Profile() {
  const { authed, profile, theme, toggleTheme, clear } = useSession()
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [fav, setFav] = useState<Driver | null>(null)

  useEffect(() => {
    if (authed) api.me().then(setMe).catch(() => {})
    if (profile?.favorite_driver_id) api.drivers().then((r) => setFav(r.drivers.find((d) => d.id === profile.favorite_driver_id) || null)).catch(() => {})
  }, [authed, profile])

  if (!profile) return <div className="page container"><Skeleton h={200} /></div>

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 960 }}>
        <div className="panel" style={{ overflow: 'hidden', marginBottom: 20 }}>
          <div className="row between wrap gap-3" style={{ padding: 28, background: 'linear-gradient(130deg, rgba(255,33,48,0.12), transparent 60%)' }}>
            <div className="row gap-3">
              <span className="avatar" style={{ width: 78, height: 78, fontSize: 30, background: 'linear-gradient(150deg, var(--red), #7a0400)' }}>{profile.team_name.slice(0, 2).toUpperCase()}</span>
              <div>
                <h1 className="display" style={{ fontSize: 'clamp(26px,4vw,40px)' }}>{profile.team_name}</h1>
                <span className="text-dim">@{profile.username}{profile.persona ? ` · ${profile.persona}` : ''}</span>
              </div>
            </div>
            {fav && <div className="col" style={{ alignItems: 'flex-end' }}><span className="eyebrow">Favourite driver</span><span className="row gap-2" style={{ marginTop: 6 }}><Avatar name={fav.name} number={fav.number} color={fav.constructor.color} size={30} />{fav.name}</span></div>}
          </div>
        </div>

        <div className="grid g4" style={{ marginBottom: 20 }}>
          {me?.score ? (
            <>
              <Stat k="Overall rank" v={<>#<CountUp value={me.rank ?? 0} /></>} />
              <Stat k="Total points" v={<CountUp value={me.score.total} />} />
              <Stat k="Best race" v={<CountUp value={me.score.last_race_points} />} />
              <Stat k="Percentile" v={`Top ${me.percentile}%`} />
            </>
          ) : (
            <div className="panel panel-pad" style={{ gridColumn: '1 / -1' }}><p className="text-dim">Build a team to unlock your stats.</p></div>
          )}
        </div>

        <span className="eyebrow">Achievements</span>
        <div className="grid g3" style={{ margin: '10px 0 28px' }}>
          {ACHIEVEMENTS.map((a) => {
            const I = a.icon
            return (
              <div key={a.name} className="panel panel-pad row gap-2" style={{ opacity: a.got ? 1 : 0.5 }}>
                <span style={{ width: 40, height: 40, borderRadius: 8, background: a.got ? 'var(--red-glow)' : 'var(--surface-3)', display: 'grid', placeItems: 'center', color: a.got ? 'var(--red)' : 'var(--text-faint)' }}><I size={20} /></span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div><div className="text-faint" style={{ fontSize: 12 }}>{a.desc}</div></div>
              </div>
            )
          })}
        </div>

        <span className="eyebrow">Settings</span>
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="row between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <span>Appearance</span>
            <button className="btn btn-ghost btn-sm" onClick={toggleTheme}>{theme === 'dark' ? <><Sun size={14} /> Light</> : <><Moon size={14} /> Dark</>}</button>
          </div>
          <div className="row between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <div><div>Public profile</div><div className="text-faint" style={{ fontSize: 12 }}>{flagEmoji(profile.country)} Your board rank is visible to others</div></div>
            <span className="chip" style={{ color: 'var(--gain)' }}>{profile.public_profile ? 'ON' : 'OFF'}</span>
          </div>
          <div className="row between" style={{ padding: '14px 18px' }}>
            <span>Account</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { clear(); navigate('/') }}><LogOut size={14} /> Sign out</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="panel stat"><div className="k">{k}</div><div className="v">{v}</div></div>
}
