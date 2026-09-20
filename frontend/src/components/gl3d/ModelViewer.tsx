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
  /** Overrides the reveal transition's key (defaults to asset+quality) —
   * the garage passes the selected driver/constructor id so switching the
   * selection re-triggers the pop-in even when the color doesn't change. */
  transitionKey?: unknown
  /** Adds the captain's slow "restrained" breathing scale pulse. */
  breathe?: boolean
  reveal?: boolean
}

/** Loads a manifest car asset and renders it with drag/idle/zoom/parallax
 * interaction — the one component the showroom, homepage hero, driver
 * page's car tab, and garage all mount instead of each wiring useGLTF +
 * pointer handling themselves. */
export function ModelViewer({
  asset, quality = 'medium', interactive = true, interactionOptions, interactionState, bodyColor, transitionKey, breathe, reveal = true,
}: ModelViewerProps) {
  const { scene } = useCarModel(asset, quality, bodyColor)
  const groupRef = useRef<Group>(null)
  useInteractionController(groupRef, { ...interactionOptions, enabled: interactive }, interactionState)
  const revealRef = useSceneTransition(transitionKey ?? asset.id + quality, { breathe })

  return (
    <group ref={reveal ? revealRef : undefined}>
      <group ref={groupRef}>
        <primitive object={scene} />
      </group>
    </group>
  )
}
