import { area, X2D } from './spec.js';

export function sliceTriangles(triangles, { layer = 0.24, bed = 55, nozzle = 220, acceptLegacySeams = false } = {}) {
  if (!triangles.length || triangles.length > 300_000) throw new Error('This slicer supports meshes with 1–300,000 triangles.');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangles) for (const vertex of triangle) for (let axis = 0; axis < 3; axis++) {
    if (!Number.isFinite(vertex[axis])) throw new Error('The model contains invalid vertices.');
    min[axis] = Math.min(min[axis], vertex[axis]);
    max[axis] = Math.max(max[axis], vertex[axis]);
  }
  const size = max.map((v, i) => v - min[i]);
  if (size[0] > 246 || size[1] > 246 || size[2] > 260 || size[2] < 0.08) {
    throw new Error('The mesh cannot be centered and sliced within the supported X2D build volume.');
  }
  const origin = [(256 - size[0]) / 2 - min[0], (256 - size[1]) / 2 - min[1]];
  const layers = Math.ceil(size[2] / layer);
  const slices = Array.from({ length: layers }, () => []);
  for (const triangle of triangles) {
    const z = triangle.map(p => p[2] - min[2]);
    const lo = Math.max(0, Math.ceil(Math.min(...z) / layer - 0.5));
    const hi = Math.min(layers - 1, Math.floor(Math.max(...z) / layer - 0.5));
    for (let k = lo; k <= hi; k++) {
      const level = (k + 0.5) * layer;
      const hits = [];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if ((z[i] <= level) === (z[j] <= level)) continue;
        const t = (level - z[i]) / (z[j] - z[i]);
        hits.push([0, 1].map(axis => triangle[i][axis] + (triangle[j][axis] - triangle[i][axis]) * t));
      }
      if (hits.length === 2 && Math.hypot(hits[0][0] - hits[1][0], hits[0][1] - hits[1][1]) > 0.0001) slices[k].push(hits);
    }
  }
  const lines = ['; X2D Lab contour slicer', '; printer_model = Bambu Lab X2D', '; nozzle_diameter = 0.4',
    'G21', 'G90', 'M83', `M140 S${bed}`, `M104 S${nozzle}`];
  const format = n => Number(n.toFixed(3));
  const width = X2D.nozzle * 1.1;
  function path(points, speed) {
    if (points.length < 2) return;
    const xy = ([x, y]) => `X${format(x + origin[0])} Y${format(y + origin[1])}`;
    lines.push(`G0 ${xy(points[0])} F9000`);
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i], [a, b] = points[i - 1];
      const filament = Math.hypot(x - a, y - b) * width * layer / area;
      if (filament >= 0.00005) lines.push(`G1 ${xy(points[i])} E${filament.toFixed(4)} F${speed}`);
    }
    if (lines.length > 630_000) throw new Error('The sliced model exceeds the simulator’s toolpath limit.');
  }
  for (let i = 0; i < slices.length; i++) {
    const segments = slices[i];
    if (!segments.length) continue;
    const contours = connect(segments);
    if (!acceptLegacySeams && contours.some(chain => key(chain[0]) !== key(chain.at(-1)))) {
      throw new Error(`Open or non-manifold mesh at layer ${i + 1}. Repair the 3MF or import a pre-sliced file.`);
    }
    lines.push(`;LAYER:${i}`, `G0 Z${format(Math.min((i + 1) * layer, 260))} F1200`);
    for (const contour of contours) path(simplify(contour, key(contour[0]) === key(contour.at(-1))), i < 2 ? 1500 : 3300);
    const dense = i < 3 || i >= layers - 3;
    const fillStep = dense ? 0.48 : 3.2;
    for (const stroke of scanFill(segments, i % 2, fillStep, width / 2)) path(stroke, i < 2 ? 1500 : 4200);
  }
  lines.push('M104 S0', 'M140 S0', 'M107');
  return { gcode: lines.join('\n'), size };
}

function key(point) { return point.map(x => Math.round(x * 1000)).join(','); }

function connect(segments) {
  const links = new Map();
  const rows = segments.map(([a, b], index) => ({ a, b, ak: key(a), bk: key(b), index })).filter(row => row.ak !== row.bk);
  for (const row of rows) for (const k of [row.ak, row.bk]) {
    const list = links.get(k);
    if (list) list.push(row);
    else links.set(k, [row]);
  }
  const visited = new Set(), contours = [];
  for (const row of rows) {
    if (visited.has(row.index)) continue;
    visited.add(row.index);
    const chain = [row.a, row.b];
    let current = row.bk;
    while (current !== row.ak) {
      const next = links.get(current)?.find(candidate => !visited.has(candidate.index));
      if (!next) break;
      visited.add(next.index);
      chain.push(next.ak === current ? next.b : next.a);
      current = next.ak === current ? next.bk : next.ak;
    }
    contours.push(chain);
  }
  return contours;
}

function simplify(points, closed) {
  if (points.length < 4) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b] = out.at(-1), [x, y] = points[i], [u, v] = points[i + 1];
    const length = Math.hypot(u - a, v - b);
    if (length < 0.0001 || Math.abs((x - a) * (v - b) - (y - b) * (u - a)) / length > 0.012)
      out.push(points[i]);
  }
  out.push(closed ? points[0] : points.at(-1));
  return out;
}

function scanFill(segments, axis, step, inset) {
  const cross = 1 - axis;
  const rows = new Map();
  for (const [a, b] of segments) {
    const lo = Math.ceil(Math.min(a[cross], b[cross]) / step - 0.5);
    const hi = Math.ceil(Math.max(a[cross], b[cross]) / step - 0.5);
    for (let i = lo; i < hi; i++) {
      const at = (i + 0.5) * step;
      const hit = a[axis] + (b[axis] - a[axis]) * (at - a[cross]) / (b[cross] - a[cross]);
      if (!rows.has(i)) rows.set(i, []);
      rows.get(i).push(hit);
    }
  }
  const result = [];
  for (const [i, hits] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    hits.sort((a, b) => a - b);
    const at = (i + 0.5) * step;
    for (let k = 0; k + 1 < hits.length; k += 2) {
      const lo = hits[k] + inset, hi = hits[k + 1] - inset;
      if (hi - lo < 0.3) continue;
      const pair = axis === 0 ? [[lo, at], [hi, at]] : [[at, lo], [at, hi]];
      result.push(i % 2 ? pair.reverse() : pair);
    }
  }
  return result;
}
