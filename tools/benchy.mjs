import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { sliceTriangles } from '../src/slicing.js';
import { parseGcode } from '../src/gcode.js';
import { BENCHY_TOOLPATH } from '../src/demos.js';

const file = readFileSync(process.argv[2]);
const count = file.readUInt32LE(80);
if (84 + count * 50 !== file.length) throw new Error('Expected the original binary 3DBenchy STL.');
const triangles = Array.from({ length: count }, (_, index) => {
  const offset = 84 + index * 50 + 12;
  return Array.from({ length: 3 }, (_, point) => Array.from({ length: 3 }, (_, axis) =>
    file.readFloatLE(offset + point * 12 + axis * 4)));
});
const { gcode, size } = sliceTriangles(triangles, { layer: 0.2, acceptLegacySeams: true });
const comments = '; #3DBenchy by CreativeTools, CC0 1.0, 3DBenchy.com\n';
const job = parseGcode(comments + gcode, { name: '3DBenchy' });
writeFileSync(new URL(`../public/${BENCHY_TOOLPATH}`, import.meta.url), gzipSync(comments + gcode, { level: 9 }));
console.log({ size, layers: job.layers, moves: job.entries.length, seconds: job.duration, extrusion: job.totalExtrusion });
