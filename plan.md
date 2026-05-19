# RC Lap Timer – App Plan

> This plan covers the `app/` directory only.

## Completed

Phases 1–6 are complete. Key architecture decisions locked in:
- Router: `showScreen()` / `currentScreen()` named exports from `router.js`
- `localStorage` keys: `rc_driverName`, `rc_carName`, `rc_location`; calibration values via `getCalibration()` / `setCalibration()` in `calibration.js`
- Camera: `environment` facing mode with desktop fallback; no `alert()` — inline error banners only
- Wake Lock: auto-reacquire on `visibilitychange`
- Audio: Web Audio API beeps + `speechSynthesis` TTS via `playBeep()`, `speak()`, `announceLap()`
- Detection: luminance differencing on ROI only (normalized 0–1 coords), inside `requestAnimationFrame` loop; sensitivity + debounce from calibration sliders
- Virtual LED test mode live on Viewfinder for hands-free calibration

## Rules (non-negotiable)
- All pixel processing inside `requestAnimationFrame` — never `setInterval`
- Scan ROI only — never the full frame
- `#000000` backgrounds — never near-black grays
- Stop camera stream when session ends; revoke any object URLs

---

## Current Focus – Next Sprint

All phases through Phase 6 are complete. See Future Tasks below for upcoming work.

---

## Future Tasks

### Potential Future Features / Bugs
- Web Worker offload for pixel math if UI feels sluggish during detection
- Multi-car / multi-driver profile management
- Export session data (CSV or share sheet)
- Distance tracking (metric/imperial) once sensor data supports it
- tags that can be applied to laps on post session page. these could allow user to ignore laps if car flips, etc.