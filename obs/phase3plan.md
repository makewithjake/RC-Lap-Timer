# Phase 3 Implementation Plan – The Setup Layer / Viewfinder (Screen 2)

## Overview

**Goal:** Build the interactive trigger zone drawing layer and calibration toolset on top of the Phase 2 Viewfinder screen, enabling users to define a Trigger Zone line and configure detection sensitivity, debounce, and zone width — all without any detection engine logic.

**Milestone (from plan.md):** A user can draw a line over the track path, adjust all three calibration sliders, and the ROI coordinates plus settings are stored and ready for the detection engine.

---

## Phase 2 Prerequisite Checklist

These deliverables from Phase 2 must be complete before Phase 3 begins. Agents should verify their existence and structure.

| Deliverable | File/Location | Notes |
|---|---|---|
| Camera module | `js/camera.js` | Exports `startCamera()`, `stopCamera()`, `isCameraReady()`, `isCameraActive()` |
| Wake lock module | `js/wakeLock.js` | Exports `acquireWakeLock()`, `releaseWakeLock()`, `isWakeLockActive()` |
| Audio module | `js/audio.js` | Exports `playBeep()`, `speak()`, `announceLap()` |
| Viewfinder CSS | `styles/viewfinder.css` | Full-screen container, video, HUD bar, error banner, stabilizing overlay, confirm button styles — Phase 3 appends to this file |
| Viewfinder HTML | `index.html` | `#screen-viewfinder` section with `<video id="viewfinder-video">`, HUD chips, `#viewfinder-error`, `#viewfinder-stabilizing`, `#btn-test-tts`, and `#viewfinder-confirm` |
| App entry | `js/app.js` | Imports camera, wake lock, audio; wires status callbacks; calls `showScreen('home')` on DOMContentLoaded |
| Service Worker | `sw.js` | `CACHE_NAME = 'rc-timer-v2'`; caches 13 shell assets |

> **Agent Rule:** Do not implement Phase 3 tasks against placeholder files. Confirm that `js/camera.js` exports `isCameraReady()` and that `#viewfinder-confirm` exists in `index.html` as a `disabled` button before starting any integration work in Task Group D.

---

## File Structure – New Files Created in Phase 3

```
js/
  viewfinder.js    ← Task Group A (canvas overlay, drawing logic, ROI normalization)
  calibration.js   ← Task Group B (parallel with A — calibration state module)
```

> `styles/viewfinder.css`, `index.html`, `js/app.js`, and `sw.js` are **modified** (additive), except for the removal of the Phase 2 Test TTS button explicitly sanctioned in Task D1.

---

## Detailed Task Breakdown

---

### Task Group A — Canvas Overlay & Drawing Module (`js/viewfinder.js`)

**Assignable to:** Agent A (independent)
**Depends on:** Phase 2 complete; verify `#viewfinder-video` exists in `index.html`
**Blocks:** Task Group D (integration wiring)

#### A1 — Canvas Initialization

Export `initCanvas(canvasEl, videoEl)`. This is called once by `app.js` after the Viewfinder screen becomes active and the camera stream has started.

Declare module-level state at the top of the file (not exported):

```js
let _canvas = null;
let _ctx = null;
let _videoEl = null;
let _points = [];           // Array of {x, y} in canvas pixel coords; max 2 items
let _draggingIndex = -1;    // Index of handle being dragged (-1 = none)
let _zoneWidthPx = 20;      // Kept in sync via setZoneWidth(); default 20
let _onLineChangeCb = null; // Registered via onLineChange()
```

`initCanvas` responsibilities:
- Store references: `_canvas = canvasEl; _ctx = canvasEl.getContext('2d'); _videoEl = videoEl;`
- Call `_resizeCanvas()` immediately.
- Attach `window.addEventListener('resize', _resizeCanvas)`.
- Set `canvasEl.style.touchAction = 'none'` (CSS also sets this; both are required for iOS Safari compatibility).
- Attach all pointer/touch event listeners (see A2).
- Call `_redraw()` to render the empty initial state.

