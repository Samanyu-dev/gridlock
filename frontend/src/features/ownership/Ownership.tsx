import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import type { LeagueSummary, OwnershipReport, OwnershipRow } from '../../lib/types'

function Bar({ row, tag }: { row: OwnershipRow; tag?: string }) {
  return (
    <div className="row gap-3" style={{ alignItems: 'center', padding: '8px 0' }}>
      <span className="team-dot" style={{ background: row.color, flexShrink: 0 }} />
      <span style={{ width: 130, fontSize: 13, fontWeight: 600 }}>{row.short || row.name}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, row.owned_pct)}%`, height: '100%', background: row.color || 'var(--red)', borderRadius: 4 }} />
      </div>
      <span className="num" style={{ width: 48, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{row.owned_pct}%</span>
      {tag && row.captain_pct !== undefined && row.captain_pct > 0 && (
        <span className="tag-pts tag-fl" style={{ width: 74, textAlign: 'center' }}>C {row.captain_pct}%</span>
      )}
    </div>
  )
}

export default function Ownership() {
  const [report, setReport] = useState<OwnershipReport | null>(null)
  const [leagues, setLeagues] = useState<LeagueSummary[]>([])
  const [scope, setScope] = useState<string>('')

  useEffect(() => { api.leagues().then((r) => setLeagues(r.mine)).catch(() => {}) }, [])
  useEffect(() => {
    setReport(null)
    api.ownership(scope || undefined).then(setReport).catch(() => setReport(null))
  }, [scope])

  return (
    <div className="page">
      <div className="container">
        <div className="page-head row between wrap gap-2">
          <div><span className="eyebrow">Fantasy intelligence</span><h1 className="page-title">Ownership</h1></div>
          {leagues.length > 0 && (
            <select className="input" style={{ width: 'auto' }} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">Global</option>
              {leagues.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          )}
        </div>

        {!report && <Skeleton h={400} />}

        {report && report.round === null && (
          <div className="panel empty">
            <Users className="glyph" />
            <h3 className="section-title" style={{ marginBottom: 6 }}>No locked round yet</h3>
            <p className="text-dim">Ownership reveals once the first round's deadline has passed — showing it earlier would leak everyone's still-changeable picks.</p>
          </div>
        )}

        {report && report.round !== null && (
          <>
            <p className="text-dim" style={{ fontSize: 13, marginBottom: 16 }}>
              As locked for round {report.round} · {report.total_teams} {report.total_teams === 1 ? 'team' : 'teams'}
              {report.league ? ` in ${report.league}` : ' league-wide'}
            </p>
            <div className="grid g2" style={{ alignItems: 'start' }}>
              <div className="panel panel-pad">
                <span className="section-title" style={{ fontSize: 16, display: 'block', marginBottom: 10 }}>Drivers</span>
                {report.drivers.length === 0 && <p className="text-faint" style={{ fontSize: 13 }}>No picks yet.</p>}
                {report.drivers.map((d) => <Bar key={d.id} row={d} tag="captain" />)}
              </div>
              <div className="panel panel-pad">
                <span className="section-title" style={{ fontSize: 16, display: 'block', marginBottom: 10 }}>Constructors</span>
                {report.constructors.length === 0 && <p className="text-faint" style={{ fontSize: 13 }}>No picks yet.</p>}
                {report.constructors.map((c) => <Bar key={c.id} row={c} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
