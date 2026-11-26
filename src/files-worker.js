import { importPrint } from './files.js';
import { DOMParser } from '@xmldom/xmldom';

self.onmessage = event => {
  const { name, buffer } = event.data;
  try {
    const plates = importPrint(name, new Uint8Array(buffer), { xmlReader: new DOMParser() });
    self.postMessage({ plates }, plates.flatMap(plate => plate.entries?.buffers() ?? []));
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
