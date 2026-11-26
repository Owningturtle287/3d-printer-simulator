import * as THREE from 'three';
import { X2D, coreXY, coolingTargets } from './spec.js';
import { V, metal, plastic, body, edge, rubber, ebon, steel, zinc, gasket, glass, tinted,
  add, box, cy, group, mark, grain, label, screw, tube } from './model-parts.js';
import { makeAxialFan, animateFan } from './fans.js';
import { makeToolhead, animateToolhead, plateHeight, GANTRY_Y } from './toolhead.js';
import { makeCarriageHarness, animateCarriageHarness, makeTimingBelt, makeBeltPulley } from './carriage-harness.js';
import { makeChamber, animateChamber, makeCalibrationBoard } from './chamber.js';
import { makeAms, animateAms, makeSpool, updateSpool } from './ams.js';
import { makeRearFeed, animateRearFeed } from './rear-feed.js';

export function makePrinter(scene) {
  const root = group(scene), exterior = group(root);
  const shell = body.clone();
  shell.map = grain();
  shell.bumpMap = shell.map; shell.bumpScale = 0.19;
  const pei = metal(0x3c3023, 0.79, 0.39);
  pei.map = grain(true); pei.bumpMap = pei.map; pei.bumpScale = 0.25;

  // Front is +Z. The chassis outer envelope is 392 × 406 × 478 mm.
  const [width, depth] = X2D.chassis;
  box(exterior, width, 33, depth, 0, 24.5, 0, shell, 8);
  box(exterior, 363, 5, 382, 0, 40, -1, rubber, 2);
  // Leave the chamber open between structural uprights.
  for (const side of [-1, 1]) {
    box(exterior, 24, 380, 26, side * 184, 223, 188, shell, 7);
    box(exterior, 24, 380, 24, side * 184, 223, -188, shell, 7);
    box(exterior, 6, 374, 19, side * 171, 225, 180, gasket, 2);
    box(root, 5, 372, 24, side * 167, 228, -172, zinc, 2);
    for (const front of [-1, 1]) {
      box(root, 47, 10, 38, side * 158, 6, front * 164, rubber, 4);
      box(root, 38, 3, 32, side * 158, 1.5, front * 164, rubber, 3);
    }
  }
  // The upper structure is frame and glass rather than a solid opaque roof.
  for (const front of [-1, 1]) box(exterior, width, 64, 29, 0, 445, front * 188.5, shell, 7);
  for (const side of [-1, 1]) box(exterior, 26, 64, 355, side * 183, 445, 0, shell, 5);
  box(exterior, 341, 4.8, 345, 0, 473, 0, glass, 1);
  const liftKnob = group(root, -59, 477, 155);
  cy(liftKnob, 6.2, 6.2, 7, 0, 1, 0, ebon);
  const knob = cy(liftKnob, 12, 11.7, 3.3, 0, 5.4, 0, steel, 'y', 36);
  knob.scale.z = .81;
  for (const x of [-2.1, 2.1]) for (const z of [-1.8, 1.8]) {
    box(liftKnob, 3.5, .1, 2.7, x, 7.1, z, ebon, .06).rotation.y = -.15;
  }
  box(exterior, 353, 2.5, 1, 0, 408, 200, zinc, 0.4);
  label(exterior, 'Bambu Lab   X2D', 99, 16, 113, 452, 203.2, { color: '#141718', size: 29, weight: 800 });

  const panels = [];
  for (const side of [-1, 1]) {
    const panel = group(exterior, side * 192, 0, 0);
    panels.push(panel);
    box(panel, 8, 260, 355, 0, 171, 0, shell, 5);
    box(panel, 9, 13, 355, 0, 410, 0, shell, 3);
    for (const end of [-1, 1]) box(panel, 9, 108, 49, 0, 354, end * 153, shell, 3);
    // The side window exposes the upper rail assembly.
    for (const end of [-1, 1]) {
      box(panel, 3, 7, 261, side * 3.1, 355 + end * 51, 0, ebon, 2);
      box(panel, 3, 103, 8, side * 3.1, 355, end * 126.5, ebon, 3);
    }
    box(panel, 3, 98, 247, side * 2.5, 355, 0, tinted, 1.3);
    const edgeFace = side === 1 ? 'right' : 'left';
    label(panel, 'Bambu Lab', 61, 8, side * 4.2, 395, 0, { side: edgeFace, size: 34 });
    box(panel, 2, 9, 92, side * 4.2, 39, 0, rubber, 2);
    for (const z of [-166, 166]) for (const y of [58, 396]) screw(panel, side * 4.6, y, z, edgeFace);
  }

  box(root, 343, 363, 5, 0, 226, -188, plastic, 3);
  box(root, 327, 355, 3, 3, 222, -181, ebon, 2);
  const rear = group(exterior, 0, 0, -199);
  box(rear, 348, 375, 7, 0, 228, 0, shell, 3);
  for (const x of [-160, 160]) {
    box(rear, 1.2, 360, 0.8, x, 227, -4.1, rubber);
    for (const y of [54, 123, 195, 274, 340, 400]) screw(rear, x - (x > 0 ? 4 : -4), y, -4, 'rear');
  }
  for (const [x, y] of [[0, 66], [110, 392], [-87, 387], [-53, 279], [-48, 177]]) screw(rear, x, y, -4, 'rear');
  const rearFan = makeAxialFan(rear, 42, 16, 192, -15, { angle: Math.PI, blades: 7 });
  for (const x of [-51, 83]) box(rear, 6, 103, 10, x, 198, -6, plastic, 2);
  for (const y of [145, 251]) box(rear, 139, 6, 10, 16, y, -6, plastic, 2);
  for (let i = 0; i < 14; i++) box(rear, 1.1, 88, 4, -25 + i * 6.3, 192, -26, zinc, 0.4);
  box(rear, 52, 86, 19, -67, 206, -12, plastic, 6);
  box(rear, 43, 64, 1, -67, 214, -22, rubber, 3);
  box(rear, 43, 13, 11, -67, 169, -25, ebon, 2.2);
  const perforations = new THREE.InstancedMesh(new THREE.CircleGeometry(1.31, 8), rubber, 3 * 13 * 7);
  const bore = new THREE.Object3D();
  bore.rotation.y = Math.PI;
  let boreIndex = 0;
  for (const base of [64, 155, 246]) for (let row = 0; row < 13; row++) for (let col = 0; col < 7; col++) {
    bore.position.set(-134 + col * 4.1 + (row % 2) * 0.9, base + row * 4.8, -3.65);
    bore.updateMatrix();
    perforations.setMatrixAt(boreIndex++, bore.matrix);
  }
  rear.add(perforations);
  const power = mark(group(rear, 136, 92, -8), 'power');
  box(power, 33, 52, 10, 0, 0, 0, ebon, 4);
  box(power, 21, 15, 6, 0, 11, -5, rubber, 1.3);
  box(power, 15, 9, 4, 0, 11, -9, plastic, 1.2).rotation.x = 0.18;
  const powerLight = new THREE.MeshBasicMaterial({ color: 0x83f09a });
  box(power, 3, 2, 1, 0, 14, -11.5, powerLight, 0.3);
  box(power, 23, 18, 9, 0, -13, -9, rubber, 2);
  tube(rear, [V(136, 78, -20), V(136, 63, -47), V(136, 7, -57), V(112, 4, -135), V(58, 4, -211)], 3, rubber, 28);
  label(rear, 'X2D  /  100–240 V~', 67, 13, 48, 86, -4.2, { side: 'rear', size: 25, background: '#43494a' });
  label(rear, 'CAUTION  HOT SURFACE', 66, 9, 47, 70, -4.2, { side: 'rear', size: 21, color: '#d9ad57' });

  const door = mark(group(root, -169, 42, 193), 'door');
  for (const x of [3, 335]) box(door, 9, 363, 7, x, 183, 0, edge, 3);
  for (const y of [3, 364]) box(door, 333, 8, 7, 169, y, 0, edge, 3);
  const frontGlass = box(door, 323, 352, 2.7, 169, 183, 0, glass, 1);
  frontGlass.renderOrder = 4;
  for (const y of [27, 319]) {
    box(door, 19, 23, 4, 4, y, 3.9, ebon, 1.8);
    cy(door, 3, 3, 20, -2, y, 5, zinc);
  }
  box(door, 38, 14, 11, 320, 187, 8, steel, 6);
  label(door, 'Bambu Lab', 32, 8, 320, 187, 14, { color: '#202426', size: 30 });

  box(root, 84, 26, 15, -113, 442, 204, plastic, 4);
  cy(root, 9.1, 9.1, 87, -113, 442, 208, edge, 'x', 36);
  for (const x of [-156.7, -69.3]) cy(root, 7.8, 7.8, 1.1, x, 442, 208, rubber, 'x', 30);
  const screen = mark(group(root, -113, 445, 210), 'screen');
  screen.rotation.x = -0.20;
  box(screen, 128, 78, 13, 0, 0, -1, ebon, 5);
  box(screen, 123, 73, 4, 0, 0, 5, zinc, 4);
  box(screen, 118, 68, 3, 0, 0, 7, rubber, 4);
  const display = box(screen, 112.5, 63.3, 0.4, 0, 0, 8.7, new THREE.MeshBasicMaterial({ color: 0x0d1110 }), 1.3);
  label(screen, '•', 6, 4, 55, -33, 9, { color: '#72e89a', size: 27 });

  const chamber = makeChamber(root);
  // The threaded shafts rotate in their end bearings. Nut carriers translate with the bed.
  const shaftCenters = [[-151,139],[151,139],[0,-174]];
  const zScrews = shaftCenters.map(([x,z], i) => {
    const screwRotor = group(root, x, 0, z);
    cy(screwRotor, 4.0, 4.0, 342, 0, 225, 0, zinc);
    const coil = [];
    for (let k = 0; k <= 560; k++) {
      const y = 55 + k * .59, angle = (y - 55) * Math.PI / 4;
      coil.push(V(Math.cos(angle)*4.45, y, Math.sin(angle)*4.45));
    }
    tube(screwRotor, coil, .60, steel, 485);
    const guideX = x + (i === 2 ? 14 : -Math.sign(x) * 13);
    cy(root, 5.2, 5.2, 325, guideX, 224, z, steel);
    box(root, 30, 9, 27, x, 53, z, ebon, 1.9);
    cy(root, 7.2, 7.2, 6.4, x, 59, z, zinc);
    cy(root, 6.9, 6.9, 8.4, x, 389, z, ebon);
    return screwRotor;
  });

  const bed = group(root, 0, 268, 0);
  box(bed, 283, 8, 277, 0, -6, -4, zinc, 3);
  box(bed, 271, 11, 271, 0, -12, -1, plastic, 4);
  for (const x of [-134, 134]) box(bed, 16, 12, 53, x, -16, 116, ebon, 2);
  box(bed, 24, 5.3, 52, 0, -12.5, -150, ebon, 2);
  makeCalibrationBoard(bed);
  const plate = mark(group(bed), 'plate');
  box(plate, 256, 1.25, 256, 0, -0.65, 0, pei, 1);
  box(plate, 84, 1.25, 11, 33, -0.65, 130, pei, 0.6);
  label(plate, 'Bambu Textured PEI Plate', 113, 9, -61, 0.08, 119, { side: 'top', color: '#ad9571', size: 31 });
  label(plate, 'HOT SURFACE', 49, 6, 96, 0.08, 120, { side: 'top', color: '#bd9c64', size: 31 });

  for (const [x,z] of shaftCenters) {
    box(bed, 20.6, 12.1, 19.8, x, -10.6, z, ebon, 2.25);
    cy(bed, 7.65, 7.65, 4.0, x, -5.7, z, zinc);
    box(bed, 28.5, 4, 15.5, x - Math.sign(x)*9, -10.6, z, zinc, 1.05);
  }
  const axisMotion = { side: [], cross: [], pulleys: [] };
  for (const side of [-1, 1]) {
    const x = side * 155;
    cy(root, 4.7, 4.7, 307, x, 407.2, 0, steel, 'z', 40);
    cy(root, 2.8, 2.8, 302, x - side*5.8, 376.4, -2, zinc, 'z', 22);
    for (const z of [-149, 148]) {
      const mount = group(root, x, 0, z);
      box(mount, 29, 37, 26, 0, 388, 0, ebon, 3);
      box(mount, 26.0, 9.7, 22, 0, 407.5, 0, zinc, 1.4);
      axisMotion.pulleys.push({ rotor: makeBeltPulley(mount, side*5.5, 394, 0), side });
    }
    axisMotion.side.push(makeTimingBelt(root, 292, x + side*3, 394, 0, true));
  }

  const gantry = group(root, 0, GANTRY_Y, 0);
  cy(gantry, 4.85, 4.85, 311, 0, 4.2, 0, steel, 'x', 42);
  cy(gantry, 4.4, 4.4, 311, 0, -35.2, -2.45, steel, 'x', 42);
  axisMotion.cross.push(makeTimingBelt(gantry, 303, 0, -8.2, -6.4),
    makeTimingBelt(gantry, 303, 0, -25, -7.2));
  for (const x of [-155, 155]) {
    box(gantry, 22.8, 45.2, 30.8, x, -14.7, -3.3, plastic, 2.7);
    for (const y of [4.2, -35.2]) cy(gantry, 6.9, 6.9, 10.4, x - Math.sign(x)*8.7, y, y === 4.2 ? 0 : -2.45, zinc, 'x', 25);
    for (const z of [-11.2, 7.8]) box(gantry, 15.1, 10.6, 3.4, x, 6.75, z, ebon, .72);
  }
  const hardware = makeToolhead(gantry);
  const head = hardware.root;

  const amsModel = makeAms(root);

  // Rear-left mounting points as seen from behind, with the spool beside the right wall.
  const spoolMount = mark(group(root, 222, 292, -167), 'external');
  for (const y of [-77, 87]) {
    box(root, 39, 17, 17, 161, 292 + y, -209, shell, 3);
    screw(root, 153, 292 + y, -218, 'rear');
  }
  box(spoolMount, 56, 17, 19, -20, -1, -45, plastic, 3);
  box(spoolMount, 15, 31, 17, -15, -9, -34, plastic, 3);
  cy(spoolMount, 18, 18, 99, 6, 0, 0, ebon, 'x');
  const externalSpool = makeSpool(mark(group(spoolMount, 20, 0, 0), 'slot-4'), 91, 64);
  const rearFeed = makeRearFeed(root, rear, amsModel);
  const harness = makeCarriageHarness(root, gantry, hardware, rearFeed.routes, amsModel.branches);
  const deposited = group(bed);
  return { root, panels, bed, plate, gantry, head, hardware, chamber, harness, axisMotion, zScrews, rearFan,
    frontGlass, powerLight, door, screen, display, amsModel, externalSpool, rearFeed, deposited };
}

