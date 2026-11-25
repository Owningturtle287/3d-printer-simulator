import * as THREE from 'three';
import { X2D } from './spec.js';
import { makeAxialFan, makeBlower, animateFan } from './fans.js';
import { V, box, cy, group, hexScrew, grain, label, lens, mark, metal, outline,
  profiled, ring, roundOpening, tube, ebon, rubber, steel, zinc } from './model-parts.js';

export const GANTRY_Y = 405;
export const HEAD_Y = -9;
const TIP_Y = -53;
const PARKED_RISE = 3.4;
const HEAT_YELLOW = 0xe5b33d;
const mount = metal(0x303537, .69, .27);
const cast = metal(0x6c706f, .48, .49);
const blackNickel = metal(0x212427, .45, .68);
const silicone = metal(0x272a29, .86, .01);
const gold = metal(0xb09862, .42, .70);
const polymer = metal(HEAT_YELLOW, .62, .08);
const guide = metal(0x52585c, .50, .30);

export function nozzleDatums(selector, z) {
  const depth = X2D.rightLift * selector;
  return {
    left: TIP_Y,
    right: TIP_Y + PARKED_RISE * (1 - selector) - depth,
    plate: GANTRY_Y + HEAD_Y + TIP_Y - depth - z,
  };
}

export function plateHeight(selector, z) { return nozzleDatums(selector, z).plate; }

