import { X2D, SPEEDS, MATERIALS, defaultSpools, compatible, reachable, coreXY, grams, duration, traveled, slotLabel, area } from './spec.js';
import { validateMapping } from './gcode.js';

const ROOM = 23;
const position = (x, y, z) => ({ x, y, z });
const HOME = position(0, 256, 0);
const PARK = position(8, 246, 12);
const TRIGGER = position(244, 252, 6);
const THERMAL = { left: [0.035, 0.045], right: [0.032, 0.045], bed: [0.016, 0.014], chamber: [0.008, 0.009] };
const active = new Set(['preparing', 'printing', 'paused', 'fault']);
const blend = (a, b, f) => position(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

export class VirtualPrinter {
  #listeners = new Set();

  constructor(config = {}) {
    this.state = {
      power: true, status: 'booting', message: 'Starting printer…', bootTime: 1.4, phase: '', tempo: 1,
      position: position(128, 128, 118), nozzle: 0, selector: 0, lights: config.lights ?? true,
      door: false, lid: false, plate: true, homed: false, fan: 0, motionSpeed: 0,
      spools: defaultSpools().map((fallback, i) => ({ ...fallback, ...config.spools?.[i], rotation: 0 })),
      loaded: [null, null], feed: null, service: null, job: null, path: [],
      temperatures: Object.fromEntries(Object.keys(THERMAL).map(key => [key, { current: ROOM, target: 0 }])),
      dryer: { time: 0, total: 0, target: 0, temperature: ROOM, humidity: config.humidity ?? 28, adapter: !!config.adapter },
      backup: config.backup ?? true, lastError: null, history: Array.isArray(config.history) ? config.history.slice(0, 30) : [],
    };
  }

  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #emit(type, data) { for (const listener of this.#listeners) listener(type, data, this.state); }
  get active() { return active.has(this.state.status); }
  get busy() { return this.active || this.state.service !== null || this.state.feed !== null; }
  get carriage() {
    const s = this.state;
    return { ...s.position, x: s.position.x - X2D.rightTipOffset * s.selector };
  }
  telemetry() {
    const s = this.state;
    return { status: s.status, power: s.power, phase: s.phase, position: { ...s.position }, carriage: this.carriage,
      belts: coreXY(this.carriage.x, this.carriage.y), temperatures: structuredClone(s.temperatures), fan: s.fan,
      nozzle: s.nozzle, loaded: [...s.loaded], spools: structuredClone(s.spools), dryer: { ...s.dryer },
      job: s.job ? { name: s.job.file.name, layer: s.job.layer, layers: s.job.file.layers, progress: this.progress,
        elapsed: s.job.elapsed, remaining: Math.max(0, s.job.estimate - s.job.elapsed) } : null };
  }
  configuration() {
    const s = this.state;
    return { lights: s.lights, backup: s.backup, spools: s.spools.map(({ rotation, ...rest }) => ({ ...rest })),
      adapter: s.dryer.adapter, humidity: s.dryer.humidity, history: s.history };
  }
  get progress() {
    const job = this.state.job;
    return job ? (job.index + (job.segment?.fraction || 0)) / job.file.entries.length : 0;
  }
  #leftEdge(p) { return { ...p, x: Math.max(this.state.nozzle ? X2D.rightTipOffset : 0, p.x) }; }

  power() {
    const s = this.state;
    if (s.power) {
      if (this.active) this.cancel('Power switched off');
      s.power = false; s.status = 'off'; s.message = 'Printer is off';
      s.feed = null; s.service = null; s.motionSpeed = 0; s.homed = false; s.fan = 0;
      s.dryer.time = 0;
      this.#cool();
    } else {
      s.power = true; s.bootTime = 1.4; s.status = 'booting'; s.message = 'Starting printer…';
    }
    this.#emit('power');
  }
  setTempo(speed) { if (SPEEDS.includes(speed)) this.state.tempo = speed; }
  setLight() {
    this.#requirePower();
    this.state.lights = !this.state.lights;
    this.#emit('settings');
  }
  setDoor() { this.state.door = !this.state.door; this.#emit('hardware'); }
  setLid() { this.state.lid = !this.state.lid; this.#emit('hardware'); }
  setPlate() {
    const s = this.state;
    if (this.busy || !s.door || s.temperatures.bed.current > 50 || s.path.length)
      throw new Error('Open the door, cool the bed below 50 °C, and clear the bed before changing the plate.');
    s.plate = !s.plate;
    this.#emit('hardware');
  }
  removePrint() {
    const s = this.state;
    if (this.busy || !s.door || s.temperatures.bed.current > 55)
      throw new Error('Wait for the bed to cool below 55 °C and open the door before removing the print.');
    s.path = [];
    if (s.status === 'complete') s.status = 'idle';
    s.job = null;
    this.#emit('clear');
  }
  setTemperature(zone, target) {
    this.#requirePower();
    if (!Object.hasOwn(THERMAL, zone) || !Number.isFinite(target) || target < 0 || target > X2D.temperatures[zone])
      throw new Error('The requested temperature is outside the supported range.');
    this.state.temperatures[zone].target = target;
  }
  setFan(percent) {
    this.#requirePower();
    this.state.fan = Math.max(0, Math.min(100, Number(percent) || 0));
  }
  home() {
    this.#requireIdle();
    if (!this.state.plate) throw new Error('Install the build plate before homing.');
    this.#service('Homing', X2D.stageSeconds.Homing, { from: { ...this.state.position }, to: this.#leftEdge(HOME) });
  }
  calibrate() {
    this.#requireIdle();
    if (!this.state.plate) throw new Error('Install the build plate before calibration.');
    this.#service('Bed leveling', X2D.stageSeconds['Bed leveling'], { from: { ...this.state.position }, to: this.#leftEdge(HOME), probe: true });
  }
  jog(axis, delta) {
    this.#requireIdle();
    const s = this.state;
    if (!s.homed) throw new Error('Home the axes before moving.');
    if (!['x', 'y', 'z'].includes(axis) || !Number.isFinite(delta)) throw new Error('Invalid axis movement.');
    const to = { ...s.position, [axis]: s.position[axis] + delta };
    if (!reachable(to, s.nozzle === 1)) throw new Error('That move would exceed nozzle or bed travel.');
    if (s.path.length && to.z < (s.job?.file.bounds.z[1] || 0) + 2) throw new Error('Lower the bed for print clearance before jogging.');
    this.#service('Moving axes', Math.max(0.2, dist(s.position, to) / 60), { from: { ...s.position }, to });
  }
  selectNozzle(nozzle) {
    this.#requireIdle();
    if (![0, 1].includes(nozzle)) throw new Error('Unknown nozzle.');
    if (this.state.nozzle !== nozzle) this.#switch(nozzle, () => {});
  }
  editSpool(slot, settings) {
    if (this.busy && this.state.status !== 'fault') throw new Error('Filament profiles are locked while the printer is busy.');
    const previous = this.state.spools[slot];
    if (!previous) throw new Error('That spool does not exist.');
    if (this.state.dryer.time > 0 && slot < 4) throw new Error('Stop drying before changing an AMS spool.');
    const defaults = MATERIALS[settings.material] || {};
    const next = { ...previous, ...defaults, ...settings };
    if (!MATERIALS[next.material] || !/^#[\da-f]{6}$/i.test(next.color) || next.capacity < 1 ||
        ![next.capacity, next.remaining, next.nozzle, next.bed, next.dry, next.dryHours, next.density].every(Number.isFinite) ||
        next.remaining < 0 || next.remaining > next.capacity || next.nozzle < 0 || next.nozzle > 300 ||
        next.bed < 0 || next.bed > 120 || next.dry < 25 || next.dry > 65 || next.dryHours < 1 || next.dryHours > 48 ||
        next.density < 0.5 || next.density > 3) throw new Error('Check the color, temperature, capacity and remaining weight.');
    next.ams = !!(MATERIALS[next.material] || MATERIALS.Custom).ams;
    next.auxiliary = !!(MATERIALS[next.material] || MATERIALS.Custom).auxiliary;
    next.rfid = slot < 4 && next.manufacturer === 'Bambu Lab' && next.material !== 'Custom';
    this.state.spools[slot] = next;
    this.#emit('settings');
  }
  toggleSpool(slot) {
    const s = this.state;
    if (!s.spools[slot]) throw new Error('Unknown spool.');
    if (slot < 4 && !s.lid) throw new Error('Open the AMS lid before exchanging a spool.');
    if ((this.busy && s.status !== 'fault') || (slot < 4 && s.dryer.time > 0)) throw new Error('Wait for the feeder and dryer to stop.');
    if (s.loaded.includes(slot) && s.status !== 'fault') throw new Error('Unload this filament before removing the spool.');
    s.spools[slot].present = !s.spools[slot].present;
    if (!s.spools[slot].present && s.loaded.includes(slot)) s.loaded[slot === 4 ? 1 : 0] = null;
    this.#emit('settings');
  }
  feed(slot, unload = false) {
    this.#requireIdle();
    this.#feed(slot, unload);
  }
  feedBy(mm) {
    this.#requireIdle();
    const s = this.state, slot = s.loaded[s.nozzle];
    if (slot === null || s.temperatures[s.nozzle ? 'right' : 'left'].current < 170) throw new Error('Load filament and heat the selected nozzle to at least 170 °C.');
    if (!Number.isFinite(mm) || Math.abs(mm) > 30) throw new Error('An invalid amount of filament was requested.');
    const spool = s.spools[slot];
    if (mm > 0) {
      const use = grams(mm, spool.density);
      if (spool.remaining < use) throw new Error('The selected filament is empty.');
      spool.remaining -= use;
    }
    spool.rotation += mm / 85;
    this.#emit('settings');
  }
  drying(slot, hours, degrees) {
    this.#requirePower();
    const s = this.state;
    if (s.lid) throw new Error('Close the AMS lid before drying.');
    if (!s.spools[slot]?.present || slot > 3) throw new Error('Select a loaded AMS bay for a drying profile.');
    if (s.feed || s.loaded[0] !== null || (this.active && (!s.dryer.adapter || Object.values(s.job.mapping).some(value => value < 4))))
      throw new Error('Unload the AMS. Independent drying during printing requires external power and a job using only the external spool.');
    if (!Number.isFinite(hours) || hours < 1 || hours > 48 || !Number.isFinite(degrees) || degrees < 35 || degrees > 65)
      throw new Error('Select 1–48 hours and 35–65 °C.');
    Object.assign(s.dryer, { time: hours * 3600, total: hours * 3600, target: degrees });
    this.#emit('dryer');
  }
  stopDrying() { this.state.dryer.time = 0; this.#emit('dryer'); }
  setAdapter() {
    if (this.state.dryer.time) throw new Error('Stop drying before changing the power source.');
    this.state.dryer.adapter = !this.state.dryer.adapter;
    this.#emit('settings');
  }
  setBackup() { this.state.backup = !this.state.backup; this.#emit('settings'); }

  start(file, mapping, { calibrate = true } = {}) {
    this.#requireIdle();
    const s = this.state;
    if (!s.plate || s.path.length) throw new Error('Install an empty build plate before starting.');
    if (!file?.entries?.length || file.error) throw new Error('Choose a printable plate.');
    const tools = Object.keys(file.materials);
    const safeMapping = {};
    for (const tool of tools) {
      const slot = mapping[tool];
      const material = s.spools[slot];
      if (!Number.isInteger(slot) || !compatible(material, slot))
        throw new Error(`Tool T${tool} needs an installed, compatible filament.`);
      if (material.remaining <= 0) throw new Error(`${slotLabel(slot)} is empty.`);
      safeMapping[tool] = slot;
    }
    validateMapping(file, safeMapping);
    if (s.dryer.time && (!s.dryer.adapter || Object.values(safeMapping).some(slot => slot < 4)))
      throw new Error('Stop drying before starting this job.');
    const firstTool = file.entries.find(entry => entry.kind === 'move' && entry.extrusion > 0 && entry.distance > 0).tool;
    const firstSlot = safeMapping[firstTool];
    for (const zone of ['left', 'right']) s.temperatures[zone].target = 0;
    for (const slot of new Set(Object.values(safeMapping))) {
      const zone = slot === 4 ? 'right' : 'left';
      s.temperatures[zone].target = Math.max(s.temperatures[zone].target, s.spools[slot].nozzle);
    }
    s.temperatures.bed.target = Math.max(...Object.values(safeMapping).map(slot => s.spools[slot].bed));
    s.temperatures.chamber.target = file.chamberTarget || 0;
    s.job = { file, mapping: safeMapping, index: 0, elapsed: 0, layer: 0, used: 0,
      estimate: file.declaredTime || file.duration + 130, segment: null, wait: 0, firstSlot, interrupted: '',
      prep: ['Heating', 'Homing', ...(calibrate ? ['Bed leveling', 'Flow calibration'] : []), 'Nozzle cleaning', 'Loading filament'] };
    s.status = 'preparing'; s.phase = 'Heating'; s.lastError = null;
    this.#emit('start');
  }
  pause(message = 'Print paused') {
    if (!['printing', 'preparing'].includes(this.state.status)) throw new Error('There is no running print.');
    const s = this.state;
    s.job.interrupted = s.status; s.status = 'paused'; s.message = message; s.motionSpeed = 0;
    if (!s.service && !s.feed && s.job.interrupted === 'printing') {
      s.job.resumeAt = { ...s.position };
      const z = Math.min(s.nozzle ? 256 : 260, s.position.z + 3);
      const clearance = { ...s.position, z };
      this.#service('Parking', 0.36, { from: s.position, to: clearance, finish: () =>
        this.#service('Parking', 1.25, { from: clearance, to: this.#leftEdge({ ...PARK, z }) }) });
    }
    this.#emit('pause');
  }
  resume() {
    const s = this.state;
    if (!['paused', 'fault'].includes(s.status)) throw new Error('The printer is not paused.');
    if (s.status === 'fault' && s.lastError?.slot !== undefined) {
      const slot = s.lastError.slot, spool = s.spools[slot];
      if (!compatible(spool, slot) || spool.remaining <= 0) throw new Error('Replace or refill the affected spool first.');
    }
    if (s.job.resumeAt && s.service) throw new Error('Wait for the nozzle to park.');
    s.status = s.job.interrupted || 'printing'; s.lastError = null; s.message = 'Resuming print';
    if (s.job.resumeAt) {
      const to = s.job.resumeAt, clearance = { ...to, z: s.position.z };
      this.#service('Returning to print', 1.25, { from: s.position, to: clearance, finish: () =>
        this.#service('Returning to print', 0.36, { from: clearance, to }) });
      s.job.resumeAt = null;
    }
    this.#emit('resume');
  }
  cancel(reason = 'Print canceled') {
    const s = this.state;
    if (!this.active) return;
    const { segment, file, index, mapping, resumeAt } = s.job;
    if (segment?.deposited) {
      const entry = file.entries[index], spool = s.spools[mapping[entry.tool]], to = resumeAt || s.position;
      const bead = { ...entry, to, color: spool.color, finish: spool.finish };
      s.path.push(bead); this.#emit('extrude', bead);
    }
    s.job.segment = null; s.service = null; s.feed = null; s.selector = s.nozzle;
    s.status = 'idle'; s.phase = ''; s.message = reason; s.motionSpeed = 0;
    s.job = null;
    this.#cool();
    this.#emit('cancel');
  }
  injectFailure(name) {
    if (this.state.status !== 'printing') throw new Error('A print must be in progress.');
    const labels = ['Filament tangle', 'Nozzle clog', 'First-layer adhesion', 'Nozzle switch', 'Camera detected spaghetti', 'Temperature deviation'];
    if (!labels.includes(name)) throw new Error('Unknown diagnostic scenario.');
    this.#fault(name, 'Inspect the printer. Resume after clearing the simulated fault.');
  }

  tick(seconds) {
    const s = this.state;
    if (seconds <= 0) return;
    let budget = Math.min(seconds, 0.2) * s.tempo;
    while (budget > 1e-7) {
      const delta = Math.min(budget, 0.22);
      budget -= delta;
      this.#thermal(delta);
      if (!s.power || s.status === 'fault') continue;
      if (s.status === 'paused') {
        if (s.job.resumeAt && s.service) this.#advanceService(delta);
        continue;
      }
      if (s.status === 'booting') {
        s.bootTime -= delta;
        if (s.bootTime <= 0) { s.status = 'idle'; s.message = 'Ready to print'; this.#emit('ready'); }
        continue;
      }
      if (s.job && this.active) s.job.elapsed += delta;
      if (s.service) { this.#advanceService(delta); continue; }
      if (s.feed) { this.#advanceFeed(delta); continue; }
      if (s.status === 'preparing') this.#advancePreparation();
      if (s.status === 'printing') this.#advancePrint(delta);
    }
  }

  #requirePower() {
    if (!this.state.power || this.state.status === 'booting') throw new Error('Wait for the printer to finish starting.');
  }
  #requireIdle() {
    this.#requirePower();
    if (this.busy) throw new Error('Wait for the printer to finish its current operation.');
  }
  #cool() {
    for (const temperature of Object.values(this.state.temperatures)) temperature.target = 0;
  }
  #thermal(dt) {
    const s = this.state;
    for (const [key, value] of Object.entries(s.temperatures)) {
      const target = Math.max(ROOM, value.target);
      const coefficient = THERMAL[key][target > value.current ? 0 : 1];
      const leakage = key === 'chamber' && s.door ? 0.12 * (value.current - ROOM) : 0;
      value.current = Math.max(ROOM, target + (value.current - target) * Math.exp(-dt * coefficient) - dt * leakage);
    }
    const dryer = s.dryer, on = s.power && dryer.time > 0 && !s.lid;
    dryer.temperature += ((on ? dryer.target : ROOM) - dryer.temperature) * (1 - Math.exp(-dt * 0.014));
    if (on) {
      dryer.time = Math.max(0, dryer.time - dt);
      dryer.humidity += (8 - dryer.humidity) * (1 - Math.exp(-dt * 0.0004));
      for (const spool of s.spools.slice(0, 4)) if (spool.present) spool.rotation += dt * 0.17;
      if (!dryer.time) this.#emit('settings');
    }
  }
  #service(label, time, options) {
    this.state.phase = label;
    this.state.service = { elapsed: 0, label, time, ...options };
    this.#emit('mechanism', label);
  }
  #switch(nozzle, finish) {
    const s = this.state;
    const from = { ...s.position }, trigger = { ...TRIGGER, x: TRIGGER.x + X2D.rightTipOffset * s.nozzle / 2,
      z: Math.min(s.nozzle === 1 ? 256 : 260, Math.max(TRIGGER.z, from.z + 2)) };
    this.#service(nozzle ? 'Switching to right nozzle' : 'Switching to left nozzle', 5.5,
      { from, to: trigger, nozzle, fromNozzle: s.nozzle, finish });
  }
  #advanceService(dt) {
    const s = this.state, task = s.service;
    task.elapsed = Math.min(task.time, task.elapsed + dt);
    const f = task.elapsed / task.time;
    if (task.nozzle !== undefined) {
      const reached = Math.min(1, f * 3);
      const switched = Math.max(0, Math.min(1, (f - 0.38) / 0.24));
      const out = Math.max(0, Math.min(1, (f - 0.68) / 0.32));
      s.selector = task.fromNozzle + (task.nozzle - task.fromNozzle) * switched;
      const destination = position(Math.max(task.nozzle ? 20.5 : 0, task.from.x), task.from.y,
        Math.min(task.nozzle ? 256 : 260, task.from.z));
      const atTrigger = { ...task.to, x: task.to.x + (s.selector - task.fromNozzle) * X2D.rightTipOffset * 0.45 };
      s.position = out ? blend(atTrigger, destination, out) : blend(task.from, atTrigger, reached);
      s.motionSpeed = f < 0.35 || f > 0.69 ? 90 : 0;
    } else if (task.probe) {
      const points = [task.from, position(34, 32, 1), position(221, 35, 0.3), position(220, 219, 1),
        position(34, 220, 0.3), position(128, 128, 1), task.to];
      const t = Math.min(f * (points.length - 1), points.length - 1.000001), k = Math.floor(t);
      s.position = blend(points[k], points[k + 1], t - k);
      s.motionSpeed = 60;
    } else if (task.to) {
      s.position = blend(task.from, task.to, f * f * (3 - 2 * f));
      s.motionSpeed = dist(task.from, task.to) / task.time;
    }
    if (f < 1) return;
    if (task.nozzle !== undefined) {
      s.nozzle = task.nozzle; s.selector = s.nozzle;
      s.position = this.#leftEdge({ ...task.from, z: Math.min(task.nozzle ? 256 : 260, task.from.z) });
    }
    else if (task.to) s.position = { ...task.to };
    if (task.label === 'Homing' || task.probe) s.homed = true;
    s.service = null; s.motionSpeed = 0; s.phase = ''; s.message = s.job ? 'Print in progress' : 'Ready to print';
    task.finish?.();
  }
  #feed(slot, unload = false) {
    const s = this.state, nozzle = slot === 4 ? 1 : 0;
    if ((!unload && (!compatible(s.spools[slot], slot) || s.spools[slot].remaining <= 0)) || slot < 0 || slot > 4)
      throw new Error('Install compatible filament in the selected bay.');
    if (slot < 4 && s.dryer.time) throw new Error('Stop drying before feeding AMS filament.');
    if (unload && s.loaded[nozzle] !== slot) throw new Error('This bay is not loaded in its nozzle.');
    const old = s.loaded[nozzle];
    if (!unload && old === slot) return;
    s.feed = { slot: !unload && old !== null ? old : slot, nozzle,
      fraction: unload || old !== null ? 1 : 0, unload: unload || old !== null, next: !unload && old !== null ? slot : null };
    s.phase = s.feed.unload ? 'Retracting filament' : 'Feeding filament';
    this.#emit('mechanism', s.phase);
  }
  #advanceFeed(dt) {
    const s = this.state, task = s.feed;
    const rotation = dt * (task.unload ? -1 : 1);
    s.spools[task.slot].rotation += rotation;
    task.fraction = Math.max(0, Math.min(1, task.fraction + rotation / (task.slot === 4 ? 7 : 10)));
    if (task.unload && task.fraction > 0 || !task.unload && task.fraction < 1) return;
    s.loaded[task.nozzle] = task.unload ? null : task.slot;
    s.feed = null;
    if (task.next !== null) this.#feed(task.next);
    else {
      s.phase = ''; s.message = task.unload ? 'Filament unloaded' : `${slotLabel(task.slot)} loaded`;
      this.#emit('feed');
    }
  }
  #advancePreparation() {
    const s = this.state, job = s.job, phase = job.prep[0];
    if (!phase) { s.status = 'printing'; s.phase = 'Printing'; this.#emit('printing'); return; }
    if (phase === 'Heating') {
      s.phase = phase;
      if (Object.values(s.temperatures).some(t => t.target > ROOM && t.current < t.target - 4)) return;
    }
    if (phase === 'Homing') this.#service(phase, X2D.stageSeconds[phase], { from: { ...s.position }, to: this.#leftEdge(HOME) });
    if (phase === 'Bed leveling') this.#service(phase, X2D.stageSeconds[phase], { from: { ...s.position }, to: this.#leftEdge(HOME), probe: true });
    if (phase === 'Flow calibration' || phase === 'Nozzle cleaning')
      this.#service(phase, X2D.stageSeconds[phase], { from: { ...s.position }, to: this.#leftEdge(PARK) });
    if (phase === 'Loading filament') this.#feed(job.firstSlot);
    job.prep.shift();
  }
  #advancePrint(delta) {
    const s = this.state, job = s.job;
    let budget = delta;
    while (budget > 1e-7 && s.status === 'printing' && !s.service && !s.feed) {
      if (job.wait > 0) {
        const step = Math.min(job.wait, budget); job.wait -= step; budget -= step; continue;
      }
      const entry = job.file.entries[job.index];
      if (!entry) {
        s.status = 'complete'; s.phase = ''; s.motionSpeed = 0; s.message = 'Print complete'; s.fan = 0;
        s.history.unshift({ name: job.file.name, date: new Date().toISOString(), seconds: job.elapsed, grams: job.used });
        s.history.length = Math.min(s.history.length, 30);
        this.#cool();
        const clearance = { ...s.position, z: Math.min(s.nozzle ? 256 : 260, s.position.z + 5) };
        this.#service('Parking', 0.4, { from: s.position, to: clearance, finish: () =>
          this.#service('Parking', 1.15, { from: clearance, to: this.#leftEdge({ ...PARK, z: clearance.z }) }) });
        this.#emit('complete'); return;
      }
      const slot = job.mapping[entry.tool] ?? job.firstSlot;
      const nozzle = slot === 4 ? 1 : 0, zone = nozzle ? 'right' : 'left';
      if (entry.kind === 'control') {
        const advance = this.#execute(entry, zone);
        if (!advance) return;
        job.index++; continue;
      }
      if (s.nozzle !== nozzle) { this.#switch(nozzle, () => {}); return; }
      if (entry.extrusion > 0 && s.loaded[nozzle] !== slot) {
        if (!compatible(s.spools[slot], slot) || s.spools[slot].remaining <= 0) { this.#handleRunout(entry.tool, slot); return; }
        this.#feed(slot); return;
      }
      if (!job.segment) {
        const limits = nozzle ? X2D.auxiliary : X2D.main;
        const inPlace = entry.distance <= 1e-6;
        const to = { ...entry.to };
        const from = { ...s.position };
        const distance = Math.max(dist(from, to), inPlace ? entry.extrusion : 1e-6);
        const rate = entry.extrusion > 0 ? Math.min(limits.printSpeed,
          entry.distance * (nozzle ? 12 : X2D.maxFlow) / Math.max(1e-6, entry.extrusion * area)) : X2D.travel;
        const vertical = Math.abs(to.z - from.z) / distance;
        const speed = Math.max(0.4, Math.min(entry.feed, inPlace ? 10 : rate, X2D.zSpeed / Math.max(vertical, 0.001)));
        const acceleration = Math.min(entry.extrusion > 0 ? limits.acceleration : X2D.travelAcceleration,
          X2D.zAcceleration / Math.max(vertical, 0.001));
        job.segment = { from, to, distance, speed, accel: acceleration, time: duration(distance, speed, acceleration),
          elapsed: 0, fraction: 0, deposited: false };
      }
      const move = job.segment;
      const dt = Math.min(budget, move.time - move.elapsed);
      const next = move.elapsed + dt;
      const fraction = Math.min(1, traveled(move.distance, move.speed, move.accel, next) / move.distance);
      const length = Math.max(0, fraction - move.fraction) * entry.extrusion;
      if (length > 0) {
        const spool = s.spools[slot];
        const use = grams(length, spool.density);
        if (!spool.present || spool.remaining + 1e-9 < use) { this.#handleRunout(entry.tool, slot); return; }
        spool.remaining = Math.max(0, spool.remaining - use); spool.rotation += length / 83; job.used += use;
        if (entry.distance > 1e-6) move.deposited = true;
      }
      s.motionSpeed = dt > 0 ? (fraction - move.fraction) * move.distance / dt : 0;
      s.position = blend(move.from, move.to, fraction);
      s.phase = 'Printing'; job.layer = Math.max(job.layer, entry.layer); budget -= dt;
      move.elapsed = next; move.fraction = fraction;
      if (next >= move.time - 1e-7) {
        s.position = { ...move.to };
        if (move.deposited) {
          const spool = s.spools[slot];
          const bead = { from: entry.from, to: entry.to, width: entry.width, height: entry.height, color: spool.color, finish: spool.finish, layer: entry.layer };
          s.path.push(bead);
          this.#emit('extrude', bead);
        }
        job.index++; job.segment = null;
      }
    }
  }
  #handleRunout(tool, slot) {
    const s = this.state, original = s.spools[slot];
    const next = slot < 4 && s.backup ? s.spools.findIndex((item, i) => i < 4 && i !== slot &&
      compatible(item, i) && item.remaining > 0 && item.color === original.color && item.material === original.material) : -1;
    if (next >= 0) { s.job.mapping[tool] = next; this.#feed(next); return; }
    this.#fault('Filament runout', `Refill ${slotLabel(slot)} to resume.`, slot);
  }
  #fault(name, message, slot) {
    const s = this.state;
    s.lastError = { name, message, slot }; s.job.interrupted = s.status;
    s.status = 'fault'; s.motionSpeed = 0; s.message = message;
    this.#emit('fault', s.lastError);
  }
  #execute(entry, zone) {
    const s = this.state, { code, args } = entry;
    if (code === 'G4') s.job.wait = Math.max(0, Math.min(600, args.S ?? (args.P || 0) / 1000));
    if (['M0', 'M1', 'M25', 'M400'].includes(code)) this.pause('Print paused by the file');
    if (code === 'M106') this.setFan((args.S ?? 255) / 255 * 100);
    if (code === 'M107') this.setFan(0);
    const channel = { M104: zone, M109: zone, M140: 'bed', M190: 'bed', M141: 'chamber', M191: 'chamber' }[code];
    if (channel && (args.S !== undefined || args.R !== undefined)) {
      const target = Math.max(0, Math.min(X2D.temperatures[channel], args.S ?? args.R));
      this.setTemperature(channel, target);
      const current = s.temperatures[channel].current;
      if (['M109', 'M190', 'M191'].includes(code) && target > ROOM &&
        (current < target - 3 || args.R !== undefined && current > target + 3)) {
        s.phase = `Waiting for ${channel} temperature`;
        s.motionSpeed = 0;
        return false;
      }
    }
    return true;
  }
}
