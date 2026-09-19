import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'
import { SessionProvider, useSession } from './lib/session'
import { MetaProvider } from './lib/meta'
import { AppShell } from './components/AppShell'
import { Skeleton } from './components/bits'
import Landing from './features/landing/Landing'
import Onboarding from './features/onboarding/Onboarding'
import Login from './features/onboarding/Login'

const Dashboard = lazy(() => import('./features/dashboard/Dashboard'))
const TeamBuilder = lazy(() => import('./features/team/TeamBuilder'))
const TransferHistory = lazy(() => import('./features/team/TransferHistory'))
const DataHealth = lazy(() => import('./features/admin/DataHealth'))
const Drivers = lazy(() => import('./features/drivers/Drivers'))
const DriverProfile = lazy(() => import('./features/drivers/DriverProfile'))
const Constructors = lazy(() => import('./features/constructors/Constructors'))
const ConstructorProfile = lazy(() => import('./features/constructors/ConstructorProfile'))
const Races = lazy(() => import('./features/races/Races'))
const RaceDetail = lazy(() => import('./features/races/RaceDetail'))
const Circuit = lazy(() => import('./features/races/Circuit'))
const Live = lazy(() => import('./features/live/Live'))
const Leagues = lazy(() => import('./features/leagues/Leagues'))
const League = lazy(() => import('./features/leagues/League'))
const Leaderboard = lazy(() => import('./features/leaderboard/Leaderboard'))
const Rules = lazy(() => import('./features/rules/Rules'))
const Profile = lazy(() => import('./features/profile/Profile'))
const More = lazy(() => import('./features/profile/More'))
const Ownership = lazy(() => import('./features/ownership/Ownership'))
const H2H = lazy(() => import('./features/h2h/H2H'))
const TransferTrends = lazy(() => import('./features/transfers/TransferTrends'))

function RequireUser({ children }: { children: ReactNode }) {
  const { authed } = useSession()
  const loc = useLocation()
  if (!authed) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <AppShell>{children}</AppShell>
}

function RouteFallback() {
  return <div className="page container"><Skeleton h={300} /></div>
}

function AppRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<RouteFallback />}>
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
          <Route path="/circuits/:slug" element={<RequireUser><Circuit /></RequireUser>} />
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
      </Suspense>
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
