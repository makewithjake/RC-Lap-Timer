# Phase 6 Implementation Plan – Persistence, History & Visualization

## Overview

**Goal:** Implement the data persistence layer, post-session summary screen, scrollable session history archive, and global settings panel — closing the app's data lifecycle loop so every session is saved, reviewable, and the device never requires recalibration on relaunch.

**Milestone (from plan.md):** Close the app, reopen it, view a graph of a previous 10-lap session in History, and confirm all calibration sliders load with their last-used values.

---

## Phase 5 Prerequisite Checklist

These deliverables from Phase 5 must be complete before Phase 6 begins. Agents should verify their existence and structure.

| Deliverable | File/Location | Notes |
|---|---|---|
| Countdown overlay screen | `index.html` (`#screen-countdown`) | Screen 3 — animated digits, Cancel button |
| Race Dashboard screen | `index.html` (`#screen-dashboard`) | Screen 4 — Big Clock, Lap Table, Status Bar, STOP/RESET buttons |
| Session management module | `js/session.js` | Exports `startSession()`, `stopSession()`, `recordTrigger()`, `getSessionData()`, `resetSession()` |
| `window.__rcSession` contract | Set by `session.js` on stop | Object must include `laps[]` (each with `lapNumber`, `lapTimeMs`, `gapMs`), `totalTimeMs`, `driverName`, `carName`, `location`, `lapGoal`, `calibration` |
| TTS lap announcements wired | `js/audio.js` → `js/session.js` | `announceLap()` called on each trigger after lap 1 |
| Service Worker version | `sw.js` | `CACHE_NAME = 'rc-timer-v5'`; pre-caches all Phase 1–5 assets |

> **Agent Rule:** Before beginning any work in Task Groups B, C, or D, confirm that `window.__rcSession` is populated with a `laps` array containing at least one object with `lapNumber`, `lapTimeMs`, and `gapMs` fields. Do not build against mocked or placeholder data.

---

## File Structure – New Files Created in Phase 6

```
js/
  storage.js        ← Task Group A  (new — localStorage schema & CRUD layer)
  summary.js        ← Task Group B  (new — post-session stats & chart)
  history.js        ← Task Group C  (new — session archive rendering)
  settings.js       ← Task Group D  (new — global settings panel)
styles/
  summary.css       ← Task Group E  (new — Screen 5 styles)
  history.css       ← Task Group E  (new — Screen 6 styles)
  settings.css      ← Task Group E  (new — Screen 7 styles)
```

> **Directories:** `js/` and `styles/` already exist. No new directories are needed.

**Modified files (additive — no existing code deleted):**
- `index.html` — add Screen 5 (`#screen-summary`), Screen 6 (`#screen-history`), Screen 7 (`#screen-settings`) `<section>` elements; add three new stylesheet `<link>` tags
- `js/app.js` — wire summary screen into post-session stop flow
- `js/home.js` — wire gear icon → Settings screen; wire History button → History screen
- `sw.js` — bump `CACHE_NAME` to `'rc-timer-v6'`; add 7 new assets to pre-cache list

---

## Parallelization Map

```
Phase 5 Complete
│
├── Group A (storage.js)   ← must run first; no deps
│   └─── unblocks B, C, D
│
├── Group E (CSS + HTML)   ← fully independent; run in parallel with A
│
├── Group B (summary.js)   ┐
├── Group C (history.js)   ├─ parallel; each only depends on A + E (HTML)
├── Group D (settings.js)  ┘
│
└── Group F (app wiring + SW)  ← runs last; depends on A, B, C, D, E
```

**Agents that can start immediately (no dependencies):**
- **Agent A** — `js/storage.js`
- **Agent E** — all three CSS files + HTML sections in `index.html`

**Agents that start after A and E complete:**
- **Agent B** — `js/summary.js`
- **Agent C** — `js/history.js`
- **Agent D** — `js/settings.js`

**Agent that runs last:**
- **Agent F** — `js/app.js` wiring, `js/home.js` wiring, `sw.js` bump

---

## Detailed Task Breakdown

---

### Task Group A — Storage Module (`js/storage.js`)

**Assignable to:** Agent A (fully independent)
**Depends on:** Phase 5 complete; no other Phase 6 groups
**Blocks:** Task Groups B, C, D, F

#### A1 — localStorage Key Registry & Schemas

Declare all key constants at the top of the file. Do **not** export them — they are module-internal.

```js
// ── Keys ──────────────────────────────────────────────────────────────────────
// Phase 1 keys (already exist — do not redefine in localStorage on first load):
//   rc_driverName  rc_carName  rc_location
// Phase 3 keys (already exist — calibration.js owns these):
//   rc_sensitivity  rc_debounce  rc_zoneWidth
// New in Phase 6:
const KEY_SESSIONS = 'rc_sessions';   // JSON string — Session[]
const KEY_SETTINGS = 'rc_settings';   // JSON string — Settings
```

