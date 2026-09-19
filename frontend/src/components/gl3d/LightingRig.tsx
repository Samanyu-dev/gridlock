/** Key/fill/rim three-point lighting, the one lighting setup every 3D scene
 * mounts. `intensity` scales the whole rig (used later for "stronger stage
 * lighting" on a captain pick, a dimmer look for rivals, etc.) and `accent`
 * tints the rim light so a livery/team color can read in the scene without
 * a bespoke lighting rig per feature. */
export function LightingRig({ intensity = 1, accent = '#ff2130' }: { intensity?: number; accent?: string }) {
  return (
    <>
      <ambientLight intensity={0.15 * intensity} />
      <directionalLight position={[4, 6, 3]} intensity={1.4 * intensity} color="#ffffff" castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5 * intensity} color="#8fb2ff" />
      <pointLight position={[-2, 1.5, 3]} intensity={0.8 * intensity} color={accent} />
      <spotLight position={[0, 4, -4]} angle={0.5} penumbra={0.6} intensity={0.6 * intensity} color={accent} />
    </>
  )
}
