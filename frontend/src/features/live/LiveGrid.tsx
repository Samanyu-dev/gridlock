import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Grid3x3, X } from 'lucide-react'
import { GLShowroom, QualifyingGridScene, EnvironmentRig } from '../../components/gl3d'
import type { GridEntry, GridCameraTarget, GridFantasyState } from '../../components/gl3d'
import { getCircuitAssetForRace } from '../../lib/gl3d/circuitManifest'
import { api } from '../../lib/api'
import type { MeResponse, RaceFull } from '../../lib/types'

const CAMERA_TARGETS: GridCameraTarget[] = ['GRID_OVERVIEW', 'FRONT_ROW', 'TOP_DOWN', 'ROW_SWEEP']

/** The qualifying/starting-grid 3D panel for /live. Normalizes whichever
 * real classification data exists into GridEntry[] and reuses the exact
 * QualifyingGridScene/GLShowroom stack — no bespoke Three.js setup here. */
export function LiveGrid({ race, me, rivalUsername }: { race: RaceFull; me: MeResponse | null; rivalUsername?: string }) {
  const [cameraTarget, setCameraTarget] = useState<GridCameraTarget>('GRID_OVERVIEW')
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null)
  const [rivalDriverIds, setRivalDriverIds] = useState<number[] | undefined>(undefined)

  const hasFinalGrid = race.status === 'completed' && race.classification.length > 0
  const [mode, setMode] = useState<'QUALIFYING_ORDER' | 'STARTING_GRID'>('QUALIFYING_ORDER')

  useEffect(() => {
    if (!rivalUsername) { setRivalDriverIds(undefined); return }
    api.h2h(rivalUsername).then((r) => setRivalDriverIds(r.b.drivers.map((d) => d.id))).catch(() => setRivalDriverIds(undefined))
  }, [rivalUsername])

  const entries: GridEntry[] = useMemo(() => {
    if (mode === 'STARTING_GRID' && hasFinalGrid) {
      return [...race.classification]
        .sort((a, b) => a.grid - b.grid)
        .map((c) => ({ driverId: c.driver_id, position: c.grid, short: c.short, name: c.name, constructor: c.constructor, color: c.color, status: c.status }))
    }
    return race.quali.map((q) => ({ driverId: q.driver_id, position: q.position, short: q.short, name: q.name, constructor: q.constructor, color: q.color }))
  }, [mode, hasFinalGrid, race])

  const circuitAsset = getCircuitAssetForRace(race.circuit)

  const fantasy: GridFantasyState | undefined = me?.team ? {
    myDriverIds: me.team.driver_ids,
    captainId: me.team.captain_id,
    underdogId: me.team.active_boost === 'underdog' ? me.team.boost_driver_id : null,
    rivalDriverIds,
  } : undefined

  const selected = entries.find((e) => e.driverId === selectedDriverId)
  const mine = new Set(fantasy?.myDriverIds ?? [])

  if (entries.length === 0) {
    return <div className="panel panel-pad"><p className="text-faint" style={{ fontSize: 13 }}>No qualifying data yet for this round.</p></div>
  }

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <span className="row gap-2" style={{ alignItems: 'center' }}>
          <Grid3x3 size={14} className="text-faint" />
          <span className="eyebrow">{mode === 'STARTING_GRID' ? 'STARTING GRID' : 'QUALIFYING ORDER'}</span>
        </span>
        <div className="row gap-1 wrap">
          {hasFinalGrid && (
            <div className="seg" style={{ fontSize: 11 }}>
              <button className={mode === 'QUALIFYING_ORDER' ? 'active' : ''} onClick={() => setMode('QUALIFYING_ORDER')}>Quali</button>
              <button className={mode === 'STARTING_GRID' ? 'active' : ''} onClick={() => setMode('STARTING_GRID')}>Grid</button>
            </div>
          )}
          <div className="seg" style={{ fontSize: 11 }}>
            {CAMERA_TARGETS.map((t) => (
              <button key={t} className={cameraTarget === t ? 'active' : ''} onClick={() => setCameraTarget(t)}>{t.replace('_', ' ')}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 360, position: 'relative' }}>
        <GLShowroom fallbackImage={circuitAsset ? `/circuits/${circuitAsset.slug}.svg` : '/models/cars/gridlock-master-car/fallback.svg'} fallbackLabel="Starting grid">
          <EnvironmentRig />
          <QualifyingGridScene
            entries={entries}
            circuitAsset={circuitAsset}
            fantasy={fantasy}
            cameraTarget={selectedDriverId ? 'SELECTED_DRIVER' : cameraTarget}
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriverId}
          />
        </GLShowroom>

        {selected && (
          <div className="panel panel-pad" style={{ position: 'absolute', bottom: 12, left: 12, right: 12, maxWidth: 360 }}>
            <div className="row between" style={{ marginBottom: 4 }}>
              <span className="row gap-2" style={{ alignItems: 'center' }}>
                <span className="team-dot" style={{ background: selected.color }} />
                <strong>P{selected.position} {selected.name}</strong>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDriverId(null)}><X size={13} /></button>
            </div>
            <span className="text-dim" style={{ fontSize: 12 }}>{selected.constructor}</span>
            <div className="row gap-2 wrap" style={{ marginTop: 8 }}>
              {selected.driverId === fantasy?.captainId && <span className="tag-pts tag-fl">YOUR CAPTAIN · 2×</span>}
              {selected.driverId === fantasy?.underdogId && <span className="tag-pts" style={{ background: 'color-mix(in srgb, var(--caution) 22%, transparent)', color: '#f5c518' }}>YOUR UNDERDOG · 2×</span>}
              {mine.has(selected.driverId) && selected.driverId !== fantasy?.captainId && selected.driverId !== fantasy?.underdogId && <span className="tag-pts" style={{ color: 'var(--info)', borderColor: 'var(--info)' }}>IN YOUR SQUAD</span>}
              {rivalDriverIds?.includes(selected.driverId) && <span className="tag-pts" style={{ color: 'var(--loss)', borderColor: 'var(--loss)' }}>RIVAL'S PICK</span>}
              {!mine.has(selected.driverId) && !rivalDriverIds?.includes(selected.driverId) && <span className="text-faint" style={{ fontSize: 12 }}>Not in your squad</span>}
            </div>
            <Link to={`/drivers/${selected.short.toLowerCase()}`} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Driver page →</Link>
          </div>
        )}
      </div>
      <div className="text-faint" style={{ padding: '8px 14px', fontSize: 11 }}>
        {mode === 'STARTING_GRID'
          ? 'Actual grid positions used for the race, including any penalties applied.'
          : 'Session classification order — not confirmed as the final grid until the race weekend\'s official penalties (if any) are applied.'}
        {' '}Drag to orbit · click a car to select.
      </div>
    </div>
  )
}
