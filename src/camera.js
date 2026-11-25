import * as THREE from 'three';

export function screenView(world, quaternion, aspect, fov, screenWidth = 112.5) {
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const widthDistance = screenWidth / (2 * tangent * aspect * 0.84);
  const heightDistance = screenWidth * 9 / 16 / (2 * tangent * 0.79);
  const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  return {
    target: world.clone(),
    position: world.clone().addScaledVector(outward, Math.max(widthDistance, heightDistance) + 4),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
  };
}
