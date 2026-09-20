import assert from 'node:assert/strict'
import { HERO_CAMERA_FRAMES, MOBILE_CAMERA_FRAMES, sampleCamera } from '../src/lib/gl3d/cameraTimeline.ts'
for (const frames of [HERO_CAMERA_FRAMES, MOBILE_CAMERA_FRAMES]) {
 const out = {position:[0,0,0],target:[0,0,0],fov:0}
 for(const key of frames){sampleCamera(frames,key.at,out);assert.deepEqual(out.position,key.position);assert.deepEqual(out.target,key.target);assert.equal(out.fov,key.fov)}
 const forward=[]
 for(let i=0;i<=100;i++){sampleCamera(frames,i/100,out);forward.push(JSON.stringify(out));assert(out.position.every(Number.isFinite));assert(out.fov>=32&&out.fov<=37)}
 for(let i=100;i>=0;i--){sampleCamera(frames,i/100,out);assert.equal(JSON.stringify(out),forward[i])}
 sampleCamera(frames,-1,out);assert.deepEqual(out.position,frames[0].position)
 sampleCamera(frames,2,out);assert.deepEqual(out.position,frames.at(-1).position)
}
console.log('Camera choreography: desktop/mobile endpoints, bounds and exact reverse scrub passed.')
