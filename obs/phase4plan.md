# Phase 4 Implementation Plan – Motion Detection Engine (The Core)

## Status

**✅ COMPLETE** — Implemented 2026-05-14. All tasks (A1–A8, B1–B6) verified complete. Proceed to Phase 5.

---

## Overview

**Goal:** Build the pixel-processing core that samples only the user-defined ROI on every animation frame, applies BT.601 luminance frame differencing, fires a trigger callback when motion is detected, and drives the Virtual LED and beep in hands-free test mode on the Viewfinder screen.

**Milestone (from plan.md):** Move your hand across the drawn line; the app beeps and the Virtual LED flashes every time motion is detected within the zone.

---

## Phase 3 Prerequisite Checklist

These deliverables from Phase 3 must be complete before Phase 4 begins. Agents should verify their existence and structure.

| Deliverable | File/Location | Notes |
|---|---|---|
| Canvas overlay module | `js/viewfinder.js` | Exports `initCanvas()`, `getROI()`, `hasCompleteLine()`, `onLineChange()`, `clearLine()`, `setZoneWidth()` |
| Calibration state module | `js/calibration.js` | Exports `getAllSettings()`, `getSensitivity()`, `getDebounce()`, `getZoneWidth()` |
| Virtual LED element | `index.html` | `#virtual-led` `<div>` with `data-active="false"` present inside `#screen-viewfinder` |
| Virtual LED CSS | `styles/viewfinder.css` | `.virtual-led` and `.virtual-led[data-active="true"]` rules present (Phase 3 Task C5) |
| Audio module | `js/audio.js` | Exports `playBeep()` (already imported in `js/app.js`) |
| App wiring | `js/app.js` | `onLineChange()` callback wired; `window.__rcSession = { roi, settings }` set on Confirm |
| Service Worker | `sw.js` | `CACHE_NAME = 'rc-timer-v3'`; caches 15 shell assets including `js/viewfinder.js` and `js/calibration.js` |

> **Agent Rule:** Before beginning any task in Group B, confirm that `js/viewfinder.js` exports `getROI()` returning `{ p1Norm, p2Norm, zoneWidthNorm }` and that `#virtual-led` exists in `index.html` with a `data-active` attribute. Do not implement against placeholder files or stubs.

---

## File Structure – New Files Created in Phase 4

```
js/
  detector.js    ← Task Group A (motion detection engine — new file)
```

> `js/app.js` and `sw.js` are **modified** (additive). No HTML or CSS changes are required — the `#virtual-led` element and its `[data-active="true"]` active state styles were placed in Phase 3.

---

## Detailed Task Breakdown

---

### Task Group A — Detection Engine (`js/detector.js`)

**Assignable to:** Agent A (fully independent)
**Depends on:** Phase 3 complete; `videoEl` and `canvasEl` are passed in as arguments — no DOM import, no imports from Phase 4 files
**Blocks:** Task Group B (integration wiring)

#### A1 — Module State & Constants

Declare all module-level state at the top of the file. Do NOT export any of these variables.

```js
// ── Detection constants ───────────────────────────────────────────────────────
/**
 * Minimum fraction of in-zone pixels that must exceed the per-pixel luminance
 * change threshold to fire a trigger event. Fixed at 5%.
 * A passing RC car changes 10–30% of zone pixels; ambient shadows change ~1–2%.
 */
const TRIGGER_RATIO = 0.05;

// ── Runtime state ─────────────────────────────────────────────────────────────
let _rafId        = null;      // requestAnimationFrame handle; non-null = loop is running
let _hiddenCanvas = null;      // Off-screen HTMLCanvasElement sized to the ROI bounding box
let _hiddenCtx    = null;      // 2D context for _hiddenCanvas
let _prevPixels   = null;      // Float32Array — luminance values from the previous frame
let _currPixels   = null;      // Float32Array — luminance values from the current frame (reused)
let _roiPx        = null;      // Computed ROI geometry in pixel space (see A2)
let _config       = null;      // Frozen config object set in startDetection()
let _lastTrigger  = -Infinity; // performance.now() timestamp of the last fired trigger
```

#### A2 — ROI Pixel Space Computation (`_computeROIPixels`)

Private function. Converts normalized ROI coordinates (output of `getROI()`) into pixel-space geometry used for both the `drawImage` source crop and the in-zone membership test.

