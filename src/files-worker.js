import { importPrint } from './files.js';
import { DOMParser } from '@xmldom/xmldom';

self.onmessage = event => {
  const { name, buffer } = event.data;
  try {
    self.postMessage({ plates: importPrint(name, new Uint8Array(buffer), { xmlReader: new DOMParser() }) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