export function makeToolhead(gantry) {
  const root = mark(group(gantry, 0, HEAD_Y, 0), 'head');
  const matte = mount.clone();
  matte.bumpMap = grain(); matte.bumpScale = .15;
  const fascia = metal(0x46494b, .55, .19);
  fascia.bumpMap = matte.bumpMap; fascia.bumpScale = .09;

  const rearFrame = outline([[-20,-30], [-20,10], [-14,22], [36,22], [48,13], [48,-31],
    [44,-39], [37,-39], [37,-28], [-10,-28], [-10,-39], [-19,-39]]);
  profiled(root, rearFrame, 3.3, .9, blackNickel, 0, 0, -3.6);
  // Cast side hoops and bearing supports are fastened to the carriage and never follow the right hotend slide.
  for (const side of [-1, 1]) {
    const x = side < 0 ? -16.9 : 37.8;
    const frame = outline([[-3,-31], [-3,9], [-1,18], [5,20], [7,17],
      [7,14], [4,13], [2,8], [2,-24], [4,-28], [4,-33], [1,-36]]);
    profiled(root, frame, 2.7, .45, zinc, x - 1.6, 0, 9.9);
    for (const y of [13, -31]) hexScrew(root, x + 1.2, y, 14.1, 2.0);
    box(root, 7.8, 15, 9.7, x + 2, -17.9, 1, guide, 1.1);
  }
  const topFrame = outline([[-14,14], [-10,20], [30,20], [37,16], [35,10], [-14,10]]);
  profiled(root, topFrame, 3, .5, blackNickel, 0, 0, 9.3);
  for (const x of [-11, -4, 3, 10, 17, 24, 31]) box(root, 3.8, 2.3, 1.6, x, 17.8, 13, steel, .35);

  const direct = outline([[-13,-12], [-13,13], [-8,16], [11,16], [14,12], [14,-16],
    [10,-16], [8,-13], [2,-13], [-2,-17], [-9,-17], [-9,-11]]);
  profiled(root, direct, 5.4, .58, matte, 0, 0, 9.6);
  const auxiliary = outline([[15,12], [18,16], [32,16], [34,14], [34,-12], [29,-15], [16,-15], [15,-6]]);
  profiled(root, auxiliary, 4.8, .5, matte, 0, 0, 10.1);
  for (const [x, y] of [[-5, 10],[-2,-0.1],[-4,-13],[32,11],[-12,16],[33,-14]])
    hexScrew(root, x, y, 15.6, 1.28);
  ring(root, [[2.4,0],[2.5,.4],[2.9,.45],[3.35,.05]], steel, -5.4, -7.1, 15.6);
  cy(root, 2.3, 2.3, .9, -5.4, -7.1, 15.5, zinc, 'z', 26);
  const cams = group(root, 13.7, -.8, 16);
  const latch = outline([[-2.8,9], [1.3,9], [1.3,5], [3,3], [2.7,-1], [1.5,-1], [1.5,-4.6], [-1.9,-4.6], [-2.8,-2]]);
  profiled(cams, latch, .9, .22, guide);
  hexScrew(cams, .1, 3, 1.18, .90);
  box(root, 11, 3.6, .7, 24.1, -12.4, 15.2, blackNickel, .38);
  for (const x of [18.8, 21.5, 24.2, 27, 29.7]) box(root, .78, 5.2, 3, x, -15.5, 13.1, zinc, .12);

  const hotends = [0, X2D.rightTipOffset].map(x => makeHotend(root, x));
  const hotendFans = [-1, 1].map(side => {
    const x = side === -1 ? -14.9 : 36.1;
    const duct = group(root, x, -28.5, 4.0);
    box(duct, 5.6, 20.8, 22.8, -side * 2.0, 0, -1.0, guide, 1.9);
    box(duct, 2.8, 19.5, 10.0, 0, 0, 9.9, fascia, 1.1);
    const fan = makeAxialFan(duct, 7.45, side * 2, 0, .7, { angle: side * Math.PI / 2, blades: 7 });
    box(duct, 7.3, 3.3, 13.3, 0, 10.8, 2, cast, .8);
    box(duct, 7.3, 3.0, 13.3, 0, -10.5, 2, cast, .8);
    return fan;
  });

  const lever = group(root, 30.5, -34, -6);
  cy(lever, 2.6, 2.6, 6, 0, 0, 0, zinc, 'z', 18);
  box(lever, 13, 2.35, 3.4, 5.9, .3, -.6, steel, .7);
  box(lever, 3.8, 5, 4.8, 11.3, 1.1, -.6, cast, .6);
  const blocker = group(root, 0, TIP_Y + .25, 1.2);
  const paddle = outline([[-4,-1.3], [-3.4,-1.97], [3.7,-1.97], [4.2,-1.25], [4.2,1.35], [-4,1.35]]);
  profiled(blocker, paddle, 6.0, .3, blackNickel, 0, .3, -2.3);
  box(blocker, 3, 1.3, 9, .2, .4, -7.8, steel, .42);
  const cutter = group(root, -15.5, 2, 15.6);
  box(cutter, 2.4, 17, 3.2, 0, 1.6, 0, blackNickel, .35);
  box(cutter, 5.8, 2.1, 3.9, 1.5, -6, .5, zinc, .3);

  const camera = group(root, 46, -32, 11);
  box(camera, 19, 14, 16, 0, 0, 0, matte, 2.1);
  box(camera, 18, 12.3, 1.6, 0, .35, 8.1, fascia, 1.5);
  label(camera, 'Toolhead', 15.9, 3.0, .1, 2.2, 9.02, { color: '#dfb643', size: 38, weight: 800 });
  label(camera, 'Camera', 15.9, 3.0, .1, -1.2, 9.02, { color: '#dfb643', size: 38, weight: 800 });
  const optics = group(camera, 0, -6.3, 2.6);
  optics.rotation.x = 1.32;
  cy(optics, 3.05, 3.31, 1.25, 0, 0, 0, rubber, 'z', 30);
  cy(optics, 2.25, 2.25, .78, 0, 0, .59, lens, 'z', 30);
  cy(optics, .90, .90, .18, 0, 0, 1.01, ebon, 'z', 20);

  const inlets = [0, X2D.rightTipOffset].map((x, i) => {
    const xIn = x + (i ? 3.2 : -2.1);
    const holder = group(root, xIn, 20.1, 3.8);
    cy(holder, 4.1, 4.25, 3.7, 0, -.7, 0, blackNickel, 'y', 18);
    cy(holder, 3.05, 3.34, 2.8, 0, 1.25, 0, zinc, 'y', 18);
    cy(holder, 2.9, 2.9, .8, 0, 2.65, 0, ebon, 'y', 18);
    return V(xIn, 23, 3.8);
  });
  tube(root, [V(-19, 16.8, 7), V(-8, 19.2, 15.4), V(3.4, 18.5, 16.4), V(11.2, 16.1, 13.7)], 1.2, rubber, 20);
  tube(root, [V(41, -21, 13), V(40, -8, 16), V(36.5, 8, 15.7), V(34.5, 16.3, 10)], .83, rubber, 20);
  for (const x of [-13, 33]) box(root, 3.4, 2, 3.5, x, 16.8, 12.3, cast, .38);

  const cover = group(root);
  const face = new THREE.Shape();
  face.moveTo(-18.8, -38.5);
  face.quadraticCurveTo(-20.6, -37.5, -20.6, -32);
  face.lineTo(-20.6, 8.6);
  face.quadraticCurveTo(-20.6, 15.4, -14.2, 20.6);
  face.quadraticCurveTo(-12.1, 22.1, -7.3, 22.1);
  face.lineTo(29.7, 22.1);
  face.quadraticCurveTo(34.2, 22.1, 37.0, 17.5);
  face.quadraticCurveTo(40.1, 13.7, 40.1, 8.0);
  face.lineTo(40.1, -32.5);
  face.quadraticCurveTo(40.1, -38.3, 36.5, -38.5);
  face.closePath();
  roundOpening(face, 9.3, -10.0, 21.7);
  profiled(cover, face, 2.1, .83, fascia, 0, 0, 24.4);
  const lower = new THREE.Shape();
  lower.moveTo(-19.3, -38.1);
  lower.lineTo(39.3, -38.1);
  lower.quadraticCurveTo(39.0, -46.6, 34.7, -47.0);
  lower.lineTo(28, -47.0);
  lower.quadraticCurveTo(26.9, -47.3, 26.5, -49.0);
  lower.lineTo(-5.4, -49.0);
  lower.quadraticCurveTo(-6.1, -47.5, -8.8, -47.0);
  lower.lineTo(-14, -47.0);
  lower.quadraticCurveTo(-18.6, -46.6, -19.3, -38.1);
  lower.closePath();
  profiled(cover, lower, 2.4, .83, mount, 0, 0, 23.2);
  for (const [x, sign] of [[-20.5, -1], [39.8, 1]]) {
    const side = group(cover, x, 0, 13);
    side.rotation.y = -sign * Math.PI / 2;
    const shell = outline([[-10,-39], [-13,-31], [-13,9], [-8,19], [1,21.3], [9,16], [11,8],
      [11,-27], [6,-35], [1,-43]]);
    profiled(side, shell, 2.5, .9, mount);
    for (const y of [-19, -22, -25]) box(side, 8.4, 1.10, .23, -.1, y, .12, ebon, .18);
  }
  box(cover, 50.4, 7.3, 3.4, 9.75, 16.2, 26.2, steel, 1.45);
  box(cover, 47, 5.75, .87, 9.75, 16.2, 28.0, zinc, .9);
  label(cover, 'Bambu Lab', 42, 5.55, 9.75, 16.2, 28.5, { color: '#242829', size: 39, weight: 740 });
  const partFan = makeBlower(cover, 20, 9.3, -10.0, 26.25);
  return { root, cover, inlets, hotends, hotendFans, partFan, blocker, lever, cutter, cams };
}

