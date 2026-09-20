import { useFrame, useThree } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { MathUtils, type DirectionalLight, type AmbientLight, type PointLight } from 'three'
/** Key/fill/rim three-point lighting, the one lighting setup every 3D scene
 * mounts. `intensity` scales the whole rig (used later for "stronger stage
 * lighting" on a captain pick, a dimmer look for rivals, etc.) and `accent`
 * tints the rim light so a livery/team color can read in the scene without
 * a bespoke lighting rig per feature. */
export function LightingRig({ intensity = 1, accent = '#ff2130', progress }: { intensity?: number; accent?: string; progress?: RefObject<number> }) {
  const key = useRef<DirectionalLight>(null)
  const fill = useRef<DirectionalLight>(null)
  const ambient = useRef<AmbientLight>(null)
  const rim = useRef<PointLight>(null)
  const { scene } = useThree()
  useFrame((_, delta) => {
    if (!progress) return
    const reveal = MathUtils.smoothstep(progress.current, .015, .28)
    if (key.current) {
      key.current.intensity = MathUtils.damp(key.current.intensity, .02 + reveal * 2.4, 7, delta)
      key.current.position.x = -3 + reveal * 7
    }
    if (fill.current) fill.current.intensity = .05 + reveal * .7
    if (ambient.current) ambient.current.intensity = .015 + reveal * .18
    if (rim.current) rim.current.intensity = .6 + reveal * .25
    scene.environmentIntensity = .04 + reveal * .8
  })
  return (
    <>
      <ambientLight ref={ambient} intensity={0.15 * intensity} />
      <directionalLight ref={key} position={[4, 6, 3]} intensity={1.4 * intensity} color="#ffffff" castShadow />
      <directionalLight ref={fill} position={[-4, 2, -3]} intensity={0.5 * intensity} color="#8fb2ff" />
      <pointLight ref={rim} position={[-2, 1.5, 3]} intensity={0.8 * intensity} color={accent} />
      <spotLight position={[0, 4, -4]} angle={0.5} penumbra={0.6} intensity={0.6 * intensity} color={accent} />
    </>
  )
}