`_resizeCanvas()` (private):
- Store pre-resize dimensions: `const oldW = _canvas.width; const oldH = _canvas.height;`
- Set `_canvas.width = _canvas.offsetWidth; _canvas.height = _canvas.offsetHeight;`
- If `_points.length > 0` and previous dimensions were non-zero, re-scale each point proportionally: `p.x = p.x * (_canvas.width / oldW); p.y = p.y * (_canvas.height / oldH);`
- Call `_redraw()` after resizing.

#### A2 — Point Placement (Touch & Mouse)

The drawing lifecycle has three states based on `_points.length`:
- `0` = empty
- `1` = partial (first point placed)
- `2` = complete (full line drawn; dragging only)

**Touch events** (attach to `_canvas` with `{ passive: false }`):
- `touchstart`:
  - Call `event.preventDefault()` to block browser scroll and zoom.
  - Compute canvas-relative position: `const rect = _canvas.getBoundingClientRect(); const x = touch.clientX - rect.left; const y = touch.clientY - rect.top;`
  - If `_points.length < 2`: push `{x, y}` to `_points`; call `_redraw()`; fire `_notify()`.
  - If `_points.length === 2`: call `_hitTestHandle(x, y)`. If hit index ≥ 0, set `_draggingIndex` to that index.
- `touchmove` (with `{ passive: false }`):
  - Call `event.preventDefault()`.
  - If `_draggingIndex !== -1`: compute canvas-relative position, clamp to canvas bounds, update `_points[_draggingIndex]`, call `_redraw()`.
- `touchend`:
  - Set `_draggingIndex = -1`.

**Mouse events** (attach to `_canvas`):
- `mousedown`: same placement/hit-test logic as `touchstart`, using `event.clientX / clientY`.
- `mousemove`: if `_draggingIndex !== -1`, compute position, clamp, update point, call `_redraw()`.
- `mouseup`: set `_draggingIndex = -1`.

`_hitTestHandle(x, y)` (private):
- Iterate `_points`; return the index of the first point whose Euclidean distance to `(x, y)` is ≤ 24px; return `-1` if none hit.

`_notify()` (private):
- If `_onLineChangeCb` is set, call `_onLineChangeCb(hasCompleteLine())`.

#### A3 — Canvas Redraw (`_redraw`)

Private function called after every state change. Rendering layers in order (bottom to top):

1. **Clear:** `_ctx.clearRect(0, 0, _canvas.width, _canvas.height)`
2. **Zone band** (only when `_points.length === 2`):
   - `_ctx.beginPath(); _ctx.moveTo(p1.x, p1.y); _ctx.lineTo(p2.x, p2.y);`
   - `_ctx.lineWidth = _zoneWidthPx; _ctx.lineCap = 'round';`
   - `_ctx.strokeStyle = 'rgba(198,255,0,0.25)';` ← `--color-accent` at 25% opacity; canvas cannot read CSS variables — hard-code with a comment referencing the token name.
   - `_ctx.stroke();`
3. **Center trigger line** (only when `_points.length === 2`):
   - `_ctx.beginPath(); _ctx.moveTo(p1.x, p1.y); _ctx.lineTo(p2.x, p2.y);`
   - `_ctx.lineWidth = 2; _ctx.lineCap = 'round'; _ctx.strokeStyle = '#C6FF00';` ← `--color-accent`
   - `_ctx.stroke();`
4. **Handle circles** (for each point in `_points`):
   - `_ctx.beginPath(); _ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);`
   - `_ctx.fillStyle = '#C6FF00';` ← `--color-accent`
   - `_ctx.fill();`
   - `_ctx.lineWidth = 2; _ctx.strokeStyle = '#000000'; _ctx.stroke();`

If only 1 point exists, steps 2 and 3 are skipped; only the single handle circle is drawn.

#### A4 — ROI Data Normalization (`getROI`)

