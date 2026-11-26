const paths = {
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  orbit: '<circle cx="12" cy="12" r="7"/><path d="M2 14c0-4 7-8 14-8 5 0 7 3 5 6s-8 6-15 6"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6m-3-4v4"/>',
  chamber: '<path d="M4 4h16v16H4zM4 8h16M8 8v12m8-6h1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
  spool: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m14 19 5 2M7 8l2 2m6 4 2 2"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  power: '<path d="M12 2v10M7 5a8 8 0 1 0 10 0"/>',
  full: '<path d="M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6"/>',
  lens: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="3"/>',
  light: '<path d="M9 18h6m-5 3h4M8 15c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7"/>',
  audio: '<path d="M4 9h4l4-4v14l-4-4H4zm12 0a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  mute: '<path d="M4 9h4l4-4v14l-4-4H4zm12 1 5 5m0-5-5 5"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.5 5.5l2 2m9 9 2 2m0-13-2 2m-9 9-2 2"/>',
  sliders: '<path d="M4 7h16M4 17h16M9 4v6m6 4v6"/>',
  home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-6h6v6"/>',
  temp: '<path d="M10 14.3V5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0Z"/>',
  play: '<path d="m8 5 12 7-12 7Z"/>',
  pause: '<path d="M9 4H6v16h3zm9 0h-3v16h3z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  focus: '<path d="M8 4H4v4m12-4h4v4M8 20H4v-4m12 4h4v-4"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  door: '<path d="M5 21V3h13v18M5 3l10 3v15m-3-8h1"/>',
  warning: '<path d="M12 3 2 21h20L12 3Zm0 7v4m0 3v1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cube}</svg>`;
}
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const button = (text, command, symbol, kind = '', title = text) => `<button type="button" class="${kind}" data-action="${command}" title="${escape(title)}"${!text ? ` aria-label="${escape(title)}"` : ''}>${symbol ? icon(symbol) : ''}${text ? `<span>${text}</span>` : ''}</button>`;
export const time = seconds => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` :
  seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s` : `${Math.floor(seconds)}s`;

export function layout() {
  return `<header class="masthead">
    <a class="product" href="./" aria-label="X2D Print Lab home"><span class="brand-mark">${icon('layers')}</span><span>X2D <strong>Print Lab</strong><small>PRINTER SIMULATOR</small></span></a>
    <div class="header-end"><span class="status-pill"><i></i><span data-text="status">Starting</span></span>
      ${button('', 'audio', 'mute', 'icon-button', 'Enable sound')}${button('', 'settings', 'gear', 'icon-button', 'Simulator settings')}</div>
  </header>
  <main class="workspace">
    <section class="viewport-panel" aria-label="Interactive X2D printer">
      <div class="stage" id="stage">
        <div class="stage-gradient"></div>
        <div class="stage-top"><div class="view-label"><i></i><span data-text="view">STUDIO VIEW</span></div>
          <div class="stage-tools">${button('', 'capture', 'lens', 'icon-button', 'Save screenshot')}${button('', 'fullscreen', 'full', 'icon-button', 'Fullscreen')}</div></div>
        <div class="stage-bottom">
          <div class="view-bar">
            <label class="view-select">${icon('orbit')}<select data-change="view" aria-label="Camera view">
            <option value="studio">Studio</option><option value="front">Front</option><option value="rear">Rear</option><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="chamber">Chamber</option><option value="build">Build plate</option><option value="head">Printhead</option><option value="ams">AMS 2 Pro</option><option value="external">External spool</option><option value="camera">Chamber camera</option>
            </select></label>
            ${button('Door', 'door', 'door', 'camera-button')}${button('Cutaway', 'inspect', 'layers', 'camera-button')}${button('Screen', 'screen', 'focus', 'camera-button screen-shortcut')}
          </div>
          <span class="orbit-hint">Drag to orbit · Scroll or pinch to zoom</span>
        </div>
        ${button('Exit screen', 'exit', 'back', 'focus-exit')}
        <div class="scene-fallback" hidden><strong>3D view unavailable</strong><span>This device could not start WebGL 2.</span>${button('Open printer controls', 'screen', 'monitor', 'primary')}</div>
      </div>
      <div class="scene-footer"><span>Bambu Lab X2D Combo</span><span class="dimensions">392 × 406 × 478 mm <i></i> CoreXY</span><span class="axis-readout" data-text="xyz">X 142.0 · Y 80.0 · Z 118.0</span></div>
    </section>
    <aside class="inspector" aria-label="Simulator controls">
      <div class="tabs" aria-label="Inspector pages">
        ${button('Printer', 'tab:printer', 'cube')}${button('Filament', 'tab:filament', 'spool')}${button('Print files', 'tab:files', 'folder')}
      </div>
      <div class="inspector-page"></div>
      <div class="inspector-footer"><span>Simulation speed</span><select aria-label="Simulation speed" data-change="tempo"></select></div>
    </aside>
  </main>
  <div class="toast" role="status" hidden></div>
  <dialog id="modal"></dialog>
  <input id="import" type="file" accept=".3mf,.gcode,.gco" hidden>
  <section class="printer-display" aria-label="Printer touchscreen"><div class="screen-body"></div></section>`;
}
