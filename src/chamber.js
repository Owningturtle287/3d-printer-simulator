import * as THREE from 'three';
import { makeAxialFan, animateFan } from './fans.js';
import { box, cy, group, hexScrew, grain, label, lens, metal, outline, profiled, steel, zinc, rubber, ebon } from './model-parts.js';

const satin = metal(0x32383b, .61, .23);
const inside = metal(0x262d30, .77, .14);
const copper = metal(0x7f654b, .61, .57);
const divider = metal(0x4a5051, .78, .16);
const warning = { color: '#dfb649', size: 35, weight: 800 };

function inlet(parent, x, y, radius, angle) {
  const pod = group(parent, x, y, -117);
  pod.rotation.y = angle;
  const fan = makeAxialFan(pod, radius, 0, 0, 0, { blades: 7 });
  box(pod, radius * 2.46, 2.5, 7, 0, radius * 1.34, -1.2, satin, .5);
  for (let i = -2; i <= 2; i++) {
    const grille = box(pod, radius * 1.72, 1.0, 1.45, 0, i * radius * .31, 4.4, ebon, .35);
    grille.rotation.x = .32;
  }
  return fan;
}

export function makeChamber(root) {
  const liner = satin.clone();
  liner.bumpMap = grain(true);
  liner.bumpScale = .18;
  const rearShroud = outline([[-165,130],[-165,306],[-156,321],[-131,324],[-125,339],[-86,339],
    [-79,326],[-38,325],[-33,341],[22,341],[29,317],[89,316],[98,329],[155,329],
    [165,318],[165,133],[155,124],[-153,124]]);
  profiled(root, rearShroud, 5, 1.4, liner, 0, 0, -174);
  box(root, 314, 22, 11, 0, 336, -171, ebon, 2.8);
  box(root, 87, 8.6, 6.3, 69, 339, -163, zinc, 1.25);
  box(root, 88, 69, 14, 91, 264, -166, inside, 2.8);
  box(root, 70, 50, 1.0, 91, 267, -158.6, rubber, 3.0);
  for (let i = -9; i <= 9; i++) {
    box(root, 1.55, 46, 4, 91 + i * 3.35, 267, -156, divider, .38).rotation.y = -.24;
  }
  for (const [x,y] of [[52,291],[128,291],[53,237],[128,237],[-145,287],[-13,249],[-153,144],[151,143]]) {
    hexScrew(root, x, y, -167.2, 1.55);
  }
  box(root, 19, 155, 13, 27, 222, -165, inside, 2.1);
  for (const x of [21, 24.8, 29, 33]) box(root, 1.15, 147, 1.85, x, 223, -157.7, zinc, .22);
  box(root, 70, 3.4, 7, -94, 262, -167, ebon, .6);
  box(root, 31, 4.8, 3.4, -98, 207, -166.2, copper, .9);
  label(root, 'AIR FILTER', 42, 8, 91, 303, -157.8, { color: '#b8c2c0', size: 30 });

  const fans = [];
  for (const sign of [-1, 1]) {
    const side = group(root, 163 * sign, 0, 0);
    const bevel = outline([[-154,98],[-158,238],[-135,273],[-117,298],[105,298],[140,271],
      [155,235],[155,101],[146,94],[-145,94]]);
    const skin = group(side);
    skin.rotation.y = -sign * Math.PI / 2;
    profiled(skin, bevel, 4.2, 1.7, liner);
    box(side, 23, 13, 209, -sign * 9.1, 304, -2, inside, 5.5);
    box(side, 7, 8, 203, -sign * 22.6, 304.4, -2, rubber, 3.5);
    for (let i = -5; i <= 5; i++) {
      const louvre = box(side, 7.7, 6.9, 2.05, -sign * 22.9, 304.5, i*17.2 - 2.4, divider, .59);
      louvre.rotation.y = -.30 * sign;
    }
    for (const z of [-120, 126]) box(side, 15, 18, 20, -sign * 6, 326, z, inside, 4);
    fans.push(inlet(side, -sign * 16.5, 266, 18, -sign * Math.PI / 2));
    const face = sign < 0 ? 'right' : 'left';
    label(side, sign < 0 ? 'HOT AIR' : 'AIR INTAKE', 31, 5.3, -sign*13, 291.4, -116, { side: face, ...warning });
  }

  const purge = group(root, -94, 322, -131);
  const funnel = outline([[-15,7],[-12,15],[13,15],[15,7],[12,-6],[9,-14],[-10,-14],[-12,-9]]);
  profiled(purge, funnel, 10, 1, inside);
  box(purge, 28, 5.7, 24, 0, 16.5, 9, ebon, 2.4);
  box(purge, 20, 2.0, 16, 0, 19.0, 13, rubber, 2.0);
  for (let i = -4; i <= 4; i++) box(purge, .8, 1.23, 11, 2.05*i, 20.55, 13, divider, .28);
  const pad = group(purge, 0, 15.6, 23.4);
  box(pad, 19.2, 4.1, 7.1, 0, 0, 0, rubber, 1.1);
  for (let i = -3; i <= 3; i++) box(pad, 1.3, 1.2, 5.3, i*2.3, 2.21, -.38, divider, .3);
  for (const [x, z] of [[-141,-152],[137,-146]]) {
    const stop = group(root, x, 369, z);
    box(stop, 22, 19, 23, 0, 0, 0, inside, 2.7);
    box(stop, 16, 3.8, 12, 0, 7.6, 12, steel, .7);
    hexScrew(stop, -6.4, 2.5, 12.2, 1.5);
    hexScrew(stop, 6.4, 2.5, 12.2, 1.5);
    label(stop, '▲', 9, 8, 0, .2, 12.3, { ...warning, size: 44 });
  }

  const camera = group(root, -151, 383, 154);
  camera.rotation.y = Math.PI - .46;
  camera.rotation.x = .21;
  box(camera, 25, 15, 14, 0, 0, 0, inside, 2.8);
  cy(camera, 4.5, 4.7, 2.5, 0, 0, 7.3, ebon, 'z', 24);
  cy(camera, 3.15, 3.15, 1.22, 0, 0, 8.2, lens, 'z', 26);
  hexScrew(camera, 9.0, 3.6, 7.1, 1.15);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xeffbfa });
  for (const [z,w] of [[34,114], [-71,54]]) {
    box(root, 9.2, 8.2, w+7, -166.5, 416, z, inside, 2).rotation.z = -.32;
    box(root, 5.3, 3.2, w, -161.3, 414.4, z, lampMat, 1.3).rotation.z = -.37;
  }
  const light = new THREE.SpotLight(0xe8f6ff, 9300, 530, 1.05, .83, 1.28);
  light.position.set(-145, 409, 73);
  light.target.position.set(19, 321, -18);
  root.add(light, light.target);
  const light2 = new THREE.PointLight(0xe3effd, 3100, 325, 1.43);
  light2.position.set(-139, 405, -76);
  root.add(light2);
  return { fans, lampMat, light, light2, pad };
}

export function animateChamber(chamber, state, targets, dt) {
  const light = state.power && state.lights;
  chamber.light.intensity = light ? 9300 : 0;
  chamber.light2.intensity = light ? 3100 : 0;
  chamber.lampMat.color.set(light ? 0xeffbfa : 0x626d70);
  animateFan(chamber.fans[0], targets.heater, dt);
  animateFan(chamber.fans[1], targets.auxiliary, dt);
  const wiping = state.service?.label === 'Nozzle cleaning';
  const contact = wiping && state.position.y > 230 && state.position.x >= 25 && state.position.x <= 43;
  chamber.pad.rotation.x = THREE.MathUtils.damp(chamber.pad.rotation.x, contact ? -.095 : 0, 13, dt);
}
