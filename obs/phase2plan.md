# Phase 2 Implementation Plan – Hardware Interfacing (Camera & Audio)

## Overview

**Goal:** Gain stable, reliable access to the device camera, hardware lock APIs, and audio engine before any detection logic is written. Every sub-task in this phase is a pure infrastructure concern — no lap timing, no pixel analysis, no UI routing.

**Milestone (from plan.md):** User can see the camera feed, toggle a "Screen Stay Awake" button, and trigger a test TTS voice notification.

---

## Phase 1 Prerequisite Checklist

These deliverables from Phase 1 must be complete before Phase 2 begins. Agents should verify their existence and structure.

| Deliverable | File/Location | Notes |
|---|---|---|
| HTML shell | `index.html` | Must include `<main>` or root container where the viewfinder `<section>` will be injected |
| CSS tokens | `styles/tokens.css` | CSS custom properties (color palette, typography, spacing) from style guide — confirmed present |
| CSS base | `styles/global.css` | Resets, base layout rules, button reset — confirmed present |
| CSS screen | `styles/home.css` | Home Screen styles — confirmed present |
| Main JS entry | `js/app.js` | Module-ready; no global pollution |
| Router | `js/router.js` | Exports named functions `showScreen(screenId)` and `currentScreen()` — **not** a class |
| Service Worker | `sw.js` | Registered in `index.html`; caches 8 shell assets |
| PWA Manifest | `manifest.json` | `display: standalone`, icons present |
| Home Screen | Screen 1 in `index.html` | "Start New Session" button already calls `showScreen('viewfinder')` in `js/home.js` — Phase 2 must **extend** this handler to also call `startCamera()`, not replace it |

> **Agent Rule:** Do not implement Phase 2 tasks against placeholder HTML. Confirm Phase 1 files exist and the app opens to the Home Screen before proceeding.

---

## File Structure – New Files Created in Phase 2

```
js/
  camera.js            ← Task Group A
  wakeLock.js          ← Task Group B (parallel with A)
  audio.js             ← Task Group C (parallel with A and B)
styles/
  viewfinder.css       ← Task Group D (parallel with A, B, C)
```

> **Note:** The CSS directory is `styles/` (established in Phase 1), not `css/`. All stylesheet references must use the `styles/` prefix.

`index.html` and `js/app.js` will be modified (not created) to wire everything together. All modifications are additive — no existing Phase 1 code should be deleted or restructured.

---

## Detailed Task Breakdown

---

### Task Group A — Camera Module (`js/camera.js`)
**Assignable to:** Agent A (independent)
**Depends on:** Phase 1 HTML shell only
**Blocks:** Task 2.3 (Stability Delay), Phase 3 (Viewfinder Screen)

#### A1 — `getUserMedia` Initialization
- Request the camera stream using the `"environment"` facing mode (back camera).
- Preferred constraints: `{ video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } }`.
- Fallback constraint: if `exact` throws `OverconstrainedError`, retry with `facingMode: "environment"` (non-exact) to support desktop webcams during development.
- Expose a `startCamera(videoElement)` async function that resolves with the active `MediaStream`.
- Expose a `stopCamera()` function that calls `.stop()` on all tracks and sets `videoElement.srcObject = null`.

#### A2 — `<video>` Element Wiring
- In `index.html`, add the `<video>` element inside the Viewfinder `<section>` (Screen 2).
- Attributes required: `autoplay`, `playsinline`, `muted`. The `muted` attribute is required on iOS Safari for autoplay to work.
- Set `width: 100%`, `height: 100%`, `object-fit: cover` in CSS.
- The video must be appended/shown only when the Viewfinder screen is active; remove or `display: none` on all other screens.

#### A3 — Permission & Error Handling
- Catch `NotAllowedError` → show a persistent in-app banner: "Camera permission denied. Please allow camera access in your browser settings."
- Catch `NotFoundError` → show: "No camera detected on this device."
- Catch `NotReadableError` → show: "Camera is in use by another app."
- All error messages must be `role="alert"` elements for accessibility.
- Do not `alert()` — render errors inline in the Viewfinder UI.

#### A4 — Camera State Module API (public surface)
Define and export the following from `camera.js`:
```js
startCamera(videoEl)   → Promise<MediaStream>
stopCamera()           → void
getCameraStream()      → MediaStream | null
isCameraActive()       → boolean
```

---

