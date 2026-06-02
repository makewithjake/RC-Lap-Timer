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

> No active sprint. Phase 8 is complete. See Future Tasks below for upcoming work.

## Completed — Phase 8

> Phase 8 fully implemented and verified. See `obs/phase8plan.md` for full task breakdown and test plan.

- [x] Group A — TTS fixes (volume, on/off toggle default OFF, voice persistence, iOS VoiceOver safety, iOS unlock gesture)
- [x] Group B — History page scrolling + date grouping bug
- [x] Group C — Lap graph in history session detail modal
- [x] Group D — Home title centering + Clear button
- [x] Group E — Settings: contact/bug report link + copyright notice
- [x] Group F — Rebrand to LapTrack / LapTrack.app
- [x] Group G — Code quality pass + deployment prep (console warnings, SW cache bump, meta tags, favicon 404)



---

## Future Tasks
- 
- need a contact/bug report page/form
- confirm battery life tests.  does app stay low power or is it burning battery?  initial tests seemed to make the phone slightly warm.  will need to track some telemetry from phone to best understand this to make sure we have no memory leaks.
- 


### Potential Future Features / Bugs
- Web Worker offload for pixel math if UI feels sluggish during detection
- Multi-car / multi-driver profile management
- Export session data (CSV or share sheet)
- manual focus? or tappable focus zones?
-