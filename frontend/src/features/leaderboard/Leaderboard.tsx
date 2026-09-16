import { useEffect, useState } from 'react'
import { Delta, Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { flagEmoji } from '../../lib/format'
import type { LeaderboardRow } from '../../lib/types'

const TABS = ['Overall', 'Race', 'Country', 'Friends']
const PAGE = 25

export default function Leaderboard() {
  const { username } = useSession()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [me, setMe] = useState<LeaderboardRow | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [tab, setTab] = useState('Overall')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.leaderboard({ offset, limit: PAGE, username: username || undefined })
      .then((r) => { setRows(r.entries); setMe(r.me); setTotal(r.total) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [offset, username])

  const sortKey = tab === 'Race' ? 'last_race' : 'total'
  const display = tab === 'Race' ? [...rows].sort((a, b) => b.last_race - a.last_race) : rows

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><span className="eyebrow">The global grid · {total.toLocaleString()} managers</span><h1 className="page-title">Leaderboard</h1></div>
        <div className="seg" style={{ marginBottom: 16 }}>
          {TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {(tab === 'Country' || tab === 'Friends') ? (
          <div className="panel empty">
            <p className="text-dim">{tab === 'Friends' ? 'Follow managers to build your friends board.' : 'Country boards unlock once more managers register their region.'}</p>
          </div>
        ) : (
          <>
            <div className="panel" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="tower">
                  <thead><tr><th>Rank</th><th>Team</th><th className="hide-mobile">Manager</th><th className="r hide-mobile">Last race</th><th className="r">{sortKey === 'last_race' ? 'Race pts' : 'Total'}</th><th className="r" style={{ width: 50 }}>±</th></tr></thead>
                  <tbody>
                    {loading && Array.from({ length: 10 }).map((_, i) => <tr key={i}><td colSpan={6}><Skeleton h={26} /></td></tr>)}
                    {!loading && display.map((row) => (
                      <tr key={row.rank + row.manager}>
                        <td><span className={`pos pos-${row.rank}`}>{String(row.rank).padStart(2, '0')}</span></td>
                        <td><span style={{ fontWeight: 600 }}>{flagEmoji(row.country)} {row.team_name}</span></td>
                        <td className="hide-mobile text-dim">{row.manager}</td>
                        <td className="r hide-mobile num text-dim">{row.last_race}</td>
                        <td className="r num" style={{ fontWeight: 800, fontSize: 16 }}>{(sortKey === 'last_race' ? row.last_race : row.total).toLocaleString()}</td>
                        <td className="r"><Delta value={row.movement} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sticky own-rank row */}
            {me && (
              <div className="panel panel-glow row between" style={{ position: 'sticky', bottom: 90, marginTop: 12, padding: '12px 16px', borderColor: 'var(--red)' }}>
                <span className="row gap-2"><span className="pos">{me.rank.toLocaleString()}</span><span style={{ fontWeight: 700 }}>{me.team_name}</span><span className="tag-pts" style={{ background: 'var(--red-glow)', color: '#fff' }}>YOU</span></span>
                <span className="num" style={{ fontWeight: 800, fontSize: 16 }}>{me.total.toLocaleString()}</span>
              </div>
            )}

            <div className="row between" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>← Previous</button>
              <span className="eyebrow">{offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}</span>
              <button className="btn btn-ghost" disabled={offset + PAGE >= total} onClick={() => setOffset((o) => o + PAGE)}>Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
