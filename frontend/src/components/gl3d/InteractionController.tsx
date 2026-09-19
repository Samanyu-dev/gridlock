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
  pinchSensitivity?: number
  minZoom?: number
  maxZoom?: number
  enabled?: boolean
}

/** Drag-to-rotate, idle auto-rotation, wheel zoom, pinch-to-zoom (touch),
 * and mouse parallax for a showroom model — the interaction layer every 3D
 * "product view" page (showroom, driver page's car tab, garage) shares
 * instead of reimplementing pointer handling per feature. Mutates a plain
 * ref every frame rather than React state, so 60fps interaction never
 * triggers component re-renders. */
export function useInteractionController(
  groupRef: React.RefObject<Group | null>,
  options: InteractionOptions = {},
  externalState?: React.RefObject<InteractionState>,
) {
  const {
    idleSpeed = 0.15, idleDelayMs = 2200, dragSensitivity = 0.008,
    zoomSensitivity = 0.0015, pinchSensitivity = 0.006, minZoom = 0.6, maxZoom = 1.6, enabled = true,
  } = options
  const { gl } = useThree()
  const ownState = useRef<InteractionState>({ rotationY: 0, zoom: 1, parallaxX: 0, parallaxY: 0 })
  const state = externalState ?? ownState
  const dragging = useRef(false)
  const lastX = useRef(0)
  const lastInteraction = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const el = gl.domElement

    const onDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size === 1) { dragging.current = true; lastX.current = e.clientX }
      else { dragging.current = false; pinchDist.current = null }
    }
    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinchDist.current = null
      dragging.current = pointers.current.size === 1
    }
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      state.current.parallaxX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      state.current.parallaxY = ((e.clientY - rect.top) / rect.height) * 2 - 1

      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.current.size >= 2) {
        const [a, b] = Array.from(pointers.current.values())
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist.current != null) {
          state.current.zoom = Math.min(maxZoom, Math.max(minZoom, state.current.zoom - (dist - pinchDist.current) * pinchSensitivity * 0.01))
          lastInteraction.current = performance.now()
        }
        pinchDist.current = dist
        return
      }

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
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('pointermove', onMove)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('wheel', onWheel)
      pointers.current.clear()
      pinchDist.current = null
    }
  }, [gl, enabled, dragSensitivity, zoomSensitivity, pinchSensitivity, minZoom, maxZoom])

  useFrame((_, delta) => {
    if (!enabled) return
    const idle = performance.now() - lastInteraction.current > idleDelayMs
    if (idle && !dragging.current) state.current.rotationY += idleSpeed * delta
    if (groupRef.current) groupRef.current.rotation.y = state.current.rotationY
  })

  return state
}
