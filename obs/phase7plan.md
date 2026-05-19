# Phase 7 – UX Polish & Bug Fixes

## Overview
Eight targeted changes spanning navigation, data capture, calibration UX, and audio feedback. Most changes are independent and can be implemented in parallel across multiple subagents.

---

## Changes

### 7.1 – Back Swipe on Viewfinder Returns to Home Screen
**Problem:** Swiping back while on the Viewfinder screen exits the app and returns the user to the phone's home screen instead of the app's Home Screen.

**Root Cause:** The browser/WebView handles the `popstate` / `History` API naturally. The app has no interception logic on the Viewfinder screen.

**Implementation:**
- In `app/js/app.js` (or a new `navigation.js`), push a synthetic history entry with `history.pushState({ screen: 'viewfinder' }, '')` immediately when the Viewfinder screen is shown.
- Add a `window.addEventListener('popstate', handler)` that fires when the user swipes back.
- In the `popstate` handler: check if `currentScreen() === 'viewfinder'`. If so:
  1. Call `clearLine()` to reset the canvas drawing in `viewfinder.js`.
  2. Call `stopCamera()` from `camera.js` to kill the stream.
  3. Call `releaseWakeLock()` from `wakeLock.js`.
  4. Call `showScreen('home')` / `showHome()` from `router.js` / `home.js`.
  5. Push another history entry to re-arm the trap for the next viewfinder visit.
- The same guard should be applied when the Countdown or Dashboard screens are active (user should not swipe back mid-race — the `popstate` handler should ignore the swipe or redirect to Home after stopping the session).
- **Files touched:** `app/js/app.js`, `app/js/viewfinder.js` (export `clearLine` if not already public), `app/js/router.js` (possibly add a `onScreenChange` hook).

---

### 7.2 – "Setup Notes" Field on Home Screen
**Problem:** Users have no way to record configuration notes (e.g., spring rate, motor timing) that are contextually tied to a session.

**Implementation:**

#### Home Screen (7.2a)
- In `app/index.html`, add a `<textarea>` or `<input type="text">` with id `input-setup-notes` below the `#input-location` field, inside the existing form group.
- Label: **"Setup Notes"**, placeholder: *"e.g., 17.5T motor, stock springs"*.
- In `app/js/home.js`, read/write `localStorage` key `rc_setupNotes` on blur (same pattern as `saveOnBlur()`).
- In `app/styles/home.css`, add styling consistent with other input fields.

#### Session Storage (7.2b)
- When a session is saved (in `session.js` or wherever sessions are committed to `localStorage`), include `setupNotes: localStorage.getItem('rc_setupNotes') || ''` in the session JSON object.

#### History Detail View (7.2c — see also 7.3)
- The Setup Notes value stored in each session record will be surfaced in the race detail view described in change 7.3.

---

### 7.3 – Tap a Race in History to View Race Details
**Problem:** Currently, tapping a session card in History does nothing (only long-press triggers delete). Users cannot view race details.

**Implementation:**
- In `app/js/history.js`, add a `click` event listener on `.session-card` elements (guard against triggering when the long-press delete chip is open, and cancel if pointer moved > 8px, matching existing long-press threshold).
- On tap, open a detail modal (or a new `screen-session-detail` section) populated with:
  - **Header:** Car Name + Driver Name
  - **Metadata row:** Date, Location
  - **Setup Notes** (from session record — may be empty, show "No notes" placeholder)
  - **Lap table:** Lap #, Lap Time, Gap from best (same format as dashboard)
  - **Stats:** Best Lap, Average Lap, Total Time
  - **Close button:** Dismisses the modal / returns to History list
- Implement as a bottom-sheet modal (overlay) rather than a new screen to avoid router complexity. Add class `.session-detail-modal` in `app/styles/history.css`.
- In `app/index.html`, add the modal markup inside `#screen-history` (hidden by default with `hidden` attribute).
- **Files touched:** `app/js/history.js`, `app/index.html`, `app/styles/history.css`.

---