Returns `null` if `_points.length < 2`. Otherwise returns:

```js
{
  p1Norm:        { x: Float, y: Float },  // [0, 1] fraction of canvas width/height
  p2Norm:        { x: Float, y: Float },  // [0, 1] fraction of canvas width/height
  zoneWidthNorm: Float,                   // _zoneWidthPx / _canvas.height — scalar [0, 1]
}
```

Computation:
```js
const p1Norm        = { x: _points[0].x / _canvas.width,  y: _points[0].y / _canvas.height };
const p2Norm        = { x: _points[1].x / _canvas.width,  y: _points[1].y / _canvas.height };
const zoneWidthNorm = _zoneWidthPx / _canvas.height;
```

> **Why normalize zone width to height?** The zone width represents a physical cross-track distance that scales with the shorter video dimension in typical landscape phone usage. Phase 4 recovers the pixel width by multiplying `zoneWidthNorm × canvas.height` at processing time.

#### A5 — Module API (public surface)

```js
initCanvas(canvasEl, videoEl)  → void
clearLine()                    → void     // Resets _points to []; calls _redraw(); fires _notify()
hasCompleteLine()              → boolean  // _points.length === 2
getROI()                       → { p1Norm, p2Norm, zoneWidthNorm } | null
setZoneWidth(px)               → void     // Updates _zoneWidthPx; calls _redraw()
onLineChange(callback)         → void     // callback: (hasLine: boolean) => void
```

---

### Task Group B — Calibration State Module (`js/calibration.js`)

**Assignable to:** Agent B (fully independent of A and C)
**Depends on:** Nothing (pure JS state module — no imports, no DOM dependency)
**Blocks:** Task Group D (integration wiring)

#### B1 — Module Constants & State

```js
const SENSITIVITY_MIN     = 1;
const SENSITIVITY_MAX     = 100;
const SENSITIVITY_DEFAULT = 75;

const DEBOUNCE_MIN     = 1.0;
const DEBOUNCE_MAX     = 5.0;
const DEBOUNCE_DEFAULT = 2.0;

const ZONE_WIDTH_MIN     = 10;
const ZONE_WIDTH_MAX     = 100;
const ZONE_WIDTH_DEFAULT = 20;

let _sensitivity = SENSITIVITY_DEFAULT; // integer 1–100
let _debounce    = DEBOUNCE_DEFAULT;    // float 1.0–5.0, one decimal place
let _zoneWidth   = ZONE_WIDTH_DEFAULT;  // integer 10–100 (pixel units on full-resolution canvas)
```

#### B2 — Getter/Setter Pairs

Each setter clamps the incoming value to the defined min/max bounds before storing it:

- `getSensitivity()` → `_sensitivity`
- `setSensitivity(n)` → `_sensitivity = Math.round(Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, n)))`
- `getDebounce()` → `_debounce`
- `setDebounce(n)` → `_debounce = parseFloat(Math.max(DEBOUNCE_MIN, Math.min(DEBOUNCE_MAX, n)).toFixed(1))`
- `getZoneWidth()` → `_zoneWidth`
- `setZoneWidth(n)` → `_zoneWidth = Math.round(Math.max(ZONE_WIDTH_MIN, Math.min(ZONE_WIDTH_MAX, n)))`

#### B3 — getAllSettings & resetToDefaults

- `getAllSettings()` → returns `{ sensitivity: _sensitivity, debounce: _debounce, zoneWidth: _zoneWidth }`
- `resetToDefaults()` → resets all three values back to their DEFAULT constants

#### B4 — Module API (public surface)

```js
getSensitivity()    → number  // integer, 1–100
setSensitivity(n)   → void
getDebounce()       → number  // float, 1.0–5.0, one decimal place
setDebounce(n)      → void
getZoneWidth()      → number  // integer, 10–100 (pixel units)
setZoneWidth(n)     → void
getAllSettings()     → { sensitivity: number, debounce: number, zoneWidth: number }
resetToDefaults()   → void
```

