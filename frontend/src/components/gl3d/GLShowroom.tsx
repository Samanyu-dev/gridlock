import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { Suspense, useCallback, useRef, useState, type ReactNode } from 'react'
import { CAMERA_PRESETS, type CameraPresetSpec } from './CameraRig'
import { FallbackRenderer } from './FallbackRenderer'
import { GLErrorBoundary } from './GLErrorBoundary'
import { TIER_DPR, TIER_SHADOWS, usePerformanceTier } from '../../lib/gl3d/usePerformanceTier'

interface GLShowroomProps {
  fallbackImage: string
  fallbackLabel?: string
  children: ReactNode
  /** Force a tier for testing, or to respect a caller's own detection. */
  forceTier?: ReturnType<typeof usePerformanceTier>
  /** Seeds the Canvas's starting camera — defaults to the car showroom's
   * HERO preset. A circuit scene (a completely different scale) passes its
   * own initial position/fov so frame 1 doesn't flash at car scale before
   * CameraRig's damping catches up. */
  initialCamera?: Pick<CameraPresetSpec, 'position' | 'fov'>
  /** Far clipping plane — car scenes fit in the default 100; a circuit
   * normalized to a similar display size still does, but a caller
   * rendering at real-world scale would need more. */
  far?: number
}

function LoadingOverlay({ image, label }: { image: string; label?: string }) {
  const { active } = useProgress()
  if (!active) return null
  return <FallbackRenderer image={image} label={label} />
}

/** The one <Canvas> every 3D feature mounts — Suspense, an error boundary
 * (a failed GLTF fetch throws past Suspense, which only catches pending
 * promises), WebGL context-loss recovery, an adaptive performance monitor
 * that backs off DPR under sustained low FPS, and a performance-tier gate
 * that skips WebGL entirely (rendering the manifest's static fallback image
 * instead) on reduced-motion, weak GPUs, or when WebGL isn't available at
 * all. Homepage hero, driver showroom, and the garage all mount this rather
 * than building their own <Canvas>/Suspense/lighting stack. */
export function GLShowroom({ fallbackImage, fallbackLabel, children, forceTier, initialCamera, far = 100 }: GLShowroomProps) {
  const detected = usePerformanceTier()
  const tier = forceTier ?? detected
  const [failed, setFailed] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [dprBoost, setDprBoost] = useState(1)
  const canvasEl = useRef<HTMLCanvasElement | null>(null)

  const onCreated = useCallback(({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    const el = gl.domElement
    canvasEl.current = el
    el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setContextLost(true) })
    el.addEventListener('webglcontextrestored', () => setContextLost(false))
  }, [])

  if (tier === 'static' || failed || contextLost) {
    return <FallbackRenderer image={fallbackImage} label={fallbackLabel} />
  }

  const [dprMin, dprMax] = TIER_DPR[tier]
  const dpr: [number, number] = [dprMin, dprMax * dprBoost]

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows={TIER_SHADOWS[tier]}
        dpr={dpr}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: initialCamera?.position ?? CAMERA_PRESETS.HERO.position, fov: initialCamera?.fov ?? CAMERA_PRESETS.HERO.fov, near: 0.1, far }}
        onCreated={onCreated}
        style={{ touchAction: 'none' }}
      >
        <PerformanceMonitor onDecline={() => setDprBoost(0.6)} onIncline={() => setDprBoost(1)} />
        <GLErrorBoundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>{children}</Suspense>
        </GLErrorBoundary>
      </Canvas>
      <LoadingOverlay image={fallbackImage} label={fallbackLabel} />
    </div>
  )
}
