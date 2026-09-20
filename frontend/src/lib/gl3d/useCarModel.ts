import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Color, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, type Group } from 'three'
import { getModelUrl, type GL3DAsset, type ModelQuality } from './manifest'

export interface CarModel {
  scene: Group
  wheels: { fl?: Group; fr?: Group; rl?: Group; rr?: Group }
}

/** Loads (and caches) a manifest asset's GLTF, returning a fresh clone per
 * call so multiple simultaneous instances (garage, comparisons) never share
 * — and therefore never fight over — the same transform/material state.
 * Wheel nodes are resolved by the manifest's naming convention so callers
 * can spin them without string-matching mesh names themselves.
 *
 * `bodyColor` recolors GL_Mat_Body for this instance only: the clone also
 * clones (never mutates) that one material, so tinting a driver's car to
 * their constructor's color can never bleed into another instance sharing
 * the same cached GLTF. */
export function useCarModel(asset: GL3DAsset, quality: ModelQuality = 'medium', bodyColor?: string): CarModel {
  const url = getModelUrl(asset, quality)
  const gltf = useGLTF(url)

  return useMemo(() => {
    const scene = cloneSkeleton(gltf.scene) as Group
    const find = (name: string) => scene.getObjectByName(name) as Group | undefined

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      obj.castShadow = true
      if (obj.name === 'GL_Car_Body' && obj.material instanceof MeshStandardMaterial) {
        const paint = new MeshPhysicalMaterial()
        MeshStandardMaterial.prototype.copy.call(paint, obj.material)
        paint.color = new Color(bodyColor ?? '#ff3045')
        paint.metalness = 0.55
        paint.roughness = 0.28
        paint.clearcoat = 1
        paint.clearcoatRoughness = 0.18
        obj.material = paint
      }
    })

    return {
      scene,
      wheels: { fl: find('GL_Car_Wheel_FL'), fr: find('GL_Car_Wheel_FR'), rl: find('GL_Car_Wheel_RL'), rr: find('GL_Car_Wheel_RR') },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, url, bodyColor])
}

export function preloadCarModel(asset: GL3DAsset, quality: ModelQuality = 'medium'): void {
  useGLTF.preload(getModelUrl(asset, quality))
}