**Session record schema** (the object shape stored in the `rc_sessions` array):

```js
/**
 * @typedef {Object} LapRecord
 * @property {number} lapNumber   — 1-based lap index
 * @property {number} lapTimeMs   — duration of this lap in milliseconds
 * @property {number} gapMs       — lapTimeMs − bestLapMs (0 for the fastest lap)
 */

/**
 * @typedef {Object} Session
 * @property {string}      id               — crypto.randomUUID() or Date.now().toString()
 * @property {string}      date             — new Date().toISOString()
 * @property {string}      driverName
 * @property {string}      carName
 * @property {string}      location
 * @property {LapRecord[]} laps
 * @property {number}      lapCount
 * @property {number}      bestLapMs
 * @property {number}      avgLapMs         — totalTimeMs / lapCount
 * @property {number}      consistencyScore — standard deviation of lap times in ms
 * @property {number}      totalTimeMs
 * @property {Object}      calibration      — { sensitivity, debounce, zoneWidth }
 */
```

**Settings schema** and constant:

```js
/**
 * @typedef {Object} Settings
 * @property {number}      countdownDuration — seconds (1–60); default 10
 * @property {string|null} ttsVoiceName      — SpeechSynthesisVoice.name or null (system default)
 * @property {number}      ttsPitch          — 0.5–2.0; default 1.0
 * @property {number}      ttsVolume         — 0–1; default 1.0
 * @property {string}      units             — 'metric' | 'imperial'; default 'metric'
 */

const DEFAULT_SETTINGS = Object.freeze({
  countdownDuration: 10,
  ttsVoiceName:      null,
  ttsPitch:          1.0,
  ttsVolume:         1.0,
  units:             'metric',
});
```

#### A2 — Session CRUD

Implement and export the following functions. All writes must wrap the JSON serialization in a `try/catch`; on `QuotaExceededError` log a warning to `console.warn` and surface the error to the caller by returning `false` from `saveSession`.

- **`buildSessionRecord(rawSession)`** — accepts `window.__rcSession` as input; computes `bestLapMs`, `avgLapMs`, `consistencyScore` (population standard deviation), and `id` / `date`; returns a complete `Session` object. This is a pure function — it does not write to localStorage.
  - `bestLapMs`: `Math.min(...laps.map(l => l.lapTimeMs))`
  - `avgLapMs`: `Math.round(totalTimeMs / lapCount)`
  - `consistencyScore`: population std deviation — `Math.round(Math.sqrt(laps.reduce((acc, l) => acc + (l.lapTimeMs - avgLapMs) ** 2, 0) / lapCount))`
  - `id`: `(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString()`

- **`saveSession(sessionRecord)`** — prepends the session record to the existing `rc_sessions` array (newest first) and serializes to localStorage. Returns `true` on success, `false` on quota error.

- **`getHistory()`** — reads and parses `rc_sessions`; returns `Session[]` sorted newest first. Returns `[]` if the key is missing or the JSON is malformed (catch parse error, log warning, return `[]`).

- **`deleteSession(id)`** — filters the session with matching `id` out of the array and re-saves. No-op if `id` is not found.

- **`clearAllData()`** — removes `rc_sessions`, `rc_settings`, `rc_driverName`, `rc_carName`, `rc_location`, `rc_sensitivity`, `rc_debounce`, `rc_zoneWidth` from `localStorage`. Does **not** call `location.reload()` — the caller decides what to do next.

#### A3 — Settings CRUD

- **`getSettings()`** — reads and parses `rc_settings`; merges the parsed object with `DEFAULT_SETTINGS` so missing keys (from older versions) fall back to defaults. Returns a `Settings` object.

- **`saveSettings(partial)`** — merges `partial` into the current settings (reads first, then merges, then writes). Validates numeric ranges before saving:
  - `countdownDuration`: clamp to `[1, 60]`
  - `ttsPitch`: clamp to `[0.5, 2.0]`
  - `ttsVolume`: clamp to `[0, 1]`
  - `units`: accept only `'metric'` or `'imperial'`; ignore invalid values

#### A4 — Public API Surface

```js
// ── Exported public API ───────────────────────────────────────────────────────
export {
  buildSessionRecord,   // (rawSession) → Session
  saveSession,          // (session)    → boolean
  getHistory,           // ()           → Session[]
  deleteSession,        // (id)         → void
  clearAllData,         // ()           → void
  getSettings,          // ()           → Settings
  saveSettings,         // (partial)    → void
};
```

---

### Task Group B — Post-Session Summary (`js/summary.js`)

**Assignable to:** Agent B (independent of C and D)
**Depends on:** Group A (`storage.js` — `buildSessionRecord`, `saveSession`); Group E (Screen 5 HTML must exist in `index.html`)
**Blocks:** Group F (app wiring)

