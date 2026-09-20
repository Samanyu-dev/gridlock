import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowLeft, Check, Shuffle } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { RacingLine } from '../../components/RacingLine'
import { api } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useSession } from '../../lib/session'
import { flagEmoji, money } from '../../lib/format'
import type { Constructor, Driver } from '../../lib/types'

const PERSONAS = [
  { id: 'casual', label: 'Casual fan', desc: 'Here for the vibes and the weekend.' },
  { id: 'strategist', label: 'Fantasy strategist', desc: 'Transfers, boosts, every point.' },
  { id: 'stats', label: 'Stats nerd', desc: 'Give me the telemetry.' },
  { id: 'competitor', label: 'League competitor', desc: 'I play to beat my friends.' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { setSession, authed: existing } = useSession()
  const [step, setStep] = useState(0)
  const meta = useMeta()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [constructors, setConstructors] = useState<Constructor[]>([])

  const [persona, setPersona] = useState<string | null>(null)
  const [favDrivers, setFavDrivers] = useState<number[]>([])
  const [favConstructor, setFavConstructor] = useState<number | null>(null)
  const [teamName, setTeamName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (existing) { navigate('/home'); return }
    api.drivers({ sort: 'points' }).then((r) => setDrivers(r.drivers)).catch(() => {})
    api.constructors().then((r) => setConstructors(r.constructors)).catch(() => {})
  }, [existing, navigate])

  const total = 7
  const next = () => setStep((s) => Math.min(total - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const toggleDriver = (id: number) =>
    setFavDrivers((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length < 5 ? [...f, id] : f))

  const suggestName = () => {
    const s = meta?.team_name_suggestions || []
    setTeamName(s[Math.floor(Math.random() * s.length)] || 'Late Brakers')
  }

  const finish = async () => {
    setError(''); setBusy(true)
    try {
      const { profile, access_token } = await api.register({
        email: email.trim(), password, username: username.trim(),
        persona: persona || undefined,
        favorite_driver_id: favDrivers[0], favorite_constructor_id: favConstructor || undefined,
        team_name: teamName.trim() || undefined,
      })
      setSession(profile, access_token)
      navigate('/team')
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(false) }
  }
  const canFinish = username.length >= 3 && /.+@.+\..+/.test(email) && password.length >= 8

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="container row between" style={{ height: 66 }}>
        <Brand />
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Exit</button>
      </div>

      {/* progress line */}
      <div className="container" style={{ marginBottom: 8 }}>
        <div className="row gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="bar grow" style={{ height: 3 }}>
              <span style={{ width: i <= step ? '100%' : '0%' }} />
            </div>
          ))}
        </div>
      </div>

      <div className="container grow center" style={{ padding: '24px 20px 60px' }}>
        <div style={{ width: 'min(760px, 100%)' }}>
          <AnimatePresence mode="wait">
            <motion.div key={step}
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28 }}>

              {step === 0 && (
                <div style={{ textAlign: 'center' }}>
                  <RacingLine height={160} />
                  <h1 className="display" style={{ fontSize: 'clamp(40px,8vw,84px)', margin: '18px 0 8px' }}>GRIDLOCK</h1>
                  <p className="text-dim" style={{ fontSize: 18 }}>Build your grid. Own the weekend.</p>
                  <button className="btn btn-primary btn-lg" style={{ marginTop: 28 }} onClick={next}>Start racing <ArrowRight size={18} /></button>
                </div>
              )}

              {step === 1 && (
                <Step title="What brings you to the grid?" sub="We'll tune the experience to how you play.">
                  <div className="grid g2">
                    {PERSONAS.map((p) => (
                      <button key={p.id} onClick={() => { setPersona(p.id); next() }}
                        className="panel panel-pad" style={{ textAlign: 'left', cursor: 'pointer', borderColor: persona === p.id ? 'var(--red)' : undefined }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{p.label}</div>
                        <div className="text-faint" style={{ fontSize: 13, marginTop: 4 }}>{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </Step>
              )}

              {step === 2 && (
                <Step title="Pick your favourite drivers" sub={`Choose up to 5 · ${favDrivers.length}/5 selected`}>
                  <div className="grid g4">
                    {drivers.slice(0, 12).map((d) => {
                      const sel = favDrivers.includes(d.id)
                      return (
                        <button key={d.id} onClick={() => toggleDriver(d.id)}
                          className={`driver-pick-card${sel ? ' selected' : ''}`}>
                          <img className="driver-pick-card__photo" src={d.image_url} alt={d.name} style={{ background: d.constructor.color }} />
                          <span className="driver-pick-card__scrim" aria-hidden />
                          {sel && <span className="driver-pick-card__check"><Check size={14} /></span>}
                          <span className="driver-pick-card__info">
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{d.short}</div>
                            <div className="eyebrow" style={{ opacity: 0.85 }}>{flagEmoji(d.country)} {d.constructor.short}</div>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </Step>
              )}

              {step === 3 && (
                <Step title="Who's your team?" sub="Pick the constructor you'll be shouting for.">
                  <div className="grid g3">
                    {constructors.map((c) => (
                      <button key={c.id} onClick={() => { setFavConstructor(c.id); next() }}
                        className="panel panel-pad race-edge" style={{ ['--accent' as string]: c.color, textAlign: 'left', cursor: 'pointer', borderColor: favConstructor === c.id ? c.color : undefined }}>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        <div className="eyebrow" style={{ marginTop: 4 }}>{money(c.price)} · {c.reliability}% reliability</div>
                      </button>
                    ))}
                  </div>
                </Step>
              )}

              {step === 4 && (
                <Step title="Name your fantasy team" sub="This is who you'll be on the leaderboard.">
                  <div className="row gap-2">
                    <input className="input" style={{ fontSize: 18, padding: 16 }} placeholder="Late Brakers"
                      value={teamName} maxLength={28} onChange={(e) => setTeamName(e.target.value)} />
                    <button className="btn btn-ghost" onClick={suggestName} title="Suggest a name"><Shuffle size={16} /></button>
                  </div>
                  <div className="row gap-1 wrap" style={{ marginTop: 14 }}>
                    {(meta?.team_name_suggestions || []).slice(0, 6).map((s) => (
                      <button key={s} className="chip" style={{ cursor: 'pointer' }} onClick={() => setTeamName(s)}>{s}</button>
                    ))}
                  </div>
                </Step>
              )}

              {step === 5 && (
                <Step title="How it works" sub="Five steps to owning the weekend.">
                  <div className="col gap-2">
                    {[
                      ['Pick your lineup', `${meta?.config.roster.drivers ?? 10} drivers, ${meta?.config.roster.constructors ?? 2} constructors.`],
                      ['Stay under budget', `You've got ${meta ? money(meta.config.budget) : '$300M'} to spend.`],
                      ['Score every weekend', 'Points for quali, the race, and everything in between.'],
                      ['Make transfers & boosts', 'React to form, injuries and momentum.'],
                      ['Beat your friends', 'Private leagues, head-to-head, global grid.'],
                    ].map(([t, d], i) => (
                      <div key={t} className="row gap-3 panel panel-pad">
                        <span className="display" style={{ fontSize: 28, color: 'var(--red)', minWidth: 40 }}>{String(i + 1).padStart(2, '0')}</span>
                        <div><div style={{ fontWeight: 600 }}>{t}</div><div className="text-faint" style={{ fontSize: 13 }}>{d}</div></div>
                      </div>
                    ))}
                  </div>
                </Step>
              )}

              {step === 6 && (
                <Step title="Create your account" sub="Secure your grid with an email and password.">
                  <div className="col gap-2">
                    <div>
                      <label className="label">Username</label>
                      <input className="input" style={{ fontSize: 16, padding: 14 }} placeholder="username"
                        value={username} maxLength={20}
                        onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" style={{ fontSize: 16, padding: 14 }} placeholder="you@example.com"
                        value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <input className="input" type="password" style={{ fontSize: 16, padding: 14 }} placeholder="at least 8 characters"
                        value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                        onKeyDown={(e) => e.key === 'Enter' && canFinish && finish()} />
                    </div>
                  </div>
                  <p className="text-faint" style={{ fontSize: 12, marginTop: 10 }}>
                    Already have an account? <Link to="/login" style={{ color: 'var(--info)' }}>Sign in</Link>.
                  </p>
                  {error && <div className="chip" style={{ marginTop: 12, color: 'var(--loss)', borderColor: 'var(--loss)' }}>{error}</div>}
                  <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} disabled={!canFinish || busy} onClick={finish}>
                    {busy ? 'Building…' : 'Build my first team'} <ArrowRight size={18} />
                  </button>
                </Step>
              )}
            </motion.div>
          </AnimatePresence>

          {step > 0 && step < 6 && (
            <div className="row between" style={{ marginTop: 28 }}>
              <button className="btn btn-ghost" onClick={back}><ArrowLeft size={16} /> Back</button>
              <button className="btn btn-primary" onClick={next}>Continue <ArrowRight size={16} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="display" style={{ fontSize: 'clamp(26px,4vw,40px)', marginBottom: 6 }}>{title}</h2>
      <p className="text-dim" style={{ marginBottom: 24 }}>{sub}</p>
      {children}
    </div>
  )
}
