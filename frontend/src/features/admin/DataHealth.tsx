import { useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '../../components/bits'
import { api, type DataHealth as DataHealthType } from '../../lib/api'
import { useSession } from '../../lib/session'

const STATE_COLOR: Record<string, string> = {
  UPCOMING: 'var(--text-faint)', OPEN: 'var(--info)', LOCKED: 'var(--caution)',
  LIVE: 'var(--red)', PROVISIONAL: 'var(--caution)', FINAL: 'var(--gain)',
}

export default function DataHealth() {
  const { profile } = useSession()
  const [health, setHealth] = useState<DataHealthType | null>(null)
  const [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { api.dataHealth().then(setHealth).catch((e) => setErr(e.message)) }, [])

  const resync = async () => {
    setSyncing(true)
    try { setHealth(await api.resync()) } catch (e) { setErr((e as Error).message) }
    finally { setSyncing(false) }
  }

  if (!profile?.is_admin) {
    return (
      <div className="page container">
        <div className="panel empty">
          <AlertTriangle className="glyph" />
          <h3 className="section-title" style={{ marginBottom: 6 }}>Admin only</h3>
          <p className="text-dim">This control room is restricted to admin accounts.</p>
        </div>
      </div>
    )
  }

  if (err) return <div className="page container"><div className="panel panel-pad" style={{ color: 'var(--loss)' }}>{err}</div></div>
  if (!health) return <div className="page container"><Skeleton h={300} /></div>

  return (
    <div className="page">
      <div className="container">
        <div className="page-head row between wrap gap-2">
          <div><span className="eyebrow">Admin</span><h1 className="page-title">Data feed health</h1></div>
          <button className="btn btn-primary" onClick={resync} disabled={syncing}>
            <RefreshCw size={15} style={{ animation: syncing ? 'spin 1s linear infinite' : undefined }} /> {syncing ? 'Resyncing…' : 'Resync now'}
          </button>
        </div>

        <div className="grid g4" style={{ marginBottom: 20 }}>
          <div className="panel stat"><div className="k">Provider</div><div className="v" style={{ fontSize: 20 }}>{health.provider}</div></div>
          <div className="panel stat"><div className="k">Last sync</div><div className="v" style={{ fontSize: 16 }}>{health.last_synced_at ? new Date(health.last_synced_at).toLocaleTimeString() : 'never'}</div></div>
          <div className="panel stat"><div className="k">Sync duration</div><div className="v" style={{ fontSize: 20 }}>{health.last_sync_duration_seconds ?? '—'}s</div></div>
          <div className="panel stat"><div className="k">Sync source</div><div className="v" style={{ fontSize: 20, color: health.last_sync_source === 'openf1' ? 'var(--gain)' : 'var(--caution)' }}>{health.last_sync_source}</div></div>
        </div>

        <div className="panel panel-pad" style={{ marginBottom: 20 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="section-title" style={{ fontSize: 16 }}>Ingestion status</span>
            {health.last_error
              ? <span className="row gap-2" style={{ color: 'var(--loss)' }}><AlertTriangle size={16} /> Error</span>
              : <span className="row gap-2" style={{ color: 'var(--gain)' }}><CheckCircle2 size={16} /> Healthy</span>}
          </div>
          {health.last_error && <p className="text-dim" style={{ fontSize: 13, marginBottom: 10 }}>{health.last_error}</p>}
          <div className="row gap-4 wrap">
            <span className="text-dim" style={{ fontSize: 13 }}>Synced {health.sync_count}× this instance</span>
            <span className="text-dim" style={{ fontSize: 13 }}>Cache TTL {health.cache_ttl_seconds}s</span>
            <span className="text-dim" style={{ fontSize: 13 }}>Rounds elapsed {health.rounds_elapsed}/{health.rounds_total}</span>
            <span className="text-dim" style={{ fontSize: 13, color: health.data_gaps > 0 ? 'var(--caution)' : undefined }}>
              {health.data_gaps > 0 ? `${health.data_gaps} round(s) missing confirmed results` : 'No data gaps'}
            </span>
          </div>
        </div>

        <div className="panel" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tower">
              <thead><tr><th>Round</th><th>GP</th><th>State</th><th className="r">Winner confirmed</th></tr></thead>
              <tbody>
                {health.rounds.map((r) => (
                  <tr key={r.round}>
                    <td className="num">{r.round}</td>
                    <td>{r.name}</td>
                    <td><span className="chip" style={{ color: STATE_COLOR[r.round_state], borderColor: STATE_COLOR[r.round_state] }}>{r.round_state}</span></td>
                    <td className="r">{r.status === 'completed' ? (r.has_winner ? <span style={{ color: 'var(--gain)' }}>Yes</span> : <span style={{ color: 'var(--caution)' }}>Missing</span>) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
