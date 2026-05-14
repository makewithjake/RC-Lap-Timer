// ── Session status ────────────────────────────────────────────────────────────
// 'idle'              — No session started
// 'waiting-for-first' — Detection running; waiting for the car's first crossing
// 'racing'            — Master timer running; laps being recorded
// 'stopped'           — Session ended (Stop pressed or goal met)
let _status = 'idle';

// ── Timing (performance.now() timestamps) ────────────────────────────────────
let _masterStartTime = null;  // performance.now() when the first trigger fired
let _lapStartTime    = null;  // performance.now() when the current lap began

// ── Session data ──────────────────────────────────────────────────────────────
// Each lap record: { lapNumber: number, lapTime: number, totalTime: number }
// lapTime:  ms for this individual lap (from lap-start to trigger)
// totalTime: ms from masterStart to this trigger
let _laps = [];

// ── Configuration ─────────────────────────────────────────────────────────────
let _goalLaps   = null;  // integer | null (null = unlimited; auto-stop disabled)
let _callbacks  = {};    // { onFirstCross, onLap, onGoalMet }

/**
 * Initialise a new session. Status transitions: idle → waiting-for-first.
 * Call resetSession() first if restarting an in-progress session.
 *
 * @param {{
 *   goalLaps?:     number | null,
 *   onFirstCross?: () => void,
 *   onLap?:        (lap: LapRecord, allLaps: LapRecord[]) => void,
 *   onGoalMet?:    (allLaps: LapRecord[]) => void,
 * }} config
 */
export function startSession(config = {}) {
  _goalLaps  = config.goalLaps  ?? null;
  _callbacks = {
    onFirstCross: config.onFirstCross ?? (() => {}),
    onLap:        config.onLap        ?? (() => {}),
    onGoalMet:    config.onGoalMet    ?? (() => {}),
  };
  _status = 'waiting-for-first';
}

/**
 * Called by the detection engine's onTrigger callback on every confirmed crossing.
 * State machine:
 *   waiting-for-first → racing  (first trigger: master timer starts)
 *   racing            → racing  (subsequent triggers: lap recorded)
 *   racing            → stopped (if goalLaps reached after a lap is recorded)
 *   idle | stopped    → no-op
 */
export function recordTrigger() {
  if (_status === 'waiting-for-first') {
    _masterStartTime = performance.now();
    _lapStartTime    = _masterStartTime;
    _status          = 'racing';
    _callbacks.onFirstCross();
    return;
  }

  if (_status === 'racing') {
    const now       = performance.now();
    const lapTime   = now - _lapStartTime;
    const totalTime = now - _masterStartTime;

    _lapStartTime = now; // Reset for the next lap immediately — before any callbacks

    const lapRecord = {
      lapNumber: _laps.length + 1,
      lapTime,
      totalTime,
    };
    _laps.push(lapRecord);

    _callbacks.onLap(lapRecord, _laps.slice()); // Pass a copy — callers must not mutate

    if (_goalLaps !== null && _laps.length >= _goalLaps) {
      _status = 'stopped';
      _callbacks.onGoalMet(_laps.slice());
    }
    return;
  }
  // 'idle' or 'stopped': no-op
}

/**
 * Manually stop the session. Status → 'stopped'.
 * Does not fire onGoalMet. Idempotent.
 */
export function stopSession() {
  _status = 'stopped';
}

/**
 * Clears all session data and returns status to 'idle'.
 * Call startSession() again after resetSession() to begin a fresh session
 * with the same or updated config.
 */
export function resetSession() {
  _status          = 'idle';
  _masterStartTime = null;
  _lapStartTime    = null;
  _laps            = [];
  _goalLaps        = null;
  _callbacks       = {};
}

/**
 * Returns elapsed ms since the current lap started (0 if not racing).
 * @returns {number}
 */
export function getCurrentLapElapsed() {
  if (_status !== 'racing' && _status !== 'stopped') return 0;
  if (_lapStartTime === null) return 0;
  return performance.now() - _lapStartTime;
}

/**
 * Returns elapsed ms since the master timer started (0 if not yet racing).
 * @returns {number}
 */
export function getTotalElapsed() {
  if (_masterStartTime === null) return 0;
  return performance.now() - _masterStartTime;
}

/**
 * Returns a shallow copy of all recorded laps.
 * @returns {Array<{ lapNumber: number, lapTime: number, totalTime: number }>}
 */
export function getLaps() {
  return _laps.slice();
}

/**
 * Returns the index (0-based) of the lap with the lowest lapTime,
 * or -1 if no laps have been recorded.
 * @returns {number}
 */
export function getBestLapIndex() {
  if (_laps.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < _laps.length; i++) {
    if (_laps[i].lapTime < _laps[bestIdx].lapTime) bestIdx = i;
  }
  return bestIdx;
}

/**
 * Returns the current session status.
 * @returns {'idle'|'waiting-for-first'|'racing'|'stopped'}
 */
export function getSessionStatus() {
  return _status;
}
