import { Canvas } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { Suspense, type ReactNode } from 'react'
import { CAMERA_PRESETS } from './CameraRig'
import { FallbackRenderer } from './FallbackRenderer'
import { TIER_DPR, TIER_SHADOWS, usePerformanceTier } from '../../lib/gl3d/usePerformanceTier'

interface GLShowroomProps {
  fallbackImage: string
  fallbackLabel?: string
  children: ReactNode
  /** Force a tier for testing, or to respect a caller's own detection. */
  forceTier?: ReturnType<typeof usePerformanceTier>
}

function LoadingOverlay({ image, label }: { image: string; label?: string }) {
  const { active } = useProgress()
  if (!active) return null
  return <FallbackRenderer image={image} label={label} />
}

/** The one <Canvas> every 3D feature mounts — Suspense, camera defaults,
 * responsive DPR, shadow toggling, and a performance-tier gate that skips
 * WebGL entirely (rendering the manifest's static fallback image instead)
 * on reduced-motion, weak GPUs, or when WebGL isn't available at all.
 * Homepage hero, driver showroom, and the garage all mount this rather
 * than building their own <Canvas>/Suspense/lighting stack. */
export function GLShowroom({ fallbackImage, fallbackLabel, children, forceTier }: GLShowroomProps) {
  const detected = usePerformanceTier()
  const tier = forceTier ?? detected

  if (tier === 'static') {
    return <FallbackRenderer image={fallbackImage} label={fallbackLabel} />
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows={TIER_SHADOWS[tier]}
        dpr={TIER_DPR[tier]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: CAMERA_PRESETS.HERO.position, fov: CAMERA_PRESETS.HERO.fov, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
      <LoadingOverlay image={fallbackImage} label={fallbackLabel} />
    </div>
  )
}
