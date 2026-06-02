# Bugfix 01 - Discard Partial Lap On STOP

## Problem Statement

When STOP is pressed during an in-progress lap, the elapsed time since the last detected crossing is being treated as completed session time in post-session data. This makes the final data inconsistent with the lap list rule that laps should only be created by confirmed motion detections.

Desired behavior:
- A lap is counted only when motion detection confirms a crossing.
- Pressing STOP must never create or imply a new lap.
- The interval from last crossing to STOP is a partial lap and must be discarded from persisted lap/session stats.

## Current Behavior (Code Path)

Primary runtime path appears to be the app bundle under app/.

- Session lap creation is detection-only in app/js/session.js:
  - recordTrigger() adds lap records only on confirmed triggers.
- STOP flow in app/js/dashboard.js:
  - _handleStop() writes window.__rcSession.result.totalTime from frozenTime.totalMs.
  - frozenTime.totalMs is currently captured from live elapsed time at STOP, not from the last completed crossing.
- Stats/storage pipeline in app/js/summary.js and app/js/storage.js:
  - avgLapMs is derived from totalTime / lapCount.
  - totalTimeMs is persisted from rawSession.totalTime.

Net effect: lap list is crossing-based, but session total and derived averages can include the STOP partial interval.

## Behavior Spec (Source Of Truth)

1. Completed lap rule:
- A completed lap exists only when recordTrigger() executes in racing state.

2. STOP rule:
- STOP transitions state to stopped and ends capture.
- STOP does not create, modify, or complete a lap.

3. Completed total session time:
- totalTime for saved session data must equal the totalTime of the last completed lap record.
- If no completed laps exist, totalTime is 0.

4. Live UI rule:
- During racing, live clocks may show in-progress elapsed values.
- At STOP finalization, persisted metrics use completed-only time, not live partial time.

## Implementation Plan

### 1) Normalize STOP Finalization To Completed-Only Time

Target: app/js/dashboard.js

Planned changes:
- In _handleStop(), compute completed total from recorded laps, not from STOP instant:
  - completedTotalMs = laps.length > 0 ? laps[laps.length - 1].totalTime : 0
- Keep lap list as-is (already crossing-only).
- Set window.__rcSession.result.totalTime = completedTotalMs.
- Keep bestLapIndex from getBestLapIndex() unchanged.

Notes:
- This directly enforces "discard last crossing->STOP partial interval".
- If user stops before first completed lap, saved total should be 0 with 0 laps.

### 2) Align Goal-Met Auto-Stop With The Same Rule

Target: app/js/dashboard.js

Planned changes:
- In onGoalMet callback, pass total from the completed lap event:
  - totalMs = lastLap.totalTime
- Avoid recomputing with getTotalElapsed() after callback latency.

Notes:
- Goal-met stop happens on a crossing already, so this is mostly consistency and precision hardening.

### 3) Make Average Lap Time Independent Of External Total

Targets: app/js/summary.js, app/js/storage.js

Planned changes:
- Compute avg lap from lap durations directly:
  - avgLapMs = round(sum(lapTime) / lapCount)
- Keep best lap and consistency calculations based on lap array.
- Continue storing totalTimeMs for display, but ensure it is completed-only as defined above.

Why this matters:
- Prevents future regressions if any caller accidentally passes a non-completed total.
- Matches user expectation: lap statistics are derived from completed laps only.

### 4) Update Contracts And Inline Documentation

Targets: app/js/session.js, app/js/summary.js, app/js/storage.js

Planned updates:
- Clarify JSDoc/comments that completed laps are trigger-based only.
- Clarify that totalTime/totalTimeMs is "completed session time" (to last completed crossing), not wall-clock until STOP.

### 5) Verify Duplicate Tree Risk

Targets: js/dashboard.js, js/summary.js, js/storage.js (if still used)

Planned action:
- Confirm whether root js/ is legacy or active in any served route.
- If active, mirror the same logic to keep both bundles behaviorally identical.
- If inactive, document that app/js is authoritative to avoid divergence.

### 6) Permanent Dual-Tree Cleanup (Recommended)

Goal:
- Remove long-term drift risk by keeping one authoritative app runtime tree.

Target structure:
- app/js/ = authoritative runtime source for the lap timer app.
- js/ = landing-only scripts (for example landing interactions).

Implementation tasks:
- Add a short architecture note in README.md defining source-of-truth paths.
- Audit root js/ for race-runtime duplicates of app/js/ modules.
- Remove or archive duplicate root js/ race-runtime modules once verified unused.
- Keep only landing-page scripts in root js/.
- Add a repository guard script to fail CI if race-runtime duplicates are reintroduced in root js/.
- Add a pre-commit/CI check that asserts app/index.html loads app/js runtime modules only.

Safety rollout:
- Step 1: Add docs + guard checks first (no deletions).
- Step 2: Run app smoke test (home -> viewfinder -> dashboard -> summary -> history).
- Step 3: Remove verified-unused root js/ race modules.
- Step 4: Re-run smoke test and publish.

Acceptance criteria for cleanup:
- Exactly one active runtime tree for lap timing logic.
- No duplicate race modules present in both app/js/ and js/.
- CI fails on duplicate reintroduction.
- README clearly states canonical module locations.

## Validation Plan

### Manual Scenarios

1. Stop mid-lap after several crossings
- Run at least 3 completed laps.
- Wait partway into next lap.
- Press STOP.
- Expected:
  - Lap count unchanged (no new lap on STOP).
  - Saved total time equals totalTime of last completed lap.
  - Average lap equals arithmetic mean of listed lap durations.

2. Stop before any completed lap
- Trigger first crossing to start racing, but do not complete a lap.
- Press STOP.
- Expected:
  - 0 laps saved.
  - totalTimeMs = 0.
  - best/avg/consistency all 0 or empty-safe values.

3. Goal laps auto-stop
- Set small lap goal (for example 2).
- Complete exactly goal laps.
- Expected:
  - Stop occurs on crossing.
  - totalTime matches last completed lap total exactly.
  - No extra lap.

4. Save and History detail
- Save session.
- Open History detail modal.
- Expected:
  - Lap list, avg, and total are internally consistent.
  - No partial STOP segment included.

### Regression Checks

- Audio announcements still trigger once per completed lap.
- Best lap highlighting and gap values still map correctly.
- Restart/reset flows still clear state and restart detection correctly.

## Acceptance Criteria

- Pressing STOP never creates a lap.
- Saved lap list contains only detection-confirmed crossings.
- Saved total session time excludes last crossing->STOP partial interval.
- Average lap time is computed from completed laps only.
- Behavior is consistent in summary and history views.
- Dual-tree cleanup tasks are tracked and bounded by explicit acceptance criteria.

## Risks And Mitigations

- Risk: Off-by-one or stale lap snapshot at STOP.
  - Mitigation: derive completedTotalMs from getLaps() snapshot taken inside _handleStop().

- Risk: Dual source trees drift (app/js vs js).
  - Mitigation: verify active bundle and mirror or deprecate intentionally.

- Risk: UI confusion if frozen dashboard clock differs from saved total.
  - Mitigation: freeze dashboard with completed-only totals at stop, or explicitly label in-progress display if retained.

## Out Of Scope

- Changing detector sensitivity/debounce logic.
- Redesigning summary/history UI.
- Adding new telemetry fields unless needed for debugging this fix.
