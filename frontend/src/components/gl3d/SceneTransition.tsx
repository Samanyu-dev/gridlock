import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'

export interface SceneTransitionOptions {
  speed?: number
  /** Adds a slow, subtle scale pulse once settled — the garage's captain
   * treatment ("a restrained animation"), reusing this same scale-only
   * approach rather than a second animation system. */
  breathe?: boolean
  breatheAmount?: number
  breatheSpeed?: number
}

/** Scale-based reveal/dismiss used whenever scene content swaps — a new
 * model in the garage, a tab change that replaces what's on stage. Scaling
 * from ~0 rather than toggling material opacity avoids touching every
 * material on an arbitrary GLTF (some may not be marked transparent). */
export function useSceneTransition(sceneKey: unknown, options: SceneTransitionOptions | number = 6) {
  const { speed = 6, breathe = false, breatheAmount = 0.015, breatheSpeed = 1.2 } =
    typeof options === 'number' ? { speed: options } : options
  const ref = useRef<Group>(null)
  const scale = useRef(0.0001)
  const lastKey = useRef(sceneKey)
  const clock = useRef(0)

  useEffect(() => {
    if (lastKey.current !== sceneKey) {
      scale.current = 0.0001
      lastKey.current = sceneKey
    }
  }, [sceneKey])

  useFrame((_, delta) => {
    scale.current = scale.current + (1 - scale.current) * (1 - Math.exp(-speed * delta))
    let s = scale.current
    if (breathe && scale.current > 0.98) {
      clock.current += delta
      s *= 1 + Math.sin(clock.current * breatheSpeed) * breatheAmount
    }
    ref.current?.scale.setScalar(s)
  })

  return ref
}