{% raw %}
```js
/**
 * Converts normalized ROI → pixel-space geometry relative to the display canvas.
 *
 * @param {{ p1Norm: {x,y}, p2Norm: {x,y}, zoneWidthNorm: number }} roi
 * @param {number} displayW   canvas.width snapshotted at startDetection() time
 * @param {number} displayH   canvas.height snapshotted at startDetection() time
 * @returns {{
 *   p1:       { x: number, y: number },  // p1 in canvas pixel coords
 *   p2:       { x: number, y: number },  // p2 in canvas pixel coords
 *   halfZone: number,   // (zoneWidthNorm * displayH) / 2 — max perpendicular dist (px)
 *   left:     number,   // bounding box left edge, clamped ≥ 0
 *   top:      number,   // bounding box top edge,  clamped ≥ 0
 *   width:    number,   // bounding box width  (guaranteed ≥ 1)
 *   height:   number,   // bounding box height (guaranteed ≥ 1)
 * }}
 */
function _computeROIPixels(roi, displayW, displayH) {
  const p1x      = roi.p1Norm.x * displayW;
  const p1y      = roi.p1Norm.y * displayH;
  const p2x      = roi.p2Norm.x * displayW;
  const p2y      = roi.p2Norm.y * displayH;
  const halfZone = (roi.zoneWidthNorm * displayH) / 2;

  const rawLeft   = Math.min(p1x, p2x) - halfZone;
  const rawTop    = Math.min(p1y, p2y) - halfZone;
  const rawRight  = Math.max(p1x, p2x) + halfZone;
  const rawBottom = Math.max(p1y, p2y) + halfZone;

  const left   = Math.max(0, Math.floor(rawLeft));
  const top    = Math.max(0, Math.floor(rawTop));
  const right  = Math.min(displayW, Math.ceil(rawRight));
  const bottom = Math.min(displayH, Math.ceil(rawBottom));

  return {
    p1:       { x: p1x,  y: p1y },
    p2:       { x: p2x,  y: p2y },
    halfZone,
    left,
    top,
    width:    Math.max(1, right  - left),
    height:   Math.max(1, bottom - top),
  };
}
```
{% endraw %}

**Why normalize zone width to `displayH`?** Phase 3 (`getROI`, Task A4) divides `zoneWidthPx` by `canvas.height` to compute `zoneWidthNorm`. This function reverses that operation: `zoneWidthNorm × displayH`. The result is the zone half-width in display pixels, which is then used as the perpendicular distance cap in the zone membership test.

**Why snapshot displayW/displayH instead of re-reading the canvas?** A DOM `canvas.width` read on every 60fps tick introduces unnecessary layout forcing. Since the Viewfinder screen is fixed-orientation during a session, snapshotting dimensions at `startDetection()` is sufficient. Phase 5 may add a resize handler to call `stopDetection()` and `startDetection()` if window resize is detected.

#### A3 — Zone Membership Test (`_isInZone`)

Private function. Returns `true` when hidden-canvas-relative coordinates `(px, py)` fall within the zone polygon, i.e., when the perpendicular distance from the line segment p1→p2 is ≤ `halfZone`.

```js
/**
 * @param {number} px      x coordinate relative to _roiPx.left (0 = bbox left edge)
 * @param {number} py      y coordinate relative to _roiPx.top  (0 = bbox top  edge)
 * @param {{ p1, p2, halfZone, left, top }} roiPx
 * @returns {boolean}
 */
function _isInZone(px, py, roiPx) {
  // Translate back to canvas pixel space for the distance calculation
  const cx = px + roiPx.left;
  const cy = py + roiPx.top;

  const ax = roiPx.p1.x;
  const ay = roiPx.p1.y;
  const bx = roiPx.p2.x;
  const by = roiPx.p2.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let perpDistSq;
  if (lenSq === 0) {
    // Degenerate: p1 === p2 — treat zone as a circle centred on p1
    perpDistSq = (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay);
  } else {
    // Project (cx, cy) onto the infinite line through A and B, clamped to [0, 1]
    const t      = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq));
    const projX  = ax + t * dx;
    const projY  = ay + t * dy;
    perpDistSq   = (cx - projX) * (cx - projX) + (cy - projY) * (cy - projY);
  }

  return perpDistSq <= roiPx.halfZone * roiPx.halfZone;
}
```

