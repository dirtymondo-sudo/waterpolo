// renderer.js — the Three.js VIEW of the simulation.
//
// It owns the scene, camera, water, pool, and per-player views. It NEVER mutates
// sim state and contains NO game logic. Each frame it interpolates between the
// last two authoritative sim states (entity interpolation) and draws the result,
// exactly as the multiplayer client will when snapshots arrive over the wire.

import * as THREE from 'three';
import { TUNABLES } from '../config/tunables.js';
import { POOL } from '../config/rules.js';
import { addLighting } from './lighting.js';
import { createWater } from './water/water.js';
import { createPoolView } from './entities/poolView.js';
import { createPlayerView } from './entities/playerView.js';
import { createBallView } from './entities/ballView.js';
import { CameraRig } from './cameraRig.js';

function makeSky() {
  // Simple vertical gradient dome for a pleasant sky + water reflection.
  const geo = new THREE.SphereGeometry(300, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f8fd6) },
      bottom: { value: new THREE.Color(0xd8eeff) },
    },
    vertexShader: /* glsl */ `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vY;
      uniform vec3 top; uniform vec3 bottom;
      void main() {
        float t = clamp(vY * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      TUNABLES.camera.fov,
      window.innerWidth / window.innerHeight,
      TUNABLES.camera.near,
      TUNABLES.camera.far
    );

    this.scene.add(makeSky());
    addLighting(this.scene);

    this.pool = createPoolView();
    this.scene.add(this.pool.group);

    // Water fills the field of play, aligned exactly over the basin.
    this.water = createWater(POOL.width, POOL.length);
    this.scene.add(this.water.mesh);

    this.ballView = createBallView();
    this.scene.add(this.ballView.group);

    this.rig = new CameraRig(this.camera);
    this.playerViews = new Map(); // playerId -> view

    window.addEventListener('resize', () => this._onResize());
  }

  // Create/destroy player views to match the sim's roster.
  syncEntities(state) {
    for (const p of state.players) {
      if (!this.playerViews.has(p.id)) {
        const view = createPlayerView(p.team, p.controlled);
        this.playerViews.set(p.id, view);
        this.scene.add(view.group);
      }
    }
  }

  // Render an interpolated frame. prev/curr are sim states; alpha in [0,1].
  render(prev, curr, alpha, dt) {
    let focus = { x: 0, z: 0 };
    let focusVel = { x: 0, z: 0 };

    for (const p of curr.players) {
      const view = this.playerViews.get(p.id);
      if (!view) continue;
      const p0 = prev.players.find((q) => q.id === p.id) || p;

      const x = lerp(p0.x, p.x, alpha);
      const z = lerp(p0.z, p.z, alpha);
      const heading = lerpAngle(p0.heading, p.heading, alpha);
      const chargeFrac = p.charge / TUNABLES.shot.chargeTime;
      view.setPose(x, z, heading, p.speed, dt, p.controlled, chargeFrac, p.chargeType);

      if (p.controlled) {
        focus = { x, z };
        focusVel = { x: p.vx, z: p.vz };
      }
    }

    // Ball (interpolated in all three axes; y is height for lobs/skips).
    const b0 = prev.ball || curr.ball;
    const b = curr.ball;
    this.ballView.setPose(
      lerp(b0.x, b.x, alpha),
      lerp(b0.y, b.y, alpha),
      lerp(b0.z, b.z, alpha),
      dt
    );

    this.rig.update(focus, focusVel, dt);
    this.water.update(dt, this.camera);
    this.pool.update(dt);

    this.renderer.render(this.scene, this.camera);
  }

  cycleCamera() {
    this.rig.cycle();
  }

  // Planar (XZ) forward/right basis of the camera, for camera-relative input.
  // forward = where the camera looks (projected onto the water); right = screen
  // right. So "W/up" always swims away from the camera regardless of cam mode.
  planarBasis() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    return {
      forward: { x: dir.x, z: dir.z },
      right: { x: -dir.z, z: dir.x },
    };
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
