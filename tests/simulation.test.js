import { CHAIN_LENGTH, dragChainPose } from '../src/carriage-harness.js';
import { GANTRY_Y, HEAD_Y, nozzleDatums } from '../src/toolhead.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VirtualPrinter } from '../src/printer.js';
import { reachable, coreXY, carriageFor, grams, X2D, coolingTargets } from '../src/spec.js';
import { parseGcode, validateMapping } from '../src/gcode.js';
import { BENCHY_TOOLPATH, demoGcode } from '../src/demos.js';
import { loadPreferences, savePreferences } from '../src/storage.js';
import { screenView } from '../src/camera.js';
import { Quaternion, Vector3 } from 'three';

const code = lines => parseGcode(['G21', 'G90', 'M83', ...lines].join('\n'));
const basic = () => code(['G0 X60 Y60 Z0.2', 'G1 X130 Y60 E2.5 F1200', 'G1 X130 Y85 E0.8 F1500',
  'G0 Z0.4', 'G1 X100 Y85 E1 F1800']);
function tick(printer, seconds) { for (let i = 0; i < Math.ceil(seconds / 0.05); i++) printer.tick(0.05); }
function boot() { const p = new VirtualPrinter(); tick(p, 2); assert.equal(p.state.status, 'idle'); return p; }
function until(p, condition, max = 30000) {
  for (let i = 0; i < max && !condition(); i++) p.tick(0.05);
  assert.ok(condition(), `Printer stalled in ${p.state.status} (${p.state.phase})`);
}

test('X2D build envelopes, CoreXY and right tip coordinates', () => {
  assert.deepEqual(X2D.chassis, [392, 406, 478]);
  assert.equal(reachable({ x: 0, y: 0, z: 260 }), true);
  assert.equal(reachable({ x: 20.49, y: 0, z: 0.2 }, true), false);
  assert.equal(reachable({ x: 20.5, y: 256, z: 256 }, true), true);
  assert.equal(reachable({ x: 255, y: 3, z: 257 }, false, true), false);
  assert.equal(reachable({ x: NaN, y: 0, z: 0 }), false);
  assert.deepEqual(coreXY(30, 12), { a: 42, b: 18 });
  assert.deepEqual(carriageFor({ x: 50, y: 40, z: 7 }, 1), { x: 29.5, y: 40, z: 7 });
});

test('homes and jogs within limits and prevents plate removal during motion', () => {
  const p = boot();
  assert.throws(() => p.jog('x', 10), /Home/);
  p.home();
  p.setDoor();
  assert.throws(() => p.setPlate(), /cool/);
  tick(p, 5);
  assert.equal(p.state.homed, true);
  assert.equal(p.state.position.x, 0);
  assert.throws(() => p.jog('x', -1), /travel/);
  p.jog('z', 10);
  tick(p, 1);
  assert.equal(p.state.position.z, 10);
  p.setPlate();
  assert.equal(p.state.plate, false);
  assert.throws(() => p.calibrate(), /build plate/);
});

test('gear-and-trigger transition changes selector before committing to the right nozzle', () => {
  const p = boot();
  p.selectNozzle(1);
  tick(p, 2.8);
  assert.ok(p.state.selector > 0 && p.state.selector < 1);
  assert.equal(p.state.nozzle, 0);
  tick(p, 3);
  assert.equal(p.state.nozzle, 1);
  assert.equal(p.state.selector, 1);
  assert.equal(p.carriage.x, 121.5);
  p.home();
  tick(p, 5);
  assert.equal(p.carriage.x, 0);
  assert.throws(() => p.jog('x', -1), /travel/);
});

test('AMS routing, loading and retraction preserve the external feed', () => {
  const p = boot();
  p.feed(2);
  tick(p, 3);
  assert.ok(p.state.feed.fraction > 0 && p.state.feed.fraction < 1);
  tick(p, 8);
  assert.deepEqual(p.state.loaded, [2, null]);
  p.feed(4);
  tick(p, 8);
  assert.deepEqual(p.state.loaded, [2, 4]);
  p.feed(2, true);
  tick(p, 11);
  assert.deepEqual(p.state.loaded, [null, 4]);
  p.editSpool(0, { material: 'TPU' });
  assert.throws(() => p.feed(0), /compatible/);
});

test('AMS drying requires a closed lid, retracts safely and uses its material profile', () => {
  const p = boot();
  p.setLid();
  assert.throws(() => p.drying(0, 8, 50), /Close/);
  p.setLid();
  p.drying(0, 8, 50);
  tick(p, 2);
  assert.ok(p.state.dryer.temperature > 23);
  assert.ok(p.state.dryer.humidity < 28);
  assert.ok(p.state.spools[0].rotation > 0);
  assert.throws(() => p.feed(0), /Stop drying/);
  p.stopDrying();
  assert.equal(p.state.dryer.time, 0);
});

