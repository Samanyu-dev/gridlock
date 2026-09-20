import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { GLShowroom, PodiumScene, type PodiumEntry } from '../../components/gl3d'
import { ShareButton } from '../../components/ShareButton'
import type { ClassificationRow, LeaderboardRow } from '../../lib/types'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

const RANK_COLOR = { 1: '#f5c518', 2: '#c7ccd4', 3: '#c98a4b' } as const

function toFantasyPodium(rows: LeaderboardRow[]): PodiumEntry[] {
  return rows.slice(0, 3).map((r, i) => ({
    rank: (i + 1) as 1 | 2 | 3, label: r.team_name, sublabel: r.manager, value: `+${r.last_race}`, color: RANK_COLOR[(i + 1) as 1 | 2 | 3],
  }))
}

function toRacePodium(rows: ClassificationRow[]): PodiumEntry[] {
  return [...rows].filter((r) => r.finish != null).sort((a, b) => (a.finish ?? 99) - (b.finish ?? 99)).slice(0, 3)
    .map((r, i) => ({ rank: (i + 1) as 1 | 2 | 3, label: r.name, sublabel: r.constructor, value: r.short, color: r.color }))
}

/** Round-complete podium — GRIDLOCK RESULT (top 3 fantasy scorers this
 * round, from the same leaderboard data /live already fetches) or F1 RESULT
 * (real race classification), through one PodiumScene abstraction. Only
 * shown once the round is FINAL, matching the honest-data rule elsewhere. */
export function LivePodium({ roundName, fantasyTop3, raceTop3 }: { roundName: string; fantasyTop3: LeaderboardRow[]; raceTop3: ClassificationRow[] }) {
  const [mode, setMode] = useState<'GRIDLOCK' | 'F1'>('GRIDLOCK')
  const reduceMotion = usePrefersReducedMotion()

  const canF1 = raceTop3.some((r) => r.finish != null)
  const entries = mode === 'F1' && canF1 ? toRacePodium(raceTop3) : toFantasyPodium(fantasyTop3)
  if (entries.length === 0) return null
  const winner = entries.find((e) => e.rank === 1)

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <span className="row gap-2" style={{ alignItems: 'center' }}>
          <Trophy size={14} className="text-faint" />
          <span className="eyebrow">{roundName} · Podium</span>
        </span>
        {canF1 && (
          <div className="seg" style={{ fontSize: 11 }}>
            <button className={mode === 'GRIDLOCK' ? 'active' : ''} onClick={() => setMode('GRIDLOCK')}>Gridlock</button>
            <button className={mode === 'F1' ? 'active' : ''} onClick={() => setMode('F1')}>F1 Result</button>
          </div>
        )}
      </div>

      <div style={{ height: 260 }}>
        <GLShowroom fallbackImage="/models/cars/gridlock-master-car/fallback.svg" fallbackLabel="Podium">
          <PodiumScene entries={entries} reduceMotion={reduceMotion} />
        </GLShowroom>
      </div>

      <div className="row" style={{ padding: '10px 14px', gap: 8, borderTop: '1px solid var(--line)' }}>
        {[2, 1, 3].map((rank) => {
          const e = entries.find((x) => x.rank === rank)
          if (!e) return <div key={rank} style={{ flex: 1 }} />
          return (
            <div key={rank} className="col" style={{ flex: 1, alignItems: 'center', textAlign: 'center', opacity: rank === 1 ? 1 : 0.85 }}>
              <span className="eyebrow" style={{ color: RANK_COLOR[rank as 1 | 2 | 3] }}>P{rank}</span>
              <span style={{ fontWeight: 700, fontSize: rank === 1 ? 14 : 13 }}>{e.label}</span>
              <span className="text-faint" style={{ fontSize: 11 }}>{e.sublabel}</span>
              <span className="num" style={{ fontWeight: 800 }}>{e.value}</span>
            </div>
          )
        })}
      </div>

      {winner && (
        <div className="row" style={{ padding: '0 14px 12px', justifyContent: 'flex-end' }}>
          <ShareButton
            filename={`gridlock-podium-${roundName.replace(/\s+/g, '-').toLowerCase()}.png`}
            spec={{
              eyebrow: `${roundName} · ${mode === 'F1' ? 'Race result' : 'Gridlock result'}`,
              title: `${winner.label} takes P1`,
              bigStat: winner.value, bigStatLabel: mode === 'F1' ? 'Fastest to the flag' : 'Round points',
              rows: entries.map((e) => ({ label: `P${e.rank}`, value: e.label, color: e.color })),
            }}
          />
        </div>
      )}
    </div>
  )
}
