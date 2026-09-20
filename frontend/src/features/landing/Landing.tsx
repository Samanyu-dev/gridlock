import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Gauge, Trophy, Users, Radio, Zap, LineChart } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { RacingLine } from '../../components/RacingLine'
import { Countdown } from '../../components/motion'
import { Avatar, Delta } from '../../components/bits'
import { api } from '../../lib/api'
import { useMetaStatus } from '../../lib/meta'
import { useSession } from '../../lib/session'
import { flagEmoji } from '../../lib/format'
import type { Driver, LeaderboardRow } from '../../lib/types'

import { CinematicHero } from './CinematicHero'

export default function Landing() {
  const navigate = useNavigate()
  const { authed } = useSession()
  const { meta, error: feedError } = useMetaStatus()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [board, setBoard] = useState<LeaderboardRow[]>([])
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (authed) { navigate('/home'); return }
    api.drivers({ sort: 'points' }).then((r) => setDrivers(r.drivers.slice(0, 4))).catch(() => {})
    api.leaderboard({ limit: 4 }).then((r) => setBoard(r.entries)).catch(() => {})
  }, [authed, navigate])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const nr = meta?.next_race

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, transition: 'all .2s',
        background: scrolled ? 'color-mix(in srgb, var(--bg) 86%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--line)' : '1px solid transparent',
      }}>
        <div className="container row between" style={{ height: 66 }}>
          <Brand />
          <nav className="row gap-3 hide-mobile" style={{ fontSize: 14, color: 'var(--text-dim)' }}>
            <a href="#fantasy">Fantasy</a><a href="#drivers">Drivers</a>
            <a href="#weekend">Races</a><a href="#leaderboard">Leagues</a><a href="#how">How It Works</a>
          </nav>
          <div className="row gap-2">
            <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
            <Link to="/onboarding" className="btn btn-primary btn-sm">Play Now</Link>
          </div>
        </div>
      </header>

      <CinematicHero />

      {feedError && <div className="container feed-notice" role="status">{feedError}</div>}
      {/* Race weekend preview */}
      <section id="weekend" className="container" style={{ padding: '30px 20px' }}>
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="row between wrap gap-3" style={{ padding: 24 }}>
            <div>
              <span className="eyebrow">Round {nr?.round ?? '—'} · Next Grand Prix</span>
              <h2 className="display" style={{ fontSize: 40, margin: '6px 0' }}>
                {flagEmoji(nr?.country)} {nr ? nr.location : '—'}
              </h2>
              <span className="text-dim">{nr?.circuit} · {nr?.laps} laps</span>
            </div>
            <div className="col" style={{ alignItems: 'flex-end' }}>
              <span className="eyebrow" style={{ marginBottom: 8 }}>Fantasy deadline</span>
              {nr && <Countdown iso={nr.deadline} />}
            </div>
          </div>
          <div className="row session-strip" style={{ borderTop: '1px solid var(--line)' }}>
            {['FP1', 'FP2', 'FP3', 'QUALIFYING', 'RACE'].map((s, i) => (
              <div key={s} className="grow" style={{ padding: '16px', textAlign: 'center', borderLeft: i ? '1px solid var(--line)' : 'none', background: s === 'RACE' ? 'var(--surface-2)' : 'transparent' }}>
                <div className="eyebrow" style={{ color: s === 'RACE' ? 'var(--red)' : undefined }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Build-your-team demo */}
      <section id="drivers" className="container" style={{ padding: '40px 20px' }}>
        <div className="landing-builder-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center' }}>
          <div>
            <span className="eyebrow">The team builder</span>
            <h2 className="display" style={{ fontSize: 'clamp(28px,4vw,44px)', margin: '10px 0 16px' }}>$300M. Your top 10.</h2>
            <p className="text-dim" style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>
              Ten drivers, two constructors, one captain on {meta?.config.captain_multiplier ?? 1.5}× points — laid out like a real
              starting grid. Spend it on the front row or find value deep in the midfield.
            </p>
            <div className="col gap-2">
              {[
                ['Fill the grid', 'Ten driver slots, paired up like a real starting grid.'],
                ['Stay under budget', 'A $300M cap — spend it wisely.'],
                ['Name your captain', 'A captain multiplier on the driver you trust.'],
              ].map(([t, d]) => (
                <div key={t} className="row gap-2 race-edge" style={{ padding: '8px 0 8px 16px' }}>
                  <div><div style={{ fontWeight: 600 }}>{t}</div><div className="text-faint" style={{ fontSize: 13 }}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel panel-pad">
            <div className="row between" style={{ marginBottom: 14 }}>
              <span className="eyebrow">Your grid</span>
              <span className="eyebrow">{Math.min(drivers.length, 10)}/10</span>
            </div>
            <div className="col gap-1">
              {drivers.slice(0, 5).map((d, i) => (
                <div key={d.id} className="grid-row" style={{ ['--row-shift' as string]: i % 2 ? '18px' : '0px' }}>
                  <span className="pos" style={{ minWidth: 20 }}>P{i * 2 + 1}</span>
                  <Avatar name={d.name} number={d.number} color={d.constructor.color} size={34} image={d.image_url} />
                  <div className="col grow">
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{d.short}</span>
                    <span className="eyebrow">{d.constructor.short}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features editorial */}
      <section id="fantasy" className="container" style={{ padding: '40px 20px' }}>
        <span className="eyebrow">Why GRIDLOCK</span>
        <h2 className="display" style={{ fontSize: 'clamp(28px,4vw,44px)', margin: '8px 0 24px' }}>A full race-weekend, gamified.</h2>
        <div className="grid landing-features">
          {[
            [Gauge, 'Deep scoring', 'Points for qualifying, positions gained, fastest laps, teammate battles, DNFs and more — all from a transparent engine.'],
            [Radio, 'Live race centre', 'Follow weekend results and inspect every scoring event as data arrives.'],
            [Users, 'Private leagues', 'Spin up a league in seconds, share a code, and settle it on the track.'],
            [Zap, 'Tactical boosts', 'Back an Underdog for a 2× round multiplier if they finish P6–P10.'],
            [LineChart, 'Driver analytics', 'Compare form, value and race history to find the edge before the deadline.'],
            [Trophy, 'Global grid', 'See how your team stacks up against the rest of the grid.'],
          ].map(([Icon, title, body], i) => {
            const I = Icon as typeof Gauge
            return (
              <div key={i} className="panel panel-pad" style={{ minHeight: 150 }}>
                <I size={22} style={{ color: 'var(--red)' }} />
                <h3 className="section-title" style={{ fontSize: 17, margin: '14px 0 8px' }}>{title as string}</h3>
                <p className="text-dim" style={{ fontSize: 14, lineHeight: 1.5 }}>{body as string}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Leaderboard preview */}
      <section id="leaderboard" className="container" style={{ padding: '40px 20px' }}>
        <div className="landing-leaderboard">
          <div>
            <span className="eyebrow">The global grid</span>
            <h2 className="display" style={{ fontSize: 'clamp(28px,4vw,44px)', margin: '10px 0 14px' }}>Race the world, every weekend.</h2>
            <p className="text-dim" style={{ fontSize: 16, lineHeight: 1.6 }}>Every point moves you up the order. Rankings update as verified results arrive.</p>
          </div>
          <div className="panel" style={{ overflow: 'hidden' }}>
            {board.map((row, i) => (
              <div key={row.rank} className="row between" style={{ padding: '14px 18px', borderBottom: i < board.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                <div className="row gap-2">
                  <span className={`pos pos-${row.rank}`}>{String(row.rank).padStart(2, '0')}</span>
                  <span style={{ fontWeight: 600 }}>{row.team_name}</span>
                  <Delta value={row.movement} />
                </div>
                <span className="num" style={{ fontWeight: 700, fontSize: 18 }}>{row.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works / final CTA */}
      <section id="how" style={{ padding: '20px 0 0' }}>
        <RacingLine height={120} color="var(--info)" />
      </section>
      <section className="container center col" style={{ padding: '48px 20px 80px', textAlign: 'center' }}>
        <h2 className="display" style={{ fontSize: 'clamp(36px,7vw,80px)' }}>The grid is waiting.</h2>
        <p className="text-dim" style={{ fontSize: 17, margin: '14px 0 26px' }}>Free to play. No wallet, no wagers — just strategy.</p>
        <Link to="/onboarding" className="btn btn-primary btn-lg">Build your team <ArrowRight size={18} /></Link>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)' }}>
        <div className="container row between wrap gap-2" style={{ padding: '24px 20px', color: 'var(--text-faint)', fontSize: 13 }}>
          <Brand size={15} />
          <span>Unofficial fan project for a private group. Driver, team and race data via OpenF1 / Jolpica — not affiliated with Formula 1. Free-to-play — no real-money wagering.</span>
        </div>
      </footer>
    </div>
  )
}
