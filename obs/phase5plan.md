# Phase 5 Implementation Plan – Countdown & Race Dashboard

## Overview

**Goal:** Connect the motion-detection trigger system to a high-precision lap timer backed by a full OLED racing UI — covering the Countdown overlay (Screen 3), Race Dashboard (Screen 4), session state machine, and auto-stop goal logic.

**Milestone (from plan.md):** A full race simulation: Confirm → Countdown → First Cross (Master Timer starts) → Subsequent Crosses (Lap recorded + TTS) → Goal Met (auto-stop and save).

---

## Phase 4 Prerequisite Checklist

These deliverables from Phase 4 must be complete before Phase 5 begins. Agents must verify their existence and structure before starting any task.

| Deliverable | File/Location | Notes |
|---|---|---|
| Motion detection engine | `js/detector.js` | Exports `startDetection(config)`, `stopDetection()`, `isDetecting()` |
| Detection wired in app | `js/app.js` | `stopDetection()` called in Confirm handler; `_onDetectionTrigger()` triggers Virtual LED + beep |
| Virtual LED element | `index.html` | `#virtual-led` `<div>` with `data-active` attribute inside `#screen-viewfinder` |
| Session state holder | `js/app.js` | `window.__rcSession = { roi, settings }` set in Confirm handler |
| Confirm navigates to dashboard | `js/app.js` | `showScreen('dashboard')` call present (currently a no-op — Screen 4 not yet in HTML) |
| Calibration exports | `js/calibration.js` | Exports `getAllSettings()`, `getSensitivity()`, `getDebounce()`, `getZoneWidth()` |
| Audio module | `js/audio.js` | Exports `playBeep()`, `playCountdownBeep()`, `playFinalBeep()`, `playLapBeep()`, `announceLap()`, `speak()` |
| Camera module | `js/camera.js` | Exports `startCamera()`, `stopCamera()`, `getCameraStream()`, `isCameraActive()` |
| Wake Lock module | `js/wakeLock.js` | Exports `acquireWakeLock()`, `releaseWakeLock()` |
| Service Worker | `sw.js` | `CACHE_NAME = 'rc-timer-v4'`; caches 15 shell assets including `js/detector.js` |

> **Agent Rule:** Before beginning any task in Group F or Group G, confirm that `js/detector.js` exports `startDetection()` with the documented config shape `{ videoEl, canvasEl, roi, sensitivity, debounce, onTrigger }`. Do not implement against placeholder files or stubs.

---

## File Structure – New Files Created in Phase 5

```
js/
  session.js      ← Task Group A (session state engine — new file)
  countdown.js    ← Task Group B (countdown controller — new file)
  dashboard.js    ← Task Group F (race dashboard screen controller — new file)
styles/
  countdown.css   ← Task Group D (countdown overlay styles — new file)
  dashboard.css   ← Task Group C (race dashboard styles — new file)
```

> `index.html`, `js/app.js`, and `sw.js` are **modified** (additive only). No existing lines are deleted.
> Two new `<link>` tags for `countdown.css` and `dashboard.css` are added to `<head>`.
> Two new `<section>` blocks (Screen 3 and Screen 4) are appended before `</main>`.
> A Delayed Start toggle and Goal Laps input are added inside the existing `#calibration-panel` in `#screen-viewfinder` (additive).

---

## Detailed Task Breakdown

---

### Task Group A — Session Engine (`js/session.js`)

**Assignable to:** Agent A (fully independent)
**Depends on:** Phase 4 complete; no imports — all inputs supplied as arguments
**Blocks:** Task Group F (dashboard wiring uses session API)

This module is a pure logic unit. It has **no `import` statements**. All dependencies (`videoEl`, `roi`, callbacks) are injected at `startSession()` call time from `js/app.js` via `dashboard.js`.

#### A1 — Module State

Declare all state at the top of the file. Do NOT export any of these variables.

```js
// ── Session status ────────────────────────────────────────────────────────────
// 'idle'              — No session started
// 'waiting-for-first' — Detection running; waiting for the car's first crossing
// 'racing'            — Master timer running; laps being recorded
// 'stopped'           — Session ended (Stop pressed or goal met)
let _status = 'idle';

// ── Timing (performance.now() timestamps) ────────────────────────────────────
let _masterStartTime = null;  // performance.now() when the first trigger fired
let _lapStartTime    = null;  // performance.now() when the current lap began

// ── Session data ──────────────────────────────────────────────────────────────
// Each lap record: { lapNumber: number, lapTime: number, totalTime: number }
// lapTime:  ms for this individual lap (from lap-start to trigger)
// totalTime: ms from masterStart to this trigger
let _laps = [];

// ── Configuration ─────────────────────────────────────────────────────────────
let _goalLaps   = null;  // integer | null (null = unlimited; auto-stop disabled)
let _callbacks  = {};    // { onFirstCross, onLap, onGoalMet }
```

#### A2 — `startSession()` (Public)

Idempotent in the sense that calling it while `_status !== 'idle'` should be guarded (callers must call `resetSession()` first). Transitions status to `'waiting-for-first'`.

```js
/**
 * Initialise a new session. Status transitions: idle → waiting-for-first.
 * Call resetSession() first if restarting an in-progress session.
 *
 * @param {{
 *   goalLaps?:     number | null,    // lap count to auto-stop at; null = unlimited
 *   onFirstCross?: () => void,        // fired when the first trigger arrives
 *   onLap?:        (lap: LapRecord, allLaps: LapRecord[]) => void, // fired on each subsequent trigger
 *   onGoalMet?:    (allLaps: LapRecord[]) => void, // fired when goalLaps is reached
 * }} config
 */
export function startSession(config = {}) {
  _goalLaps  = config.goalLaps  ?? null;
  _callbacks = {
    onFirstCross: config.onFirstCross ?? (() => {}),
    onLap:        config.onLap        ?? (() => {}),
    onGoalMet:    config.onGoalMet    ?? (() => {}),
  };
  _status = 'waiting-for-first';
}
```

#### A3 — `recordTrigger()` (Public)

The hot path — called directly by the `onTrigger` callback from `detector.js`. Must be synchronous and fast. Contains the entire session state machine transition logic.

