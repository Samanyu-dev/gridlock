import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, AlertTriangle, Info, Clock } from 'lucide-react'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import type { Notification } from '../lib/types'

const ACTIONABLE = new Set(['captain_missing', 'unused_transfer', 'unused_underdog', 'lock_reminder'])
const ICON = { info: Info, warning: AlertTriangle, urgent: Clock } as const
const COLOR = { info: 'var(--info)', warning: 'var(--caution)', urgent: 'var(--loss)' } as const

export function NotificationBell() {
  const { authed } = useSession()
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authed) return
    api.notifications().then((r) => setItems(r.notifications)).catch(() => {})
  }, [authed])

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!authed) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-label="Notifications" style={{ position: 'relative' }}>
        <Bell size={16} />
        {items.length > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12 }}
            className="panel" style={{ position: 'absolute', right: 0, top: '110%', width: 320, maxHeight: 400, overflowY: 'auto', zIndex: 50, padding: 8 }}
          >
            {items.length === 0 && <p className="text-faint" style={{ fontSize: 13, padding: 10 }}>Nothing needs your attention.</p>}
            <div className="col gap-1">
              {items.map((n, i) => {
                const Icon = ICON[n.severity]
                const to = ACTIONABLE.has(n.type) ? '/team' : '/live'
                return (
                  <Link key={i} to={to} onClick={() => setOpen(false)} className="row gap-2" style={{ padding: '8px 8px', borderRadius: 6, alignItems: 'flex-start' }}>
                    <Icon size={15} color={COLOR[n.severity]} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 13 }}>{n.text}</span>
                  </Link>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
