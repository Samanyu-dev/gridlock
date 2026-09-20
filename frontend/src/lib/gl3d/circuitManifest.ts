/** GRIDLOCK circuit asset manifest — the single source of truth for every
 * circuit's geometry, mirroring the car manifest's role. Data is generated
 * by scripts/build-circuit-asset.mjs from real track-outline sources (see
 * scripts/circuit-sources/LICENSE.txt) — never hand-drawn. Components read
 * this, never a bespoke per-circuit geometry file.
 */
import monaco from './circuits/monaco.json'
import silverstone from './circuits/silverstone.json'
import spaFrancorchamps from './circuits/spa-francorchamps.json'
import albertPark from './circuits/albert-park.json'
import shanghai from './circuits/shanghai.json'
import suzuka from './circuits/suzuka.json'
import bahrain from './circuits/bahrain.json'
import jeddah from './circuits/jeddah.json'
import miami from './circuits/miami.json'
import imola from './circuits/imola.json'
import barcelonaCatalunya from './circuits/barcelona-catalunya.json'
import gillesVilleneuve from './circuits/gilles-villeneuve.json'
import redBullRing from './circuits/red-bull-ring.json'
import hungaroring from './circuits/hungaroring.json'
import zandvoort from './circuits/zandvoort.json'
import monza from './circuits/monza.json'
import baku from './circuits/baku.json'
import marinaBay from './circuits/marina-bay.json'
import cota from './circuits/cota.json'
import mexicoCity from './circuits/mexico-city.json'
import interlagos from './circuits/interlagos.json'
import lasVegas from './circuits/las-vegas.json'
import lusail from './circuits/lusail.json'
import yasMarina from './circuits/yas-marina.json'

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

const RAW = {
  monaco, silverstone, 'spa-francorchamps': spaFrancorchamps,
  'albert-park': albertPark, shanghai, suzuka, bahrain, jeddah, miami, imola,
  'barcelona-catalunya': barcelonaCatalunya, 'gilles-villeneuve': gillesVilleneuve,
  'red-bull-ring': redBullRing, hungaroring, zandvoort, monza, baku,
  'marina-bay': marinaBay, cota, 'mexico-city': mexicoCity, interlagos,
  'las-vegas': lasVegas, lusail, 'yas-marina': yasMarina,
} as const

export const GL_CIRCUIT_MANIFEST: Record<string, GLCircuitAsset> = Object.fromEntries(
  Object.entries(RAW).map(([slug, data]) => [slug, data as unknown as GLCircuitAsset]),
)

export function getCircuitAsset(slug: string): GLCircuitAsset | undefined {
  return GL_CIRCUIT_MANIFEST[slug]
}

/** Maps the real-race circuit name (as returned by the season/race API) to
 * this manifest's slug — the single source of truth for that lookup, so
 * every /live, /circuits, and grid/podium/visualizer consumer resolves a
 * round's circuit asset identically instead of keeping its own copy. */
export const CIRCUIT_ASSET_BY_NAME: Record<string, string> = {
  'Circuit de Monaco': 'monaco',
  'Silverstone Circuit': 'silverstone',
  'Circuit de Spa-Francorchamps': 'spa-francorchamps',
  'Albert Park Circuit': 'albert-park',
  'Shanghai International Circuit': 'shanghai',
  'Suzuka International Racing Course': 'suzuka',
  'Bahrain International Circuit': 'bahrain',
  'Jeddah Corniche Circuit': 'jeddah',
  'Miami International Autodrome': 'miami',
  'Autodromo Enzo e Dino Ferrari': 'imola',
  'Circuit de Barcelona-Catalunya': 'barcelona-catalunya',
  'Circuit Gilles Villeneuve': 'gilles-villeneuve',
  'Red Bull Ring': 'red-bull-ring',
  Hungaroring: 'hungaroring',
  'Circuit Zandvoort': 'zandvoort',
  'Autodromo Nazionale Monza': 'monza',
  'Baku City Circuit': 'baku',
  'Marina Bay Street Circuit': 'marina-bay',
  'Circuit of the Americas': 'cota',
  'Autódromo Hermanos Rodríguez': 'mexico-city',
  'Autódromo José Carlos Pace': 'interlagos',
  'Las Vegas Strip Circuit': 'las-vegas',
  'Lusail International Circuit': 'lusail',
  'Yas Marina Circuit': 'yas-marina',
}

export function getCircuitAssetForRace(circuitName: string): GLCircuitAsset | undefined {
  const slug = CIRCUIT_ASSET_BY_NAME[circuitName]
  return slug ? getCircuitAsset(slug) : undefined
}
