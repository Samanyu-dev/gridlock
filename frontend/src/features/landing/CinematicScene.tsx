import type { RefObject } from 'react'
import { GLShowroom } from '../../components/gl3d/GLShowroom'
import { CameraRig } from '../../components/gl3d/CameraRig'
import { LightingRig } from '../../components/gl3d/LightingRig'
import { EnvironmentRig } from '../../components/gl3d/EnvironmentRig'
import { ModelViewer } from '../../components/gl3d/ModelViewer'
import { HERO_CAMERA_FRAMES, MOBILE_CAMERA_FRAMES } from '../../lib/gl3d/cameraTimeline'
import { getAsset } from '../../lib/gl3d/manifest'

const asset = getAsset('gridlock-car-dev')!
export default function CinematicScene({ progress, mobile, onReady }: { progress: RefObject<number>; mobile: boolean; onReady: (ready: boolean) => void }) {
  const frames = mobile ? MOBILE_CAMERA_FRAMES : HERO_CAMERA_FRAMES
  return <GLShowroom fallbackImage={asset.fallbackImage} fallbackLabel="GRIDLOCK open-wheel concept" initialCamera={frames[0]} onDemand transparent onReady={onReady}>
    <CameraRig preset={frames[0]} timeline={{ frames, progress }} lerpSpeed={8} />
    <LightingRig progress={progress} intensity={.08} accent="#d6e4ff" />
    <EnvironmentRig transparent shadows={!mobile} />
    <ModelViewer asset={asset} quality={mobile ? 'low' : 'medium'} interactive={false} reveal={false} />
  </GLShowroom>
}
