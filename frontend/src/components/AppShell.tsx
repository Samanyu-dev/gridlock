import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, Users, Radio, Flag, User, Building2, Trophy, BarChart3,
  BookOpen, Sun, Moon, LogOut, MoreHorizontal, Layers,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Brand } from './Brand'
import { CommandPalette } from './CommandPalette'
import { Countdown } from './motion'
import { useSession } from '../lib/session'
import { useMeta } from '../lib/meta'
import { urgency } from '../lib/format'

const PRIMARY = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/team', label: 'My Team', icon: Users },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/races', label: 'Races', icon: Flag },
  { to: '/drivers', label: 'Drivers', icon: User },
  { to: '/constructors', label: 'Constructors', icon: Building2 },
  { to: '/leagues', label: 'Leagues', icon: Layers },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
]
const SECONDARY = [
  { to: '/rules', label: 'Rules', icon: BookOpen },
  { to: '/profile', label: 'Profile', icon: BarChart3 },
]
const MOBILE = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/leagues', label: 'Leagues', icon: Layers },
  { to: '/more', label: 'More', icon: MoreHorizontal },
]

function RaceWeekChip() {
  const meta = useMeta()
  if (!meta?.next_race) return null
  const u = urgency(meta.next_race.deadline)
  return (
    <div className="row gap-2 hide-mobile">
      <span className="eyebrow">Race Week · {meta.next_race.location}</span>
      <span className={`chip ${u === 'urgent' || u === 'soon' ? 'chip-live' : ''}`}>
        {u === 'urgent' && <span className="dot" />}
        Locks <Countdown iso={meta.next_race.deadline} compact />
      </span>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { clear, theme, toggleTheme, profile } = useSession()
  const navigate = useNavigate()

  return (
    <div className="app">
      <aside className="sidebar">
        <div style={{ padding: '4px 12px 18px' }}>
          <NavLink to="/home"><Brand size={19} /></NavLink>
        </div>
        {PRIMARY.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon /> {label}
          </NavLink>
        ))}
        <div className="nav-group-label">Account</div>
        {SECONDARY.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon /> {label}
          </NavLink>
        ))}
        <div className="grow" />
        <button className="nav-link" style={{ border: 'none', background: 'transparent', width: '100%' }} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun /> : <Moon />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button className="nav-link" style={{ border: 'none', background: 'transparent', width: '100%' }}
          onClick={() => { clear(); navigate('/') }}>
          <LogOut /> Sign out
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="only-mobile"><Brand size={17} /></span>
          <RaceWeekChip />
          <div className="grow" />
          <CommandPalette />
          <NavLink to="/profile" className="row gap-2 hide-mobile" style={{ paddingLeft: 8 }}>
            <span className="avatar" style={{ width: 32, height: 32, fontSize: 12, background: 'var(--surface-3)' }}>
              {(profile?.team_name || 'GL').slice(0, 2).toUpperCase()}
            </span>
          </NavLink>
        </header>
        {children}
      </div>

      <nav className="bottomnav">
        {MOBILE.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon /> {label}
          </NavLink>
        ))}
      </nav>
      <button className="only-mobile" onClick={toggleTheme} aria-label="Toggle theme"
        style={{ position: 'fixed', top: 12, right: 12, zIndex: 50, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, width: 34, height: 34, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  )
}
