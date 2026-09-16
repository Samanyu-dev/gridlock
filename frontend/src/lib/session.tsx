import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from './types'

const LS_USER = 'gridlock.username'
const LS_PROFILE = 'gridlock.profile'
const LS_THEME = 'gridlock.theme'

type Theme = 'dark' | 'light'

interface SessionValue {
  username: string | null
  profile: Profile | null
  setSession: (profile: Profile) => void
  clear: () => void
  theme: Theme
  toggleTheme: () => void
}

const SessionContext = createContext<SessionValue>(null as unknown as SessionValue)

function read<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_USER) } catch { return null }
  })
  const [profile, setProfile] = useState<Profile | null>(() => read<Profile>(LS_PROFILE))
  const [theme, setTheme] = useState<Theme>(() => (read<Theme>(LS_THEME) as Theme) || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    write(LS_THEME, theme)
  }, [theme])

  const setSession = (p: Profile) => {
    setProfile(p)
    setUsername(p.username)
    try { localStorage.setItem(LS_USER, p.username) } catch { /* ignore */ }
    write(LS_PROFILE, p)
  }
  const clear = () => {
    setProfile(null); setUsername(null)
    try { localStorage.removeItem(LS_USER); localStorage.removeItem(LS_PROFILE) } catch { /* ignore */ }
  }
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <SessionContext.Provider value={{ username, profile, setSession, clear, theme, toggleTheme }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() { return useContext(SessionContext) }
