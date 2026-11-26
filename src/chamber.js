import * as THREE from 'three';
import { makeAxialFan, animateFan } from './fans.js';
import { add, box, cy, group, hexScrew, grain, label, lens, metal, outline, profiled, steel, zinc, rubber, ebon } from './model-parts.js';

const satin = metal(0x32383b, .61, .23);
const inside = metal(0x262d30, .77, .14);
const brushed = metal(0x9b9688, .43, .76);
const divider = metal(0x4a5051, .78, .16);
const plasticForChute = metal(0x272b2c, .69, .18);
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
  const rearShroud = outline([[-165,58],[-165,307],[-155,321],[-130,325],[-122,339],[-78,339],
    [-71,326],[-38,325],[-32,339],[30,339],[39,321],[86,320],[98,329],[155,329],
    [165,318],[165,60],[155,50],[-153,50]]);
  const window = new THREE.Path();
  window.moveTo(-15,65);
  window.lineTo(-15,318); window.quadraticCurveTo(-15,326,-7,326);
  window.lineTo(20,326); window.quadraticCurveTo(28,326,28,318);
  window.lineTo(28,65); window.quadraticCurveTo(28,57,20,57);
  window.lineTo(-7,57); window.quadraticCurveTo(-15,57,-15,65);
  rearShroud.holes.push(window);
  profiled(root, rearShroud, 4.8, 1.35, liner, 0, 0, -173);
  box(root, 51, 275, 1.8, 7, 194, -182, rubber, 2.4);
  box(root, 310, 13, 9, 0, 336, -173, ebon, 2.8);
  box(root, 83, 6, 7.1, 80, 326, -167, zinc, 1.15);
  box(root, 92, 75, 7, 96, 258, -168, liner, 4);
  box(root, 77, 61, 1.0, 96, 258, -164.1, rubber, 5.5);
  for (let i = -9; i <= 9; i++) {
    box(root, 1.55, 52, 3.8, 96 + i * 3.6, 258, -163, divider, .44).rotation.y = -.24;
  }
  for (const [x,y] of [[53,286],[137,286],[52,226],[137,226],[-144,284],[-25,249],[-150,145],[150,144]]) {
    hexScrew(root, x, y, -167.2, 1.55);
  }

  const fans = [];
  let temperatureMarker;
  for (const sign of [-1, 1]) {
    const side = group(root, 165 * sign, 0, 0);
    const skin = group(side);
    skin.rotation.y = -sign * Math.PI / 2;
    const bevel = outline([[-153,72],[-158,237],[-147,262],[-131,279],[-116,300],[105,300],[132,285],
      [147,268],[155,235],[155,73],[144,62],[-146,62]]);
    profiled(skin, bevel, 4.2, 2, liner);
    const crossSection = outline([[-5,201],[3,209],[12,226],[18.5,246],[23.3,283],[26,297],[23.4,309],
      [7.6,308],[-1,297],[-4,284]]);
    const ductContour = profiled(side, crossSection, 192, 2.8, liner, 0, 0, -97);
    ductContour.scale.x = -sign;
    box(side, 19, 12, 187, -sign * 23, 306.5, 0, inside, 5.2);
    box(side, 1.5, 8.1, 177, -sign * 33, 306.5, 0, rubber, 3.7);
    for (let i = -3; i <= 3; i++) {
      const dividerBlade = box(side, 4.7, 7.1, 1.3, -sign * 32, 306.5, i*21, divider, .4);
      dividerBlade.rotation.y = -.24 * sign;
    }
    for (const z of [-121, 126]) box(side, 15, 18, 20, -sign * 6, 323, z, inside, 4);
    const fan = inlet(side, -sign * 7.4, 251, 17, -sign * Math.PI / 2);
    fans.push(fan);
    if (sign > 0) continue;

    const recess = group(side, 4.5, 195, 44);
    recess.rotation.y = Math.PI / 2;
    cy(recess, 3.5, 3.5, .65, 0, 0, 0, rubber, 'z', 20);
    hexScrew(recess, 0, 0, .35, 1.65);
    const selector = group(side, 5.15, 157, -7);
    selector.rotation.y = Math.PI / 2;
    box(selector, 4.5, 25, .7, 0, 0, 0, rubber, 1.7);
    temperatureMarker = box(selector, 2.0, 3.7, .75, 0, 7, .5, steel, .44);
    label(selector, 'COLD', 15, 4.5, 12, 8.8, .45, { color: '#c1c6bd', size: 29 });
    label(selector, 'HOT', 15, 4.5, 12, -8.8, .45, { color: '#c1c6bd', size: 29 });
  }

  const purge = group(root, -92, 319, -143);
  const chuteMount = outline([[-21,16],[-21,-45],[-15,-53],[15,-53],[22,-44],[22,16]]);
  profiled(purge, chuteMount, 4.5, 1.3, ebon);
  const scoopPositions = [], scoopFaces = [];
  const scoopLayers = [[-51,2,7],[-50,11,9.6],[-46,16,15.7],[-39,19,20.4],[-26,20,22.1],
    [-8,20,23.2],[7,20,25.2],[13,19,24.2]];
  for (const [i, [y, width, front]] of scoopLayers.entries()) {
    for (let j = 0; j < 11; j++) {
      const x = (j-5)/5;
      scoopPositions.push(width*x, y + x*x*2.2, front - Math.abs(x)**4*7);
      const a = i*11+j;
      if (i && j) scoopFaces.push(a-12,a-11,a-1,a-11,a,a-1);
    }
  }
  const scoop = new THREE.BufferGeometry();
  scoop.setAttribute('position', new THREE.Float32BufferAttribute(scoopPositions,3));
  scoop.setIndex(scoopFaces); scoop.computeVertexNormals();
  brushed.side = THREE.DoubleSide;
  add(purge, scoop, brushed, 0, 0, 0);
  const mouth = outline([[-21,19],[-21,10],[-12,10],[-12,4],[5,4],[5,10],[20,10],[20,20],
    [11,20],[11,15],[-9,15],[-9,19]]);
  profiled(purge, mouth, 7.0, .75, plasticForChute, 0, 0, 19.5);
  const wiper = group(root, -94, 322, -131);
  box(wiper, 28, 5.7, 24, 0, 16.5, 9, ebon, 2.4);
  box(wiper, 20, 2.0, 16, 0, 19.0, 13, rubber, 2.0);
  for (let i = -4; i <= 4; i++) box(wiper, .8, 1.23, 11, 2.05*i, 20.55, 13, divider, .28);
  const pad = group(wiper, 0, 15.6, 23.4);
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
  return { fans, lampMat, light, light2, pad, temperatureMarker };
}