### 7.4 – Reorder Calibration Sliders (Sensitivity → Zone Width → Debounce)
**Problem:** The current slider order places Zone Width below Debounce, disrupting the calibration workflow. The correct order is Sensitivity → Zone Width → Debounce.

**Note on current order:** The stated desired order is **Sensitivity → Zone Width → Debounce** (Zone Width moves above Debounce).

**Implementation:**
- In `app/index.html`, reorder the three slider `<div>` blocks inside `.calibration-panel` so they appear in this order:
  1. `#slider-sensitivity` group
  2. `#slider-zone-width` group
  3. `#slider-debounce` group
- No JavaScript changes are required — slider IDs and JS logic are order-independent.
- No CSS changes are required.
- **Files touched:** `app/index.html` only.

---

### 7.5 – Help Popup on Viewfinder Screen
**Problem:** First-time users do not know the steps required before pressing Confirm.

**Implementation:**
- In `app/index.html`, add a help icon button (`?` or `ℹ`) in the top-right corner of the Viewfinder HUD bar (near the `#btn-clear-line` button area). Use id `btn-viewfinder-help`.
- Add a modal overlay with id `viewfinder-help-modal` containing:
  - **Title:** "How to Set Up"
  - **Step list:**
    1. Tap two points on the screen to draw your start/finish line.
    2. Drive your car through the line and adjust Sensitivity, Zone Width, and Debounce until the screen flashes green on each pass.
    3. Set Delayed Start duration and Goal Laps (optional).
    4. Tap **Confirm** to start the race!
  - **Close button:** Dismisses the modal (id `btn-help-close`).
- In `app/js/viewfinder.js`, wire `#btn-viewfinder-help` click → show modal (remove `hidden`), and `#btn-help-close` click → hide modal (add `hidden`).
- Style the modal in `app/styles/viewfinder.css`: full-screen overlay with semi-transparent dark background, centered card with Electric Lime accents on step numbers.
- **Files touched:** `app/index.html`, `app/js/viewfinder.js`, `app/styles/viewfinder.css`.

---

### 7.6 – Remove Round LED Indicator from Viewfinder
**Problem:** The circular Virtual LED indicator (`#virtual-led`) in the lower-right of the Viewfinder is redundant with the full-screen green flash. It adds visual clutter.

**Keep:** The full-screen `.detection-flash` overlay (green screen-wide flash) and any text/chip that labels "Motion Detected".

**Remove:**
- In `app/index.html`, delete the `<div id="virtual-led" ...>` element entirely.
- In `app/styles/viewfinder.css`, delete the `.virtual-led`, `.virtual-led[data-state="active"]`, and `.virtual-led[data-state="triggered"]` rule blocks.
- In `app/js/viewfinder.js` (or wherever the LED `data-state` is set), remove any code that references `document.getElementById('virtual-led')` or sets its `data-state`. The full-screen flash and motion-detected chip logic should remain untouched.
- **Files touched:** `app/index.html`, `app/styles/viewfinder.css`, `app/js/viewfinder.js` (reference removal only).

---

### 7.7 – "Lap Start Audio" Setting + Dashboard Announcement
**Problem:** When the first car crossing starts the master timer, there is no TTS announcement. Users want a configurable phrase spoken at that moment.

**Implementation:**

#### Settings Page (7.7a)
- In `app/index.html`, add a new settings row inside `#screen-settings` containing:
  - Label: **"Lap Start Audio"**
  - `<input type="text" id="setting-lap-start-audio" maxlength="80">`
  - Default value (pre-filled): `"Let's Go!"`
  - Description hint: *"Spoken aloud when the timer starts"*
- In `app/js/settings.js`, read/write `localStorage` key `rc_lapStartAudio` (defaulting to `"Let's Go!"` if the key is absent). Wire a `change`/`input` event listener to persist on keystroke or blur.
- In `app/styles/settings.css`, style the text input consistently with existing settings rows.

