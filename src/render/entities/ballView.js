// ballView.js — the match ball.
//
// Reads ONLY interpolated ball state ({x, y, z}); y is height above the water.
// A yellow size-5-ish sphere with faint seam bands and a soft contact shadow on
// the water so its height reads clearly during lobs and skips.

import * as THREE from 'three';
import { TUNABLES } from '../../config/tunables.js';

export function createBallView() {
  const group = new THREE.Group();
  const r = TUNABLES.ball.radius;

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(r, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.45, metalness: 0.0 })
  );
  group.add(ball);

  // Seam bands to make spin legible.
  const seamMat = new THREE.MeshBasicMaterial({ color: 0xcc8a00 });
  const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 1.001, r * 0.05, 6, 24), seamMat);
  ball.add(seam);
  const seam2 = seam.clone();
  seam2.rotation.x = Math.PI / 2;
  ball.add(seam2);

  // Contact shadow: a flat disc on the surface that shrinks/fades as the ball
  // rises, so height is readable from above (the broadcast cam) too.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(r * 1.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x06314a, transparent: true, opacity: 0.35, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  group.add(shadow);

  return {
    group,
    setPose(x, y, z, dt) {
      ball.position.set(x, y, z);
      // Spin proportional to horizontal travel direction (cheap, just for life).
      ball.rotation.z -= dt * 6;
      ball.rotation.y -= dt * 4;

      shadow.position.set(x, 0.015, z);
      const h = Math.max(0, y);
      shadow.scale.setScalar(1 / (1 + h * 0.6));
      shadow.material.opacity = 0.35 / (1 + h * 0.5);
    },
  };
}