#### B1 — Lap Time Formatter

Private helper used by stat cards and chart axis labels:

```js
/**
 * Formats a lap time in milliseconds to a human-readable string.
 * Under 60 s → "45.234"
 * 60 s or over → "1:12.034"
 * @param {number} ms
 * @returns {string}
 */
function _formatLapTime(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(3);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}
```

#### B2 — Stats Computation (`computeStats`)

Pure function — no DOM access, no imports. Exported so Group F can pass computed stats to `saveSession`.

```js
/**
 * @param {LapRecord[]} laps
 * @param {number}      totalTimeMs
 * @returns {{ bestLapMs: number, avgLapMs: number, consistencyScore: number }}
 */
export function computeStats(laps, totalTimeMs) { … }
```

- `bestLapMs`: min of all `lapTimeMs`
- `avgLapMs`: `Math.round(totalTimeMs / laps.length)`
- `consistencyScore`: population std deviation in ms (same formula as `buildSessionRecord` in A2 — they must produce identical results for the same input)

#### B3 — SVG Performance Chart (`renderChart`)

Renders a line chart into the `<svg id="summary-chart">` element. Uses only DOM APIs — no external charting library.

```js
/**
 * Clears and re-renders the lap time line chart into svgEl.
 * @param {SVGSVGElement} svgEl
 * @param {LapRecord[]}   laps
 * @param {number}        bestLapMs  — used to highlight the best-lap point
 */
export function renderChart(svgEl, laps, bestLapMs) { … }
```

**Rendering specification:**
- Set `viewBox="0 0 300 150"` and `preserveAspectRatio="xMidYMid meet"` as attributes on `svgEl`
- **Plot area:** left=40, top=12, right=284, bottom=120 (240×108 drawable region)
- **X scale:** `x = 40 + ((lapNumber - 1) / Math.max(1, laps.length - 1)) * 244`; if only one lap, center at x=162
- **Y scale:** compute `minMs` and `maxMs` from laps; add 8% padding to both ends; `y = 120 - ((lapTimeMs - paddedMin) / (paddedMax - paddedMin)) * 108`
- **Grid lines:** 4 horizontal dashed lines at 25%, 50%, 75%, 100% of Y range — `<line>` elements with `class="chart-grid"`
- **Polyline:** `<polyline class="chart-line">` with `points` attribute built from all (x, y) pairs
- **Data points:** one `<circle>` per lap; `r="5"`, `class="chart-dot"` for all; add `class="chart-dot--best"` for the lap with `lapTimeMs === bestLapMs`
- **X-axis labels:** `<text>` elements for lap numbers 1, midpoint, and last lap; `class="chart-label-x"`; y=138
- **Y-axis labels:** `<text>` elements for `paddedMin` and `paddedMax` formatted via `_formatLapTime`; `class="chart-label-y"`; x=36; `text-anchor="end"`
- SVG styling (colors) is applied via CSS classes in `styles/summary.css` — do not inline `stroke` or `fill` attributes on drawn elements; use `class` only

#### B4 — Screen Initialization (`initSummary`)

Called once from `js/app.js` at startup to wire event listeners. Must be idempotent.

```js
export function initSummary() { … }
```

- Bind `#btn-save-session` click: call `buildSessionRecord(window.__rcSession)` → `saveSession(record)` → `showScreen('home')` and clear `window.__rcSession`
- Bind `#btn-discard-session` click: clear `window.__rcSession` → `showScreen('home')`
- Bind `#btn-restart-session` click: clear `window.__rcSession` → `showScreen('viewfinder')`

#### B5 — Screen Entry (`showSummary`)

Called from `js/app.js` when a session ends (stop or goal met).

```js
/**
 * @param {Object} rawSession  — window.__rcSession at time of stop
 */
export function showSummary(rawSession) { … }
```

- Populate `#summary-meta` with `"${driverName} · ${carName} · ${location}"`; omit empty fields
- Call `computeStats(rawSession.laps, rawSession.totalTimeMs)` and populate stat card elements:
  - `#stat-fastest` ← `_formatLapTime(bestLapMs)` + `"s"` suffix if under 60 s
  - `#stat-avg` ← same format
  - `#stat-consistency` ← `"±" + consistencyScore + "ms"`
- Call `renderChart(svgEl, rawSession.laps, bestLapMs)`
- Call `showScreen('summary')` (via `router.js`)

#### B6 — Public API Surface

```js
export {
  initSummary,    // () → void — wire listeners once at app startup
  showSummary,    // (rawSession) → void — entry point called by app.js
  computeStats,   // (laps, totalTimeMs) → { bestLapMs, avgLapMs, consistencyScore }
  renderChart,    // (svgEl, laps, bestLapMs) → void
};
```

---

### Task Group C — History Screen (`js/history.js`)

