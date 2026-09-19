import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { shareOrDownload, type ShareCardSpec } from '../lib/shareCard'

export function ShareButton({ spec, filename, label = 'Share' }: { spec: ShareCardSpec; filename: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')

  const go = async () => {
    setState('busy')
    try {
      await shareOrDownload(spec, filename)
      setState('done')
      setTimeout(() => setState('idle'), 1800)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 1800)
    }
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={go} disabled={state === 'busy'}>
      {state === 'done' ? <Check size={14} /> : <Share2 size={14} />}
      {state === 'busy' ? 'Rendering…' : state === 'done' ? 'Shared' : state === 'error' ? 'Try again' : label}
    </button>
  )
}
