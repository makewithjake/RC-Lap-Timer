# Phase 5-2 Plan — Bug Fix Sweep (Post Phase 5)

## Status — Not Started

---

## Bug Inventory & Root Cause Analysis

### Bug 1 — App opens on the countdown screen; Cancel button does nothing

**Symptom:** On launch the user sees the large countdown digit, "Get ready!", and a Cancel button. Cancel does nothing.

**Root Cause A — Stale Service Worker cache**

Phase 5-1 added `[hidden] { display: none !important; }` to `global.css`. This rule is present on disk but the service worker is still running cache version `rc-timer-v5` (set in `sw.js`). Because the SW uses a **cache-first** strategy, every asset served — including `global.css` — comes from the v5 cache bucket, which was filled before Phase 5-1 ran. The browser never fetches the updated file from disk.

Without the `[hidden]` rule in the **served** `global.css`, the component-level rule in `countdown.css`:

```css
#screen-countdown {
  display: flex;   /* ← overrides [hidden] when the rule is absent */
  position: fixed;
  inset: 0;
  z-index: 20;
}
```

…makes the countdown screen always visible, covering the entire viewport at the highest `z-index`, regardless of the `hidden` attribute in the HTML.

Phase 5-1 also moved the Cancel button listener and added stub-screen back buttons — those code changes in `app.js` and `index.html` are likewise not being served from cache.

**Root Cause B — No active countdown to cancel**

`cancelCountdown()` (in `countdown.js`) is a no-op when `_intervalId === null`. Because no countdown was actually started at launch (only the CSS made it visible), clicking Cancel does nothing. This symptom disappears entirely once Root Cause A is resolved, but is worth documenting.

---

### Bug 2 — Cannot draw a line on the camera setup screen (line not visible)

**Symptom:** Navigating to the viewfinder/camera setup screen; tapping or clicking produces no visible line.

**Root Cause — Canvas sized to 0×0 at initialization**

`_initViewfinderCanvas()` is called inside `DOMContentLoaded` in `app.js`, at which point `#screen-viewfinder` has the `hidden` attribute. Hidden elements have no layout — `_canvas.offsetWidth` and `_canvas.offsetHeight` are both `0`.

`_resizeCanvas()` in `viewfinder.js` does:

```js
_canvas.width  = _canvas.offsetWidth;   // = 0
_canvas.height = _canvas.offsetHeight;  // = 0
```

The canvas is permanently 0×0. When the user later navigates to the viewfinder (by removing the `hidden` attribute), **no resize event fires** — only a window dimension change would trigger the existing `window.addEventListener('resize', _resizeCanvas)` handler. The canvas stays 0×0 for the lifetime of the session.

Consequences of a 0×0 canvas:
- `_getCanvasPos()` clamps both x and y to `Math.min(0, ...)` = 0, so every tap places a point at (0, 0).
- `_redraw()` paints on a canvas with zero area — nothing is visible.
- Even with two "placed" points (both at (0, 0)), the line has zero length and no visible output.

---

### Bug 3 — No indication that motion detection is active around the line

**Symptom:** Even after placing the line (if somehow completed), the virtual LED never flashes and no beep fires.

**Root Cause — Degenerate ROI caused by Bug 2**

When `hasCompleteLine()` returns `true` (two points at (0, 0)), `onLineChange` fires and `startDetection()` is called. The `roi` returned by `getROI()` has `p1Norm` = `p2Norm` = `{ x: 0, y: 0 }` and `zoneWidthNorm = 0`.

In `detector.js`, `_computeROIPixels()` uses the display canvas's width and height (both 0) to recover pixel coordinates. The bounding box is computed as width = 0, height = 0. The off-screen hidden canvas used for pixel sampling is created at 0×0 — `drawImage` produces no pixel data and `TRIGGER_RATIO` (5%) is never satisfied. No triggers fire, so the virtual LED never activates and no beep plays.

**This bug resolves automatically when Bug 2 is fixed.**

---

### Bug 4 — Calibration panel controls not displaying properly

**Symptom:** The user reports "the session length slider is not displaying properly." The Delayed Start toggle and Goal Laps input both render with no custom styling.

**Root Cause — Missing CSS rules for toggle and number input**

`viewfinder.css` defines styles for `.calibration-slider` (the three range inputs) but contains **no rules** for:

| Class | Element | Effect |
|---|---|---|
| `.calibration-toggle` | Delayed Start `<button role="switch">` | Renders as a bare unstyled button — no pill shape, no thumb |
| `.calibration-toggle-thumb` | `<span>` inside the toggle | Invisible; no position, size, or styling |
| `.calibration-number-input` | Goal Laps `<input type="number">` | Renders with browser defaults — no border, background, or sizing consistent with the panel |

