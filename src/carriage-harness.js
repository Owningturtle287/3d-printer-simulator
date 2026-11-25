import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V, box, cy, group, metal, ebon, rubber, steel } from './model-parts.js';

const LINK_RADIUS = 16.2;
const FIXED_X = -130;
const STRAIGHT_LENGTH = 267;
const LOWER_Y = 17.5;
const RETURN_LENGTH = Math.PI * LINK_RADIUS;
export const CHAIN_LENGTH = STRAIGHT_LENGTH + RETURN_LENGTH;
const LINK_COUNT = 56;
const BELT_PITCH = 2;
const LINK_Z = -20;

function sectionLength(x) { return (STRAIGHT_LENGTH + FIXED_X - x) / 2; }

export function dragChainPose(headX, distance) {
  if (distance >= CHAIN_LENGTH) return { x: FIXED_X, y: LOWER_Y + 2 * LINK_RADIUS, angle: Math.PI };
  const outbound = sectionLength(headX), bend = headX + outbound;
  if (distance <= outbound) return { x: headX + distance, y: LOWER_Y, angle: 0 };
  const along = distance - outbound;
  if (along < RETURN_LENGTH) {
    const a = along / LINK_RADIUS;
    return { x: bend + LINK_RADIUS * Math.sin(a), y: LOWER_Y + LINK_RADIUS * (1 - Math.cos(a)), angle: a };
  }
  return { x: bend - (along - RETURN_LENGTH), y: LOWER_Y + 2 * LINK_RADIUS, angle: Math.PI };
}

export function makeTimingBelt(parent, length, x, y, z, alongY = false) {
  const pitch = BELT_PITCH, count = Math.floor((length - 5) / pitch);
  const fixture = group(parent, x, y, z);
  if (alongY) fixture.rotation.y = Math.PI / 2;
  box(fixture, length, 5.2, 1.34, 0, 0, -.18, rubber, .21);
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 5.0, .85),
    metal(0x26282a, .76, .07), count);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) teeth.setMatrixAt(i, matrix.makeTranslation(i * pitch - (count - 1) * pitch / 2, 0, .78));
  teeth.receiveShadow = true;
  fixture.add(teeth);
  return { teeth, move: distance => { teeth.position.x = ((distance % pitch) + pitch) % pitch; } };
}

export function makeBeltPulley(parent, x, y, z) {
  const pulley = group(parent, x, y, z);
  cy(pulley, 8.0, 8.0, 5.5, 0, 0, 0, ebon, 'y', 24);
  for (const edge of [-1, 1]) cy(pulley, 9.0, 9.0, .85, 0, edge * 3.0, 0, steel, 'y', 28);
  cy(pulley, 3.0, 3.0, 8, 0, 0, 0, steel, 'y', 18);
  box(pulley, .8, .22, 5.8, 0, 4.12, 0, rubber, .15);
  return pulley;
}

function linkGeometry() {
  const width = CHAIN_LENGTH / LINK_COUNT;
  const pieces = [];
  for (const side of [-1, 1]) {
    const plate = new THREE.BoxGeometry(width - .35, 4.15, 1.75);
    plate.translate(0, 0, side * 6.3);
    pieces.push(plate);
    const lug = new THREE.CylinderGeometry(1.7, 1.7, 2.0, 9);
    lug.rotateX(Math.PI / 2);
    lug.translate(width * .39, 0, side * 6.7);
    pieces.push(lug);
  }
  const crossbar = new THREE.BoxGeometry(width * .43, 1.25, 12.1);
  crossbar.translate(-width * .09, -1.38, 0);
  pieces.push(crossbar);
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
}

function liveTube(parent, material, radius, rows = 36, sides = 10) {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array((rows + 1) * (sides + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(new Float32Array(position.array.length), 3).setUsage(THREE.DynamicDrawUsage);
  const indices = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, a+1, b, b, a+1, b+1);
  }
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = !material.transparent;
  parent.add(mesh);
  const p = V(0, 0, 0), tangent = V(0, 0, 0), normalAxis = V(0, 0, 0), binormal = V(0, 0, 0);
  const aim = V(0, 0, 1);
  const circle = Array.from({length: sides + 1}, (_, j) => [Math.cos(2 * Math.PI * j / sides), Math.sin(2 * Math.PI * j / sides)]);
  function draw(pointAt, tangentAt) {
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      pointAt(t, p);
      tangentAt(t, tangent);
      normalAxis.crossVectors(aim, tangent).normalize();
      if (normalAxis.lengthSq() < 0.001) normalAxis.set(1, 0, 0);
      binormal.crossVectors(tangent, normalAxis).normalize();
      for (let j = 0; j <= sides; j++) {
        const [cos, sin] = circle[j];
        const x = normalAxis.x * cos + binormal.x * sin;
        const y = normalAxis.y * cos + binormal.y * sin;
        const z = normalAxis.z * cos + binormal.z * sin;
        const index = i * (sides + 1) + j;
        position.setXYZ(index, p.x + x * radius, p.y + y * radius, p.z + z * radius);
        normal.setXYZ(index, x, y, z);
      }
    }
    position.needsUpdate = normal.needsUpdate = true;
  }
  return { draw, curve: c => draw((t,p) => c.getPoint(t,p), (t,v) => c.getTangent(t,v)) };
}

