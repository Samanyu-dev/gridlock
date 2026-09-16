import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { RacingLine } from '../../components/RacingLine'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'

type Mode = 'login' | 'reset' | 'reset-confirm'

export default function Login() {
  const navigate = useNavigate()
  const { setSession, authed } = useSession()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (authed) navigate('/home') }, [authed, navigate])

  const login = async () => {
    setError(''); setBusy(true)
    try {
      const { profile, access_token } = await api.login(email.trim(), password)
      setSession(profile, access_token)
      navigate('/home')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const requestReset = async () => {
    setError(''); setNote(''); setBusy(true)
    try {
      const r = await api.requestReset(email.trim())
      // In production the token arrives by email; the demo surfaces it so the
      // reset flow is completable end-to-end.
      if (r.reset_token) { setResetToken(r.reset_token); setMode('reset-confirm') }
      setNote('If that email exists, a reset link is on its way.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const confirmReset = async () => {
    setError(''); setBusy(true)
    try {
      await api.confirmReset(resetToken, password)
      setNote('Password updated — you can sign in now.')
      setMode('login'); setPassword('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const oauth = async (provider: string) => {
    setError('')
    try {
      const r = await api.oauthStart(provider)
      window.location.href = r.authorize_url
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="container row between" style={{ height: 66 }}>
        <Link to="/"><Brand /></Link>
        <Link to="/onboarding" className="btn btn-ghost btn-sm">Create account</Link>
      </div>
      <div style={{ opacity: 0.5 }}><RacingLine height={120} /></div>

      <div className="container grow center" style={{ padding: '10px 20px 60px' }}>
        <motion.div className="panel panel-glow panel-pad" style={{ width: 'min(420px, 100%)' }}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <span className="eyebrow">Welcome back to the grid</span>
          <h1 className="display" style={{ fontSize: 30, margin: '6px 0 20px' }}>
            {mode === 'login' ? 'Sign in' : 'Reset password'}
          </h1>

          {mode !== 'reset-confirm' && (
            <div className="col gap-2">
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email" />
              </div>
              {mode === 'login' && (
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="password" autoComplete="current-password"
                    onKeyDown={(e) => e.key === 'Enter' && login()} />
                </div>
              )}
            </div>
          )}

          {mode === 'reset-confirm' && (
            <div>
              <label className="label">New password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="at least 8 characters" autoComplete="new-password"
                onKeyDown={(e) => e.key === 'Enter' && confirmReset()} />
            </div>
          )}

          {error && <div className="chip" style={{ marginTop: 12, color: 'var(--loss)', borderColor: 'var(--loss)' }}>{error}</div>}
          {note && <div className="chip" style={{ marginTop: 12, color: 'var(--gain)', borderColor: 'var(--gain)' }}>{note}</div>}

          {mode === 'login' && (
            <>
              <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }}
                disabled={busy || !email || !password} onClick={login}>
                {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
              </button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => { setMode('reset'); setError(''); setNote('') }}>
                Forgot password?
              </button>
              <div className="row gap-2" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost grow" onClick={() => oauth('google')}>Google</button>
                <button className="btn btn-ghost grow" onClick={() => oauth('apple')}>Apple</button>
              </div>
              <p className="text-faint" style={{ fontSize: 12, marginTop: 14, textAlign: 'center' }}>
                New here? <Link to="/onboarding" style={{ color: 'var(--info)' }}>Build your first team</Link>.
              </p>
            </>
          )}
          {mode === 'reset' && (
            <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} disabled={busy || !email} onClick={requestReset}>
              Send reset link
            </button>
          )}
          {mode === 'reset-confirm' && (
            <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} disabled={busy || password.length < 8} onClick={confirmReset}>
              Update password
            </button>
          )}
        </motion.div>
      </div>
    </div>
  )
}
