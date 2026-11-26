import * as THREE from 'three';
import { V, add, box, cy, group, mark, label, metal, grain, profiled, ring, hexScrew, tube, tinted,
  plastic, steel, zinc, rubber, ebon } from './model-parts.js';

const bays = [-132, -44, 44, 132];
const shellMaterial = metal(0x3a3e40, .61, .22);
const floorMaterial = metal(0x22262a, .77, .13);
const ivory = metal(0xe4e2d9, .61, .08);
const amberGear = metal(0xaf661f, .52, .24);
const clearCover = new THREE.MeshPhysicalMaterial({ color: 0x7d7460, roughness: .27, metalness: .08,
  clearcoat: .65, transparent: true, opacity: .41, depthWrite: false, forceSinglePass: true });
const labelInk = '#dbdfd9';

function roundedRectangle(shape, w, h, r) {
  const x = w/2, y = h/2;
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y); shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r); shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y); shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r); shape.quadraticCurveTo(-x, -y, -x + r, -y);
  shape.closePath();
  return shape;
}

function ringWall(parent, sizes, y, h, material) {
  const [width, depth, insideWidth, insideDepth] = sizes;
  const wall = roundedRectangle(new THREE.Shape(), width, depth, 13);
  wall.holes.push(roundedRectangle(new THREE.Path(), insideWidth, insideDepth, 9));
  profiled(parent, wall, h, .65, material, 0, y, 0).rotation.x = -Math.PI / 2;
}

function ventilation(parent, x, y, z, rows, cols) {
  const dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.6), rubber, rows * cols);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < rows * cols; i++) {
    matrix.makeRotationX(-Math.PI / 2);
    matrix.setPosition(x + (i % cols) * 3.15, y, z + Math.floor(i / cols) * 3.1);
    dots.setMatrixAt(i, matrix);
  }
  parent.add(dots);
}

