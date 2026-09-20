/** GRIDLOCK circuit asset manifest — the single source of truth for every
 * circuit's geometry, mirroring the car manifest's role. Data is generated
 * by scripts/build-circuit-asset.mjs from real track-outline sources (see
 * scripts/circuit-sources/LICENSE.txt) — never hand-drawn. Components read
 * this, never a bespoke per-circuit geometry file.
 */
import monaco from './circuits/monaco.json'
import silverstone from './circuits/silverstone.json'
import spaFrancorchamps from './circuits/spa-francorchamps.json'

export type GLCircuitAssetStatus = 'draft' | 'approved' | 'production'

export interface GLCircuitAsset {
  id: string
  slug: string
  name: string
  country: string

  geometry: {
    centerline: Array<[number, number, number]>
    width: number
    closed: boolean
  }

  startFinishIndex: number
  sectors?: [number, number, number]
  corners?: Array<{ number: number; index: number; label?: string }>

  elevationSource?: string
  dataSource: string
  version: number
  status: GLCircuitAssetStatus

  /** Real lap length as measured from this asset's own (resampled)
   * geometry, alongside the source's officially-published figure — kept
   * both, never silently reconciled, since a polyline resample naturally
   * runs a little short of the true arc length. */
  realLengthMeters?: number
  officialLengthMeters?: number | null
}

const RAW = { monaco, silverstone, 'spa-francorchamps': spaFrancorchamps } as const

export const GL_CIRCUIT_MANIFEST: Record<string, GLCircuitAsset> = Object.fromEntries(
  Object.entries(RAW).map(([slug, data]) => [slug, data as unknown as GLCircuitAsset]),
)

export function getCircuitAsset(slug: string): GLCircuitAsset | undefined {
  return GL_CIRCUIT_MANIFEST[slug]
}
