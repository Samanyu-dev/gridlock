import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Fog } from 'three'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/** Dark cinematic backdrop + ground contact shadow — deliberately self-
 * contained (no external HDRI fetch) so the showroom never depends on a
 * CDN round-trip or breaks the PWA's offline shell. Swap in a real
 * Environment preset later as a pure addition if reflections are worth
 * the network cost. */
export function EnvironmentRig({ background = '#05060a', shadows = true }: { background?: string; shadows?: boolean }) {
  const { scene } = useThree()
  useEffect(() => {
    scene.fog = new Fog(background, 6, 16)
    return () => { scene.fog = null }
  }, [scene, background])

  return (
    <>
      <color attach="background" args={[background]} />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={3} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 2, 1]} />
        <Lightformer intensity={2} position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[6, 1, 1]} />
        <Lightformer intensity={1.5} color="#b8d6ff" position={[4, 3, -3]} rotation={[0, -Math.PI / 4, 0]} scale={[4, 2, 1]} />
      </Environment>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]} receiveShadow>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color="#0b0e14" roughness={0.4} metalness={0.35} />
      </mesh>
      {shadows && (
        <ContactShadows position={[0, -0.01, 0]} opacity={0.55} scale={10} blur={2.2} far={4} resolution={512} color="#000000" />
      )}
    </>
  )
}
