/**
 * storage.js — Data Persistence Layer (Phase 6, Task Group A)
 *
 * Provides localStorage CRUD for session records and global settings.
 * All keys are module-internal constants — not exported.
 */

// ── Keys ──────────────────────────────────────────────────────────────────────
// Phase 1 keys (already exist — do not redefine):
//   rc_driverName  rc_carName  rc_location
// Phase 3 keys (calibration.js owns these):
//   rc_sensitivity  rc_debounce  rc_zoneWidth
// New in Phase 6:
const KEY_SESSIONS = 'rc_sessions';  // JSON string — Session[]
const KEY_SETTINGS = 'rc_settings';  // JSON string — Settings

// ── Settings schema & defaults ────────────────────────────────────────────────

/**
 * @typedef {Object} Settings
 * @property {number}      countdownDuration — seconds (1–60); default 10
 * @property {boolean}     ttsEnabled        — true to speak lap announcements; default false
 * @property {string|null} ttsVoiceName      — SpeechSynthesisVoice.name or null (system default)
 * @property {number}      ttsPitch          — 0.5–2.0; default 1.0
 * @property {number}      ttsVolume         — 0–1; default 1.0
 * @property {string}      units             — 'metric' | 'imperial'; default 'metric'
 */

const DEFAULT_SETTINGS = Object.freeze({
  countdownDuration: 10,
  ttsEnabled:        false,
  ttsVoiceName:      null,
  ttsPitch:          1.0,
  ttsVolume:         1.0,
  units:             'metric',
});

// ── Session CRUD ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LapRecord
 * @property {number} lapNumber  — 1-based lap index
 * @property {number} lapTimeMs  — duration of this lap in milliseconds
 * @property {number} gapMs      — lapTimeMs − bestLapMs (0 for the fastest lap)
 */

/**
 * @typedef {Object} Session
 * @property {string}      id               — unique identifier
 * @property {string}      date             — ISO 8601 date string
 * @property {string}      driverName
 * @property {string}      carName
 * @property {string}      location
 * @property {LapRecord[]} laps
 * @property {number}      lapCount
 * @property {number}      bestLapMs
 * @property {number}      avgLapMs         — totalTimeMs / lapCount, rounded
 * @property {number}      consistencyScore — population std deviation of lap times in ms
 * @property {number}      totalTimeMs
 * @property {Object}      calibration      — { sensitivity, debounce, zoneWidth }
 * @property {number|null} lapGoal
 */

/**
 * Builds a canonical Session record from the raw session result stored on
 * window.__rcSession.result. Pure function — does not write to localStorage.
 *
 * @param {Object} rawSession — window.__rcSession.result at time of stop
 * @returns {Session}
 */
export function buildSessionRecord(rawSession) {
  const laps = rawSession.laps ?? [];

  const bestLapMs = laps.length > 0
    ? Math.min(...laps.map((l) => l.lapTime))
    : 0;

  const avgLapMs = laps.length > 0
    ? Math.round(rawSession.totalTime / laps.length)
    : 0;

  const consistencyScore = laps.length > 0
    ? Math.round(
        Math.sqrt(
          laps.reduce((acc, l) => acc + (l.lapTime - avgLapMs) ** 2, 0) / laps.length
        )
      )
    : 0;

  const lapRecords = laps.map((l) => ({
    lapNumber: l.lapNumber,
    lapTimeMs: l.lapTime,
    gapMs:     l.lapTime - bestLapMs,
  }));

  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString();

  // Access parent session object for calibration and goal
  const parentSession = window.__rcSession ?? {};

  return {
    id,
    date:             new Date().toLocaleDateString('en-CA'),
    driverName:       rawSession.driverName ?? '',
    carName:          rawSession.carName    ?? '',
    location:         rawSession.location   ?? '',
    setupNotes:       localStorage.getItem('rc_setupNotes') || '',
    laps:             lapRecords,
    lapCount:         laps.length,
    bestLapMs,
    avgLapMs,
    consistencyScore,
    totalTimeMs:      rawSession.totalTime  ?? 0,
    calibration:      parentSession.settings ?? {},
    lapGoal:          parentSession.goalLaps ?? null,
  };
}

/**
 * Prepends the session record to rc_sessions (newest first) and serializes.
 * @param {Session} sessionRecord
 * @returns {boolean} true on success, false on QuotaExceededError
 */
export function saveSession(sessionRecord) {
  const existing = getHistory();
  existing.unshift(sessionRecord);
  try {
    localStorage.setItem(KEY_SESSIONS, JSON.stringify(existing));
    return true;
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      console.warn('[storage] localStorage quota exceeded — session not saved.');
    } else {
      console.warn('[storage] saveSession error:', err);
    }
    return false;
  }
}

/**
 * Reads and parses rc_sessions. Returns Session[] sorted newest first.
 * Returns [] if the key is missing or the JSON is malformed.
 * @returns {Session[]}
 */
export function getHistory() {
  try {
    const raw = localStorage.getItem(KEY_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[storage] getHistory parse error:', err);
    return [];
  }
}

/**
 * Removes the session with the given id and re-saves. No-op if id not found.
 * @param {string} id
 */
export function deleteSession(id) {
  const sessions = getHistory().filter((s) => s.id !== id);
  try {
    localStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions));
  } catch (err) {
    console.warn('[storage] deleteSession write error:', err);
  }
}

/**
 * Removes all app data from localStorage. Does not reload the page.
 */
export function clearAllData() {
  [
    KEY_SESSIONS,
    KEY_SETTINGS,
    'rc_driverName',
    'rc_carName',
    'rc_location',
    'rc_sensitivity',
    'rc_debounce',
    'rc_zoneWidth',
    'rc_setupNotes',
    'rc_lapStartAudio',
  ].forEach((key) => localStorage.removeItem(key));
}

// ── Settings CRUD ─────────────────────────────────────────────────────────────

/**
 * Reads and parses rc_settings, merging with DEFAULT_SETTINGS for missing keys.
 * @returns {Settings}
 */
export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    console.warn('[storage] getSettings parse error:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Merges partial into current settings with range validation, then writes.
 * @param {Partial<Settings>} partial
 */
export function saveSettings(partial) {
  const current = getSettings();
  const merged  = { ...current };

  if (partial.countdownDuration !== undefined) {
    merged.countdownDuration = Math.max(1, Math.min(60, Number(partial.countdownDuration)));
  }
  if (partial.ttsVoiceName !== undefined) {
    merged.ttsVoiceName = partial.ttsVoiceName;
  }
  if (partial.ttsPitch !== undefined) {
    merged.ttsPitch = Math.max(0.5, Math.min(2.0, Number(partial.ttsPitch)));
  }
  if (partial.ttsVolume !== undefined) {
    merged.ttsVolume = Math.max(0, Math.min(1, Number(partial.ttsVolume)));
  }
  if (partial.units !== undefined) {
    if (partial.units === 'metric' || partial.units === 'imperial') {
      merged.units = partial.units;
    }
  }
  if (partial.ttsEnabled !== undefined) {
    merged.ttsEnabled = Boolean(partial.ttsEnabled);
  }

  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(merged));
  } catch (err) {
    console.warn('[storage] saveSettings write error:', err);
  }
}


