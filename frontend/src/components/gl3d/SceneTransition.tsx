import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'

/** Scale-based reveal/dismiss used whenever scene content swaps — a new
 * model in the garage, a tab change that replaces what's on stage. Scaling
 * from ~0 rather than toggling material opacity avoids touching every
 * material on an arbitrary GLTF (some may not be marked transparent). */
export function useSceneTransition(sceneKey: unknown, speed = 6) {
  const ref = useRef<Group>(null)
  const scale = useRef(0.0001)
  const lastKey = useRef(sceneKey)

  useEffect(() => {
    if (lastKey.current !== sceneKey) {
      scale.current = 0.0001
      lastKey.current = sceneKey
    }
  }, [sceneKey])

  useFrame((_, delta) => {
    scale.current = scale.current + (1 - scale.current) * (1 - Math.exp(-speed * delta))
    ref.current?.scale.setScalar(scale.current)
  })

  return ref
}
