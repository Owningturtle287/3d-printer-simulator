import { gunzipSync, strFromU8 } from 'fflate';
import { area } from './spec.js';
import { parseGcode } from './gcode.js';

export const BENCHY_TOOLPATH = 'jobs/benchy-solid.gcode.gz';

export const DEMOS = [
  { id: 'benchy', name: '3DBenchy', detail: '60 × 31 × 48 mm', kind: 'Benchmark', color: '#e5a556' },
  { id: 'cube', name: 'Calibration cube', detail: '20 × 20 × 20 mm', kind: 'Dimensional test', color: '#aecd94' },
  { id: 'color', name: 'Multicolor test', detail: 'AMS filament changes', kind: 'Material study', color: '#b5a7dc' },
  { id: 'dual', name: 'Dual-nozzle supports', detail: 'Main + auxiliary', kind: 'Material study', color: '#c1ddbc' },
  { id: 'bridge', name: 'Bridging test', detail: '24 mm bridge span', kind: 'Calibration', color: '#92c0bd' },
  { id: 'tower', name: 'Temperature tower', detail: '225 → 195 °C', kind: 'Calibration', color: '#d6ac98' },
];

export async function loadDemo(id) {
  const reference = DEMOS.find(item => item.id === id);
  if (!reference) throw new Error('Demo file was not found.');
  if (id === 'benchy') {
    const response = await fetch(new URL(BENCHY_TOOLPATH, location.href));
    if (!response.ok) throw new Error('The 3DBenchy toolpath could not be loaded.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const toolpath = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
    return parseGcode(strFromU8(toolpath), { name: reference.name });
  }
  return parseGcode(demoGcode(id), { name: reference.name });
}

export function demoGcode(id) {
  const lines = ['; X2D Lab demonstration toolpath', '; printer_model = Bambu Lab X2D',
    '; nozzle_diameter = 0.4', 'G21', 'G90', 'M83', 'M140 S55', 'M104 S220', 'M106 S160'];
  const layer = 0.2;
  function line(points, speed = 3000) {
    lines.push(`G0 X${points[0][0]} Y${points[0][1]} F7200`);
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i], [px, py] = points[i - 1];
      const extrusion = (Math.hypot(x - px, y - py) * 0.44 * layer / area).toFixed(4);
      lines.push(`G1 X${x} Y${y} E${extrusion} F${speed}`);
    }
  }
  function rectangle(x, y, width, h, spacing = 3) {
    line([[x, y], [x + width, y], [x + width, y + h], [x, y + h], [x, y]]);
    for (let dy = spacing / 2; dy < h - 0.1; dy += spacing) line([[x + 0.22, y + dy], [x + width - 0.22, y + dy]]);
  }
  const counts = { cube: 100, color: 48, dual: 46, bridge: 56, tower: 105 };
  for (let k = 0; k < counts[id]; k++) {
    lines.push(`;LAYER:${k}`, `G0 Z${((k + 1) * layer).toFixed(2)} F1200`);
    const skin = k < 3 || k >= counts[id] - 3 ? 0.405 : 3;
    if (id === 'cube') rectangle(118, 118, 20, 20, skin);
    if (id === 'color') {
      lines.push(`T${Math.floor(k / 12)}`);
      rectangle(112 + Math.floor(k / 12) * 2, 116, 32 - Math.floor(k / 12) * 4, 24, skin);
    }
    if (id === 'bridge' || id === 'dual') {
      lines.push('T0');
      if (k < 40) {
        rectangle(110, 121, 6, 14, skin);
        rectangle(140, 121, 6, 14, skin);
        if (id === 'dual' && k >= 8) {
          lines.push('T1');
          rectangle(116.4, 121.5, 23.2, 13, k >= 37 ? 0.405 : 3);
        }
      } else rectangle(110, 121, 36, 14, k <= 42 ? 0.405 : skin);
    }
    if (id === 'tower') {
      if (k % 15 === 0) lines.push(`M109 S${225 - Math.floor(k / 15) * 5}`);
      if (k % 15 < 11) {
        rectangle(115, 123, 5, 10, skin);
        rectangle(135, 123, 5, 10, skin);
      } else rectangle(115, 123, 25, 10, 0.405);
    }
  }
  return [...lines, 'M104 S0', 'M140 S0', 'M107'].join('\n');
}