function makeLid(ams) {
  const lid = mark(group(ams, 0, 98, -134), 'lid');
  const points = [];
  for (let i = 0; i <= 48; i++) {
    const angle = Math.PI * i / 48;
    points.push([3 + 125 * Math.sin(angle) ** .76, 134 - 134 * Math.cos(angle)]);
  }
  const positions = [], faces = [];
  for (const [i, [y,z]] of points.entries()) {
    positions.push(-182,y,z,182,y,z);
    if (i < points.length - 1) {
      const j = i * 2;
      faces.push(j,j+1,j+2,j+1,j+3,j+2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  add(lid, geometry, tinted, 0,0,0).renderOrder = 5;
  for (const x of [-182,182]) {
    const cap = new THREE.Shape();
    cap.moveTo(points[0][1], points[0][0]);
    for (const [y,z] of points) cap.lineTo(z,y);
    cap.closePath();
    add(lid, new THREE.ShapeGeometry(cap), tinted, x,0,0).rotation.y = -Math.PI / 2;
    tube(lid, points.map(([y,z])=>V(x,y,z)), 1.75, plastic, 56);
    box(lid, 4.8, 5.1, 265, x, .9, 134, rubber, 1.2);
  }
  for (const z of [2,266]) box(lid, 363, 5.4, 4.4, 0, .7, z, plastic, 1.45);
  for (const x of [-148,148]) {
    cy(ams, 5.4,5.4, 33, x, 97.7,-134, plastic,'x',25);
    cy(ams, 2.65,2.65, 36, x,97.7,-134, steel,'x',22);
    box(lid, 25,8,4.1, x,-.7,268.9,plastic,2.2);
    for (let i = -3; i <= 3; i++) box(lid, .62,.6,2, x + i*2.4,2.22,270.75,zinc,.16);
  }
  return lid;
}

function roller(parent, y, z) {
  const shaft = group(parent,0,y,z);
  cy(shaft, 2.8,2.8,81, 0,0,0,steel,'x',20);
  cy(shaft, 5.6,5.6,67, 0,0,0,rubber,'x',30);
  for (const x of [-35.1,35.1]) cy(shaft, 4.8,4.8,2.7,x,0,0,zinc,'x',25);
  for (const x of [-37,37]) box(parent, 7,17,13,x,y-5,z,plastic,1.8);
  return shaft;
}

function feeder(ams, x, i) {
  const base = mark(group(ams, x, 78, 105), `slot-${i}`);
  box(base, 28,27,26, 0,0,0, floorMaterial,3);
  box(base, 30,23,7.6, 0,2,12.9,clearCover,2.4);
  const gear = group(base, 0,2.7,11.4);
  cy(gear, 6.1,6.1,5.3,0,0,0,amberGear,'z',20);
  cy(gear, 2.65,2.65,6.4,0,0,0,steel,'z',20);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const tooth = box(gear, 2.4,1.1,3.4,5.7 * Math.cos(angle),5.7 * Math.sin(angle),0,amberGear,.23);
    tooth.rotation.z = angle;
  }
  for (const side of [-1, 1]) {
    box(base,4.0,23,24,side*14.5,1.8,.5,plastic,1.55);
    hexScrew(base,side*9.9,-7,16.8,1.15);
  }
  const funnel = group(base,0,14,4.2);
  funnel.rotation.x = -Math.PI * .34;
  ring(funnel, [[2.0,-3.2],[2.04,.55],[3.15,2.1],[5.5,4.2],[7.5,5.4],[7.5,4.7],
    [6.55,3.66],[4.7,1.1],[3.55,-3.2],[2.0,-3.2]], ivory);
  box(funnel, 16.2,3.3,5.85,0,-5,1.15,ivory,1.6);
  const light = new THREE.MeshBasicMaterial({ color: 0xa0aeaa });
  box(base, 5.1,1.15,.55,9,8.4,17.04,light,.37);
  return { gear, light };
}

function socket(parent, x, y, connected) {
  const port = group(parent,x,y,0);
  box(port, 17.5,11.8,4.0,0,0,-2,ebon,1.65);
  box(port, 12.9,8.35,1.0,0,0,-4.25,rubber,.7);
  for (const [j,k] of [[-4.3,1.6],[0,1.6],[4.3,1.6],[-4.3,-1.6],[0,-1.6],[4.3,-1.6]])
    box(port, 1.6,.88,.32,j,k,-4.8,steel,.08);
  if (connected) {
    box(port,16,10,8.0,0,0,-8.7,plastic,1.5);
    box(port,5.1,7.5,3.15,0,4.7,-9.4,ebon,.65);
    cy(port,3.05,3.05,7.5,0,0,-15,rubber,'z',18);
  }
}

export function makeAms(root) {
  const ams = mark(group(root,0,478,-5),'ams');
  const surface = shellMaterial.clone();
  surface.bumpMap = grain(); surface.bumpScale = .14;
  box(ams, 371,11,279,0,6,0,surface,5.3);
  ringWall(ams,[371,279,346,252],10,84,surface);
  ringWall(ams,[366,270,343,249],94,4.1,rubber);
  box(ams, 346,7.4,253,0,13,0,floorMaterial,4.3);
  box(ams, 343,12,2.5,0,82,139.9,ebon,1.3);
  label(ams,'Bambu Lab    AMS 2 Pro',124,11,105,83,141.3,{size:34,color:labelInk});
  const lid = makeLid(ams);

  const spools = [], feeders = [], branches = [];
  const asWorld = p => ams.localToWorld(p);
  for (const [i,x] of bays.entries()) {
    const bay = group(ams,x,0,0);
    box(bay, 82,4,220,0,16.4,-3,floorMaterial,4.5);
    for (const side of [-1,1]) {
      const rib = box(bay, 4,11,221,side*40.95,23,-3,plastic,1.25);
      rib.rotation.z = side * .12;
    }
    ventilation(bay, 19, 18.52, -62, 9, 5);
    ventilation(bay, -20, 18.52, 51, 5, 5);
    box(bay, 61,8,24,0,29,-105,plastic,2.4);
    box(bay, 39,1.8,20,0,33.9,-105,metal(0x68706b,.92,.04),1.2);
    const front = roller(bay,43,72), back = roller(bay,43,-72);
    const drive = feeder(ams,x,i);
    feeders.push({ ...drive, front, back });
    label(ams,`A${i+1}`, 15,6,x,66,140.2,{size:34,color:labelInk});
    spools.push(makeSpool(mark(group(ams,x,117,0),`slot-${i}`),98.1,65));

    const mouth = V(x,96.5,111.35);
    const drop = V(x,70,110);
    const hub = V(4,33,-105);
    const channel = [drop,V(x+9,36,81),V(x*.74+4,29,3-i*3),V(x*.36+3,33,-61),hub];
    const material = new THREE.MeshPhysicalMaterial({ color: 0x92adba, roughness: .37, metalness: .05,
      transparent: true, opacity: .69, depthWrite: false, forceSinglePass: true });
    tube(ams, channel,1.74,material,26);
    const hiddenFeeder = new THREE.CatmullRomCurve3([mouth, V(x,89,109),drop].map(asWorld));
    const interior = new THREE.CatmullRomCurve3(channel.map(p=>asWorld(p.clone())));
    const outlet = new THREE.CatmullRomCurve3([hub.clone(),V(4,43,-116),V(4,64,-130), V(4,69,-146.4)].map(asWorld));
    branches.push({ center: asWorld(V(x,117,0)), mouth: asWorld(mouth.clone()), fullRadius: spools[i].fullRadius, curves: [hiddenFeeder,interior,outlet] });
  }

  box(ams,56,15.3,19,4,35,-107,plastic,3.7);
  const panel = group(ams,4,49,-140);
  box(panel,58,30,4.4,0,-18,-1.1,ebon,4);
  socket(panel,17,-18,true);
  socket(panel,-18,-18,false);
  cy(panel,3.1,3.1,3.3,-.5,-18,-4,steel,'z',20);
  cy(panel,1.65,1.65,.78,-.5,-18,-5.5,rubber,'z',20);
  box(panel,21,24,6.5,0,16.8,-1.2,plastic,3.4);
  cy(panel,4.9,5.4,5.8,0,20,-4.5,ebon,'z',22);
  cy(panel,3.6,3.6,3.2,0,20,-6.8,zinc,'z',22);
  label(panel,'PTFE TUBE RELEASE',35,5.7,0,34,-.35,{side:'rear',size:29,color:labelInk});
  return { ams, lid, spools, feeders, branches,
    filamentStart: asWorld(V(4,69,-146.4)), busStart: asWorld(V(21,31,-157.5)) };
}

const flangeGeometry = new Map();
function polygonCircle(path, r, x, y, count, sign) {
  path.moveTo(x+r,y);
  for (let i=1;i<count;i++) {
    const angle = sign * Math.PI * 2 * i/count;
    path.lineTo(x+r*Math.cos(angle),y+r*Math.sin(angle));
  }
  path.closePath();
}

function perforatedFlange(radius) {
  if (flangeGeometry.has(radius)) return flangeGeometry.get(radius);
  const disk = new THREE.Shape();
  polygonCircle(disk, radius,0,0,96,1);
  const center = new THREE.Path();
  polygonCircle(center, 26.7,0,0,54,-1);
  disk.holes.push(center);
  for (const [i, [ratio, count]] of [[.49,25],[.58,31],[.66,38],[.74,43],[.82,49],[.89,54]].entries()) {
    for (let j=0;j<count;j++) {
      const angle = (j+(i%2)*.5)*Math.PI*2/count;
      const hole = new THREE.Path();
      polygonCircle(hole,1.25, radius*ratio*Math.cos(angle), radius*ratio*Math.sin(angle),7,-1);
      disk.holes.push(hole);
    }
  }
  const geometry = new THREE.ExtrudeGeometry(disk,{depth:1.5,bevelEnabled:false});
  flangeGeometry.set(radius,geometry);
  return geometry;
}

export function makeSpool(parent,radius,width) {
  const rotor = group(parent), pack = group(rotor);
  const flange = metal(0xc2c0b5,.69,.12);
  const winding = metal(0xdb9a43,.56,.06);
  winding.side = THREE.DoubleSide;
  const fullRadius = radius * .91;
  const skin = new THREE.CylinderGeometry(fullRadius,fullRadius,width-4,58,1,true);
  add(pack,skin,winding,0,0,0).rotation.z = -Math.PI / 2;
  const loops = new THREE.InstancedMesh(new THREE.TorusGeometry(fullRadius,.47,5,54),winding,Math.floor((width-6)/1.35));
  const matrix = new THREE.Matrix4(), q=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Math.PI/2);
  for (let i=0;i<loops.count;i++) {
    matrix.compose(V((i-(loops.count-1)*.5)*1.35,0,0),q,V(1,1,1));
    loops.setMatrixAt(i,matrix);
  }
  pack.add(loops);
  for (const side of [-1,1]) {
    const x=side*(width/2-.75);
    add(rotor,perforatedFlange(radius),flange,x-.75,0,0).rotation.y = Math.PI/2;
    add(rotor,new THREE.TorusGeometry(radius-1.4,.8,7,68),flange,x+side*.48,0,0).rotation.y=Math.PI/2;
    add(pack,new THREE.RingGeometry(28,fullRadius,58),winding,side*(width/2-1.9),0,0).rotation.y=Math.PI/2;
  }
  const hub = new THREE.CylinderGeometry(27,27,width-3,52,1,true);
  const liner = flange.clone();
  liner.side = THREE.DoubleSide;
  add(rotor,hub,liner,0,0,0).rotation.z = -Math.PI/2;
  return { parent,rotor,pack,winding,fullRadius };
}

export function filamentPackRadius(fullRadius, slot) {
  const remaining = Math.max(0,Math.min(1,slot.remaining / slot.capacity));
  const core = 31;
  return Math.sqrt(core*core+(fullRadius*fullRadius-core*core)*remaining);
}

export function updateSpool(mesh, spool) {
  mesh.parent.visible = spool.present;
  mesh.rotor.rotation.x = spool.rotation;
  mesh.winding.color.set(spool.color);
  mesh.winding.roughness = ['Gloss','Silk','Metallic'].includes(spool.finish) ? .30 : .65;
  const diameter = filamentPackRadius(mesh.fullRadius,spool) / mesh.fullRadius;
  mesh.pack.scale.set(1,diameter,diameter);
  mesh.pack.visible = spool.remaining > .001;
}

export function animateAms(model,state,dt) {
  model.lid.rotation.x=THREE.MathUtils.damp(model.lid.rotation.x,state.lid ? -1.55 : 0,7,dt);
  for (const [i,drive] of model.feeders.entries()) {
    const spool=state.spools[i], active=state.feed?.slot===i || state.loaded[0]===i;
    const moving=spool.present ? spool.rotation : 0;
    drive.front.rotation.x=drive.back.rotation.x= -moving * model.spools[i].fullRadius / 5.6;
    if (active) drive.gear.rotation.z= moving * 5.3;
    drive.light.color.set(!state.power || !spool.present ? 0x505557 : active ? 0x63f298 : state.dryer.time ? 0xf1bb72 : 0xd2ded4);
    updateSpool(model.spools[i],spool);
  }
}
