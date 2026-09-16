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
  const quali = r.quali_points as Record<string, number>
  const finish = r.race_points as Record<string, number>
  const sprint = r.sprint_points as Record<string, number>

  const bonus: [string, number][] = [
    ['Qualifying — beat teammate', r.quali_beat_teammate as number],
    ['Race — beat teammate', r.race_beat_teammate as number],
    ['Fastest lap', r.fastest_lap as number],
    ['Position gained (each, max +' + (r.position_gained_max as number) + ')', r.position_gained as number],
    ['Position lost (each, max ' + (r.position_lost_max as number) + ')', r.position_lost as number],
    ['Classified finish', r.classified as number],
    ['DNF', r.dnf as number], ['DNS', r.dns as number], ['DSQ', r.dsq as number],
  ]
  const constructorRules: [string, number | string][] = [
    ['Drivers combined (race finish)', `${Math.round((r.constructor_race_fraction as number) * 100)}%`],
    ['Both cars reach Q3', r.constructor_both_q3 as number],
    ['Front-row lockout', r.constructor_front_row_lockout as number],
    ['1-2 finish (top tier)', r.constructor_tier_1_2 as number],
    ['Double podium', r.constructor_tier_double_podium as number],
    ['Both top 5', r.constructor_tier_both_top5 as number],
    ['Both in the points', r.constructor_tier_both_points as number],
    ['Both classified', r.constructor_both_classified as number],
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
          <PointsTable title="Qualifying points" table={quali} color="var(--info)" />
          <PointsTable title="Race finish points" table={finish} color="var(--gain)" />
          <PointsTable title="Sprint points" table={sprint} color="var(--caution)" />
          <div className="panel panel-pad">
            <span className="section-title" style={{ fontSize: 16 }}>Constructor scoring</span>
            <div className="col gap-1" style={{ marginTop: 12 }}>
              {constructorRules.map(([k, v]) => (
                <div key={k} className="row between" style={{ padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                  <span style={{ fontSize: 13 }}>{k}</span>
                  <span className="num" style={{ fontWeight: 700 }}>{typeof v === 'number' ? `+${v}` : v}</span>
                </div>
              ))}
              <span className="text-faint" style={{ fontSize: 11, marginTop: 4 }}>Race team result uses the highest applicable tier only — bonuses never stack.</span>
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

function PointsTable({ title, table, color }: { title: string; table: Record<string, number>; color: string }) {
  return (
    <div className="panel panel-pad">
      <span className="section-title" style={{ fontSize: 16 }}>{title}</span>
      <div className="grid g2" style={{ marginTop: 12, gap: 6 }}>
        {Object.entries(table || {}).map(([pos, pts]) => (
          <div key={pos} className="row between" style={{ padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
            <span className={`pos pos-${pos}`}>P{pos}</span><span className="num" style={{ fontWeight: 700, color }}>+{pts}</span>
          </div>
        ))}
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
