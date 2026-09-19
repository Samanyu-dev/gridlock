/** Shown instead of the live 3D scene: while a model is still loading
 * (Suspense fallback), on a "static" performance tier, or when WebGL isn't
 * available at all. Always the same static image the manifest already
 * carries for this reason — never a separate "loading" asset to maintain. */
export function FallbackRenderer({ image, label }: { image: string; label?: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0c10', overflow: 'hidden',
    }}>
      <img src={image} alt={label ?? 'GRIDLOCK'} style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }} />
    </div>
  )
}