export function animateChamber(chamber, state, targets, dt) {
  const light = state.power && state.lights;
  chamber.light.intensity = light ? 9300 : 0;
  chamber.light2.intensity = light ? 3100 : 0;
  chamber.lampMat.color.set(light ? 0xeffbfa : 0x626d70);
  animateFan(chamber.fans[0], targets.heater, dt);
  animateFan(chamber.fans[1], targets.auxiliary, dt);
  chamber.temperatureMarker.position.y = THREE.MathUtils.damp(chamber.temperatureMarker.position.y,
    targets.heater > 0 ? -7 : 7, 6, dt);
  const wiping = state.service?.label === 'Nozzle cleaning';
  const contact = wiping && state.position.y > 230 && state.position.x >= 25 && state.position.x <= 43;
  chamber.pad.rotation.x = THREE.MathUtils.damp(chamber.pad.rotation.x, contact ? -.095 : 0, 13, dt);
}

export function makeCalibrationBoard(bed) {
  const board = group(bed, 136, -1.2, -19);
  board.rotation.y = Math.PI / 2;
  box(board, 71, 2.1, 12.7, 0, 0, 0, ebon, 1.05);
  box(board, 66.8, .33, 10.6, 0, 1.15, 0, brushed, .14);
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cbd0cc';
  ctx.fillRect(0, 0, 768, 120);
  ctx.fillStyle = '#263036';
  ctx.font = '600 44px Arial, sans-serif';
  ctx.fillText('Calibration Board', 20, 62);
  ctx.fillStyle = '#b08046';
  ctx.fillRect(24, 83, 270, 13);
  ctx.fillStyle = '#24282a';
  for (let row = 0; row < 7; row++) for (let col = 0; col < 13; col++) {
    if ((row + col) % 2 === 0) ctx.fillRect(553 + col*15, 8 + row*15, 15, 15);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const sticker = new THREE.MeshStandardMaterial({ map, roughness: .63, metalness: .16 });
  const marker = add(board, new THREE.PlaneGeometry(66, 10.3), sticker, 0, 1.34, 0);
  marker.rotation.x = -Math.PI / 2;
  marker.castShadow = false;
}
