import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Layers, Infinity as Inf, Shuffle, Wrench, type LucideIcon } from 'lucide-react'
import type { Boost } from '../../lib/types'

const ICONS: Record<string, LucideIcon> = {
  zap: Zap, layers: Layers, infinity: Inf, shuffle: Shuffle, wrench: Wrench,
}

/** Press-and-hold to arm a tactical boost — a car accelerates across the fill. */
export function BoostBar({ boosts, active, onSelect }: {
  boosts: Boost[]; active: string | null; onSelect: (id: string | null) => void
}) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="eyebrow">Tactical boosts</span>
        <span className="eyebrow">Arm one for the weekend</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {boosts.map((b) => (
          <BoostCard key={b.id} boost={b} armed={active === b.id}
            onArm={() => onSelect(active === b.id ? null : b.id)} />
        ))}
      </div>
    </div>
  )
}

function BoostCard({ boost, armed, onArm }: { boost: Boost; armed: boolean; onArm: () => void }) {
  const Icon = ICONS[boost.icon] || Zap
  const [progress, setProgress] = useState(0)
  const raf = useRef(0)

  const start = () => {
    if (armed) { onArm(); return }
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 650)
      setProgress(p)
      if (p >= 1) { onArm(); setProgress(0); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const stop = () => { cancelAnimationFrame(raf.current); setProgress(0) }

  return (
    <div className="panel" style={{ padding: 12, position: 'relative', overflow: 'hidden', borderColor: armed ? 'var(--red)' : undefined, cursor: 'pointer', userSelect: 'none' }}
      onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={(e) => { e.preventDefault(); start() }} onTouchEnd={stop}
      title={boost.description}>
      {progress > 0 && (
        <motion.div style={{ position: 'absolute', inset: 0, background: 'var(--red-glow)', width: `${progress * 100}%` }} />
      )}
      <div className="row between" style={{ position: 'relative' }}>
        <Icon size={18} style={{ color: armed ? 'var(--red)' : 'var(--text-dim)' }} />
        {armed && <span className="chip chip-live" style={{ padding: '2px 6px' }}><span className="dot" />Armed</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8, position: 'relative' }}>{boost.name}</div>
      <div className="text-faint" style={{ fontSize: 11, marginTop: 2, position: 'relative', lineHeight: 1.35 }}>{boost.description}</div>
      <div className="eyebrow" style={{ marginTop: 6, position: 'relative' }}>{armed ? 'Tap to disarm' : 'Hold to arm'}</div>
    </div>
  )
}
