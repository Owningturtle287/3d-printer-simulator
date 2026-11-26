// Motion commands have a fixed layout so large jobs can be transferred from the
// file worker without cloning an object and two coordinate records per move.
const chunkSize = 4096;
const stride = 16;

export class Toolpath {
  constructor({ chunks = [], controls = new Map(), length = 0 } = {}) {
    this.chunks = chunks;
    this.controls = controls;
    this.length = length;
  }

  push(entry) {
    const index = this.length++;
    if (entry.kind !== 'move') {
      this.controls.set(index, entry);
      return;
    }
    const chunk = Math.floor(index / chunkSize);
    this.chunks[chunk] ??= new Float64Array(chunkSize * stride);
    const { from, to } = entry;
    const offset = (index % chunkSize) * stride;
    this.chunks[chunk].set([
      from.x, from.y, from.z, to.x, to.y, to.z, entry.distance, entry.feed,
      entry.approach ? -1 - entry.tool : entry.tool, entry.extrusion, entry.layer,
      entry.width, entry.height, entry.printAccel, entry.travelAccel, entry.line,
    ], offset);
  }

  at(index) {
    if (index < 0) index += this.length;
    if (index < 0 || index >= this.length) return undefined;
    const control = this.controls.get(index);
    if (control) return control;
    const chunk = this.chunks[Math.floor(index / chunkSize)];
    const offset = (index % chunkSize) * stride;
    const tag = chunk[offset + 8];
    const entry = { kind: 'move',
      from: { x: chunk[offset], y: chunk[offset + 1], z: chunk[offset + 2] },
      to: { x: chunk[offset + 3], y: chunk[offset + 4], z: chunk[offset + 5] },
      distance: chunk[offset + 6], feed: chunk[offset + 7], tool: tag < 0 ? -1 - tag : tag,
      extrusion: chunk[offset + 9], layer: chunk[offset + 10], width: chunk[offset + 11], height: chunk[offset + 12],
      printAccel: chunk[offset + 13], travelAccel: chunk[offset + 14], line: chunk[offset + 15] };
    if (tag < 0) entry.approach = true;
    return entry;
  }

  *[Symbol.iterator]() {
    for (let i = 0; i < this.length; i++) yield this.at(i);
  }

  find(predicate) {
    for (const entry of this) if (predicate(entry)) return entry;
    return undefined;
  }

  buffers() {
    return this.chunks.flatMap(chunk => chunk.buffer);
  }
}