### Task Group B — Wake Lock & Camera Stabilization APIs (`js/wakeLock.js`)
**Assignable to:** Agent B (independent of A and C)
**Depends on:** Phase 1 HTML shell only
**Blocks:** Phase 3 status indicators

#### B1 — Wake Lock API Implementation
- Use `navigator.wakeLock.requestWakeLock('screen')` (or the sentinel pattern: `navigator.wakeLock.request('screen')`).
- Store the sentinel object. On `visibilitychange` event (tab becoming visible), re-acquire the lock automatically — wake locks are released when the page is hidden.
- Expose `acquireWakeLock()` and `releaseWakeLock()` async functions.
- Guard with feature detection: `if ('wakeLock' in navigator)`. If unsupported, log a warning and no-op silently — do not throw.

#### B2 — Wake Lock Status Indicator
- In the Viewfinder HTML (Screen 2), add a small status indicator element (icon + text label).
- States:
  - **Active:** icon `🔒` + text "Screen Active" — colored `--color-start` (#22C55E)
  - **Inactive/Unsupported:** icon `🔓` + text "Screen May Sleep" — colored `--color-text-muted` (#555555)
- The indicator updates reactively via a callback passed to the wake lock module. Do not poll.

#### B3 — ImageCapture / Focus & Exposure Lock
- After `getUserMedia` resolves (camera stream is active), get the video track via `stream.getVideoTracks()[0]`.
- Feature-detect `ImageCapture` via `typeof ImageCapture !== 'undefined'`.
- Call `track.applyConstraints({ advanced: [{ focusMode: 'locked', exposureMode: 'locked' }] })` to freeze the camera.
- Expose a `lockCameraSettings(stream)` async function that resolves with `true` (locked) or `false` (unsupported).
- This function should only be callable after `startCamera()` has resolved — document this dependency in a code comment.

#### B4 — Camera Stabilized Status Indicator
- Alongside the Wake Lock indicator, add a second status element.
- States:
  - **Locked:** "Camera Stabilized" — colored `--color-start`
  - **Unlocked/Unsupported:** "Camera Auto" — colored `--color-text-muted`
- Trigger state update from the `lockCameraSettings()` resolved value.

#### B5 — Wake Lock Module API (public surface)
```js
acquireWakeLock()           → Promise<void>
releaseWakeLock()           → void
isWakeLockActive()          → boolean
lockCameraSettings(stream)  → Promise<boolean>
isCameraLocked()            → boolean
```

---

### Task Group C — Audio & Speech Engine (`js/audio.js`)
**Assignable to:** Agent C (fully independent of A and B)
**Depends on:** Nothing (pure JS, no DOM dependencies beyond a test button)
**Blocks:** Phase 4 (Virtual LED beep), Phase 5 (countdown beeps + TTS lap announcements)

#### C1 — Web Audio API Beep Generator
- Create an `AudioContext` lazily (on first user interaction, to comply with browser autoplay policy). Do not create it at module load time.
- Implement `playBeep(frequency, duration, volume)`:
  - `frequency`: Hz (default `880`)
  - `duration`: ms (default `120`)
  - `volume`: 0–1 (default `0.6`)
  - Uses an `OscillatorNode` + `GainNode`. Ramp gain down to 0 at end of duration to avoid clicking artifacts.
- Implement `playCountdownBeep()` → calls `playBeep(880, 120)` (short mid-tone).
- Implement `playFinalBeep()` → calls `playBeep(1200, 300)` (higher, longer for "GO").
- Implement `playLapBeep()` → calls `playBeep(660, 80)` (quick confirmation).

#### C2 — Speech Synthesis (TTS) Wrapper
- Wrap `window.speechSynthesis` with a module-level `speak(text, options)` function.
- `options`: `{ rate: 1.0, pitch: 1.0, volume: 1.0, voice: null }` — all optional.
- Cancel any in-progress utterance before starting a new one (`speechSynthesis.cancel()`).
- Guard with feature detection: `if ('speechSynthesis' in window)`.
- Implement `getAvailableVoices()` → returns `window.speechSynthesis.getVoices()`, handling the async `voiceschanged` event on Chrome.
- Implement `setPreferredVoice(voiceName)` → stores the selected voice internally for all subsequent `speak()` calls.

#### C3 — TTS Lap Announcement Formatter
- Implement `announceLap(lapNumber, lapTimeMs)`:
  - Formats the time as a human-readable string, e.g., `"Lap 3: one minute, twelve point four seconds"` or `"Lap 3: forty-five point two seconds"` if under a minute.
  - Calls `speak()` with the formatted string.
- This function will be called directly by Phase 5 session management with no modification needed.

#### C4 — Audio Module API (public surface)
```js
playBeep(frequency, duration, volume)  → void
playCountdownBeep()                    → void
playFinalBeep()                        → void
playLapBeep()                          → void
speak(text, options)                   → void
announceLap(lapNumber, lapTimeMs)      → void
getAvailableVoices()                   → Promise<SpeechSynthesisVoice[]>
setPreferredVoice(voiceName)           → void
```

---

### Task Group D — Viewfinder Screen CSS (`styles/viewfinder.css`)
**Assignable to:** Agent D (fully independent of A, B, C)
**Depends on:** Phase 1 CSS custom properties (tokens exist in `styles/tokens.css`)
**Blocks:** Phase 3 canvas overlay work

#### D1 — Full-Screen Video Container
- The Viewfinder section must be `position: fixed; inset: 0; z-index: 10` when active, covering the full viewport.
- The `<video>` element: `width: 100%; height: 100%; object-fit: cover; display: block;`

#### D2 — Status Indicator Bar
- A pill-shaped HUD bar anchored to the top of the viewfinder (`position: absolute; top: 12px; left: 50%; transform: translateX(-50%)`).
- Contains two status chips (Wake Lock and Camera Lock) side by side.
- Background: `--color-surface` with slight opacity (`rgba(17,17,17,0.85)`) for legibility over the video feed.
- Backdrop blur: `backdrop-filter: blur(8px)` where supported.
- Status chip: `border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 600;`

#### D3 — Confirm Button
- Positioned absolutely at the bottom of the viewfinder, full width with safe-area padding.
- Background: `--color-accent` (#C6FF00); color: `#000000`; `font-weight: 700`.
- Minimum height: `64px` (exceeds 48px minimum target).
- Disabled state: `opacity: 0.4; pointer-events: none` — the button remains disabled until the camera stream is active.

#### D4 — Error Banner
- `position: absolute; bottom: 80px` (above the Confirm button).
- Background: `--color-stop` at 20% opacity; border-left: `4px solid --color-stop`.
- `role="alert"; aria-live="assertive"` for screen reader support.
- Hidden by default (`display: none`); shown by JS error handlers.

---

### Task Group E — Stability Delay Logic
**Assignable to:** Agent E
**Depends on:** Task Group A must be complete (`camera.js` exists)
**Blocks:** Phase 4 (frame differencing must not run during the delay window)

#### E1 — Frame Skip Timer
- After `startCamera()` resolves, start a `performance.now()` timestamp.
- Expose `isCameraReady()` → returns `true` only after 2000ms have elapsed since camera start.
- This is a pure time-based check, not frame-counting, to avoid dependency on `requestAnimationFrame` tick rate.

#### E2 — Ready State Visual Feedback
- During the 2-second window, show a transient overlay text on the Viewfinder: "Stabilizing…" in `--color-text-secondary`.
- After 2 seconds, fade out the overlay and enable the Confirm button (currently disabled per D3).
- The `isCameraReady()` function must also exist as a guard for Phase 4's `requestAnimationFrame` loop — Phase 4 agents should call it before processing any frames.

---

### Task Group F — App Wiring & Integration (`js/app.js`, `index.html`)
**Assignable to:** Agent F (or the lead/orchestrating agent)
**Depends on:** Task Groups A, B, C, D, E must be complete
**Blocks:** Phase 3

This is the integration step. It should only begin after all parallel groups are finished.

#### F1 — Module Imports
- Import `camera.js`, `wakeLock.js`, `audio.js` into `app.js` using ES module syntax (`import`).
- Update the Service Worker cache list in `sw.js` to include the new JS files and `styles/viewfinder.css`. Also add `styles/viewfinder.css` to the `<link>` stylesheet list in `index.html`.
- The router exposes named exports (`showScreen`, `currentScreen`) — use these directly, not as a class instance method.

#### F2 — Navigation to Viewfinder
- **Note:** Phase 1's `js/home.js` already attaches a click handler to `#btn-start-session` that calls `showScreen('viewfinder')`. Do **not** add a second `addEventListener` for the same button. Instead, modify the existing handler in `home.js` to also call `startCamera(videoEl)` after `showScreen()`.
- On camera start success, call `acquireWakeLock()`.
- On screen hide/navigation away from viewfinder, call `stopCamera()` and `releaseWakeLock()`.

#### F3 — Milestone Test Button
- Per the Phase 2 milestone, add a temporary "Test TTS" button on the Viewfinder screen.
- On click: call `speak("RC Lap Timer is ready")` and `playBeep()`.
- This button can be removed or repurposed in Phase 3 — it exists only to satisfy the milestone verification.

#### F4 — Milestone Verification Checklist
Before closing Phase 2, manually verify:
- [x] App opens to Home Screen offline (Service Worker active)
- [x] "Start New Session" transitions to Viewfinder with live camera feed
- [x] "Screen Active" status indicator is green and confirmed via wake lock sentinel
- [x] "Camera Stabilized" indicator updates after `lockCameraSettings()` resolves
- [x] "Stabilizing…" text appears for ~2 seconds then disappears
- [x] "Confirm" button is disabled during stabilization, enabled after
- [x] "Test TTS" button triggers an audible voice announcement
- [x] Navigating away from the Viewfinder stops the camera stream (verified via camera indicator light going off)

**Phase 2 Complete ✓** — All milestone criteria verified. Proceed to Phase 3.

---

## Parallelization Map

This matrix shows which task groups can be worked simultaneously.

```
Timeline →

Sprint 1 (all parallel):
  Agent A  ──── [A1 Camera getUserMedia] ──── [A2 Video Wiring] ──── [A3 Error Handling] ──── [A4 API]
  Agent B  ──── [B1 Wake Lock] ──── [B2 Status UI] ──── [B3 ImageCapture] ──── [B4 Camera Status] ──── [B5 API]
  Agent C  ──── [C1 Web Audio Beep] ──── [C2 TTS Wrapper] ──── [C3 Lap Formatter] ──── [C4 API]
  Agent D  ──── [D1 Video CSS] ──── [D2 Status Bar CSS] ──── [D3 Confirm Button] ──── [D4 Error Banner]

Sprint 2 (depends on Sprint 1 Group A):
  Agent E  ──── [E1 Frame Skip Timer] ──── [E2 Ready State UI]

Sprint 3 (depends on ALL of Sprint 1 + Sprint 2):
  Agent F  ──── [F1 Module Imports + SW Update] ──── [F2 Navigation Wiring] ──── [F3 Test Button] ──── [F4 Verify]
```

### Agent Assignment Summary

| Agent | Task Group | Files Owned | Dependencies |
|---|---|---|---|
| Agent A | Camera Module | `js/camera.js` | Phase 1 done |
| Agent B | Wake Lock & Lock APIs | `js/wakeLock.js` | Phase 1 done |
| Agent C | Audio & Speech | `js/audio.js` | Phase 1 done |
| Agent D | Viewfinder CSS | `styles/viewfinder.css` | Phase 1 CSS tokens (`styles/tokens.css`) |
| Agent E | Stability Delay | `js/camera.js` (addendum) | Agent A done |
| Agent F | Integration & Wiring | `js/app.js`, `js/home.js`, `index.html`, `sw.js` | All groups done |

> **No agent should modify another agent's owned file.** Agent F is the sole writer of `app.js` and `index.html` during Phase 2. Agents A–E write only their own files and may read (but not modify) Phase 1 files.

---

## Constraints & Rules (from plan.md and prd.md)

- **No frameworks.** Vanilla JS only — no libraries, no bundlers, no TypeScript.
- **Camera stream stops on navigation.** Any time the user leaves the Viewfinder screen, `stopCamera()` must be called. This is a battery and privacy requirement, not optional.
- **Lazy AudioContext.** The `AudioContext` must not be created until a user gesture (click/touch) has occurred. Creating it on module load will be blocked by browsers and cause a silent failure.
- **OLED backgrounds.** All UI elements added in this phase — status bar, error banners, confirm button — must sit on `#000000` or `rgba()` overlays. No gray backgrounds.
- **48×48px minimum hit areas.** The Confirm button, Wake Lock toggle, and Test TTS button all must meet this minimum.
- **Error messages are inline, not alerts.** No `window.alert()` calls anywhere.
- **Service Worker must be updated.** `styles/viewfinder.css`, `js/camera.js`, `js/wakeLock.js`, and `js/audio.js` must be added to the SW cache list or the app will not work offline after Phase 2.
