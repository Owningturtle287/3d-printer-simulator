import * as THREE from 'three';
import { V, box, cy, ebon, group, label, metal, plastic, rubber, screw, steel, tube, zinc } from './model-parts.js';

const orange = metal(0xe39626, .56, .12);
const blue = metal(0x3169a8, .62, .17);
const lightTube = new THREE.MeshPhysicalMaterial({ color: 0xbdced6, roughness: .29, metalness: .06,
  transparent: true, opacity: .77, depthWrite: false, forceSinglePass: true });
const smokeTube = lightTube.clone();
smokeTube.color.set(0x83959d);
smokeTube.opacity = .62;

function port(parent, x, y, z, axis, collar = zinc) {
  cy(parent, 4.7, 4.7, 5, x, y, z, rubber, axis, 20);
  cy(parent, 3.8, 3.8, 6.2, x, y, z, collar, axis, 20);
}

export function makeRearFeed(root, rear, ams) {
  const buffer = group(rear, 37, 274, -16);
  box(buffer, 99, 51, 23, 0, 0, 0, plastic, 3.7);
  const sliders = [-11, 13].map((dy, i) => {
    box(buffer, 76, 10.5, 1.3, 1, dy, -11.9, rubber, 2.8);
    for (const x of [-42, 42]) screw(buffer, x, dy - 7.1, -12, 'rear');
    for (const x of [-53, 54]) port(buffer, x, dy, 0, 'x');
    const slider = group(buffer, 7, dy, -12.9);
    box(slider, 21, 5.6, 2.6, 0, 0, 0, orange, .95);
    box(slider, 11, 7.7, 3.0, -2.2, 0, -1, orange, .8);
    label(buffer, i ? 'LEFT' : 'RIGHT', 17, 4.9, 30, dy+7.4, -11.7,
      { color: '#a7aeaa', size: 30, side: 'rear' });
    return slider;
  }).reverse();
  const aux = group(rear, -78, 354, -21);
  const molding = metal(0x303536, .62, .23);
  box(aux, 58, 78, 37, 0, 0, -4, molding, 8);
  box(aux, 49, 1.1, 30, 0, 38.8, -4, plastic, .5);
  box(aux, 54, 72, 2, 0, 0, 14.5, ebon, 4.2);
  for (const x of [-13, 13]) box(aux, 3.1, 25, .65, x, -13, -22.65, rubber, 1.5);
  for (const x of [-29.4, 29.4]) {
    box(aux, .65, 13.5, 12.2, x, 14, -7, rubber, 2.7);
    port(aux, x, 16, -7, 'x');
    box(aux, 1.7, 8.1, 3.8, x, 9, -11.7, orange, .8);
  }
  box(rear, 38, 76, 3.4, -137, 351, -5.5, molding, 3.4);
  label(rear, 'FILAMENT INLET', 37, 8, -137, 367, -7.35,
    { color: '#d6a950', size: 29, side: 'rear' });
  for (const y of [330, 341]) {
    box(rear, 14, 4.1, .9, -140, y, -7.3, rubber, .8);
    for (const x of [-145, -135]) box(rear, 1, 3.3, 1, x, y, -7.8, steel, .2);
  }
  for (const [x, y, collar] of [[-148, 391, blue], [-149, 356, zinc]]) {
    box(rear, 29, 13, 3.8, x+6, y, -5.2, collar === blue ? orange : plastic, 3.1);
    port(rear, x, y, -9, 'z', collar);
    screw(rear, x-9, y, -3.9, 'rear');
  }

  const starts = [V(94, 287, -215), V(94, 263, -215)];
  const exits = [V(-20, 287, -215), V(-20, 263, -215)];
  const auxIn = V(-46, 370, -227), auxOut = V(-110, 370, -227);
  const upper = V(-148, 391, -211), lower = V(-149, 356, -211);
  const outer = points => new THREE.CatmullRomCurve3(points);
  const visible = (points, material) => tube(root, points, 2.28, material, 38).curve;
  const connect = (curves, geometryEnd) => ({ curves, geometryEnd });
  const routes = [
    connect([
      visible([ams.filamentStart, V(4,539,-174), V(46,484,-214), V(113,368,-250), V(116,295,-246), starts[0]], smokeTube),
      outer([starts[0], exits[0]]),
      visible([exits[0], V(-63,273,-227), V(-139,274,-244), V(-163,337,-252), V(-158,377,-237), upper], smokeTube),
      outer([upper, V(-147,405,-184), V(-132,434,-160)]),
    ], V(-132,434,-160)),
    connect([
      visible([V(242,366,-165), V(237,379,-220), V(185,356,-258), V(114,277,-251), starts[1]], lightTube),
      outer([starts[1], exits[1]]),
      visible([exits[1], V(-45,282,-246), V(-32,351,-240), auxIn], lightTube),
      outer([auxIn, auxOut]),
      visible([auxOut, V(-129,364,-250), V(-159,325,-251), V(-168,327,-233), lower], lightTube),
      outer([lower, V(-136,385,-192), V(-119,433,-160)]),
    ], V(-119,433,-160)),
  ];
  const clip = group(root, -160, 357, -247);
  clip.rotation.z = -.16;
  cy(clip, 3.5, 3.5, 7.8, 0, 0, 0, orange, 'y', 18);
  box(clip, 9.4, 6.2, 2, 3.6, 0, 1.6, orange, 1.1);
  box(rear, 39, 22, 7.5, 121, 358, -6.3, plastic, 2.5);
  box(rear, 12, 11.4, 7.5, 123, 358, -10, ebon, 1.5);
  tube(root, [ams.busStart, V(29,493,-181), V(75,431,-231), V(132,384,-225), V(123,358,-214)],
    2.3, rubber, 30);
  return { routes, sliders };
}

export function animateRearFeed(rear, state, dt) {
  rear.sliders.forEach((slider, nozzle) => {
    const feeding = state.feed?.nozzle === nozzle;
    const printing = state.status === 'printing' && state.nozzle === nozzle;
    const deflection = feeding ? 10 * Math.sin(Math.PI * state.feed.fraction) : printing ? 1.6 : 0;
    slider.position.x = THREE.MathUtils.damp(slider.position.x, 7 + deflection, 10, dt);
  });
}
