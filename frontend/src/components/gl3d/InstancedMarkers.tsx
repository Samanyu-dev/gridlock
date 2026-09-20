import { useLayoutEffect, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'

export interface MarkerInstance {
  position: [number, number, number]
  rotationY?: number
  color: string
  scale?: number
}

const tmp = new Object3D()

/** One draw call for many lightweight "car-ish" markers — the qualifying
 * grid and race visualizer both need up to 20 simultaneous position
 * indicators, and neither should load/clone 20 GLTF instances to do it.
 * A stylized capsule-on-a-plate marker, colored per-instance (constructor
 * color), reused by both features instead of a bespoke marker per page. */
export function InstancedMarkers({ instances, markerSize = 1 }: { instances: MarkerInstance[]; markerSize?: number }) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    instances.forEach((inst, i) => {
      tmp.position.set(...inst.position)
      tmp.rotation.set(0, inst.rotationY ?? 0, 0)
      const s = (inst.scale ?? 1) * markerSize
      tmp.scale.set(s, s, s)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      mesh.setColorAt(i, new Color(inst.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.count = instances.length
  }, [instances, markerSize])

  if (instances.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(instances.length, 1)]}>
      <capsuleGeometry args={[0.16, 0.34, 4, 8]} />
      <meshStandardMaterial roughness={0.4} metalness={0.2} />
    </instancedMesh>
  )
}
