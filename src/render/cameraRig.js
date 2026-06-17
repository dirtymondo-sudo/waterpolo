// cameraRig.js — elevated 3/4 broadcast camera that tracks and slightly *leads*
// the action. All motion is critically-damped (frame-rate independent) so the
// camera is never snappy. Three modes, cycled by the command's cycleCam.

import * as THREE from 'three';
import { TUNABLES } from '../config/tunables.js';
import { POOL } from '../config/rules.js';

const MODES = ['broadcast', 'side', 'dynamic', 'endline'];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._desiredPos = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
    this._initialized = false;
  }

  get mode() {
    return MODES[this.modeIndex];
  }

  cycle() {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
  }

  // focus: {x,z}; vel: {x,z} world velocity of the focus (for leading).
  update(focus, vel, dt) {
    const C = TUNABLES.camera;

    // Lead vector: look ahead along the focus velocity, clamped.
    const lead = new THREE.Vector3(vel.x, 0, vel.z).multiplyScalar(C.lead);
    if (lead.length() > C.leadClamp) lead.setLength(C.leadClamp);

    const f = new THREE.Vector3(focus.x, 0, focus.z);

    if (this.mode === 'endline') {
      // Stand behind your team's goal and look straight down the long axis, so
      // the 30m pool runs away from the camera and reads vertically on screen —
      // a player's-eye view from that team's side. Anchored to the endline (it
      // does not chase the player up the pool); it only pans gently sideways.
      const teamSign = C.endlineTeam === 1 ? 1 : -1; // -X end for team 0
      const back = POOL.length / 2 + C.endlineDistance;
      const panZ = focus.z * 0.25; // subtle lateral tracking, stay centred-ish
      this._desiredPos.set(teamSign * back, C.endlineHeight, panZ);
      // Look toward the far goal so the view points up the length of the pool.
      this._desiredLook.set(-teamSign * POOL.length * 0.25, 0, panZ);
    } else {
      this._desiredLook.copy(f).add(lead);

      // Per-mode camera offset from the look target.
      const offset = new THREE.Vector3();
      if (this.mode === 'broadcast') {
        offset.set(-C.distance * 0.35, C.height, C.distance);
      } else if (this.mode === 'side') {
        offset.set(0, C.height * 0.55, C.distance * 1.05);
      } else {
        // dynamic: trail behind the focus's movement direction.
        const dir = new THREE.Vector3(vel.x, 0, vel.z);
        if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
        dir.normalize();
        offset.copy(dir).multiplyScalar(-C.distance).add(new THREE.Vector3(0, C.height, 0));
      }
      this._desiredPos.copy(f).addScaledVector(lead, 0.5).add(offset);
    }

    if (!this._initialized) {
      this._pos.copy(this._desiredPos);
      this._look.copy(this._desiredLook);
      this._initialized = true;
    }

    // Critically-damped smoothing: alpha = 1 - e^(-k*dt).
    const ap = 1 - Math.exp(-C.posDamp * dt);
    const al = 1 - Math.exp(-C.lookDamp * dt);
    this._pos.lerp(this._desiredPos, ap);
    this._look.lerp(this._desiredLook, al);

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
  }
}
