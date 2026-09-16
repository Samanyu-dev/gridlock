import { useEffect, useState } from 'react'
import { Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import type { Boost, GameConfig } from '../../lib/types'

interface RulesData { config: GameConfig; rules: Record<string, number | Record<string, number>>; boosts: Boost[] }

export default function Rules() {
  const [data, setData] = useState<RulesData | null>(null)
  useEffect(() => { api.rules().then((r) => setData(r as unknown as RulesData)).catch(() => {}) }, [])
  if (!data) return <div className="page container"><Skeleton h={300} /></div>
  const r = data.rules
  const finish = r.finish_points as Record<string, number>
  const sprint = r.sprint_finish_points as Record<string, number>

  const bonus: [string, number][] = [
    ['Fastest lap', r.fastest_lap as number], ['Driver of the Day', r.driver_of_the_day as number],
    ['Pole position', r.pole as number], ['Reached Q3', r.reached_q3 as number], ['Reached Q2', r.reached_q2 as number],
    ['Classified finish', r.classified_finish as number], ['Position gained (each)', r.position_gained as number],
    ['Position lost (each)', r.position_lost as number], ['Beat teammate — race', r.beat_teammate_race as number],
    ['Beat teammate — quali', r.beat_teammate_quali as number], ['DNF', r.dnf as number], ['DSQ', r.dsq as number],
  ]

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 900 }}>
        <div className="page-head"><span className="eyebrow">The rulebook</span><h1 className="page-title">How to play</h1>
          <p className="text-dim" style={{ marginTop: 8 }}>Every value here is read live from the scoring engine — the game plays exactly by these numbers.</p>
        </div>

        <Section title="Your team">
          <ul className="col gap-1" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Pick <strong>{data.config.roster.drivers} drivers</strong> and <strong>{data.config.roster.constructors} constructors</strong>.</li>
            <li>Stay within a <strong>{money(data.config.budget)}</strong> budget.</li>
            <li>Name one <strong>captain</strong> — they score <strong>{data.config.captain_multiplier}×</strong> points.</li>
            <li>You get <strong>{data.config.free_transfers} free transfers</strong> each round; extra transfers cost <strong>{data.config.extra_transfer_cost} pts</strong>.</li>
            <li>Your team <strong>locks at qualifying</strong>. All validation happens server-side.</li>
          </ul>
        </Section>

        <div className="grid g2" style={{ marginBottom: 20 }}>
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 16 }}>Race finish points</span>
            <div className="grid g2" style={{ marginTop: 12, gap: 6 }}>
              {Object.entries(finish).map(([pos, pts]) => (
                <div key={pos} className="row between" style={{ padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                  <span className={`pos pos-${pos}`}>P{pos}</span><span className="num" style={{ fontWeight: 700, color: 'var(--gain)' }}>+{pts}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 16 }}>Sprint points</span>
            <div className="grid g2" style={{ marginTop: 12, gap: 6 }}>
              {Object.entries(sprint).map(([pos, pts]) => (
                <div key={pos} className="row between" style={{ padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                  <span className={`pos pos-${pos}`}>P{pos}</span><span className="num" style={{ fontWeight: 700, color: 'var(--caution)' }}>+{pts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Section title="Bonuses & penalties">
          <div className="grid g2" style={{ gap: 6 }}>
            {bonus.map(([k, v]) => (
              <div key={k} className="row between" style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 6 }}>
                <span style={{ fontSize: 14 }}>{k}</span>
                <span className="num" style={{ fontWeight: 700, color: v >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{v >= 0 ? '+' : ''}{v}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tactical boosts">
          <div className="grid g2">
            {data.boosts.map((b) => (
              <div key={b.id} className="panel panel-pad race-edge" style={{ ['--accent' as string]: 'var(--red)' }}>
                <div className="row between"><strong>{b.name}</strong><span className="eyebrow">{b.usage_limit}× / season</span></div>
                <p className="text-dim" style={{ fontSize: 13, marginTop: 6 }}>{b.description}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel panel-pad" style={{ marginBottom: 20 }}>
      <span className="section-title" style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>{title}</span>
      {children}
    </div>
  )
}
