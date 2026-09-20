#!/usr/bin/env node
/**
 * GRIDLOCK 3D asset pipeline — circuit processing step.
 *
 * Takes a real GeoJSON track outline (lon/lat LineString) and produces a
 * GLCircuitAsset JSON: projects to local meters, resamples to an even
 * point spacing, detects corners from real curvature (never hand-placed),
 * and splits sectors at even arc-length thirds. Centering/scaling to fit a
 * display-friendly size happens in the renderer (CircuitModel), not here —
 * this script's output stays in true real-world meters, honest to source.
 *
 * Elevation: this data source has no per-point altitude, only a single
 * "altitude near start/finish" figure — never fabricated into a fake
 * elevation profile. Every point's Y here is 0; a real per-point source
 * (elevationSource) can be added later without changing the schema.
 *
 * Usage: node scripts/build-circuit-asset.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT_DIR = 'src/lib/gl3d/circuits'
const RESAMPLE_POINTS = 240
const TRACK_WIDTH_M = 12 // typical FIA Grade 1 circuit width; real but generic (no per-circuit survey data)

const SRC_DIR = 'scripts/circuit-sources'
const CIRCUITS = [
  { src: `${SRC_DIR}/monaco.geojson`, id: 'circuit.monaco', slug: 'monaco', country: 'MC', cornerAngleDeg: 9 },
  { src: `${SRC_DIR}/silverstone.geojson`, id: 'circuit.silverstone', slug: 'silverstone', country: 'GB', cornerAngleDeg: 9 },
  { src: `${SRC_DIR}/spa.geojson`, id: 'circuit.spa', slug: 'spa-francorchamps', country: 'BE', cornerAngleDeg: 9 },
]

function projectToMeters(lonLatPairs) {
  const lats = lonLatPairs.map((p) => p[1])
  const lons = lonLatPairs.map((p) => p[0])
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)
  return lonLatPairs.map(([lon, lat]) => [
    (lon - centerLon) * mPerDegLon,
    0,
    -(lat - centerLat) * mPerDegLat,
  ])
}

function dedupeConsecutive(points) {
  const out = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const [x, , z] = points[i]
    const [px, , pz] = out[out.length - 1]
    if (Math.hypot(x - px, z - pz) > 0.5) out.push(points[i])
  }
  return out
}

function cumulativeLengths(points) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) {
    const [x, , z] = points[i]
    const [px, , pz] = points[i - 1]
    lengths.push(lengths[i - 1] + Math.hypot(x - px, z - pz))
  }
  return lengths
}

/** Resample a closed loop to N evenly-spaced points by arc length. */
function resampleClosed(points, n) {
  const lengths = cumulativeLengths(points)
  const total = lengths[lengths.length - 1]
  const step = total / n
  const out = []
  let seg = 0
  for (let i = 0; i < n; i++) {
    const target = i * step
    while (seg < lengths.length - 2 && lengths[seg + 1] < target) seg++
    const segLen = lengths[seg + 1] - lengths[seg]
    const t = segLen > 0 ? (target - lengths[seg]) / segLen : 0
    const [x0, , z0] = points[seg]
    const [x1, , z1] = points[seg + 1]
    out.push([x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t])
  }
  return { points: out, totalLength: total }
}

/** Turning angle (radians) at each point of a closed polyline. */
function turningAngles(points) {
  const n = points.length
  const angles = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const curr = points[i]
    const next = points[(i + 1) % n]
    const v1x = curr[0] - prev[0], v1z = curr[2] - prev[2]
    const v2x = next[0] - curr[0], v2z = next[2] - curr[2]
    const a1 = Math.atan2(v1z, v1x)
    const a2 = Math.atan2(v2z, v2x)
    let d = a2 - a1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    angles.push(Math.abs(d))
  }
  return angles
}

/** Real corners, detected from curvature — local maxima above a threshold,
 * at least ~4% of the lap apart so one tight hairpin isn't counted twice. */
