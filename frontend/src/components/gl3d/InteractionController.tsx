import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'

export interface InteractionState {
  /** Extra rotation (radians) to add on top of the model's own transform. */
  rotationY: number
  /** Multiplier applied to the camera rig's preset distance from target. */
  zoom: number
  /** Normalized (-1..1) pointer offset, for camera parallax. */
  parallaxX: number
  parallaxY: number
}

export interface InteractionOptions {
  idleSpeed?: number       // rad/sec auto-rotation once idle
  idleDelayMs?: number     // how long after the last drag before idle rotation resumes
  dragSensitivity?: number
  zoomSensitivity?: number
  minZoom?: number
  maxZoom?: number
  enabled?: boolean
}

/** Drag-to-rotate, idle auto-rotation, wheel zoom, and mouse parallax for a
 * showroom model — the interaction layer every 3D "product view" page
 * (showroom, driver page's car tab, garage) shares instead of reimplementing
 * pointer handling per feature. Mutates a plain ref every frame rather than
 * React state, so 60fps interaction never triggers component re-renders. */
export function useInteractionController(
  groupRef: React.RefObject<Group | null>,
  options: InteractionOptions = {},
  externalState?: React.RefObject<InteractionState>,
) {
  const {
    idleSpeed = 0.15, idleDelayMs = 2200, dragSensitivity = 0.008,
    zoomSensitivity = 0.0015, minZoom = 0.6, maxZoom = 1.6, enabled = true,
  } = options
  const { gl } = useThree()
  const ownState = useRef<InteractionState>({ rotationY: 0, zoom: 1, parallaxX: 0, parallaxY: 0 })
  const state = externalState ?? ownState
  const dragging = useRef(false)
  const lastX = useRef(0)
  const lastInteraction = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const el = gl.domElement

    const onDown = (e: PointerEvent) => { dragging.current = true; lastX.current = e.clientX }
    const onUp = () => { dragging.current = false }
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      state.current.parallaxX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      state.current.parallaxY = ((e.clientY - rect.top) / rect.height) * 2 - 1
      if (dragging.current) {
        const dx = e.clientX - lastX.current
        lastX.current = e.clientX
        state.current.rotationY += dx * dragSensitivity
        lastInteraction.current = performance.now()
      }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      state.current.zoom = Math.min(maxZoom, Math.max(minZoom, state.current.zoom + e.deltaY * zoomSensitivity))
      lastInteraction.current = performance.now()
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointermove', onMove)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl, enabled, dragSensitivity, zoomSensitivity, minZoom, maxZoom])

  useFrame((_, delta) => {
    if (!enabled) return
    const idle = performance.now() - lastInteraction.current > idleDelayMs
    if (idle && !dragging.current) state.current.rotationY += idleSpeed * delta
    if (groupRef.current) groupRef.current.rotation.y = state.current.rotationY
  })

  return state
}