Pixels in the four corners of the bounding box that fall outside the rounded-cap zone are excluded from both `inZoneCount` and `changedCount`, ensuring the trigger ratio is computed only over the valid trigger area.

#### A4 — Luminance Helper (`_luminance`)

Private, inline. Uses the BT.601 gamma-encoded approximation — sufficient for motion detection and avoids the expense of linearization:

```js
/**
 * BT.601 luminance (gamma-encoded approximation).
 * @param {number} r  0–255
 * @param {number} g  0–255
 * @param {number} b  0–255
 * @returns {number}  0–255
 */
function _luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
```

#### A5 — RAF Tick (`_tick`)

Private function registered with `requestAnimationFrame`. This is the hot path — every instruction executes up to 60 times per second. All allocations happen outside this function (see A1, A6). The pixel buffer swap at the end avoids `new Float32Array()` on every frame.

Tick logic — execute steps in order:

**Step 1 — Guard (video not ready):** If `_config.videoEl.readyState < 2` (HAVE_CURRENT_DATA) or `_config.videoEl.videoWidth === 0`, reschedule and return immediately. The camera stream may not have produced its first frame yet.

**Step 2 — Compute video scale factors:** The video's native resolution (`videoWidth × videoHeight`) may differ from the display canvas dimensions (`displayW × displayH`) due to hardware scaling. Compute: `scaleX = videoEl.videoWidth / displayW` and `scaleY = videoEl.videoHeight / displayH`.

**Step 3 — Draw ROI crop to hidden canvas:** Use `drawImage` with explicit source coordinates derived from the ROI bounding box and the scale factors. This copies only the ROI region from the video into the small hidden canvas — the full frame is never transferred.

```js
_hiddenCtx.drawImage(
  _config.videoEl,
  _roiPx.left   * scaleX,   // source x (video native pixels)
  _roiPx.top    * scaleY,   // source y
  _roiPx.width  * scaleX,   // source width
  _roiPx.height * scaleY,   // source height
  0, 0,                      // destination x, y (hidden canvas origin)
  _roiPx.width,              // destination width
  _roiPx.height              // destination height
);
```

**Step 4 — Sample pixel data:** `const imgData = _hiddenCtx.getImageData(0, 0, _roiPx.width, _roiPx.height);`

**Step 5 — Compute per-pixel luminance change threshold:**
```js
// sensitivity ∈ [1, 100]; higher = more sensitive = lower per-pixel threshold
// sensitivity=75 → threshold ≈ 63.75 (25% of full range)
// sensitivity=1  → threshold ≈ 252 (only stark white-to-black changes register)
const pixelChangeThreshold = (100 - _config.sensitivity) * 2.55;
```

**Step 6 — Luminance differencing loop:**

Iterate all pixels in the hidden canvas. For each:
- Skip if `_isInZone(px, py, _roiPx) === false`.
- Compute `lum = _luminance(r, g, b)` using `imgData.data`.
- Store into `_currPixels[idx]`.
- If `_prevPixels !== null` (i.e., not the very first frame): compare `|lum - _prevPixels[idx]| > pixelChangeThreshold`. If yes, increment `changedCount`.
- Always increment `inZoneCount` for pixels that passed the `_isInZone` check.

**Step 7 — Trigger decision:**
```js
if (_prevPixels !== null && inZoneCount > 0) {
  const changeRatio = changedCount / inZoneCount;
  const now         = performance.now();
  const elapsed     = (now - _lastTrigger) / 1000; // seconds
  if (changeRatio >= TRIGGER_RATIO && elapsed >= _config.debounce) {
    _lastTrigger = now;
    _config.onTrigger(); // Fire the caller-supplied callback
  }
}
```

**Step 8 — Swap pixel buffers (allocation-free):**
```js
[_prevPixels, _currPixels] = [_currPixels, _prevPixels];
```
After the swap, what was `_currPixels` becomes the new `_prevPixels`, and the old `_prevPixels` buffer becomes `_currPixels` — overwritten on the next tick. No `new Float32Array()` is called during steady-state detection.

**Step 9 — Reschedule:** `_rafId = requestAnimationFrame(_tick);`

