import { unzipSync, strFromU8 } from 'fflate';
import { parseGcode } from './gcode.js';
import { sliceTriangles } from './slicing.js';

const MB = 1024 ** 2;
export const UPLOAD_LIMIT = 64 * MB;
const allowed = /(?:\.gcode|\.model|(?:project_settings|slice_info)\.config|(?:plate|thumbnail)[\w/.-]*\.(?:png|jpg|jpeg))$/i;

export function importPrint(name, bytes, { xmlReader = new DOMParser() } = {}) {
  const title = name.replace(/(?:\.gcode)?\.(?:3mf|gcode|gco)$/i, '');
  if (!bytes.byteLength || bytes.byteLength > UPLOAD_LIMIT) throw new Error('Choose a nonempty print file under 64 MB.');
  if (/\.(?:gcode|gco)$/i.test(name)) return [parseGcode(strFromU8(bytes), { name: title })];
  if (!/\.3mf$/i.test(name)) throw new Error('Choose a .3mf, .gcode or .gco file.');

  let expanded = 0;
  const archive = unzipSync(bytes, { filter: entry => {
    if (!allowed.test(entry.name) || /(^|\/)\.\.(\/|$)|\\/.test(entry.name)) return false;
    expanded += entry.originalSize;
    if (entry.originalSize > 42 * MB || expanded > 90 * MB) throw new Error('The expanded 3MF is too large to open on this device.');
    return true;
  }});
  const paths = Object.keys(archive);
  const toolpaths = paths.filter(path => /\.gcode$/i.test(path));
  if (toolpaths.length) {
    let model = '', requirements = [];
    const settingsPath = paths.find(path => /project_settings\.config$/i.test(path));
    if (settingsPath) {
      try {
        const settings = JSON.parse(strFromU8(archive[settingsPath]));
        model = settings.printer_model || settings.printer_settings_id || '';
        if (typeof model !== 'string') model = '';
        if (Array.isArray(settings.filament_type)) requirements = settings.filament_type.slice(0, 16).map((type, i) =>
          ({ type: typeof type === 'string' ? type : '', color: settings.filament_colour?.[i] }));
      } catch { /* Standalone G-code metadata can still identify the printer. */ }
    }
    return toolpaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((path, index) => {
      const id = path.match(/plate[_-]?(\d+)/i)?.[1] ?? index + 1;
      const thumbnailPath = paths.find(x => new RegExp(`plate[_-]?${id}(?:_small)?\\.(png|jpe?g)$`, 'i').test(x));
      const thumbnail = thumbnailPath && archive[thumbnailPath].length <= 2 * MB ?
        new Blob([archive[thumbnailPath]], { type: /\.png$/i.test(thumbnailPath) ? 'image/png' : 'image/jpeg' }) : undefined;
      const options = { name: title, plate: Number(id), model, thumbnail };
      try { return { ...parseGcode(strFromU8(archive[path]), options), requirements }; }
      catch (error) {
        if (toolpaths.length === 1) throw error;
        return { ...options, error: error.message };
      }
    });
  }
  const primary = paths.find(path => path.toLowerCase() === '3d/3dmodel.model');
  if (!primary) throw new Error('The archive contains neither G-code nor a readable 3D/3dmodel.model.');
  const triangles = modelTriangles(archive, primary, xmlReader);
  const { gcode } = sliceTriangles(triangles);
  return [{ ...parseGcode(gcode, { name: title }), locallySliced: true }];
}

const child = (element, name) => children(element, name)[0];
function children(element, name) { return Array.from(element?.children || []).filter(el => el.localName === name); }
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const units = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
function transform(raw) {
  if (!raw) return identity;
  const parts = raw.trim().split(/\s+/).map(Number);
  if (parts.length !== 12 || !parts.every(Number.isFinite)) throw new Error('Invalid 3MF transform.');
  return parts;
}
function point(matrix, vertex) {
  const [x, y, z] = vertex;
  return [0, 1, 2].map(a => matrix[a] * x + matrix[a + 3] * y + matrix[a + 6] * z + matrix[a + 9]);
}

export function modelTriangles(archive, primary, reader) {
  const documents = new Map(), triangles = [], limit = 300_000;
  function load(path) {
    if (!archive[path]) throw new Error(`Missing 3MF model part ${path}.`);
    if (!documents.has(path)) {
      const xml = strFromU8(archive[path]);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('External XML declarations are unsupported.');
      const doc = reader.parseFromString(xml, 'application/xml');
      const root = doc.documentElement;
      if (root?.localName !== 'model' || doc.getElementsByTagName('parsererror').length) throw new Error('Invalid 3MF model XML.');
      const supported = new Set(['p', 'm']);
      const extensions = (root.getAttribute('requiredextensions') || '').trim().split(/\s+/).filter(Boolean);
      if (extensions.some(prefix => !supported.has(prefix))) throw new Error('This unsliced 3MF requires an unsupported model extension.');
      const objects = new Map(children(child(root, 'resources'), 'object').map(obj => [obj.getAttribute('id'), obj]));
      documents.set(path, { root, objects, scale: units[root.getAttribute('unit') || 'millimeter'] });
    }
    return documents.get(path);
  }
  function visit(path, id, transforms, seen) {
    const key = `${path}:${id}`;
    if (seen.has(key) || seen.size > 24) throw new Error('Circular or excessively nested 3MF components.');
    const { objects } = load(path);
    const object = objects.get(id);
    if (!object) throw new Error(`Missing 3MF object ${id}.`);
    const mesh = child(object, 'mesh');
    if (mesh) {
      const vertices = children(child(mesh, 'vertices'), 'vertex').map(v => ['x', 'y', 'z'].map(axis => {
        if (!v.hasAttribute(axis)) throw new Error('Missing 3MF vertex coordinate.');
        return Number(v.getAttribute(axis));
      })).map(v => transforms.reduce((p, matrix) => point(matrix, p), v));
      for (const element of children(child(mesh, 'triangles'), 'triangle')) {
        const verticesOfFace = ['v1', 'v2', 'v3'].map(a => element.hasAttribute(a) && vertices[Number(element.getAttribute(a))]);
        if (verticesOfFace.some(v => !v)) throw new Error('A 3MF face references a missing vertex.');
        triangles.push(verticesOfFace);
        if (triangles.length > limit) throw new Error('Mesh exceeds the 300,000-triangle lightweight slicing limit.');
      }
    } else {
      const stack = new Set(seen).add(key);
      for (const part of children(child(object, 'components'), 'component')) {
        visit(part.getAttribute('p:path')?.replace(/^\//, '') || path, part.getAttribute('objectid'),
          [transform(part.getAttribute('transform')), ...transforms], stack);
      }
    }
  }
  const { root, scale } = load(primary);
  if (!scale) throw new Error('Unrecognized 3MF unit.');
  const mm = [scale, 0, 0, 0, scale, 0, 0, 0, scale, 0, 0, 0];
  for (const item of children(child(root, 'build'), 'item').filter(el => el.getAttribute('printable') !== '0')) {
    visit(item.getAttribute('p:path')?.replace(/^\//, '') || primary, item.getAttribute('objectid'),
      [transform(item.getAttribute('transform')), mm], new Set());
  }
  if (!triangles.length) throw new Error('The 3MF has no printable build items.');
  return triangles;
}
