import { X2D, area, reachable, duration } from './spec.js';
import { Toolpath } from './toolpath.js';

const coordinate = (p, axis, length) => p + axis * length;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const initial = { x: 0, y: 0, z: 0 };

export function parseGcode(source, { name = 'Imported print', model = '', thumbnail, plate } = {}) {
  const entries = new Toolpath();
  let p = { ...initial }, off = { ...initial }, e = 0, eOffset = 0, feed = 1800;
  let xyzAbsolute = true, eAbsolute = true, scale = 1, tool = 0;
  let layer = 0, layerZ = -1, layerHeight = 0.2, width = 0.44, retracted = 0, seenExtrusion = false;
  let declaredLayer = null, declaredTime = null, nozzleSize = null, slicer = '', chamberTarget = 0;
  const pending = [];
  let printAccel = 0, travelAccel = 0;
  const materials = {}, toolNozzles = {};
  const bounds = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  let estimated = 0, totalExtrusion = 0, skipped = 0;
  const firmwareMarkers = /;\s*(?:MACHINE_START_GCODE_START|MACHINE_END_GCODE_START)\b/i.test(source);
  const bambu = /BambuStudio|Bambu Studio/i.test(source);
  const firstLayerMarker = bambu && !firmwareMarkers && /;\s*(?:CHANGE_LAYER|LAYER_CHANGE)\s*$/im.test(source);
  let ignore = false, changing = false, enteredBody = !firstLayerMarker;

  function move(to, extrusion, line) {
    const distance = dist(p, to);
    if (distance <= 1e-6 && extrusion <= 1e-6) { p = to; return; }
    const entry = { kind: 'move', from: p, to, distance, feed: feed / 60, tool, extrusion, layer, width, height: layerHeight, printAccel, travelAccel, line };
    if (extrusion > 0 && distance > 1e-6) {
      if (!reachable(to)) throw new Error(`Line ${line}: extrusion is outside the 256 × 256 × 260 mm envelope.`);
      if (!seenExtrusion) {
        seenExtrusion = true;
        for (const item of pending.filter(item => item.kind !== 'move').slice(-180)) entries.push(item);
        if (!reachable(p)) throw new Error(`Line ${line}: the first extrusion starts outside the build volume.`);
        if (distance > 1e-6) entries.push({ ...entry, from: p, to: p, distance: 0, extrusion: 0, approach: true });
      }
      if (declaredLayer === null && to.z > layerZ + 0.025) {
        layerHeight = layerZ < 0 ? Math.min(0.4, Math.max(0.08, to.z)) : Math.min(0.6, to.z - layerZ);
        layerZ = to.z;
        layer++;
      } else if (declaredLayer !== null) {
        layer = declaredLayer;
        if (to.z > layerZ + 0.025) {
          const delta = layerZ < 0 ? to.z : to.z - layerZ;
          if (delta > 0.03 && delta <= 0.6) layerHeight = delta;
          layerZ = to.z;
        }
      }
      entry.layer = layer;
      entry.height = layerHeight;
      for (const axis of ['x', 'y', 'z']) {
        bounds[axis][0] = Math.min(bounds[axis][0], p[axis], to[axis]);
        bounds[axis][1] = Math.max(bounds[axis][1], p[axis], to[axis]);
      }
      if (distance > 0.04) entry.width = Math.max(0.12, Math.min(1.2, extrusion * area / (distance * layerHeight)));
      materials[tool] = (materials[tool] || 0) + extrusion;
      totalExtrusion += extrusion;
    }
    if (seenExtrusion) {
      if (!reachable(to)) throw new Error(`Line ${line}: travel is outside the simulation envelope.`);
      estimated += duration(distance, Math.min(entry.feed, X2D.travel), X2D.main.acceleration);
      entries.push(entry);
    } else {
      pending.push(entry);
      if (pending.length > 180) pending.shift();
    }
    p = to;
  }

  let startOfLine = 0, line = 0;
  while (startOfLine < source.length) {
    const newline = source.indexOf('\n', startOfLine);
    const endOfLine = newline === -1 ? source.length : newline;
    const text = source.slice(startOfLine, endOfLine);
    startOfLine = endOfLine + 1;
    line++;
    const delimiter = text.indexOf(';');
    const raw = delimiter === -1 ? text : text.slice(0, delimiter);
    const comment = delimiter === -1 ? '' : text.slice(delimiter + 1).trim();
    if (/^MACHINE_(?:START|END)_GCODE_START\b/i.test(comment)) { ignore = true; continue; }
    if (/^MACHINE_(?:START|END)_GCODE_END\b/i.test(comment)) { ignore = false; continue; }
    if (/^(?:END(?:_PRINT| GCODE|_OF_PRINT)\b|=+\s*X2D end gcode)/i.test(comment)) break;
    if (/^=+\s*X2D filament_change gcode/i.test(comment)) { changing = true; continue; }
    if (/^TIME:\s*\d/i.test(comment)) declaredTime = Number(comment.split(':')[1]);
    if (/^(?:printer_model|printer_settings_id)\s*=/i.test(comment) && !model) model = comment.split('=')[1].trim();
    if (/^nozzle_diameter\s*=/i.test(comment)) nozzleSize = Number.parseFloat(comment.split('=')[1]);
    if (/BambuStudio|PrusaSlicer|OrcaSlicer|Cura/i.test(comment) && !slicer) slicer = comment;
    const layerMatch = comment.match(/^LAYER:\s*(\d+)/i);
    if (layerMatch) { declaredLayer = Number(layerMatch[1]) + 1; enteredBody = true; }
    if (/^(CHANGE_LAYER|LAYER_CHANGE)$/i.test(comment)) { declaredLayer = (declaredLayer || 0) + 1; enteredBody = true; }
    const hints = comment.match(/^(?:WIDTH|LINE_WIDTH)\s*:\s*(\d+(?:\.\d+)?)/i);
    if (hints) width = Number(hints[1]);
    if (!raw.trim()) continue;

    const normalized = raw.trim().toUpperCase();
    const command = normalized.match(/^(?:N\d+\s*)?([GMT]\d+(?:\.\d+)?)/);
    if (!command) continue;
    const code = command[1];
    const args = Object.fromEntries([...normalized.slice(command[0].length).matchAll(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g)].map(match => [match[1], Number(match[2])]));
    if (['M141', 'M191'].includes(code) && !seenExtrusion && args.S > 0) chamberTarget = Math.min(X2D.temperatures.chamber, args.S);
    const xyz = axis => args[axis.toUpperCase()];
    if (code.startsWith('T')) {
      const next = Number(code.slice(1));
      if (Number.isInteger(next) && next >= 0 && next < 16) {
        tool = next; retracted = 0;
        if (bambu && [0, 1].includes(args.H)) {
          if (Object.hasOwn(toolNozzles, tool) && toolNozzles[tool] !== args.H)
            throw new Error('A filament switches between both hotends. This file requires routing beyond the default Combo configuration.');
          toolNozzles[tool] = args.H;
        }
      } else skipped++;
      continue;
    }
    if (changing) {
      if (code === 'M621') changing = false;
      skipped++;
      continue;
    }
    if (code === 'G90') { xyzAbsolute = true; continue; }
    if (code === 'G91') { xyzAbsolute = false; continue; }
    if (code === 'M82') { eAbsolute = true; continue; }
    if (code === 'M83') { eAbsolute = false; continue; }
    if (code === 'G20' || code === 'G21') { scale = code === 'G20' ? 25.4 : 1; continue; }
    if (ignore) continue;
    if (code === 'G92') {
      for (const axis of ['x', 'y', 'z']) if (xyz(axis) !== undefined) off[axis] = p[axis] - xyz(axis) * scale;
      if (args.E !== undefined) eOffset = e - args.E * scale;
      continue;
    }
    if (code === 'M204') {
      if ((args.P ?? args.S) > 0) printAccel = args.P ?? args.S;
      if ((args.T ?? args.S) > 0) travelAccel = args.T ?? args.S;
      continue;
    }
    if (!enteredBody) {
      if (['M104', 'M140', 'M141'].includes(code) && args.S > 0 && pending.length < 180)
        pending.push({ kind: 'control', code, args, tool, line });
      continue;
    }
    if (['M104', 'M109', 'M140', 'M190', 'M141', 'M191', 'M106', 'M107', 'G4', 'M0', 'M1', 'M25', 'M400'].includes(code)) {
      if (code === 'M400' && args.U !== 1) continue;
      const entry = { kind: 'control', code, args, tool, line };
      if (seenExtrusion) {
        entries.push(entry);
        if (code === 'G4') estimated += Math.min(600, args.S ?? (args.P || 0) / 1000);
      } else pending.push(entry);
      continue;
    }
    if (/^(?:G53|G5|G17|G18|G19|G29|G28|G54|G55|G56|G57|G58|G59|M200|M218)$/.test(code)) {
      if (code === 'G17' || ['G28', 'G29'].includes(code) && !seenExtrusion || code === 'M200' && args.D === 0) continue;
      throw new Error(`Line ${line}: ${code} is unsupported in executable toolpaths.`);
    }
    if (!['G0', 'G1', 'G2', 'G3'].includes(code)) {
      if (/^(?:M62[01]|M10[0-9]+|M9[0-9]+|G[0-9]+\.\d+)$/.test(code)) skipped++;
      continue;
    }
    if (args.F > 0) feed = args.F * scale;
    const target = Object.fromEntries(['x', 'y', 'z'].map(axis => [
      axis, xyz(axis) === undefined ? p[axis] : (xyzAbsolute ? off[axis] : p[axis]) + xyz(axis) * scale,
    ]));
    const nextE = args.E === undefined ? e : (eAbsolute ? eOffset : e) + args.E * scale;
    const deltaE = nextE - e;
    e = nextE;
    if (deltaE < 0) retracted -= deltaE;
    const recovered = Math.min(retracted, Math.max(0, deltaE));
    retracted -= recovered;
    const deposit = Math.max(0, deltaE - recovered);
    if (code === 'G0' || code === 'G1') { move(target, deposit, line); continue; }
    if (args.R !== undefined || (args.I === undefined && args.J === undefined)) {
      throw new Error(`Line ${line}: use XY arcs with I/J offsets or export linear G-code.`);
    }
    const start = p;
    const cx = coordinate(start.x, args.I || 0, scale), cy = coordinate(start.y, args.J || 0, scale);
    const radius = Math.hypot(start.x - cx, start.y - cy);
    const a = Math.atan2(start.y - cy, start.x - cx), b = Math.atan2(target.y - cy, target.x - cx);
    let sweep = b - a;
    if (code === 'G2' && sweep >= -1e-8) sweep -= Math.PI * 2;
    if (code === 'G3' && sweep <= 1e-8) sweep += Math.PI * 2;
    const count = Math.max(1, Math.ceil(Math.abs(sweep * radius) / 0.6));
    if (!radius || count > 10000 || Math.abs(Math.hypot(target.x - cx, target.y - cy) - radius) > 0.25)
      throw new Error(`Line ${line}: invalid XY arc.`);
    for (let n = 1; n <= count; n++) {
      const fraction = n / count, angle = a + sweep * fraction;
      move(n === count ? target : { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius,
        z: start.z + (target.z - start.z) * fraction }, deposit / count, line);
    }
  }
  if (!totalExtrusion) throw new Error('No printable XY extrusion moves were found.');
  if (model && /bambu|X1|P1|H2|P2|A1|H3/i.test(model) && !/X2D/i.test(model)) {
    throw new Error(`This file names “${model}”. Export it for Bambu Lab X2D or provide standard G-code.`);
  }
  if (nozzleSize && Math.abs(nozzleSize - X2D.nozzle) > 0.001) {
    throw new Error(`This file specifies a ${nozzleSize} mm nozzle. The simulator is configured for 0.4 mm.`);
  }
  return { name, plate, model, thumbnail, slicer, entries, materials, toolNozzles, chamberTarget, bounds, layers: layer,
    duration: Math.max(1, estimated), declaredTime, totalExtrusion, skipped, nozzleSize: nozzleSize || 0.4 };
}

export function validateMapping(job, mapping, shared = true) {
  const slots = new Set(Object.keys(job.materials).map(key => mapping[key]));
  const dual = slots.has(4) && [...slots].some(slot => slot !== 4);
  for (const entry of job.entries) {
    if (entry.kind !== 'move') continue;
    if (!Object.hasOwn(job.materials, entry.tool)) continue;
    const right = mapping[entry.tool] === 4;
    if ((entry.extrusion > 0 || entry.distance === 0) && (!reachable(entry.from, right, shared && dual) || !reachable(entry.to, right, shared && dual))) {
      throw new Error(`Line ${entry.line}: the mapped nozzle cannot reach this extrusion path.`);
    }
    if (right && !reachable(entry.to, true)) {
      throw new Error(`Line ${entry.line}: the auxiliary nozzle cannot reach this travel move.`);
    }
  }
}
