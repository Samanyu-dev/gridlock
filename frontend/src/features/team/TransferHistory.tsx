import { useEffect, useState } from 'react'
import { ArrowRight, Repeat } from 'lucide-react'
import { Skeleton } from '../../components/bits'
import { money } from '../../lib/format'
import { api, type TransferRow } from '../../lib/api'

export default function TransferHistory() {
  const [rows, setRows] = useState<TransferRow[] | null>(null)

  useEffect(() => { api.transferHistory().then((r) => setRows(r.transfers)).catch(() => setRows([])) }, [])

  return (
    <div className="page">
      <div className="container">
        <div className="page-head"><span className="eyebrow">Your season</span><h1 className="page-title">Transfer history</h1></div>

        {!rows && <Skeleton h={300} />}

        {rows && rows.length === 0 && (
          <div className="panel empty">
            <Repeat className="glyph" />
            <h3 className="section-title" style={{ marginBottom: 6 }}>No transfers yet</h3>
            <p className="text-dim">Every change you make to your team — in or out, round by round — shows up here.</p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="col gap-2">
            {rows.map((t, i) => (
              <div key={i} className="panel panel-pad row between wrap gap-2">
                <div className="row gap-2">
                  <span className="eyebrow" style={{ minWidth: 56 }}>Round {t.round}</span>
                  <span className="row gap-2" style={{ fontWeight: 600 }}>
                    {t.sold ?? '—'} <ArrowRight size={14} className="text-faint" /> {t.bought ?? '—'}
                  </span>
                </div>
                <div className="row gap-3">
                  <span className="text-faint num" style={{ fontSize: 13 }}>{money(t.sale_price)} → {money(t.purchase_price)}</span>
                  {t.free
                    ? <span className="tag-pts tag-gain">FREE</span>
                    : <span className="tag-pts tag-loss">−{t.penalty} pts</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
