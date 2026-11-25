import * as THREE from 'three';
import { cy, group, hexScrew, metal, outline, profiled, ring, roundOpening, ebon, rubber } from './model-parts.js';

const rotorMaterial = metal(0x353a3b, 0.46, 0.14);
const rotorEdge = metal(0x4d5252, 0.38, 0.25);
const frameMaterial = metal(0x242729, 0.66, 0.08);
const blowerWheel = metal(0x151719, .68, .04);
const blowerVanes = metal(0x212325, .52, .11);
const blowerCap = metal(0x232526, .62, .07);
const TAU = Math.PI * 2;

function repeatedBlades(parent, geometry, blades, material) {
  const wheel = new THREE.InstancedMesh(geometry, material, blades);
  const transform = new THREE.Matrix4();
  for (let i = 0; i < blades; i++) wheel.setMatrixAt(i, transform.makeRotationZ(TAU * i / blades));
  wheel.castShadow = true;
  wheel.receiveShadow = true;
  parent.add(wheel);
}

function axialBlade(radius) {
  // Two surfaces form a molded, pitched blade with a curved leading edge.
  const span = 9, chord = 6, sideSize = (span + 1) * (chord + 1);
  const vertices = [], indices = [];
  const face = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  const vertex = (i, j, side) => side * sideSize + i * (chord + 1) + j;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= span; i++) {
      const t = i / span, r = radius * (0.30 + 0.665 * t);
      const sweep = 0.48 * t ** 1.65;
      for (let j = 0; j <= chord; j++) {
        const c = j / chord;
        const angle = sweep + (c - 0.5) * (0.86 - 0.33 * t);
        const thickness = side * radius * (0.008 + 0.006 * Math.sin(Math.PI * c));
        const height = radius * (0.048 * (1 - t) + (0.51 - c) * (0.21 - 0.105 * t)
          + 0.045 * Math.sin(Math.PI * c)) + thickness;
        vertices.push(r * Math.cos(angle), r * Math.sin(angle), height);
      }
    }
  }
  for (let i = 0; i < span; i++) for (let j = 0; j < chord; j++) {
    const a = vertex(i, j, 0), b = vertex(i + 1, j, 0), c = vertex(i + 1, j + 1, 0), d = vertex(i, j + 1, 0);
    face(d, c, b, a);
    face(a + sideSize, b + sideSize, c + sideSize, d + sideSize);
  }
  for (let i = 0; i < span; i++) {
    const a = vertex(i, 0, 0), b = vertex(i + 1, 0, 0);
    face(a, b, b + sideSize, a + sideSize);
    const c = vertex(i, chord, 0), d = vertex(i + 1, chord, 0);
    face(d, c, c + sideSize, d + sideSize);
  }
  for (let j = 0; j < chord; j++) {
    const a = vertex(span, j, 0), b = vertex(span, j + 1, 0);
    face(a, b, b + sideSize, a + sideSize);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeAxialFan(parent, radius, x, y, z, { angle = 0, blades = 7, housing = true, back = true } = {}) {
  const shroud = group(parent, x, y, z);
  shroud.rotation.y = angle;
  const rim = radius * 1.035, e = radius * 1.18, corner = radius * 0.18;
  const depth = radius * 0.19;
  if (housing) {
    const face = outline([[-e, -e + corner], [-e + corner, -e], [e - corner, -e], [e, -e + corner],
      [e, e - corner], [e - corner, e], [-e + corner, e], [-e, e - corner]]);
    roundOpening(face, 0, 0, rim);
    const mounting = e * 0.83;
    for (const xx of [-mounting, mounting]) for (const yy of [-mounting, mounting]) {
      roundOpening(face, xx, yy, radius * 0.085);
      hexScrew(shroud, xx, yy, depth * 0.49, radius * 0.11);
    }
    profiled(shroud, face, depth, radius * 0.018, frameMaterial, 0, 0, -depth * 0.65);
  }
  ring(shroud, [[rim, depth * 0.36], [rim + radius * .035, depth * 0.43], [rim + radius * .060, depth * 0.1],
    [rim + radius * .060, -depth * 0.62], [rim, -depth * 0.52], [rim, depth * .36]], rotorEdge);
  if (back) cy(shroud, rim, rim, 0.65, 0, 0, -depth * 1.1, rubber, 'z', 48);
  const rotor = group(shroud, 0, 0, -depth * 0.10);
  repeatedBlades(rotor, axialBlade(radius), blades, rotorMaterial);
  cy(rotor, radius * 0.337, radius * .35, depth * 0.58, 0, 0, depth * 0.26, rotorMaterial, 'z', 42);
  cy(rotor, radius * .285, radius * .306, depth * .15, 0, 0, depth * .59, rotorEdge, 'z', 42);
  cy(rotor, radius * .05, radius * .05, 0.3, 0, 0, depth * .68, ebon, 'z', 14);
  return { shroud, rotor, rpm: 0 };
}

export function makeBlower(parent, radius, x, y, z) {
  const shroud = group(parent, x, y, z);
  cy(shroud, radius * 1.075, radius * 1.075, 1.2, 0, 0, -5.3, rubber, 'z', 56);
  ring(shroud, [[radius, -.5], [radius * 1.02, .42], [radius * 1.087, .8],
    [radius * 1.12, .1], [radius * 1.1, -2.3], [radius, -2.4], [radius, -.5]], frameMaterial);
  const rotor = group(shroud, 0, 0, -.75);
  cy(rotor, radius * .985, radius * .985, .7, 0, 0, -3.95, blowerWheel, 'z', 56);
  const blade = new THREE.Shape();
  blade.moveTo(radius * .63, -radius * .02);
  blade.quadraticCurveTo(radius * .82, radius * .03, radius * .965, radius * .11);
  blade.lineTo(radius * .965, radius * .15);
  blade.quadraticCurveTo(radius * .80, radius * .067, radius * .63, radius * .01);
  blade.closePath();
  const vanes = new THREE.ExtrudeGeometry(blade, { depth: 3.8, bevelEnabled: false, curveSegments: 5 });
  vanes.translate(0, 0, -3.9);
  repeatedBlades(rotor, vanes, 41, blowerVanes);
  cy(rotor, radius * .646, radius * .675, 3.45, 0, 0, -1.2, blowerWheel, 'z', 52);
  cy(rotor, radius * .598, radius * .632, .68, 0, 0, .74, blowerCap, 'z', 52);
  ring(rotor, [[radius * .47, 1.08], [radius * .462, .98], [radius * .45, 1.08]], blowerWheel);
  cy(rotor, .9, 1.0, .19, 0, 0, 1.19, frameMaterial, 'z', 14);
  return { shroud, rotor, rpm: 0 };
}

export function animateFan(fan, target, dt) {
  fan.rpm = THREE.MathUtils.damp(fan.rpm, target, target > fan.rpm ? 5.6 : 3.8, dt);
  if (fan.rpm < 1 && target === 0) fan.rpm = 0;
  fan.rotor.rotation.z = (fan.rotor.rotation.z + fan.rpm * TAU / 60 * dt) % TAU;
}