test('G-code handles relative extrusion, recovery, layers and XY arcs', () => {
  const job = parseGcode('g90\nm83\nG0 X45 Y25 Z0.2\nG1 X55 E1 F600\nG1 E-1\nG1 E1\nG3 X45 Y35 I-10 J0 E1\nG0 Z0.4\nG1 X65 E1');
  assert.equal(job.layers, 2);
  assert.ok(Math.abs(job.totalExtrusion - 3) < 1e-8);
  assert.ok(job.entries.length > 20);
  assert.throws(() => code(['G1 X262 Z0.2 E1']), /outside/);
  assert.throws(() => parseGcode('; nozzle_diameter = 0.6\nG1 X20 E1'), /0.6 mm/);
  assert.throws(() => validateMapping(code(['G0 X1 Y35 Z.2', 'G1 X30 E1']), { 0: 4 }), /cannot reach/);
});

test('Bambu tool-selection hints survive normalized X2D change sections', () => {
  const job = parseGcode(`;; BambuStudio
T2 H0
; CHANGE_LAYER
M83
G1 X50 Y50 Z0.2
G1 X55 E1
;======== X2D filament_change gcode ==========
G1 X290
T3 H1
M621 S3A B
G1 X60 Y60
G1 X65 E1
;======== X2D end gcode ==========
G1 X320`);
  assert.deepEqual(job.toolNozzles, { 2: 0, 3: 1 });
  assert.deepEqual(job.materials, { 2: 1, 3: 1 });
  validateMapping(job, { 2: 0, 3: 4 });
});

test('actual deposition and consumed mass agree across speeds, pause/resume and filament mapping', () => {
  const job = basic();
  const slow = boot(), fast = boot();
  for (const [p, speed] of [[slow, 1], [fast, 100]]) {
    p.setTempo(speed);
    p.start(job, { 0: 0 }, { calibrate: false });
    until(p, () => p.state.status === 'printing' && p.state.job.segment?.deposited);
    if (speed === 1) {
      p.pause();
      const before = p.progress;
      tick(p, 3);
      assert.equal(p.progress, before);
      p.resume();
    }
    until(p, () => p.state.status === 'complete');
    assert.equal(p.state.path.length, 3);
    assert.equal(p.state.path.at(-1).layer, 2);
    assert.ok(Math.abs(p.state.job.used - grams(job.totalExtrusion, 1.24)) < 1e-9);
  }
  assert.deepEqual(slow.state.path, fast.state.path);
});

test('runout pauses a job, recovers from a refill, and can use a matching AMS backup', () => {
  for (const backup of [false, true]) {
    const p = boot(), job = basic();
    p.editSpool(0, { remaining: 0.0001 });
    if (backup) p.editSpool(1, { material: p.state.spools[0].material, color: p.state.spools[0].color });
    p.setTempo(100);
    p.start(job, { 0: 0 }, { calibrate: false });
    if (!backup) {
      until(p, () => p.state.status === 'fault');
      assert.equal(p.state.lastError.name, 'Filament runout');
      assert.throws(() => { p.editSpool(0, { remaining: 0 }); p.resume(); }, /Refill|refill|Replace/);
      p.editSpool(0, { remaining: 25 });
      p.resume();
    }
    until(p, () => p.state.status === 'complete');
    assert.equal(p.state.job.mapping[0], backup ? 1 : 0);
  }
});

test('demo files have compatible toolpaths, and Benchy contains the original model dimensions', () => {
  for (const id of ['cube', 'color', 'dual', 'bridge', 'tower']) {
    const job = parseGcode(demoGcode(id));
    assert.ok(job.layers > 30);
    validateMapping(job, id === 'dual' ? { 0: 0, 1: 4 } : { 0: 0, 1: 1, 2: 2, 3: 3 });
  }
  const benchy = parseGcode(gunzipSync(readFileSync(new URL(`../public/${BENCHY_TOOLPATH}`, import.meta.url))).toString());
  assert.equal(benchy.layers, 240);
  assert.ok(benchy.entries.length > 15000);
  assert.ok(Math.abs(benchy.bounds.x[1] - benchy.bounds.x[0] - 60) < 0.2);
  assert.ok(Math.abs(benchy.bounds.y[1] - benchy.bounds.y[0] - 31) < 0.4);
});

