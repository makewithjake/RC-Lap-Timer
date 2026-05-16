# Phase 5 Implementation Plan – Countdown & Race Dashboard

## Status — All Sprints Complete

| Agent | Task Group | File | Status | Completed |
|---|---|---|---|---|
| Agent A | Session Engine | `js/session.js` | ✅ Complete | 2026-05-14 |
| Agent B | Countdown Controller | `js/countdown.js` | ✅ Complete | 2026-05-14 |
| Agent C | Dashboard CSS | `styles/dashboard.css` | ✅ Complete | 2026-05-14 |
| Agent D | Countdown CSS | `styles/countdown.css` | ✅ Complete | 2026-05-14 |
| Agent E | HTML Scaffolding | `index.html` | ✅ Complete | 2026-05-14 |
| Agent F | Dashboard Controller | `js/dashboard.js` | ✅ Complete | 2026-05-14 |
| Agent G | App Wiring | `js/app.js`, `sw.js` | ✅ Complete | 2026-05-14 |

**Phase 5 complete.** All deliverables implemented and wired. Proceed to Phase 6.

---

## Files Delivered

| File | Change Type | Purpose |
|---|---|---|
| `js/session.js` | New | Session state machine — timing, lap records, goal logic |
| `js/countdown.js` | New | 10-second countdown controller |
| `js/dashboard.js` | New | Race Dashboard screen controller — clock RAF, lap table, stop/reset |
| `styles/countdown.css` | New | Countdown overlay styles |
| `styles/dashboard.css` | New | Race Dashboard OLED styles |
| `index.html` | Additive | Screen 3 (countdown), Screen 4 (dashboard), delayed-start toggle, goal-laps input |
| `js/app.js` | Additive | Countdown/dashboard imports, confirm handler expansion, toggle wiring |
| `sw.js` | Additive | Cache bumped to `rc-timer-v5`; 5 new assets added (20 total) |

---

## Milestone Verification Checklist

Before closing Phase 5, verify each item manually in the browser:

- [ x] Delayed Start = Off: Confirm navigates directly to Race Dashboard — no countdown shown
- [ x] Delayed Start = On: Confirm shows Countdown screen; digits count 10→0 with beep each tick and "GO!" beep at 0; dashboard appears immediately after
- [ x] Cancel during countdown returns to Viewfinder with trigger line intact and test-mode detection restarted
- [x ] Goal Laps = 3, Delayed Start Off: after 3 crossings the session stops automatically; clock freezes, camera stops, app navigates home after ~1.5 s
- [x ] Goal Laps empty (∞): session runs indefinitely until STOP is pressed
- [ x] Big Clock ticks in `M:SS.mm` format with no digit-width jitter (`font-variant-numeric: tabular-nums`)
- [ x] First crossing starts the master timer (`getSessionStatus()` transitions `waiting-for-first` → `racing`)
- [ x] Each subsequent crossing appends a lap row; best lap highlighted in green; other Gap cells show `+M:SS.mm` offset
- [ x] TTS announces each lap: "Lap 2: twelve point four seconds"
- [ x] STOP freezes the clock; `isDetecting()` returns `false`; `getCameraStream()` returns `null`
- [ x] RESET clears the lap table, resets the clock to `0:00.00`, restarts waiting for first crossing
- [x] "Show Camera" feature removed (camera thumbnail toggling dropped by design decision)
- [x] `window.__rcSession.result` contains `{ laps, bestLapIndex, totalTime, driverName, carName, location, timestamp }` after session ends
- [ ] No frame drops: Big Clock RAF loop completes in < 2 ms per tick (Chrome DevTools Performance panel)
- [ ] iOS Safari: Wake Lock re-acquired after background; TTS fires correctly; countdown interval not throttled
