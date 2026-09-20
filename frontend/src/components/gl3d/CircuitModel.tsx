import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { useRef } from 'react'
import { DoubleSide, type CatmullRomCurve3, type Mesh } from 'three'
import { useCircuitGeometry } from '../../lib/gl3d/useCircuitGeometry'
import type { GLCircuitAsset } from '../../lib/gl3d/circuitManifest'

export interface CircuitModelProps {
  asset: GLCircuitAsset
  /** "full" shows corner numbers and sector flags (the circuit page's hero);
   * "compact" drops the label clutter for a small /live overview widget. */
  detail?: 'full' | 'compact'
  targetRadius?: number
  /** Highlights a session's current sector (1/2/3), e.g. from /live. */
  activeSector?: 1 | 2 | 3
}

function RacingLinePulse({ curve, radius }: { curve: CatmullRomCurve3; radius: number }) {
  const ref = useRef<Mesh>(null)
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current = (t.current + delta * 0.08) % 1
    const p = curve.getPointAt(t.current)
    ref.current?.position.set(p.x, p.y + 0.05, p.z)
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[radius * 0.02, 12, 12]} />
      <meshStandardMaterial color="#ff2130" emissive="#ff2130" emissiveIntensity={2.2} toneMapped={false} />
    </mesh>
  )
}

export function CircuitModel({ asset, detail = 'full', targetRadius = 5, activeSector }: CircuitModelProps) {
  const geo = useCircuitGeometry(asset, targetRadius)
  const postHeight = targetRadius * 0.05

  return (
    <group>
      <mesh geometry={geo.roadGeometry} receiveShadow>
        <meshStandardMaterial color="#22252b" roughness={0.9} metalness={0.05} side={DoubleSide} />
      </mesh>
      <mesh geometry={geo.kerbGeometry}>
        <meshStandardMaterial vertexColors roughness={0.6} side={DoubleSide} />
      </mesh>

      {/* Start/finish — a thin stripe across the road's full width, at the
          track's local rotation (group's +Z after rotationY = tangent
          direction, +X = across the track). */}
      <group position={geo.startFinish.position} rotation-y={geo.startFinish.rotationY}>
        <mesh position-y={0.02}>
          <boxGeometry args={[asset.geometry.width * geo.scale, 0.02, targetRadius * 0.02]} />
          <meshStandardMaterial color="#f2f4f7" />
        </mesh>
      </group>

      {/* Sector boundary flags */}
      {geo.sectorMarkers.map((m, i) => (
        <group key={i} position={m.position} rotation-y={m.rotationY}>
          <mesh position-y={postHeight / 2}>
            <boxGeometry args={[0.04, postHeight, 0.04]} />
            <meshStandardMaterial
              color={m.color} emissive={m.color}
              emissiveIntensity={activeSector === ((i + 1) as 1 | 2 | 3) ? 1.5 : 0.3}
            />
          </mesh>
          {detail === 'full' && (
            <Billboard position-y={postHeight + 0.15}>
              <Text fontSize={postHeight * 0.6} color={m.color} anchorX="center" anchorY="middle">S{i + 1}</Text>
            </Billboard>
          )}
        </group>
      ))}

      {/* Corner markers */}
      {detail === 'full' && geo.cornerMarkers.map((m) => (
        <group key={m.number} position={m.position} rotation-y={m.rotationY}>
          <mesh position-y={postHeight * 0.3}>
            <cylinderGeometry args={[0.03, 0.03, postHeight * 0.6, 6]} />
            <meshStandardMaterial color="#a5adb8" />
          </mesh>
          <Billboard position-y={postHeight * 0.7}>
            <Text fontSize={postHeight * 0.4} color="#f2f4f7" anchorX="center" anchorY="middle">{m.number}</Text>
          </Billboard>
        </group>
      ))}

      <RacingLinePulse curve={geo.curve} radius={targetRadius} />
    </group>
  )
}
