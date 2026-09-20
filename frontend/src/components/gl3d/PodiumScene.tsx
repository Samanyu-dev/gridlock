import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { CameraRig } from './CameraRig'

export interface PodiumEntry {
  rank: 1 | 2 | 3
  label: string
  sublabel: string
  value: string
  color: string
}

const HEIGHT = { 1: 1.5, 2: 1.1, 3: 0.8 } as const
const SLOT_X = { 1: 0, 2: -1.3, 3: 1.3 } as const
/** Seconds after mount each block starts rising — P3, then P2, then P1. */
const RISE_AT = { 3: 0.15, 2: 0.7, 1: 1.25 } as const

function Block({ entry, reduceMotion }: { entry: PodiumEntry; reduceMotion: boolean }) {
  const meshRef = useRef<Mesh>(null)
  const height = HEIGHT[entry.rank]
  const clock = useRef(0)

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (reduceMotion) { mesh.scale.y = 1; mesh.position.y = height / 2; return }
    clock.current += delta
    const t = Math.max(0, clock.current - RISE_AT[entry.rank])
    const rise = 1 - Math.exp(-4 * t)
    // Subtle settle bounce on the winner only — no confetti, no bloom.
    const bounce = entry.rank === 1 && t > 0.9 ? Math.sin((t - 0.9) * 6) * Math.exp(-(t - 0.9) * 3) * 0.03 : 0
    mesh.scale.y = Math.max(0.001, rise + bounce)
    mesh.position.y = (height * mesh.scale.y) / 2
  })

  return (
    <group position-x={SLOT_X[entry.rank]}>
      <mesh ref={meshRef} position-y={height / 2}>
        <boxGeometry args={[1, height, 1]} />
        <meshStandardMaterial color="#1c2027" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, height + 0.06, 0]}>
        <boxGeometry args={[1, 0.08, 1]} />
        <meshStandardMaterial color={entry.color} roughness={0.3} metalness={0.4} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** A restrained 3-block podium stage — dark ground, one settling light, and
 * blocks that rise P3 → P2 → P1 with a small winner bounce. Rank/name/score
 * are rendered as HTML overlay by the caller (architecture rule: HTML for
 * text, three.js for spatial content only), so this component knows nothing
 * about the DOM. Reused as-is for both fantasy and real-race results — the
 * caller just maps different data into the same PodiumEntry[] shape. */
export function PodiumScene({ entries, reduceMotion = false }: { entries: PodiumEntry[]; reduceMotion?: boolean }) {
  const lightRef = useRef<import('three').DirectionalLight>(null)
  const clock = useRef(0)

  useFrame((_, delta) => {
    if (reduceMotion) { if (lightRef.current) lightRef.current.intensity = 1.2; return }
    clock.current += delta
    if (lightRef.current) lightRef.current.intensity = Math.min(1.2, clock.current * 0.8)
  })

  return (
    <group>
      <CameraRig preset={{ position: [0, 1.7, 5.2], target: [0, 0.6, 0], fov: 30 }} lerpSpeed={3} />
      <ambientLight intensity={0.18} />
      <directionalLight ref={lightRef} position={[2, 5, 3]} intensity={reduceMotion ? 1.2 : 0} castShadow />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color="#0a0b0f" roughness={1} />
      </mesh>
      {entries.map((e) => <Block key={e.rank} entry={e} reduceMotion={reduceMotion} />)}
    </group>
  )
}
