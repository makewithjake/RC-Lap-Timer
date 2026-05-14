/* ============================================================
   wakeLock.js — Wake Lock & Camera Stabilization
   RC Lap Timer · Phase 2 · Task Group B
   ============================================================ */

/* ── Internal state ──────────────────────────────────────── */
/** @type {WakeLockSentinel|null} */
let _sentinel = null;

/**
 * True while the consumer wants the lock to be held.
 * Used by the visibilitychange handler to re-acquire after the page
 * returns to the foreground (browsers release the lock when hidden).
 */
let _desired = false;

/** @type {boolean} */
let _cameraLocked = false;

/** @type {((active: boolean) => void)|null} */
let _wakeLockStatusCb = null;

/** @type {((locked: boolean) => void)|null} */
let _cameraLockStatusCb = null;

/* ── Visibility re-acquisition ───────────────────────────── */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && _desired && _sentinel === null) {
    await acquireWakeLock();
  }
});

/* ── Callback registration (not part of formal API surface) ─ */

/**
 * Register a callback invoked whenever the wake lock active state changes.
 * The callback receives a single boolean: true = active, false = inactive.
 * @param {(active: boolean) => void} cb
 */
export function setWakeLockStatusCallback(cb) {
  _wakeLockStatusCb = cb;
}

/**
 * Register a callback invoked whenever the camera settings lock state changes.
 * The callback receives a single boolean: true = locked, false = unlocked/unsupported.
 * @param {(locked: boolean) => void} cb
 */
export function setCameraLockStatusCallback(cb) {
  _cameraLockStatusCb = cb;
}

/* ── B1 — Wake Lock API ──────────────────────────────────── */

/**
 * Acquire the screen wake lock.
 * No-ops silently if the Wake Lock API is not supported.
 * @returns {Promise<void>}
 */
export async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) {
    console.warn('[WakeLock] Wake Lock API not supported on this device.');
    _wakeLockStatusCb?.(false);
    return;
  }

  _desired = true;

  try {
    _sentinel = await navigator.wakeLock.request('screen');

    _sentinel.addEventListener('release', () => {
      // Browser released the lock (e.g., tab hidden). Do not clear _desired
      // so the visibilitychange handler can re-acquire when the tab is shown.
      _sentinel = null;
      _wakeLockStatusCb?.(false);
    });

    _wakeLockStatusCb?.(true);
  } catch (err) {
    console.warn('[WakeLock] Failed to acquire wake lock:', err);
    _sentinel = null;
    _wakeLockStatusCb?.(false);
  }
}

/**
 * Release the screen wake lock and stop re-acquisition attempts.
 * @returns {void}
 */
export function releaseWakeLock() {
  _desired = false;

  if (_sentinel) {
    _sentinel.release();
    _sentinel = null;
  }

  _wakeLockStatusCb?.(false);
}

/**
 * Returns true if the wake lock sentinel is currently held.
 * @returns {boolean}
 */
export function isWakeLockActive() {
  return _sentinel !== null;
}

/* ── B3 — Camera Focus & Exposure Lock ──────────────────── */

/**
 * Attempt to lock focus and exposure on the active camera stream.
 *
 * NOTE: Must only be called after `startCamera()` (from camera.js) has
 * resolved — the stream must be active before constraints can be applied.
 *
 * @param {MediaStream} stream  The active camera MediaStream.
 * @returns {Promise<boolean>}  true if constraints were applied, false if unsupported.
 */
export async function lockCameraSettings(stream) {
  _cameraLocked = false;

  if (!stream) {
    _cameraLockStatusCb?.(false);
    return false;
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    _cameraLockStatusCb?.(false);
    return false;
  }

  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'locked', exposureMode: 'locked' }],
    });
    _cameraLocked = true;
  } catch (err) {
    // applyConstraints throws if any advanced constraint is unsupported.
    // This is expected on desktop webcams and some mobile browsers.
    console.warn('[WakeLock] Camera focus/exposure lock not supported:', err);
    _cameraLocked = false;
  }

  _cameraLockStatusCb?.(_cameraLocked);
  return _cameraLocked;
}

/**
 * Returns true if focus and exposure were successfully locked via
 * the last call to `lockCameraSettings()`.
 * @returns {boolean}
 */
export function isCameraLocked() {
  return _cameraLocked;
}
