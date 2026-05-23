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

> Phase 8 in progress. See `obs/phase8plan.md` for full task breakdown, sub-agent assignments, and test plan.

- [ ] Group A — TTS fixes (volume, on/off toggle default OFF, voice persistence)
- [ ] Group B — History page scrolling + date grouping bug
- [ ] Group C — Lap graph in history session detail modal
- [ ] Group D — Home title centering + Clear button
- [ ] Group E — Settings: contact/bug report link + copyright notice
- [ ] Group F — Rebrand to LapTrack / LapTrack.app
- [ ] Group G — Code quality pass + deployment prep



---

## Future Tasks
- case: when viewing from a low angle, the fnish line (eg, phone is next to a residential sized road) and finish line is drawn across the entire road, car is not detected when at the far side of the finish line/road which is also near the edge of the finish line.  Assumption was that car was too small at this distance, however, if phone setup is kept the same, and line is drawn shorter, only including the far side of the road, car is detected reliably. Is the finish line getting compressed or scaled in some way that it cant see small objects when line is large?  is a smaller line providing higher fidelity?
- need a contact/bug report page/form
- confirm battery life tests.  does app stay low power or is it burning battery?  initial tests seemed to make the phone slightly warm.  will need to track some telemetry from phone to best understand this to make sure we have no memory leaks.
- cleanup file structure. move files in folders based on common best practices. move unused/redundtant, unnecessary files to the Obs folder for future deletion.
- Bug: when starting new session, and hitting STOP before a lap is incremented, we sometimes see a graph displaying the last session where laps were counted. More specific: if user hits STOP before the timer starts, or, after the timer starts but BEFORE the min lap length (debounce), then the graph displayed shows that last sessions graph data.


### Potential Future Features / Bugs
- Web Worker offload for pixel math if UI feels sluggish during detection
- Multi-car / multi-driver profile management
- Export session data (CSV or share sheet)
- Distance tracking (metric/imperial) once sensor data supports it
- tags that can be applied to laps on post session page. these could allow user to ignore laps if car flips, etc.
- manual focus? or tappable focus zones?
-