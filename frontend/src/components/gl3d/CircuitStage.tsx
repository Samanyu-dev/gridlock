import { useRef } from 'react'
import { GLShowroom } from './GLShowroom'
import { CameraRig, type CameraPresetSpec } from './CameraRig'
import { LightingRig } from './LightingRig'
import { EnvironmentRig } from './EnvironmentRig'
import { CircuitModel, type CircuitModelProps } from './CircuitModel'
import { useInteractionController, type InteractionState } from './InteractionController'
import type { GLCircuitAsset } from '../../lib/gl3d/circuitManifest'

export type CircuitCameraPreset = 'TOP' | 'HERO' | 'FOLLOW'

function presetsFor(radius: number): Record<CircuitCameraPreset, CameraPresetSpec> {
  return {
    TOP: { position: [0.01, radius * 3.1, 0.01], target: [0, 0, 0], fov: 38 },
    HERO: { position: [radius * 1.7, radius * 1.35, radius * 1.7], target: [0, 0, 0], fov: 34 },
    FOLLOW: { position: [radius * 0.85, radius * 0.22, radius * 0.85], target: [radius * 0.1, 0, radius * 0.1], fov: 55 },
  }
}

interface CircuitStageProps {
  asset: GLCircuitAsset
  preset?: CircuitCameraPreset
  detail?: CircuitModelProps['detail']
  activeSector?: CircuitModelProps['activeSector']
  interactive?: boolean
  targetRadius?: number
}

/** The one 3D stage every circuit-facing screen mounts — /circuits/:slug's
 * hero and /live's smaller overview both render through this, never a
 * bespoke per-page Three.js setup. Reuses the exact same GLShowroom/
 * CameraRig/LightingRig/EnvironmentRig/InteractionController stack the car
 * pipeline already established; only CircuitModel and this preset
 * dictionary are circuit-specific. */
export function CircuitStage({
  asset, preset = 'HERO', detail = 'full', activeSector, interactive = true, targetRadius = 5,
}: CircuitStageProps) {
  const presets = presetsFor(targetRadius)
  const interaction = useRef<InteractionState>({ rotationY: 0, zoom: 1, parallaxX: 0, parallaxY: 0 })

  return (
    <GLShowroom
      fallbackImage={`/circuits/${asset.slug}.svg`}
      fallbackLabel={asset.name}
      initialCamera={{ position: presets[preset].position, fov: presets[preset].fov }}
      far={targetRadius * 20}
    >
      <CameraRig preset={presets[preset]} interaction={interaction} lerpSpeed={3} />
      <LightingRig intensity={1} accent="#ff2130" />
      <EnvironmentRig background="#05060a" shadows={false} />
      <CircuitStageInteraction interaction={interaction} enabled={interactive} minZoom={0.5} maxZoom={2}>
        <CircuitModel asset={asset} detail={detail} activeSector={activeSector} targetRadius={targetRadius} />
      </CircuitStageInteraction>
    </GLShowroom>
  )
}

/** Drag-to-orbit + zoom for the circuit stage, reusing the exact same
 * interaction hook the car pipeline uses — rotates the whole circuit group
 * rather than the camera, so CameraRig stays the single source of camera
 * truth. */
function CircuitStageInteraction({
  interaction, enabled, minZoom, maxZoom, children,
}: { interaction: React.RefObject<InteractionState>; enabled: boolean; minZoom: number; maxZoom: number; children: React.ReactNode }) {
  const groupRef = useRef(null)
  useInteractionController(groupRef, { enabled, minZoom, maxZoom, idleSpeed: 0 }, interaction)
  return <group ref={groupRef}>{children}</group>
}