---

### Task Group C — Viewfinder CSS Additions (`styles/viewfinder.css`)

**Assignable to:** Agent C (fully independent of A and B)
**Depends on:** Phase 1 CSS tokens in `styles/tokens.css` (all token names verified present)
**Blocks:** Task Group D (HTML additions must use the class names defined here)

All additions are **appended** below the existing Phase 2 content in `styles/viewfinder.css`. Do NOT create a new file. Begin the appended section with a clear divider comment.

#### C1 — Canvas Overlay

```css
/* Phase 3: C1 — Canvas overlay for trigger zone drawing */
#viewfinder-canvas {
  position: absolute;
  inset: 0;
  z-index: 15;            /* Above <video> (no explicit z-index), below HUD bar (z-index: 20) */
  width: 100%;
  height: 100%;
  touch-action: none;     /* Belt-and-suspenders with JS event.preventDefault() */
  cursor: crosshair;
}
```

The canvas element's intrinsic `width` and `height` attributes are set by JS in `_resizeCanvas()`. The CSS `width: 100%; height: 100%` controls display size and keeps it flush with the `#screen-viewfinder` container.

#### C2 — Calibration Panel Container

The panel is anchored directly above the Confirm button. `#viewfinder-confirm` has `min-height: 64px` (from Phase 2) and is anchored at `bottom: 0`:

```css
/* Phase 3: C2 — Calibration tools panel */
.calibration-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 64px;                    /* Sits flush above #viewfinder-confirm */
  z-index: 20;
  padding: var(--space-4);
  background-color: rgba(17, 17, 17, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--color-border);
}
```

#### C3 — Calibration Row Layout

```css
/* Phase 3: C3 — Calibration row: label + slider + range indicators */
.calibration-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.calibration-row:last-child {
  margin-bottom: 0;
}

.calibration-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-secondary);
}

.calibration-value {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
  text-transform: none;
  letter-spacing: 0;
}

.calibration-range-labels {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}
```

#### C4 — Slider Custom Styling

The filled portion of the slider track is rendered via a CSS gradient using `--slider-fill`, a per-slider custom property updated by JS on every `input` event. All three sliders share the `.calibration-slider` class.

```css
/* Phase 3: C4 — Custom range slider (shared by all three calibration sliders) */
.calibration-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: var(--radius-sm);
  outline: none;
  cursor: pointer;
  /* --slider-fill is set by JS; fallback 74% matches the 75% sensitivity default */
  background: linear-gradient(
    to right,
    var(--color-accent) 0%,
    var(--color-accent) var(--slider-fill, 74%),
    var(--color-border) var(--slider-fill, 74%),
    var(--color-border) 100%
  );
}

/* Thumb — WebKit / Blink (Chrome, Safari, Edge) */
.calibration-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-circle);
  background: var(--color-accent);
  cursor: pointer;
}

/* Thumb — Firefox */
.calibration-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-circle);
  background: var(--color-accent);
  cursor: pointer;
}
```

`--slider-fill` update formula (applied in Task D7):
```js
const percent = ((value - min) / (max - min)) * 100;
sliderEl.style.setProperty('--slider-fill', `${percent.toFixed(1)}%`);
```

#### C5 — Virtual LED

```css
/* Phase 3: C5 — Virtual LED; activation logic (data-active toggling) added in Phase 4 */
.virtual-led {
  position: absolute;
  bottom: calc(var(--space-16) + var(--space-3) + env(safe-area-inset-bottom, 0px));
  right: var(--space-4);
  z-index: 21;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-circle);
  background: var(--color-surface-raised);
  border: 2px solid var(--color-border);
  transition: background 80ms ease, box-shadow 80ms ease;
}

/* Active state — set data-active="true" from Phase 4 detection engine */
.virtual-led[data-active="true"] {
  background: var(--color-best-lap);
  box-shadow: 0 0 12px 4px var(--color-accent-glow);
}
```