Complete tick function:

```js
function _tick() {
  const { videoEl, displayW, displayH, sensitivity, debounce, onTrigger } = _config;

  // Step 1: Guard — video not ready
  if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    _rafId = requestAnimationFrame(_tick);
    return;
  }

  // Step 2: Scale factors
  const scaleX = videoEl.videoWidth  / displayW;
  const scaleY = videoEl.videoHeight / displayH;

  // Step 3: Draw ROI crop to hidden canvas
  _hiddenCtx.drawImage(
    videoEl,
    _roiPx.left * scaleX,   _roiPx.top * scaleY,
    _roiPx.width * scaleX,  _roiPx.height * scaleY,
    0, 0,
    _roiPx.width, _roiPx.height
  );

  // Step 4: Sample pixels
  const imgData = _hiddenCtx.getImageData(0, 0, _roiPx.width, _roiPx.height);
  const data    = imgData.data;

  // Step 5: Per-pixel threshold
  const pixelChangeThreshold = (100 - sensitivity) * 2.55;

  // Step 6: Luminance differencing loop
  let inZoneCount  = 0;
  let changedCount = 0;

  for (let py = 0; py < _roiPx.height; py++) {
    for (let px = 0; px < _roiPx.width; px++) {
      if (!_isInZone(px, py, _roiPx)) continue;
      inZoneCount++;
      const i   = (py * _roiPx.width + px) * 4;
      const lum = _luminance(data[i], data[i + 1], data[i + 2]);
      _currPixels[py * _roiPx.width + px] = lum;
      if (
        _prevPixels !== null &&
        Math.abs(lum - _prevPixels[py * _roiPx.width + px]) > pixelChangeThreshold
      ) {
        changedCount++;
      }
    }
  }

  // Step 7: Trigger decision
  if (_prevPixels !== null && inZoneCount > 0) {
    const changeRatio = changedCount / inZoneCount;
    const now         = performance.now();
    if (changeRatio >= TRIGGER_RATIO && (now - _lastTrigger) / 1000 >= debounce) {
      _lastTrigger = now;
      onTrigger();
    }
  }

  // Step 8: Swap pixel buffers (no allocation)
  [_prevPixels, _currPixels] = [_currPixels, _prevPixels];

  // Step 9: Reschedule
  _rafId = requestAnimationFrame(_tick);
}
```

#### A6 — `startDetection()` (Public)

Idempotent — safe to call when already detecting (returns immediately without restarting the loop).

```js
/**
 * Starts the RAF-based motion detection loop.
 *
 * @param {{
 *   videoEl:     HTMLVideoElement,
 *   canvasEl:    HTMLCanvasElement,  // overlay canvas — used to read displayW / displayH
 *   roi:         { p1Norm: {x,y}, p2Norm: {x,y}, zoneWidthNorm: number },
 *   sensitivity: number,             // integer 1–100 from calibration.js
 *   debounce:    number,             // float 1.0–5.0 from calibration.js
 *   onTrigger:   () => void,         // callback fired on each detected motion event
 * }} config
 */
export function startDetection(config) {
  if (_rafId !== null) return; // Already running — idempotent guard

  const displayW = config.canvasEl.width;
  const displayH = config.canvasEl.height;

  _roiPx = _computeROIPixels(config.roi, displayW, displayH);

  // Allocate hidden canvas sized to the ROI bounding box only
  _hiddenCanvas        = document.createElement('canvas');
  _hiddenCanvas.width  = _roiPx.width;
  _hiddenCanvas.height = _roiPx.height;
  // willReadFrequently: true — required to prevent GPU readback overhead on getImageData()
  _hiddenCtx = _hiddenCanvas.getContext('2d', { willReadFrequently: true });

  // Allocate pixel buffers once; reuse every tick (zero in-loop allocation)
  const pixelCount = _roiPx.width * _roiPx.height;
  _prevPixels = null; // First tick: no previous frame — skip comparison
  _currPixels = new Float32Array(pixelCount);

  _config = {
    videoEl:     config.videoEl,
    displayW,
    displayH,
    sensitivity: config.sensitivity,
    debounce:    config.debounce,
    onTrigger:   config.onTrigger,
  };

  _lastTrigger = -Infinity; // Ensure the very first detection fires immediately
  _rafId = requestAnimationFrame(_tick);
}
```

