// public/src/world.js
// Builds the THREE.js scene + collision list for a map. The flagship map
// ("Triad Keep") is built from its explicit block list (shared/data.js) so
// its geometry is identical to what tools/verify-map.mjs tested. The other
// 12 maps keep the original prototype's procedural style-based generation.
//
// Bug fixed here: the original always rendered a 3-site map's objective pad
// at hardcoded positions ([[-14,-15],[14,15],[0,0]] -- note the asymmetric
// z:15 on the second one) regardless of the actual site list. Pads are now
// drawn directly from map.sites, which shared/data.js gives every map.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { buildSolidsFromBlocks } from '../../shared/collision.js';

function mat(color, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function makeText(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#08131dcc'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#' + color.toString(16).padStart(6, '0'); g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
  g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(3.3, 0.82, 1);
  return sp;
}

function addBoxMesh(scene, b, materials) {
  const matByType = { floor: materials.floor, wall: materials.wall, cover: materials.crate, platform: materials.trim, step: materials.cover };
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.sx, b.sy, b.sz), matByType[b.type] || materials.wall);
  mesh.position.set(b.x, b.y, b.z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildFlagship(map, materials, scene) {
  const solids = buildSolidsFromBlocks(map.blocks);
  map.blocks.forEach(b => addBoxMesh(scene, b, materials));
  return solids;
}

// --- Legacy procedural generator for the 12 prototype arenas (ported from
// prototype v0.1's buildMap, restructured into a function). ---
function buildProcedural(map, materials, scene) {
  const solids = [];
  const { wallMat, crate, cover, trim, floor } = materials;
  const box = (x, y, z, sx, sy, sz, material, collide = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) solids.push({ x, z, hx: sx / 2, hz: sz / 2, ymin: y - sy / 2, ymax: y + sy / 2 });
    return mesh;
  };

  box(0, -0.35, 0, 44, 0.7, 44, floor);
  box(0, 2, -22, 44, 4, 1, wallMat); box(0, 2, 22, 44, 4, 1, wallMat);
  box(-22, 2, 0, 1, 4, 44, wallMat); box(22, 2, 0, 1, 4, 44, wallMat);

  const blocks = [[-9, -12, 7, 2], [-2, -12, 3, 6], [8, -10, 8, 2], [13, -3, 2, 8], [-12, -3, 2, 9], [-5, 1, 8, 2], [5, 3, 2, 8], [12, 10, 7, 2], [-10, 11, 8, 2], [-1, 13, 2, 6]];
  blocks.forEach(([x, z, w, d], i) => { box(x, 1.35, z, w, 2.7, d, i % 3 === 0 ? wallMat : cover); box(x, 2.75, z, w * 0.7, 0.12, d * 0.7, trim, false); });

  const m = map;
  if (m.style === 'three') { box(-1, 1.1, -2, 4, 2.2, 4, crate); box(-14, 1.3, 12, 4, 2.6, 5, cover); box(14, 1.3, 12, 4, 2.6, 5, cover); }
  if (m.style === 'vertical' || m.style === 'arctic' || m.style === 'split') { box(0, 3, -7, 12, 0.5, 3, trim); box(0, 1.5, -7, 10, 3, 1, wallMat); box(0, 1.5, -4, 10, 3, 1, wallMat); }
  if (m.style === 'teleport') { for (const [x, z] of [[-15, 0], [15, 0]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.18, 8, 24), new THREE.MeshStandardMaterial({ color: m.accent, emissive: m.accent, emissiveIntensity: 1.2 })); ring.position.set(x, 1.6, z); scene.add(ring); ring.rotation.y = Math.PI / 2; } }
  if (m.style === 'courtyard' || m.style === 'city' || m.style === 'urban') { box(0, 0.9, 0, 6, 1.8, 6, mat(0x5a6266)); for (let i = 0; i < 4; i++) box((i - 1.5) * 5, 0.08, 0, 0.12, 0.12, 10, trim, false); }
  if (m.style === 'coast') { for (let i = 0; i < 7; i++) box(-15 + i * 5, 0.25, 17, 3, 0.5, 1.5, mat(0x477f8b), false); }
  if (m.style === 'ancient') { for (const [x, z] of [[-15, -14], [15, -14], [-15, 14], [15, 14]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 4, 8), wallMat); c.position.set(x, 2, z); scene.add(c); solids.push({ x, z, hx: 0.8, hz: 0.8, ymin: 0, ymax: 4 }); } }
  if (m.style === 'chasm') { box(0, -0.05, 0, 5, 0.1, 40, mat(0x111c28), false); box(-3, 1.2, 0, 0.25, 2.4, 40, trim); box(3, 1.2, 0, 0.25, 2.4, 40, trim); }
  if (m.style === 'fortress') { for (let z = -15; z <= 15; z += 10) { box(0, 1.2, z, 15, 2.4, 1, wallMat); box(-8, 1.2, z, 1, 2.4, 5, cover); } }
  if (m.style === 'lanes') { for (const z of [-6, 6]) box(0, 1.6, z, 22, 3, 0.45, trim); }

  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 34, z = (Math.random() - 0.5) * 34;
    if (Math.hypot(x + 3, z + 3) > 6 && !solids.some(s => Math.abs(s.x - x) < s.hx + 1 && Math.abs(s.z - z) < s.hz + 1)) box(x, 0.65, z, 1.4, 1.3, 1.4, crate);
  }
  return solids;
}

export function buildWorld(map, quality) {
  const scene = new THREE.Scene();
  const skyColor = map.style === 'arctic' ? 0x9ebdc8 : 0x9bb2bf;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(map.style === 'arctic' ? 0xa9c3cc : 0x82949c, 22, 70);

  const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 150);
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: quality > 0.5 });
  renderer.setPixelRatio(Math.min(devicePixelRatio * quality, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = quality > 0.75;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const hemi = new THREE.HemisphereLight(0xd8efff, 0x3b4249, 2.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bc, 3.0); sun.position.set(-9, 18, 7);
  sun.castShadow = quality > 0.75; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);

  const materials = {
    wallMat: mat(map.wall), wall: mat(map.wall),
    trim: mat(map.accent, 0.45, 0.25),
    crate: mat(0x384b57), cover: mat(0x596d76),
    floor: mat(map.floor),
  };

  const solids = map.blocks ? buildFlagship(map, materials, scene) : buildProcedural(map, materials, scene);

  // Objective pads, drawn from the map's real site list (fixes the
  // old hardcoded/asymmetric pad-position bug).
  map.sites.forEach(site => {
    const y = (site.elevated || 0) + 0.04;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(site.radius, site.radius, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: map.accent, emissive: map.accent, emissiveIntensity: 0.25, transparent: true, opacity: 0.7 })
    );
    pad.position.set(site.x, y, site.z);
    scene.add(pad);
    const label = makeText(site.label, map.accent);
    label.position.set(site.x, y + 2.4, site.z);
    scene.add(label);
  });

  return { scene, camera, renderer, solids };
}

export { makeText };