The `bottom` calculation stacks: `64px` (Confirm button) `+ 12px` (breathing room above calibration panel) `+ safe-area`. Phase 3 places and styles the element; Phase 4 toggles `data-active`.

#### C6 — Clear Line Button

A ghost/secondary button that appears after the trigger line is complete:

```css
/* Phase 3: C6 — Clear drawn line button (shown by JS via .is-visible) */
#btn-clear-line {
  position: absolute;
  top: calc(var(--space-12) + var(--space-2));  /* Below HUD bar (~56px from top) */
  right: var(--space-4);
  z-index: 21;
  min-width: 48px;
  min-height: 48px;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  display: none;          /* Hidden by default; toggled by .is-visible */
}

#btn-clear-line.is-visible {
  display: flex;
  align-items: center;
  justify-content: center;
}

#btn-clear-line:active {
  opacity: 0.85;
  transform: scale(0.97);
}
```

---

### Task Group D — HTML Additions & Integration (`index.html`, `js/app.js`, `sw.js`)

**Assignable to:** Agent D (or lead/orchestrating agent)
**Depends on:** Task Groups A, B, C must be complete (verify that `js/viewfinder.js`, `js/calibration.js` exist and export the documented APIs before wiring)
**Blocks:** Phase 4

#### D1 — HTML: Remove Phase 2 Test TTS Button

Per the Phase 2 plan (task F3): "This button can be removed or repurposed in Phase 3." This is the only intentionally non-additive change in Phase 3.

Remove this block from `index.html` inside `#screen-viewfinder`:
```html
<!-- F3: Milestone test button — remove or repurpose in Phase 3 -->
<button
  id="btn-test-tts"
  type="button"
  aria-label="Test text-to-speech"
>Test TTS</button>
```

Remove the corresponding handler from `js/app.js`:
```js
// 5. Test TTS button — milestone verification (F3); remove/repurpose in Phase 3
const testTtsBtn = document.getElementById('btn-test-tts');
if (testTtsBtn) {
  testTtsBtn.addEventListener('click', () => {
    speak('RC Lap Timer is ready');
    playBeep();
  });
}
```

Also remove the comment `// 5.` numbering — renumber the remaining comment block steps if desired for cleanliness.

#### D2 — HTML: Canvas Element

Insert directly after `<video id="viewfinder-video" ...>` inside `#screen-viewfinder`:

```html
<!-- Phase 3: Canvas overlay for trigger zone drawing (Task 3.1) -->
<canvas
  id="viewfinder-canvas"
  role="img"
  aria-label="Trigger zone drawing area. Tap to place start and end points."
></canvas>
```

No `width` or `height` attributes on the element — those are set exclusively by JS in `_resizeCanvas()`.

#### D3 — HTML: Clear Line Button

Insert after the `<canvas>` element:

```html
<!-- Phase 3: Clear drawn line — shown only after line is complete (Task 3.2) -->
<button
  id="btn-clear-line"
  type="button"
  aria-label="Clear the drawn trigger line and start over"
>Clear</button>
```

#### D4 — HTML: Virtual LED

Insert after `#btn-clear-line`:

```html
<!-- Phase 3: Virtual LED indicator — activated by Phase 4 detection engine (Task 4.3) -->
<div
  id="virtual-led"
  class="virtual-led"
  role="status"
  aria-label="Motion detection indicator"
  data-active="false"
></div>
```

#### D5 — HTML: Calibration Panel

Insert after `#virtual-led` and before `#viewfinder-error`:

