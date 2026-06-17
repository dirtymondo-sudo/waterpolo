// water.js — the showcase surface.
//
// A self-contained ShaderMaterial (no external textures, so it runs offline):
//   - gentle summed Gerstner waves displace a subdivided plane
//   - per-fragment normals are derived analytically from those waves
//   - Fresnel mixes a refracted (depth-darkened) colour with a reflected sky
//   - a Blinn-Phong sun highlight gives the water sparkle
//   - a scrolling caustic-ish shimmer adds life
//
// This is the "good enough" water for Milestone 0; the plan upgrades it to true
// planar reflection/refraction + screen-space foam in Milestone 4. The uniform
// names are chosen so that upgrade is additive.

import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  // Three gentle Gerstner waves: vec4(dirX, dirZ, amplitude, wavelength).
  const vec4 W0 = vec4( 1.0,  0.35, 0.045, 7.0);
  const vec4 W1 = vec4(-0.6,  1.0,  0.030, 4.5);
  const vec4 W2 = vec4( 0.2, -1.0,  0.018, 2.6);

  vec3 gerstner(vec4 w, vec2 p, inout vec3 tangent, inout vec3 binormal) {
    vec2 dir = normalize(w.xy);
    float amp = w.z;
    float len = w.w;
    float k = 6.2831853 / len;
    float speed = sqrt(9.8 / k);          // deep-water dispersion
    float f = k * dot(dir, p) + uTime * speed;
    float a = amp;
    float steep = 0.6;                     // Q steepness, kept < 1 to avoid loops
    float q = steep / (k * a + 1e-4);
    q = min(q, 1.0);

    float c = cos(f);
    float s = sin(f);

    // Partial derivatives for the analytic normal.
    tangent  += vec3(-q * dir.x * dir.x * k * a * s,
                      dir.x * k * a * c,
                     -q * dir.x * dir.y * k * a * s);
    binormal += vec3(-q * dir.x * dir.y * k * a * s,
                      dir.y * k * a * c,
                     -q * dir.y * dir.y * k * a * s);

    return vec3(q * dir.x * a * c, a * s, q * dir.y * a * c);
  }

  void main() {
    vec3 p = position;                      // plane is in its local XY, rotated to XZ by the mesh
    vec2 xz = p.xy;
    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);

    vec3 disp = vec3(0.0);
    disp += gerstner(W0, xz, tangent, binormal);
    disp += gerstner(W1, xz, tangent, binormal);
    disp += gerstner(W2, xz, tangent, binormal);

    // Build displaced position in plane-local space, then to world.
    vec3 displaced = vec3(xz.x + disp.x, disp.y, xz.y + disp.z);
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = world.xyz;

    vec3 n = normalize(cross(binormal, tangent));
    vNormal = normalize(mat3(modelMatrix) * n);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uCameraPos;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  // Cheap value-noise for the caustic shimmer.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);

    // Fresnel: more reflective at grazing angles.
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

    // Reflected sky colour by reflected ray height.
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uHorizonColor, uSkyColor, clamp(R.y * 0.5 + 0.5, 0.0, 1.0));

    // Refraction approximation: depth darkening using the wave normal tilt.
    float depthMix = clamp(0.5 + N.y * 0.5, 0.0, 1.0);
    vec3 refr = mix(uDeepColor, uShallowColor, depthMix * 0.6 + 0.2);

    // Caustic shimmer scrolling across the surface.
    vec2 cuv = vWorldPos.xz * 0.35;
    float caus = noise(cuv + uTime * 0.25) * noise(cuv * 1.7 - uTime * 0.18);
    refr += vec3(0.05, 0.09, 0.10) * smoothstep(0.55, 1.0, caus);

    vec3 col = mix(refr, sky, fres);

    // Blinn-Phong sun specular for sparkle.
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    col += vec3(1.0, 0.98, 0.92) * spec * 0.9;

    gl_FragColor = vec4(col, 0.93);
  }
`;

export function createWater(width, length) {
  // Geometry built in local XY; the mesh is rotated -90° about X so XY -> XZ.
  const geo = new THREE.PlaneGeometry(
    length, width,
    Math.ceil(length * 6), Math.ceil(width * 6)
  );

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    uDeepColor: { value: new THREE.Color(0x0a3a5c) },
    uShallowColor: { value: new THREE.Color(0x1f86b4) },
    uSkyColor: { value: new THREE.Color(0x9fd0ff) },
    uHorizonColor: { value: new THREE.Color(0xd8eeff) },
    uCameraPos: { value: new THREE.Vector3() },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;

  return {
    mesh,
    update(dt, camera) {
      uniforms.uTime.value += dt;
      uniforms.uCameraPos.value.copy(camera.position);
    },
  };
}
