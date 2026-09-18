import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'
import { SessionProvider, useSession } from './lib/session'
import { MetaProvider } from './lib/meta'
import { AppShell } from './components/AppShell'
import Landing from './features/landing/Landing'
import Onboarding from './features/onboarding/Onboarding'
import Login from './features/onboarding/Login'
import Dashboard from './features/dashboard/Dashboard'
import TeamBuilder from './features/team/TeamBuilder'
import TransferHistory from './features/team/TransferHistory'
import DataHealth from './features/admin/DataHealth'
import Drivers from './features/drivers/Drivers'
import DriverProfile from './features/drivers/DriverProfile'
import Constructors from './features/constructors/Constructors'
import ConstructorProfile from './features/constructors/ConstructorProfile'
import Races from './features/races/Races'
import RaceDetail from './features/races/RaceDetail'
import Live from './features/live/Live'
import Leagues from './features/leagues/Leagues'
import League from './features/leagues/League'
import Leaderboard from './features/leaderboard/Leaderboard'
import Rules from './features/rules/Rules'
import Profile from './features/profile/Profile'
import More from './features/profile/More'
import Ownership from './features/ownership/Ownership'
import H2H from './features/h2h/H2H'
import TransferTrends from './features/transfers/TransferTrends'

function RequireUser({ children }: { children: ReactNode }) {
  const { authed } = useSession()
  const loc = useLocation()
  if (!authed) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <AppShell>{children}</AppShell>
}

function AppRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname.split('/').slice(0, 2).join('/')}>
        <Route path="/" element={<Landing />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<RequireUser><Dashboard /></RequireUser>} />
        <Route path="/team" element={<RequireUser><TeamBuilder /></RequireUser>} />
        <Route path="/team/transfers" element={<RequireUser><TransferHistory /></RequireUser>} />
        <Route path="/admin/data-health" element={<RequireUser><DataHealth /></RequireUser>} />
        <Route path="/drivers" element={<RequireUser><Drivers /></RequireUser>} />
        <Route path="/drivers/:slug" element={<RequireUser><DriverProfile /></RequireUser>} />
        <Route path="/constructors" element={<RequireUser><Constructors /></RequireUser>} />
        <Route path="/constructors/:slug" element={<RequireUser><ConstructorProfile /></RequireUser>} />
        <Route path="/races" element={<RequireUser><Races /></RequireUser>} />
        <Route path="/races/:slug" element={<RequireUser><RaceDetail /></RequireUser>} />
        <Route path="/live" element={<RequireUser><Live /></RequireUser>} />
        <Route path="/leagues" element={<RequireUser><Leagues /></RequireUser>} />
        <Route path="/leagues/:code" element={<RequireUser><League /></RequireUser>} />
        <Route path="/leaderboard" element={<RequireUser><Leaderboard /></RequireUser>} />
        <Route path="/ownership" element={<RequireUser><Ownership /></RequireUser>} />
        <Route path="/h2h/:username" element={<RequireUser><H2H /></RequireUser>} />
        <Route path="/transfers/trends" element={<RequireUser><TransferTrends /></RequireUser>} />
        <Route path="/rules" element={<RequireUser><Rules /></RequireUser>} />
        <Route path="/profile" element={<RequireUser><Profile /></RequireUser>} />
        <Route path="/more" element={<RequireUser><More /></RequireUser>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <MetaProvider>
        <AppRoutes />
      </MetaProvider>
    </SessionProvider>
  )
}