```js
/**
 * Called by the detection engine's onTrigger callback on every confirmed crossing.
 * State machine:
 *   waiting-for-first → racing  (first trigger: master timer starts)
 *   racing            → racing  (subsequent triggers: lap recorded)
 *   racing            → stopped (if goalLaps reached after a lap is recorded)
 *   idle | stopped    → no-op
 */
export function recordTrigger() {
  if (_status === 'waiting-for-first') {
    _masterStartTime = performance.now();
    _lapStartTime    = _masterStartTime;
    _status          = 'racing';
    _callbacks.onFirstCross();
    return;
  }

  if (_status === 'racing') {
    const now       = performance.now();
    const lapTime   = now - _lapStartTime;
    const totalTime = now - _masterStartTime;

    _lapStartTime = now; // Reset for the next lap immediately — before any callbacks

    const lapRecord = {
      lapNumber: _laps.length + 1,
      lapTime,
      totalTime,
    };
    _laps.push(lapRecord);

    _callbacks.onLap(lapRecord, _laps.slice()); // Pass a copy — callers must not mutate

    if (_goalLaps !== null && _laps.length >= _goalLaps) {
      _status = 'stopped';
      _callbacks.onGoalMet(_laps.slice());
    }
    return;
  }
  // 'idle' or 'stopped': no-op
}
```

**Why reset `_lapStartTime` before callbacks?** The `onLap` callback may trigger TTS (`announceLap`), DOM updates, and other work. If any of that work were to synchronously trigger another `recordTrigger()` (impossible in this architecture, but as a defensive measure), the next lap timer would already be running from the correct moment.

#### A4 — `stopSession()` (Public)

Transitions to `'stopped'`. Does NOT call `onGoalMet` — that is reserved for automatic goal completion. Callers (STOP button handler) are responsible for cleanup (camera, detection, wake lock).

```js
/**
 * Manually stop the session. Status → 'stopped'.
 * Does not fire onGoalMet. Idempotent.
 */
export function stopSession() {
  _status = 'stopped';
}
```

#### A5 — `resetSession()` (Public)

Resets all state to initial values without clearing `_callbacks` or `_goalLaps`, so that `startSession()` need not be called again after a reset (the caller may call `startSession()` again if it wants to change configuration).

```js
/**
 * Clears all session data and returns status to 'idle'.
 * Call startSession() again after resetSession() to begin a fresh session
 * with the same or updated config.
 */
export function resetSession() {
  _status          = 'idle';
  _masterStartTime = null;
  _lapStartTime    = null;
  _laps            = [];
  _goalLaps        = null;
  _callbacks       = {};
}
```

#### A6 — Live Elapsed Query Functions (Public)

These are called on every animation frame by the Big Clock RAF loop in `dashboard.js`. They must be allocation-free — return a number, no object creation.

```js
/**
 * Returns elapsed ms since the current lap started (0 if not racing).
 * @returns {number}
 */
export function getCurrentLapElapsed() {
  if (_status !== 'racing' && _status !== 'stopped') return 0;
  if (_lapStartTime === null) return 0;
  if (_status === 'stopped') {
    // Return the elapsed time as of when the session stopped.
    // Since _lapStartTime is not cleared on stop, this returns a frozen value.
    // The Big Clock RAF loop should stop on 'stopped' status; this is a safety fallback.
    return performance.now() - _lapStartTime;
  }
  return performance.now() - _lapStartTime;
}

/**
 * Returns elapsed ms since the master timer started (0 if not yet racing).
 * @returns {number}
 */
export function getTotalElapsed() {
  if (_masterStartTime === null) return 0;
  return performance.now() - _masterStartTime;
}
```

> **Note on stopped state:** When the session is stopped by the STOP button or goal completion, the Big Clock RAF loop in `dashboard.js` must call `cancelAnimationFrame()` immediately. The `getCurrentLapElapsed()` value at the time of the final lap trigger is already recorded in `_laps[last].lapTime`. The Big Clock should display this final value as a frozen reading — see Task F5.

#### A7 — Lap Data Accessors (Public)

```js
/**
 * Returns a shallow copy of all recorded laps.
 * @returns {Array<{ lapNumber: number, lapTime: number, totalTime: number }>}
 */
export function getLaps() {
  return _laps.slice();
}

/**
 * Returns the index (0-based) of the lap with the lowest lapTime,
 * or -1 if no laps have been recorded.
 * @returns {number}
 */
export function getBestLapIndex() {
  if (_laps.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < _laps.length; i++) {
    if (_laps[i].lapTime < _laps[bestIdx].lapTime) bestIdx = i;
  }
  return bestIdx;
}

/**
 * Returns the current session status.
 * @returns {'idle'|'waiting-for-first'|'racing'|'stopped'}
 */
export function getSessionStatus() {
  return _status;
}
```

#### A8 — Module Public API Surface

```js
startSession(config)      → void    // idle → waiting-for-first
recordTrigger()           → void    // State machine: first cross or lap record
stopSession()             → void    // → stopped (manual stop)
resetSession()            → void    // → idle, clears all data
getCurrentLapElapsed()    → number  // ms since current lap started
getTotalElapsed()         → number  // ms since master start
getLaps()                 → Array<{ lapNumber, lapTime, totalTime }>
getBestLapIndex()         → number  // 0-based index or -1
getSessionStatus()        → string  // 'idle'|'waiting-for-first'|'racing'|'stopped'
```

`LapRecord` shape used by `onLap` and `onGoalMet` callbacks:
```js
{
  lapNumber: number,  // 1-based
  lapTime:   number,  // ms for this lap
  totalTime: number,  // ms from master start to this trigger
}
```

---

### Task Group B — Countdown Controller (`js/countdown.js`)

**Assignable to:** Agent B (fully independent)
**Depends on:** Phase 4 complete; no imports — all inputs injected via config
**Blocks:** Task Group F (app wiring calls `startCountdown()`)

This module is a pure logic unit. It has **no `import` statements**. Audio calls (`playCountdownBeep`, `playFinalBeep`) are injected as callbacks so the module stays decoupled from `audio.js`.

#### B1 — Module State

```js
let _intervalId  = null;   // setInterval handle; non-null = countdown running
let _remaining   = 0;      // current countdown digit being displayed
let _callbacks   = null;   // { onTick, onComplete, onCancel }
```

#### B2 — `startCountdown()` (Public)

```js
/**
 * Starts a 1-second-tick countdown from `duration` down to 0.
 * Idempotent — safe to call when already counting (returns immediately).
 *
 * @param {{
 *   duration?:   number,           // seconds to count from (default: 10)
 *   onTick:      (n: number) => void, // called immediately with `duration`, then each second
 *   onComplete:  () => void,        // called when the counter reaches 0
 *   onCancel?:   () => void,        // called if cancelCountdown() is invoked
 * }} config
 */
export function startCountdown(config) {
  if (_intervalId !== null) return; // Idempotent guard

  const duration = config.duration ?? 10;
  _callbacks     = {
    onTick:     config.onTick,
    onComplete: config.onComplete,
    onCancel:   config.onCancel ?? (() => {}),
  };

  _remaining = duration;
  _callbacks.onTick(_remaining); // Show first number immediately (no 1-second delay)

  _intervalId = setInterval(() => {
    _remaining -= 1;

    if (_remaining > 0) {
      _callbacks.onTick(_remaining);
      return;
    }

    // _remaining === 0: final tick
    _callbacks.onTick(0);
    _clearInterval();
    _callbacks.onComplete();
  }, 1000);
}
```

