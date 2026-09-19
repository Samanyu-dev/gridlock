#!/usr/bin/env node
/**
 * GRIDLOCK 3D asset pipeline — car processing step.
 *
 * Takes a raw source GLB, applies the GRIDLOCK mesh/node naming convention
 * (GL_Car_Root / GL_Car_Body / GL_Car_Wheel_FL|FR|RL|RR), then produces the
 * medium (Meshopt-compressed, the default tier) and low (simplified +
 * compressed) LOD tiers referenced by the asset manifest. "High" is the
 * renamed-but-uncompressed source, kept for desktop hero use.
 *
 * Naming convention (applies to every future GL3DAsset of type "car"):
 *   Root node   GL_Car_Root
 *   Body mesh   GL_Car_Body
 *   Wheel meshes GL_Car_Wheel_FL / FR / RL / RR — always independently
 *     addressable nodes, never merged into the body, so wheel-spin
 *     animation and per-wheel LOD swaps can target them directly.
 *   Materials   GL_Mat_<role> (Body, Tire, Glass, Trim, ...)
 *
 * Usage: node scripts/build-car-asset.mjs <sourceGlb> <outDir>
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions'
import { dedup, prune, simplify, weld, meshopt } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import path from 'node:path'
import fs from 'node:fs'

const [, , srcPath, outDir] = process.argv
if (!srcPath || !outDir) {
  console.error('Usage: node build-car-asset.mjs <sourceGlb> <outDir>')
  process.exit(1)
}

const WHEEL_RENAME = {
  wheelFrontLeft: 'GL_Car_Wheel_FL',
  wheelFrontRight: 'GL_Car_Wheel_FR',
  wheelBackLeft: 'GL_Car_Wheel_RL',
  wheelBackRight: 'GL_Car_Wheel_RR',
  body: 'GL_Car_Body',
}
const MATERIAL_RENAME = { red: 'GL_Mat_Body', carTire: 'GL_Mat_Tire', glass: 'GL_Mat_Glass', grey: 'GL_Mat_Trim' }

await MeshoptEncoder.ready
await MeshoptDecoder.ready
await MeshoptSimplifier.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

async function renamed() {
  const doc = await io.read(srcPath)
  const root = doc.getRoot()

  for (const node of root.listNodes()) {
    const clean = WHEEL_RENAME[node.getName()]
    if (clean) node.setName(clean)
    if (node.getName().includes('%') || node.getName().includes('Clone')) node.setName('GL_Car_Root')
  }
  for (const mesh of root.listMeshes()) {
    const clean = WHEEL_RENAME[mesh.getName().replace(/^Mesh /, '')]
    if (clean) mesh.setName(clean)
  }
  for (const mat of root.listMaterials()) {
    const clean = MATERIAL_RENAME[mat.getName()]
    if (clean) mat.setName(clean)
    // Source is KHR_materials_unlit (flat game-asset shading) — GRIDLOCK's
    // showroom lighting (key/fill/rim sweep) needs real PBR response, so
    // convert to lit here rather than ship materials that ignore every
    // light in the scene. Roughness/metalness tuned for a painted body,
    // rubber tires, and glass by role.
    mat.setExtension('KHR_materials_unlit', null)
    const name = mat.getName()
    if (name === 'GL_Mat_Tire') { mat.setRoughnessFactor(0.9); mat.setMetallicFactor(0) }
    else if (name === 'GL_Mat_Glass') { mat.setRoughnessFactor(0.05); mat.setMetallicFactor(0.1) }
    else { mat.setRoughnessFactor(0.35); mat.setMetallicFactor(0.15) }
  }
  doc.getRoot().listExtensionsUsed()
    .filter((ext) => ext instanceof KHRMaterialsUnlit)
    .forEach((ext) => ext.dispose())
  await doc.transform(dedup(), prune())
  return doc
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })

  const highDoc = await renamed()
  await io.write(path.join(outDir, 'high.glb'), highDoc)

  const mediumDoc = await renamed()
  await mediumDoc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  await io.write(path.join(outDir, 'medium.glb'), mediumDoc)

  const lowDoc = await renamed()
  await lowDoc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.01 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  await io.write(path.join(outDir, 'low.glb'), lowDoc)

  for (const tier of ['high', 'medium', 'low']) {
    const p = path.join(outDir, `${tier}.glb`)
    console.log(tier.padEnd(8), (fs.statSync(p).size / 1024).toFixed(1) + ' KB')
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
