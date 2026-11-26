import * as THREE from 'three';

const capacity = 4096;
const materials = new Map();
const finishes = {
  Matte: [0.87, 0.03], Satin: [0.63, 0.06], Gloss: [0.31, 0.07], Silk: [0.27, 0.28],
  Metallic: [0.35, 0.61], Translucent: [0.37, 0.04], 'Carbon fiber': [0.81, 0.17],
};
function materialFor(finish) {
  const key = Object.hasOwn(finishes, finish) ? finish : 'Satin';
  if (!materials.has(key)) {
    const [roughness, metalness] = finishes[key];
    materials.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness }));
  }
  return materials.get(key);
}
const color = new THREE.Color();
// The four longitudinal edges are top-left, top-right, bottom-right, bottom-left.
const faces = [
  0, 2, 3, 0, 3, 1, 2, 4, 5, 2, 5, 3, 4, 6, 7, 4, 7, 5, 6, 0, 1, 6, 1, 7,
  0, 6, 4, 0, 4, 2, 1, 3, 5, 1, 5, 7,
];

class BeadMesh {
  constructor(parent, maximum, finish) {
    const geometry = new THREE.BufferGeometry();
    this.count = 0;
    this.position = new Float32Array(maximum * 24);
    this.normal = new Float32Array(maximum * 24);
    this.color = new Float32Array(maximum * 24);
    const indices = new Uint16Array(maximum * faces.length);
    for (let i = 0; i < maximum; i++) faces.forEach((v, j) => { indices[i * faces.length + j] = i * 8 + v; });
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normal, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geometry, materialFor(finish));
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    parent.add(this.mesh);
  }
  write(bead, index) {
    const { from, to, width, height, layer, finish } = bead;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 0.000001) return;
    const sidewaysX = (to.y - from.y) / length, sidewaysZ = (to.x - from.x) / length;
    const widthOffset = width * 0.5;
    const variation = finish === 'Carbon fiber' ? 0.03 : 0.009;
    color.set(bead.color).multiplyScalar(0.96 + Math.sin(layer * 2.57) * variation);
    const positions = [from, to];
    for (let pair = 0; pair < 4; pair++) {
      const side = pair === 0 || pair === 3 ? -1 : 1;
      const top = pair < 2;
      const nx = sidewaysX * side * 0.64, nz = sidewaysZ * side * 0.64;
      const ny = top ? 0.77 : -0.77;
      for (let end = 0; end < 2; end++) {
        const p = positions[end], at = index * 24 + (pair * 2 + end) * 3;
        const y = top ? p.z : Math.max(0, p.z - height);
        this.position.set([p.x - 128 + sidewaysX * side * widthOffset, y, 128 - p.y + sidewaysZ * side * widthOffset], at);
        this.normal.set([nx, ny, nz], at);
        this.color.set([color.r, color.g, color.b], at);
      }
    }
    this.count = Math.max(this.count, index + 1);
  }
  upload() {
    const geometry = this.mesh.geometry;
    geometry.setDrawRange(0, this.count * faces.length);
    for (const attribute of Object.values(geometry.attributes)) {
      attribute.addUpdateRange((this.firstDirty || 0) * 24, (this.count - (this.firstDirty || 0)) * 24);
      attribute.needsUpdate = true;
    }
    this.firstDirty = this.count;
  }
  destroy() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}

export class ExtrusionView {
  constructor(parent) {
    this.parent = parent;
    this.sections = new Map();
    this.pending = new Set();
    this.live = new BeadMesh(parent, 1);
    this.live.mesh.visible = false;
  }
  add(bead) {
    if (!this.sections.has(bead.finish)) this.sections.set(bead.finish, []);
    const sections = this.sections.get(bead.finish);
    let section = sections.at(-1);
    if (!section || section.count === capacity) {
      section = new BeadMesh(this.parent, capacity, bead.finish);
      sections.push(section);
    }
    section.write(bead, section.count);
    this.pending.add(section);
  }
  update(state) {
    for (const section of this.pending) section.upload();
    this.pending.clear();
    const job = state.job;
    const entry = job?.file.entries[job.index];
    const segment = job?.segment;
    this.live.mesh.visible = !!(entry?.extrusion && entry.distance > 0 && segment?.deposited);
    if (!this.live.mesh.visible) return;
    const spool = state.spools[job.mapping[entry.tool]];
    this.live.mesh.material = materialFor(spool.finish);
    this.live.firstDirty = 0;
    const to = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, segment.from[axis] + (segment.to[axis] - segment.from[axis]) * segment.fraction]));
    this.live.write({ ...entry, to, color: spool.color, finish: spool.finish }, 0);
    this.live.upload();
  }
  clear() {
    for (const sections of this.sections.values()) for (const section of sections) section.destroy();
    this.sections.clear();
    this.pending.clear();
    this.live.mesh.visible = false;
  }
}
