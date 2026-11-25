import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { X2D } from './spec.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const metal = (color, roughness = 0.53, metalness = 0.45) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const plastic = metal(0x242a2f, 0.6, 0.12);
const body = metal(0x42474c, 0.48, 0.48);
const edge = metal(0x262a2d, 0.6, 0.18);
const rubber = metal(0x0b0e10, 0.85, 0.05);
const ebon = metal(0x14181b, 0.51, 0.18);
const steel = metal(0xa3acb1, 0.34, 0.86);
const zinc = metal(0x757b7a, 0.48, 0.75);
const amber = metal(0xe8ad50, 0.37, 0.56);
const gasket = metal(0x121419, 0.72, 0.05);
const glass = new THREE.MeshPhysicalMaterial({ color: 0x718083, metalness: 0.29, roughness: 0.11, clearcoat: 0.85,
  transparent: true, opacity: 0.33, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.7 });
const tinted = glass.clone(); tinted.color.set(0x5e6565); tinted.opacity = 0.37;
const tubeMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb9c7ca, transparent: true, opacity: 0.48,
  depthWrite: false, roughness: 0.31, metalness: 0.12 });
const lens = new THREE.MeshPhysicalMaterial({color: 0x172c41, roughness: 0.1, metalness: 0.7, clearcoat: 1});
const boxCache = new Map();
const cylinderCache = new Map();

function add(parent, geometry, mat, x, y, z) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = !mat.transparent;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function box(parent, w, h, d, x, y, z, mat, radius = 0) {
  const key = [w, h, d, radius].join(':');
  if (!boxCache.has(key)) boxCache.set(key, radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d));
  return add(parent, boxCache.get(key), mat, x, y, z);
}
function cy(parent, top, bottom, h, x, y, z, mat, axis = 'y', segments = 28) {
  const key = [top, bottom, h, segments].join(':');
  if (!cylinderCache.has(key)) cylinderCache.set(key, new THREE.CylinderGeometry(top, bottom, h, segments));
  const mesh = add(parent, cylinderCache.get(key), mat, x, y, z);
  if (axis === 'x') mesh.rotation.z = -Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}
function group(parent, x = 0, y = 0, z = 0) {
  const node = new THREE.Group();
  node.position.set(x, y, z);
  parent.add(node);
  return node;
}
function mark(node, action) { node.userData.action = action; return node; }

function grain(pepper = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(256, 256);
  let seed = 991;
  const rnd = () => { seed = Math.imul(1664525, seed) + 1013904223 | 0; return (seed >>> 0) / 2 ** 32; };
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 205 + Math.floor(rnd() * 47) - (pepper && rnd() > 0.96 ? 62 : 0);
    pixels.data.set([value, value, value, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3); texture.anisotropy = 4;
  return texture;
}
function label(parent, text, width, height, x, y, z, options = {}) {
  const { color = '#c5cbcc', size = 32, side = 'front', weight = 600, background, align = 'center' } = options;
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = Math.ceil(768 * height / width);
  const ctx = canvas.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = align;
  ctx.font = `${weight} ${Math.round(size * canvas.height / 48)}px Arial, sans-serif`;
  ctx.fillText(text, align === 'left' ? 20 : canvas.width / 2, canvas.height / 2, canvas.width - 20);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = add(parent, new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }), x, y, z);
  if (side === 'rear') mesh.rotation.y = Math.PI;
  if (side === 'right') mesh.rotation.y = Math.PI / 2;
  if (side === 'left') mesh.rotation.y = -Math.PI / 2;
  if (side === 'top') mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = false;
  return mesh;
}
function screw(parent, x, y, z, face = 'z') {
  const holder = group(parent, x, y, z);
  if (face === 'rear') holder.rotation.y = Math.PI;
  if (face === 'right') holder.rotation.y = Math.PI / 2;
  if (face === 'left') holder.rotation.y = -Math.PI / 2;
  const mesh = cy(holder, 2.6, 2.6, 1.3, 0, 0, 0, zinc, 'z', 10);
  mesh.castShadow = false;
  box(holder, 2.5, 0.55, 0.2, 0, 0, 0.7, ebon).rotation.z = 0.7;
}
function tube(parent, points, radius, mat = tubeMaterial, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = add(parent, new THREE.TubeGeometry(curve, segments, radius, 8, false), mat, 0, 0, 0);
  return { mesh, curve };
}
function fan(parent, radius, x, y, z, face = 'front', grilles = true) {
  const outer = group(parent, x, y, z);
  if (face === 'rear') outer.rotation.y = Math.PI;
  if (face === 'right') outer.rotation.y = Math.PI / 2;
  if (face === 'left') outer.rotation.y = -Math.PI / 2;
  cy(outer, radius + 3, radius + 3, 5, 0, 0, 0, rubber, 'z');
  const blades = group(outer, 0, 0, 3);
  for (let i = 0; i < 9; i++) {
    const blade = group(blades);
    blade.rotation.z = i * Math.PI * 2 / 9;
    box(blade, radius * 0.54, radius * 0.33, 1.4, radius * 0.52, 0, 0, zinc, 1.9).rotation.z = 0.48;
  }
  cy(outer, radius * 0.28, radius * 0.29, 5, 0, 0, 5, plastic, 'z');
  for (const k of grilles ? [0.52, 0.72, 0.89, 1.02] : [0.95, 1.07]) {
    add(outer, new THREE.TorusGeometry(radius * k, 0.75, 6, 44), edge, 0, 0, 7);
  }
  return blades;
}