```html
<!-- Phase 3: Calibration tools panel (Task 3.3) -->
<div class="calibration-panel" id="calibration-panel" aria-label="Detection calibration controls">

  <!-- Sensitivity Slider -->
  <div class="calibration-row">
    <label for="slider-sensitivity" class="calibration-label">
      Sensitivity
      <span id="sensitivity-value" class="calibration-value">75%</span>
    </label>
    <input
      type="range"
      id="slider-sensitivity"
      class="calibration-slider"
      min="1"
      max="100"
      value="75"
      step="1"
      aria-valuemin="1"
      aria-valuemax="100"
      aria-valuenow="75"
      aria-label="Detection sensitivity: 75 percent"
    />
  </div>

  <!-- Debounce Slider -->
  <div class="calibration-row">
    <label for="slider-debounce" class="calibration-label">
      Debounce
      <span id="debounce-value" class="calibration-value">2.0s</span>
    </label>
    <input
      type="range"
      id="slider-debounce"
      class="calibration-slider"
      min="1.0"
      max="5.0"
      value="2.0"
      step="0.1"
      aria-valuemin="1.0"
      aria-valuemax="5.0"
      aria-valuenow="2.0"
      aria-label="Debounce delay: 2.0 seconds"
    />
    <div class="calibration-range-labels">
      <span>1.0s</span>
      <span>5.0s</span>
    </div>
  </div>

  <!-- Zone Width Slider -->
  <div class="calibration-row">
    <label for="slider-zone-width" class="calibration-label">
      Zone Width
      <span id="zone-width-value" class="calibration-value">20px</span>
    </label>
    <input
      type="range"
      id="slider-zone-width"
      class="calibration-slider"
      min="10"
      max="100"
      value="20"
      step="2"
      aria-valuemin="10"
      aria-valuemax="100"
      aria-valuenow="20"
      aria-label="Detection zone width: 20 pixels"
    />
  </div>

</div>
```

#### D6 — app.js: Module Imports

Add to the top of `js/app.js`, alongside the existing Phase 2 imports:

```js
import {
  initCanvas,
  clearLine,
  hasCompleteLine,
  getROI,
  setZoneWidth as setCanvasZoneWidth,
  onLineChange,
} from './viewfinder.js';

import {
  setSensitivity,
  setDebounce,
  getZoneWidth,
  setZoneWidth,
  getAllSettings,
} from './calibration.js';
```

> **Alias note:** Both `viewfinder.js` and `calibration.js` export a `setZoneWidth`. The canvas version is imported as `setCanvasZoneWidth` to prevent a naming collision. Both must be called when the Zone Width slider changes (see D7).

#### D7 — app.js: Viewfinder Init & Slider Wiring

Add two private functions inside the `DOMContentLoaded` handler in `js/app.js`, after the existing `initHome()` call. Both functions are called immediately after being defined.

```js
// ── Phase 3: Calibration slider wiring ───────────────────────

function _syncSliderFill(sliderEl) {
  const min = parseFloat(sliderEl.min);
  const max = parseFloat(sliderEl.max);
  const val = parseFloat(sliderEl.value);
  const pct = ((val - min) / (max - min)) * 100;
  sliderEl.style.setProperty('--slider-fill', `${pct.toFixed(1)}%`);
}

function _initCalibrationSliders() {
  const sliderSensitivity  = document.getElementById('slider-sensitivity');
  const sliderDebounce     = document.getElementById('slider-debounce');
  const sliderZoneWidth    = document.getElementById('slider-zone-width');
  const sensitivityDisplay = document.getElementById('sensitivity-value');
  const debounceDisplay    = document.getElementById('debounce-value');
  const zoneWidthDisplay   = document.getElementById('zone-width-value');

  // Initial fill sync (mirrors the HTML default values)
  _syncSliderFill(sliderSensitivity);
  _syncSliderFill(sliderDebounce);
  _syncSliderFill(sliderZoneWidth);

  sliderSensitivity.addEventListener('input', () => {
    const v = +sliderSensitivity.value;
    setSensitivity(v);
    sensitivityDisplay.textContent = `${v}%`;
    sliderSensitivity.setAttribute('aria-valuenow', v);
    _syncSliderFill(sliderSensitivity);
  });

  sliderDebounce.addEventListener('input', () => {
    const v = parseFloat(sliderDebounce.value).toFixed(1);
    setDebounce(+v);
    debounceDisplay.textContent = `${v}s`;
    sliderDebounce.setAttribute('aria-valuenow', v);
    _syncSliderFill(sliderDebounce);
  });

  sliderZoneWidth.addEventListener('input', () => {
    const v = +sliderZoneWidth.value;
    setZoneWidth(v);           // calibration.js state
    setCanvasZoneWidth(v);     // viewfinder.js canvas redraw
    zoneWidthDisplay.textContent = `${v}px`;
    sliderZoneWidth.setAttribute('aria-valuenow', v);
    _syncSliderFill(sliderZoneWidth);
  });
}

// ── Phase 3: Canvas drawing init ─────────────────────────────

function _initViewfinderCanvas() {
  const canvasEl   = document.getElementById('viewfinder-canvas');
  const videoEl    = document.getElementById('viewfinder-video');
  const confirmBtn = document.getElementById('viewfinder-confirm');
  const clearBtn   = document.getElementById('btn-clear-line');

  initCanvas(canvasEl, videoEl);

  // Confirm button and Clear button state: gated on line completeness
  onLineChange((hasLine) => {
    confirmBtn.disabled = !hasLine;
    clearBtn.classList.toggle('is-visible', hasLine);
  });

  // Start disabled — a drawn line is required (supersedes Phase 2 stability-delay enable)
  confirmBtn.disabled = true;

  clearBtn.addEventListener('click', () => {
    clearLine(); // onLineChange callback fires automatically, updating button states
  });
}

_initViewfinderCanvas();
_initCalibrationSliders();
```

