import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Users, Ticket, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import type { LeagueSummary } from '../../lib/types'

export default function Leagues() {
  const { username } = useSession()
  const navigate = useNavigate()
  const [pub, setPub] = useState<LeagueSummary[]>([])
  const [mine, setMine] = useState<LeagueSummary[]>([])
  const [modal, setModal] = useState<null | 'create' | 'join'>(null)
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [privacy, setPrivacy] = useState('private')
  const [type, setType] = useState('classic')
  const [err, setErr] = useState('')

  const load = () => { if (username) api.leagues(username).then((r) => { setPub(r.public); setMine(r.mine) }).catch(() => {}) }
  useEffect(load, [username])

  const create = async () => {
    setErr('')
    try {
      const r = await api.createLeague({ username: username!, name, description: desc, privacy, type })
      navigate(`/leagues/${r.code}`)
    } catch (e) { setErr((e as Error).message) }
  }
  const join = async () => {
    setErr('')
    try {
      const r = await api.joinLeague({ username: username!, code: joinCode.trim().toUpperCase() })
      navigate(`/leagues/${r.code}`)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-head row between wrap gap-2">
          <div><span className="eyebrow">Compete</span><h1 className="page-title">Leagues</h1></div>
          <div className="row gap-2">
            <button className="btn btn-ghost" onClick={() => { setModal('join'); setErr('') }}><Ticket size={16} /> Join with code</button>
            <button className="btn btn-primary" onClick={() => { setModal('create'); setErr('') }}><Plus size={16} /> Create league</button>
          </div>
        </div>

        {mine.length > 0 && (
          <>
            <span className="eyebrow">Your leagues</span>
            <div className="grid g2" style={{ margin: '10px 0 28px' }}>
              {mine.map((l) => <LeagueCard key={l.code} l={l} />)}
            </div>
          </>
        )}

        <span className="eyebrow">Public leagues</span>
        {pub.length === 0 ? (
          <div className="panel empty" style={{ marginTop: 10 }}>
            <Users className="glyph" />
            <h3 className="section-title" style={{ marginBottom: 6 }}>The paddock is quiet</h3>
            <p className="text-dim" style={{ marginBottom: 16 }}>No leagues yet — start your own or join with a code.</p>
            <div className="row gap-2 center">
              <button className="btn btn-primary" onClick={() => setModal('create')}>Create league</button>
              <button className="btn btn-ghost" onClick={() => setModal('join')}>Join with code</button>
            </div>
          </div>
        ) : (
          <div className="grid g2" style={{ marginTop: 10 }}>
            {pub.map((l) => <LeagueCard key={l.code} l={l} />)}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <motion.div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModal(null)}>
            <motion.div className="panel panel-glow panel-pad" style={{ width: 'min(460px, 92vw)' }}
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="row between" style={{ marginBottom: 16 }}>
                <h3 className="section-title">{modal === 'create' ? 'Create a league' : 'Join a league'}</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
              </div>
              {modal === 'create' ? (
                <div className="col gap-2">
                  <div><label className="label">League name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Late Brakers League" /></div>
                  <div><label className="label">Description</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" /></div>
                  <div className="grid g2">
                    <div><label className="label">Privacy</label><select className="select" value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="private">Private</option><option value="public">Public</option></select></div>
                    <div><label className="label">Type</label><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="classic">Classic</option><option value="h2h">Head-to-head</option></select></div>
                  </div>
                  {err && <span className="chip" style={{ color: 'var(--loss)', borderColor: 'var(--loss)' }}>{err}</span>}
                  <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={name.trim().length < 3} onClick={create}>Create & get code</button>
                </div>
              ) : (
                <div className="col gap-2">
                  <div><label className="label">League code</label><input className="input" style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-num)' }} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="GRID-XXXX" /></div>
                  {err && <span className="chip" style={{ color: 'var(--loss)', borderColor: 'var(--loss)' }}>{err}</span>}
                  <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={joinCode.trim().length < 4} onClick={join}>Join league</button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LeagueCard({ l }: { l: LeagueSummary }) {
  return (
    <Link to={`/leagues/${l.code}`} className="panel panel-pad race-edge" style={{ ['--accent' as string]: l.privacy === 'public' ? 'var(--info)' : 'var(--red)' }}>
      <div className="row between">
        <h3 className="section-title" style={{ fontSize: 17 }}>{l.name}</h3>
        <span className="chip" style={{ padding: '2px 7px' }}>{l.type === 'h2h' ? 'H2H' : 'Classic'}</span>
      </div>
      <p className="text-dim" style={{ fontSize: 13, margin: '6px 0 12px', minHeight: 18 }}>{l.description || 'No description'}</p>
      <div className="row between">
        <span className="eyebrow"><Users size={12} style={{ verticalAlign: -2 }} /> {l.member_count} managers</span>
        <span className="num text-faint">{l.code}</span>
      </div>
    </Link>
  )
}
