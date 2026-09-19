import { ContactShadows } from '@react-three/drei'
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
      {shadows && (
        <ContactShadows position={[0, -0.01, 0]} opacity={0.55} scale={10} blur={2.2} far={4} resolution={512} color="#000000" />
      )}
    </>
  )
}