**Assignable to:** Agent C (independent of B and D)
**Depends on:** Group A (`storage.js` — `getHistory`, `deleteSession`); Group E (Screen 6 HTML must exist)
**Blocks:** Group F (app wiring)

#### C1 — Date Grouping Helper

Private function. Groups a `Session[]` by calendar date for display.

```js
/**
 * @param {Session[]} sessions  — assumed sorted newest first
 * @returns {Array<{ dateLabel: string, sessions: Session[] }>}
 */
function _groupByDate(sessions) {
  const map = new Map();
  sessions.forEach(s => {
    const label = new Date(s.date).toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(s);
  });
  return Array.from(map.entries()).map(([dateLabel, sessions]) => ({ dateLabel, sessions }));
}
```

#### C2 — Session Card Renderer (`renderSessionList`)

Clears `#history-list` and rebuilds it from `sessions`. Toggling `#history-empty` based on whether the list is empty.

```js
export function renderSessionList(sessions) { … }
```

**Card DOM structure per session** (appended as `<li role="listitem">` inside `<ul id="history-list">`):

```html
<li class="session-card" data-session-id="[id]">
  <div class="session-card__primary">
    <span class="session-card__car">[carName]</span>
    <span class="session-card__driver">[driverName]</span>
  </div>
  <div class="session-card__secondary">
    <span class="session-card__location">[location]</span>
    <span class="session-card__laps">[lapCount] laps</span>
  </div>
  <div class="session-card__best">
    <span class="session-card__best-label">BEST</span>
    <span class="session-card__best-time">[_formatLapTime(bestLapMs)]</span>
  </div>
</li>
```

- Date group headers are `<h2 class="history-date-header">` elements inserted above each group's `<ul>`
- If `sessions` is empty, set `#history-list` to empty and remove `hidden` from `#history-empty`

#### C3 — Search / Filter

Bind a listener on `#history-search` `input` event. On each event:
1. Read `value.trim().toLowerCase()` as `query`
2. If `query` is empty, call `renderSessionList(getHistory())`
3. Otherwise filter: keep sessions where `driverName.toLowerCase().includes(query) || carName.toLowerCase().includes(query)`
4. Call `renderSessionList(filtered)`

#### C4 — Long-Press Delete

Wire long-press behavior on all session cards inside `#history-list` using event delegation on the list container (not individual cards — they are dynamically generated).

**Implementation:**
- On `pointerdown` on a `.session-card`: start a `setTimeout` of 500 ms; store the target card's `data-session-id`
- On `pointerup` / `pointerleave` / `pointermove` (with movement > 8px): cancel the timeout
- On timeout fire: reveal `#delete-confirm-chip` absolutely positioned over/near the card; store the pending `id` in a module-level `_pendingDeleteId` variable
- `#btn-delete-confirm` click: call `deleteSession(_pendingDeleteId)`, hide chip, re-render list
- `#btn-delete-cancel` click: hide chip, clear `_pendingDeleteId`
- Desktop fallback: also accept `mousedown` / `mouseup` following the same 500 ms logic

#### C5 — Screen Initialization (`initHistory`)

Called once from `js/app.js` at startup.

```js
export function initHistory() { … }
```

- Bind `#history-search` listener (C3)
- Wire long-press delegation on `#history-list` (C4)
- Bind `#btn-delete-confirm` and `#btn-delete-cancel` (C4)
- Bind `#btn-history-back` click → `showScreen('home')`

#### C6 — Screen Entry (`showHistory`)

```js
export function showHistory() { … }
```

- Clear `#history-search` value
- Call `renderSessionList(getHistory())`
- Call `showScreen('history')`

#### C7 — Public API Surface

```js
export {
  initHistory,        // () → void
  showHistory,        // () → void
  renderSessionList,  // (sessions) → void
};
```

---

### Task Group D — Global Settings Screen (`js/settings.js`)

**Assignable to:** Agent D (independent of B and C)
**Depends on:** Group A (`storage.js` — `getSettings`, `saveSettings`, `clearAllData`); `js/audio.js` (`getAvailableVoices`, `setPreferredVoice`); Group E (Screen 7 HTML must exist)
**Blocks:** Group F (app wiring)

#### D1 — Settings Form Hydration

Private function called by `showSettings()`. Reads `getSettings()` and populates all form controls to match stored values.

```js
function _hydrateForm(settings) { … }
```

- `#setting-countdown` value ← `settings.countdownDuration`
- `#setting-tts-pitch` value ← `settings.ttsPitch`; update `#label-pitch` text
- `#setting-tts-volume` value ← `settings.ttsVolume`; update `#label-volume` text
- `#setting-tts-voice` selected option ← `settings.ttsVoiceName` (or first option if null)
- `[data-value]` toggle buttons: add `class="toggle-btn--active"` to button matching `settings.units`; remove from the other

#### D2 — Voice Selector Population

