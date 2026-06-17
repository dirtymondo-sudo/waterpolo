// poolView.js — the static environment: basin floor (with caustics), walls,
// deck, goal frames + nets, and the 2m / 5m field markings.
//
// Everything is built once and added to the scene; it never reads sim state.

import * as THREE from 'three';
import { POOL } from '../../config/rules.js';

const DEPTH = 2.4; // metres from the surface (y=0) down to the basin floor

// --- Animated caustic floor shader (cheap, no textures) ---
const floorVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const floorFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uBase;
  varying vec3 vWorld;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  void main(){
    vec2 p = vWorld.xz * 0.6;
    float c = 0.0;
    c += noise(p + uTime*0.20);
    c += noise(p*1.9 - uTime*0.15);
    c = smoothstep(0.85, 1.6, c);
    vec3 col = uBase + vec3(0.18,0.30,0.34) * c;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeGoal(team, length, color) {
  // A goal frame straddling the goal line, opening toward the pool.
  const group = new THREE.Group();
  const w = POOL.goalWidth;
  const h = POOL.goalHeight;
  const r = 0.06;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

  const post = (x, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
    m.position.set(x, h / 2, z);
    return m;
  };
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), mat);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position.set(0, h, 0);

  group.add(post(0, -w / 2), post(0, w / 2), crossbar);

  // Net: a translucent plane behind the mouth + back, tinted by team colour.
  const netMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), netMat);
  back.rotation.y = Math.PI / 2;
  const dir = team === 0 ? -1 : 1; // net trails outward, away from the field
  back.position.set(dir * 0.7, h / 2, 0);
  group.add(back);

  group.position.x = (team === 0 ? -1 : 1) * (length / 2);
  if (team === 1) group.rotation.y = Math.PI;
  return group;
}

function makeLine(x, width, color) {
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, width),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  );
  g.rotation.x = -Math.PI / 2;
  g.position.set(x, -DEPTH + 0.02, 0);
  return g;
}

export function createPoolView() {
  const group = new THREE.Group();
  const L = POOL.length;
  const W = POOL.width;
  const M = POOL.margin;

  // --- Basin floor with animated caustics ---
  const floorUniforms = { uTime: { value: 0 }, uBase: { value: new THREE.Color(0x0e5a7a) } };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W, 1, 1),
    new THREE.ShaderMaterial({ vertexShader: floorVert, fragmentShader: floorFrag, uniforms: floorUniforms })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -DEPTH;
  group.add(floor);

  // --- Basin walls (inner sides of the pool) ---
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c6f93, roughness: 0.9, side: THREE.DoubleSide });
  const wallH = DEPTH + 0.3;
  const wallY = -DEPTH + wallH / 2;
  const addWall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), wallMat);
    m.position.set(x, wallY, z);
    m.rotation.y = ry;
    group.add(m);
  };
  addWall(L, 0, -W / 2, 0);
  addWall(L, 0, W / 2, Math.PI);
  addWall(W, -L / 2, 0, Math.PI / 2);
  addWall(W, L / 2, 0, -Math.PI / 2);

  // --- Deck: a coping frame AROUND the pool (never over the water) ---
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xc7ced4, roughness: 1.0 });
  const deckY = 0.06; // sits just above the waterline like real pool coping
  const addDeck = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), deckMat);
    m.position.set(x, deckY - 0.06, z);
    group.add(m);
  };
  addDeck(L + M * 2, M, 0, -(W / 2 + M / 2)); // far side
  addDeck(L + M * 2, M, 0, W / 2 + M / 2); // near side
  addDeck(M, W, -(L / 2 + M / 2), 0); // left end
  addDeck(M, W, L / 2 + M / 2, 0); // right end

  // --- Field markings: 2m (red) and 5m (yellow) from each goal line ---
  group.add(
    makeLine(-L / 2 + POOL.twoMeter, W, 0xff5555),
    makeLine(L / 2 - POOL.twoMeter, W, 0xff5555),
    makeLine(-L / 2 + POOL.fiveMeter, W, 0xffdd55),
    makeLine(L / 2 - POOL.fiveMeter, W, 0xffdd55),
    makeLine(0, W, 0xffffff) // halfway line
  );

  // --- Goals (team 0 defends -X, team 1 defends +X) ---
  group.add(makeGoal(0, L, 0x4488ff), makeGoal(1, L, 0xff6644));

  return {
    group,
    update(dt) {
      floorUniforms.uTime.value += dt;
    },
  };
}
