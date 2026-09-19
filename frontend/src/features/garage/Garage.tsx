import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Star, Zap } from 'lucide-react'
import { GLShowroom, ModelViewer, CameraRig, LightingRig, EnvironmentRig } from '../../components/gl3d'
import type { InteractionState } from '../../components/gl3d'
import { Avatar, Skeleton } from '../../components/bits'
import { getAsset } from '../../lib/gl3d/manifest'
import { api } from '../../lib/api'
import { money } from '../../lib/format'
import type { Constructor, Driver, MeResponse, WeekendScore } from '../../lib/types'

const asset = getAsset('gridlock-car-dev')!
const DIFFERENTIAL_THRESHOLD = 20
const UNDERDOG_ACCENT = '#f5c518'

type Selection = { type: 'driver'; item: Driver } | { type: 'constructor'; item: Constructor }

function TrendArrow({ net }: { net: number }) {
  if (net > 0) return <TrendingUp size={12} color="var(--gain)" />
  if (net < 0) return <TrendingDown size={12} color="var(--loss)" />
  return <Minus size={12} className="text-faint" />
}

export default function Garage() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [constructors, setConstructors] = useState<Constructor[]>([])
  const [weekend, setWeekend] = useState<WeekendScore | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const interaction = useRef<InteractionState>({ rotationY: 0, zoom: 1, parallaxX: 0, parallaxY: 0 })

  useEffect(() => {
    api.me().then(setMe).catch(() => {})
    api.drivers().then((r) => setDrivers(r.drivers)).catch(() => {})
    api.constructors().then((r) => setConstructors(r.constructors)).catch(() => {})
    api.teamScore().then(setWeekend).catch(() => {})
  }, [])

  const myDrivers = useMemo(
    () => (me?.team ? drivers.filter((d) => me.team!.driver_ids.includes(d.id)) : []),
    [drivers, me],
  )
  const myConstructors = useMemo(
    () => (me?.team ? constructors.filter((c) => me.team!.constructor_ids.includes(c.id)) : []),
    [constructors, me],
  )

  useEffect(() => {
    if (!selection && myDrivers.length) setSelection({ type: 'driver', item: myDrivers[0] })
  }, [myDrivers, selection])

  if (!me || !drivers.length) return <div className="page container"><Skeleton h={520} /></div>

  if (!me.team || !myDrivers.length) {
    return (
      <div className="page container">
        <div className="panel empty">
          <h3 className="section-title" style={{ marginBottom: 6 }}>No squad yet</h3>
          <p className="text-dim">Build your team first — the garage shows the ten drivers and two constructors you've actually picked.</p>
          <Link to="/team" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Build my team</Link>
        </div>
      </div>
    )
  }

  const isCaptain = selection?.type === 'driver' && selection.item.id === me.team.captain_id
  const isUnderdog = selection?.type === 'driver' && me.team.active_boost === 'underdog' && selection.item.id === me.team.boost_driver_id
  const stageColor = selection ? (selection.type === 'driver' ? selection.item.constructor.color : selection.item.color) : '#ff2130'
  const accent = isUnderdog ? UNDERDOG_ACCENT : stageColor
  const preset = isCaptain ? 'SPOTLIGHT' : isUnderdog ? 'SIDE' : 'HERO'
  const lightIntensity = isCaptain ? 1.5 : isUnderdog ? 1.15 : 1

  const asset_ref = selection ? `${selection.type}:${selection.item.id}` : ''
  const roundAsset = weekend?.assets.find((a) => a.ref === asset_ref)

  return (
    <div className="page">
      <div className="container">
        <div className="row between" style={{ marginBottom: 16 }}>
          <Link to="/team" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Team</Link>
          <span className="eyebrow">GRIDLOCK Garage</span>
        </div>

        <div className="garage-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr 300px', gap: 16 }}>
          {/* Left: squad list */}
          <div className="panel" style={{ overflow: 'hidden', maxHeight: 620, overflowY: 'auto' }}>
            <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
              <span className="eyebrow">Drivers</span>
            </div>
            {myDrivers.map((d) => {
              const active = selection?.type === 'driver' && selection.item.id === d.id
              const captain = d.id === me.team!.captain_id
              const underdog = me.team!.active_boost === 'underdog' && d.id === me.team!.boost_driver_id
              return (
                <button key={d.id} onClick={() => setSelection({ type: 'driver', item: d })}
                  className="row gap-2" style={{
                    width: '100%', padding: '9px 14px', background: active ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--line-soft)', textAlign: 'left', cursor: 'pointer', alignItems: 'center',
                  }}>
                  <Avatar name={d.name} number={d.number} color={d.constructor.color} size={28} image={d.image_url} />
                  <div className="col grow">
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{d.short}</span>
                    <span className="eyebrow">{d.constructor.short}</span>
                  </div>
                  {captain && <Star size={13} color="var(--caution)" fill="var(--caution)" />}
                  {underdog && <Zap size={13} color={UNDERDOG_ACCENT} fill={UNDERDOG_ACCENT} />}
                </button>
              )
            })}
            <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', borderTop: '1px solid var(--line)' }}>
              <span className="eyebrow">Constructors</span>
            </div>
            {myConstructors.map((c) => {
              const active = selection?.type === 'constructor' && selection.item.id === c.id
              return (
                <button key={c.id} onClick={() => setSelection({ type: 'constructor', item: c })}
                  className="row gap-2" style={{
                    width: '100%', padding: '9px 14px', background: active ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--line-soft)', textAlign: 'left', cursor: 'pointer', alignItems: 'center',
                  }}>
                  <span className="team-dot" style={{ background: c.color, height: 22 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                </button>
              )
            })}
          </div>

          {/* Center: 3D stage */}
          <div className="panel" style={{ overflow: 'hidden', height: 620, position: 'relative' }}>
            <GLShowroom fallbackImage={asset.fallbackImage} fallbackLabel="Your garage">
              <CameraRig preset={preset} interaction={interaction} />
              <LightingRig intensity={lightIntensity} accent={accent} />
              <EnvironmentRig />
              {selection && (
                <ModelViewer
                  asset={asset}
                  interactionState={interaction}
                  bodyColor={stageColor}
                  transitionKey={`${selection.type}:${selection.item.id}`}
                  breathe={isCaptain}
                />
              )}
            </GLShowroom>
            <div className="row gap-2" style={{ position: 'absolute', bottom: 16, left: 16 }}>
              {isCaptain && <span className="tag-pts tag-fl">CAPTAIN · 2×</span>}
              {isUnderdog && <span className="tag-pts" style={{ background: 'color-mix(in srgb, var(--caution) 22%, transparent)', color: UNDERDOG_ACCENT }}>UNDERDOG · 2×</span>}
            </div>
          </div>

          {/* Right: fantasy intelligence */}
          <div className="panel panel-pad" style={{ height: 620, overflowY: 'auto' }}>
            {!selection ? (
              <p className="text-faint" style={{ fontSize: 13 }}>Select a driver or constructor.</p>
            ) : (
              <>
                <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 4 }}>
                  {selection.type === 'driver'
                    ? <Avatar name={selection.item.name} number={selection.item.number} color={selection.item.constructor.color} size={40} image={selection.item.image_url} />
                    : <span className="team-dot" style={{ background: selection.item.color, height: 30 }} />}
                  <div>
                    <h2 className="display" style={{ fontSize: 22, margin: 0 }}>{selection.item.name}</h2>
                    <span className="eyebrow">{selection.type === 'driver' ? selection.item.constructor.name : 'Constructor'}</span>
                  </div>
                </div>

                <div className="grid g2" style={{ marginTop: 14, gap: 8 }}>
                  <div className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="text-dim" style={{ fontSize: 12 }}>Price</span><span className="num" style={{ fontWeight: 700 }}>{money(selection.item.price)}</span>
                  </div>
                  <div className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="text-dim" style={{ fontSize: 12 }}>Points</span><span className="num" style={{ fontWeight: 700 }}>{selection.item.points}</span>
                  </div>
                  <div className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="text-dim" style={{ fontSize: 12 }}>Form</span><span className="num" style={{ fontWeight: 700 }}>{selection.item.form.toFixed(1)}</span>
                  </div>
                  <div className="row between" style={{ padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span className="text-dim" style={{ fontSize: 12 }}>This round</span>
                    <span className="num" style={{ fontWeight: 700, color: (roundAsset?.subtotal ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                      {roundAsset ? `${roundAsset.subtotal >= 0 ? '+' : ''}${roundAsset.subtotal}` : '—'}
                    </span>
                  </div>
                </div>

                <div className="col gap-1" style={{ marginTop: 14 }}>
                  <div className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <span className="text-dim" style={{ fontSize: 13 }}>Ownership</span>
                    <span className="num" style={{ fontWeight: 700 }}>{selection.item.ownership}%</span>
                  </div>
                  {selection.type === 'driver' && (
                    <div className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <span className="text-dim" style={{ fontSize: 13 }}>Effective ownership</span>
                      <span className="num" style={{ fontWeight: 700 }}>{Math.round((selection.item.ownership + selection.item.captain_pct) * 10) / 10}%</span>
                    </div>
                  )}
                  <div className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <span className="text-dim" style={{ fontSize: 13 }}>Transfer trend</span>
                    <span className="row gap-1 num" style={{ fontWeight: 700 }}>
                      <TrendArrow net={selection.item.transfer_trend.net} />
                      {selection.item.transfer_trend.net > 0 ? '+' : ''}{selection.item.transfer_trend.net}
                    </span>
                  </div>
                  <div className="row between" style={{ padding: '8px 0' }}>
                    <span className="text-dim" style={{ fontSize: 13 }}>Value</span>
                    <span className="num" style={{ fontWeight: 700 }}>{selection.item.value}/M</span>
                  </div>
                </div>

                {selection.item.ownership < DIFFERENTIAL_THRESHOLD && (
                  <div className="chip" style={{ marginTop: 12, color: 'var(--info)', borderColor: 'var(--info)' }}>
                    Differential · owned by {selection.item.ownership}%
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 1100px) { .garage-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}
