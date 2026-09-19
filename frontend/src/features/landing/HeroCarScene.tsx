import { useEffect, useRef, useState } from 'react'
import { GLShowroom, ModelViewer, CameraRig, LightingRig, EnvironmentRig } from '../../components/gl3d'
import type { InteractionState } from '../../components/gl3d'
import { getAsset } from '../../lib/gl3d/manifest'

const asset = getAsset('car.master')!

/** The homepage's cinematic reveal: the car sits nose-on in near darkness,
 * a light sweep brings it up over ~1.6s while the camera settles into the
 * showroom's ¾ HERO preset, then a slow scroll drifts the camera back —
 * one scripted intro, not a free-roam viewer, so drag/zoom stay off here. */
export function HeroCarScene() {
  const [revealed, setRevealed] = useState(false)
  const [lightIntensity, setLightIntensity] = useState(0.04)
  const [scrollShift, setScrollShift] = useState(0)
  const interaction = useRef<InteractionState>({ rotationY: 0, zoom: 1, parallaxX: 0, parallaxY: 0 })

  useEffect(() => {
    const revealDelay = 450
    const sweepDuration = 1600
    const revealTimer = setTimeout(() => setRevealed(true), revealDelay)
    let raf = 0
    const start = performance.now() + revealDelay
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / sweepDuration))
      setLightIntensity(0.04 + p * p * 0.96)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { clearTimeout(revealTimer); cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrollShift(Math.max(-1, Math.min(1, window.scrollY / 500)))
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <GLShowroom fallbackImage={asset.fallbackImage} fallbackLabel="GRIDLOCK">
      <CameraRig preset={revealed ? 'HERO' : 'HIDDEN'} lerpSpeed={1.6} scrollShift={scrollShift} />
      <LightingRig intensity={lightIntensity} accent="#ff2130" />
      <EnvironmentRig />
      <ModelViewer asset={asset} interactionState={interaction} interactionOptions={{ idleSpeed: 0.06 }} />
    </GLShowroom>
  )
}
