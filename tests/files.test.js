import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { importPrint } from '../src/files.js';

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

test('unsliced 3MF mesh produces printable contour and infill G-code', () => {
  const points = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 4], [10, 0, 4], [10, 10, 4], [0, 10, 4]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const model = `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
    <resources><object id="1" type="model"><mesh><vertices>
    ${points.map(p => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}
    </vertices><triangles>${faces.map(f => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('')}
    </triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  const [job] = intake('mesh.3mf', archive({ '3D/3dmodel.model': model }));
  assert.equal(job.locallySliced, true);
  assert.equal(job.layers, 17);
  assert.equal(job.bounds.x[1] - job.bounds.x[0], 10);
  assert.ok(job.entries.length > 100);
  assert.throws(() => intake('bad.3mf', archive({ '3D/3dmodel.model': '<model><build/></model>' })), /no printable/);
});