#### B3 — `cancelCountdown()` (Public)

```js
/**
 * Aborts an in-progress countdown. Calls onCancel callback.
 * Safe to call when not counting (no-op).
 */
export function cancelCountdown() {
  if (_intervalId === null) return;
  _clearInterval();
  _callbacks.onCancel();
}

/** @private */
function _clearInterval() {
  clearInterval(_intervalId);
  _intervalId = null;
  _remaining  = 0;
  _callbacks  = null;
}
```

#### B4 — `isCountingDown()` (Public)

```js
/**
 * @returns {boolean} true when a countdown is in progress
 */
export function isCountingDown() {
  return _intervalId !== null;
}
```

#### B5 — Module Public API Surface

```js
startCountdown(config)  → void     // Starts 1-second tick; idempotent
cancelCountdown()       → void     // Aborts countdown; fires onCancel
isCountingDown()        → boolean  // true while interval is running
```

`config` shape for `startCountdown()`:
```js
{
  duration?:  number,              // Default 10; counts from this value to 0
  onTick:     (n: number) => void, // n = remaining seconds (duration … 0)
  onComplete: () => void,          // fired once when n reaches 0
  onCancel?:  () => void,          // fired by cancelCountdown()
}
```

---

### Task Group C — Dashboard CSS (`styles/dashboard.css`)

**Assignable to:** Agent C (fully independent)
**Depends on:** `styles/tokens.css` design tokens (already exist)
**Blocks:** Task Group E (HTML references these class names), Task Group F (dashboard.js adds/removes classes)

All selectors below are scoped to `#screen-dashboard` or child elements to prevent bleed into other screens.

#### C1 — Screen Root

```css
#screen-dashboard {
  position: fixed;
  inset: 0;
  z-index: 10;
  background-color: var(--color-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-ui);
}
```

#### C2 — Status Bar (top strip)

```css
.dashboard-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
  flex-shrink: 0;
}

#dash-lap-counter {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: 0.05em;
}

.dash-system-status {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  transition: color 0.3s ease;
}

.dash-system-status[data-state="active"] {
  color: var(--color-start);
}
```

#### C3 — Big Clock Area

```css
.dashboard-clock-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4) var(--space-4);
  flex-shrink: 0;
}

/* Primary lap timer — monospace to prevent digit-width jitter */
.dash-big-clock {
  font-family: var(--font-mono);
  font-size: clamp(3.5rem, 20vw, 6.5rem);
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
  line-height: 1;
  /* Tabular numerals prevent layout shift as digits change */
  font-variant-numeric: tabular-nums;
}

/* Secondary total session time */
.dash-total-time {
  font-family: var(--font-mono);
  font-size: clamp(0.875rem, 4vw, 1.25rem);
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-top: var(--space-2);
  font-variant-numeric: tabular-nums;
}

.dash-total-time::before {
  content: 'Total ';
}
```

#### C4 — Live Lap Table

```css
.dashboard-lap-table-wrap {
  flex: 1 1 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--space-4);
  /* Custom scrollbar — slim for OLED aesthetic */
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.dashboard-lap-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 0.875rem;
}

.dashboard-lap-table thead th {
  position: sticky;
  top: 0;
  background-color: var(--color-bg);
  color: var(--color-text-secondary);
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.dashboard-lap-table thead th:not(:first-child) {
  text-align: right;
}

.dashboard-lap-table tbody td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
  color: var(--color-text-primary);
  vertical-align: middle;
}

.dashboard-lap-table tbody td:not(:first-child) {
  text-align: right;
}

/* Best lap row — highlighted in neon green */
.dashboard-lap-table tbody tr[data-best="true"] td {
  background-color: var(--color-best-lap-bg);
  color: var(--color-best-lap);
  font-weight: 700;
}

/* Gap cell — positive delta from best lap */
.lap-gap-cell {
  color: var(--color-text-secondary);
}

/* Suppress gap for the best lap row */
.dashboard-lap-table tbody tr[data-best="true"] .lap-gap-cell {
  color: var(--color-best-lap);
}
```

#### C5 — Glove-Friendly Controls (STOP + RESET)

Minimum hit area: `64px` tall (exceeds the 48×48px PRD minimum for glove use at distance).

```css
.dashboard-controls {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
  flex-shrink: 0;
}

.btn-dash-stop,
.btn-dash-reset {
  flex: 1;
  min-height: 64px;
  border: none;
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  cursor: pointer;
  /* Prevent accidental double-taps */
  touch-action: manipulation;
  transition: opacity 0.15s ease, transform 0.1s ease;
}

.btn-dash-stop:active,
.btn-dash-reset:active {
  opacity: 0.85;
  transform: scale(0.97);
}

.btn-dash-stop {
  background-color: var(--color-stop);
  color: #ffffff;
}

.btn-dash-stop:hover {
  background-color: var(--color-stop-dim);
}

.btn-dash-reset {
  background-color: var(--color-reset);
  color: #000000;
}

.btn-dash-reset:hover {
  background-color: var(--color-reset-dim);
}
```

#### C6 — Camera Toggle & Preview

```css
.dashboard-camera-toggle {
  padding: 0 var(--space-4) var(--space-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

#btn-dash-camera-toggle {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-family: var(--font-ui);
  font-size: 0.75rem;
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  min-height: 48px;
  min-width: 120px;
  touch-action: manipulation;
}

#btn-dash-camera-toggle[aria-expanded="true"] {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.dash-camera-preview {
  width: 100%;
  max-height: 120px;
  object-fit: cover;
  border-radius: var(--radius-md);
  display: block;
}

.dash-camera-preview.is-hidden {
  display: none;
}
```

---

### Task Group D — Countdown CSS (`styles/countdown.css`)

**Assignable to:** Agent D (fully independent)
**Depends on:** `styles/tokens.css` design tokens (already exist)
**Blocks:** Task Group E (HTML references these class names)

#### D1 — Countdown Screen Root

```css
#screen-countdown {
  position: fixed;
  inset: 0;
  z-index: 20;  /* Above viewfinder (z-index: 10) during transition */
  background-color: var(--color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: var(--font-ui);
}
```

