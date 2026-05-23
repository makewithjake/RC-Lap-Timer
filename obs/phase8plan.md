# Phase 8 Plan — Bug Fixes, Feature Additions & Rebrand

> **Scope:** `app/` directory only. All tasks reference files within `app/`.  
> **Goal:** Fix all current-focus bugs, add requested features, rebrand to LapTrack, run a code quality pass, and prepare for public deployment.

---

## Overview of Task Groups

| Group | Name | Can run independently? |
|-------|------|------------------------|
| A | TTS Fixes | ✅ Yes |
| B | History Page Fixes | ✅ Yes |
| C | Lap Graph in History Detail | ✅ Yes |
| D | Home Screen Fixes | ✅ Yes |
| E | Settings Page Additions | ✅ Yes |
| F | Rebrand to LapTrack | ✅ Yes (after all content is stable) |
| G | Code Quality & Deployment Prep | ⚠️ Run last — depends on all prior groups being complete |

Groups A–E are fully independent and can be assigned to separate sub-agents running in parallel. Group F (rebrand) should run after A–E are merged so the text sweep is comprehensive. Group G runs last as a final cleanup pass.

---

## Task Group A — TTS Fixes

**Root causes identified:**
- `announceLap()` calls `speak()` with no options object, so stored `ttsVolume` and `ttsPitch` are never applied to utterances.
- No on/off toggle exists for TTS; the feature is always active.
- Voice selection: `setPreferredVoice()` works, but the `preferredVoice` module variable is not persisted across page reloads — on reload it resets to `null` before `showSettings()` can repopulate it. The voice needs to be re-applied at app startup from stored settings.

### A0 — CRITICAL: iOS VoiceOver dialog triggered by speechSynthesis startup access

**Symptom observed (device test):** With TTS **OFF**, opening Settings then navigating to the dashboard caused iOS to display a system notification alert: *"VoiceOver would like to send you notifications."* Tapping Allow caused iOS VoiceOver (the full-device screen reader) to activate and narrate every UI element. Dismissing the dialog was impossible while VoiceOver was running; a hard reboot was required.

**Root cause:** iOS Safari treats *any* programmatic access to `window.speechSynthesis` as an accessibility API call. Two code paths access `speechSynthesis` unconditionally at app startup — before any user gesture and regardless of the `ttsEnabled` setting:

1. **`initSettings()` in `settings.js`** (called from `DOMContentLoaded` in `app.js`) sets `window.speechSynthesis.onvoiceschanged = _populateVoiceList` immediately, which registers the app as a speech client with iOS.
2. **`showSettings()` in `settings.js`** calls `_populateVoiceList()` → `getAvailableVoices()` → `speechSynthesis.getVoices()` every time the Settings screen opens, again without regard for whether TTS is enabled.
3. **`app.js`** calls `setPreferredVoice(savedVoiceName)` on `DOMContentLoaded` when a voice was previously saved — `setPreferredVoice` calls `getAvailableVoices()` which accesses `speechSynthesis`.

Once iOS shows the VoiceOver system dialog, iOS's built-in screen reader takes over and reads every element on screen including button labels. The JS app cannot intercept or dismiss an OS-level modal, creating the unrecoverable state requiring a reboot.

**Files:** `app/js/settings.js`, `app/js/app.js`

**Plan:**
1. In `initSettings()`, remove the unconditional `window.speechSynthesis.onvoiceschanged = _populateVoiceList` assignment. Do not touch `speechSynthesis` at startup under any condition.
2. In `showSettings()`, gate `_populateVoiceList()` behind `getSettings().ttsEnabled` — only populate the voice list when TTS is actually on. When TTS is off, render the voice selector as disabled (or hidden).
3. In `app.js`, remove the `setPreferredVoice()` call at `DOMContentLoaded`. The preferred voice should be resolved lazily inside `announceLap()` or `speak()` at call time by reading `getSettings().ttsVoiceName` directly — not cached at startup.
4. Add a guard in `getAvailableVoices()`: check `'speechSynthesis' in window` before accessing any property (already present) but also ensure the function is never called from a non-gesture context when TTS is disabled.

**Secondary fix — iOS audio session conflict (beeps silenced when TTS ON):**

Observed: with TTS enabled, completing a lap produced no beep sound and no TTS announcement. Root cause: on iOS Safari, `speechSynthesis.speak()` claims the device audio session, which suspends the Web Audio `AudioContext`. The `AudioContext` state transitions to `'suspended'` and subsequent `playBeep()` calls are silently dropped (the `resume()` call in `getAudioContext()` is async and may not complete before the oscillator starts).

