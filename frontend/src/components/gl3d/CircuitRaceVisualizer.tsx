import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import { CameraRig } from './CameraRig'
import { raceOdometer, useRaceLane, type RaceProgressInput } from '../../lib/gl3d/useRaceProgress'
import type { GLCircuitAsset } from '../../lib/gl3d/circuitManifest'

export interface RaceVisualizerDriver extends RaceProgressInput {
  color: string
  /** 0 = full emphasis, lower = dimmed (used by FANTASY/BATTLE modes to
   * push non-relevant drivers into the background). */
  emphasis?: number
}

const tmp = new Object3D()

/** Instanced markers swept along the circuit's own spline (or a generic
 * fallback lane) from grid order to finish order. Progress is driven by a
 * ref the caller owns and mutates every frame — never React state — so this
 * can animate smoothly without triggering 60fps re-renders. */
export function CircuitRaceVisualizer({
  drivers, circuitAsset, progressRef, playingRef, speedRef, targetRadius = 5,
}: {
  drivers: RaceVisualizerDriver[]
  circuitAsset?: GLCircuitAsset
  /** Owned by the caller's HTML controls; this component advances it every
   * frame (ref mutation, not React state) and the caller reads it back on
   * its own throttled cadence for the scrubber UI. */
  progressRef: React.RefObject<number>
  playingRef: React.RefObject<boolean>
  speedRef: React.RefObject<number>
  targetRadius?: number
}) {
  const lane = useRaceLane(circuitAsset, targetRadius)
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (mesh) mesh.count = drivers.length
  }, [drivers.length])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (playingRef.current) {
      progressRef.current = Math.min(1, progressRef.current + delta * 0.12 * speedRef.current)
    }
    const t = progressRef.current
    drivers.forEach((d, i) => {
      const odo = raceOdometer(d, t)
      const { position, rotationY } = lane.frame(odo)
      const dimmed = d.emphasis !== undefined && d.emphasis < 1
      const scale = (dimmed ? 0.75 : 1) * (d.retired && t > 0.5 ? Math.max(0, 1 - (t - 0.5) * 2) : 1)
      tmp.position.copy(position)
      tmp.position.y += 0.02
      tmp.rotation.set(0, rotationY, 0)
      tmp.scale.setScalar(Math.max(0.001, scale))
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      mesh.setColorAt(i, new Color(d.color).multiplyScalar(dimmed ? 0.45 : 1))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <CameraRig preset={{ position: [targetRadius * 1.1, targetRadius * 0.9, targetRadius * 1.1], target: [0, 0, 0], fov: 38 }} lerpSpeed={3} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[targetRadius * 4, targetRadius * 4]} />
        <meshStandardMaterial color="#101218" roughness={1} />
      </mesh>
      <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(drivers.length, 1)]}>
        <capsuleGeometry args={[0.14, 0.3, 4, 8]} />
        <meshStandardMaterial roughness={0.4} metalness={0.2} />
      </instancedMesh>
    </group>
  )
}
