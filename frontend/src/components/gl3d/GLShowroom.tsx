import { PCFShadowMap } from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
  onDemand?: boolean
  transparent?: boolean
  onReady?: (ready: boolean) => void
}

function LoadingOverlay({ image, label }: { image: string; label?: string }) {
  const { active } = useProgress()
  if (!active) return null
  return <FallbackRenderer image={image} label={label} />
}

function ReadySignal({ onReady }: { onReady?: (ready: boolean) => void }) {
  useEffect(() => { onReady?.(true); return () => onReady?.(false) }, [onReady])
  return null
}

/** Render while settling after input, then let the GPU idle. */
function DemandFrames({ enabled, mobile }: { enabled: boolean; mobile: boolean }) {
  const { invalidate } = useThree()
  const { active } = useProgress()
  useEffect(() => {
    if (!enabled) return
    let raf = 0, until = 0, previous = 0
    const frame = (time: number) => {
      if (time - previous >= (mobile ? 32 : 15)) { invalidate(); previous = time }
      if (time < until) raf = requestAnimationFrame(frame)
      else raf = 0
    }
    const wake = () => {
      until = performance.now() + 1400
      if (!raf) raf = requestAnimationFrame(frame)
    }
    wake()
    window.addEventListener('scroll', wake, { passive: true })
    window.addEventListener('resize', wake)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', wake); window.removeEventListener('resize', wake) }
  }, [enabled, mobile, active, invalidate])
  return null
}

/** The one <Canvas> every 3D feature mounts — Suspense, an error boundary
 * (a failed GLTF fetch throws past Suspense, which only catches pending
 * promises), WebGL context-loss recovery, an adaptive performance monitor
 * that backs off DPR under sustained low FPS, and a performance-tier gate
 * that skips WebGL entirely (rendering the manifest's static fallback image
 * instead) on reduced-motion, weak GPUs, or when WebGL isn't available at
 * all. Homepage hero, driver showroom, and the garage all mount this rather
 * than building their own <Canvas>/Suspense/lighting stack. */
export function GLShowroom({ fallbackImage, fallbackLabel, children, forceTier, initialCamera, far = 100, onDemand = false, transparent = false, onReady }: GLShowroomProps) {
  const detected = usePerformanceTier()
  const tier = forceTier ?? detected
  const [failed, setFailed] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [dprBoost, setDprBoost] = useState(1)
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' })
    if (host.current) observer.observe(host.current)
    const onVisibility = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  const canvasEl = useRef<HTMLCanvasElement | null>(null)

  const onCreated = useCallback(({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    const el = gl.domElement
    canvasEl.current = el
    el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setContextLost(true) })
    el.addEventListener('webglcontextrestored', () => setContextLost(false))
  }, [])

  const staticOnly = tier === 'static' || failed || contextLost

  const [dprMin, dprMax] = TIER_DPR[tier]
  const dpr: [number, number] = [Math.min(dprMin, dprMax * dprBoost), dprMax * dprBoost]

  return (
    <div ref={host} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {staticOnly ? <FallbackRenderer image={fallbackImage} label={fallbackLabel} /> : <GLErrorBoundary onError={() => setFailed(true)}><Canvas
        fallback={<FallbackRenderer image={fallbackImage} label={fallbackLabel} />}
        frameloop={visible && pageVisible ? (onDemand ? 'demand' : 'always') : 'never'}
        shadows={TIER_SHADOWS[tier] ? { type: PCFShadowMap } : false}
        dpr={dpr}
        gl={{ alpha: transparent, antialias: tier !== 'performance', powerPreference: 'high-performance' }}
        camera={{ position: initialCamera?.position ?? CAMERA_PRESETS.HERO.position, fov: initialCamera?.fov ?? CAMERA_PRESETS.HERO.fov, near: 0.1, far }}
        onCreated={onCreated}
        style={{ touchAction: 'pan-y' }}
      >
        {onDemand && <DemandFrames enabled={visible && pageVisible} mobile={tier === 'performance'} />}
        {!onDemand && <PerformanceMonitor onDecline={() => setDprBoost(0.6)} onIncline={() => setDprBoost(1)} />}
        <GLErrorBoundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>{children}<ReadySignal onReady={onReady} /></Suspense>
        </GLErrorBoundary>
      </Canvas></GLErrorBoundary>}
      <LoadingOverlay image={fallbackImage} label={fallbackLabel} />
    </div>
  )
}
