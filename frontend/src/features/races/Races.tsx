import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Countdown } from '../../components/motion'
import { Skeleton, SprintBadge } from '../../components/bits'
import { api } from '../../lib/api'
import { flagEmoji, localDateFull, ROUND_STATE_COLOR } from '../../lib/format'
import { useSession } from '../../lib/session'
import type { MeResponse, Race } from '../../lib/types'

const RANKED_STATES = new Set(['PROVISIONAL', 'FINAL'])

export default function Races() {
  const { authed } = useSession()
  const [races, setRaces] = useState<Race[] | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [ranks, setRanks] = useState<Record<number, number>>({})

  useEffect(() => { api.races().then((r) => setRaces(r.races)).catch(() => {}) }, [])
  useEffect(() => { if (authed) api.me().then(setMe).catch(() => {}) }, [authed])
  useEffect(() => {
    if (!authed || !races) return
    const rankable = races.filter((r) => RANKED_STATES.has(r.round_state))
    Promise.all(rankable.map((r) =>
      api.leaderboardRound(r.round, { limit: 1 }).then((res) => [r.round, res.me?.rank] as const).catch(() => [r.round, undefined] as const),
    )).then((pairs) => {
      const next: Record<number, number> = {}
      for (const [round, rank] of pairs) if (rank) next[round] = rank
      setRanks(next)
    })
  }, [authed, races])

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><span className="eyebrow">Full timeline</span><h1 className="page-title">Season calendar</h1></div>
        <div className="col gap-2">
          {!races && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={72} />)}
          {races?.map((r) => {
            const color = ROUND_STATE_COLOR[r.round_state]
            const myPts = me?.score?.per_round?.[r.round]
            const myRank = ranks[r.round]
            return (
              <Link key={r.round} to={`/races/${r.slug}`} className="panel row between wrap gap-2 race-edge"
                style={{ ['--accent' as string]: color, padding: '16px 20px', opacity: r.round_state === 'UPCOMING' ? 0.7 : 1 }}>
                <div className="row gap-3">
                  <span className="display" style={{ fontSize: 26, color: 'var(--text-faint)', minWidth: 44 }}>{String(r.round).padStart(2, '0')}</span>
                  <div>
                    <div className="row gap-2" style={{ alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 17 }}>{flagEmoji(r.country)} {r.name}</span>
                      {r.is_sprint && <SprintBadge />}
                      <span className="chip" style={{ padding: '1px 7px', fontSize: 11, color, borderColor: color }}>{r.round_state}</span>
                    </div>
                    <span className="eyebrow">{r.circuit} · {localDateFull(r.race_start)}</span>
                  </div>
                </div>
                <div className="col" style={{ alignItems: 'flex-end' }}>
                  {r.round_state === 'FINAL' || r.round_state === 'PROVISIONAL' ? (
                    <>
                      <span className="eyebrow">Winner</span><span style={{ fontWeight: 700 }}>{r.winner?.short ?? '—'}</span>
                      {authed && myPts !== undefined && (
                        <span className="text-faint" style={{ fontSize: 12, marginTop: 2 }}>
                          You: {myPts} pts{myRank ? ` · #${myRank}` : ''}
                        </span>
                      )}
                    </>
                  ) : r.round_state === 'OPEN' ? (
                    <><span className="eyebrow">Team locks in</span><Countdown iso={r.deadline} compact /></>
                  ) : r.round_state === 'LOCKED' || r.round_state === 'LIVE' ? (
                    <><span className="eyebrow">Race starts in</span><Countdown iso={r.race_start} compact /></>
                  ) : (
                    <><span className="eyebrow">Scheduled</span><span className="num text-dim">{localDateFull(r.race_start)}</span></>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
