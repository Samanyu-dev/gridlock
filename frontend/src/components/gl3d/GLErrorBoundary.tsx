import { Component, type ReactNode } from 'react'

interface Props { onError: () => void; children: ReactNode }
interface State { failed: boolean }

/** Suspense only catches a pending promise, never a rejected one — a failed
 * GLTF fetch (offline, 404, corrupt file) throws past it and would crash
 * the whole page without this. Reports up via onError so GLShowroom can
 * swap to the manifest's static fallback image instead. */
export class GLErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[gl3d] scene failed to load, falling back to static image', error)
    this.props.onError()
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
