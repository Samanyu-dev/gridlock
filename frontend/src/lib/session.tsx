import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from './types'
import { setToken as persistToken, getToken } from './api'

const LS_PROFILE = 'gridlock.profile'
const LS_THEME = 'gridlock.theme'

type Theme = 'dark' | 'light'

interface SessionValue {
  username: string | null
  profile: Profile | null
  authed: boolean
  setSession: (profile: Profile, token: string) => void
  updateProfile: (profile: Profile) => void
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
  const [profile, setProfile] = useState<Profile | null>(() => read<Profile>(LS_PROFILE))
  const [hasToken, setHasToken] = useState<boolean>(() => !!getToken())
  const [theme, setTheme] = useState<Theme>(() => (read<Theme>(LS_THEME) as Theme) || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    write(LS_THEME, theme)
  }, [theme])

  const setSession = (p: Profile, token: string) => {
    persistToken(token)
    setHasToken(true)
    setProfile(p)
    write(LS_PROFILE, p)
  }
  const updateProfile = (p: Profile) => { setProfile(p); write(LS_PROFILE, p) }
  const clear = () => {
    persistToken(null)
    setHasToken(false)
    setProfile(null)
    try { localStorage.removeItem(LS_PROFILE) } catch { /* ignore */ }
  }
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  const authed = hasToken && !!profile
  return (
    <SessionContext.Provider value={{
      username: profile?.username ?? null, profile, authed,
      setSession, updateProfile, clear, theme, toggleTheme,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() { return useContext(SessionContext) }