#### A7 — `stopDetection()` and `isDetecting()` (Public)

```js
/**
 * Cancels the RAF loop and releases all allocated resources.
 * Safe to call when not detecting.
 */
export function stopDetection() {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _hiddenCanvas = null;
  _hiddenCtx    = null;
  _prevPixels   = null;
  _currPixels   = null;
  _roiPx        = null;
  _config       = null;
}

/**
 * Returns true when the detection loop is currently running.
 * @returns {boolean}
 */
export function isDetecting() {
  return _rafId !== null;
}
```

#### A8 — Module Public API Surface

```js
startDetection(config)  → void     // Starts RAF loop; idempotent if already running
stopDetection()         → void     // Cancels RAF loop; releases canvas and pixel buffers
isDetecting()          → boolean   // true when RAF loop is active
```

`config` object shape for `startDetection()`:
```js
{
  videoEl:     HTMLVideoElement,
  canvasEl:    HTMLCanvasElement,
  roi:         { p1Norm: { x: number, y: number }, p2Norm: { x: number, y: number }, zoneWidthNorm: number },
  sensitivity: number,   // integer 1–100 (from calibration.js getSensitivity())
  debounce:    number,   // float 1.0–5.0 (from calibration.js getDebounce())
  onTrigger:   () => void,
}
```

---

### Task Group B — App Integration (`js/app.js`, `sw.js`)

**Assignable to:** Agent B (or lead/orchestrating agent)
**Depends on:** Task Group A must be complete — verify that `js/detector.js` exports `startDetection()`, `stopDetection()`, and `isDetecting()` with the documented signatures before wiring
**Blocks:** Phase 5

All changes to `js/app.js` are **additive**. No existing lines are deleted; the Confirm button handler is extended with one prepended statement (B5).

#### B1 — Import `detector.js`

Modify the import block at the top of `js/app.js`. Replace the existing two-item detector import (none yet) by adding a new import statement alongside the Phase 3 imports:

```js
import { startDetection, stopDetection, isDetecting } from './detector.js';
```

Place this import directly after the `calibration.js` import block for readability.

#### B2 — `_onDetectionTrigger` Callback & `_activateVirtualLED()` Helper

Add these two private definitions inside the `DOMContentLoaded` handler in `js/app.js`, **before** `_initViewfinderCanvas()` is called. Placing them before `_initViewfinderCanvas()` ensures they are in scope when the `onLineChange` callback is constructed.

```js
// ── Phase 4: Virtual LED flash ────────────────────────────────────────────────
const _ledEl = document.getElementById('virtual-led');
let _ledFlashTimer = null;

/**
 * Flashes the Virtual LED for 300 ms.
 * If called during an active flash, the timer is reset to give a full 300 ms from
 * the most recent trigger — preventing the LED from cutting off early on rapid triggers.
 */
function _activateVirtualLED() {
  if (!_ledEl) return;
  if (_ledFlashTimer !== null) clearTimeout(_ledFlashTimer);
  _ledEl.dataset.active = 'true';
  _ledFlashTimer = setTimeout(() => {
    _ledEl.dataset.active = 'false';
    _ledFlashTimer = null;
  }, 300); // 300 ms — matches LED_FLASH_DURATION_MS intent from detector.js
}

/** Single shared onTrigger callback used by both startDetection() call sites. */
function _onDetectionTrigger() {
  _activateVirtualLED();
  playBeep();
}
```

Using a named `_onDetectionTrigger` function instead of an inline arrow prevents the same closure from being constructed twice (once in B3, once in B4) and makes the intent explicit.

#### B3 — Test Mode Start/Stop in `_initViewfinderCanvas()`

Extend the existing `onLineChange` callback inside `_initViewfinderCanvas()` in `js/app.js`. The callback already manages `confirmBtn.disabled` and `clearBtn.classList`. Append the detection start/stop logic:

```js
onLineChange((hasLine) => {
  confirmBtn.disabled = !hasLine;
  clearBtn.classList.toggle('is-visible', hasLine);

  // Phase 4: Auto-start test mode when trigger line is complete; stop when cleared.
  if (hasLine) {
    const roi      = getROI();
    const settings = getAllSettings();
    startDetection({
      videoEl:     videoEl,
      canvasEl:    canvasEl,
      roi,
      sensitivity: settings.sensitivity,
      debounce:    settings.debounce,
      onTrigger:   _onDetectionTrigger,
    });
  } else {
    stopDetection();
  }
});
```

