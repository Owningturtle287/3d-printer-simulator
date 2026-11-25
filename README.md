# X2D Print Lab

An independent browser-based 3D printer simulator for the Bambu Lab X2D Combo. The scene, embedded touch controls, AMS 2 Pro, external spool, and print files share one virtual printer. All operations run locally and the simulator has no physical printer connection.

## Open and install

[Open X2D Print Lab](https://owningturtle287.github.io/3d-printer-simulator/)

- On iPhone, open the link in Safari. Tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, then tap **Add**. Open it once online before using it offline.
- On Windows or macOS, open the same link in a WebGL 2 browser. Chrome and Edge offer installation from the address bar or app menu. On supported macOS versions, Safari offers **File → Add to Dock**.
- Open the physical touchscreen or use **Open touchscreen**. Select **Print files → 3DBenchy**, map its filament and choose **Start print**. Choose **100×** in the inspector for a shorter demonstration.
- For your own prints, import sliced 3MF or G-code. Review the plate, map each tool to a spool and start the print from the touchscreen.

## Build from source

Use Node.js 22.12 or newer on macOS or Windows.

```sh
npm ci
npm test
npm run dev
npm run build
npm run preview
```

The build is a static progressive web app. iPhone uses Safari and Add to Home Screen, so the same output works across the three platforms without native compilation. Serve `dist/` over HTTPS for installation and offline use. The **Deploy X2D Print Lab** Actions workflow tests and publishes it to GitHub Pages. In **Settings → Pages**, the source must be **GitHub Actions**.

## What the simulator supports

- Millimeter-scale scene with orbit, pan, pinch zoom, preset views, cutaway, chamber-camera viewpoint, interactive door, AMS lid, and power switch.
- Shared virtual printer state for temperatures, filament, motion, calibration, both nozzles, the displayed print and the physical scene.
- Left main nozzle from the AMS and right auxiliary nozzle from the external spool. Assign job tools to these routes in print preparation. Filament profiles, color, density, remaining mass and local files persist in browser storage.
- G-code and sliced 3MF plates with optional thumbnails. The browser also slices small, closed, unsliced 3MF meshes with a lightweight contour and infill slicer.
- Pre-sliced 3DBenchy, a calibration cube, multicolor job, dual-nozzle support study, bridging test and temperature tower.
- Toolpath deposition, progressive filament use, 1×–100× speed, pause/resume, cancellation, manual fault recovery and print history.
- A page-local `window.x2d` API. `getTelemetry()` returns a detached snapshot. `subscribe(callback)` returns an unsubscribe function. `command(name, ...args)` accepts `start`, `pause`, `resume`, `cancel`, `home`, `calibrate`, `jog`, `setTemperature`, `setNozzle`, `setTempo`, `setLight`, `feed`, `setDrying` and `stopDrying`. `getCameraFrame()` captures the current 3D view.

For verified details, assumptions and file compatibility, see [References and limitations](REFERENCES.md).
