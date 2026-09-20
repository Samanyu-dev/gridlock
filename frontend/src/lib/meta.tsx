import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type { Meta } from './types'

const MetaContext = createContext<{ meta: Meta | null; error: string | null }>({ meta: null, error: null })

export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let disposed = false
    let pending = false
    const refresh = async () => {
      if (pending || document.hidden) return
      pending = true
      try {
        const data = await api.meta()
        if (!disposed) { setMeta(data); setError(null) }
      } catch {
        if (!disposed) setError('Race data is temporarily unavailable. Retrying automatically.')
      } finally { pending = false }
    }
    void refresh()
    const timer = setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    // Remove the previous service worker's account-unsafe API cache.
    if ('caches' in window) void caches.delete('gridlock-api').catch(() => {})
    return () => {
      disposed = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [])
  return <MetaContext.Provider value={{ meta, error }}>{children}</MetaContext.Provider>
}
export function useMeta() { return useContext(MetaContext).meta }
export function useMetaStatus() { return useContext(MetaContext) }
