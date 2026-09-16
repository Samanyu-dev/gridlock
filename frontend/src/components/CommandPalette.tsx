import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, User, Building2, Flag } from 'lucide-react'
import { api } from '../lib/api'
import type { SearchResult } from '../lib/types'

const ICONS: Record<string, typeof User> = { driver: User, constructor: Building2, race: Flag }
const PATHS: Record<string, string> = { driver: '/drivers/', constructor: '/constructors/', race: '/races/' }

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30) }, [open])
  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    let cancel = false
    api.search(q).then((r) => { if (!cancel) { setResults(r.results); setActive(0) } }).catch(() => {})
    return () => { cancel = true }
  }, [q])

  const go = (r: SearchResult) => {
    setOpen(false); setQ('')
    navigate(PATHS[r.type] + r.slug)
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => setOpen(true)} aria-label="Search"
        style={{ gap: 8, color: 'var(--text-dim)' }}>
        <Search size={14} /> Search <kbd style={{ fontFamily: 'var(--font-num)', fontSize: 10, border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px' }}>⌘K</kbd>
      </button>
      <button className="btn btn-ghost btn-sm only-mobile" onClick={() => setOpen(true)} aria-label="Search"><Search size={16} /></button>
      <AnimatePresence>
        {open && (
          <motion.div className="overlay" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', zIndex: 80 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div className="panel panel-glow" style={{ width: 'min(560px, 92vw)', overflow: 'hidden' }}
              initial={{ scale: 0.96, y: -10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="row gap-2" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <Search size={18} className="text-faint" />
                <input ref={inputRef} className="input" style={{ border: 'none', background: 'transparent', padding: 0 }}
                  placeholder="Search drivers, constructors, races…" value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1))
                    if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
                    if (e.key === 'Enter' && results[active]) go(results[active])
                  }} />
              </div>
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {results.length === 0 && (
                  <div className="text-faint" style={{ padding: 24, textAlign: 'center', fontSize: 14 }}>
                    {q ? 'No matches on the grid.' : 'Start typing to search the paddock.'}
                  </div>
                )}
                {results.map((r, i) => {
                  const Icon = ICONS[r.type] || Search
                  return (
                    <button key={r.type + r.slug} onClick={() => go(r)}
                      className="row between" style={{
                        width: '100%', padding: '11px 16px', background: i === active ? 'var(--surface-2)' : 'transparent',
                        border: 'none', color: 'var(--text)', textAlign: 'left',
                      }} onMouseEnter={() => setActive(i)}>
                      <span className="row gap-2"><Icon size={15} className="text-faint" /> {r.label}</span>
                      <span className="eyebrow">{r.meta}</span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
