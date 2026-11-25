import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const metal = (color, roughness = 0.53, metalness = 0.45) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
export const plastic = metal(0x242a2f, 0.6, 0.12);
export const body = metal(0x42474c, 0.48, 0.48);
export const edge = metal(0x262a2d, 0.6, 0.18);
export const rubber = metal(0x0b0e10, 0.85, 0.05);
export const ebon = metal(0x14181b, 0.51, 0.18);
export const steel = metal(0xa3acb1, 0.34, 0.86);
export const zinc = metal(0x757b7a, 0.48, 0.75);
export const amber = metal(0xe8ad50, 0.37, 0.56);
export const gasket = metal(0x121419, 0.72, 0.05);
export const glass = new THREE.MeshPhysicalMaterial({ color: 0x718083, metalness: 0.29, roughness: 0.11, clearcoat: 0.85,
  transparent: true, opacity: 0.20, depthWrite: false, forceSinglePass: true, side: THREE.DoubleSide, envMapIntensity: 0.7 });
export const tinted = glass.clone(); tinted.color.set(0x5e6565); tinted.opacity = 0.37;
export const tubeMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb9c7ca, transparent: true, opacity: 0.48,
  depthWrite: false, roughness: 0.31, metalness: 0.12 });
export const lens = new THREE.MeshPhysicalMaterial({color: 0x172c41, roughness: 0.1, metalness: 0.7, clearcoat: 1});
const boxCache = new Map();
const cylinderCache = new Map();

export function add(parent, geometry, mat, x, y, z) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = !mat.transparent;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function box(parent, w, h, d, x, y, z, mat, radius = 0) {
  const key = [w, h, d, radius].join(':');
  if (!boxCache.has(key)) boxCache.set(key, radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d));
  return add(parent, boxCache.get(key), mat, x, y, z);
}
export function cy(parent, top, bottom, h, x, y, z, mat, axis = 'y', segments = 28) {
  const key = [top, bottom, h, segments].join(':');
  if (!cylinderCache.has(key)) cylinderCache.set(key, new THREE.CylinderGeometry(top, bottom, h, segments));
  const mesh = add(parent, cylinderCache.get(key), mat, x, y, z);
  if (axis === 'x') mesh.rotation.z = -Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}
export function group(parent, x = 0, y = 0, z = 0) {
  const node = new THREE.Group();
  node.position.set(x, y, z);
  parent.add(node);
  return node;
}
export function mark(node, action) { node.userData.action = action; return node; }

export function grain(pepper = false) {
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
export function label(parent, text, width, height, x, y, z, options = {}) {
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
export function screw(parent, x, y, z, face = 'z') {
  const holder = group(parent, x, y, z);
  if (face === 'rear') holder.rotation.y = Math.PI;
  if (face === 'right') holder.rotation.y = Math.PI / 2;
  if (face === 'left') holder.rotation.y = -Math.PI / 2;
  const mesh = cy(holder, 2.6, 2.6, 1.3, 0, 0, 0, zinc, 'z', 10);
  mesh.castShadow = false;
  box(holder, 2.5, 0.55, 0.2, 0, 0, 0.7, ebon).rotation.z = 0.7;
}
export function tube(parent, points, radius, mat = tubeMaterial, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = add(parent, new THREE.TubeGeometry(curve, segments, radius, 8, false), mat, 0, 0, 0);
  return { mesh, curve };
}

export function outline(points) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  return shape;
}

export function roundOpening(shape, x, y, radius) {
  const hole = new THREE.Path();
  hole.absarc(x, y, radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

export function profiled(parent, shape, depth, bevel, material, x = 0, y = 0, z = 0) {
  return add(parent, new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSegments: 2, steps: 1,
    bevelSize: bevel, bevelThickness: bevel * 0.72, curveSegments: 18,
  }), material, x, y, z);
}

export function ring(parent, profile, mat, x = 0, y = 0, z = 0) {
  const points = profile.map(([radius, depth]) => new THREE.Vector2(radius, depth));
  const mesh = add(parent, new THREE.LatheGeometry(points, 64), mat, x, y, z);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export function hexScrew(parent, x, y, z, radius = 1.8) {
  const head = cy(parent, radius, radius * 0.94, radius * 0.37, x, y, z, steel, 'z', 20);
  cy(parent, radius * 0.45, radius * 0.45, 0.10, x, y, z + radius * 0.20, ebon, 'z', 6);
  return head;
}
