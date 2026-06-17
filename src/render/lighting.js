// lighting.js — outdoor pool lighting.
//
// A warm key "sun" (matching the water shader's uSunDir) plus cool sky/ground
// hemisphere fill. Kept simple; the water provides most of the visual interest.

import * as THREE from 'three';

export function addLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x14536b, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
  sun.position.set(20, 40, 15); // aligned with the water's uSunDir
  scene.add(sun);

  return { hemi, sun };
}