The toggle's active/inactive state cannot be inferred visually, so users cannot tell whether Delayed Start is on or off. This is the most likely cause of the user calling it "not displaying properly" — the toggle looks like a plain text box or button rather than a switch.

The three range sliders themselves are fine: `_syncSliderFill()` reads `.value`/`.min`/`.max` (not layout dimensions) so the `--slider-fill` custom property is set correctly at init.

---

### Bug 5 — Countdown screen skipped; session starts immediately after Confirm

**Symptom:** Tapping Confirm goes straight to the race dashboard with a frozen timer, skipping the countdown screen.

**Root Cause — Cascade from Bugs 1 and 4**

The Delayed Start toggle defaults to `aria-checked="false"` (OFF). `_readViewfinderSessionConfig()` reads this attribute:

```js
const delayedStart = toggleEl?.getAttribute('aria-checked') === 'true' ?? false;
// → false (default)
```

With `delayedStart = false`, the confirm handler calls `_enterDashboard()` directly — no countdown. This is **correct behavior for the default state**.

The problem is that the user cannot tell the toggle is in the OFF state because the toggle has no CSS (Bug 4) and its visual appearance is broken. The stale SW (Bug 1) may also mean the user is running a version of the app without the Phase 5-1 `app.js` changes.

Once Bugs 1 and 4 are fixed, the Delayed Start toggle will be visible and functional, and users can opt into the countdown. No additional logic change is needed for this bug — it resolves as a cascade.

---

### Bug 6 — Timer on the race dashboard never starts counting

**Symptom:** The dashboard appears showing `0:00.00`, but the clock never begins counting up.

**Root Cause — Canvas dimensions are still 0×0 when dashboard initializes detection**

`dashboard.js._beginSession()` calls:

```js
const videoEl  = document.getElementById('viewfinder-video');
const canvasEl = document.getElementById('viewfinder-canvas');

startDetection({ videoEl, canvasEl, roi, ... });
```

`canvasEl` is the viewfinder canvas, which still has `width = 0` and `height = 0` due to Bug 2. In `detector.js`, `_computeROIPixels(roi, canvasEl.width, canvasEl.height)` receives `displayW = 0` and `displayH = 0`, producing a degenerate 0×0 bounding box.

With a 0×0 sampling area, no pixel comparison data is ever gathered. `TRIGGER_RATIO` (5%) is never met. `recordTrigger()` is never called. The session stays in `'waiting-for-first'` indefinitely, `onFirstCross` never fires, `_startClockRaf()` is never called, and the clock stays at `0:00.00` forever.

**This bug resolves automatically when Bug 2 is fixed.**

---

## Fix Plan

### Fix 1 — Bump Service Worker cache version (resolves Bug 1)

**Affected file:** `sw.js`

Change `CACHE_NAME` from `'rc-timer-v5'` to `'rc-timer-v6'`. The SW activate handler already deletes all cache buckets whose name is not `CACHE_NAME`, so bumping the version causes the old v5 cache to be purged and all assets to be fetched fresh from disk on next load. This delivers Phase 5-1's fixes (`[hidden]` rule, updated `app.js`, stub screens, etc.) to users who have the app cached.

No other changes to `sw.js` are required — the `PRECACHE_URLS` list already includes all current assets.

---

### Fix 2 — Resize canvas when viewfinder screen becomes visible (resolves Bugs 2, 3, 6)

**Affected files:** `js/viewfinder.js`, `js/app.js`

**Step 2a — Export a `resizeCanvas()` function from `viewfinder.js`**

Add a public wrapper around the existing private `_resizeCanvas()` function:

```js
export function resizeCanvas() {
  if (_canvas) _resizeCanvas();
}
```

This gives `app.js` a way to trigger a resize without exposing internal state.

**Step 2b — Call `resizeCanvas()` in `app.js` when the viewfinder becomes visible**

In the `btn-start-session` click handler (inside `home.js` or `app.js`, wherever the navigation to the viewfinder is initiated), call `resizeCanvas()` **after** `showScreen('viewfinder')` and **after** the camera is started (so the video element has laid out):

```js
showScreen('viewfinder');
resizeCanvas();   // ← force canvas to read its real offsetWidth/offsetHeight
```

At this point the viewfinder section has `hidden` removed, so `_canvas.offsetWidth` and `_canvas.offsetHeight` return the real viewport dimensions. `_resizeCanvas()` sets `_canvas.width` and `_canvas.height` correctly, and `_redraw()` sets up the drawing context.

The existing `window.addEventListener('resize', _resizeCanvas)` in `initCanvas()` continues to handle orientation changes.

> **Why not use ResizeObserver?** A `ResizeObserver` inside `initCanvas()` would work but adds complexity and a more complex API surface. The root problem is a single one-time initialization call at the wrong time; an explicit call at the point of navigation is the simplest correct fix.

