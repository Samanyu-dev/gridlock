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
  'car.master': {
    id: 'car.master',
    type: 'car',
    model: {
      high: '/models/cars/gridlock-master-car/high.glb',
      medium: '/models/cars/gridlock-master-car/medium.glb',
      low: '/models/cars/gridlock-master-car/low.glb',
    },
    fallbackImage: '/models/cars/gridlock-master-car/fallback.svg',
    version: 1,
    triangles: 1430,
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
      source: 'Kenney "Racing Kit" (kenney.nl/assets/racing-kit), CC0 1.0',
      commercialUse: true,
    },
    // Placeholder body shape (generic low-poly racer, not an authentic
    // open-wheel silhouette) — real geometry/materials/LODs pipeline,
    // swap the three GLBs + fallback and bump `version` when a final
    // car is ready. See LICENSE.txt next to the model files.
    status: 'draft',
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
