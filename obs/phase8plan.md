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

### A3 — Fix TTS voice selection not persisting across reloads

**Files:** `app/js/audio.js`, `app/js/app.js`

**Plan:**
1. In `app.js` (or wherever init functions are called at startup), after init, call `setPreferredVoice(getSettings().ttsVoiceName)` so the preferred voice is restored from storage at every page load — not just when the user opens Settings.
2. Verify that `setPreferredVoice()` correctly resolves the voice asynchronously (voices may not be available immediately on page load — the existing `getAvailableVoices()` promise handles this; ensure the call in app.js uses it correctly).

---

## Task Group B — History Page Fixes

**Root causes identified:**
- **Scrolling:** `#screen-history` must be a flex column with `height: 100dvh; overflow: hidden` so that `flex: 1; overflow-y: auto` on `.history-list-container` actually constrains the scroll region. If the screen has no fixed height, the container grows unboundedly and sessions get pushed off-screen rather than scrolled.
- **Wrong date label:** `new Date(s.date)` where `s.date` is an ISO 8601 string (e.g., `"2026-05-22T00:00:00.000Z"`) is parsed as UTC midnight, which in timezones west of UTC becomes the previous calendar day. Sessions recorded locally appear under the prior day's date.
- **Sorting:** Confirm sessions are sorted newest-first before grouping so the newest date group appears at the top.

### B1 — Fix history list scrolling

**Files:** `app/styles/history.css`, `app/styles/global.css`

**Plan:**
1. Ensure `#screen-history` has `display: flex; flex-direction: column; height: 100dvh; overflow: hidden` (check global `.screen` class; add to `history.css` if not set).
2. Confirm `.history-list-container` has `flex: 1; overflow-y: auto; overscroll-behavior: contain` (already present — verify the parent height constraint is what's missing).
3. Test: fill history with many sessions and confirm the list scrolls without the page itself scrolling.

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