**Plan:**
1. In `announceLap()` (or at every `speak()` call site), schedule the `speak()` call after a short delay (e.g., 300 ms) so the synchronous `playBeep()` call completes first.
2. Add an `onerror` handler to `SpeechSynthesisUtterance` in `speak()` to log iOS-specific failures silently without breaking other audio.
3. After `speechSynthesis.speak()` completes (use `utterance.onend`), call `audioCtx.resume()` to restore the AudioContext for future beeps.

---

### A1 — Fix TTS volume and pitch not applying to announcements

**Files:** `app/js/audio.js`, `app/js/storage.js`

**Plan:**
1. Add a new exported function `applyStoredSettings()` (or inline in `announceLap()`) that reads `getSettings()` and passes `ttsVolume` and `ttsPitch` into every `speak()` call.
2. Modify `announceLap()` to pull `ttsVolume` and `ttsPitch` from `getSettings()` at call time and forward them to `speak()` as options.
3. Ensure all other `speak()` call sites (if any) also pass current settings.

### A2 — Add TTS on/off toggle (default OFF)

**Files:** `app/js/storage.js`, `app/index.html`, `app/js/settings.js`, `app/js/audio.js`

**Plan:**
1. Add `ttsEnabled: false` to `DEFAULT_SETTINGS` in `storage.js`. Default is `false` (OFF).
2. Add a toggle control to the Settings screen HTML (`index.html`) in the TTS section — a labeled on/off toggle using the existing `.calibration-toggle` pattern or a new `toggle-group` style.
3. Wire the toggle in `settings.js`: read from `getSettings().ttsEnabled`, render toggle state on hydration, save to settings on change.
4. In `audio.js`, guard `announceLap()` and any other TTS calls: check `getSettings().ttsEnabled` before calling `speak()`. If disabled, skip TTS silently.
5. Keep the volume slider and pitch slider visible and functional at all times (they're still useful for when TTS is enabled); just gate the actual speech on the toggle.

### A3 — Fix TTS toggle not persisting (confirmed root cause: missing saveSettings branch)

**Root cause confirmed (code inspection):** `saveSettings()` in `storage.js` has an explicit `if` branch for every setting it handles — `countdownDuration`, `ttsVoiceName`, `ttsPitch`, `ttsVolume`, `units` — but **there is no branch for `ttsEnabled`**. When the toggle click handler calls `saveSettings({ ttsEnabled: next })`, the `ttsEnabled` key is ignored and the stored value is never updated. `getSettings()` then always returns the default (`false`).

**Test observation:** "Opened settings, toggled TTS to ON, closed settings, reopened and toggle was set to OFF" — consistent with `ttsEnabled` being silently discarded on every save.

**Files:** `app/js/storage.js`

**Plan:**
1. Add a branch in `saveSettings()` for `ttsEnabled`:
   ```js
   if (partial.ttsEnabled !== undefined) {
     merged.ttsEnabled = Boolean(partial.ttsEnabled);
   }
   ```
2. No other changes needed — the toggle's read/write logic in `settings.js` is otherwise correct.

### A3b — Fix TTS voice selection not persisting across reloads

**Files:** `app/js/audio.js`, `app/js/app.js`

**Plan:**
1. Remove the `setPreferredVoice()` call from `app.js` `DOMContentLoaded` (this is also part of the iOS VoiceOver fix in A0).
2. Instead, resolve the voice lazily inside `speak()`: at the top of `speak()`, if `preferredVoice` is null and `getSettings().ttsVoiceName` is non-empty, call `setPreferredVoice()` once to populate the cached voice (this still happens asynchronously, so the first utterance after a reload may use the system default, but subsequent ones use the correct voice).
3. Alternatively, store `preferredVoice` resolution inside `announceLap()` by reading `getSettings().ttsVoiceName` each time and passing it as the `voice` option to `speak()` so no startup initialization is needed.

---

## Task Group B — History Page Fixes

**Root causes identified:**
- **Scrolling:** `#screen-history` must be a flex column with `height: 100dvh; overflow: hidden` so that `flex: 1; overflow-y: auto` on `.history-list-container` actually constrains the scroll region. If the screen has no fixed height, the container grows unboundedly and sessions get pushed off-screen rather than scrolled.
- **Wrong date label:** `new Date(s.date)` where `s.date` is an ISO 8601 string (e.g., `"2026-05-22T00:00:00.000Z"`) is parsed as UTC midnight, which in timezones west of UTC becomes the previous calendar day. Sessions recorded locally appear under the prior day's date.
- **Sorting:** Confirm sessions are sorted newest-first before grouping so the newest date group appears at the top.

### B1 — Fix history list scrolling

**Root cause confirmed (code inspection):** `.session-card` in `history.css` has `touch-action: none`. This instructs iOS Safari to hand all touch events entirely to JavaScript and perform no default browser behavior — including no scroll. When the user touches a session card, the browser hands the touch to the JS event handler; the handler doesn't propagate a scroll gesture to the container, so the list cannot scroll via touches on session card elements. Touches in the gaps between cards (or on the screen edges) hit the `.history-list-container` directly and scroll correctly — matching the observed symptom exactly.

**Files:** `app/styles/history.css`

**Plan:**
1. Change `touch-action: none` to `touch-action: pan-y` on `.session-card`. This allows vertical panning (scroll) to pass through to the native scroll handler while still letting JS intercept horizontal swipes (for potential swipe-to-delete).
2. Remove `user-select: none` only if it is not needed for swipe UX — keep it to prevent text selection during swipe gestures.
3. Verify the swipe-to-delete (long-press / select flow) still works after this change.

### B2 — Fix date grouping (sessions appearing under wrong date)

**Files:** `app/js/history.js`, `app/js/storage.js`

**Plan:**
1. In `buildSessionRecord()` (storage.js), store the session date as a local-timezone ISO string rather than UTC. Use a local date string for the date portion: derive the label from `new Date()` using local time components, or store `date` as `new Date().toLocaleDateString('en-CA')` (YYYY-MM-DD in local time) so the date always matches the user's wall-clock day.
2. Update `_groupByDate()` in history.js: when constructing `new Date(s.date)` from a date-only string (no time component), append `T00:00:00` to force local-time interpretation: `new Date(s.date + 'T00:00:00')`.
3. Re-verify the sort order: `getHistory()` should return sessions sorted newest-first. Confirm this is the case (or add explicit sort in `renderSessionList()`).

### B3 — Confirm delete restores visibility (regression guard)

**Files:** `app/js/history.js`

**Plan:**
1. Trace the delete → `renderSessionList()` re-render path and confirm there are no stale DOM nodes left over from prior renders (e.g., orphaned date header `h2` elements injected with `listEl.before(header)` but not cleared on re-render).
2. Fix the date header injection: currently headers are injected with `listEl.before(header)` which inserts them outside `listEl` but inside `history-list-container`. On re-render, `listEl.innerHTML = ''` clears the `ul` but leaves old `h2` headers in the container. The code does attempt `containerEl.querySelectorAll('.history-date-header').forEach(el => el.remove())` — confirm this is executing for all re-render paths, not just the first render.

---

## Task Group C — Lap Graph in History Session Detail Modal

**Root causes identified:**
- The session detail modal (`#session-detail-modal`) in `index.html` has a stats table and lap table but no SVG chart element. The `renderChart()` function already exists in `summary.js` and is ready to reuse.
- The `LapRecord` schema stores `lapTimeMs` (not `lapTime` as in summary.js). `renderChart()` expects `{ lapTime, lapNumber }`. The data shape must be mapped.

### C1 — Add chart SVG to session detail modal

**Files:** `app/index.html`, `app/styles/history.css`

**Plan:**
1. Add an `<svg>` element inside `.session-detail-card` in the modal, after the stats row and before the lap table. Give it `id="detail-chart"` and class `summary-chart` (reuse existing chart CSS from `styles/summary.css`).
2. Add minimal CSS in `history.css` to size the chart within the modal card (e.g., `width: 100%; max-height: 180px`).

### C2 — Render chart when session detail modal opens

**Files:** `app/js/history.js`, `app/js/summary.js`

**Plan:**
1. Import `renderChart` from `summary.js` in `history.js`.
2. When the session detail modal is populated (wherever `detail-best-lap`, `detail-avg-lap`, etc. are written), also call `renderChart()` on the `#detail-chart` SVG element, mapping the session's `laps` array: `laps.map(l => ({ lapTime: l.lapTimeMs, lapNumber: l.lapNumber }))`.
3. Pass `session.bestLapMs` as the third argument so the best-lap dot gets highlighted.

---

## Task Group D — Home Screen Fixes

**Root causes identified:**
- **Title centering:** `.home-title-area` has `padding-right: 56px` to avoid overlapping the absolutely-positioned gear button, but this shifts the visual center of the title to the left. The correct fix is to not offset the title container — instead let the gear button float independently without affecting title layout.
- **Clear button:** No such button exists yet.

### D1 — Fix home screen title centering

**Files:** `app/styles/home.css`, `app/index.html`

**Plan:**
1. Remove `padding-right: 56px` from `.home-title-area` in `home.css`.
2. The gear button is `position: absolute; top: ...; right: ...` and does not participate in flow, so the title area will naturally center once the padding override is removed.
3. Verify on narrow screens that the title does not overlap the gear icon (the icon is 48px wide at top-right; the title is short enough that this should not be an issue).

### D2 — Add "Clear" button to home form

**Files:** `app/index.html`, `app/styles/home.css`, `app/js/home.js`

**Plan:**
1. Add a small `<button id="btn-clear-fields">Clear</button>` element to the home screen, positioned below or beside the form fields and above the nav buttons. Use a ghost/secondary style to keep it visually subordinate to "Start New Session."
2. In `home.js`, wire a click listener on `#btn-clear-fields` that:
   - Sets all four input values to `''`.
   - Removes the corresponding `localStorage` keys (`rc_driverName`, `rc_carName`, `rc_location`, `rc_setupNotes`).
3. Add minimal CSS for the button — it should be compact, not full-width like the primary buttons.

---

## Task Group E — Settings Page Additions

Both sub-tasks are independent of each other and can be done in a single pass.

### E1 — Add Contact / Bug Report link to settings

**Files:** `app/index.html`, `app/styles/settings.css`

**Plan:**
1. Add a new `settings-group` div at the bottom of `.settings-body` (above the about/version group) containing a styled link: `<a href="mailto:jake@makewithjake.net?subject=LapTrack%20Bug%20Report">Report a Bug / Contact</a>`.
2. Style the link as a secondary button or a plain text link with the accent color, consistent with the existing settings design language.
3. No JS needed — a plain `<a>` tag handles this entirely.

### E2 — Add copyright notice to settings

**Files:** `app/index.html`, `app/styles/settings.css`

**Plan:**
1. In the existing `.settings-about` group (which already has `.about-version` and `.about-offline-status`), add a third `<p>` with class `about-copyright`: `© Make with Jake LLC`.
2. Style `.about-copyright` in `settings.css` with small muted text, consistent with `.about-version`.

---

## Task Group F — Rebrand to LapTrack

> **Dependency:** Run after Groups A–E are complete so a single sweep covers all new/modified text.

### F1 — Replace all "RC Timer" / "RC Lap Timer" references in the app

**Files:** `app/index.html`, `app/manifest.json`, `app/sw.js`, `app/js/*.js`, `app/styles/*.css`

**Additional confirmed location (testing):** `styles/landing.css` (root-level, not under `app/`) contains `RC Lap Timer — Marketing Landing Page Stylesheet` in its file header comment (line 2). This is outside the `app/` directory but is part of the public-facing site. Change to `LapTrack — Marketing Landing Page Stylesheet`.

**Plan:**
1. Perform a full-text search across all `app/` files for the following strings (case-insensitive): `RC Timer`, `RC Lap Timer`, `rc-lap-timer`, `rc_lap_timer`.
2. Replace with:
   - Display name: **LapTrack**
   - Tagline/subtitle (if used): keep consistent with branding
3. Specific known locations:
   - `app/index.html` `<title>RC Lap Timer</title>` → `<title>LapTrack</title>`
   - `app/index.html` `<h1 class="home-title">RC Timer</h1>` → `<h1 class="home-title">LapTrack</h1>`
   - `app/index.html` settings about section: `RC Lap Timer · v1.0.0` → `LapTrack · v1.0.0`
   - `app/manifest.json`: `name`, `short_name` fields
   - Any `console.log` / `console.warn` prefixes using old app name
   - `styles/landing.css` file header comment (root level, line 2)
4. Update domain references: replace any instance of the old domain with `LapTrack.app`.
5. Update the `<meta name="apple-mobile-web-app-title">` tag if present.

### F2 — Update plan.md (move completed tasks)

**File:** `plan.md` (root)

**Plan:**
1. Move all items currently listed under "Current Focus – Next Sprint" to a new "Completed — Phase 8" section in `plan.md` once the corresponding code task is complete.
2. Leave "Future Tasks" untouched.

---

## Task Group G — Code Quality & Deployment Prep

> **Dependency:** Run last, after Groups A–F are merged.  
> **Note:** This group can be assigned to a sub-agent for analysis, but the agent should return a report for human review before any deletions are made.

### G1 — Audit for unused exports and dead code

**Files:** All `app/js/*.js`

**Plan:**
1. Trace every `export` in every JS module and confirm it has at least one import site.
2. Identify functions that are defined but never called.
3. Check for commented-out code blocks that are no longer relevant.
4. Produce a list of candidates for removal; do not delete until reviewed.

### G2 — Verify best practices

**Checklist:**
- [ ] No `alert()`, `confirm()`, or `prompt()` calls (use inline banners instead — already a project rule).
- [ ] No `setInterval()` in pixel-processing paths (already a project rule).
- [ ] All user-supplied strings rendered via `_escapeHtml()` or DOM `.textContent` (not `.innerHTML`) to prevent XSS.
- [ ] `localStorage` reads are guarded against `null` with `?? ''` or `?? default`.
- [ ] Service worker cache version is bumped if any cached assets changed.
- [ ] No hardcoded development-only URLs or `localhost` references.
- [ ] `console.log` calls appropriate for production (remove verbose debug logs; keep `console.warn`/`console.error`).

### G3 — Deployment readiness

**Files:** `app/index.html`, `app/manifest.json`, `app/sw.js`

**Plan:**
1. Verify all `<meta>` tags are correct: `theme-color`, `apple-mobile-web-app-capable`, `description`.
2. Add `<meta name="description" content="...">` if missing.
3. Confirm `manifest.json` has correct `start_url`, `display: standalone`, `background_color`, `theme_color`, and all icon sizes.
4. Bump the SW cache version string so existing installs pick up the new build.
5. Verify `robots.txt` and `CNAME` are correct for the new LapTrack.app domain.

---

## Detailed Test Plan

Run this checklist after all task groups are implemented. Test on a real mobile device (iOS Safari is the primary target) and also in Chrome DevTools mobile simulation.

### Pre-Test Setup
- [ ] Clear app data (Settings → Clear All Data) before each test section to ensure a clean state.
- [ ] Install the app as a PWA (Add to Home Screen) for at least one test run.

---

### Section 1 — TTS (Group A)

| # | Test | Expected Result |
|---|------|-----------------|
| T-A1 | Open Settings. Confirm TTS toggle is visible and defaults to **OFF** on a fresh install. | Toggle shows "Off" / inactive state. |
| T-A2 | With TTS OFF, complete a session with several laps. | No voice announcements are made during the session. |
| T-A3 | Open Settings. Enable TTS toggle. | Toggle shows "On" / active state and setting persists after closing and re-opening Settings. |
| T-A4 | With TTS ON, complete a session. On each lap crossing, a voice announcement plays. | Announcement is heard, matches the lap number and time. |
| T-A5 | In Settings, set Voice Volume to 0.3. Complete a lap. | Announcement is noticeably quieter than at 1.0. |
| T-A6 | In Settings, set Voice Pitch to 0.5. Complete a lap. | Announcement voice is noticeably lower-pitched. |
| T-A7 | In Settings, select a non-default voice from the voice list. Close Settings. Complete a lap. | Announcement uses the selected voice. |
| T-A8 | Kill and reopen the app. Open Settings. Confirm selected voice is still shown and TTS enable state is preserved. | Settings persist across reload. |
| T-A9 | Select "System Default" voice. Complete a lap. | System default voice is used with no errors. |

---

### Section 2 — History Page (Group B)

| # | Test | Expected Result |
|---|------|-----------------|
| T-B1 | Record 10+ sessions. Open History. | All sessions are visible; the list scrolls smoothly. No sessions are clipped or pushed off-screen. |
| T-B2 | Record a session today. Open History. Confirm it appears under today's date. | Date label matches today's local calendar date (not yesterday). |
| T-B3 | Record sessions on two different days (or manually adjust system clock). Open History. | Sessions appear under the correct date headings, newest date at top. |
| T-B4 | Delete a session from the list. | Session is removed; remaining sessions are still fully visible and correctly ordered. No orphaned date headers remain. |
| T-B5 | Delete all sessions in a date group. | The orphaned date header for that group is removed from the DOM. |
| T-B6 | Filter using the search bar. | Matching sessions are shown; non-matching are hidden. Scroll still works with filtered list. |

---

### Section 3 — Lap Graph in History (Group C)

| # | Test | Expected Result |
|---|------|-----------------|
| T-C1 | Record a session with 3+ laps. Open History. Tap on the session card. | Session detail modal opens and displays a lap time chart above the lap table. |
| T-C2 | In the session detail modal, verify the best lap dot is visually distinct (highlighted). | Best lap dot uses the `chart-dot--best` style (accent color). |
| T-C3 | Open a session with only 1 lap. | Chart renders a single centered dot; no errors. |
| T-C4 | Close and reopen the session detail modal. | Chart renders correctly each time without duplicating SVG elements. |
| T-C5 | Open a session detail modal so the chart appears. Close the modal with the × button. Immediately tap the **same session card** to reopen it. In DevTools Elements panel, count `<svg>` children inside `#detail-chart`. | Exactly **one** `<svg>` is present. No doubled or offset lines in the chart. The chart looks identical to the first open. |
| T-C6 | Find two sessions with clearly different lap counts or best-lap times. Open session A — note the dot count, highlighted dot position, and best-lap time. Close. Open session B. | Session B's dot count matches its own lap count; the highlighted dot is session B's best lap; all stats show session B's values. No carryover data from session A. |

---

### Section 4 — Home Screen (Group D)

| # | Test | Expected Result |
|---|------|-----------------|
| T-D1 | Open the home screen. Verify the "LapTrack" title is horizontally centered. | Title appears centered under the gear icon, not shifted left. |
| T-D2 | Confirm the gear icon (top-right) does not overlap the title on narrow screens (320px wide). | No overlap; gear floats in corner independently. |
| T-D3 | Enter text in all four fields (Driver, Car, Location, Notes). Tap "Clear." | All four fields are cleared to empty. Reloading the page confirms localStorage values are gone. |
| T-D4 | Start a session after using Clear. Confirm empty fields do not cause errors. | Session starts normally; blank fields are handled gracefully. |

---

### Section 5 — Settings Additions (Group E)

| # | Test | Expected Result |
|---|------|-----------------|
| T-E1 | Scroll to the bottom of Settings. A "Report a Bug / Contact" link is visible. | Link is visible and accessible. |
| T-E2 | Tap the "Report a Bug / Contact" link. | Device's email client opens with `jake@makewithjake.net` pre-filled in the To field and a relevant subject line. |
| T-E3 | Scroll to the bottom of Settings. "© Make with Jake LLC" copyright text is visible. | Copyright text is present, styled in muted small text. |

---

### Section 6 — Rebrand (Group F)

| # | Test | Expected Result |
|---|------|-----------------|
| T-F1 | Open the app. Verify the home screen title reads "LapTrack." | Title is "LapTrack," not "RC Timer" or "RC Lap Timer." |
| T-F2 | Check browser tab / PWA title bar. | Reads "LapTrack." |
| T-F3 | Open Settings. Verify about section reads "LapTrack · v1.0.0." | Correct brand name. |
| T-F4 | Install as PWA. Verify the home screen icon label reads "LapTrack." | Correct short name from manifest. |
| T-F5 | Search all `app/` source files for "RC Timer" and "RC Lap Timer." | Zero matches. |

---

### Section 7 — Full Regression (Post All Groups)

These tests confirm that prior functionality was not broken.

| # | Test | Expected Result |
|---|------|-----------------|
| T-R1 | Start a session: draw a finish line, calibrate, tap Confirm. | Session starts normally; dashboard shows 0:00.00. |
| T-R2 | Drive car through line (or use LED test mode). | Lap is detected; dashboard updates; beep plays. |
| T-R3 | End session. | Summary screen appears with correct lap count, best lap, chart. |
| T-R4 | View History from summary. Previous session appears. | History screen shows the new session. |
| T-R5 | Settings → Clear All Data. Confirm. Return to Home. | All fields are blank; history is empty. |
| T-R6 | App works offline after initial load (PWA). | No network required after first visit. |
| T-R7 | Wake lock activates during a session; screen does not dim. | Wake Lock chip shows locked state. |
| T-R8 | Reload page mid-session (simulate accidental reload). | App returns to Home cleanly; no JS errors in console. |
| T-R9 | Open DevTools Console during full session. | Zero unhandled errors or uncaught promise rejections. |

---

## Sub-Agent Assignment Guide

When using parallel sub-agents, assign as follows:

| Sub-Agent | Groups | Key files to touch |
|-----------|--------|--------------------|
| Agent 1 | A (TTS Fixes) | `audio.js`, `storage.js`, `settings.js`, `index.html` (settings section) |
| Agent 2 | B (History Fixes) | `history.js`, `storage.js`, `history.css` |
| Agent 3 | C (Lap Graph) | `history.js`, `index.html` (modal section), `history.css` |
| Agent 4 | D (Home Fixes) | `home.js`, `home.css`, `index.html` (home section) |
| Agent 5 | E (Settings Additions) | `index.html` (settings section), `settings.css` |

**After Agents 1–5 complete:** Run Agent 6 for Group F (rebrand sweep), then Agent 7 for Group G (code quality).

**Merge order:** Agents 1–5 can merge in any order. Agent 6 merges after all of them. Agent 7 merges last.

**File conflicts to watch:** `index.html` and `storage.js` are touched by multiple agents — coordinate or split responsibilities by HTML section and JS function to minimize merge conflicts. `storage.js` is modified by Agent 1 (add `ttsEnabled`) and Agent 2 (fix date storage) — these are in different functions and should not conflict.

---

## plan.md Updates

After each group is implemented and tested, move the corresponding item from "Current Focus – Next Sprint" to a new `## Completed — Phase 8` section in `plan.md`. Items to move (in order of expected completion):

1. TTS volume / on-off toggle bug → after Group A
2. TTS language selection bug → after Group A
3. History page scrolling + date bug → after Group B
4. Lap graph in history → after Group C
5. Homepage title centering → after Group D
6. Clear button on home → after Group D
7. Contact/bug report on settings → after Group E
8. Copyright on settings → after Group E
9. Rebrand to LapTrack / LapTrack.app → after Group F
10. Code quality pass → after Group G

---

## Phase 8 Verification Checklist

Work through this checklist top-to-bottom after all code is deployed. Test on a real iOS device (Safari PWA) as the primary target. Use Chrome DevTools mobile simulation for a secondary pass. Check each box only when you have personally observed the expected behaviour.

**Before starting:** Go to Settings → Clear All Data to ensure a fresh state.

---

### A — TTS

- [ x] **A-1 Default off:** Fresh install (or after Clear All Data). Open Settings → TTS section. The TTS toggle reads "Off" and is visually inactive.
- [ x] **A-2 No speech when off:** With TTS off, complete a 3-lap session. Zero voice announcements at any point.
- [ ] **A-3 Toggle persists:** Enable TTS in Settings. Close Settings. Re-open Settings. Toggle still reads "On."
- [ ] **A-4 Toggle persists across reload:** Enable TTS. Kill the app and reopen. Open Settings. Toggle is still "On."
- [ ] **A-5 Announcements play:** With TTS on, complete a lap. You hear a spoken announcement (lap number and/or time).
- [ ] **A-6 Volume setting works:** Set Voice Volume to 0.3. Complete a lap. Announcement is clearly quieter than at 1.0.
- [ ] **A-7 Pitch setting works:** Set Voice Pitch to 0.5. Complete a lap. Announcement voice is noticeably lower-pitched than at 1.0.
- [ ] **A-8 Voice selection persists:** Select a non-default voice. Close Settings. Complete a lap. The announcement uses that voice. Kill and reopen the app — the same voice is still selected in Settings.
- [ ] **A-9 System default voice:** Select "System Default." Complete a lap. No errors; default system voice speaks.
- [ ] **A-10 Volume/pitch sliders always visible:** Whether TTS is on or off, the volume slider and pitch slider are visible and adjustable (they are not hidden behind the toggle state).

---

### B — History Page

- [ ] **B-1 List scrolls:** Record 10+ sessions (or use the dev console to seed fake history). Open History. All sessions appear; the list scrolls smoothly inside the screen — the page itself does not scroll.
- [ ] **B-2 No sessions pushed off-screen:** The last session in the list is reachable by scrolling within the list container.
- [ x] **B-3 Today's date correct:** Record a session right now. Open History. The session appears under today's calendar date (e.g., "May 23") — not yesterday.
- [ x] **B-4 Newest-first order:** The most recent session is at the top of the list; the oldest is at the bottom.
- [ ] **B-5 Newest date group at top:** If you have sessions from multiple days, the most recent date heading is the first one you see.
- [x ] **B-6 Delete removes session:** Tap a session → Delete. The session is gone from the list. All remaining sessions are still fully visible.
- [ ] **B-7 No orphaned date headers after delete:** After deleting the only session in a date group, that date heading is also removed. No stale `h2` elements linger.
- [ ] **B-8 Delete last session in list:** Delete the very last remaining session. History shows an empty state (no broken UI, no empty `ul` with a dangling header).
- [ x] **B-9 Search filter:** Type a driver name in the search bar. Only matching sessions show. Scroll still works with the filtered list.
- [ x] **B-10 Clear search:** Clear the search bar. All sessions re-appear.

---

### C — Lap Graph in Session Detail

- [ x] **C-1 Chart appears:** Record a session with 3+ laps. Open History. Tap the session card. The session detail modal opens and shows a lap time chart above the lap table.
- [ x] **C-2 Best lap highlighted:** In the chart, the dot for the best lap is visually distinct (accent color / different size).
- [ x] **C-3 Chart fills container:** The chart spans the full width of the modal card. It does not overflow or get clipped.
- [ x] **C-4 Single-lap session:** Open a session with only 1 lap. Chart renders a single dot without errors. No JS exceptions in the console.
- [ ] **C-5 No duplicate SVG elements on re-open:** Open any session in History and confirm its chart appears. Tap the **×** button (or back) to close the modal. Immediately tap the **same session card** again to reopen it. Look at the chart — it should appear identical to the first open. To verify: in Safari DevTools (or Chrome DevTools with Remote Debugging), open the Elements panel and inspect the `#detail-chart` element. It must contain exactly **one** `<svg>` child. If two SVGs are stacked, you will see the chart lines doubled or offset, indicating the old SVG was not cleared before re-rendering.
- [ ] **C-6 Different sessions show different data:** You need at least two sessions with different lap counts or clearly different best-lap times. Open session A's detail modal and note: (1) the number of dots on the chart, (2) which dot is highlighted as best lap, (3) the best-lap time shown in the stats. Close the modal. Now open session B's detail modal. Verify: (1) the dot count matches session B's lap count, (2) the highlighted dot matches session B's best lap, (3) all stats reflect session B. No data from session A should appear in session B's view.

---

### D — Home Screen

- [x ] **D-1 Title centered:** Open the home screen. "LapTrack" title text is horizontally centered on screen — not shifted to the left.
- [ x] **D-2 Gear icon does not overlap title:** On the narrowest test device (or DevTools at 320px wide), the gear icon in the top-right corner does not visually overlap the title text.
- [ x] **D-3 Clear button visible:** Below the form fields and above the nav buttons, a "Clear" button is visible. It is smaller/subordinate in style compared to the primary "Start New Session" button.
- [ x] **D-4 Clear wipes all fields:** Enter text in Driver, Car, Location, and Notes fields. Tap "Clear." All four fields are empty immediately.
- [ x] **D-5 Clear wipes localStorage:** After tapping "Clear," reload the page. All four fields are still empty (values are not restored from storage).
- [ x] **D-6 Session after clear works:** Tap "Start New Session" after clearing. The session starts normally — no errors from blank fields.

---

### E — Settings Additions

- [ x] **E-1 Bug report link visible:** Scroll to the bottom of the Settings screen. A "Report a Bug / Contact" link (or button-style link) is visible above the about section.
- [ x] **E-2 Bug report link works:** Tap the link. Your device's email client opens with `jake@makewithjake.net` pre-filled in the To field and a subject line mentioning LapTrack.
- [x ] **E-3 Copyright text visible:** At the very bottom of Settings, "© Make with Jake LLC" is displayed in small, muted text.
- [x ] **E-4 Copyright text style:** The copyright text is noticeably smaller and more muted in color than the primary body text — it should feel like a footer note.

---

### F — Rebrand

- [x ] **F-1 Home title:** The home screen title reads "LapTrack" — not "RC Timer," "RC Lap Timer," or any variant.
- [ x] **F-2 Browser tab / PWA title bar:** The browser tab (or PWA window title bar) reads "LapTrack."
- [ x] **F-3 Settings about text:** The about section in Settings reads "LapTrack · v1.0.0" (or current version number).
- [ x] **F-4 PWA install name:** Install the app via "Add to Home Screen" (iOS) or the install prompt (Chrome). The home screen icon label reads "LapTrack."
- [ x] **F-5 No old brand names in source:** Open DevTools → Sources (or do a file search) and confirm zero occurrences of "RC Timer" or "RC Lap Timer" in any file under `app/`.

---

### G — Code Quality & Deployment

- [ ] **G-1 No console errors on load:** Open the app in Chrome with DevTools open. Console is clean — no red errors, no uncaught promise rejections on page load.
- [ ] **G-2 No console errors during session:** Run a complete session (start → detect laps → end → view summary). Console stays clean throughout.
- [ ] **G-3 No verbose debug logs:** Console does not spam per-frame or per-lap `console.log` messages during normal use.
- [ ] **G-4 SW cache bumped:** Open DevTools → Application → Service Workers. Confirm the new service worker has activated (not waiting). If prompted, click "Skip Waiting" or reload twice.
- [ ] **G-5 Offline works:** Load the app, then go to DevTools → Network → Offline. Reload the page. The app still loads fully from the service worker cache.
- [ ] **G-6 Meta description present:** View Page Source (`⌘U` in Chrome). Confirm a `<meta name="description">` tag is present with LapTrack content.
- [ ] **G-7 Apple PWA meta tags present:** In Page Source, confirm `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, and `apple-mobile-web-app-status-bar-style` are all present.

---

### Full Regression Pass

Run these after all group-specific checks pass.

- [ ] **R-1 Session start to finish:** Draw finish line → calibrate → Confirm → drive car through line (or LED test) → laps count correctly → End Session → Summary appears with correct data.
- [ ] **R-2 Summary data correct:** Summary shows correct lap count, best lap time, average lap time, and a chart with one dot per lap.
- [ ] **R-3 History from summary:** Tap "View History" on the Summary screen. The just-completed session appears at the top of the History list.
- [ ] **R-4 Session detail from history:** Tap the new session in History. The detail modal opens showing stats, a chart, and a lap-by-lap table — all with correct values.
- [ ] **R-5 Settings round-trip:** Change every setting (sensitivity, debounce, TTS toggle, volume, pitch, voice, beep). Close Settings. Reopen Settings. All values are exactly what you set.
- [ ] **R-6 Clear All Data:** Settings → Clear All Data → Confirm. Return to Home. All fields are blank. Open History — it is empty. Open Settings — all values are back to defaults (TTS off, volume 1.0, pitch 1.0, system default voice).
- [ ] **R-7 Wake lock:** Start a session. The screen does not dim or lock during active detection (wake lock is active).
- [ ] **R-8 Navigation:** Tap through every screen (Home → Session → Dashboard → Summary → History → Settings) and back. No broken navigation, no blank screens, no JS errors.
- [ ] **R-9 Back navigation from History:** Open a session detail modal. Tap the close/back control. You are returned to the History list with the correct scroll position.
- [ ] **R-10 Reload recovery:** Start a session, then hard-reload the page (`⌘R`). App returns to the Home screen cleanly — no frozen UI, no error overlays, no JS exceptions.
- [ ] **R-11 PWA install + offline:** Install as PWA. Disconnect from network. Open the installed app. Full functionality works (camera, lap detection, history all local — no server needed).
- [ ] **R-12 Zero unhandled errors:** Run the entire regression pass with DevTools Console open. At the end, confirm zero unhandled errors and zero uncaught promise rejections were logged.
