import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Users, Radio, Layers, MoreHorizontal, Sun, Moon } from 'lucide-react'
import { Brand } from './Brand'
import { CommandPalette } from './CommandPalette'
import { SpeedBackground } from './SpeedBackground'
import { useSession } from '../lib/session'

// Set to a URL (e.g. "/media/hero.mp4") to use a real looping clip instead of
// the animated speed canvas. Left undefined → tasteful motion canvas.
const APP_VIDEO: string | undefined = undefined

const LINKS = [
  { to: '/home', label: 'Home' },
  { to: '/team', label: 'Team' },
  { to: '/live', label: 'Live' },
  { to: '/races', label: 'Races' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/leagues', label: 'Leagues' },
  { to: '/leaderboard', label: 'Standings' },
]
const MOBILE = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/leagues', label: 'Leagues', icon: Layers },
  { to: '/more', label: 'More', icon: MoreHorizontal },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme, profile } = useSession()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])

  return (
    <div className="app-v2">
      <div className="appbg">
        <SpeedBackground src={APP_VIDEO} intensity={0.7} />
        <div className="appbg__scrim" />
      </div>

      <nav className={`floatnav ${scrolled ? 'scrolled' : ''}`} aria-label="Primary">
        <NavLink to="/home"><Brand size={17} /></NavLink>
        <div className="floatnav__links">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>{l.label}</NavLink>
          ))}
        </div>
        <div className="floatnav__right">
          <CommandPalette />
          <button className="btn btn-ghost btn-sm" onClick={toggleTheme} aria-label="Toggle theme" style={{ padding: 8 }}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <NavLink to="/profile" aria-label="Profile">
            <span className="avatar" style={{ width: 34, height: 34, fontSize: 12, background: 'var(--surface-3)' }}>
              {(profile?.team_name || 'GL').slice(0, 2).toUpperCase()}
            </span>
          </NavLink>
        </div>
      </nav>

      <div className="main-v2">
        <div className="below-nav">{children}</div>
      </div>

      <nav className="floattabs" aria-label="Primary mobile">
        {MOBILE.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