export function makeCarriageHarness(scene, gantry, hardware, stationaryCurves) {
  const links = new THREE.InstancedMesh(linkGeometry(), metal(0x25292a, .63, .15), LINK_COUNT);
  links.castShadow = links.receiveShadow = true;
  links.frustumCulled = false;
  gantry.add(links);
  box(gantry, 12, 5.4, 17, FIXED_X, LOWER_Y + 2 * LINK_RADIUS, LINK_Z, steel, 1.1);
  const lead = group(hardware.root, -1.2, LOWER_Y + 9, LINK_Z);
  box(lead, 10.1, 4.9, 15.8, 0, 0, 0, ebon, .90);
  cy(lead, 1.9, 1.9, 19, 0, 0, 0, steel, 'z', 14);
  const wire = liveTube(gantry, metal(0xe3aa2a,.52,.07), 1.65, 65, 7);
  const umbilical = liveTube(scene, rubber, 2.12, 22, 7);
  const tubes = stationaryCurves.map((sections, i) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: i === 0 ? 0xb9d0de : 0xe0e6e2, roughness: .28, metalness: .05, clearcoat: .45,
      transparent: true, opacity: .74, depthWrite: false,
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(92 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xd7ac79, transparent: true, opacity: .86 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    return { sections, inlet: hardware.inlets[i], line, tube: liveTube(scene, material, 2.15, 32, 10) };
  });
  return { links, wire, umbilical, tubes, headY: hardware.root.position.y, matrix: new THREE.Matrix4(), lastX: NaN, lastZ: NaN };
}

export function animateCarriageHarness(harness, headX, headZ, gantryY, state, quality) {
  const threshold = quality === 'low' ? 0.85 : .23;
  const moveX = Number.isNaN(harness.lastX) || Math.abs(headX - harness.lastX) >= threshold;
  const moveZ = Number.isNaN(harness.lastZ) || Math.abs(headZ - harness.lastZ) >= threshold;
  if (moveX) {
    for (let i = 0; i < LINK_COUNT; i++) {
      const dist = (i + .5) * CHAIN_LENGTH / LINK_COUNT;
      const pose = dragChainPose(headX, dist);
      harness.matrix.makeRotationZ(pose.angle).setPosition(pose.x, pose.y, LINK_Z);
      harness.links.setMatrixAt(i, harness.matrix);
    }
    harness.links.instanceMatrix.needsUpdate = true;
    harness.wire.draw((t,p) => {
      const pose = dragChainPose(headX, t * CHAIN_LENGTH);
      p.set(pose.x, pose.y, LINK_Z + 4.4);
    }, (t,v) => {
      const { angle } = dragChainPose(headX, t * CHAIN_LENGTH);
      v.set(Math.cos(angle), Math.sin(angle), 0);
    });
    harness.lastX = headX;
  }
  if (moveZ) {
    harness.umbilical.curve(new THREE.CatmullRomCurve3([V(-150, 449, -166), V(-145, 458, -150),
      V(-141, 457, (headZ - 168) * .5), V(FIXED_X, gantryY + LOWER_Y + LINK_RADIUS * 2, headZ + LINK_Z)]));
    harness.lastZ = headZ;
  }
  for (const [i, route] of harness.tubes.entries()) {
    if (moveX || moveZ || !route.flex) {
      const start = route.sections.at(-1).geometryEnd;
      const inlet = route.inlet.clone().add(V(headX, gantryY + harness.headY, headZ));
      const bend = headX + sectionLength(headX);
      route.flex = new THREE.CatmullRomCurve3([start, V(-139 + i*10, 455 + i*4, -151),
        V(-103 + i*13, 456 + i*4, headZ - 38), V(bend - 18 + i*7, 457 + i*3, headZ - 22),
        V(inlet.x + 12 + 2*i, 447 + i*5, inlet.z - 7), V(inlet.x + .9, inlet.y + 10, inlet.z), inlet],
        false, 'centripetal');
      route.tube.curve(route.flex);
      route.curves = [...route.sections.map(s => s.curve), route.flex];
      route.lengths = route.curves.map(c => c.getLength());
      route.total = route.lengths.reduce((a,b) => a+b, 0);
    }
    const feed = state.feed?.nozzle === i ? state.feed : null;
    const slot = feed?.slot ?? state.loaded[i];
    const extent = feed?.fraction ?? (slot === null ? 0 : 1);
    route.line.visible = extent > 0;
    if (!route.line.visible || (!moveX && !moveZ && route.slot === slot && route.extent === extent &&
        route.color === state.spools[slot].color)) continue;
    route.slot = slot; route.extent = extent; route.color = state.spools[slot].color;
    route.line.material.color.set(route.color);
    const attr = route.line.geometry.attributes.position;
    for (let j = 0; j < attr.count; j++) {
      let distance = route.total * extent * j / (attr.count - 1), k = 0;
      while (k < route.lengths.length-1 && distance > route.lengths[k]) distance -= route.lengths[k++];
      const p = route.curves[k].getPointAt(Math.min(1, distance / route.lengths[k]));
      attr.setXYZ(j, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
  }
}