Called once on first `showSettings()` (or whenever `speechSynthesis.onvoiceschanged` fires). Uses `getAvailableVoices()` from `js/audio.js`.

```js
async function _populateVoiceList() { … }
```

- Await `getAvailableVoices()` (it returns a Promise in Chrome due to async loading)
- Build `<option value="[voice.name]">[voice.name] ([voice.lang])</option>` for each voice
- Prepend a default option: `<option value="">System Default</option>`
- Set the selected option to match `getSettings().ttsVoiceName`

#### D3 — Live Input Listeners

All control changes call `saveSettings(partial)` immediately (no Save button needed).

- `#setting-countdown` `change` event → `saveSettings({ countdownDuration: Number(input.value) })`
- `#setting-tts-pitch` `input` event → update `#label-pitch` text, `saveSettings({ ttsPitch: Number(input.value) })`
- `#setting-tts-volume` `input` event → update `#label-volume` text, `saveSettings({ ttsVolume: Number(input.value) })`
- `#setting-tts-voice` `change` event → `saveSettings({ ttsVoiceName: select.value || null })`; call `setPreferredVoice(select.value || null)` from `audio.js`
- `.toggle-btn[data-value]` `click` event: swap `toggle-btn--active` class, `saveSettings({ units: btn.dataset.value })`

#### D4 — Clear All Data Flow

```js
function _initClearDataFlow() { … }
```

- `#btn-clear-data` click → remove `hidden` from `#clear-data-modal`; set `aria-hidden="false"` on modal
- `#btn-clear-cancel` click → add `hidden` back; `aria-hidden="true"`
- `#btn-clear-confirm` click:
  1. Call `clearAllData()` from `storage.js`
  2. Hide modal
  3. Call `showScreen('home')` — the Home Screen inputs will be blank because localStorage was wiped; home.js already reads from localStorage on show
  4. Re-hydrate the settings form from `getSettings()` (returns defaults) for the next time the screen is opened

#### D5 — Offline Status Badge

In `showSettings()`, detect service worker status:

```js
const isControlled = !!navigator.serviceWorker.controller;
document.getElementById('about-offline-status').textContent =
  isControlled ? '✓ Offline Ready' : 'Connecting…';
```

No polling — read once on screen entry.

#### D6 — Screen Initialization (`initSettings`)

```js
export function initSettings() { … }
```

- Bind `#btn-settings-back` click → `showScreen('home')`
- Bind all form control listeners (D3)
- Initialize clear data flow (D4)
- Register `speechSynthesis.onvoiceschanged = _populateVoiceList` if `'speechSynthesis' in window`

#### D7 — Screen Entry (`showSettings`)

```js
export function showSettings() { … }
```

- Call `_hydrateForm(getSettings())`
- Call `_populateVoiceList()` (async, non-blocking)
- Update offline badge (D5)
- Call `showScreen('settings')`

#### D8 — Public API Surface

```js
export {
  initSettings,  // () → void
  showSettings,  // () → void
};
```

---

### Task Group E — HTML Screens & All CSS (Parallel with Group A)

**Assignable to:** Agent E (fully independent)
**Depends on:** Phase 1 CSS custom properties in `styles/tokens.css`; Phase 1 screen pattern in `index.html`
**Blocks:** Groups B, C, D (need their screens to exist), Group F

#### E1 — HTML: Screen 5 — Post-Session Summary (`#screen-summary`)

Add inside `index.html` after `#screen-dashboard`, before `</main>`:

```html
<section id="screen-summary" class="screen" hidden>
  <header class="summary-header">
    <h1 class="summary-title">Session Complete</h1>
    <p class="summary-meta" id="summary-meta"></p>
  </header>

  <div class="summary-chart-container" aria-hidden="true">
    <svg id="summary-chart" class="lap-chart" role="img"
         aria-label="Line chart of lap times"></svg>
  </div>

  <div class="summary-stats-row" role="region" aria-label="Session statistics">
    <div class="stat-card">
      <span class="stat-label">Fastest Lap</span>
      <span class="stat-value" id="stat-fastest" aria-live="polite">–</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Average Lap</span>
      <span class="stat-value" id="stat-avg" aria-live="polite">–</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Consistency</span>
      <span class="stat-value" id="stat-consistency" aria-live="polite">–</span>
    </div>
  </div>

  <div class="summary-action-row">
    <button id="btn-save-session" class="btn btn--accent btn--full">Save to History</button>
    <button id="btn-restart-session" class="btn btn--ghost btn--half">Restart</button>
    <button id="btn-discard-session" class="btn btn--danger btn--half">Discard</button>
  </div>
</section>
```

#### E2 — HTML: Screen 6 — Session History (`#screen-history`)

