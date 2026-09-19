import { useRef, useState } from 'react'
import { Box } from 'lucide-react'
import { GLShowroom, ModelViewer, CameraRig, LightingRig, EnvironmentRig } from '../../components/gl3d'
import type { CameraPreset, InteractionState } from '../../components/gl3d'
import { getAsset } from '../../lib/gl3d/manifest'

const asset = getAsset('gridlock-car-dev')!
const TABS = ['OVERVIEW', 'FORM', 'FANTASY', 'CAR'] as const
type Tab = typeof TABS[number]

const TAB_PRESET: Record<Tab, CameraPreset> = {
  OVERVIEW: 'HERO',   // front ¾
  FORM: 'SIDE',       // side angle
  FANTASY: 'TOP',     // top ¾
  CAR: 'HERO',        // full interactive mode, drag/zoom stay live throughout
}

/** The driver page's 3D panel — same manifest car, tinted to the driver's
 * constructor color, with a tab strip that repositions the camera the way
 * the driver page's own tabs would (kept as a self-contained panel rather
 * than restructuring the whole page into a tab system in this pass). */
export function DriverCarPanel({ color, name }: { color: string; name: string }) {
  const [tab, setTab] = useState<Tab>('OVERVIEW')
  const interaction = useRef<InteractionState>({ rotationY: 0, zoom: 1, parallaxX: 0, parallaxY: 0 })

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="row between" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
        <span className="row gap-2" style={{ alignItems: 'center' }}><Box size={14} className="text-faint" /> <span className="eyebrow">3D · {name}'s car</span></span>
        <div className="seg">
          {TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>
      <div style={{ height: 340, position: 'relative' }}>
        <GLShowroom fallbackImage={asset.fallbackImage} fallbackLabel={`${name}'s car`}>
          <CameraRig preset={TAB_PRESET[tab]} interaction={interaction} />
          <LightingRig intensity={1} accent={color} />
          <EnvironmentRig />
          <ModelViewer asset={asset} interactionState={interaction} interactive={tab === 'CAR'} bodyColor={color} />
        </GLShowroom>
      </div>
    </div>
  )
}