function makeHotend(parent, x) {
  const hotend = group(parent, x, TIP_Y, 0);
  box(hotend, 13.8, 6, 13.4, 0, 33.5, 3.9, blackNickel, 1.1);
  box(hotend, 13.7, 16.8, 11.8, 0, 27.1, 3.8, blackNickel, .7);
  for (let i = 0; i < 8; i++) {
    const y = 19.8 + i * 1.83;
    box(hotend, 17.15, .94, 16.2, 0, y, 4.25, blackNickel, .32);
    box(hotend, 16.6, .31, 1.1, 0, y + .34, 11.8, zinc, .14);
  }
  box(hotend, 16.8, 4.7, 3.1, 0, 17.0, 10.8, blackNickel, .6);
  label(hotend, '▮ ▪ | 0.4', 15.6, 3.8, 0, 17.1, 12.42, { color: '#f0f0e9', size: 37, weight: 800 });

  box(hotend, 12.9, 9.5, 10.6, 0, 9.1, 3.6, zinc, 1);
  const sock = outline([[-6.35, 13.6], [-7.3,11.5], [-7.1,5.75], [-5,2.35], [-3.5,1.65],
    [3.5,1.65],[5.7,2.55],[7.18,5.7],[7.35,11.55],[6.10,13.6]]);
  profiled(hotend, sock, 9, 1.05, silicone, 0, 0, -.76);
  box(hotend, 11.8, 7.0, .57, 0, 8.8, 9.0, silicone, 1.4);
  const wave = [V(-.53, -.83, 0), V(.2, .1, 0), V(-.15,.8,0), V(-.67,1.5,0), V(-.28,2.35,0)];
  for (const x of [-1.55, 0, 1.55]) {
    const sign = group(hotend, x, 8.85, 9.4);
    tube(sign, wave, .16, polymer, 10);
  }
  box(hotend, 5.25, .28, .22, 0, 7.73, 9.42, polymer, .09);
  label(hotend, 'CAUTION HOT', 10.70, 2.50, 0, 6.55, 9.45, { color: '#edc143', size: 40, weight: 800 });
  for (const x of [-1.82, 0, 1.82]) box(hotend, 1.38, 1.28, .27, x, 3.90, 8.47, polymer, .26);
  cy(hotend, 2.05, 2.05, 1.0, 0, 2.2, 0, gold, 'y', 20);
  cy(hotend, 1.9, .32, 1.95, 0, 1.13, 0, gold, 'y', 24);
  cy(hotend, .24, .24, .055, 0, .143, 0, ebon, 'y', 12);
  return hotend;
}

export function animateToolhead(head, state, dt, cutaway, fanTargets) {
  const t = state.selector, datums = nozzleDatums(t, state.position.z);
  head.cover.visible = !cutaway;
  head.hotends[0].position.y = datums.left;
  head.hotends[1].position.y = datums.right;
  const swing = Math.sin(Math.PI * t);
  head.blocker.position.set(X2D.rightTipOffset * (1 - t), TIP_Y + PARKED_RISE * (1 - t) - .52, -5 * swing);
  head.blocker.rotation.y = -.78 * swing;
  head.lever.rotation.z = -.28 + .58 * t;
  head.cams.rotation.z = -.14 * t;
  head.cutter.rotation.z = state.feed?.unload ? -.36 * Math.sin(Math.PI * state.feed.fraction) : 0;
  animateFan(head.partFan, fanTargets.part, dt);
  [fanTargets.left, fanTargets.right].forEach((rpm, i) => animateFan(head.hotendFans[i], rpm, dt));
}