> **Stability Delay bridge:** Phase 2's `isCameraReady()` gate that directly enabled the Confirm button is superseded here. The new rule: the Confirm button is enabled only when `hasCompleteLine() === true`. Because a user cannot draw a line before the camera is stable, this is strictly more conservative. The "Stabilizing…" overlay (E2) still runs as before — only the button enablement logic has changed.

#### D8 — app.js: Confirm Button Navigation

Wire the Confirm button click handler in `js/app.js`. This replaces any existing no-op reference from Phase 2. Place after `_initViewfinderCanvas()`:

```js
const confirmBtn = document.getElementById('viewfinder-confirm');
if (confirmBtn) {
  confirmBtn.addEventListener('click', () => {
    const roi      = getROI();          // from viewfinder.js
    const settings = getAllSettings();  // from calibration.js

    // Temporary session holder for Phase 4/5 consumption.
    // Phase 5 will replace this with a proper session state module.
    window.__rcSession = { roi, settings };

    console.log('[Phase 3] Session state ready:', window.__rcSession);

    // Screen 'dashboard' does not yet exist; router silently no-ops until Phase 5.
    showScreen('dashboard');
  });
}
```

#### D9 — Service Worker Cache Update

In `sw.js`, bump the cache name to invalidate the Phase 2 cache and add the two new module files:

```js
const CACHE_NAME = 'rc-timer-v3';

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
  'js/viewfinder.js',   // ← Phase 3 additions
  'js/calibration.js',  // ← Phase 3 additions
];
```

#### D10 — Milestone Verification Checklist

Before closing Phase 3, manually verify:

- [x] Opening the Viewfinder screen shows the live camera feed with a crosshair cursor over the canvas area
- [x] Tapping once on the canvas places a lime-colored handle circle
- [x] Tapping a second time places the second handle and draws the trigger line with the zone band between them
- [x] Dragging an existing handle repositions it and the line/band redraws in real time
- [x] Zone Width slider changes the visual thickness of the zone band on the canvas immediately
- [x] "Clear" button appears when the line is complete and resets the canvas when tapped
- [x] Sensitivity slider updates its inline value readout (e.g., "62%") as it is dragged
- [x] Debounce slider updates its inline value readout (e.g., "3.5s") as it is dragged
- [x] All three sliders display the correct filled-track gradient
- [x] Virtual LED element is visible in the lower-right corner, above the calibration panel
- [x] Confirm button is disabled until the trigger line is fully drawn; enabled after
- [x] Tapping Confirm logs the ROI + settings object to the console (verify `roi.p1Norm`, `roi.p2Norm`, `roi.zoneWidthNorm` are all `[0, 1]` fractions)
- [x] Phase 2 "Test TTS" button is no longer present in the UI

