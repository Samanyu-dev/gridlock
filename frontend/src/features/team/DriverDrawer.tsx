import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Plus, Check } from 'lucide-react'
import { Avatar, Sparkline } from '../../components/bits'
import { api } from '../../lib/api'
import { flagEmoji, money, statusLabel } from '../../lib/format'
import type { DriverFull } from '../../lib/types'

export function DriverDrawer({ slug, selected, onAdd, onClose }: {
  slug: string | null; selected: boolean
  onAdd?: () => void; onClose: () => void
}) {
  const [driver, setDriver] = useState<DriverFull | null>(null)
  useEffect(() => {
    setDriver(null)
    if (slug) api.driver(slug).then(setDriver).catch(() => {})
  }, [slug])

  return (
    <AnimatePresence>
      {slug && (
        <>
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="drawer" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
            {!driver ? (
              <div style={{ padding: 24 }} className="col gap-2">
                <div className="skeleton" style={{ height: 120 }} />
                <div className="skeleton" style={{ height: 80 }} />
              </div>
            ) : (
              <div>
                <div style={{ padding: 20, background: `linear-gradient(160deg, ${driver.constructor.color}33, transparent)` }}>
                  <div className="row between">
                    <span className="eyebrow">#{driver.number} · {driver.constructor.name}</span>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
                  </div>
                  <div className="row gap-3" style={{ marginTop: 12 }}>
                    <Avatar name={driver.name} number={driver.number} color={driver.constructor.color} size={72} image={driver.image_url} />
                    <div>
                      <h2 className="display" style={{ fontSize: 28 }}>{driver.name}</h2>
                      <span className="text-dim">{flagEmoji(driver.country)} {driver.country_name}</span>
                    </div>
                  </div>
                </div>

                <div className="grid g3" style={{ padding: 20, gap: 12 }}>
                  {[['Price', money(driver.price)], ['Points', driver.points], ['Owned', `${driver.ownership}%`]].map(([k, v]) => (
                    <div key={k} className="panel stat" style={{ padding: 12 }}>
                      <div className="k">{k}</div><div className="v" style={{ fontSize: 22 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '0 20px 20px' }}>
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <span className="eyebrow">Fantasy points · last {driver.history.slice(-5).length} rounds</span>
                    <span className="num text-faint" style={{ fontSize: 12 }}>Form {driver.form.toFixed(1)}</span>
                  </div>
                  <div className="panel panel-pad">
                    <Sparkline data={driver.last5} color={driver.constructor.color} width={400} height={64} />
                  </div>
                </div>

                <div style={{ padding: '0 20px 20px' }}>
                  <span className="eyebrow">Season stats</span>
                  <div className="grid g2" style={{ marginTop: 10, gap: 8 }}>
                    {[
                      ['Avg qualifying', driver.stats.avg_quali ?? '—'],
                      ['Avg finish', driver.stats.avg_finish ?? '—'],
                      ['Podiums', driver.stats.podiums], ['Wins', driver.stats.wins],
                      ['Positions gained', driver.stats.positions_gained], ['Fastest laps', driver.stats.fastest_laps],
                      ['DNFs', driver.stats.dnfs], ['Races', driver.stats.races],
                    ].map(([k, v]) => (
                      <div key={k as string} className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                        <span className="text-dim" style={{ fontSize: 13 }}>{k}</span>
                        <span className="num" style={{ fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '0 20px 20px' }}>
                  <span className="eyebrow">Recent form</span>
                  <div className="col gap-1" style={{ marginTop: 10 }}>
                    {driver.history.slice(-5).reverse().map((h) => (
                      <div key={h.round} className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                        <span className="row gap-2"><span className="eyebrow">R{h.round}</span><span style={{ fontSize: 13 }}>{h.location}</span></span>
                        <span className="row gap-2">
                          <span className="chip" style={{ padding: '2px 6px' }}>{h.finish ? `P${h.finish}` : statusLabel(h.status)}</span>
                          <span className="num" style={{ fontWeight: 700, color: h.points >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{h.points >= 0 ? '+' : ''}{h.points}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {onAdd && (
                  <div style={{ padding: 20, borderTop: '1px solid var(--line)', position: 'sticky', bottom: 0, background: 'var(--bg-2)' }}>
                    <button className={`btn btn-block btn-lg ${selected ? 'btn-ghost' : 'btn-primary'}`} onClick={onAdd}>
                      {selected ? <><Check size={18} /> In your team — remove</> : <><Plus size={18} /> Add to team</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