export function animatePrinter(model, state, carriage, dt, inspection, quality, clearFront = false) {
  model.door.rotation.y = THREE.MathUtils.damp(model.door.rotation.y, state.door ? -1.68 : 0, 8, dt);
  const bedY = plateHeight(state.selector, state.position.z);
  model.bed.position.y = bedY;
  model.zScrews.forEach(screw => { screw.rotation.y = (bedY - 343) * Math.PI / 4; });
  model.plate.visible = state.plate;
  model.gantry.position.z = 128 - carriage.y;
  model.head.position.x = carriage.x - 128;
  const { a, b } = coreXY(carriage.x, carriage.y);
  model.axisMotion.cross[0].move(a);
  model.axisMotion.cross[1].move(-b);
  model.axisMotion.side[0].move(-a);
  model.axisMotion.side[1].move(b);
  for (const {rotor, side} of model.axisMotion.pulleys) rotor.rotation.y = (side === -1 ? a : b) / 8;
  model.frontGlass.visible = !inspection && !clearFront;
  model.panels.forEach(node => { node.visible = !inspection; });
  model.powerLight.color.set(state.power ? 0x83f09a : 0x263e32);
  const targets = coolingTargets(state);
  animateFan(model.rearFan, targets.exhaust, dt);
  animateToolhead(model.hardware, state, dt, inspection, targets);
  animateChamber(model.chamber, state, targets, dt);
  animateCarriageHarness(model.harness, model.head.position.x, model.gantry.position.z, GANTRY_Y, state, quality);
  animateAms(model.amsModel, state, dt);
  updateSpool(model.externalSpool, state.spools[4]);
  animateRearFeed(model.rearFeed, state, dt);
}