#### D2 — Countdown Overlay Content

```css
.countdown-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-8);
  width: 100%;
  padding: var(--space-8) var(--space-6);
}

/* The large animated countdown digit */
.countdown-digit {
  font-family: var(--font-mono);
  font-size: clamp(6rem, 40vw, 14rem);
  font-weight: 800;
  color: var(--color-accent);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  /* Scale transition for each digit change */
  transition: transform 0.1s ease-out, opacity 0.1s ease-out;
}

/* Brief scale-down applied by JS on each tick to signal the number change */
.countdown-digit.is-ticking {
  transform: scale(0.9);
  opacity: 0.7;
}

.countdown-label {
  font-size: 1rem;
  font-weight: 400;
  color: var(--color-text-secondary);
  letter-spacing: 0.05em;
  margin: 0;
}
```

#### D3 — Cancel Button

Full-width pill button anchored near the bottom of the overlay.

```css
.countdown-cancel-btn {
  width: 100%;
  max-width: 320px;
  min-height: 64px;
  background-color: var(--color-stop);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  cursor: pointer;
  touch-action: manipulation;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.countdown-cancel-btn:hover {
  background-color: var(--color-stop-dim);
}

.countdown-cancel-btn:active {
  opacity: 0.85;
}
```

---

### Task Group E — HTML Scaffolding (`index.html`)

**Assignable to:** Agent E (fully independent)
**Depends on:** Task Group C and D (references their class names) — can proceed in parallel if class names are defined first in the plan
**Blocks:** Task Group F (dashboard.js queries these IDs)

All changes are **additive**. No existing HTML is modified or removed.

#### E1 — Add Stylesheet Links

Add two `<link>` elements inside `<head>`, after the existing `styles/viewfinder.css` link:

```html
<link rel="stylesheet" href="styles/countdown.css" />
<link rel="stylesheet" href="styles/dashboard.css" />
```

#### E2 — Add Delayed Start Toggle and Goal Laps Input to Viewfinder

Inside `#calibration-panel` in `#screen-viewfinder`, add these two new rows **after** the existing Zone Width slider row and **before** the closing `</div>` of `.calibration-panel`:

```html
<!-- Delayed Start Toggle -->
<div class="calibration-row calibration-row--toggle">
  <label for="toggle-delayed-start" class="calibration-label">
    Delayed Start
    <span class="calibration-value" id="delayed-start-value">Off</span>
  </label>
  <button
    id="toggle-delayed-start"
    type="button"
    role="switch"
    aria-checked="false"
    aria-label="Enable 10-second countdown before race begins"
    class="calibration-toggle"
    data-active="false"
  >
    <span class="calibration-toggle-thumb"></span>
  </button>
</div>

<!-- Goal Laps Input -->
<div class="calibration-row">
  <label for="input-goal-laps" class="calibration-label">
    Goal Laps
    <span class="calibration-value" id="goal-laps-value">∞</span>
  </label>
  <input
    type="number"
    id="input-goal-laps"
    class="calibration-number-input"
    min="1"
    max="99"
    placeholder="∞"
    inputmode="numeric"
    aria-label="Number of laps before auto-stop (leave empty for unlimited)"
  />
</div>
```

#### E3 — Add Screen 3: Countdown Overlay

Append inside `<main>`, **after** the closing `</section>` of `#screen-viewfinder` and **before** `</main>`:

```html
<!-- ── Screen 3: Countdown Overlay ──────────────────────────────── -->
<section id="screen-countdown" hidden>
  <div class="countdown-overlay">
    <div
      id="countdown-digit"
      class="countdown-digit"
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >10</div>
    <p class="countdown-label">Get ready!</p>
    <button
      id="btn-cancel-countdown"
      type="button"
      class="countdown-cancel-btn"
      aria-label="Cancel countdown and return to setup"
    >Cancel</button>
  </div>
</section>
```

#### E4 — Add Screen 4: Race Dashboard

Append inside `<main>`, **after** the closing `</section>` of `#screen-countdown`:

```html
<!-- ── Screen 4: Race Dashboard ─────────────────────────────────── -->
<section id="screen-dashboard" hidden>

  <!-- Status Bar -->
  <div class="dashboard-status-bar" role="status" aria-live="polite" aria-atomic="false">
    <span id="dash-lap-counter" aria-label="Current lap">Lap —</span>
    <span
      id="dash-system-status"
      class="dash-system-status"
      data-state="inactive"
      aria-label="System status"
    >System Active</span>
  </div>

  <!-- Big Clock (current lap timer) -->
  <div class="dashboard-clock-area" aria-label="Timer display">
    <div
      id="dash-big-clock"
      class="dash-big-clock"
      role="timer"
      aria-label="Current lap time"
      aria-live="off"
    >0:00.00</div>
    <div
      id="dash-total-time"
      class="dash-total-time"
      aria-label="Total session time"
      aria-live="off"
    >0:00.00</div>
  </div>

  <!-- Live Lap Table -->
  <div class="dashboard-lap-table-wrap">
    <table class="dashboard-lap-table" aria-label="Lap history">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Lap Time</th>
          <th scope="col">Gap</th>
        </tr>
      </thead>
      <tbody id="dash-lap-tbody">
        <!-- Populated by dashboard.js _appendLapRow() -->
      </tbody>
    </table>
  </div>

  <!-- Camera Toggle + Preview -->
  <div class="dashboard-camera-toggle">
    <button
      id="btn-dash-camera-toggle"
      type="button"
      aria-label="Show camera feed"
      aria-expanded="false"
    >Show Camera</button>
    <video
      id="dash-camera-preview"
      class="dash-camera-preview is-hidden"
      autoplay
      playsinline
      muted
      aria-label="Camera preview"
    ></video>
  </div>

  <!-- Glove-Friendly Controls -->
  <div class="dashboard-controls">
    <button
      id="btn-dash-stop"
      type="button"
      class="btn-dash-stop"
      aria-label="Stop the current session"
    >STOP</button>
    <button
      id="btn-dash-reset"
      type="button"
      class="btn-dash-reset"
      aria-label="Reset the current session"
    >RESET</button>
  </div>

</section>
```

---

### Task Group F — Dashboard Controller (`js/dashboard.js`)

**Assignable to:** Agent F (depends on Groups A, B, C, D, E)
**Depends on:** `js/session.js` (A), `js/countdown.js` (B), HTML elements from Group E, CSS classes from Groups C and D
**Blocks:** Task Group G (app wiring calls `initDashboard()`)

#### F1 — Imports

