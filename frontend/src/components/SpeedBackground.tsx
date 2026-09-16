import { useEffect, useRef } from 'react'

/** Motion backdrop for the app / hero.
 *
 *  Default: a lightweight animated canvas of speed light-streaks — reads as
 *  "car flying past" without a heavy video file or AI-slop stock loop. If a
 *  video `src` is provided (e.g. an owned/licensed F1 clip at
 *  `/media/hero.mp4`), it renders that instead, with off-screen pause and
 *  reduced-motion handling. Flat, restrained, GPU-cheap.
 */
export function SpeedBackground({ src, poster, intensity = 1 }: {
  src?: string; poster?: string; intensity?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Video path: autoplay muted loop, pause when off-screen or reduced-motion.
  useEffect(() => {
    const v = videoRef.current
    if (!src || !v) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { v.pause(); return }
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.05 })
    io.observe(v)
    return () => io.disconnect()
  }, [src])

  // Canvas path: animated speed streaks.
  useEffect(() => {
    if (src) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      w = r.width; h = r.height
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(canvas)

    type Streak = { x: number; y: number; len: number; speed: number; a: number; red: boolean }
    const N = Math.round(46 * intensity)
    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    const make = (): Streak => ({
      x: rand(0, w), y: rand(0, h), len: rand(60, 260), speed: rand(6, 26),
      a: rand(0.05, 0.5), red: Math.random() < 0.22,
    })
    let streaks: Streak[] = Array.from({ length: N }, make)
    let raf = 0, running = true

    const frame = () => {
      if (!running) return
      ctx.clearRect(0, 0, w, h)
      // faint perspective floor grid
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1
      for (let i = 1; i < 8; i++) {
        const y = h - (h * 0.5) * (i / 8) ** 1.6
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      for (const s of streaks) {
        const grad = ctx.createLinearGradient(s.x, s.y, s.x + s.len, s.y)
        const col = s.red ? '255,33,48' : '235,240,248'
        grad.addColorStop(0, `rgba(${col},0)`)
        grad.addColorStop(1, `rgba(${col},${s.a})`)
        ctx.strokeStyle = grad; ctx.lineWidth = s.red ? 2 : 1.2
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.len, s.y); ctx.stroke()
        s.x += s.speed
        if (s.x - s.len > w) { Object.assign(s, make(), { x: -rand(40, 240) }) }
      }
      raf = requestAnimationFrame(frame)
    }
    if (!reduce) raf = requestAnimationFrame(frame)
    else { // one static frame
      ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0, 0, w, h)
    }

    const onVis = () => { running = !document.hidden; if (running && !reduce) { raf = requestAnimationFrame(frame) } }
    document.addEventListener('visibilitychange', onVis)
    return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [src, intensity])

  if (src) {
    return <video ref={videoRef} src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" aria-hidden />
  }
  return <canvas ref={canvasRef} aria-hidden />
}