export function makePrinter(scene) {
  const root = group(scene), exterior = group(root);
  const shell = body.clone();
  shell.map = grain();
  shell.bumpMap = shell.map; shell.bumpScale = 0.19;
  const pei = metal(0x30261d, 0.85, 0.33);
  pei.map = grain(true); pei.bumpMap = pei.map; pei.bumpScale = 0.23;

  // Front is +Z. The chassis outer envelope is 392 × 406 × 478 mm.
  const [width, depth] = X2D.chassis;
  box(exterior, width, 33, depth, 0, 24.5, 0, shell, 8);
  box(exterior, 363, 5, 382, 0, 40, -1, rubber, 2);
  // Leave the chamber open between structural uprights.
  for (const side of [-1, 1]) {
    box(exterior, 24, 380, 26, side * 184, 223, 188, shell, 7);
    box(exterior, 24, 380, 24, side * 184, 223, -188, shell, 7);
    box(exterior, 6, 374, 19, side * 171, 225, 180, gasket, 2);
    box(root, 5, 372, 24, side * 167, 228, -172, zinc, 2);
    for (const front of [-1, 1]) {
      box(root, 47, 10, 38, side * 158, 6, front * 164, rubber, 4);
      box(root, 38, 3, 32, side * 158, 1.5, front * 164, rubber, 3);
    }
  }
  // The upper structure is frame and glass rather than a solid opaque roof.
  for (const front of [-1, 1]) box(exterior, width, 64, 29, 0, 445, front * 188.5, shell, 7);
  for (const side of [-1, 1]) box(exterior, 26, 64, 355, side * 183, 445, 0, shell, 5);
  box(exterior, 341, 4.8, 345, 0, 473, 0, glass, 1);
  box(exterior, 353, 2.5, 1, 0, 408, 200, zinc, 0.4);
  label(exterior, 'Bambu Lab   X2D', 99, 16, 113, 452, 203.2, { color: '#141718', size: 29, weight: 800 });

  const panels = [];
  for (const side of [-1, 1]) {
    const panel = group(exterior, side * 192, 0, 0);
    panels.push(panel);
    box(panel, 8, 260, 355, 0, 171, 0, shell, 5);
    box(panel, 9, 13, 355, 0, 410, 0, shell, 3);
    for (const end of [-1, 1]) box(panel, 9, 108, 49, 0, 354, end * 153, shell, 3);
    // The side window exposes the upper rail assembly.
    for (const end of [-1, 1]) {
      box(panel, 3, 7, 261, side * 3.1, 355 + end * 51, 0, ebon, 2);
      box(panel, 3, 103, 8, side * 3.1, 355, end * 126.5, ebon, 3);
    }
    box(panel, 3, 98, 247, side * 2.5, 355, 0, tinted, 1.3);
    const edgeFace = side === 1 ? 'right' : 'left';
    label(panel, 'Bambu Lab', 61, 8, side * 4.2, 395, 0, { side: edgeFace, size: 34 });
    box(panel, 2, 9, 92, side * 4.2, 39, 0, rubber, 2);
    for (const z of [-166, 166]) for (const y of [58, 396]) screw(panel, side * 4.6, y, z, edgeFace);
  }

  box(root, 343, 363, 5, 0, 226, -188, plastic, 3);
  box(root, 327, 355, 3, 3, 222, -181, ebon, 2);
  const rear = group(exterior, 0, 0, -199);
  box(rear, 348, 375, 7, 0, 228, 0, shell, 3);
  for (const x of [-160, 160]) {
    box(rear, 1.2, 360, 0.8, x, 227, -4.1, rubber);
    for (const y of [54, 123, 195, 274, 340, 400]) screw(rear, x - (x > 0 ? 4 : -4), y, -4, 'rear');
  }
  for (const [x, y] of [[0, 66], [110, 392], [-87, 387], [-53, 279], [-48, 177]]) screw(rear, x, y, -4, 'rear');
  const rearFan = fan(rear, 43, 16, 192, -13, 'rear');
  for (const x of [-51, 83]) box(rear, 6, 103, 10, x, 198, -6, plastic, 2);
  for (const y of [145, 251]) box(rear, 139, 6, 10, 16, y, -6, plastic, 2);
  for (let i = 0; i < 14; i++) box(rear, 1.1, 88, 4, -25 + i * 6.3, 192, -26, zinc, 0.4);
  box(rear, 52, 86, 19, -67, 206, -12, plastic, 6);
  box(rear, 43, 64, 1, -67, 214, -22, rubber, 3);
  box(rear, 43, 13, 11, -67, 169, -25, ebon, 2.2);
  const perforations = new THREE.InstancedMesh(new THREE.CircleGeometry(1.31, 8), rubber, 3 * 13 * 7);
  const bore = new THREE.Object3D();
  bore.rotation.y = Math.PI;
  let boreIndex = 0;
  for (const base of [64, 155, 246]) for (let row = 0; row < 13; row++) for (let col = 0; col < 7; col++) {
    bore.position.set(-134 + col * 4.1 + (row % 2) * 0.9, base + row * 4.8, -3.65);
    bore.updateMatrix();
    perforations.setMatrixAt(boreIndex++, bore.matrix);
  }
  rear.add(perforations);
  const power = mark(group(rear, 136, 92, -8), 'power');
  box(power, 33, 52, 10, 0, 0, 0, ebon, 4);
  box(power, 21, 15, 6, 0, 11, -5, rubber, 1.3);
  box(power, 15, 9, 4, 0, 11, -9, plastic, 1.2).rotation.x = 0.18;
  const powerLight = new THREE.MeshBasicMaterial({ color: 0x83f09a });
  box(power, 3, 2, 1, 0, 14, -11.5, powerLight, 0.3);
  box(power, 23, 18, 9, 0, -13, -9, rubber, 2);
  tube(rear, [V(136, 78, -20), V(136, 63, -47), V(136, 7, -57), V(112, 4, -135), V(58, 4, -211)], 3, rubber, 28);
  const buffer = group(rear, 37, 274, -16);
  box(buffer, 98, 55, 21, 0, 0, 0, plastic, 4);
  for (const y of [-13, 10]) {
    box(buffer, 62, 9, 1, -7, y, -11, rubber, 2);
    for (let i = 0; i < 8; i++) box(buffer, 0.8, 6, 1, -37 + i * 1.9, y, -12, zinc);
    cy(buffer, 5, 5, 10, 54, y, 0, zinc, 'x');
  }
  label(buffer, 'FILAMENT BUFFER', 57, 9, 7, 19, -11.1, { side: 'rear', size: 25 });
  for (const x of [-25, -7]) box(buffer, 11, 6, 9, x, 28, 0, ebon, 1);
  const aux = group(rear, -98, 365, -14);
  box(aux, 69, 71, 23, 0, 0, 0, plastic, 4);
  box(aux, 56, 10, 1.5, 0, 31, -12, zinc, 1);
  for (const x of [-15, 9]) box(aux, 3, 35, 0.8, x, -8, -12, rubber, 1);
  label(aux, 'AUX', 29, 11, -7, 16, -12.2, { side: 'rear', size: 26 });
  for (const y of [366, 381]) {
    box(rear, 29, 10, 16, -133, y, -5, plastic, 2);
    cy(rear, 4.5, 4.5, 12, -151, y, -6, zinc, 'x');
  }
  box(rear, 31, 29, 7, 124, 355, -6, plastic, 2);
  box(rear, 17, 5, 1.8, 124, 354, -10, rubber, 1);
  box(rear, 22, 13, 8, -146, 330, -7, plastic, 2);
  label(rear, 'X2D  /  100–240 V~', 67, 13, 48, 86, -4.2, { side: 'rear', size: 25, background: '#43494a' });
  label(rear, 'CAUTION  HOT SURFACE', 66, 9, 47, 70, -4.2, { side: 'rear', size: 21, color: '#d9ad57' });

  const door = mark(group(root, -169, 42, 193), 'door');
  for (const x of [3, 335]) box(door, 9, 363, 7, x, 183, 0, edge, 3);
  for (const y of [3, 364]) box(door, 333, 8, 7, 169, y, 0, edge, 3);
  const frontGlass = box(door, 323, 352, 2.7, 169, 183, 0, glass, 1);
  frontGlass.renderOrder = 4;
  for (const y of [27, 319]) {
    box(door, 19, 23, 4, 4, y, 3.9, ebon, 1.8);
    cy(door, 3, 3, 20, -2, y, 5, zinc);
  }
  box(door, 38, 14, 11, 320, 187, 8, steel, 6);
  label(door, 'Bambu Lab', 32, 8, 320, 187, 14, { color: '#202426', size: 30 });

  const screen = mark(group(root, -113, 445, 210), 'screen');
  screen.rotation.x = -0.20;
  box(screen, 128, 78, 13, 0, 0, -1, ebon, 5);
  box(screen, 123, 73, 4, 0, 0, 5, zinc, 4);
  box(screen, 118, 68, 3, 0, 0, 7, rubber, 4);
  const display = box(screen, 112.5, 63.3, 0.4, 0, 0, 8.7, new THREE.MeshBasicMaterial({ color: 0x0d1110 }), 1.3);
  label(screen, '•', 6, 4, 55, -33, 9, { color: '#72e89a', size: 27 });

  // Z screws and guides are anchored to the chamber; the plate travels with the simulated layer height.
  for (const [x, z] of [[-149, 143], [149, 143], [0, -143]]) {
    cy(root, 4.2, 4.2, 342, x, 226, z, zinc);
    const coil = [];
    for (let i = 0; i <= 410; i++) {
      const a = i * Math.PI / 7;
      coil.push(V(x + Math.cos(a) * 4.5, 57 + i * 0.81, z + Math.sin(a) * 4.5));
    }
    tube(root, coil, 0.65, steel, 395);
    cy(root, 5, 5, 325, x + (x < 0 ? 12 : -12), 227, z, steel);
    box(root, 25, 12, 27, x, 59, z, ebon, 2);
  }
  box(root, 81, 276, 18, -111, 221, -170, plastic, 4);
  label(root, 'Bambu Lab', 56, 12, -110, 327, -159, { color: '#858e8d' });
  for (let j = 0; j < 17; j++) box(root, 52, 2.4, 2, -112, 121 + j * 9, -159.8, rubber, 0.7);
  box(root, 65, 221, 12, 109, 237, -170, plastic, 2);
  for (let i = 0; i < 16; i++) box(root, 2.5, 186, 2, 82 + i * 3.4, 238, -162.8, rubber, 0.7);
  const cam = group(root, -151, 389, 152);
  box(cam, 26, 16, 20, 0, 0, 0, plastic, 3);
  cy(cam, 5.1, 5.1, 3, 1, -1, 11, lens, 'z');
  cy(cam, 2.3, 2.3, 3.4, 1, -1, 11.2, steel, 'z');
  box(root, 35, 12, 40, -123, 392, -147, ebon, 2);
  for (let n = 0; n < 9; n++) box(root, 2, 3, 20, -134 + n * 2.5, 398, -150, zinc, 0.4);
  box(root, 26, 7, 31, 135, 397, -135, rubber, 1.5);
  box(root, 18, 5, 16, 135, 401, -135, steel, 1);

  const bed = group(root, 0, 268, 0);
  box(bed, 283, 8, 277, 0, -6, -4, zinc, 3);
  box(bed, 271, 11, 271, 0, -12, -1, plastic, 4);
  for (const x of [-134, 134]) box(bed, 16, 12, 53, x, -16, 116, ebon, 2);
  const plate = mark(group(bed), 'plate');
  box(plate, 256, 1.25, 256, 0, -0.65, 0, pei, 1);
  box(plate, 84, 1.25, 11, 33, -0.65, 130, pei, 0.6);
  label(plate, 'Bambu Textured PEI Plate', 113, 9, -61, 0.08, 119, { side: 'top', color: '#ad9571', size: 31 });
  label(plate, 'HOT SURFACE', 49, 6, 96, 0.08, 120, { side: 'top', color: '#bd9c64', size: 31 });

  for (const x of [-155, 155]) {
    cy(root, 4.2, 4.2, 312, x, 410, 0, steel, 'z');
    for (const z of [-151, 151]) {
      cy(root, 9, 9, 9, x, 411, z, zinc);
      cy(root, 3.4, 3.4, 11, x, 411, z, steel);
      box(root, 30, 20, 26, x, 397, z, plastic, 3);
    }
    for (const j of [0, 1]) box(root, 3.8, 1.6, 294, x + j * 6.5, 413 + j * 3.3, 0, rubber, 0.5);
  }

  const gantry = group(root, 0, 405, 0);
  cy(gantry, 5, 5, 311, 0, 0, 0, steel, 'x');
  cy(gantry, 4.2, 4.2, 307, 0, -12, 1, zinc, 'x');
  for (const y of [-3, 6]) box(gantry, 306, 2.2, 3.8, 0, y, -8, rubber, 0.5);
  for (const x of [-155, 155]) box(gantry, 22, 24, 35, x, -1, 0, plastic, 3);
  const head = mark(group(gantry, 0, -9, 0), 'head');
  const cover = group(head);
  box(cover, 65, 63, 42, 10.25, -14, 12, plastic, 7);
  box(cover, 59, 51, 8, 10.25, -11, 33, edge, 5);
  const headFan = fan(cover, 16.5, 9, -13, 37, 'front', false);
  for (const x of [-16, 35]) for (const y of [-30, 4]) screw(cover, x, y, 37.1);
  for (let i = 0; i < 8; i++) box(cover, 0.55, 1.1, 7, 41.9, -24 + i * 2.2, 15, rubber, 0.3);
  box(cover, 43, 6, 2, 10, -43, 33.5, ebon, 1.8);
  cy(cover, 3, 3, 2, 31, -38, 38, lens, 'z');
  const hotends = [0, X2D.rightTipOffset].map(x => {
    const node = group(head, x, -44, 0);
    box(node, 14, 13, 14, 0, 2, 0, ebon, 2);
    for (const y of [4, 7, 10, 13]) box(node, 16, 1.25, 12, 0, y, 0, zinc, 0.5);
    box(node, 9, 5, 7, 0, -4, 0, zinc, 0.6);
    cy(node, 3, 0.85, 4, 0, -7, 0, amber, 'y', 10);
    box(node, 5, 1.1, 1.1, 0, -3, 4, amber, 0.2);
    return node;
  });
  const blocker = group(head, 0, -54, -4);
  box(blocker, 12, 2, 11, 0, 0, 0, ebon, 1);
  box(blocker, 23, 2, 3, 8, 1.5, -8, zinc, 0.5);
  box(head, 18, 2.6, 9, 35, -39, -5, steel, 1);
  for (const x of [0, X2D.rightTipOffset]) cy(head, 5.5, 5.5, 8, x, 19, 0, zinc);

  const light = new THREE.SpotLight(0xe9f6f5, 13400, 550, 1.15, 0.68, 1.35);
  light.position.set(-105, 402, 155);
  light.target.position.set(15, 166, -40);
  root.add(light, light.target);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xd5f8e9 });
  box(root, 192, 3, 5, -48, 405, 146, lampMat, 1);

  const ams = mark(group(root, 0, 478, -5), 'ams');
  box(ams, 366, 11, 259, 0, 6, 0, rubber, 5);
  box(ams, 362, 71, 258, 0, 43, 0, plastic, 8);
  box(ams, 350, 30, 5, 0, 59, 130.3, ebon, 3);
  for (const x of [-176, 176]) box(ams, 5, 65, 245, x, 43, 0, edge, 2);
  label(ams, 'Bambu Lab   AMS 2 Pro', 119, 16, 101, 72, 132.7, { size: 33, color: '#e7e9df' });
  const lid = mark(group(ams, 0, 80, -121), 'lid');
  const lidPositions = [], lidIndices = [];
  for (let i = 0; i <= 44; i++) {
    const theta = Math.PI * i / 44;
    const y = 3 + 93 * Math.sin(theta), z = 121 - 121 * Math.cos(theta);
    lidPositions.push(-176, y, z, 176, y, z);
    if (i < 44) { const j = i * 2; lidIndices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const lidGeom = new THREE.BufferGeometry();
  lidGeom.setAttribute('position', new THREE.Float32BufferAttribute(lidPositions, 3));
  lidGeom.setIndex(lidIndices); lidGeom.computeVertexNormals();
  const lidShell = add(lid, lidGeom, tinted, 0, 0, 0);
  lidShell.renderOrder = 5;
  for (const x of [-176, 176]) {
    const rim = [];
    for (let i = 0; i <= 32; i++) {
      const theta = Math.PI * i / 32;
      rim.push(V(x, 3 + 93 * Math.sin(theta), 121 - 121 * Math.cos(theta)));
    }
    tube(lid, rim, 1.8, zinc, 40).mesh.renderOrder = 4;
    const end = new THREE.Shape();
    end.moveTo(0, 3);
    for (const p of rim) end.lineTo(p.z, p.y);
    end.lineTo(0, 3);
    const cap = add(lid, new THREE.ShapeGeometry(end, 16), tinted, x, 0, 0);
    cap.rotation.y = -Math.PI / 2; cap.renderOrder = 5;
  }
  for (const x of [-149, 149]) {
    cy(ams, 4.5, 4.5, 22, x, 79, -123, zinc, 'x');
    box(ams, 14, 14, 5, x, 73, 133, rubber, 2);
  }

  const spools = [];
  const ledMats = [];
  const axes = [-129, -43, 43, 129];
  for (let i = 0; i < 4; i++) {
    const x = axes[i];
    box(ams, 64, 3, 172, x, 78, -5, ebon, 2);
    box(ams, 41, 35, 34, x, 62, 114, plastic, 3);
    box(ams, 28, 10, 11, x, 71, 131, ebon, 2);
    cy(ams, 4, 4, 46, x, 85, 76, zinc, 'x');
    cy(ams, 4, 4, 46, x, 85, -66, zinc, 'x');
    cy(ams, 4.7, 4.7, 6, x, 82, 111, amber);
    label(ams, `A${i + 1}`, 17, 7, x, 54, 133.4, { size: 33 });
    const led = new THREE.MeshBasicMaterial({ color: 0x99bea9 });
    box(ams, 10, 2.2, 1, x, 63.5, 137, led, 0.4);
    ledMats.push(led);
    spools.push(makeSpool(mark(group(ams, x, 95, -3), `slot-${i}`), 75, 66));
  }

  // Rear-left mounting points as seen from behind, with the spool beside the right wall.
  const spoolMount = mark(group(root, 222, 292, -167), 'external');
  for (const y of [-77, 87]) {
    box(root, 39, 17, 17, 161, 292 + y, -209, shell, 3);
    screw(root, 153, 292 + y, -218, 'rear');
  }
  box(spoolMount, 56, 17, 19, -20, -1, -45, plastic, 3);
  box(spoolMount, 15, 31, 17, -15, -9, -34, plastic, 3);
  cy(spoolMount, 18, 18, 99, 6, 0, 0, ebon, 'x');
  spools.push(makeSpool(mark(group(spoolMount, 20, 0, 0), 'slot-4'), 91, 64));

  const mainFeed = [V(0, 553, -129), V(70, 552, -168), V(111, 479, -229), V(119, 300, -249), V(91, 287, -214)];
  const extFeed = [V(242, 366, -165), V(235, 378, -220), V(185, 367, -257), V(116, 279, -259), V(91, 263, -214)];
  const midMain = [V(91, 287, -214), V(52, 312, -246), V(-18, 404, -247), V(-133, 381, -220), V(-132, 434, -160)];
  const midAux = [V(91, 263, -214), V(14, 279, -265), V(-76, 338, -251), V(-117, 365, -220), V(-119, 433, -160)];
  for (const points of [mainFeed, extFeed, midMain, midAux]) tube(root, points, 2.35);
  tube(root, [V(50, 550, -130), V(79, 496, -204), V(65, 376, -236), V(19, 304, -215)], 2.3, rubber);
  const dynamicTubeMaterial = tubeMaterial.clone();
  const filamentLines = [0, 1].map(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(66 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xb9b8a5, transparent: true, opacity: 0.5 }));
    line.frustumCulled = false;
    root.add(line);
    return line;
  });
  const flex = [0, 1].map(() => {
    const mesh = add(root, new THREE.BufferGeometry(), dynamicTubeMaterial, 0, 0, 0);
    mesh.frustumCulled = false;
    return mesh;
  });
  const deposited = group(bed);
  return { root, exterior, panels, rear, bed, plate, gantry, head, cover, hotends, blocker, light, lampMat,
    frontGlass, powerLight, door, screen, display, lid, ams, spoolMount, spools, ledMats, deposited,
    fans: [rearFan, headFan], paths: [mainFeed.concat(midMain.slice(1)), extFeed.concat(midAux.slice(1))],
    filamentLines, flex };
}

