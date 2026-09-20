import { useMemo } from 'react'
import { CatmullRomCurve3, Vector3 } from 'three'
import { projectCircuitPoints } from './useCircuitGeometry'
import type { GLCircuitAsset } from './circuitManifest'

export interface RaceProgressInput {
  driverId: number
  gridPosition: number
  /** Real finish position, or null when there is none to show honestly
   * (retired / no classification) — never backfilled with a guess. */
  finishPosition: number | null
  retired: boolean
}

const GAP = 0.02
/** Where a retired car freezes — a fixed illustrative point, not tied to any
 * real lap count (the data model has none), and always short of the line. */
const RETIRE_ODOMETER = 0.42

function wrap01(u: number) {
  return ((u % 1) + 1) % 1
}

/** Distance-along-track for a driver at reveal progress t in [0,1]: starts
 * clustered at the grid (spaced by real grid order) and, over one virtual
 * lap, arrives spaced by real finish order. This is a stylized results
 * sweep — not a lap-by-lap simulation, since no live timing/telemetry
 * exists in the data model to simulate honestly. */
export function raceOdometer(driver: RaceProgressInput, t: number): number {
  const startOdo = -GAP * (driver.gridPosition - 1)
  if (driver.retired) return startOdo + Math.min(t, 1) * (RETIRE_ODOMETER - startOdo)
  const endOdo = 1 - GAP * ((driver.finishPosition ?? driver.gridPosition) - 1)
  return startOdo + t * (endOdo - startOdo)
}

/** Places an odometer value onto either the real circuit's spline (when a
 * manifest asset exists for this round) or a generic straight virtual
 * lane — same fallback principle as useGridLayout, never presenting the
 * generic lane as a specific track's actual layout. */
export function useRaceLane(circuitAsset: GLCircuitAsset | undefined, targetRadius = 5) {
  return useMemo(() => {
    if (circuitAsset) {
      const { points } = projectCircuitPoints(circuitAsset, targetRadius)
      const curve = new CatmullRomCurve3(points, true, 'catmullrom', 0.4)
      const startU = circuitAsset.startFinishIndex / points.length
      return {
        frame(odometer: number) {
          const u = wrap01(startU + odometer)
          const position = curve.getPointAt(u)
          const tangent = curve.getTangentAt(u)
          return { position, rotationY: Math.atan2(tangent.x, tangent.z) }
        },
      }
    }
    const length = targetRadius * 3
    return {
      frame(odometer: number) {
        const clamped = Math.max(-0.4, Math.min(1.4, odometer))
        return { position: new Vector3(0, 0, targetRadius * 0.6 - clamped * length), rotationY: 0 }
      },
    }
  }, [circuitAsset, targetRadius])
}
