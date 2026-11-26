import './style.css';
import { VirtualPrinter } from './printer.js';
import { createView } from './view.js';
import { createAudio } from './audio.js';
import { listFiles, saveFile, deleteFile, loadPreferences, savePreferences } from './storage.js';
import { DEMOS, loadDemo } from './demos.js';
import { Toolpath } from './toolpath.js';
import { MATERIALS, SPEEDS, slotLabel, compatible, grams, X2D } from './spec.js';
import { button, icon, escape, time, layout } from './ui.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
$('#app').innerHTML = layout();

const settings = loadPreferences();
const printer = new VirtualPrinter(settings.printer, { recordDeposits: false });
const state = printer.state;
const stage = $('#stage'), surface = $('.printer-display'), dialog = $('#modal');
const audio = createAudio(printer);
let quality = ['high', 'medium', 'low'].includes(settings.quality) ? settings.quality :
  matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
let sound = false, cutaway = false, focused = false, currentView = 'studio';
let tab = 'printer', page = 'home', thermalPage = true, selectedSlot = 0, batch = [], batchIndex = 0;
let mapping = {}, pending = false, importController = null, files = [], sourceJob = null, messageTimer, renderingError = false;

const zones = { left: 'Left nozzle', right: 'Right nozzle', bed: 'Build plate', chamber: 'Chamber' };
const views = { studio: 'Studio', front: 'Front', rear: 'Rear', left: 'Left side', right: 'Right side', top: 'Top',
  chamber: 'Chamber', build: 'Build plate', head: 'Printhead', ams: 'AMS 2 Pro', external: 'External spool', camera: 'Chamber camera' };
const statuses = { booting: 'Starting', idle: 'Ready', preparing: 'Preparing', printing: 'Printing', paused: 'Paused',
  fault: 'Attention', complete: 'Completed', off: 'Powered off' };
const issueNames = ['Filament tangle', 'Nozzle clog', 'First-layer adhesion', 'Nozzle switch', 'Camera detected spaghetti', 'Temperature deviation'];
let view;
try { view = createView(stage, surface, printer, physicalAction, quality); }
catch (error) {
  renderingError = true;
  $('.scene-fallback').hidden = false;
  console.warn('WebGL 2 startup failed. The touchscreen remains available.', error);
  stage.append(surface);
}
if (settings.camera in views) setView(settings.camera);
if (SPEEDS.includes(settings.tempo)) printer.setTempo(settings.tempo);

