import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { MathUtils, Vector3 } from 'three'
import type { InteractionState } from './InteractionController'

export type CameraPreset = 'HIDDEN' | 'HERO' | 'FRONT' | 'SIDE' | 'REAR' | 'TOP' | 'COCKPIT'

interface PresetSpec { position: [number, number, number]; target: [number, number, number]; fov: number }

export const CAMERA_PRESETS: Record<CameraPreset, PresetSpec> = {
  // Tight, low, dark framing on the nose — the homepage hero's pre-reveal
  // state. Not one of the showroom's six named views; a shared preset since
  // it's just another camera position, not a bespoke camera system.
  HIDDEN: { position: [0.6, 0.55, 1.6], target: [0, 0.3, 0], fov: 24 },
  HERO: { position: [3.2, 1.5, 4.2], target: [0, 0.35, 0], fov: 32 },
  FRONT: { position: [0, 1.0, 4.6], target: [0, 0.45, 0], fov: 28 },
  SIDE: { position: [4.9, 0.9, 0], target: [0, 0.45, 0], fov: 28 },
  REAR: { position: [0, 1.1, -4.6], target: [0, 0.55, 0], fov: 28 },
  TOP: { position: [0.01, 5.6, 0.01], target: [0, 0, 0], fov: 32 },
  COCKPIT: { position: [0, 0.85, 0.3], target: [0, 0.85, 3], fov: 60 },
}

interface CameraRigProps {
  preset: CameraPreset
  lerpSpeed?: number
  interaction?: React.RefObject<InteractionState>
  /** Normalized (-1..1) continuous input for scroll-linked camera drift —
   * kept separate from `interaction`'s mouse-driven parallax so the two
   * inputs (scroll on the homepage, pointer in the showroom) never fight
   * over the same field. */
  scrollShift?: number
}

/** Damped camera transitions between named presets — the same rig used by
 * the showroom, the driver page's tab switches, the homepage's reveal
 * sequence, and (later) the garage. Lives inside <Canvas>; mount once per
 * scene. */
export function CameraRig({ preset, lerpSpeed = 4, interaction, scrollShift = 0 }: CameraRigProps) {
  const { camera } = useThree()
  const target = useRef(new Vector3(...CAMERA_PRESETS[preset].target))
  const currentTarget = useRef(new Vector3(...CAMERA_PRESETS[preset].target))
  const desiredFov = useRef(CAMERA_PRESETS[preset].fov)

  useFrame((_, delta) => {
    const spec = CAMERA_PRESETS[preset]
    const zoom = interaction?.current.zoom ?? 1
    const parX = interaction?.current.parallaxX ?? 0
    const parY = interaction?.current.parallaxY ?? 0
    target.current.set(
      spec.position[0] * zoom + parX * 0.4,
      spec.position[1] * zoom - parY * 0.2 + scrollShift * 0.6,
      spec.position[2] * zoom + scrollShift * -0.8,
    )
    currentTarget.current.set(...spec.target)
    desiredFov.current = spec.fov

    const a = 1 - Math.exp(-lerpSpeed * delta)
    camera.position.lerp(target.current, a)
    if ('fov' in camera) {
      camera.fov = MathUtils.damp(camera.fov, desiredFov.current, lerpSpeed, delta)
      camera.updateProjectionMatrix()
    }
    const lookTarget = camera.userData.__lookTarget instanceof Vector3
      ? camera.userData.__lookTarget as Vector3
      : (camera.userData.__lookTarget = new Vector3().copy(currentTarget.current))
    lookTarget.lerp(currentTarget.current, a)
    camera.lookAt(lookTarget)
  })

  return null
}
