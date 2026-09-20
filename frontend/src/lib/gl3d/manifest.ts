/** GRIDLOCK 3D asset manifest — the single source of truth for every 3D
 * asset's file paths, LOD tiers, and provenance. Components never hardcode
 * a model path like "/models/car.glb"; they look up an asset by id via
 * `getAsset()`/`getModelUrl()` here. Swapping an asset (e.g. the placeholder
 * master car for a final one) means editing this file only.
 */

export type GL3DAssetType = 'car' | 'circuit' | 'environment' | 'podium'
export type GL3DAssetStatus = 'draft' | 'approved' | 'production'

export interface GL3DAsset {
  id: string
  type: GL3DAssetType

  model: {
    high?: string
    medium: string
    low?: string
  }

  fallbackImage: string

  version: number
  triangles?: number

  materials?: string[]
  /** Canonical node/mesh name -> semantic role, e.g. "GL_Car_Wheel_FL": "wheel_front_left". */
  meshNames?: Record<string, string>

  license: {
    source: string
    commercialUse: boolean
    attribution?: string
  }

  status: GL3DAssetStatus
}

export const GL3D_MANIFEST: Record<string, GL3DAsset> = {
  'gridlock-car-dev': {
    id: 'gridlock-car-dev',
    type: 'car',
    model: {
      high: '/models/cars/gridlock-formula/high.glb',
      medium: '/models/cars/gridlock-formula/medium.glb',
      low: '/models/cars/gridlock-formula/low.glb',
    },
    fallbackImage: '/models/cars/gridlock-formula/fallback.svg',
    version: 2,
    triangles: 4100,
    materials: ['GL_Mat_Body', 'GL_Mat_Tire', 'GL_Mat_Glass', 'GL_Mat_Trim'],
    meshNames: {
      GL_Car_Root: 'root',
      GL_Car_Body: 'body',
      GL_Car_Wheel_FL: 'wheel_front_left',
      GL_Car_Wheel_FR: 'wheel_front_right',
      GL_Car_Wheel_RL: 'wheel_rear_left',
      GL_Car_Wheel_RR: 'wheel_rear_right',
    },
    license: {
      source: 'Original GRIDLOCK concept, generated in this repository',
      commercialUse: true,
    },
    // Procedurally generated original open-wheel silhouette (wings, halo,
    // suspension struts, 3 LOD tiers) — no third-party geometry or
    // textures, see frontend/scripts/build-formula-car.mjs and the
    // model directory's LICENSE.txt. Swap the three GLBs + fallback and
    // bump `version` if a higher-fidelity car replaces this one.
    status: 'approved',
  },
}

export function getAsset(id: string): GL3DAsset | undefined {
  return GL3D_MANIFEST[id]
}

export type ModelQuality = 'high' | 'medium' | 'low'

/** Resolve the best available model URL for a requested quality tier,
 * falling back toward "medium" (always present) if a tier is missing. */
export function getModelUrl(asset: GL3DAsset, quality: ModelQuality = 'medium'): string {
  if (quality === 'high') return asset.model.high ?? asset.model.medium
  if (quality === 'low') return asset.model.low ?? asset.model.medium
  return asset.model.medium
}