function makeSpool(parent, radius, width) {
  const rotor = group(parent);
  const flange = metal(0x818586, 0.66, 0.21);
  const winding = metal(0xe4a449, 0.55, 0.09);
  cy(rotor, radius * 0.92, radius * 0.92, width - 8, 0, 0, 0, winding, 'x', 58);
  const loops = new THREE.InstancedMesh(new THREE.TorusGeometry(radius * 0.918, 0.53, 5, 52), winding, Math.floor((width - 8) / 1.35));
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2);
  for (let k = 0; k < loops.count; k++) {
    matrix.compose(V(k * 1.35 - (loops.count - 1) * 0.675, 0, 0), q, V(1, 1, 1));
    loops.setMatrixAt(k, matrix);
  }
  rotor.add(loops);
  for (const side of [-1, 1]) {
    const x = side * width / 2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2);
    const hole = new THREE.Path(); hole.absarc(0, 0, 24, 0, Math.PI * 2, true); shape.holes.push(hole);
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6;
      const cut = new THREE.Path();
      cut.absarc(Math.cos(a) * radius * 0.69, Math.sin(a) * radius * 0.69, radius * 0.108, 0, Math.PI * 2, true);
      shape.holes.push(cut);
    }
    const end = add(rotor, new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false, curveSegments: 26 }), flange, x, 0, 0);
    end.rotation.y = Math.PI / 2;
    add(rotor, new THREE.TorusGeometry(radius - 1, 0.9, 6, 58), zinc, x + side * 0.5, 0, 0).rotation.y = Math.PI / 2;
    const lab = label(rotor, 'Bambu Lab', 33, 9, x + (side === 1 ? 2.3 : -0.3), -radius * 0.83, 0,
      { side: side === 1 ? 'right' : 'left', size: 30, color: '#151918' });
    lab.castShadow = false;
  }
  cy(rotor, 30, 30, width + 7, 0, 0, 0, flange, 'x');
  cy(rotor, 18, 18, width + 8, 0, 0, 0, rubber, 'x');
  return { parent, rotor, winding };
}