---

### Fix 3 — Add CSS for calibration toggle and number input (resolves Bug 4)

**Affected file:** `styles/viewfinder.css`

Add styles for the three missing class names. All three must be consistent with the existing calibration panel visual language (dark background, accent color, `--font-ui` typography).

**`.calibration-toggle` — pill-shaped toggle switch**

The button should render as a horizontal pill (approximately 44×24px). When `data-active="true"` the pill background should fill with `var(--color-accent)`; when false it should show `var(--color-border)`. The thumb (`.calibration-toggle-thumb`) is a white circle that translates right when active.

```css
/* Pill track */
.calibration-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  min-width: 44px;
  min-height: 24px;
  border-radius: var(--radius-full);
  background-color: var(--color-border);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
}

.calibration-toggle[data-active="true"] {
  background-color: var(--color-accent);
}

/* Sliding thumb */
.calibration-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-circle);
  background-color: #ffffff;
  transition: transform 0.2s ease;
  pointer-events: none;
}

.calibration-toggle[data-active="true"] .calibration-toggle-thumb {
  transform: translateX(20px);
}
```

**`.calibration-row--toggle` — align toggle row horizontally**

```css
.calibration-row--toggle {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
```

**`.calibration-number-input` — Goal Laps number field**

```css
.calibration-number-input {
  width: 72px;
  height: 36px;
  padding: var(--space-1) var(--space-2);
  background-color: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.calibration-number-input:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
```

---

### Fix 4 — Clear hardcoded countdown digit content (minor cosmetic)

**Affected file:** `index.html`

The `#countdown-digit` element in `index.html` contains hardcoded `10` and the `.countdown-label` contains `Get ready!`. These values are only correct if the countdown duration is always 10 and the countdown is active. While Bug 1 (stale SW) is the primary cause of these strings appearing at launch, leaving stale content in the HTML is a latent issue if the countdown duration is ever changed, or if JS is slow to run.

Change:
```html
<div id="countdown-digit" ...>10</div>
<p class="countdown-label">Get ready!</p>
```

To:
```html
<div id="countdown-digit" ...></div>
<p class="countdown-label">Get ready!</p>
```

The `onTick` handler in `app.js._runCountdown()` sets the digit content on the first tick (immediately), so emptying it produces no visible flash.

---

## Task Dependency Graph

```
Fix 1 (SW cache bump)       ─── independent ───────────────── resolves Bug 1
Fix 2 (canvas resize)       ─── independent ───────────────── resolves Bugs 2, 3, 6
Fix 3 (calibration CSS)     ─── independent ───────────────── resolves Bug 4
Fix 4 (countdown digit)     ─── independent ───────────────── resolves minor cosmetic

Bug 5 (countdown skipped)   ─── resolved by Fix 1 + Fix 3 ── no additional code needed
```

**Fixes 1, 2, 3, and 4 are all independent of each other and can be implemented in parallel by separate agents.**

---

## Agent Assignment

| Agent | Fix | Files | Scope |
|---|---|---|---|
| Agent A | Fix 1 — SW cache bump | `sw.js` | 1-line change to `CACHE_NAME` |
| Agent B | Fix 2 — Canvas resize on show | `js/viewfinder.js`, `js/app.js` | Export `resizeCanvas()`; call it after `showScreen('viewfinder')` |
| Agent C | Fix 3 — Calibration control CSS | `styles/viewfinder.css` | Add toggle, toggle-thumb, number-input, and row--toggle rules |
| Agent D | Fix 4 — Countdown digit content | `index.html` | Clear hardcoded `10` from `#countdown-digit` |

---

## Verification Checklist

After all fixes are implemented, verify the following manually in the browser (clear the old SW cache or use an incognito window):

- [ ] App opens on the Home screen — no countdown visible, no Cancel button
- [ ] Navigating to the viewfinder shows a live camera feed; tapping/clicking places visible points on the canvas
- [ ] After placing two points, a green line with endpoint handles is visible
- [ ] The virtual LED flashes and a beep plays when movement crosses the line
- [ ] The Delayed Start toggle renders as a pill with a sliding thumb; tapping it toggles its visual state between on and off
- [ ] The Goal Laps input renders in a styled box consistent with the calibration panel
- [ ] With Delayed Start OFF: Confirm navigates directly to the race dashboard
- [ ] With Delayed Start ON: Confirm shows the countdown screen; digits count 10→1→GO!; dashboard appears after countdown ends
- [ ] On the race dashboard: the clock starts counting (`0:00.00` → `0:00.01`…) on the first lap crossing
- [ ] The countdown digit in HTML is empty at load time (no flash of hardcoded `10`)
