import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { importPrint } from '../src/files.js';
import { Toolpath } from '../src/toolpath.js';
import { VirtualPrinter } from '../src/printer.js';

const intake = (name, bytes) => importPrint(name, bytes, { xmlReader: new DOMParser() });
const valid = strToU8('G21\nG90\nM83\nG0 X45 Y45 Z0.2\nG1 X55 E1');
const archive = objects => zipSync(Object.fromEntries(Object.entries(objects).map(([key, value]) => [key, typeof value === 'string' ? strToU8(value) : value])));

test('G-code and multi-plate 3MF keep the actual toolpaths and unsupported plates visible', () => {
  assert.equal(intake('small.gcode', valid)[0].totalExtrusion, 1);
  const pack = archive({
    'Metadata/plate_2.gcode': valid, 'Metadata/plate_12.gcode': 'G0 X1',
    'Metadata/project_settings.config': JSON.stringify({ printer_model: 'Bambu Lab X2D', filament_type: ['PLA'] }),
  });
  const results = intake('pack.3mf', pack);
  assert.equal(results[0].plate, 2);
  assert.equal(results[0].requirements[0].type, 'PLA');
  assert.equal(results[1].plate, 12);
  assert.match(results[1].error, /No printable/);
  assert.throws(() => intake('single.3mf', archive({ 'Metadata/plate_1.gcode': valid,
    'Metadata/project_settings.config': '{"printer_model":"Bambu Lab P1S"}' })), /Export it for/);
});

function boxModel([x, y, z], offsets = [[0, 0]]) {
  const points = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
    <resources><object id="1" type="model"><mesh><vertices>
    ${points.map(p => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}
    </vertices><triangles>${faces.map(f => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('')}
    </triangles></mesh></object></resources><build>
    ${offsets.map(([dx, dy]) => `<item objectid="1" transform="1 0 0 0 1 0 0 0 1 ${dx} ${dy} 0"/>`).join('')}
    </build></model>`;
}

test('unsliced 3MF mesh produces printable contour and infill G-code', () => {
  const [job] = intake('mesh.3mf', archive({ '3D/3dmodel.model': boxModel([10, 10, 4]) }));
  assert.equal(job.locallySliced, true);
  assert.equal(job.layers, 17);
  assert.equal(job.bounds.x[1] - job.bounds.x[0], 10);
  assert.ok(job.entries.length > 100);
  assert.throws(() => intake('bad.3mf', archive({ '3D/3dmodel.model': '<model><build/></model>' })), /no printable/);
});

test('slices a full-width 3MF with more than 650,000 executable commands', () => {
  const offsets = Array.from({ length: 64 }, (_, i) => [i % 8 * 240 / 7, Math.floor(i / 8) * 240 / 7]);
  const [job] = intake('full-bed.3mf', archive({ '3D/3dmodel.model': boxModel([16, 16, 220], offsets) }));
  assert.equal(job.locallySliced, true);
  assert.deepEqual(job.bounds.x, [0, 256]);
  assert.deepEqual(job.bounds.y, [0, 256]);
  assert.ok(job.entries.length > 650_000);
  assert.throws(() => intake('wide.3mf', archive({ '3D/3dmodel.model': boxModel([256.1, 10, 4]) })), /build volume/);
  assert.throws(() => intake('deep.gcode', strToU8('G0 X20 Y256 Z0.2\nG1 X30 Y256.1 E1')), /outside/);
});

test('transfers and executes the end of uploaded G-code past the old command limit', () => {
  const repeats = 330_000;
  const gcode = 'G21\nG90\nM83\nG0 X100 Y100 Z.2 F9000\nG1 X100.001 E.0001\n' +
    'G1 X100 E.0001\nG1 X100.001 E.0001\n'.repeat(repeats) + 'M107\nG1 X100.5 E.016\n';
  const [job] = intake('dense.gcode', strToU8(gcode));
  const buffers = job.entries.buffers();
  const transferred = structuredClone(job.entries, { transfer: buffers });
  assert.ok(buffers.every(buffer => buffer.byteLength === 0));
  job.entries = new Toolpath(transferred);
  assert.ok(job.entries.length > 650_000);
  assert.equal(job.entries.at(-2).code, 'M107');
  assert.equal(job.entries.at(-1).to.x, 100.5);
  assert.equal(job.entries.at(0).approach, true);

  const printer = new VirtualPrinter({}, { recordDeposits: false });
  let last, deposited = 0;
  printer.subscribe((event, bead) => {
    if (event === 'extrude') { last = bead; deposited++; }
  });
  printer.setTempo(100);
  printer.tick(0.05);
  printer.start(job, { 0: 0 }, { calibrate: false });
  for (let i = 0; i < 5000 && printer.active && printer.state.status !== 'fault'; i++) printer.tick(0.05);
  assert.equal(printer.state.status, 'complete', printer.state.lastError?.message);
  assert.equal(last.to.x, 100.5);
  assert.equal(deposited, 2 * repeats + 2);
  assert.equal(printer.state.depositedCount, deposited);
  assert.equal(printer.state.path.length, 0);
});
