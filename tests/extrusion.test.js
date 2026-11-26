import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { Group, Raycaster, ShapeUtils, Vector2, Vector3 } from 'three';
import { BENCHY_TOOLPATH } from '../src/demos.js';
import { ExtrusionView } from '../src/extrusion.js';
import { parseGcode } from '../src/gcode.js';
import { sliceTriangles } from '../src/slicing.js';

function covered(job, x, y, z) {
  return job.entries.some(move => {
    if (!move.extrusion || Math.abs(move.to.z - z) > 0.001) return false;
    const dx = move.to.x - move.from.x, dy = move.to.y - move.from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return false;
    const projection = ((x - move.from.x) * dx + (y - move.from.y) * dy) / lengthSquared;
    const at = Math.max(0, Math.min(1, projection));
    return Math.hypot(x - (move.from.x + at * dx), y - (move.from.y + at * dy)) <= move.width / 2;
  });
}

test('Benchy deposits a solid deck, cabin floor and roof while preserving the chimney bore', () => {
  const asset = readFileSync(new URL(`../public/${BENCHY_TOOLPATH}`, import.meta.url));
  const job = parseGcode(gunzipSync(asset).toString());
  assert.ok(covered(job, 105, 127, 8.4), 'stern deck');
  assert.ok(covered(job, 130, 128, 8.4), 'cabin floor');
  assert.ok(covered(job, 113, 128, 6.4), 'cargo pocket floor');
  assert.ok(covered(job, 128, 127, 39), 'roof');
  assert.ok(covered(job, 132, 128, 39.4), 'sloped roof');
  assert.ok(covered(job, 120.7, 128, 47.8), 'chimney wall');
  assert.equal(covered(job, 122.7, 128, 47.8), false, 'chimney bore');
});

test('local slicing closes an exposed ledge and preserves sparse fill underneath', () => {
  const outline = [[0, 0], [16, 0], [16, 3], [8, 3], [8, 8], [0, 8]];
  const caps = ShapeUtils.triangulateShape(outline.map(point => new Vector2(...point)), []);
  const front = outline.map(([x, z]) => [x, 0, z]);
  const rear = outline.map(([x, z]) => [x, 12, z]);
  const triangles = caps.flatMap(indices => [indices.map(i => front[i]), indices.map(i => rear[i])]);
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    triangles.push([front[i], front[next], rear[next]], [front[i], rear[next], rear[i]]);
  }
  const job = parseGcode(sliceTriangles(triangles, { layer: 0.2 }).gcode);
  const ledge = [131, 136].flatMap(x => [124, 125, 126, 127, 128, 129, 130].map(y => [x, y]));
  for (const [x, y] of ledge) assert.ok(covered(job, x, y, 3), `ledge ${x},${y}`);
  assert.ok(ledge.some(([x, y]) => !covered(job, x, y, 2)));
  assert.equal(covered(job, 134, 128, 3.2), false);
});

test('deposited beads have renderable top and side surfaces at the commanded Z', () => {
  const parent = new Group(), view = new ExtrusionView(parent);
  const from = { x: 120, y: 128, z: 0.4 }, to = { x: 136, y: 128, z: 0.4 };
  for (const [a,b] of [[from,to],[to,from]]) {
    view.add({ from: a, to: b, width: 0.44, height: 0.2, layer: 2, finish: 'Matte', color: '#e1ae72' });
  }
  view.update({});
  parent.updateMatrixWorld(true);
  const top = new Raycaster(new Vector3(0, 3, 0.1), new Vector3(0, -1, 0));
  const hits = top.intersectObjects(parent.children);
  assert.equal(hits.length, 2, 'both print directions show the upper face');
  for (const { point } of hits) assert.ok(Math.abs(point.y - 0.4) < 1e-6);
  const side = new Raycaster(new Vector3(0, 0.32, 1), new Vector3(0, 0, -1));
  assert.equal(side.intersectObjects(parent.children).length, 2);
  view.clear();
});