```js
import {
  startSession,
  recordTrigger,
  stopSession,
  resetSession,
  getCurrentLapElapsed,
  getTotalElapsed,
  getLaps,
  getBestLapIndex,
  getSessionStatus,
} from './session.js';

import {
  startDetection,
  stopDetection,
} from './detector.js';

import {
  stopCamera,
  getCameraStream,
} from './camera.js';

import {
  acquireWakeLock,
  releaseWakeLock,
} from './wakeLock.js';

import {
  playLapBeep,
  announceLap,
} from './audio.js';

import { showScreen } from './router.js';
```

#### F2 — Time Formatting Helper (`_formatTime`)

Used by the Big Clock and lap table. Returns the format `M:SS.mm` (minutes, seconds, hundredths).

```js
/**
 * Formats a duration in milliseconds to "M:SS.mm" display format.
 * Examples: 5430 → "0:05.43"  |  75230 → "1:15.23"  |  0 → "0:00.00"
 * @param {number} ms
 * @returns {string}
 */
function _formatTime(ms) {
  if (ms < 0) ms = 0;
  const totalHundredths = Math.floor(ms / 10);
  const hundredths      = totalHundredths % 100;
  const totalSeconds    = Math.floor(ms / 1000);
  const seconds         = totalSeconds % 60;
  const minutes         = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
```

#### F3 — Lap Table Rendering

Two functions: `_appendLapRow()` adds a new row on each trigger; `_refreshBestLapHighlight()` re-scans all rows to update the `data-best` attribute whenever a new best lap is achieved.

```js
/**
 * Appends a single lap row to the table body. Does NOT compute gap here —
 * gap is a display concern and depends on knowing the overall best lap.
 * @param {{ lapNumber: number, lapTime: number }} lap
 */
function _appendLapRow(lap) {
  const tbody = document.getElementById('dash-lap-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.dataset.lapNumber = lap.lapNumber;
  tr.dataset.best      = 'false';

  const tdNum  = document.createElement('td');
  const tdTime = document.createElement('td');
  const tdGap  = document.createElement('td');

  tdNum.textContent  = lap.lapNumber;
  tdTime.textContent = _formatTime(lap.lapTime);
  tdGap.className    = 'lap-gap-cell';
  tdGap.textContent  = '—'; // Filled in by _refreshBestLapHighlight()

  tr.appendChild(tdNum);
  tr.appendChild(tdTime);
  tr.appendChild(tdGap);
  tbody.appendChild(tr);

  // Auto-scroll to the latest lap
  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Re-scans all rendered rows and updates data-best and gap text cells
 * to reflect the current best lap. Call this after every new lap is appended.
 */
function _refreshBestLapHighlight() {
  const laps    = getLaps();
  const bestIdx = getBestLapIndex(); // 0-based
  if (bestIdx === -1) return;

  const bestLapTime = laps[bestIdx].lapTime;
  const tbody       = document.getElementById('dash-lap-tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr[data-lap-number]');
  rows.forEach((row) => {
    const lapNum = parseInt(row.dataset.lapNumber, 10) - 1; // convert to 0-based index
    const lap    = laps[lapNum];
    if (!lap) return;

    const isBest     = lapNum === bestIdx;
    const gapMs      = lap.lapTime - bestLapTime;
    const gapCell    = row.querySelector('.lap-gap-cell');

    row.dataset.best = String(isBest);
    if (gapCell) {
      gapCell.textContent = isBest ? 'Best' : `+${_formatTime(gapMs)}`;
    }
  });
}
```

#### F4 — Lap Counter Status Bar Update

```js
/**
 * Updates the "Lap X of Y" text in the status bar.
 * If goalLaps is null (unlimited), shows "Lap X".
 * During waiting-for-first phase, shows "Waiting…"
 * @param {number} lapCount     Current number of completed laps
 * @param {number|null} goalLaps
 */
function _updateLapCounter(lapCount, goalLaps) {
  const el = document.getElementById('dash-lap-counter');
  if (!el) return;
  if (getSessionStatus() === 'waiting-for-first') {
    el.textContent = 'Waiting…';
    return;
  }
  el.textContent = goalLaps !== null
    ? `Lap ${lapCount} of ${goalLaps}`
    : `Lap ${lapCount}`;
}
```

#### F5 — Big Clock RAF Loop

The RAF loop runs only while `_status === 'racing'`. It is cancelled immediately on stop, goal-met, or reset to prevent stale updates.

```js
let _clockRafId = null;

function _startClockRaf() {
  if (_clockRafId !== null) return; // Idempotent guard

  const bigClock  = document.getElementById('dash-big-clock');
  const totalTime = document.getElementById('dash-total-time');

  function _tick() {
    if (getSessionStatus() !== 'racing') {
      _clockRafId = null;
      return; // Stop the loop
    }
    if (bigClock)  bigClock.textContent  = _formatTime(getCurrentLapElapsed());
    if (totalTime) totalTime.textContent = _formatTime(getTotalElapsed());
    _clockRafId = requestAnimationFrame(_tick);
  }

  _clockRafId = requestAnimationFrame(_tick);
}

function _stopClockRaf() {
  if (_clockRafId !== null) {
    cancelAnimationFrame(_clockRafId);
    _clockRafId = null;
  }
}

/**
 * Freeze the clock display at the provided time values (on session stop/goal-met).
 * @param {number} lapMs    ms to display for lap time
 * @param {number} totalMs  ms to display for total time
 */
function _freezeClock(lapMs, totalMs) {
  _stopClockRaf();
  const bigClock  = document.getElementById('dash-big-clock');
  const totalTime = document.getElementById('dash-total-time');
  if (bigClock)  bigClock.textContent  = _formatTime(lapMs);
  if (totalTime) totalTime.textContent = _formatTime(totalMs);
}
```

#### F6 — System Status Chip Update

```js
/**
 * Sets the "System Active" chip to active or inactive.
 * @param {boolean} active
 */
function _setSystemStatus(active) {
  const el = document.getElementById('dash-system-status');
  if (!el) return;
  el.dataset.state = active ? 'active' : 'inactive';
  el.textContent   = active ? 'System Active' : 'System Stopped';
}
```

#### F7 — Camera Toggle Handler

The camera stream was acquired during the Viewfinder phase and is still active. The Dashboard hides the video by default and surfaces it only on toggle.

```js
function _initCameraToggle() {
  const toggleBtn = document.getElementById('btn-dash-camera-toggle');
  const preview   = document.getElementById('dash-camera-preview');
  if (!toggleBtn || !preview) return;

  toggleBtn.addEventListener('click', () => {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';

    if (!isExpanded) {
      // Show preview: pipe the existing camera stream into the preview video element
      const stream = getCameraStream();
      if (stream) preview.srcObject = stream;
      preview.classList.remove('is-hidden');
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.textContent = 'Hide Camera';
    } else {
      // Hide preview: pause and clear srcObject to release the video element
      preview.pause();
      preview.srcObject = null;
      preview.classList.add('is-hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.textContent = 'Show Camera';
    }
  });
}
```

