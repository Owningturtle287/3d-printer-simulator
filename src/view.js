import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { makePrinter, animatePrinter } from './model.js';
import { ExtrusionView } from './extrusion.js';
import { screenView } from './camera.js';

const v = (arr) => new THREE.Vector3(...arr);
const presets = {
  studio: [[705, 476, 1060], [12, 305, 0]],
  front: [[0, 358, 1180], [0, 315, 0]],
  rear: [[-5, 423, -1170], [22, 305, -30]],
  left: [[-1120, 416, 40], [0, 304, 0]],
  right: [[1120, 416, 40], [31, 305, -15]],
  top: [[0, 1720, 18], [0, 299, 0]],
  chamber: [[106, 338, 466], [-10, 311, -61]],
  camera: [[-147, 382, 143], [41, 226, -48]],
  ams: [[350, 782, 581], [0, 546, -6]],
  external: [[577, 411, -459], [213, 290, -132]],
};

export function createView(container, surface, printer, onAction, quality = 'high') {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'world';
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  const baked = pmrem.fromScene(environment, 0.025);
  scene.environment = baked.texture;
  scene.environmentIntensity = 0.49;
  environment.dispose();
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xe8f3fa, 2.15);
  key.position.set(-455, 1070, 540);
  key.castShadow = true;
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -520; cam.right = cam.top = 520;
  cam.near = 8; cam.far = 2140;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 1.5;
  key.shadow.radius = 5;
  const fill = new THREE.DirectionalLight(0xb3c6d9, 1.15);
  fill.position.set(630, 890, -500);
  scene.add(key, fill, new THREE.HemisphereLight(0xe1eae8, 0x566169, 0.55));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4500, 4500),
    new THREE.ShadowMaterial({ color: 0x070b0d, opacity: 0.12, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);
  const contactCanvas = document.createElement('canvas');
  contactCanvas.width = contactCanvas.height = 128;
  const ctx = contactCanvas.getContext('2d');
  const fade = ctx.createRadialGradient(64, 64, 7, 64, 64, 63);
  fade.addColorStop(0, 'rgba(24,33,35,.47)'); fade.addColorStop(0.48, 'rgba(24,33,35,.28)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, 128, 128);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(730, 690),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(contactCanvas), transparent: true, depthWrite: false }));
  contact.position.y = 0.2; contact.rotation.x = -Math.PI / 2;
  scene.add(contact);

  const camera = new THREE.PerspectiveCamera(37, 1, 1, 9500);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.1;
  orbit.minDistance = 125;
  orbit.maxDistance = 2700;
  orbit.maxPolarAngle = Math.PI * 0.92;
  orbit.zoomToCursor = true;
  orbit.screenSpacePanning = true;
  const cssScene = new THREE.Scene();
  const overlay = new CSS3DRenderer();
  overlay.domElement.className = 'display-layer';
  container.append(overlay.domElement);
  const screen = new CSS3DObject(surface);
  const chassis = makePrinter(scene);
  chassis.screen.updateWorldMatrix(true, false);
  const screenPivot = chassis.screen.localToWorld(v([0, 0, 9.12]));
  const screenQuaternion = chassis.screen.getWorldQuaternion(new THREE.Quaternion());
  screen.position.copy(screenPivot);
  screen.quaternion.copy(screenQuaternion);
  screen.scale.setScalar(112.5 / 720);
  cssScene.add(screen);

  const extrusion = new ExtrusionView(chassis.deposited);
  const tracked = new THREE.Vector3(), nextTracked = new THREE.Vector3(), trackingDelta = new THREE.Vector3();
  animatePrinter(chassis, printer.state, printer.carriage, 0, false, quality);
  printer.subscribe((event, data) => {
    if (event === 'extrude') extrusion.add(data);
    if (event === 'clear') extrusion.clear();
  });
  let current = 'studio', focus = false, remembered = null, transition = null;
  let inspect = false;
  let dimensions = { width: 1, height: 1 };
  function setQuality(value) {
    quality = value;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.65 : quality === 'medium' ? 1.25 : 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = quality !== 'low';
    key.castShadow = quality !== 'low';
    resize();
  }
  function focusTransform() { return screenView(screenPivot, screenQuaternion, camera.aspect, camera.fov); }
  function presetTransform(name) {
    if (name === 'screen') return focusTransform();
    let [position, target] = presets[name] || presets.studio;
    if (name === 'head') {
      const gp = chassis.head.getWorldPosition(tracked);
      target = [gp.x + 13, gp.y - 17, gp.z + 2];
      position = [gp.x + 39, gp.y - 29, gp.z + 181];
    }
    const p = v(position), t = v(target);
    if (camera.aspect < 1.08 && ['studio', 'front', 'rear', 'left', 'right', 'top'].includes(name)) {
      p.sub(t).multiplyScalar(1 + Math.max(0, 1.08 - camera.aspect) * 0.45).add(t);
    }
    return { position: p, target: t, up: v([0, 1, 0]) };
  }
  function applyView(transform) {
    camera.position.copy(transform.position); orbit.target.copy(transform.target);
    camera.up.copy(transform.up); camera.lookAt(orbit.target);
  }
  function resize() {
    dimensions = { width: container.clientWidth || 1, height: container.clientHeight || 1 };
    const { width, height } = dimensions;
    renderer.setSize(width, height, false);
    overlay.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (focus) {
      if (transition) transition.to = focusTransform();
      else applyView(focusTransform());
    }
  }
  function moveTo(transform) {
    transition = { from: { position: camera.position.clone(), target: orbit.target.clone(), up: camera.up.clone() },
      to: transform, t: 0 };
    orbit.enabled = false;
  }
  function show(name) {
    if (name === 'screen') {
      if (focus) return;
      remembered = { position: camera.position.clone(), target: orbit.target.clone(), up: camera.up.clone(),
        anchor: current === 'head' ? tracked.clone() : null };
      focus = true;
    } else if (focus) {
      focus = false;
      if (name === 'exit') {
        if (remembered?.anchor) {
          chassis.head.getWorldPosition(tracked);
          trackingDelta.subVectors(tracked, remembered.anchor);
          remembered.position.add(trackingDelta);
          remembered.target.add(trackingDelta);
        }
        moveTo(remembered || presetTransform(current));
        remembered = null;
        surface.classList.remove('focused');
        return;
      }
    }
    if (name !== 'screen') current = name;
    surface.classList.toggle('focused', focus);
    moveTo(presetTransform(name));
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  setQuality(quality);
  applyView(presetTransform('studio'));

  const raycaster = new THREE.Raycaster();
  let pressed;
  renderer.domElement.addEventListener('pointerdown', event => {
    if (event.isPrimary) pressed = [event.clientX, event.clientY];
  });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!pressed || event.button !== 0 || focus || transition) return;
    const delta = Math.hypot(pressed[0] - event.clientX, pressed[1] - event.clientY);
    pressed = null;
    if (delta > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hits = raycaster.intersectObject(chassis.root, true).filter(hit => hit.object.visible && hit.object.material.opacity >= 0.2);
    for (const hit of hits) {
      let node = hit.object;
      while (node && node !== chassis.root) {
        if (node.userData.action) { onAction(node.userData.action); return; }
        node = node.parent;
      }
      if (!hit.object.material.transparent) return;
    }
  });
  renderer.domElement.addEventListener('pointercancel', () => { pressed = null; });
  surface.addEventListener('pointerdown', event => { event.stopPropagation(); });
  surface.addEventListener('click', () => { if (!focus) onAction('screen'); });

  let lastRendered = 0;
  function render(now, dt) {
    const state = printer.state;
    animatePrinter(chassis, state, printer.carriage, dt, inspect, quality, !focus && (current === 'head' || current === 'chamber'));
    if (current === 'head' && !focus) {
      chassis.head.getWorldPosition(nextTracked);
      trackingDelta.subVectors(nextTracked, tracked);
      tracked.copy(nextTracked);
      if (transition) {
        transition.to.position.add(trackingDelta);
        transition.to.target.add(trackingDelta);
      } else {
        camera.position.add(trackingDelta);
        orbit.target.add(trackingDelta);
      }
    }
    if (transition) {
      transition.t += Math.min(0.65, Math.max(0.015, (now - (transition.last || now - 1000 * dt)) / 1000));
      transition.last = now;
      const x = Math.min(1, transition.t / 0.52), f = 1 - (1 - x) ** 3;
      const { from, to } = transition;
      camera.position.lerpVectors(from.position, to.position, f);
      orbit.target.lerpVectors(from.target, to.target, f);
      camera.up.lerpVectors(from.up, to.up, f).normalize();
      camera.lookAt(orbit.target);
      if (x === 1) {
        transition = null;
        orbit.enabled = !focus && current !== 'camera';
        if (orbit.enabled) orbit.update(0);
      }
    } else if (orbit.enabled) orbit.update(dt);
    extrusion.update(state);
    const normal = v([0, 0, 1]).applyQuaternion(screenQuaternion);
    const toward = camera.position.clone().sub(screenPivot).normalize();
    const closeView = current === 'head' || current === 'chamber' || current === 'camera';
    surface.style.visibility = normal.dot(toward) > 0.22 && (focus || !closeView) ? 'visible' : 'hidden';
    if (quality === 'low' && now - lastRendered < 31) return;
    lastRendered = now;
    renderer.render(scene, camera);
    overlay.render(cssScene, camera);
  }
  function capture() {
    renderer.render(scene, camera);
    const rendered = renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    const context = canvas.getContext('2d');
    const styles = getComputedStyle(container);
    const x = canvas.width * .46, y = canvas.height * .34;
    const gradient = context.createRadialGradient(x, y, 0, x, y, Math.max(canvas.width, canvas.height) * .72);
    gradient.addColorStop(0, styles.getPropertyValue('--studio-core').trim());
    gradient.addColorStop(.52, styles.getPropertyValue('--studio-mid').trim());
    gradient.addColorStop(1, styles.getPropertyValue('--studio-edge').trim());
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(rendered, 0, 0);
    return canvas.toDataURL('image/png');
  }

  return { show, render, setQuality, setInspection: value => { inspect = value; }, capture };
}