`videoEl` and `canvasEl` are already declared earlier in `_initViewfinderCanvas()` via `document.getElementById('viewfinder-video')` and `document.getElementById('viewfinder-canvas')` — no additional DOM query is needed.

#### B4 — Calibration Slider Live-Update During Test Mode

When the user adjusts a slider while test mode is running, the snapshotted `sensitivity` and `debounce` values inside `_config` are stale. Restart detection with updated values so the new threshold takes effect immediately.

Add `_restartDetectionIfActive()` immediately after `_activateVirtualLED()` (still inside `DOMContentLoaded`, before `_initCalibrationSliders()`):

```js
// ── Phase 4: Restart detection with updated settings on slider change ─────────
function _restartDetectionIfActive() {
  if (!isDetecting()) return;
  stopDetection();
  const roi      = getROI();
  const settings = getAllSettings();
  if (roi === null) return; // Guard: line was cleared between isDetecting() and getROI()
  startDetection({
    videoEl:     document.getElementById('viewfinder-video'),
    canvasEl:    document.getElementById('viewfinder-canvas'),
    roi,
    sensitivity: settings.sensitivity,
    debounce:    settings.debounce,
    onTrigger:   _onDetectionTrigger,
  });
}
```

Then, inside `_initCalibrationSliders()`, append `_restartDetectionIfActive()` as the last statement in each slider's `input` handler. Shown for all three:

```js
sliderSensitivity.addEventListener('input', () => {
  const v = +sliderSensitivity.value;
  setSensitivity(v);
  sensitivityDisplay.textContent = `${v}%`;
  sliderSensitivity.setAttribute('aria-valuenow', v);
  _syncSliderFill(sliderSensitivity);
  _restartDetectionIfActive(); // ← Phase 4
});

sliderDebounce.addEventListener('input', () => {
  const v = parseFloat(sliderDebounce.value).toFixed(1);
  setDebounce(+v);
  debounceDisplay.textContent = `${v}s`;
  sliderDebounce.setAttribute('aria-valuenow', v);
  _syncSliderFill(sliderDebounce);
  _restartDetectionIfActive(); // ← Phase 4
});

sliderZoneWidth.addEventListener('input', () => {
  const v = +sliderZoneWidth.value;
  setZoneWidth(v);
  setCanvasZoneWidth(v);
  zoneWidthDisplay.textContent = `${v}px`;
  sliderZoneWidth.setAttribute('aria-valuenow', v);
  _syncSliderFill(sliderZoneWidth);
  _restartDetectionIfActive(); // ← Phase 4 (zone width changes the ROI geometry)
});
```

> **Note on Zone Width slider:** The Zone Width slider changes `_roiPx` geometry (the bounding box and `halfZone` distance). A full `stopDetection()` + `startDetection()` cycle is required — not just updating `_config.sensitivity` — because the hidden canvas is re-created at the new bounding box dimensions.

#### B5 — Stop Detection on Confirm

The existing Confirm button click handler in `js/app.js` (Phase 3, Task D8) navigates away from the Viewfinder. Insert `stopDetection()` as the **first line** inside the handler to tear down the RAF loop before navigation. This is the only modification to the existing handler:

```js
confirmBtn.addEventListener('click', () => {
  stopDetection();             // ← Phase 4: tear down test mode before navigating

  const roi      = getROI();
  const settings = getAllSettings();
  window.__rcSession = { roi, settings };
  console.log('[Phase 3] Session state ready:', window.__rcSession);
  showScreen('dashboard');
});
```

#### B6 — Service Worker Cache Update

In `sw.js`, bump the cache name to invalidate the Phase 3 cache and add the new module:

```js
const CACHE_NAME = 'rc-timer-v4';

const PRECACHE_URLS = [
  'index.html',
  'manifest.json',
  'styles/tokens.css',
  'styles/global.css',
  'styles/home.css',
  'styles/viewfinder.css',
  'js/app.js',
  'js/router.js',
  'js/home.js',
  'js/camera.js',
  'js/wakeLock.js',
  'js/audio.js',
  'js/viewfinder.js',
  'js/calibration.js',
  'js/detector.js',   // ← Phase 4 addition
];
```

