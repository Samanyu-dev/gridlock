import { Link, useNavigate } from 'react-router-dom'
import { User, Building2, Flag, Trophy, BookOpen, BarChart3, Repeat, Sun, Moon, LogOut, ChevronRight } from 'lucide-react'
import { useSession } from '../../lib/session'

const LINKS = [
  { to: '/drivers', label: 'Drivers', icon: User },
  { to: '/constructors', label: 'Constructors', icon: Building2 },
  { to: '/races', label: 'Race calendar', icon: Flag },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/team/transfers', label: 'Transfer history', icon: Repeat },
  { to: '/rules', label: 'How to play', icon: BookOpen },
  { to: '/profile', label: 'Profile & achievements', icon: BarChart3 },
]

export default function More() {
  const { theme, toggleTheme, clear, profile } = useSession()
  const navigate = useNavigate()
  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><span className="eyebrow">{profile?.team_name}</span><h1 className="page-title">More</h1></div>
        <div className="panel" style={{ overflow: 'hidden' }}>
          {LINKS.map(({ to, label, icon: Icon }, i) => (
            <Link key={to} to={to} className="row between" style={{ padding: '16px 18px', borderBottom: i < LINKS.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <span className="row gap-2"><Icon size={18} className="text-dim" /> {label}</span>
              <ChevronRight size={16} className="text-faint" />
            </Link>
          ))}
        </div>
        <div className="row gap-2" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost grow" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <button className="btn btn-ghost grow" onClick={() => { clear(); navigate('/') }}><LogOut size={16} /> Sign out</button>
        </div>
      </div>
    </div>
  )
}