function prefs() {
  savePreferences({ printer: printer.configuration(), quality, camera: currentView, tempo: state.tempo });
}
function notify(message, error = false) {
  const toast = $('.toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', error);
  toast.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { toast.hidden = true; }, 4400);
}
function setView(name) {
  if (!Object.hasOwn(views, name)) return;
  if (focused) enterFocus(false);
  currentView = name;
  $('[data-change="view"]').value = name;
  view?.show(name);
  prefs();
  updateTelemetry();
}
function enterFocus(enter) {
  if (enter === focused) return;
  focused = enter;
  stage.classList.toggle('screen-view', enter);
  if (renderingError) {
    surface.classList.toggle('fallback-focus', enter);
    surface.classList.toggle('focused', enter);
  }
  view?.show(enter ? 'screen' : 'exit');
  if (enter) {
    if (renderingError) surface.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!renderingError) stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  updateTelemetry();
}
function openPage(next, focus = true) {
  page = next;
  if (focus) enterFocus(true);
  renderScreen();
}
function setTab(next) { tab = next; renderInspector(); }
function physicalAction(action) {
  if (action === 'ams' || action === 'lid') {
    setView('ams');
    setTab('filament');
    if (action === 'lid') runAction('lid').catch(error => notify(error.message, true));
    return;
  }
  if (action === 'head') { setView('head'); return; }
  if (action === 'external') { setView('external'); setTab('filament'); return; }
  if (action.startsWith('slot-')) { selectSpool(Number(action.slice(5))); return; }
  runAction(action).catch(error => notify(error.message, true));
}
function selectSpool(slot) {
  selectedSlot = slot;
  setTab('filament');
  openSpoolDialog(slot);
}
function heading(title, detail) {
  return `<div class="inspector-heading"><h1>${title}</h1><p>${detail}</p></div>`;
}
function temperatureCard() {
  return `<div class="thermal-grid">${Object.entries(zones).map(([key, label]) =>
    `<button class="thermal-item" data-action="panel-thermal" aria-label="Adjust ${label} temperature">
      <span>${label}</span><strong data-text="temp-${key}">23°</strong><small data-text="target-${key}">Off</small></button>`).join('')}</div>`;
}
function progressCard() {
  return `<div class="progress-panel"><span data-text="job-name">Print job</span><strong data-text="percent">0%</strong>
    <progress data-progress max="100" value="0"></progress><small data-text="job-detail"></small>
    <div class="row" data-print-buttons>${jobButtons(false)}</div></div>`;
}
function jobButtons(screen) {
  if (!printer.active) return state.depositedCount ? button('Remove print', 'remove', 'layers', 'secondary') : '';
  const stopped = ['paused', 'fault'].includes(state.status);
  return button(stopped ? 'Resume' : 'Pause', stopped ? 'resume' : 'pause', stopped ? 'play' : 'pause', screen ? 'touch-strong' : 'secondary') +
    button('Cancel', 'cancel', 'stop', screen ? '' : 'secondary');
}
function renderInspector() {
  $$('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.action === `tab:${tab}`)));
  let html;
  if (tab === 'printer') html = heading('Printer', 'Bambu Lab X2D Combo') + `
    <section class="card live-card"><div class="card-title">${icon('cube')}<h2>Machine status</h2></div>
      <div class="machine-line"><span class="live-dot"></span><strong data-text="status">Ready</strong><span data-text="phase">Idle</span></div>
      ${state.job || state.depositedCount ? progressCard() : ''}
      ${button('Open touchscreen', 'screen', 'monitor', 'secondary wide')}</section>
    <section class="card"><div class="card-title">${icon('temp')}<h2>Temperature</h2></div>${temperatureCard()}</section>
    <section class="card quick-card"><div class="card-title">${icon('sliders')}<h2>Quick controls</h2></div>
      <div class="quick-grid">${button('Home axes', 'home', 'home')}${button('Chamber light', 'lamp', 'light')}
      ${button('Power', 'power', 'power')}${button('Camera', 'view:camera', 'lens')}</div></section>
    ${!state.job && !state.depositedCount ? `<button class="feature" data-action="demo:benchy"><span class="feature-icon">${icon('play')}</span><span><strong>Print 3DBenchy</strong><small>Ready-to-print example</small></span>${icon('arrow')}</button>` : ''}`;
  if (tab === 'filament') html = heading('Filament', 'AMS 2 Pro and external spool') + `
    <section class="card"><div class="card-title">${icon('spool')}<h2>AMS 2 Pro</h2>${button('', 'view:ams', 'focus', 'icon-button', 'Focus AMS')}</div>
      <div class="spool-list">${state.spools.slice(0, 4).map((s, i) => spoolRow(s, i)).join('')}</div>
      <div class="row">${button(state.lid ? 'Close lid' : 'Open lid', 'lid', 'door', 'secondary')}${button('Drying', 'page:drying', 'temp', 'secondary')}</div>
      <div class="muted dryer-data" data-text="dryer"></div></section>
    <section class="card"><div class="card-title">${icon('spool')}<h2>External spool</h2>${button('', 'view:external', 'focus', 'icon-button', 'Focus external spool')}</div>
      ${spoolRow(state.spools[4], 4)}<p class="muted">Feeds the right auxiliary nozzle.</p></section>`;
  if (tab === 'files') html = heading('Print files', 'Local storage and example jobs') + `
    ${button('Import 3MF or G-code', 'upload', 'upload', 'primary wide')}
    <section class="file-section"><h2>Example prints</h2>${DEMO_LIST(false)}</section>
    <section class="file-section"><h2>Imported files</h2>${importList(false)}</section>
    ${state.history.length ? `<section class="file-section"><h2>Completed prints</h2>${state.history.slice(0, 8).map(job =>
      `<p class="history"><span>${escape(job.name)}</span><small>${time(job.seconds)} · ${job.grams.toFixed(1)} g</small></p>`).join('')}</section>` : ''}`;
  $('.inspector-page').innerHTML = html;
  $('[data-change="tempo"]').innerHTML = speedOptions();
  updateTelemetry();
}
function speedOptions() { return SPEEDS.map(value => `<option value="${value}" ${state.tempo === value ? 'selected' : ''}>${value}×</option>`).join(''); }
function spoolRow(s, i) {
  const loaded = state.loaded.includes(i) ? ' · Loaded' : s.rfid && s.present ? ' · RFID' : '';
  return `<button class="spool-row" data-action="edit-spool:${i}">
    <i style="--filament:${escape(s.color)}"></i><span><strong>${slotLabel(i)}</strong><small>${s.present ? escape(s.material) + loaded : 'Empty bay'}</small></span>
    <span class="spool-mass" data-text="mass-${i}">${s.present ? Math.round(s.remaining) + ' g' : '—'}</span>${icon('arrow')}</button>`;
}
function DEMO_LIST(touch) {
  return DEMOS.map(demo => `<button class="file-row" data-action="demo:${demo.id}">
    <span class="file-thumb" style="--file-color:${demo.color}">${demo.id === 'benchy' ? '<img src="./jobs/benchy.webp" alt="">' : icon(demo.id === 'cube' ? 'cube' : 'layers')}</span>
    <span><strong>${demo.name}</strong><small>${demo.detail}</small></span>${touch ? '' : icon('arrow')}</button>`).join('');
}
function importList(touch) {
  if (!files.length) return '<p class="muted">Your imported files will appear here.</p>';
  return files.map(f => `<div class="import-row"><button class="file-row" data-action="local:${f.id}">
    <span class="file-thumb">${icon('folder')}</span><span><strong>${escape(f.name)}</strong><small>${Math.max(1, Math.round(f.blob.size / 1024))} KB</small></span></button>
    ${touch ? '' : button('', `delete-file:${f.id}`, 'x', 'icon-button', 'Delete saved file')}</div>`).join('');
}

function sectionTitle(name, body, extra = '') {
  return `<div class="touch-heading"><h2>${name}</h2>${extra}</div><div class="touch-scroll">${body}</div>`;
}
function renderScreen() {
  const body = $('.screen-body');
  if (state.status === 'off' || state.status === 'booting') {
    body.innerHTML = `<div class="touch-boot${state.status === 'off' ? ' powered-off' : ''}">${icon('layers')}<strong>X2D Print Lab</strong><span>${state.status === 'off' ? 'Printer powered off' : 'Starting printer…'}</span>
      ${state.status === 'off' ? button('Power on', 'power', 'power', 'touch-strong') : '<div class="boot-line"></div>'}</div>`;
    return;
  }
  const screenNav = [['home', 'home', 'Overview'], ['controls', 'sliders', 'Controls'], ['filament', 'spool', 'Filament'],
    ['files', 'folder', 'Print files'], ['system', 'gear', 'Settings']];
  const sidebar = `<nav class="touch-nav" aria-label="Touchscreen pages">${screenNav.map(([id, glyph, title]) =>
    `<button data-action="page:${id}" aria-label="${title}" title="${title}" aria-pressed="${page === id ||
      id === 'files' && page === 'prepare' || id === 'filament' && page === 'drying'}">${icon(glyph)}</button>`).join('')}</nav>`;
  let content;
  if (page === 'home') content = sectionTitle('Overview', `
    <section class="touch-status"><span class="live-dot"></span><div><strong data-text="status">Ready</strong><small data-text="message"></small></div>
      ${button('', 'page:messages', 'info', '', 'Messages')}</section>
    ${state.job || state.depositedCount ? progressCard() : `<div class="touch-tiles">${button('Print files', 'page:files', 'folder')}
      ${button('Nozzle &amp; extruder', 'page:nozzles', 'temp')}${button('Filament', 'page:filament', 'spool')}${button('Chamber light', 'lamp', 'light')}</div>`}`);
  if (page === 'controls') content = sectionTitle('Printer controls', `
    <div class="touch-row">${button('Temperature', 'thermal', 'temp', thermalPage ? 'touch-strong' : '')}${button('Move axes', 'motion', 'sliders', thermalPage ? '' : 'touch-strong')}
      ${button('Nozzle &amp; extruder', 'page:nozzles', 'spool')}</div>
    ${thermalPage ? tempForm() : moveForm()}
    <div class="touch-row">${button('Chamber light', 'lamp', 'light')}${button('Camera', 'view:camera', 'lens')}
    </div><div class="touch-fan-controls">${[['Part fan', 1, state.fan], ['Auxiliary fan', 2, state.fanOverrides.auxiliary],
      ['Chamber exhaust', 3, state.fanOverrides.exhaust]].map(([name, channel, value]) =>
      `<label>${name}<input data-change="fan" data-fan="${channel}" type="range" min="0" max="100" value="${value ?? 0}" aria-label="${name} speed"></label>`).join('')}</div>`);
  if (page === 'nozzles') content = sectionTitle('Nozzle &amp; extruder', `
    <div class="touch-row">${button('Left · Direct drive', 'nozzle:0', 'check', state.nozzle === 0 ? 'touch-strong' : '')}
      ${button('Right · Auxiliary', 'nozzle:1', 'check', state.nozzle === 1 ? 'touch-strong' : '')}</div>
    ${tempForm(['left', 'right'])}
    <div class="touch-row">${button('Extrude 10 mm', 'extrude:10', 'arrow')}${button('Retract 10 mm', 'extrude:-10', 'back')}
      ${button('Inspect toolhead', 'view:head', 'focus')}</div>`);
  if (page === 'filament') content = sectionTitle('Filament', `
    <div class="touch-row">${button('AMS drying', 'page:drying', 'temp')}${button(state.lid ? 'Close lid' : 'Open lid', 'lid', 'door')}</div>
    <div class="touch-slots">${state.spools.map((spool, slot) => `<div class="touch-slot">
      <button class="touch-spool" data-action="spool:${slot}" aria-pressed="${selectedSlot === slot}">
        <i style="--filament:${escape(spool.color)}"></i><strong>${slotLabel(slot)}</strong>
        <small>${spool.present ? escape(spool.material) : 'Empty'}</small><small data-text="mass-${slot}"></small></button></div>`).join('')}</div>
    <p class="muted">Selected: ${slotLabel(selectedSlot)} · ${selectedSlot === 4 ? 'Right auxiliary nozzle' : 'Left direct-drive nozzle'}</p>
    <div class="touch-row">${button('Load', 'load', 'play', 'touch-strong')}${button('Unload', 'unload', 'back')}${button('Edit profile', `edit-spool:${selectedSlot}`, 'sliders')}</div>`);
  if (page === 'drying') content = sectionTitle('AMS drying', `
    <p class="drying-detail" data-text="dryer"></p>
    <form class="dry-form" data-form="drying">
      <label>Profile<select name="slot" required data-change="dry-slot">${state.spools.slice(0, 4).map((s, i) =>
        `<option value="${i}" ${i === selectedSlot ? 'selected' : ''}>${slotLabel(i)} · ${escape(s.material)}</option>`).join('')}</select></label>
      <label>Target °C<input name="degrees" type="number" min="35" max="65" value="${state.spools[Math.min(3, selectedSlot)].dry}" required></label>
      <label>Hours<input name="hours" type="number" min="1" max="48" value="${state.spools[Math.min(3, selectedSlot)].dryHours}" required></label>
      <button class="touch-strong" type="submit">Start drying</button></form>
    <div class="touch-row">${button('Stop drying', 'stop-drying', 'stop')}${button(state.dryer.adapter ? 'Adapter connected' : 'Connect virtual adapter', 'adapter', 'power')}</div>`);
  if (page === 'files') content = sectionTitle('Print files', `
    <div class="touch-row">${button('Import a file', 'upload', 'upload', 'touch-strong')}</div>
    <div class="touch-files">${DEMO_LIST(true)}${importList(true)}</div>`);
  if (page === 'prepare') content = sectionTitle('Prepare print', prepare());
  if (page === 'system') content = sectionTitle('Printer settings', `
    <div class="touch-tiles">${button('Calibrate bed', 'calibrate', 'focus')}${button('System messages', 'page:messages', 'info')}
    ${button('Open door', 'door', 'door')}${button(state.plate ? 'Remove plate' : 'Install plate', 'plate', 'layers')}
    ${button(state.backup ? 'Spool backup enabled' : 'Spool backup disabled', 'backup', 'spool')}${button('Power off', 'power', 'power')}</div>
    <p class="muted">Local simulator · No physical printer connection</p>`);
  if (page === 'messages') content = sectionTitle('System messages', `
    <div class="touch-status">${icon(state.lastError ? 'warning' : 'info')}<div><strong>${escape(state.lastError?.name || 'Printer status')}</strong>
    <small>${escape(state.lastError?.message || state.message)}</small></div></div>
    ${printer.active ? `<div class="touch-row">${jobButtons(true)}</div>` : ''}`);
  body.innerHTML = sidebar + `<div class="touch-main">${content || ''}</div>`;
  if (page === 'prepare') paintPreview();
  updateTelemetry();
}
function tempForm(selected = Object.keys(zones)) {
  return `<div class="touch-temps">${selected.map(key => `<form data-form="temperature" data-zone="${key}">
    <label>${zones[key]} <strong data-text="temp-${key}">23°</strong><input type="number" min="0" max="${X2D.temperatures[key]}" name="degrees"
    value="${state.temperatures[key].target}" required aria-label="${zones[key]} target temperature"></label><button type="submit">Set</button></form>`).join('')}</div>`;
}
function moveForm() {
  return `<div class="move-grid">${['x', 'y', 'z'].map(axis => `<div><strong>${axis.toUpperCase()}</strong>${[-10, -1, 1, 10].map(step =>
    button(step > 0 ? '+' + step : step, `move:${axis},${step}`)).join('')}</div>`).join('')}</div>
    <div class="touch-row">${button('Home axes', 'home', 'home', 'touch-strong')}${button('Level bed', 'calibrate', 'focus')}</div>`;
}

