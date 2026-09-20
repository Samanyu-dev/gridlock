import { useEffect, useMemo, useRef, useState } from 'react'
import { Flag, Pause, Play } from 'lucide-react'
import { GLShowroom, CircuitRaceVisualizer, EnvironmentRig, type RaceVisualizerDriver } from '../../components/gl3d'
import { getCircuitAssetForRace } from '../../lib/gl3d/circuitManifest'
import { api } from '../../lib/api'
import type { MeResponse, RaceFull } from '../../lib/types'

type VizMode = 'RACE' | 'FANTASY' | 'BATTLE'
const SPEEDS = [0.5, 1, 2, 4]

/** Stylized results-reveal visualizer: real grid → real finish, swept along
 * the circuit spline. Not a lap-by-lap telemetry simulator — this data
 * model has no live timing feed, so nothing here claims to. Only rendered
 * once a round has real classification to sweep toward. */
export function LiveRaceVisualizer({ race, me, rivalUsername }: { race: RaceFull; me: MeResponse | null; rivalUsername?: string }) {
  const [mode, setMode] = useState<VizMode>('RACE')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [display, setDisplay] = useState(0)
  const [rivalDriverIds, setRivalDriverIds] = useState<number[]>([])

  const progressRef = useRef(0)
  const playingRef = useRef(playing)
  const speedRef = useRef(speed)
  playingRef.current = playing
  speedRef.current = speed

  useEffect(() => {
    if (mode !== 'BATTLE' || !rivalUsername) { setRivalDriverIds([]); return }
    api.h2h(rivalUsername).then((r) => setRivalDriverIds(r.b.drivers.map((d) => d.id))).catch(() => setRivalDriverIds([]))
  }, [mode, rivalUsername])

  const circuitAsset = getCircuitAssetForRace(race.circuit)

  const mine = new Set(me?.team?.driver_ids ?? [])
  const rivalSet = new Set(rivalDriverIds)

  const drivers: RaceVisualizerDriver[] = useMemo(() => {
    return race.classification
      .filter((c) => c.status !== 'dns')
      .map((c) => {
        const retired = c.status === 'dnf' || c.status === 'dsq'
        let emphasis = 1
        if (mode === 'FANTASY') emphasis = mine.has(c.driver_id) ? 1 : 0.35
        if (mode === 'BATTLE') emphasis = mine.has(c.driver_id) || rivalSet.has(c.driver_id) ? 1 : 0.3
        return {
          driverId: c.driver_id, gridPosition: c.grid, finishPosition: retired ? null : c.finish, retired,
          color: c.color, emphasis,
        }
      })
  }, [race.classification, mode, me, rivalDriverIds])

  useEffect(() => {
    // The visualizer itself owns the actual per-frame advance (ref-based,
    // inside the R3F render loop); this just throttles the scrubber's
    // display to a sane UI cadence instead of syncing React state at 60fps.
    const id = setInterval(() => { if (playingRef.current) setDisplay(progressRef.current) }, 100)
    return () => clearInterval(id)
  }, [])

  if (race.classification.length === 0) return null

  const scrub = (v: number) => { progressRef.current = v; setDisplay(v); setPlaying(false) }
  const restart = () => { progressRef.current = 0; setDisplay(0); setPlaying(true) }

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <span className="row gap-2" style={{ alignItems: 'center' }}>
          <Flag size={14} className="text-faint" />
          <span className="eyebrow">RESULT REPLAY</span>
        </span>
        <div className="seg" style={{ fontSize: 11 }}>
          <button className={mode === 'RACE' ? 'active' : ''} onClick={() => setMode('RACE')}>Race</button>
          <button className={mode === 'FANTASY' ? 'active' : ''} onClick={() => setMode('FANTASY')}>Fantasy</button>
          {rivalUsername && <button className={mode === 'BATTLE' ? 'active' : ''} onClick={() => setMode('BATTLE')}>Battle</button>}
        </div>
      </div>

      <div style={{ height: 320 }}>
        <GLShowroom fallbackImage={circuitAsset ? `/circuits/${circuitAsset.slug}.svg` : '/models/cars/gridlock-master-car/fallback.svg'} fallbackLabel="Race result">
          <EnvironmentRig />
          <CircuitRaceVisualizer drivers={drivers} circuitAsset={circuitAsset} progressRef={progressRef} playingRef={playingRef} speedRef={speedRef} />
        </GLShowroom>
      </div>

      <div className="row gap-2" style={{ padding: '10px 14px', alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => (display >= 1 ? restart() : setPlaying((p) => !p))}>
          {display >= 1 ? <Flag size={13} /> : playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <input type="range" min={0} max={1} step={0.001} value={display} onChange={(e) => scrub(Number(e.target.value))} style={{ flex: 1 }} />
        <div className="seg" style={{ fontSize: 11 }}>
          {SPEEDS.map((s) => <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
      </div>

      <div className="text-faint" style={{ padding: '0 14px 12px', fontSize: 11 }}>
        Positions are visually interpolated from race timing data and are not GPS-accurate. This replay sweeps real grid → real finishing
        order along the circuit; it does not represent lap-by-lap telemetry, which this data source doesn't provide.
        {mode === 'BATTLE' && !rivalUsername && ' Pick a rival in Live battle below to unlock battle mode.'}
      </div>
    </div>
  )
}
