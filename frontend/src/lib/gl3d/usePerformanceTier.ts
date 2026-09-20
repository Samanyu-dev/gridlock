import { useEffect, useState } from 'react'

export type PerformanceTier = 'ultra' | 'high' | 'performance' | 'static'

function detectTier(): PerformanceTier {
  if (typeof window === 'undefined') return 'static'
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'static'

  let gl: WebGLRenderingContext | null = null
  try {
    const canvas = document.createElement('canvas')
    gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
  } catch {
    gl = null
  }
  if (!gl) return 'static'

  // iPadOS reports as "Macintosh" in the UA string by default (desktop-site
  // spoofing since iOS 13) — a touch-capable "Mac" is actually an iPad.
  const isSpoofedIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isSpoofedIPad
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4

  let renderer = ''
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)).toLowerCase()
  } catch {
    renderer = ''
  }
  const weakGpu = /swiftshader|llvmpipe|software/.test(renderer)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  if (weakGpu) return 'static'

  if (isMobile) return cores >= 6 && mem >= 6 ? 'high' : 'performance'
  return cores >= 8 && mem >= 8 ? 'ultra' : 'high'
}

/** Device/GPU/motion-preference capability tier, computed once on mount.
 * GLShowroom uses this to decide whether to mount a <Canvas> at all
 * ("static" never does), and to scale DPR/shadow quality within it. */
export function usePerformanceTier(): PerformanceTier {
  const [tier, setTier] = useState<PerformanceTier>('static')
  useEffect(() => { setTier(detectTier()) }, [])
  return tier
}

export const TIER_DPR: Record<PerformanceTier, [number, number]> = {
  ultra: [1, 1.5],
  high: [1, 1.5],
  performance: [1, 1],
  static: [1, 1],
}

export const TIER_SHADOWS: Record<PerformanceTier, boolean> = {
  ultra: true, high: true, performance: false, static: false,
}
