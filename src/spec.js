export const X2D = Object.freeze({
  chassis: [392, 406, 478],
  main: { x: 256, y: 256, z: 260, printSpeed: 1000, acceleration: 20000 },
  auxiliary: { x: 235.5, y: 256, z: 256, printSpeed: 200, acceleration: 1000 },
  nozzle: 0.4,
  filament: 1.75,
  maxFlow: 40,
  travel: 1000,
  travelAcceleration: 9000,
  zSpeed: 20,
  zAcceleration: 500,
  temperatures: { left: 300, right: 300, bed: 120, chamber: 65 },
  dryers: { max: 65 },
  // Simulator calibration. Bambu publishes the excluded width, not mechanical tip separation.
  rightTipOffset: 20.5,
  rightLift: 4,
  stageSeconds: { Homing: 4, 'Bed leveling': 7, 'Nozzle cleaning': 4, 'Flow calibration': 3 },
});

export const SPEEDS = [1, 2, 5, 10, 25, 50, 100];
export const area = Math.PI * (X2D.filament / 2) ** 2;
const createMaterial = (nozzle, bed, dry, density, finish, ams = true, auxiliary = true) => (
  { nozzle, bed, dry, density, finish, ams, auxiliary }
);
export const MATERIALS = {
  'PLA Basic': createMaterial(220, 55, 50, 1.24, 'Satin'),
  'PLA Matte': createMaterial(215, 55, 50, 1.28, 'Matte'),
  'PLA Silk': createMaterial(230, 60, 50, 1.24, 'Silk'),
  PETG: createMaterial(250, 70, 60, 1.27, 'Gloss'),
  ABS: createMaterial(260, 95, 65, 1.04, 'Satin'),
  ASA: createMaterial(260, 95, 65, 1.07, 'Matte'),
  TPU: createMaterial(230, 35, 55, 1.21, 'Satin', false, false),
  'TPU for AMS': createMaterial(225, 40, 55, 1.24, 'Satin'),
  Nylon: createMaterial(270, 90, 65, 1.13, 'Matte'),
  PC: createMaterial(280, 105, 65, 1.20, 'Translucent'),
  'PLA-CF': createMaterial(225, 60, 50, 1.30, 'Carbon fiber'),
  'PA-GF': createMaterial(280, 100, 65, 1.29, 'Matte'),
  'Support for PLA/PETG': createMaterial(225, 60, 50, 1.25, 'Matte'),
  PVA: createMaterial(215, 60, 50, 1.23, 'Translucent', false),
  Custom: createMaterial(215, 55, 50, 1.24, 'Satin'),
};

export function spool(material, color, configuration = {}) {
  const profile = MATERIALS[material] || MATERIALS.Custom;
  return { ...profile, material, color, manufacturer: 'Bambu Lab', capacity: 1000, remaining: 1000,
    dryHours: 8, present: true, rfid: true, ...configuration };
}

export function defaultSpools() {
  return [
    spool('PLA Basic', '#e4a449'), spool('PLA Matte', '#dfded5'), spool('PETG', '#4d9c84'),
    spool('PLA Basic', '#7265a4'), spool('Support for PLA/PETG', '#e2dcb3', { rfid: false }),
  ];
}

export function slotLabel(slot) { return slot === 4 ? 'External' : `A${slot + 1}`; }
export function compatible(s, slot) {
  return !!s?.present && (slot === 4 ? s.auxiliary : s.ams);
}
export function reachable(p, auxiliary = false, shared = false) {
  const right = auxiliary || shared;
  return [p.x, p.y, p.z].every(Number.isFinite) && p.x >= (right ? 20.5 : 0) - 0.001 &&
    p.x <= 256.001 && p.y >= -0.001 && p.y <= 256.001 && p.z >= -0.001 &&
    p.z <= (right ? X2D.auxiliary.z : X2D.main.z) + 0.001;
}
export function coreXY(x, y) { return { a: x + y, b: x - y }; }
export function carriageFor(position, nozzle) {
  return { ...position, x: position.x - (nozzle === 1 ? X2D.rightTipOffset : 0) };
}
export function grams(length, density) { return length * area * density / 1000; }
export function duration(distance, speed, accel) {
  const rampDistance = speed * speed / accel;
  return distance < rampDistance ? 2 * Math.sqrt(distance / accel) : distance / speed + speed / accel;
}
export function traveled(distance, speed, accel, elapsed) {
  const total = duration(distance, speed, accel);
  const ramp = Math.min(speed / accel, total / 2);
  if (elapsed < ramp) return 0.5 * accel * elapsed ** 2;
  if (elapsed >= total - ramp) return distance - 0.5 * accel * Math.max(0, total - elapsed) ** 2;
  return 0.5 * accel * ramp ** 2 + speed * (elapsed - ramp);
}
