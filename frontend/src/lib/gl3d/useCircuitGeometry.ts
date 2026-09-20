import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Vector3 } from 'three'
import type { GLCircuitAsset } from './circuitManifest'

const KERB_WIDTH = 1.4
const KERB_STRIPE_POINTS = 4
const SECTOR_COLORS = ['#3b9eff', '#2fe07a', '#f5c518'] as const

export interface CircuitMarker {
  position: Vector3
  rotationY: number
}
export interface CornerMarker extends CircuitMarker {
  number: number
}
export interface SectorMarker extends CircuitMarker {
  color: string
}

export interface CircuitGeometryData {
  points: Vector3[]
  curve: CatmullRomCurve3
  roadGeometry: BufferGeometry
  kerbGeometry: BufferGeometry
  startFinish: CircuitMarker
  sectorMarkers: SectorMarker[]
  cornerMarkers: CornerMarker[]
  /** Scale applied to fit the real-world track into a consistent,
   * display-friendly size — the circuit equivalent of the car pipeline's
   * recentering step, done at render time rather than baked into the data
   * so the manifest keeps honest real-world meters. */
  scale: number
  radius: number
}

function tangentAt(points: Vector3[], i: number): Vector3 {
  const n = points.length
  const prev = points[(i - 1 + n) % n]
  const next = points[(i + 1) % n]
  return next.clone().sub(prev).normalize()
}

function sideAt(points: Vector3[], i: number): Vector3 {
  const up = new Vector3(0, 1, 0)
  return new Vector3().crossVectors(up, tangentAt(points, i)).normalize()
}

function markerAt(points: Vector3[], index: number): CircuitMarker {
  const t = tangentAt(points, index)
  return { position: points[index].clone(), rotationY: Math.atan2(t.x, t.z) }
}

function buildRibbon(points: Vector3[], halfWidthFn: (i: number) => number): BufferGeometry {
  const n = points.length
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i < n; i++) {
    const side = sideAt(points, i)
    const hw = halfWidthFn(i)
    const left = points[i].clone().addScaledVector(side, hw)
    const right = points[i].clone().addScaledVector(side, -hw)
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
    normals.push(0, 1, 0, 0, 1, 0)
    uvs.push(0, i / n, 1, i / n)
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = i * 2 + 1
    const ni = (i + 1) % n
    const c = ni * 2, d = ni * 2 + 1
    indices.push(a, c, b, b, c, d)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geo.setIndex(indices)
  return geo
}

/** Two thin ribbons just outside the road edge, alternating red/white in
 * blocks — "simple kerbs", not a per-corner survey. */
function buildKerbs(points: Vector3[], roadHalfWidth: number): BufferGeometry {
  const n = points.length
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const red = new Color('#ff2130')
  const white = new Color('#f2f4f7')

  let vi = 0
  const pushEdge = (sign: 1 | -1) => {
    for (let i = 0; i < n; i++) {
      const side = sideAt(points, i)
      const inner = points[i].clone().addScaledVector(side, sign * roadHalfWidth)
      const outer = points[i].clone().addScaledVector(side, sign * (roadHalfWidth + KERB_WIDTH))
      positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z)
      const c = Math.floor(i / KERB_STRIPE_POINTS) % 2 === 0 ? red : white
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
    }
    for (let i = 0; i < n; i++) {
      const base = vi + i * 2
      const ni = vi + ((i + 1) % n) * 2
      indices.push(base, ni, base + 1, base + 1, ni, ni + 1)
    }
    vi += n * 2
  }
  pushEdge(1)
  pushEdge(-1)

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Centers, normalizes to a consistent display scale, and derives the road
 * mesh / kerbs / markers from a manifest asset's real-world geometry —
 * every circuit renders through this one function, never bespoke per-track
 * geometry. */
export function useCircuitGeometry(asset: GLCircuitAsset, targetRadius = 5): CircuitGeometryData {
  return useMemo(() => {
    const raw = asset.geometry.centerline.map(([x, y, z]) => new Vector3(x, y, z))
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
    for (const p of raw) {
      box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x)
      box.minZ = Math.min(box.minZ, p.z); box.maxZ = Math.max(box.maxZ, p.z)
    }
    const centerX = (box.minX + box.maxX) / 2
    const centerZ = (box.minZ + box.maxZ) / 2
    const spanX = box.maxX - box.minX
    const spanZ = box.maxZ - box.minZ
    const radius = Math.max(spanX, spanZ) / 2 || 1
    const scale = targetRadius / radius

    const points = raw.map((p) => new Vector3((p.x - centerX) * scale, p.y * scale, (p.z - centerZ) * scale))
    const halfWidth = (asset.geometry.width * scale) / 2

    const curve = new CatmullRomCurve3(points, true, 'catmullrom', 0.4)
    const roadGeometry = buildRibbon(points, () => halfWidth)
    const kerbGeometry = buildKerbs(points, halfWidth)

    const startFinish = markerAt(points, asset.startFinishIndex)
    const sectorMarkers: SectorMarker[] = (asset.sectors ?? []).map((idx, i) => ({
      ...markerAt(points, idx), color: SECTOR_COLORS[i] ?? '#ffffff',
    }))
    const cornerMarkers: CornerMarker[] = (asset.corners ?? []).map((c) => ({
      ...markerAt(points, c.index), number: c.number,
    }))

    return { points, curve, roadGeometry, kerbGeometry, startFinish, sectorMarkers, cornerMarkers, scale, radius: targetRadius }
  }, [asset, targetRadius])
}
