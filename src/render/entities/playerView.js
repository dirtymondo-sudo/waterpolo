// playerView.js — procedural placeholder swimmer (Milestone 0 / "Phase 1").
//
// Water polo players are mostly submerged, so we model what you actually see:
// head, cap, shoulders, upper arms. Capsule torso + sphere head + tinted cap +
// two arms, a tread-water bob, a velocity lean, a waterline foam ring, and (for
// the controlled player) a ground ring marker. GLTF models replace this in
// Milestone 4. This view reads ONLY interpolated pose data — never sim logic.

import * as THREE from 'three';

const TEAM_COLORS = [0x2f6dff, 0xff5a3c];
const SKIN = 0xe8b58a;

export function createPlayerView(team, controlled) {
  const group = new THREE.Group();
  const teamColor = TEAM_COLORS[team] ?? 0xffffff;

  // Torso: a capsule sitting mostly below the surface (y=0).
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.5, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0x14324d, roughness: 0.7 })
  );
  torso.position.y = -0.18;
  group.add(torso);

  // Shoulders just breaking the surface.
  const shoulders = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 16, 12),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 })
  );
  shoulders.scale.set(1.0, 0.5, 0.8);
  shoulders.position.y = 0.06;
  group.add(shoulders);

  // Head.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 18, 14),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55 })
  );
  head.position.set(0.06, 0.34, 0);
  group.add(head);

  // Cap (team-tinted), sits over the top/back of the head.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.205, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.5 })
  );
  cap.position.copy(head.position);
  group.add(cap);

  // Two upper arms reaching forward (+X local), treading the water.
  const armMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
  const makeArm = (side) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), armMat);
    arm.position.set(0.28, -0.02, side * 0.3);
    arm.rotation.z = Math.PI / 2.2;
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  group.add(armL, armR);

  // Waterline foam ring — sells "in the water"; grows with speed (a cheap
  // stand-in for the screen-space foam coming in Milestone 4).
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.01;
  group.add(foam);

  // Controlled-player ring marker on the surface.
  let marker = null;
  if (controlled) {
    marker = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe45e, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.02;
    group.add(marker);
  }

  let bobPhase = Math.random() * Math.PI * 2;

  return {
    group,
    // pose: interpolated { x, z, heading, speed }; t: render time for the bob.
    setPose(x, z, heading, speed, dt) {
      group.position.x = x;
      group.position.z = z;
      group.rotation.y = -heading; // world heading -> Three Y rotation

      // Tread-water bob + a small forward lean proportional to speed.
      bobPhase += dt * (2.2 + speed * 0.8);
      const bob = Math.sin(bobPhase) * 0.035;
      group.position.y = bob;
      group.rotation.z = 0; // keep upright; lean is faked via arm stroke below

      const stroke = Math.sin(bobPhase * 2.0) * Math.min(speed / 4, 1) * 0.4;
      armL.rotation.z = Math.PI / 2.2 - stroke;
      armR.rotation.z = Math.PI / 2.2 + stroke;

      // Foam ring reacts to speed.
      const s = 1 + Math.min(speed / 3, 1.2);
      foam.scale.setScalar(s);
      foam.material.opacity = 0.2 + Math.min(speed / 6, 0.4);

      if (marker) {
        marker.material.opacity = 0.75 + 0.2 * (0.5 + 0.5 * Math.sin(bobPhase * 1.5));
      }
    },
  };
}