export function animatePrinter(model, state, carriage, dt, inspection, quality) {
  model.door.rotation.y = THREE.MathUtils.damp(model.door.rotation.y, state.door ? -1.68 : 0, 8, dt);
  model.lid.rotation.x = THREE.MathUtils.damp(model.lid.rotation.x, state.lid ? -1.55 : 0, 7, dt);
  model.bed.position.y = 343 - state.position.z;
  model.plate.visible = state.plate;
  model.gantry.position.z = 128 - carriage.y;
  model.head.position.x = carriage.x - 128;
  model.hotends[0].position.y = -44 + 3.6 * state.selector;
  model.hotends[1].position.y = -44 + X2D.rightLift * (1 - state.selector);
  model.blocker.position.x = X2D.rightTipOffset * (1 - state.selector);
  model.blocker.rotation.y = Math.sin(state.selector * Math.PI) * 0.65;
  model.frontGlass.visible = !inspection;
  model.panels.forEach(node => { node.visible = !inspection; });
  model.cover.visible = !inspection;
  model.light.intensity = state.power && state.lights ? 13400 : 0;
  model.lampMat.color.set(state.power && state.lights ? 0xe8fff5 : 0x586367);
  model.powerLight.color.set(state.power ? 0x83f09a : 0x263e32);
  model.fans.forEach((rotor, index) => { rotor.rotation.z += dt * (state.fan * (index + 1) * 0.24 + (state.power ? 0.7 : 0)); });
  for (let i = 0; i < model.spools.length; i++) {
    const spool = state.spools[i], mesh = model.spools[i];
    mesh.parent.visible = spool.present;
    mesh.rotor.rotation.x = spool.rotation;
    mesh.winding.color.set(spool.color);
    mesh.winding.roughness = ['Gloss', 'Silk', 'Metallic'].includes(spool.finish) ? 0.3 : 0.65;
    if (i < 4) model.ledMats[i].color.set(!state.power || !spool.present ? 0x41494b :
      state.feed?.slot === i || state.loaded[0] === i ? 0x64f2a5 : state.dryer.time ? 0xf0b26a : 0x99a8a2);
  }
  const last = model.lastFeed;
  const dynamic = !last || Math.abs(carriage.x - last.x) + Math.abs(carriage.y - last.y) > (quality === 'low' ? 12 : 5);
  if (dynamic) model.lastFeed = { x: carriage.x, y: carriage.y };
  for (let i = 0; i < 2; i++) {
    const path = model.paths[i], start = path.at(-1);
    const end = V(carriage.x - 128 + i * X2D.rightTipOffset, 417, 128 - carriage.y);
    if (dynamic || !model.lineCurves) {
      const points = [start, V(-77 + i * 14, 447, -118), V(end.x - 15, 457, end.z - 34), end];
      const flexCurve = new THREE.CatmullRomCurve3(points);
      model.flex[i].geometry.dispose();
      model.flex[i].geometry = new THREE.TubeGeometry(flexCurve, quality === 'low' ? 10 : 22, 2.2, 6, false);
      model.lineCurves ??= [];
      model.lineCurves[i] = new THREE.CatmullRomCurve3([...path, ...points.slice(1)]);
    }
    const feed = state.feed?.nozzle === i ? state.feed : null;
    const slot = feed?.slot ?? state.loaded[i];
    const fraction = feed?.fraction ?? (slot === null ? 0 : 1);
    const line = model.filamentLines[i];
    line.visible = fraction > 0;
    if (!line.visible) continue;
    line.material.color.set(state.spools[slot].color);
    line.material.opacity = 0.88;
    const buffer = line.geometry.attributes.position;
    for (let j = 0; j < buffer.count; j++) {
      const p = model.lineCurves[i].getPoint(j / (buffer.count - 1) * fraction);
      buffer.setXYZ(j, p.x, p.y, p.z);
    }
    buffer.needsUpdate = true;
  }
}