```html
<section id="screen-history" class="screen" hidden>
  <header class="history-header">
    <button id="btn-history-back" class="btn-icon" aria-label="Back to home">&#8592;</button>
    <h1 class="history-title">History</h1>
  </header>

  <div class="history-search-bar">
    <input type="search" id="history-search"
           placeholder="Filter by driver or car…"
           autocomplete="off" autocorrect="off" spellcheck="false">
  </div>

  <div id="history-list-container" class="history-list-container">
    <ul id="history-list" class="history-list" role="list"></ul>
    <p id="history-empty" class="history-empty" hidden>
      No sessions yet. Complete a race to see results here.
    </p>
  </div>

  <div id="delete-confirm-chip" class="delete-chip" hidden role="alertdialog" aria-modal="true">
    <span class="delete-chip__label">Delete this session?</span>
    <button id="btn-delete-confirm" class="btn btn--danger btn--sm">Delete</button>
    <button id="btn-delete-cancel" class="btn btn--ghost btn--sm">Cancel</button>
  </div>
</section>
```

#### E3 — HTML: Screen 7 — Global Settings (`#screen-settings`)

```html
<section id="screen-settings" class="screen" hidden>
  <header class="settings-header">
    <button id="btn-settings-back" class="btn-icon" aria-label="Back to home">&#8592;</button>
    <h1 class="settings-title">Settings</h1>
  </header>

  <div class="settings-body">

    <div class="settings-group">
      <label class="settings-label" for="setting-countdown">
        Default Countdown (seconds)
      </label>
      <input type="number" id="setting-countdown" class="settings-input"
             min="1" max="60" value="10" inputmode="numeric">
    </div>

    <div class="settings-group">
      <label class="settings-label" for="setting-tts-voice">Announcer Voice</label>
      <select id="setting-tts-voice" class="settings-select"></select>
    </div>

    <div class="settings-group">
      <label class="settings-label" for="setting-tts-pitch">
        Voice Pitch <span id="label-pitch">1.0</span>
      </label>
      <input type="range" id="setting-tts-pitch"
             min="0.5" max="2.0" step="0.1" value="1.0">
    </div>

    <div class="settings-group">
      <label class="settings-label" for="setting-tts-volume">
        Voice Volume <span id="label-volume">1.0</span>
      </label>
      <input type="range" id="setting-tts-volume"
             min="0" max="1" step="0.1" value="1.0">
    </div>

    <div class="settings-group">
      <span class="settings-label" id="label-units">Units</span>
      <div class="toggle-group" role="group" aria-labelledby="label-units">
        <button class="toggle-btn toggle-btn--active" data-value="metric">Metric</button>
        <button class="toggle-btn" data-value="imperial">Imperial</button>
      </div>
    </div>

    <div class="settings-group settings-group--danger">
      <button id="btn-clear-data" class="btn btn--danger btn--full">Clear All Data</button>
    </div>

    <div class="settings-group settings-about">
      <p class="about-version">RC Lap Timer &middot; v1.0.0</p>
      <p class="about-offline" id="about-offline-status">Checking offline status&hellip;</p>
    </div>

  </div>

  <!-- Confirmation modal -->
  <div id="clear-data-modal" class="modal-overlay" hidden
       role="alertdialog" aria-modal="true"
       aria-labelledby="modal-title" aria-describedby="modal-body">
    <div class="modal-card">
      <h2 class="modal-title" id="modal-title">Clear All Data?</h2>
      <p class="modal-body" id="modal-body">
        This permanently deletes all sessions, profiles, and settings.
        This cannot be undone.
      </p>
      <div class="modal-actions">
        <button id="btn-clear-confirm" class="btn btn--danger btn--full">
          Yes, Clear Everything
        </button>
        <button id="btn-clear-cancel" class="btn btn--ghost btn--full">Cancel</button>
      </div>
    </div>
  </div>
</section>
```

#### E4 — HTML: Add Stylesheet Links

Add before `</head>` in `index.html` (additive — after existing stylesheet links):

```html
<link rel="stylesheet" href="styles/summary.css">
<link rel="stylesheet" href="styles/history.css">
<link rel="stylesheet" href="styles/settings.css">
```

#### E5 — CSS: `styles/summary.css`

All rules scoped to `#screen-summary` or its child selectors.

**Summary header:**
- `.summary-header`: `padding: var(--space-6) var(--space-4) var(--space-4); text-align: center;`
- `.summary-title`: `font-family: var(--font-ui); font-size: 1.125rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-primary);`
- `.summary-meta`: `font-size: 0.875rem; color: var(--color-text-secondary); margin-top: var(--space-1);`