#### F8 — `_handleStop()` Internal Handler

Called by both the STOP button and `onGoalMet`. Performs a full session teardown.

```js
/**
 * @param {{ lapMs: number, totalMs: number }} frozenTime  Times to display in the frozen clock
 */
function _handleStop(frozenTime) {
  stopSession();
  stopDetection();
  _stopClockRaf();
  _freezeClock(frozenTime.lapMs, frozenTime.totalMs);
  _setSystemStatus(false);

  // Stop camera and release wake lock
  stopCamera();
  releaseWakeLock();

  // Package session result onto window.__rcSession for Phase 6 consumption
  const laps         = getLaps();
  const bestIdx      = getBestLapIndex();
  window.__rcSession = window.__rcSession ?? {};
  window.__rcSession.result = {
    laps,
    bestLapIndex:  bestIdx,
    totalTime:     frozenTime.totalMs,
    driverName:    window.__rcSession.meta?.driverName ?? '',
    carName:       window.__rcSession.meta?.carName    ?? '',
    location:      window.__rcSession.meta?.location   ?? '',
    timestamp:     Date.now(),
  };

  // Phase 5: Navigate home after stop (Phase 6 will redirect to summary screen instead)
  // A short delay gives the user a moment to see the frozen clock.
  setTimeout(() => showScreen('home'), 1500);
}
```

#### F9 — `_handleReset()` Internal Handler

Resets the session and restarts detection and the timer, without navigating away.

```js
function _handleReset(roi, detectionSettings) {
  _stopClockRaf();
  stopDetection();
  resetSession();

  // Clear the lap table
  const tbody = document.getElementById('dash-lap-tbody');
  if (tbody) tbody.innerHTML = '';

  // Reset clock display
  const bigClock  = document.getElementById('dash-big-clock');
  const totalTime = document.getElementById('dash-total-time');
  if (bigClock)  bigClock.textContent  = '0:00.00';
  if (totalTime) totalTime.textContent = '0:00.00';

  // Re-initialise session (same goalLaps, same callbacks)
  _beginSession(roi, detectionSettings);
}
```

#### F10 — `_beginSession()` Private Orchestration

Sets up the session engine and detection — called both from `initDashboard()` on first entry and from `_handleReset()` on restart.

```js
/**
 * @param {{ p1Norm, p2Norm, zoneWidthNorm }} roi
 * @param {{ sensitivity, debounce }} detectionSettings
 */
function _beginSession(roi, detectionSettings) {
  const goalLaps = window.__rcSession?.goalLaps ?? null;

  startSession({
    goalLaps,
    onFirstCross: () => {
      _startClockRaf();
      _updateLapCounter(0, goalLaps);
    },
    onLap: (lap, allLaps) => {
      playLapBeep();
      announceLap(lap.lapNumber, lap.lapTime);
      _appendLapRow(lap);
      _refreshBestLapHighlight();
      _updateLapCounter(allLaps.length, goalLaps);
    },
    onGoalMet: (allLaps) => {
      const lastLap  = allLaps[allLaps.length - 1];
      const totalMs  = getTotalElapsed();
      _handleStop({ lapMs: lastLap.lapTime, totalMs });
    },
  });

  const videoEl  = document.getElementById('viewfinder-video');
  const canvasEl = document.getElementById('viewfinder-canvas');

  startDetection({
    videoEl,
    canvasEl,
    roi,
    sensitivity: detectionSettings.sensitivity,
    debounce:    detectionSettings.debounce,
    onTrigger:   recordTrigger,
  });

  _updateLapCounter(0, goalLaps);
  _setSystemStatus(true);
}
```

#### F11 — `initDashboard()` (Public Export)

The single entry point called from `js/app.js` when transitioning to Screen 4.

```js
/**
 * Initialise the Race Dashboard screen.
 * Call once per entry into Screen 4 (called from app.js Confirm handler).
 *
 * @param {{
 *   roi:               { p1Norm, p2Norm, zoneWidthNorm },
 *   detectionSettings: { sensitivity: number, debounce: number },
 * }} config
 */
export function initDashboard(config) {
  const { roi, detectionSettings } = config;

  // Wire STOP button
  const stopBtn = document.getElementById('btn-dash-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      const totalMs = getTotalElapsed();
      const lapMs   = getCurrentLapElapsed();
      _handleStop({ lapMs, totalMs });
    }, { once: true }); // once: true — prevent duplicate listeners across resets
  }

  // Wire RESET button
  const resetBtn = document.getElementById('btn-dash-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      _handleReset(roi, detectionSettings);
    });
  }

  _initCameraToggle();
  acquireWakeLock();
  _beginSession(roi, detectionSettings);
}
```

> **`{ once: true }` on STOP:** The STOP button navigates away after 1.5 s. If the user somehow re-enters the dashboard without the page reloading, a duplicate event listener would otherwise cause double-teardown. Using `{ once: true }` ensures the listener fires exactly once per `initDashboard()` call. The RESET button does **not** use `{ once: true }` because the user may press reset multiple times.

#### F12 — Module Public API Surface

```js
// Exported:
initDashboard(config)  → void

// config shape:
{
  roi:               { p1Norm: { x, y }, p2Norm: { x, y }, zoneWidthNorm: number },
  detectionSettings: { sensitivity: number, debounce: number },
}
```

---

### Task Group G — App Wiring (`js/app.js`, `sw.js`)

**Assignable to:** Agent G (or lead/orchestrating agent)
**Depends on:** ALL of Groups A–F must be complete — verify `js/session.js`, `js/countdown.js`, `js/dashboard.js` exist with documented exports; verify HTML element IDs from Group E are present in `index.html`
**Blocks:** Phase 6

All changes to `js/app.js` are **additive**. No existing lines are deleted; the Confirm button handler is replaced with an extended version.

#### G1 — New Imports

Add these three import statements at the top of `js/app.js`, alongside existing imports:

```js
import { startCountdown, cancelCountdown } from './countdown.js';
import { initDashboard } from './dashboard.js';
```

Place `countdown.js` import directly after the `detector.js` import; `dashboard.js` import directly after `countdown.js`.

#### G2 — Read Delayed Start Toggle and Goal Laps from Viewfinder

Add `_readViewfinderSessionConfig()` inside the `DOMContentLoaded` handler, before `_initViewfinderCanvas()` is called:

