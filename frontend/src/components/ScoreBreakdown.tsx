import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { WeekendScore } from '../lib/types'

const STATE_META: Record<string, { label: string; color: string; note: string }> = {
  live: { label: 'LIVE', color: 'var(--red)', note: 'Provisional — updating from timing' },
  provisional: { label: 'PROVISIONAL', color: 'var(--caution)', note: 'Awaiting official reconciliation' },
  final: { label: 'FINAL', color: 'var(--gain)', note: 'Official results — scoring locked' },
}

export function StateBadge({ state }: { state: string }) {
  const m = STATE_META[state] || STATE_META.provisional
  return (
    <span className="chip" style={{ color: m.color, borderColor: m.color, padding: '3px 8px' }}>
      {state === 'live' && <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />}
      {m.label}
    </span>
  )
}

/** Auditable weekend score — every point traced to a rule, rendered straight
 *  from the backend ledger (never re-derived on the client). */
export function ScoreBreakdown({ weekend }: { weekend: WeekendScore }) {
  const [open, setOpen] = useState<string | null>(weekend.assets[0]?.ref ?? null)
  const m = STATE_META[weekend.state] || STATE_META.provisional

  return (
    <div className="panel panel-pad">
      <div className="row between" style={{ marginBottom: 4 }}>
        <span className="section-title" style={{ fontSize: 16 }}>Weekend score · Round {weekend.round}</span>
        <StateBadge state={weekend.state} />
      </div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="text-faint" style={{ fontSize: 12 }}>{m.note}{weekend.from_snapshot ? ' · from your locked team' : ''}</span>
        <span className="display" style={{ fontSize: 30 }}>{weekend.total}</span>
      </div>

      <div className="col gap-1">
        {weekend.assets.map((a) => {
          const isOpen = open === a.ref
          return (
            <div key={a.ref} className="panel" style={{ overflow: 'hidden', background: 'var(--surface-2)' }}>
              <button onClick={() => setOpen(isOpen ? null : a.ref)}
                className="row between race-edge" style={{ ['--accent' as string]: a.color, width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', padding: '10px 14px', cursor: 'pointer' }}>
                <span className="row gap-2">
                  <ChevronDown size={14} style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', color: 'var(--text-faint)' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                  {a.multiplier !== 1 && <span className="tag-pts tag-fl">{a.multiplier}×</span>}
                </span>
                <span className="num" style={{ fontWeight: 800, color: a.subtotal >= 0 ? 'var(--text)' : 'var(--loss)' }}>{a.subtotal}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '4px 14px 12px 30px' }}>
                  {a.entries.length === 0 && <span className="text-faint" style={{ fontSize: 12 }}>No scoring events this round.</span>}
                  {a.entries.map((e, i) => (
                    <div key={i} className="row between" style={{ padding: '4px 0', fontSize: 13 }}>
                      <span className="text-dim">{e.label}</span>
                      <span className="num" style={{ fontWeight: 700, color: e.points >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{e.points >= 0 ? '+' : ''}{e.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
