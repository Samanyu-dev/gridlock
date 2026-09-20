import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RotateCw } from 'lucide-react'
import { GLShowroom, ModelViewer, CameraRig, LightingRig, EnvironmentRig } from '../../components/gl3d'
import type { CameraPreset, InteractionState } from '../../components/gl3d'
import { getAsset } from '../../lib/gl3d/manifest'

const PRESETS: CameraPreset[] = ['HERO', 'FRONT', 'SIDE', 'REAR', 'TOP', 'COCKPIT']
const asset = getAsset('gridlock-car-dev')!

export default function CarShowroom() {
  const [preset, setPreset] = useState<CameraPreset>('HERO')
  const interaction = useRef<InteractionState>({ rotationY: 0, zoom: 1, parallaxX: 0, parallaxY: 0 })

  return (
    <div className="page">
      <div className="container">
        <div className="row between" style={{ marginBottom: 16 }}>
          <Link to="/more" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Back</Link>
          <span className="chip" style={{ color: 'var(--caution)', borderColor: 'var(--caution)' }}>
            {asset.status.toUpperCase()} ASSET
          </span>
        </div>

        <div className="page-head"><span className="eyebrow">GRIDLOCK design studio</span><h1 className="page-title">Car Showroom</h1></div>

        <div className="panel" style={{ overflow: 'hidden', height: 520, position: 'relative' }}>
          <GLShowroom fallbackImage={asset.fallbackImage} fallbackLabel="GRIDLOCK master car">
            <CameraRig preset={preset} interaction={interaction} />
            <LightingRig intensity={1} accent="#ff2130" />
            <EnvironmentRig />
            <ModelViewer asset={asset} interactionState={interaction} />
          </GLShowroom>

          <div className="row gap-1" style={{ position: 'absolute', bottom: 16, left: 16, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button key={p} className={`btn btn-sm ${preset === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPreset(p)}>
                {p}
              </button>
            ))}
          </div>

          <div className="row gap-2" style={{ position: 'absolute', top: 16, right: 16, alignItems: 'center' }}>
            <RotateCw size={13} className="text-faint" />
            <span className="text-faint" style={{ fontSize: 12 }}>Drag to rotate · scroll to zoom</span>
          </div>
        </div>

        <div className="panel panel-pad" style={{ marginTop: 16 }}>
          <span className="eyebrow">An original open-wheel concept</span>
          <p className="text-dim">Explore the form from six camera angles. Drag horizontally to turn the car, or scroll to zoom. This is an unbranded GRIDLOCK concept, not an official team car.</p>
        </div>
      </div>
    </div>
  )
}