```js
/**
 * Reads the Delayed Start toggle and Goal Laps input from the Viewfinder panel.
 * Returns the config object to merge into window.__rcSession.
 * @returns {{ delayedStart: boolean, goalLaps: number|null }}
 */
function _readViewfinderSessionConfig() {
  const toggleEl   = document.getElementById('toggle-delayed-start');
  const goalLapsEl = document.getElementById('input-goal-laps');

  const delayedStart = toggleEl?.getAttribute('aria-checked') === 'true' ?? false;
  const rawGoal      = goalLapsEl?.value?.trim();
  const goalLaps     = rawGoal && !isNaN(parseInt(rawGoal, 10))
    ? Math.max(1, parseInt(rawGoal, 10))
    : null;

  return { delayedStart, goalLaps };
}
```

#### G3 — Wire Delayed Start Toggle Button

Add inside `DOMContentLoaded`, after `_initCalibrationSliders()`:

```js
// ── Phase 5: Delayed Start toggle wiring ─────────────────────────────────────
const _delayedStartBtn    = document.getElementById('toggle-delayed-start');
const _delayedStartLabel  = document.getElementById('delayed-start-value');

if (_delayedStartBtn) {
  _delayedStartBtn.addEventListener('click', () => {
    const isActive = _delayedStartBtn.getAttribute('aria-checked') === 'true';
    const next     = !isActive;
    _delayedStartBtn.setAttribute('aria-checked', String(next));
    _delayedStartBtn.dataset.active = String(next);
    if (_delayedStartLabel) _delayedStartLabel.textContent = next ? 'On' : 'Off';
  });
}
```

#### G4 — Wire Goal Laps Input Live Label

Add immediately after the Delayed Start toggle wiring:

```js
const _goalLapsInput = document.getElementById('input-goal-laps');
const _goalLapsLabel = document.getElementById('goal-laps-value');

if (_goalLapsInput) {
  _goalLapsInput.addEventListener('input', () => {
    const v = _goalLapsInput.value.trim();
    if (_goalLapsLabel) {
      _goalLapsLabel.textContent = v && !isNaN(parseInt(v, 10)) ? `${parseInt(v, 10)} laps` : '∞';
    }
  });
}
```

#### G5 — Replace Confirm Button Handler

Replace the existing Phase 3/4 Confirm handler (which currently calls `showScreen('dashboard')` directly) with this extended version. The **only** modification to the existing handler is: adding the session config read, building the countdown/dashboard dispatch, and wiring meta data. The existing `stopDetection()`, `getROI()`, `getAllSettings()`, and `window.__rcSession` assignment remain.

```js
if (confirmBtn) {
  confirmBtn.addEventListener('click', () => {
    stopDetection(); // Phase 4: tear down test mode

    const roi      = getROI();
    const settings = getAllSettings();
    const { delayedStart, goalLaps } = _readViewfinderSessionConfig();

    // Pull meta fields from Home screen inputs
    const driverName = document.getElementById('input-driver-name')?.value.trim() ?? '';
    const carName    = document.getElementById('input-car-name')?.value.trim()    ?? '';
    const location   = document.getElementById('input-location')?.value.trim()    ?? '';

    window.__rcSession = {
      roi,
      settings,
      goalLaps,
      delayedStart,
      meta: { driverName, carName, location },
    };

    const _enterDashboard = () => {
      showScreen('dashboard');
      initDashboard({ roi, detectionSettings: settings });
    };

    if (delayedStart) {
      showScreen('countdown');
      _runCountdown(_enterDashboard);
    } else {
      _enterDashboard();
    }
  });
}
```

#### G6 — `_runCountdown()` Private Helper

Add inside `DOMContentLoaded`, after the Confirm handler:

```js
/**
 * Animates the countdown screen and fires onComplete when done.
 * Wires the Cancel button to abort and return to the Viewfinder.
 * @param {() => void} onComplete
 */
function _runCountdown(onComplete) {
  const digitEl    = document.getElementById('countdown-digit');
  const cancelBtn  = document.getElementById('btn-cancel-countdown');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      cancelCountdown();
    }, { once: true });
  }

  startCountdown({
    duration: 10,
    onTick: (n) => {
      if (!digitEl) return;
      // Apply brief scale-down class on each tick, then remove it
      digitEl.classList.add('is-ticking');
      requestAnimationFrame(() => {
        digitEl.textContent = n === 0 ? 'GO!' : String(n);
        requestAnimationFrame(() => digitEl.classList.remove('is-ticking'));
      });
      // Play final beep on GO (n===0), countdown beep on all others
      if (n === 0) {
        import('./audio.js').then(({ playFinalBeep }) => playFinalBeep());
      } else {
        import('./audio.js').then(({ playCountdownBeep }) => playCountdownBeep());
      }
    },
    onComplete: () => {
      onComplete();
    },
    onCancel: () => {
      // Return to viewfinder; restart test mode detection if line exists
      showScreen('viewfinder');
      const roi      = getROI();
      const settings = getAllSettings();
      if (roi && hasCompleteLine()) {
        startDetection({
          videoEl:     document.getElementById('viewfinder-video'),
          canvasEl:    document.getElementById('viewfinder-canvas'),
          roi,
          sensitivity: settings.sensitivity,
          debounce:    settings.debounce,
          onTrigger:   _onDetectionTrigger,
        });
      }
    },
  });
}
```

> **Dynamic `import()` for audio in `_runCountdown()`:** The countdown beep fires inside a `setInterval` callback, which is already past the user gesture boundary established by the Confirm button click. Dynamic imports resolve synchronously from cache after the first load. Alternatively, `playCountdownBeep` and `playFinalBeep` can be statically imported alongside the existing `playBeep` import — either approach is acceptable. Static import is preferred if the bundling footprint is acceptable.

> **`hasCompleteLine` import:** Add `hasCompleteLine` to the existing `viewfinder.js` import block in `js/app.js`. It is already exported from Phase 3.

#### G7 — Service Worker Cache Update

In `sw.js`, bump the cache name to invalidate the Phase 4 cache and add all new assets:

```js
const CACHE_NAME = 'rc-timer-v5';

const PRECACHE_URLS = [
  'index.html',
  'manifest.json',
  'styles/tokens.css',
  'styles/global.css',
  'styles/home.css',
  'styles/viewfinder.css',
  'styles/countdown.css',   // ← Phase 5 addition
  'styles/dashboard.css',   // ← Phase 5 addition
  'js/app.js',
  'js/router.js',
  'js/home.js',
  'js/camera.js',
  'js/wakeLock.js',
  'js/audio.js',
  'js/viewfinder.js',
  'js/calibration.js',
  'js/detector.js',
  'js/session.js',          // ← Phase 5 addition
  'js/countdown.js',        // ← Phase 5 addition
  'js/dashboard.js',        // ← Phase 5 addition
];
```

