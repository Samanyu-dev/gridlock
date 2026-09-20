/** Pure, reversible scroll choreography. No renderer or animation dependency. */
export interface CameraFrame {
  at: number
  name: string
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}
export const HERO_CAMERA_FRAMES: CameraFrame[] = [
  { at: 0, name: 'INTRO', position: [0.7, 0.8, 5.8], target: [-0.8, 0.35, 0], fov: 34 },
  { at: .16, name: 'REVEAL', position: [1.8, 1.0, 5.4], target: [-0.75, .35, 0], fov: 34 },
  { at: .34, name: 'FRONT_3Q', position: [3.5, 1.6, 4.7], target: [-.65, .3, 0], fov: 34 },
  { at: .51, name: 'SIDE_DETAIL', position: [4.9, 1.25, 2.6], target: [-.5, .3, 0], fov: 34 },
  { at: .67, name: 'TOP_3Q', position: [3.3, 3.4, 4.4], target: [-.5, .2, 0], fov: 35 },
  { at: .84, name: 'DEPTH', position: [2.7, 1.0, 4.5], target: [0, .35, 0], fov: 32 },
  { at: 1, name: 'FINAL_HERO', position: [3.5, 1.6, 5.4], target: [-.6, .3, 0], fov: 35 },
]
export const MOBILE_CAMERA_FRAMES: CameraFrame[] = HERO_CAMERA_FRAMES.map((frame, i) => ({
  ...frame,
  position: ([ [1.1,1.2,6.1], [1.7,1.35,5.8], [2.7,1.9,5.5], [3.2,1.8,5.3], [2.7,2.6,5.5], [2.2,1.6,5.6], [2.7,1.9,5.8] ][i]) as CameraFrame['position'],
  target: [0,.25,0], fov: 37,
}))
export function sampleCamera(frames: CameraFrame[], progress: number, out: Omit<CameraFrame, 'at' | 'name'>) {
  const p = Math.max(0, Math.min(1, progress))
  const end = frames.findIndex(frame => frame.at >= p)
  const b = frames[end < 0 ? frames.length - 1 : end]
  const a = frames[Math.max(0, (end < 0 ? frames.length - 1 : end) - 1)]
  const t = a === b ? 0 : (p - a.at) / (b.at - a.at)
  const eased = t * t * (3 - 2 * t)
  for (let i = 0; i < 3; i++) {
    out.position[i] = a.position[i] + (b.position[i] - a.position[i]) * eased
    out.target[i] = a.target[i] + (b.target[i] - a.target[i]) * eased
  }
  out.fov = a.fov + (b.fov - a.fov) * eased
  return out
}