**Phase 3 Complete ✓** — All milestone criteria verified. Proceed to Phase 4.

---

## Parallelization Map

```
Timeline →

Sprint 1 (all parallel — no interdependencies):
  Agent A  ──── [A1 Canvas Init] ──── [A2 Point Placement] ──── [A3 Redraw] ──── [A4 ROI Normalization] ──── [A5 API]
  Agent B  ──── [B1 State & Constants] ──── [B2 Getters/Setters] ──── [B3 getAllSettings/reset] ──── [B4 API]
  Agent C  ──── [C1 Canvas CSS] ──── [C2 Panel Container] ──── [C3 Row Layout] ──── [C4 Slider Styling] ──── [C5 Virtual LED] ──── [C6 Clear Button CSS]

Sprint 2 (depends on ALL of Sprint 1):
  Agent D  ──── [D1 Remove TTS] ──── [D2 Canvas HTML] ──── [D3 Clear Btn HTML] ──── [D4 LED HTML] ──── [D5 Panel HTML] ──── [D6 Imports] ──── [D7 Slider Wiring] ──── [D8 Confirm Nav] ──── [D9 SW Update] ──── [D10 Verify]
```

### Agent Assignment Summary

| Agent | Task Group | Files Owned | Dependencies |
|---|---|---|---|
| Agent A | Canvas & Drawing Module | `js/viewfinder.js` | Phase 2 done |
| Agent B | Calibration State Module | `js/calibration.js` | None |
| Agent C | CSS Additions | `styles/viewfinder.css` (append only) | Phase 1 tokens (`styles/tokens.css`) |
| Agent D | HTML + Integration | `index.html`, `js/app.js`, `sw.js` | All Sprint 1 groups done |

> **No agent should modify another agent's owned file.** Agent D is the sole writer of `index.html`, `js/app.js`, and `sw.js` during Phase 3. Agents A–C write only their own files and may read (but not modify) any Phase 1 or Phase 2 file.

---

## Constraints & Rules (from plan.md and phase conventions)

- **No frameworks.** Vanilla JS only — no libraries, no bundlers, no TypeScript.
- **Canvas cannot read CSS variables.** All colors drawn on the `<canvas>` must use hard-coded hex or `rgba()` values. Include an inline comment on each value mapping it to its CSS token name (e.g., `/* --color-accent */`).
- **ROI only.** The canvas and normalization logic must never reference the full video frame. The ROI object produced by `getROI()` is the exclusive input Phase 4 is permitted to use for its pixel scanning window.
- **`requestAnimationFrame` is not used in Phase 3.** Canvas redraws are event-driven (pointer events, window resize) — not frame-loop based. Phase 4 introduces the `rAF` loop.
- **Touch action must be blocked on both layers.** Both the CSS `touch-action: none` on `#viewfinder-canvas` and `event.preventDefault()` inside `touchstart`/`touchmove` handlers are required. Missing either causes scroll interference on iOS Safari.
- **OLED backgrounds.** The calibration panel uses `rgba(17,17,17,0.92)` — not a near-black gray. `backdrop-filter: blur(12px)` ensures legibility over the live video feed.
- **48×48px minimum hit areas.** All three sliders (22px thumb target + track area), the Clear button, and the Confirm button must meet or exceed this minimum.
- **`window.__rcSession` is temporary.** This global is a placeholder for Phase 5's session state module. Phase 4 agents may read `window.__rcSession.roi` and `window.__rcSession.settings` but must not write to or restructure it.
- **Additive rule for Phase 1 files.** No Phase 1 file (`styles/tokens.css`, `styles/global.css`, `js/router.js`) may be modified in any way during Phase 3.