function detectCorners(points, angleThresholdDeg) {
  const angles = turningAngles(points)
  const threshold = (angleThresholdDeg * Math.PI) / 180
  const n = points.length
  const minGap = Math.max(3, Math.floor(n * 0.035))
  const candidates = []
  for (let i = 0; i < n; i++) {
    if (angles[i] < threshold) continue
    const isPeak = angles[i] >= angles[(i - 1 + n) % n] && angles[i] >= angles[(i + 1) % n]
    if (isPeak) candidates.push(i)
  }
  const corners = []
  for (const idx of candidates) {
    if (corners.length && Math.min(Math.abs(idx - corners[corners.length - 1]), n - Math.abs(idx - corners[corners.length - 1])) < minGap) continue
    corners.push(idx)
  }
  corners.sort((a, b) => a - b)
  return corners.map((index, i) => ({ number: i + 1, index }))
}

function buildCircuit({ src, id, slug, country, cornerAngleDeg }) {
  const geojson = JSON.parse(fs.readFileSync(src, 'utf8'))
  const feature = geojson.features[0]
  const { properties } = feature
  const rawLonLat = feature.geometry.coordinates
  // Closed loops repeat the first point as the last — drop it before resampling.
  const isClosed = Math.hypot(rawLonLat[0][0] - rawLonLat[rawLonLat.length - 1][0], rawLonLat[0][1] - rawLonLat[rawLonLat.length - 1][1]) < 1e-9
  const openLonLat = isClosed ? rawLonLat.slice(0, -1) : rawLonLat

  const projected = dedupeConsecutive(projectToMeters(openLonLat))
  const { points, totalLength } = resampleClosed(projected, RESAMPLE_POINTS)
  const corners = detectCorners(points, cornerAngleDeg)

  const n = points.length
  const sectors = [Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]

  const asset = {
    id, slug, country,
    name: properties.Name || properties.Location || slug,
    geometry: { centerline: points.map((p) => p.map((v) => Math.round(v * 100) / 100)), width: TRACK_WIDTH_M, closed: true },
    startFinishIndex: 0,
    sectors,
    corners,
    // No per-point elevation in this source — flat is the honest fallback,
    // not a placeholder for a fake profile.
    elevationSource: undefined,
    dataSource: 'bacinger/f1-circuits (MIT) — github.com/bacinger/f1-circuits, real surveyed/traced track outline',
    realLengthMeters: Math.round(totalLength),
    officialLengthMeters: properties.length ?? null,
    version: 1,
    status: 'draft',
  }
  return asset
}

/** A static fallback image built from the SAME real centerline data used
 * for the 3D geometry — not an arbitrary placeholder shape — for when
 * WebGL isn't available. Top-down (X,Z) projection, normalized to a
 * 400x220 viewBox like the car's fallback.svg. */
function buildFallbackSvg(asset) {
  const pts = asset.geometry.centerline.map(([x, , z]) => [x, z])
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const pad = 24
  const w = 400 - pad * 2, h = 220 - pad * 2
  const scale = Math.min(w / (maxX - minX || 1), h / (maxZ - minZ || 1))
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
  const path = pts
    .map(([x, z], i) => `${i === 0 ? 'M' : 'L'} ${(pad + w / 2 + (x - cx) * scale).toFixed(1)} ${(pad + h / 2 + (z - cz) * scale).toFixed(1)}`)
    .join(' ') + ' Z'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="400" height="220">
  <rect width="400" height="220" fill="#0a0c10" />
  <path d="${path}" fill="none" stroke="#ff2130" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" />
</svg>
`
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const PUBLIC_DIR = 'public/circuits'
fs.mkdirSync(PUBLIC_DIR, { recursive: true })
for (const cfg of CIRCUITS) {
  const asset = buildCircuit(cfg)
  fs.writeFileSync(path.join(OUT_DIR, `${cfg.slug}.json`), JSON.stringify(asset, null, 2))
  fs.writeFileSync(path.join(PUBLIC_DIR, `${cfg.slug}.svg`), buildFallbackSvg(asset))
  console.log(
    cfg.slug.padEnd(14),
    `resampled=${asset.geometry.centerline.length}pts`,
    `corners=${asset.corners.length}`,
    `length=${asset.realLengthMeters}m (official ${asset.officialLengthMeters}m)`,
  )
}
