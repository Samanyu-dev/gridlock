import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type { Meta } from './types'

const MetaContext = createContext<{ meta: Meta | null }>({ meta: null })

export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => { api.meta().then(setMeta).catch(() => {}) }, [])
  return <MetaContext.Provider value={{ meta }}>{children}</MetaContext.Provider>
}
export function useMeta() { return useContext(MetaContext).meta }
