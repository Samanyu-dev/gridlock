import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import { CameraRig, type CameraPresetSpec } from './CameraRig'
import { useGridLayout } from '../../lib/gl3d/useGridLayout'
import type { GLCircuitAsset } from '../../lib/gl3d/circuitManifest'

export interface GridEntry {
  driverId: number
  position: number
  short: string
  name: string
  constructor: string
  color: string
  status?: string // 'dns' when the source data indicates no time/no start
}

export type GridCameraTarget = 'GRID_OVERVIEW' | 'FRONT_ROW' | 'SELECTED_DRIVER' | 'ROW_SWEEP' | 'TOP_DOWN'

export interface GridFantasyState {
  myDriverIds: number[]
  captainId?: number | null
  underdogId?: number | null
  /** Only ever populated once the round is locked — see the privacy note
   * on the caller side. Never passed pre-lock. */
  rivalDriverIds?: number[]
}

interface QualifyingGridSceneProps {
  entries: GridEntry[]
  circuitAsset?: GLCircuitAsset
  fantasy?: GridFantasyState
  cameraTarget: GridCameraTarget
  selectedDriverId: number | null
  onSelectDriver: (driverId: number | null) => void
  targetRadius?: number
}

function gridCameraSpec(target: GridCameraTarget, radius: number, selected?: [number, number, number]): CameraPresetSpec {
  switch (target) {
    case 'TOP_DOWN':
      return { position: [0.01, radius * 2.6, 0.01], target: [0, 0, 0], fov: 36 }
    case 'FRONT_ROW':
      return { position: [radius * 0.5, radius * 0.18, radius * 0.85], target: [0, 0, radius * 0.5], fov: 40 }
    case 'SELECTED_DRIVER':
      return selected
        ? { position: [selected[0] + radius * 0.35, radius * 0.22, selected[2] + radius * 0.35], target: selected, fov: 38 }
        : { position: [radius * 0.9, radius * 0.5, radius * 0.9], target: [0, 0, 0], fov: 34 }
    case 'ROW_SWEEP':
    case 'GRID_OVERVIEW':
    default:
      return { position: [radius * 1.1, radius * 0.65, radius * 1.3], target: [0, 0, -radius * 0.2], fov: 36 }
  }
}

const RING_COLOR = { mine: '#3b9eff', captain: '#f5c518', underdog: '#f5c518', rival: '#ff4d4d', shared: '#a5adb8' } as const
const tmpObj = new Object3D()

/** Reusable staging for a 20-entry qualifying/starting grid — instanced base
 * markers (one draw call) plus a handful of individual rings for fantasy-
 * relevant drivers, camera presets via the same CameraRig every other 3D
 * surface uses, and click-to-select via the instanced mesh's own
 * instanceId (no per-marker component needed). */
export function QualifyingGridScene({
  entries, circuitAsset, fantasy, cameraTarget, selectedDriverId, onSelectDriver, targetRadius = 5,
}: QualifyingGridSceneProps) {
  const slots = useGridLayout(entries.length, circuitAsset, targetRadius)
  const [hovered, setHovered] = useState<number | null>(null)
  const meshRef = useRef<InstancedMesh>(null)
  const sweepTargetRef = useRef<[number, number, number]>([0, 0, 0])

  const selectedIndex = entries.findIndex((e) => e.driverId === selectedDriverId)

  const rings = useMemo(() => {
    if (!fantasy) return []
    const out: { position: [number, number, number]; color: string }[] = []
    const rivalSet = new Set(fantasy.rivalDriverIds ?? [])
    const mineSet = new Set(fantasy.myDriverIds)
    entries.forEach((e, i) => {
      const slot = slots[i]
      if (!slot) return
      const mine = mineSet.has(e.driverId)
      const rival = rivalSet.has(e.driverId)
      let color: string | null = null
      if (e.driverId === fantasy.captainId) color = RING_COLOR.captain
      else if (e.driverId === fantasy.underdogId) color = RING_COLOR.underdog
      else if (mine && rival) color = RING_COLOR.shared
      else if (mine) color = RING_COLOR.mine
      else if (rival) color = RING_COLOR.rival
      if (color) out.push({ position: slot.position, color })
    })
    return out
  }, [entries, slots, fantasy])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    slots.forEach((s, i) => {
      tmpObj.position.set(...s.position)
      tmpObj.rotation.set(0, s.rotationY, 0)
      const scale = i === hovered || i === selectedIndex ? 1.15 : 1
      tmpObj.scale.set(scale, scale, scale)
      tmpObj.updateMatrix()
      mesh.setMatrixAt(i, tmpObj.matrix)
      mesh.setColorAt(i, new Color(entries[i]?.color ?? '#888888'))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.count = slots.length
  }, [slots, entries, hovered, selectedIndex])

  useFrame((state) => {
    if (cameraTarget !== 'ROW_SWEEP' || slots.length === 0) return
    const t = (state.clock.elapsedTime * 0.06) % 1
    const rowCount = Math.max(1, Math.ceil(entries.length / 2))
    const row = Math.floor(t * rowCount)
    const slot = slots[Math.min(row * 2, slots.length - 1)]
    if (slot) sweepTargetRef.current = slot.position
  })

  const selectedPos = selectedIndex >= 0 ? slots[selectedIndex]?.position : undefined
  const spec = cameraTarget === 'ROW_SWEEP'
    ? { position: [sweepTargetRef.current[0] + targetRadius * 0.3, targetRadius * 0.2, sweepTargetRef.current[2] + targetRadius * 0.3] as [number, number, number], target: sweepTargetRef.current, fov: 40 }
    : gridCameraSpec(cameraTarget, targetRadius, selectedPos)

  return (
    <group>
      <CameraRig preset={spec} lerpSpeed={cameraTarget === 'ROW_SWEEP' ? 1.5 : 4} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} castShadow />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[targetRadius * 4, targetRadius * 4]} />
        <meshStandardMaterial color="#14161b" roughness={1} />
      </mesh>

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, Math.max(entries.length, 1)]}
        onClick={(e) => {
          e.stopPropagation()
          const id = e.instanceId
          if (id != null && entries[id]) onSelectDriver(entries[id].driverId === selectedDriverId ? null : entries[id].driverId)
        }}
        onPointerMove={(e) => { e.stopPropagation(); setHovered(e.instanceId ?? null) }}
        onPointerOut={() => setHovered(null)}
      >
        <capsuleGeometry args={[0.16, 0.34, 4, 8]} />
        <meshStandardMaterial roughness={0.4} metalness={0.2} />
      </instancedMesh>

      {rings.map((r, i) => (
        <mesh key={i} position={r.position} position-y={0.02} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.32, 0.4, 24]} />
          <meshBasicMaterial color={r.color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