Total: 20 shell assets.

#### G8 — Milestone Verification Checklist

Before closing Phase 5, manually verify each item:

- [ ] Setting Delayed Start = Off: pressing Confirm navigates directly to the Race Dashboard (Screen 4) — no countdown shown
- [ ] Setting Delayed Start = On: pressing Confirm navigates to the Countdown screen; digits count from 10 to 0 with a countdown beep on each tick and a higher "GO!" beep on 0; dashboard appears immediately after "GO!"
- [ ] Pressing Cancel during countdown returns to the Viewfinder with the trigger line intact and test mode detection restarted
- [ ] Setting Goal Laps = 3 and leaving Delayed Start Off: after 3 laps are crossed, the session stops automatically; the clock freezes, the camera stops, and the app navigates home after ~1.5 s
- [ ] Setting Goal Laps empty (∞): session runs indefinitely until STOP is pressed
- [ ] On the Dashboard, the Big Clock ticks in `M:SS.mm` format (hundredths of seconds) during the "waiting-for-first" period and during active lapping — no jitter from digit-width changes
- [ ] The first crossing after entering the Dashboard starts the master timer (`getSessionStatus()` transitions from `waiting-for-first` to `racing`)
- [ ] Each subsequent crossing appends a row to the lap table; the best lap row is highlighted in `--color-best-lap` green; all other Gap cells show `+M:SS.mm` offset from best
- [ ] TTS announces each lap: "Lap 2: twelve point four seconds" (correct `announceLap()` output)
- [ ] STOP button freezes the Big Clock at the current lap-elapsed value; `isDetecting()` returns `false`; `getCameraStream()` returns `null` (stream stopped)
- [ ] RESET button clears the lap table, resets the clock to `0:00.00`, and restarts waiting for the first crossing — detection continues without interruption
- [ ] "Show Camera" button reveals the camera preview thumbnail inside the dashboard without navigating away; "Hide Camera" hides it again
- [ ] `window.__rcSession.result` is populated with `{ laps, bestLapIndex, totalTime, driverName, carName, location, timestamp }` after a session ends (inspect in DevTools console)
- [ ] No frame drops: Big Clock RAF loop completes in < 2 ms per tick (check Chrome DevTools Performance panel)
- [ ] On iOS Safari: Wake Lock is re-acquired after returning from background; TTS fires correctly; countdown interval is not throttled (verify by moving to another tab and back)

**Phase 5 Complete ✓** — All milestone criteria verified. Proceed to Phase 6.

---

## Parallelization Map

```
Timeline →

Sprint 1 (fully independent — no inter-group file dependencies):
  Agent A  ──── [A1–A8]   js/session.js             (pure logic, no imports)
  Agent B  ──── [B1–B5]   js/countdown.js           (pure logic, no imports)
  Agent C  ──── [C1–C6]   styles/dashboard.css      (CSS tokens only)
  Agent D  ──── [D1–D3]   styles/countdown.css      (CSS tokens only)
  Agent E  ──── [E1–E4]   index.html                (HTML scaffolding, new CSS links)

Sprint 2 (depends on ALL of Sprint 1):
  Agent F  ──── [F1–F12]  js/dashboard.js           (imports session.js, detector.js, camera.js, etc.)

Sprint 3 (depends on ALL of Sprint 2):
  Agent G  ──── [G1–G8]   js/app.js + sw.js         (imports countdown.js, dashboard.js; final wiring)
```

### Agent Assignment Summary

| Agent | Task Group | Files Owned | Sprint | Dependencies |
|---|---|---|---|---|
| Agent A | Session Engine | `js/session.js` (new) | 1 | Phase 4 done; no runtime imports |
| Agent B | Countdown Controller | `js/countdown.js` (new) | 1 | Phase 4 done; no runtime imports |
| Agent C | Dashboard CSS | `styles/dashboard.css` (new) | 1 | `styles/tokens.css` only |
| Agent D | Countdown CSS | `styles/countdown.css` (new) | 1 | `styles/tokens.css` only |
| Agent E | HTML Scaffolding | `index.html` (additive) | 1 | Class names from C and D |
| Agent F | Dashboard Controller | `js/dashboard.js` (new) | 2 | Groups A, B, C, D, E complete |
| Agent G | App Wiring | `js/app.js`, `sw.js` (additive) | 3 | Group F complete |

> **No agent should modify another agent's owned file.** Agent E makes additive HTML changes only. Agent G makes additive JS changes only. No agent touches `js/detector.js`, `js/viewfinder.js`, `js/calibration.js`, or any Phase 1–4 CSS file.

---

## Constraints & Rules

- **`performance.now()` for all timing.** `Date.now()` must never appear in `session.js` timing calculations. Only `Date.now()` is permitted in the result `timestamp` field (wall-clock metadata, not precision timing).
- **RAF only for the Big Clock.** The Big Clock display loop uses `requestAnimationFrame`. No `setInterval` is used for the live timer display. The `setInterval` in `countdown.js` is acceptable and correct for 1-second countdown ticks (not pixel processing).
- **ROI only — detector.js contract unchanged.** `dashboard.js` calls `startDetection()` with the same `{ videoEl, canvasEl, roi, sensitivity, debounce, onTrigger }` config shape defined in Phase 4.
- **Zero lap table DOM reads inside RAF.** `_refreshBestLapHighlight()` is called from `onLap` (event-driven), not from the Big Clock RAF tick. The RAF loop updates only the two clock `textContent` values.
- **`{ once: true }` on STOP button listener.** The STOP button's click listener is registered with `{ once: true }` to prevent duplicate teardown if `initDashboard()` is called multiple times in a session lifecycle.
- **No frameworks.** Vanilla JS only — no libraries, no bundlers, no TypeScript.
- **OLED Dark Mode.** All new CSS uses `--color-bg: #000000` (via the token, not raw hex). No near-black grays.
- **Minimum hit area.** STOP and RESET buttons: `min-height: 64px`. Camera toggle and Cancel buttons: `min-height: 48px`. Touch targets must not be smaller.
- **`window.__rcSession` contract.** After Phase 5, `window.__rcSession` must contain `{ roi, settings, goalLaps, delayedStart, meta: { driverName, carName, location }, result: { laps, bestLapIndex, totalTime, driverName, carName, location, timestamp } }`. Phase 6 will read `result` and persist it to `localStorage`.