function prepare() {
  if (pending) return `<p class="empty-state" role="status">Reading toolpaths…</p>
    ${importController ? button('Cancel import', 'cancel-import', 'x', 'secondary') : ''}`;
  const job = batch[batchIndex];
  if (!job) return '<p class="empty-state">Choose a file to prepare.</p>';
  const plates = batch.length > 1 ? `<label class="inline-label">Plate<select data-change="plate-job">${batch.map((job, i) =>
    `<option value="${i}" ${batchIndex === i ? 'selected' : ''}>Plate ${job.plate ?? i + 1}${job.error ? ' (incompatible)' : ''}</option>`).join('')}</select></label>` : '';
  if (job.error) return plates + `<p class="empty-state">${escape(job.error)}</p>`;
  const mats = Object.entries(job.materials);
  const est = mats.reduce((sum, [key, length]) => sum + grams(length, state.spools[mapping[key]]?.density || 1.24), 0);
  const estimate = time(job.declaredTime || job.duration + 130);
  return `${plates}<div class="prep-grid"><div>${job.thumbnail ? '<img class="job-preview" alt="Plate thumbnail">' :
    '<canvas class="job-preview" width="350" height="212" role="img" aria-label="Preview of the extrusion toolpaths"></canvas>'}
    <strong>${escape(job.name)}</strong><small>${job.locallySliced ? 'Locally sliced · ' : ''}${job.layers} layers · ~${estimate} · ${est.toFixed(1)} g</small></div>
    <div class="mapping">${mats.map(([tool]) => `<label>T${tool}${job.requirements?.[tool]?.type ? ` · ${escape(job.requirements[tool].type)}` : ''}<select data-change="map" data-tool="${tool}">${state.spools.map((s, i) =>
      `<option value="${i}" ${mapping[tool] === i ? 'selected' : ''} ${!compatible(s, i) ? 'disabled' : ''}>${slotLabel(i)} · ${escape(s.material)}</option>`).join('')}</select></label>`).join('')}
    <label class="check-label"><input id="calibrate-print" type="checkbox" checked> Level bed and calibrate</label>
    ${button('Start print', 'start', 'play', 'touch-strong')}${job.skipped ? '<small>Firmware-specific commands are simulated where supported.</small>' : ''}</div></div>`;
}
function paintPreview() {
  const job = batch[batchIndex], canvas = $('.job-preview');
  if (!job || !canvas) return;
  if (job.thumbnail) {
    const url = URL.createObjectURL(job.thumbnail);
    canvas.onload = canvas.onerror = () => URL.revokeObjectURL(url);
    canvas.src = url;
    return;
  }
  const ctx = canvas.getContext('2d'), width = canvas.width, height = canvas.height;
  ctx.fillStyle = '#edf3ef'; ctx.fillRect(0, 0, width, height);
  const b = job.bounds;
  const center = { x: (b.x[0] + b.x[1]) / 2, y: (b.y[0] + b.y[1]) / 2, z: (b.z[0] + b.z[1]) / 2 };
  const factor = 155 / Math.max(b.x[1] - b.x[0], b.y[1] - b.y[0], b.z[1] - b.z[0], 1);
  const project = p => [width / 2 + ((p.x - center.x) * 0.78 - (p.y - center.y) * 0.68) * factor,
    height / 2 + ((p.x - center.x) * 0.35 + (p.y - center.y) * 0.36 - (p.z - center.z)) * factor];
  const stride = Math.max(1, Math.ceil(job.entries.length / 35000));
  ctx.lineWidth = 1.07;
  for (let i = 0; i < job.entries.length; i += stride) {
    const move = job.entries.at(i);
    if (!(move.extrusion > 0 && move.distance)) continue;
    ctx.strokeStyle = state.spools[mapping[move.tool]]?.color || '#9ad6b0';
    ctx.globalAlpha = 0.44 + 0.4 * (move.layer / Math.max(1, job.layers));
    ctx.beginPath(); ctx.moveTo(...project(move.from)); ctx.lineTo(...project(move.to)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function configureMapping() {
  const job = batch[batchIndex];
  mapping = {};
  if (!job?.materials) return;
  for (const tool of Object.keys(job.materials)) {
    const target = (sourceJob === 'dual' && tool === '1' || job.toolNozzles?.[tool] === 1) ? 4 : Number(tool) % 4;
    mapping[tool] = target;
    if (!compatible(state.spools[target], target) && target < 4) {
      const fallback = state.spools.findIndex((s, i) => i < 4 && compatible(s, i));
      if (fallback !== -1) mapping[tool] = fallback;
    }
  }
}
async function selectJob(loader, source) {
  if (pending) return;
  pending = true;
  importController = source === 'import' || source === 'local' ? new AbortController() : null;
  sourceJob = source;
  openPage('prepare');
  try {
    batch = await loader(importController?.signal);
    batchIndex = Math.max(0, batch.findIndex(job => !job.error));
    configureMapping();
  } catch (error) {
    batch = [];
    batchIndex = 0;
    if (error.name === 'AbortError') {
      if (page === 'prepare') page = 'files';
    } else {
      batch = [{ error: error.message }];
      notify(error.message, true);
    }
  } finally {
    pending = false;
    importController = null;
    renderScreen();
  }
}
async function readFile(file, signal) {
  const buffer = await file.arrayBuffer();
  signal.throwIfAborted();
  const plates = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./files-worker.js', import.meta.url), { type: 'module' });
    function close() {
      signal.removeEventListener('abort', cancel);
      worker.terminate();
    }
    function cancel() { close(); reject(signal.reason); }
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => {
      close();
      if (data.error) reject(new Error(data.error));
      else resolve(data.plates);
    };
    worker.onerror = () => { close(); reject(new Error('The print file reader could not be started.')); };
    worker.postMessage({ name: file.name, buffer }, [buffer]);
  });
  for (const plate of plates) if (plate.entries) plate.entries = new Toolpath(plate.entries);
  return plates;
}
async function importFiles(uploads) {
  if (!uploads.length || pending) return;
  const activeFile = uploads[0];
  if (activeFile.size > 64 * 1024 ** 2) { notify('Choose a print file under 64 MB.', true); return; }
  await selectJob(async signal => {
    const plates = await readFile(activeFile, signal);
    const stored = { id: crypto.randomUUID(), name: activeFile.name, blob: activeFile, date: Date.now() };
    files = [stored, ...files];
    try { await saveFile(stored); }
    catch { notify('File opened. This browser could not save it for future sessions.', true); }
    return plates;
  }, 'import');
  setTab('files');
}

function openDialog(title, body) {
  dialog.innerHTML = `<div class="dialog-heading"><h2>${title}</h2>${button('', 'close-modal', 'x', 'icon-button', 'Close')}</div>${body}`;
  if (!dialog.open) dialog.showModal();
}
function openSpoolDialog(slot) {
  const s = state.spools[slot];
  const fields = [['Capacity (g)', 'capacity', 1, 5000], ['Remaining (g)', 'remaining', 0, 5000, 0.01], ['Nozzle (°C)', 'nozzle', 0, 300],
    ['Bed (°C)', 'bed', 0, 120], ['Drying (°C)', 'dry', 25, 65], ['Drying (hours)', 'dryHours', 1, 48], ['Density (g/cm³)', 'density', 0.5, 3, 0.01]];
  const input = ([title, name, min, max, step = 1]) => `<label>${title}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}"
    value="${name === 'remaining' ? s[name].toFixed(2) : s[name]}" required></label>`;
  openDialog(`${slotLabel(slot)} filament`, `<form data-form="filament" data-slot="${slot}" class="spool-form">
    <label>Material<select name="material" data-change="material">${Object.keys(MATERIALS).map(name =>
      `<option ${s.material === name ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label>
    <label>Manufacturer<input name="manufacturer" value="${escape(s.manufacturer)}" maxlength="50" required></label>
    <label>Filament color<input name="colorPicker" type="color" value="${escape(s.color)}" data-change="picker"></label>
    <label>Hex color<input name="color" value="${escape(s.color)}" pattern="#[0-9A-Fa-f]{6}" maxlength="7" required></label>
    <label>Surface finish<select name="finish">${['Matte', 'Satin', 'Gloss', 'Silk', 'Translucent', 'Metallic', 'Carbon fiber'].map(name =>
      `<option ${s.finish === name ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
    ${fields.map(input).join('')}
    <p class="form-help">${s.rfid ? 'Bambu profile recognized by virtual RFID.' : 'Manual filament profile.'}</p>
    <div class="row full-row"><button class="primary" type="submit">Save filament</button>
    ${button(s.present ? 'Remove spool' : 'Install spool', `exchange:${slot}`, 'spool', 'secondary')}
    ${button(state.loaded.includes(slot) ? 'Unload' : 'Load', `feed-dialog:${slot}`, 'play', 'secondary')}</div></form>`);
}
function openSettings() {
  openDialog('Simulator settings', `<div class="settings-body"><label>Graphics quality<select data-change="quality">${['high', 'medium', 'low'].map(q =>
    `<option value="${q}" ${q === quality ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></label>
    <label>Inject a print interruption<select data-change="fault"><option value="">Select scenario</option>${issueNames.map(name => '<option>' + name + '</option>').join('')}</select></label>
    <p class="muted">Fault scenarios are available during printing. This independent simulator models controls and motion from public references.</p></div>`);
}

async function runAction(command) {
  const [action, arg] = command.split(':');
  switch (action) {
    case 'tab': setTab(arg); return;
    case 'screen': enterFocus(true); return;
    case 'exit': enterFocus(false); return;
    case 'view': setView(arg); return;
    case 'inspect': cutaway = !cutaway; view?.setInspection(cutaway); break;
    case 'audio': sound = await audio.enable(!sound); break;
    case 'door': printer.setDoor(); break;
    case 'lid': printer.setLid(); break;
    case 'plate': printer.setPlate(); break;
    case 'lamp': printer.setLight(); break;
    case 'home': printer.home(); break;
    case 'calibrate': printer.calibrate(); break;
    case 'power': printer.power(); break;
    case 'fullscreen':
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.requestFullscreen) await stage.requestFullscreen();
      else { document.body.classList.toggle('ios-fullscreen'); }
      break;
    case 'capture': {
      if (!view) throw new Error('The 3D view must be available to capture an image.');
      const anchor = document.createElement('a'); anchor.href = view.capture(); anchor.download = 'x2d-print-lab.png'; anchor.click(); return;
    }
    case 'page': openPage(arg); return;
    case 'panel-thermal': thermalPage = true; openPage('controls'); return;
    case 'thermal': thermalPage = true; break;
    case 'motion': thermalPage = false; break;
    case 'move': { const [axis, amount] = arg.split(','); printer.jog(axis, Number(amount)); break; }
    case 'nozzle': printer.selectNozzle(Number(arg)); break;
    case 'extrude': printer.feedBy(Number(arg)); break;
    case 'spool': selectedSlot = Number(arg); break;
    case 'edit-spool': selectedSlot = Number(arg); openSpoolDialog(selectedSlot); return;
    case 'exchange': printer.toggleSpool(Number(arg)); dialog.close(); break;
    case 'feed-dialog': {
      const slot = Number(arg);
      printer.feed(slot, state.loaded.includes(slot)); dialog.close(); break;
    }
    case 'load': printer.feed(selectedSlot); break;
    case 'unload': printer.feed(selectedSlot, true); break;
    case 'stop-drying': printer.stopDrying(); break;
    case 'adapter': printer.setAdapter(); break;
    case 'backup': printer.setBackup(); break;
    case 'settings': openSettings(); return;
    case 'close-modal': dialog.close(); return;
    case 'upload': $('#import').click(); return;
    case 'cancel-import': importController?.abort(); return;
    case 'demo': await selectJob(async () => [await loadDemo(arg)], arg); return;
    case 'local': {
      const file = files.find(f => f.id === arg);
      if (file) await selectJob(signal => readFile(file.blob, signal), 'local');
      return;
    }
    case 'delete-file':
      openDialog('Delete imported file?', `<div class="confirm"><p>Remove this file from the simulated printer’s storage?</p>
        ${button('Delete file', `confirmed-delete:${arg}`, 'x', 'danger')}${button('Keep file', 'close-modal', '', 'secondary')}</div>`); return;
    case 'confirmed-delete':
      await deleteFile(arg); files = files.filter(f => f.id !== arg); dialog.close(); break;
    case 'start':
      printer.start(batch[batchIndex], mapping, { calibrate: $('#calibrate-print')?.checked ?? true });
      page = 'home'; setTab('printer'); break;
    case 'pause': printer.pause(); break;
    case 'resume': printer.resume(); break;
    case 'cancel':
      openDialog('Cancel this print?', `<div class="confirm"><p>The part on the build plate will be kept until removed.</p>
        ${button('Cancel print', 'confirmed-cancel', 'stop', 'danger')}${button('Keep printing', 'close-modal', '', 'secondary')}</div>`); return;
    case 'confirmed-cancel': printer.cancel(); dialog.close(); break;
    case 'remove': printer.removePrint(); break;
    default: return;
  }
  prefs();
  renderInspector();
  renderScreen();
}

function updateTelemetry() {
  const job = state.job;
  const phase = state.phase || (state.status === 'idle' ? 'Standby' : '');
  const dryer = state.dryer;
  const percent = Math.round(printer.progress * 100);
  const data = {
    status: statuses[state.status], phase, message: state.lastError?.message || state.phase || state.message,
    view: focused ? 'PRINTER TOUCHSCREEN' : `${views[currentView].toUpperCase()}${currentView === 'camera' ? '' : ' VIEW'}`,
    xyz: ['x', 'y', 'z'].map(axis => `${axis.toUpperCase()} ${state.position[axis].toFixed(1)}`).join(' · '),
    'job-name': job?.file.name || 'Part on build plate',
    percent: `${percent}%`,
    'job-detail': job ? `Layer ${job.layer} / ${job.file.layers} · ${job.used.toFixed(1)} g${printer.active ? ' · ~' + time(Math.max(0, job.estimate - job.elapsed)) + ' remaining' : ''}` : '',
    dryer: `${Math.round(dryer.temperature)} °C · ${Math.round(dryer.humidity)}% RH${dryer.time ? ' · ' + time(dryer.time) + ' left' : ' · Idle'}`,
  };
  for (const [zone, thermal] of Object.entries(state.temperatures)) {
    data[`temp-${zone}`] = `${Math.round(thermal.current)}°`;
    data[`target-${zone}`] = thermal.target ? `Target ${thermal.target}°` : 'Off';
  }
  state.spools.forEach((s, i) => { data[`mass-${i}`] = s.present ? `${Math.round(s.remaining)} g` : '—'; });
  for (const node of $$('[data-text]')) {
    const next = data[node.dataset.text] ?? '';
    if (node.textContent !== next) node.textContent = next;
  }
  $$('[data-progress]').forEach(bar => { bar.value = percent; });
  $('.status-pill').dataset.status = state.status;
  for (const [action, enabled] of [['door', state.door], ['lid', state.lid], ['inspect', cutaway], ['lamp', state.lights], ['power', state.power]]) {
    $$(`button[data-action="${action}"]`).forEach(b => b.setAttribute('aria-pressed', String(enabled)));
  }
  const soundButton = $('button[data-action="audio"]');
  if (soundButton.dataset.on !== String(sound)) {
    soundButton.innerHTML = icon(sound ? 'audio' : 'mute');
    soundButton.dataset.on = String(sound);
    soundButton.title = sound ? 'Mute sound' : 'Enable sound';
    soundButton.setAttribute('aria-label', soundButton.title);
  }
}

document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (control) runAction(control.dataset.action).catch(error => notify(error.message, true));
});
document.addEventListener('change', event => {
  const input = event.target, change = input.dataset.change;
  if (!change) return;
  try {
    if (change === 'view') setView(input.value);
    if (change === 'tempo') { printer.setTempo(Number(input.value)); prefs(); }
    if (change === 'fan') printer.setFan(input.value, Number(input.dataset.fan));
    if (change === 'quality') { quality = input.value; view?.setQuality(quality); prefs(); }
    if (change === 'fault' && input.value) { printer.injectFailure(input.value); dialog.close(); }
    if (change === 'plate-job') { batchIndex = Number(input.value); configureMapping(); renderScreen(); }
    if (change === 'map') { mapping[input.dataset.tool] = Number(input.value); renderScreen(); }
    if (change === 'picker') input.form.elements.color.value = input.value;
    if (change === 'dry-slot') {
      const s = state.spools[Number(input.value)];
      input.form.elements.degrees.value = s.dry; input.form.elements.hours.value = s.dryHours;
    }
    if (change === 'material') {
      const m = MATERIALS[input.value];
      for (const key of ['nozzle', 'bed', 'dry', 'density', 'finish']) input.form.elements[key].value = m[key];
    }
  } catch (error) { notify(error.message, true); }
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const entries = Object.fromEntries(new FormData(form));
  try {
    if (form.dataset.form === 'temperature') printer.setTemperature(form.dataset.zone, Number(entries.degrees));
    if (form.dataset.form === 'drying') printer.drying(Number(entries.slot), Number(entries.hours), Number(entries.degrees));
    if (form.dataset.form === 'filament') {
      delete entries.colorPicker;
      for (const key of ['capacity', 'remaining', 'nozzle', 'bed', 'dry', 'dryHours', 'density']) entries[key] = Number(entries[key]);
      printer.editSpool(Number(form.dataset.slot), entries);
      dialog.close();
    }
    renderInspector(); renderScreen(); prefs();
  } catch (error) { notify(error.message, true); }
});
$('#import').addEventListener('change', event => { importFiles([...event.target.files]); event.target.value = ''; });
for (const event of ['dragover', 'drop']) {
  document.addEventListener(event, e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (event === 'drop') importFiles([...e.dataTransfer.files]);
  });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !dialog.open) {
    if (focused) enterFocus(false);
    else document.body.classList.remove('ios-fullscreen');
  }
});

printer.subscribe((event, data) => {
  if (['ready', 'power', 'settings', 'dryer', 'feed', 'start', 'pause', 'resume', 'fault', 'cancel', 'complete', 'clear'].includes(event)) {
    queueMicrotask(() => {
      if (event === 'fault') { page = 'messages'; notify(data.message, true); }
      renderInspector(); renderScreen();
      if (['settings', 'complete', 'cancel', 'power', 'clear'].includes(event)) prefs();
    });
  }
});
renderInspector(); renderScreen();
listFiles().then(saved => { files = saved.sort((a, b) => b.date - a.date); renderInspector(); renderScreen(); }).catch(() => {});
setInterval(() => { if (printer.active || state.dryer.time) prefs(); }, 10000);
window.addEventListener('pagehide', prefs);
let frameAt = performance.now(), telemetryAt = 0;
function frame(now) {
  const dt = Math.max(0, (now - frameAt) / 1000);
  frameAt = now;
  printer.tick(dt);
  view?.render(now, Math.min(dt, 0.3));
  if (now - telemetryAt > 130) { updateTelemetry(); audio.update(); telemetryAt = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.x2d = Object.freeze({
  version: 1,
  getTelemetry: () => printer.telemetry(),
  subscribe: listener => printer.subscribe((event, data) => listener(event, structuredClone(data), printer.telemetry())),
  getCameraFrame: () => view?.capture() ?? null,
  command: async (name, ...args) => {
    const commands = {
      start: () => printer.start(...args), pause: () => printer.pause(), resume: () => printer.resume(), cancel: () => printer.cancel(),
      home: () => printer.home(), calibrate: () => printer.calibrate(), jog: () => printer.jog(...args),
      setTemperature: () => printer.setTemperature(...args), setNozzle: () => printer.selectNozzle(...args),
      setTempo: () => printer.setTempo(...args), setLight: () => printer.setLight(), feed: () => printer.feed(...args),
      setDrying: () => printer.drying(...args), stopDrying: () => printer.stopDrying(),
    };
    if (!Object.hasOwn(commands, name)) throw new Error('Unknown virtual printer command.');
    return commands[name]();
  },
});
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(new URL('./sw.js', location.href)).catch(error =>
    console.warn('Offline installation could not start.', error)));
}
