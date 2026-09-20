import { useMemo } from 'react'
import { Vector3 } from 'three'
import { projectCircuitPoints } from './useCircuitGeometry'
import type { GLCircuitAsset } from './circuitManifest'

export interface GridSlot {
  position: [number, number, number]
  rotationY: number
  row: number
  side: 'left' | 'right'
}

const ROW_SPACING = 0.9
const SIDE_OFFSET = 0.42
const STAGGER = 0.22

function tangentAt(points: Vector3[], i: number): Vector3 {
  const n = points.length
  const prev = points[(i - 1 + n) % n]
  const next = points[(i + 1) % n]
  return next.clone().sub(prev).normalize()
}

/** Grid slot positions for up to 20 starting-grid entries, staggered P1/P2
 * pairs down the pit straight. When a circuit asset is available, the grid
 * sits on that circuit's own real start/finish straight (reusing the same
 * centering/scaling as the full circuit geometry); otherwise falls back to
 * a generic straight strip — clearly generic, never presented as a
 * specific track's actual grid. */
export function useGridLayout(count: number, circuitAsset?: GLCircuitAsset, targetRadius = 5): GridSlot[] {
  return useMemo(() => {
    let originPoint: Vector3
    let tangent: Vector3

    if (circuitAsset) {
      const { points } = projectCircuitPoints(circuitAsset, targetRadius)
      const idx = circuitAsset.startFinishIndex
      originPoint = points[idx].clone()
      tangent = tangentAt(points, idx)
    } else {
      originPoint = new Vector3(0, 0, targetRadius * 0.6)
      tangent = new Vector3(0, 0, -1)
    }

    const side = new Vector3().crossVectors(new Vector3(0, 1, 0), tangent).normalize()
    const rotationY = Math.atan2(tangent.x, tangent.z)

    const slots: GridSlot[] = []
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2) + 1
      const isLeft = i % 2 === 0
      const back = tangent.clone().multiplyScalar(-(row - 1) * ROW_SPACING - (isLeft ? 0 : STAGGER))
      const lateral = side.clone().multiplyScalar(isLeft ? SIDE_OFFSET : -SIDE_OFFSET)
      const pos = originPoint.clone().add(back).add(lateral)
      slots.push({ position: [pos.x, pos.y, pos.z], rotationY, row, side: isLeft ? 'left' : 'right' })
    }
    return slots
  }, [count, circuitAsset, targetRadius])
}