**Chart container:**
- `.summary-chart-container`: `margin: 0 var(--space-4); background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-4) var(--space-2) var(--space-2);`
- `.lap-chart`: `width: 100%; height: auto; display: block;`
- SVG chart classes (styled in this CSS file):
  - `.chart-grid`: `stroke: var(--color-border); stroke-width: 1; stroke-dasharray: 4 4; fill: none;`
  - `.chart-line`: `stroke: var(--color-accent); stroke-width: 2; fill: none; stroke-linejoin: round;`
  - `.chart-dot`: `fill: var(--color-surface-raised); stroke: var(--color-accent); stroke-width: 2;`
  - `.chart-dot--best`: `fill: var(--color-best-lap); stroke: var(--color-best-lap);`
  - `.chart-label-x`, `.chart-label-y`: `fill: var(--color-text-muted); font-size: 10px; font-family: var(--font-mono);`

**Stat cards:**
- `.summary-stats-row`: `display: flex; gap: var(--space-3); padding: var(--space-4); justify-content: stretch;`
- `.stat-card`: `flex: 1; background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-4) var(--space-3); display: flex; flex-direction: column; align-items: center; gap: var(--space-1);`
- `.stat-label`: `font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-secondary);`
- `.stat-value`: `font-family: var(--font-mono); font-size: 1.125rem; font-weight: 700; color: var(--color-text-primary); font-variant-numeric: tabular-nums;`

**Action row:**
- `.summary-action-row`: `display: flex; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-4); padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));`
- `.btn--full`: `flex: 1 1 100%;`
- `.btn--half`: `flex: 1 1 calc(50% - var(--space-3) / 2);`
- `.btn--accent`: `background: var(--color-accent); color: #000000; font-weight: 700; border-radius: var(--radius-lg); min-height: var(--space-16); font-size: 1rem;`
- `.btn--danger`: `background: var(--color-stop); color: var(--color-text-primary); font-weight: 700; border-radius: var(--radius-lg); min-height: var(--space-12); font-size: 1rem;`
- `.btn--ghost`: `background: var(--color-surface); color: var(--color-text-secondary); border: 1px solid var(--color-border); font-weight: 600; border-radius: var(--radius-lg); min-height: var(--space-12); font-size: 1rem;`

#### E6 — CSS: `styles/history.css`

All rules scoped to `#screen-history` or child selectors.

**Header:**
- `.history-header`: `display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4); border-bottom: 1px solid var(--color-border);`
- `.btn-icon`: `background: none; border: none; color: var(--color-text-primary); font-size: 1.5rem; padding: var(--space-2); min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;`
- `.history-title`: `font-size: 1.125rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-primary);`

**Search bar:**
- `.history-search-bar`: `padding: var(--space-3) var(--space-4);`
- `#history-search`: `width: 100%; background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4); color: var(--color-text-primary); font-size: 1rem; outline: none; box-sizing: border-box;`
- `#history-search:focus`: `border-color: var(--color-accent);`

**Session list:**
- `.history-list-container`: `overflow-y: auto; flex: 1; padding: 0 var(--space-4) var(--space-4);`
- `.history-date-header`: `font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); padding: var(--space-4) 0 var(--space-2); margin: 0;`
- `.history-list`: `list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2);`
- `.session-card`: `background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-4); display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: var(--space-1) var(--space-4); touch-action: none; user-select: none;`
- `.session-card__primary`: `grid-column: 1; display: flex; gap: var(--space-2); align-items: baseline;`
- `.session-card__car`: `font-weight: 700; color: var(--color-text-primary); font-size: 1rem;`
- `.session-card__driver`: `color: var(--color-text-secondary); font-size: 0.875rem;`
- `.session-card__secondary`: `grid-column: 1; display: flex; gap: var(--space-2); color: var(--color-text-muted); font-size: 0.75rem;`
- `.session-card__best`: `grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; align-items: flex-end; justify-content: center;`
- `.session-card__best-label`: `font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-best-lap);`
- `.session-card__best-time`: `font-family: var(--font-mono); font-size: 1.25rem; font-weight: 700; color: var(--color-best-lap); font-variant-numeric: tabular-nums;`
- `.history-empty`: `text-align: center; color: var(--color-text-muted); font-size: 0.875rem; padding: var(--space-12) var(--space-4);`

**Delete chip:**
- `.delete-chip`: `position: fixed; bottom: calc(var(--space-8) + env(safe-area-inset-bottom)); left: var(--space-4); right: var(--space-4); background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; gap: var(--space-3); z-index: 50;`
- `.delete-chip__label`: `flex: 1; font-size: 0.875rem; color: var(--color-text-primary);`
- `.btn--sm`: `min-height: var(--space-12); padding: 0 var(--space-4); font-size: 0.875rem;`

#### E7 — CSS: `styles/settings.css`

All rules scoped to `#screen-settings` or child selectors.

**Header:** same `.history-header`, `.btn-icon`, and title pattern — re-declare with `.settings-header` and `.settings-title` selectors for isolation.