#### Dashboard Announcement (7.7b)
- In `app/js/dashboard.js`, in the `onFirstCross` callback (currently fires with no announcement), add:
  ```js
  const lapStartPhrase = localStorage.getItem('rc_lapStartAudio') || "Let's Go!";
  speak(lapStartPhrase);
  ```
- `speak()` is already imported from `audio.js` and respects the TTS voice/pitch/volume settings.
- Existing `onLap` announcements (`announceLap(lapNumber, lapTime)`) are unchanged.
- **Files touched:** `app/index.html`, `app/js/settings.js`, `app/js/dashboard.js`, `app/styles/settings.css`.

---

### 7.8 – Fix Countdown Duration Bug
**Problem:** The Delayed Start countdown always begins at 10 seconds, ignoring the user's value in `#input-countdown-duration` on the Viewfinder screen.

**Root Cause:** The value of `#input-countdown-duration` is likely not being read from the DOM at the moment `startCountdown()` is called, or the default `10` is hardcoded at the call site.

**Implementation:**
- In `app/js/viewfinder.js`, locate the code path that calls `startCountdown(...)` (triggered by the Confirm button).
- Ensure the call reads the input's current value:
  ```js
  const duration = parseInt(document.getElementById('input-countdown-duration').value, 10) || 10;
  startCountdown({ duration, onTick: ..., onComplete: ..., onCancel: ... });
  ```
- Verify `countdown.js` `startCountdown()` uses the passed `duration` for `_remaining` initialization and does not fall back to a hardcoded constant.
- Add a minimum guard: if the parsed value is `< 1` or `NaN`, default to `10`.
- **Files touched:** `app/js/viewfinder.js`, `app/js/countdown.js` (verification / guard only).

---

## Parallel Subagent Workstreams

These changes are independent of each other and can be implemented simultaneously by separate subagents. The only ordering dependency is that **7.2 (Setup Notes)** must be implemented before **7.3 (History Detail View)** can surface the `setupNotes` field — but those two sub-tasks can be batched into one subagent.

| Workstream | Changes | Files Touched | Dependency |
|---|---|---|---|
| **Agent A** | 7.1 – Back Swipe Navigation | `app.js`, `viewfinder.js`, `router.js` | None |
| **Agent B** | 7.2 + 7.3 – Setup Notes + History Detail | `home.js`, `history.js`, `index.html`, `home.css`, `history.css`, `session.js` | None |
| **Agent C** | 7.4 + 7.6 – Slider Reorder + Remove LED | `index.html`, `viewfinder.css`, `viewfinder.js` | None |
| **Agent D** | 7.5 – Viewfinder Help Popup | `index.html`, `viewfinder.js`, `viewfinder.css` | None (but coordinate with Agent C on `viewfinder.css` edits) |
| **Agent E** | 7.7a – Lap Start Audio Setting | `index.html`, `settings.js`, `settings.css` | None |
| **Agent F** | 7.7b + 7.8 – Dashboard Announcement + Countdown Fix | `dashboard.js`, `viewfinder.js`, `countdown.js` | 7.7a must be merged first so localStorage key `rc_lapStartAudio` is defined |

> **Note on Agents C & D:** Both touch `viewfinder.css` and `viewfinder.js`. Either run them sequentially, or have one agent handle all viewfinder-file edits (combining 7.4, 7.5, and 7.6 into a single "Viewfinder Polish" workstream).

**Recommended grouping if running 3 agents:**
- **Agent 1 – Navigation:** 7.1 (back swipe)
- **Agent 2 – Home + History:** 7.2 + 7.3 (Setup Notes + detail view)
- **Agent 3 – Viewfinder + Settings + Dashboard:** 7.4 + 7.5 + 7.6 + 7.7 + 7.8 (all remaining changes, sequenced internally)

---

## Testing Checklist