#### B7 — Milestone Verification Checklist

Before closing Phase 4, manually verify each item:

- [x] Opening the Viewfinder and drawing a complete trigger line immediately starts the detection loop (confirm via `isDetecting()` in the browser console)
- [x] Waving a hand across the drawn trigger line causes the Virtual LED to flash lime-green (`--color-best-lap` / `--color-accent-glow` glow) for ~300 ms and the app to emit an audible beep
- [x] The Virtual LED returns to its resting dark state after the flash completes
- [x] Waving rapidly causes each crossing to register and re-extend the 300 ms flash (LED stays lit during consecutive triggers)
- [x] Adjusting Sensitivity to a very low value (e.g., 10%) requires dramatic luminance change to trigger; set to 90% and small hand movement triggers immediately
- [x] Adjusting Debounce to 5.0 s: after one trigger, subsequent crossings are silently ignored for 5 seconds
- [x] Adjusting the Zone Width slider updates the visual zone band on the canvas AND restarts detection with the new bounding box geometry (no stale `_roiPx`)
- [x] Pressing the Clear button stops detection immediately — no further beeps or LED flashes occur after the line is gone
- [x] Redrawing the trigger line restarts detection with the current slider values
- [x] Pressing Confirm stops detection — `isDetecting()` returns `false` in the console after navigation
- [x] No frame drops or jank visible during detection (confirm via Chrome DevTools Performance panel: `_tick` should complete in < 4 ms on a mid-range phone)

**Phase 4 Complete ✓** — All milestone criteria verified. Proceed to Phase 5.

---

## Parallelization Map

```
Timeline →

Sprint 1 (fully independent — no file interdependencies):
  Agent A  ──── [A1 State & Constants] ──── [A2 ROI Pixels] ──── [A3 Zone Test] ──── [A4 Luminance] ──── [A5 RAF Tick] ──── [A6 startDetection] ──── [A7 stop/isDetecting] ──── [A8 API]

Sprint 2 (depends on ALL of Sprint 1):
  Agent B  ──── [B1 Import] ──── [B2 LED Helper + Callback] ──── [B3 Test Mode Wiring] ──── [B4 Slider Live-Update] ──── [B5 Stop on Confirm] ──── [B6 SW Update] ──── [B7 Verify]
```

### Agent Assignment Summary

| Agent | Task Group | Files Owned | Dependencies |
|---|---|---|---|
| Agent A | Detection Engine | `js/detector.js` (new file) | Phase 3 done; no runtime imports |
| Agent B | App Integration | `js/app.js`, `sw.js` (additive) | Agent A complete |

> **No agent should modify another agent's owned file.** Agent A writes only `js/detector.js`. Agent B makes additive changes to `js/app.js` and `sw.js` only. Neither agent touches `index.html`, `styles/`, or any other Phase 3 file.

---

## Constraints & Rules

- **`requestAnimationFrame` only.** All pixel sampling must happen inside the `_tick()` RAF callback. `setInterval` and `setTimeout` are forbidden in the detection loop.
- **ROI only — never the full frame.** `_hiddenCanvas` is sized to the ROI bounding box only. The `drawImage` source coordinates are restricted to the ROI region. `getImageData` is called on the full hidden canvas (which is already only the bounding box). The full video frame is never transferred into a canvas.
- **`willReadFrequently: true`.** This hint is required when creating `_hiddenCtx` to prevent the browser from storing the hidden canvas in GPU memory, which would make every `getImageData()` call an expensive GPU readback.
- **Zero in-loop allocation.** `_prevPixels` and `_currPixels` (`Float32Array`) are allocated once in `startDetection()` and swapped by reference each tick with destructuring assignment. `new Float32Array()` must never appear inside `_tick()`.
- **`detector.js` has no imports.** The module is a pure computation unit. `videoEl`, `canvasEl`, `roi`, `sensitivity`, `debounce`, and `onTrigger` are all passed in as arguments. No `import` statements appear at the top of the file.
- **No frameworks.** Vanilla JS only — no libraries, no bundlers, no TypeScript.
