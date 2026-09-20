import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Users, Radio, Flag, UserRound, Layers, Trophy, MoreHorizontal, Settings, Sun, Moon } from 'lucide-react'
import { BrandGlyph } from './Brand'
import { CommandPalette } from './CommandPalette'
import { NotificationBell } from './NotificationBell'
import { useMetaStatus } from '../lib/meta'
import { useSession } from '../lib/session'

const RAIL = [
  { to: '/home', label: 'Overview', icon: Home },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/races', label: 'Races', icon: Flag },
  { to: '/drivers', label: 'Drivers', icon: UserRound },
  { to: '/leagues', label: 'Leagues', icon: Layers },
  { to: '/leaderboard', label: 'Standings', icon: Trophy },
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
  const { meta, error } = useMetaStatus()

  return (
    <div className="shell">
      <aside className="rail" aria-label="Primary">
        <NavLink to="/home" className="rail__brand" aria-label="GRIDLOCK home"><BrandGlyph size={30} /></NavLink>
        <nav className="rail__nav">
          {RAIL.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={label} aria-label={label}
              className={({ isActive }) => `rail__link${isActive ? ' active' : ''}`}>
              <Icon />
            </NavLink>
          ))}
        </nav>
        <div className="rail__bottom">
          <button className="rail__link" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
          <NavLink to="/profile" title="Settings" aria-label="Settings" className="rail__link"><Settings /></NavLink>
          <NavLink to="/profile" aria-label="Profile">
            <span className="avatar" style={{ width: 38, height: 38, fontSize: 12, background: 'var(--surface-3)' }}>
              {(profile?.team_name || 'GL').slice(0, 2).toUpperCase()}
            </span>
          </NavLink>
        </div>
      </aside>

      <div className="shell__main">
        <header className="shell__topbar">
          <span className="shell__welcome">Welcome back, {profile?.display_name || profile?.username || 'racer'}</span>
          <div className="row gap-2" style={{ marginLeft: 'auto', alignItems: 'center' }}>
            <CommandPalette />
            <NotificationBell />
          </div>
        </header>
        <div className="race-context-strip">
          <span className="eyebrow">Race control</span>
          <strong>{meta?.next_race?.name ?? 'Loading schedule'}</strong>
          <span className="text-dim">{meta?.next_race?.round_state?.toLowerCase()} · {meta?.data_source ?? meta?.provider}</span>
          {(error || meta?.data_status === 'stale') && <span role="status" className="text-loss">{error ?? 'Feed delayed · showing last confirmed data'}</span>}
        </div>
        <div className="shell__content">{children}</div>
      </div>

      <nav className="bottomnav" aria-label="Primary mobile">
        {MOBILE.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
