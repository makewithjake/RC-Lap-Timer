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

- bug: Changing volume in settings does not have an effect on TTS. Keep the volume adjuster, but add on off toggle for TTS. default TTS should be OFF
- bug: TTS language selection box does not change the tts language
- bug: once history page is full, new sessions push old sessions off the screen. Also, it's next day and new sessions are being put under yesterday's date, even though there is a section for today date. Deleting sessions does allow old sessions to become visible again. So there are there, just getting pushed off screen. History page should allow scrolling to see full list and sessions should be placed within 
- bug: add lap graph when viewing sessions from history. 
- bug: formatting issue on homepage title (RC Timer) is not centered on the screen.  possibly it is shifted due to interaction with the gear/settings icon?
- feature: add a small "Clear" button on home page that clears the driver, car, location, and notes fields.


---

## Future Tasks
- case: when viewing from a low angle, the fnish line (eg, phone is next to a residential sized road) and finish line is drawn across the entire road, car is not detected when at the far side of the finish line/road which is also near the edge of the finish line.  Assumption was that car was too small at this distance, however, if phone setup is kept the same, and line is drawn shorter, only including the far side of the road, car is detected reliably. Is the finish line getting compressed or scaled in some way that it cant see small objects when line is large?  is a smaller line providing higher fidelity?
- need a contact/bug report page/form
- confirm battery life tests.  does app stay low power or is it burning battery?  initial tests seemed to make the phone slightly warm.  will need to track some telemetry from phone to best understand this to make sure we have no memory leaks.
- 


### Potential Future Features / Bugs
- Web Worker offload for pixel math if UI feels sluggish during detection
- Multi-car / multi-driver profile management
- Export session data (CSV or share sheet)
- Distance tracking (metric/imperial) once sensor data supports it
- tags that can be applied to laps on post session page. these could allow user to ignore laps if car flips, etc.
- manual focus? or tappable focus zones?
-