test('preferences round-trip and the camera faces the physical display at mobile aspect', () => {
  const p = boot(), map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  p.editSpool(4, { material: 'PETG', color: '#123456', remaining: 142.3 });
  savePreferences({ quality: 'medium', printer: p.configuration() }, storage);
  const preferences = loadPreferences(storage);
  const again = new VirtualPrinter(preferences.printer);
  assert.equal(again.state.spools[4].color, '#123456');
  assert.equal(again.state.spools[4].remaining, 142.3);
  const at = new Vector3(-100, 440, 208);
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.2);
  const narrow = screenView(at, tilt, 0.65, 37), wide = screenView(at, tilt, 1.65, 37);
  assert.deepEqual(narrow.target.toArray(), at.toArray());
  assert.ok(narrow.position.y > at.y);
  assert.ok(narrow.position.distanceTo(at) > wide.position.distanceTo(at));
});

test('low travel through a previously deposited high layer pauses with a collision', () => {
  const p = boot();
  p.setTempo(100);
  const job = code(['G0 X60 Y60 Z1', 'G1 X90 E2 F1200', 'G0 X75 Y60 Z.2', 'G1 Y90 E1']);
  p.start(job, { 0: 0 }, { calibrate: false });
  until(p, () => p.state.status === 'fault');
  assert.equal(p.state.lastError.name, 'Travel collision');
  assert.equal(p.state.path.length, 1);
});

test('the complete Benchy and dual-nozzle demo run from job preparation to cooling', () => {
  const benchy = parseGcode(gunzipSync(readFileSync(new URL(`../public/${BENCHY_TOOLPATH}`, import.meta.url))).toString());
  for (const [job, mapping] of [[benchy, { 0: 0 }], [parseGcode(demoGcode('dual')), { 0: 0, 1: 4 }]]) {
    const p = boot();
    p.setTempo(100);
    p.start(job, mapping);
    until(p, () => ['complete', 'fault'].includes(p.state.status));
    assert.equal(p.state.status, 'complete', p.state.lastError?.message);
    assert.equal(p.state.path.length, [...job.entries].filter(entry => entry.extrusion && entry.distance).length);
    assert.equal(p.state.history.length, 1);
    if (mapping[1] === 4) assert.ok(p.state.path.some(bead => bead.color === p.state.spools[4].color));
  }
});

test('the active nozzle stays at the commanded separation from the plate during selection', () => {
  const z = 0.24;
  const left = nozzleDatums(0, z), middle = nozzleDatums(0.5, z), right = nozzleDatums(1, z);
  assert.equal(left.left, middle.left);
  assert.equal(left.left, right.left);
  assert.ok(left.right > middle.right && middle.right > right.right);
  assert.ok(Math.abs(GANTRY_Y + HEAD_Y + left.left - left.plate - z) < 1e-8);
  assert.ok(Math.abs(GANTRY_Y + HEAD_Y + right.right - right.plate - z) < 1e-8);
});

test('the drag chain retains its fixed mount and bend radius over full carriage travel', () => {
  const fixed = dragChainPose(0, CHAIN_LENGTH);
  for (const x of [-128, -45, 0, 31, 128]) {
    assert.equal(dragChainPose(x, 0).x, x);
    assert.deepEqual(dragChainPose(x, CHAIN_LENGTH), fixed);
    let previous = dragChainPose(x, 0);
    for (let i = 1; i <= 250; i++) {
      const next = dragChainPose(x, i * CHAIN_LENGTH / 250);
      assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) <= CHAIN_LENGTH / 250 + 1e-8);
      assert.ok(next.x > -151 && next.x < 161);
      previous = next;
    }
  }
});

test('the part, auxiliary, exhaust and temperature-driven fans react independently', () => {
  const p = boot();
  assert.ok(Object.values(coolingTargets(p.state)).every(rpm => rpm === 0));
  p.setTemperature('right', 175);
  tick(p, 10);
  assert.equal(coolingTargets(p.state).left, 0);
  assert.ok(coolingTargets(p.state).right > 0);
  p.setTempo(100);
  const job = code(['G0 X60 Y60 Z0.2','G1 X90 E1 F1000','M106 P1 S64','M106 P2 S255','M106 P3 S255',
    'M107 P2','G4 S45','G1 Y95 E1']);
  p.start(job, { 0: 0 }, { calibrate: false });
  until(p, () => p.state.job.wait > 0);
  const speeds = p.telemetry().fans;
  assert.ok(Math.abs(speeds.part - 7100 * 64 / 255) < 1e-8);
  assert.equal(speeds.auxiliary, 0);
  assert.equal(speeds.exhaust, 2550);
  p.power();
  assert.ok(Object.values(p.telemetry().fans).every(rpm => rpm === 0));
});
