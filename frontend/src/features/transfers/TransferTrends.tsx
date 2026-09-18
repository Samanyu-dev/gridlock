import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, ArrowLeftRight } from 'lucide-react'
import { Skeleton } from '../../components/bits'
import { api } from '../../lib/api'
import type { LeagueSummary, TransferTrendsReport, TransferTrendRow } from '../../lib/types'

function Row({ row }: { row: TransferTrendRow }) {
  return (
    <div className="row between" style={{ padding: '8px 0' }}>
      <span className="row gap-2"><span className="team-dot" style={{ background: row.color }} />{row.short || row.name}</span>
      <span className="row gap-3">
        <span className="text-faint" style={{ fontSize: 12 }}>{row.in} in · {row.out} out</span>
        <span className="text-faint" style={{ fontSize: 12 }}>{row.ownership_delta >= 0 ? '+' : ''}{row.ownership_delta}% own</span>
        <span className="row gap-1 num" style={{ fontWeight: 700, color: row.net > 0 ? 'var(--gain)' : row.net < 0 ? 'var(--loss)' : undefined, width: 46, justifyContent: 'flex-end' }}>
          {row.net > 0 && <TrendingUp size={14} />}
          {row.net < 0 && <TrendingDown size={14} />}
          {row.net === 0 && <Minus size={14} className="text-faint" />}
          {row.net > 0 ? '+' : ''}{row.net}
        </span>
      </span>
    </div>
  )
}

export default function TransferTrends() {
  const [report, setReport] = useState<TransferTrendsReport | null>(null)
  const [leagues, setLeagues] = useState<LeagueSummary[]>([])
  const [scope, setScope] = useState('')

  useEffect(() => { api.leagues().then((r) => setLeagues(r.mine)).catch(() => {}) }, [])
  useEffect(() => {
    setReport(null)
    api.transferTrends(scope || undefined).then(setReport).catch(() => setReport(null))
  }, [scope])

  return (
    <div className="page">
      <div className="container">
        <div className="page-head row between wrap gap-2">
          <div><span className="eyebrow">Fantasy intelligence</span><h1 className="page-title">Transfer trends</h1></div>
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
            <ArrowLeftRight className="glyph" />
            <h3 className="section-title" style={{ marginBottom: 6 }}>No locked round yet</h3>
            <p className="text-dim">Transfer trends reveal once the first round's deadline has passed.</p>
          </div>
        )}

        {report && report.round !== null && (
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>Drivers</span>
              {report.drivers.length === 0 && <p className="text-faint" style={{ fontSize: 13 }}>No transfers yet.</p>}
              {report.drivers.map((d) => <Row key={d.id} row={d} />)}
            </div>
            <div className="panel panel-pad">
              <span className="section-title" style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>Constructors</span>
              {report.constructors.length === 0 && <p className="text-faint" style={{ fontSize: 13 }}>No transfers yet.</p>}
              {report.constructors.map((c) => <Row key={c.id} row={c} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
