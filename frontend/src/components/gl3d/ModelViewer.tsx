import { useRef } from 'react'
import type { Group } from 'three'
import { useCarModel } from '../../lib/gl3d/useCarModel'
import type { GL3DAsset, ModelQuality } from '../../lib/gl3d/manifest'
import { useInteractionController, type InteractionOptions, type InteractionState } from './InteractionController'
import { useSceneTransition } from './SceneTransition'

export interface ModelViewerProps {
  asset: GL3DAsset
  quality?: ModelQuality
  interactive?: boolean
  interactionOptions?: InteractionOptions
  /** Pass a ref created by the parent (e.g. `useRef<InteractionState>({...})`)
   * so a sibling CameraRig can read the same zoom/parallax state every
   * frame. Omit it if nothing outside this component needs it. */
  interactionState?: React.RefObject<InteractionState>
  /** Recolors the body material for this instance only (e.g. a driver's
   * constructor color) — never mutates the shared cached material. */
  bodyColor?: string
}

/** Loads a manifest car asset and renders it with drag/idle/zoom/parallax
 * interaction — the one component the showroom, homepage hero, and driver
 * page's car tab all mount instead of each wiring useGLTF + pointer
 * handling themselves. */
export function ModelViewer({ asset, quality = 'medium', interactive = true, interactionOptions, interactionState, bodyColor }: ModelViewerProps) {
  const { scene } = useCarModel(asset, quality, bodyColor)
  const groupRef = useRef<Group>(null)
  useInteractionController(groupRef, { ...interactionOptions, enabled: interactive }, interactionState)
  const revealRef = useSceneTransition(asset.id + quality)

  return (
    <group ref={revealRef}>
      <group ref={groupRef}>
        <primitive object={scene} />
      </group>
    </group>
  )
}