**Body & groups:**
- `.settings-body`: `overflow-y: auto; flex: 1; padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-6);`
- `.settings-group`: `display: flex; flex-direction: column; gap: var(--space-2);`
- `.settings-label`: `font-size: 0.875rem; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.08em;`
- `.settings-input`: `background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); color: var(--color-text-primary); font-size: 1rem; min-height: var(--space-12);`
- `.settings-select`: same styles as `.settings-input`
- `input[type="range"]`: `width: 100%; accent-color: var(--color-accent); height: 4px;`
- `.settings-group--danger`: `border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-6);`

**Toggle group:**
- `.toggle-group`: `display: flex; gap: 0; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--color-border);`
- `.toggle-btn`: `flex: 1; background: var(--color-surface-raised); color: var(--color-text-secondary); border: none; padding: var(--space-3) var(--space-4); font-size: 0.875rem; font-weight: 600; min-height: var(--space-12); cursor: pointer;`
- `.toggle-btn--active`: `background: var(--color-accent); color: #000000;`

**About panel:**
- `.settings-about`: `border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-4);`
- `.about-version`: `font-size: 0.875rem; color: var(--color-text-muted);`
- `.about-offline`: `font-size: 0.875rem; color: var(--color-start); margin-top: var(--space-1);`

**Modal overlay:**
- `.modal-overlay`: `position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 100; display: flex; align-items: center; justify-content: center; padding: var(--space-4);`
- `.modal-overlay[hidden]`: `display: none;`
- `.modal-card`: `background: var(--color-surface); border-radius: var(--radius-lg); padding: var(--space-8); width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: var(--space-4);`
- `.modal-title`: `font-size: 1.125rem; font-weight: 700; color: var(--color-text-primary);`
- `.modal-body`: `font-size: 0.875rem; color: var(--color-text-secondary); line-height: 1.5;`
- `.modal-actions`: `display: flex; flex-direction: column; gap: var(--space-3);`

---

### Task Group F — App Wiring & Service Worker Update

**Assignable to:** Agent F (runs last)
**Depends on:** All other task groups (A, B, C, D, E)
**Blocks:** Nothing — this is the final integration step

#### F1 — `js/app.js` Wiring (additive)

Import the new modules at the top of `app.js`:

```js
import { initSummary, showSummary }   from './summary.js';
import { initHistory, showHistory }   from './history.js';
import { initSettings, showSettings } from './settings.js';
```

In the app initialization block (where other `init*` calls already live), add:

```js
initSummary();
initHistory();
initSettings();
```

In the session stop handler (where `session.js` fires when STOP is pressed or lap goal is met), add:

```js
showSummary(window.__rcSession);
```

This call replaces whatever `showScreen('home')` call currently exists at session end — the summary screen is now the mandatory stop before returning home.

#### F2 — `js/home.js` Wiring (additive)

Wire the gear icon and History button. These elements already exist in `#screen-home` from Phase 1; only the click handlers are new.

```js
import { showHistory }  from './history.js';
import { showSettings } from './settings.js';

// In the home screen init function (additive — do not replace existing listeners):
document.getElementById('btn-settings').addEventListener('click', showSettings);
document.getElementById('btn-history').addEventListener('click', showHistory);
```

> **Note:** Confirm the IDs `btn-settings` (gear icon) and `btn-history` match the actual IDs in `index.html`. If Phase 1 used different IDs, use the correct IDs — do not rename existing elements.

#### F3 — `sw.js` Service Worker Bump (additive)

Update the cache name and add 7 new assets to the pre-cache list. Change only the `CACHE_NAME` constant and the assets array:

```js
// Change:
const CACHE_NAME = 'rc-timer-v5';
// To:
const CACHE_NAME = 'rc-timer-v6';
```

Add to the pre-cache assets array:

```js
'js/storage.js',
'js/summary.js',
'js/history.js',
'js/settings.js',
'styles/summary.css',
'styles/history.css',
'styles/settings.css',
```

No other changes to `sw.js`.

---

## Milestone Acceptance Criteria

The following checklist validates the Phase 6 milestone:

- [ ] Run a 10-lap session end-to-end; on Stop/Goal Met, the Summary screen appears automatically with chart and stat cards populated
- [ ] Tap "Save to History" on the Summary screen; the session appears in the History screen grouped under today's date with correct car name, driver, and best lap time displayed
- [ ] Close the browser tab entirely, reopen the PWA; all three calibration sliders (Sensitivity, Debounce, Zone Width) on the Viewfinder screen load with the previously saved values
- [ ] Open History; type a partial car name in the filter input; the list filters in real time, showing only matching sessions
- [ ] Long-press a session card for 500 ms; the delete confirmation chip appears; confirm deletion; the card is removed from the list
- [ ] Open Settings; change the countdown duration to 15 seconds; close Settings; reopen Settings; the value persists at 15
- [ ] Tap "Clear All Data" → "Yes, Clear Everything"; all history is wiped; the Home Screen inputs are empty; calibration sliders reset to defaults
- [ ] Open Settings; the "✓ Offline Ready" badge is visible (requires the Service Worker to be active)