### 7.1 – Back Swipe Returns to Home Screen
- [ ] On Viewfinder screen, perform a back swipe (or tap phone back button). App should navigate to the Home Screen — not close the app.
- [ ] After back-swiping to Home, the canvas line is cleared (no ghost line visible if you return to Viewfinder).
- [ ] Camera stream is stopped after back-swipe (camera indicator light off on device).
- [ ] Wake lock is released after back-swipe.
- [ ] Back swipe during an active Countdown or Dashboard session does not silently background the session.
- [ ] After returning to Home and re-entering Viewfinder, the back-swipe trap re-arms correctly (swipe still goes Home, not out of the app).

### 7.2 – Setup Notes on Home Screen
- [ ] "Setup Notes" input field is visible below the Location field on the Home Screen.
- [ ] Typing in Setup Notes and navigating away persists the value in `localStorage` (`rc_setupNotes`).
- [ ] Returning to the Home Screen re-populates the Setup Notes field from `localStorage`.
- [ ] Setup Notes value is saved as part of the session record when a race is completed.
- [ ] Clearing all data (Settings → Clear All Data) also clears the Setup Notes field.

### 7.3 – Tapping a Race in History Shows Details
- [ ] Tapping a session card in History opens a detail view (modal or overlay).
- [ ] Detail view shows: Driver Name, Car Name, Location, Date, Setup Notes.
- [ ] Detail view shows a lap table with Lap #, Lap Time, and Gap from best.
- [ ] The best lap row is highlighted (gold/neon green).
- [ ] Setup Notes shows "No notes" (or similar placeholder) when the field was empty.
- [ ] The Close button dismisses the detail view and returns to the History list.
- [ ] Long-press delete still works and does not conflict with the tap-to-view gesture.
- [ ] Sessions recorded before Setup Notes was added display gracefully (no crash, shows "No notes").

### 7.4 – Slider Order (Sensitivity → Zone Width → Debounce)
- [ ] On the Viewfinder screen, the calibration panel shows sliders in this top-to-bottom order: Sensitivity, Zone Width, Debounce.
- [ ] All three sliders still function correctly after reordering.
- [ ] Slider values persist and reload correctly.

### 7.5 – Viewfinder Help Popup
- [ ] A help icon button is visible in the Viewfinder HUD.
- [ ] Tapping the help button opens the help modal.
- [ ] The modal lists all four setup steps in the correct order.
- [ ] Tapping the Close button dismisses the modal.
- [ ] The modal does not interfere with canvas line drawing (modal is properly layered above canvas).
- [ ] The modal is readable on a small phone screen in portrait orientation.

### 7.6 – Round LED Indicator Removed
- [ ] No circular LED indicator is visible in the lower-right corner of the Viewfinder screen.
- [ ] The full-screen green flash still appears when motion is detected during test mode.
- [ ] Any "Motion Detected" text chip or label still appears as before.
- [ ] No JavaScript errors related to a missing `#virtual-led` element.

### 7.7 – Lap Start Audio Setting
- [ ] Settings page shows a "Lap Start Audio" text input with default value "Let's Go!".
- [ ] Editing the field and leaving Settings persists the value in `localStorage` (`rc_lapStartAudio`).
- [ ] Returning to Settings shows the saved custom phrase.
- [ ] During a race, when the first car crossing starts the master timer, the TTS announces the configured phrase (default: "Let's Go!").
- [ ] Subsequent lap crossings announce the lap number and time as before — the phrase is NOT repeated on every lap.
- [ ] The Lap Start Audio phrase uses the same TTS voice/pitch/volume configured in Settings.
- [ ] Clearing all data resets Lap Start Audio to the default "Let's Go!".

### 7.8 – Countdown Duration Reflects User Input
- [ ] On the Viewfinder screen, change the countdown duration input to `5`. Press Confirm. Countdown starts at 5, not 10.
- [ ] Countdown input set to `1` starts a 1-second countdown.
- [ ] Countdown input set to `60` starts a 60-second countdown.
- [ ] If the input is cleared or non-numeric, countdown defaults to 10 seconds (graceful fallback).
- [ ] Countdown with Delayed Start toggled OFF skips the countdown regardless of the duration value.
- [ ] Countdown audio beeps fire on each second of the user-defined duration.
