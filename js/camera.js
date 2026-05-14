/* ============================================================
   camera.js — Camera Access Module
   RC Lap Timer · Phase 2 · Task Group A
   ============================================================ */

/** @type {MediaStream|null} */
let _stream = null;

/** @type {HTMLVideoElement|null} */
let _videoEl = null;

// ── Stability delay state (Task Group E — E1) ─────────────────

/** Timestamp (via performance.now()) recorded when the camera stream starts. */
let _cameraStartTime = null;

/** Number of ms to wait after camera start before declaring the feed stable. */
const STABILITY_DELAY_MS = 2000;

// ── Internal helpers ──────────────────────────────────────────

/**
 * Starts the 2-second warm-up timer after the camera stream is active (E2).
 * Shows the "Stabilizing…" overlay, then hides it and re-enables the Confirm
 * button when the delay elapses.
 */
function _startStabilizationTimer() {
  _cameraStartTime = performance.now();

  const overlay = document.getElementById('viewfinder-stabilizing');
  const confirmBtn = document.getElementById('viewfinder-confirm');

  if (overlay) {
    overlay.textContent = 'Stabilizing\u2026';
    overlay.classList.remove('is-hidden');
  }
  if (confirmBtn) confirmBtn.disabled = true;

  setTimeout(() => {
    if (overlay) {
      overlay.classList.add('is-fading');
      overlay.addEventListener(
        'transitionend',
        () => {
          overlay.classList.add('is-hidden');
          overlay.classList.remove('is-fading');
        },
        { once: true }
      );
    }
    if (confirmBtn) confirmBtn.disabled = false;
  }, STABILITY_DELAY_MS);
}

/**
 * Hides the stabilizing overlay immediately (called by stopCamera).
 */
function _resetStabilizationOverlay() {
  _cameraStartTime = null;
  const overlay = document.getElementById('viewfinder-stabilizing');
  if (overlay) {
    overlay.classList.remove('is-fading');
    overlay.classList.add('is-hidden');
    overlay.textContent = '';
  }
  const confirmBtn = document.getElementById('viewfinder-confirm');
  if (confirmBtn) confirmBtn.disabled = true;
}

function _showError(message) {
  const banner = document.getElementById('viewfinder-error');
  if (!banner) return;
  banner.textContent = message;
  banner.style.display = 'block';
}

function _clearError() {
  const banner = document.getElementById('viewfinder-error');
  if (!banner) return;
  banner.textContent = '';
  banner.style.display = 'none';
}

// ── Public API ────────────────────────────────────────────────

/**
 * Start the camera stream and attach it to the given video element.
 *
 * Requests the environment (rear) camera with preferred 1280×720 resolution.
 * If the browser throws OverconstrainedError (common on desktop webcams that
 * don't support exact facingMode), retries with a non-exact constraint so
 * development and testing on non-mobile devices still works.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<MediaStream>}
 */
export async function startCamera(videoEl) {
  _videoEl = videoEl;
  _clearError();

  const exactConstraints = {
    video: {
      facingMode: { exact: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  const fallbackConstraints = {
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  try {
    try {
      _stream = await navigator.mediaDevices.getUserMedia(exactConstraints);
    } catch (innerErr) {
      if (innerErr.name === 'OverconstrainedError') {
        // Retry without exact facingMode — supports desktop webcams in dev
        _stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      } else {
        throw innerErr;
      }
    }

    videoEl.srcObject = _stream;
    _startStabilizationTimer();
    return _stream;
  } catch (err) {
    _stream = null;

    if (err.name === 'NotAllowedError') {
      _showError(
        'Camera permission denied. Please allow camera access in your browser settings.'
      );
    } else if (err.name === 'NotFoundError') {
      _showError('No camera detected on this device.');
    } else if (err.name === 'NotReadableError') {
      _showError('Camera is in use by another app.');
    } else {
      _showError('Unable to start the camera. Please try again.');
    }

    throw err;
  }
}

/**
 * Stop all active camera tracks and detach the stream from the video element.
 * Safe to call even if no camera is currently active.
 */
export function stopCamera() {
  if (_stream) {
    _stream.getTracks().forEach((track) => track.stop());
    _stream = null;
  }

  if (_videoEl) {
    _videoEl.srcObject = null;
    _videoEl = null;
  }

  _resetStabilizationOverlay();
  _clearError();
}

/**
 * Returns the active MediaStream, or null if the camera is not running.
 * @returns {MediaStream|null}
 */
export function getCameraStream() {
  return _stream;
}

/**
 * Returns true when the camera stream exists and at least one track is live.
 * @returns {boolean}
 */
export function isCameraActive() {
  return (
    _stream !== null &&
    _stream.getTracks().some((track) => track.readyState === 'live')
  );
}

/**
 * Returns true only after 2000ms have elapsed since the camera stream started.
 * Phase 4 agents must call this before processing any frames in the
 * requestAnimationFrame loop — do not start frame differencing during the
 * stabilization window.
 * @returns {boolean}
 */
export function isCameraReady() {
  if (_cameraStartTime === null) return false;
  return performance.now() - _cameraStartTime >= STABILITY_DELAY_MS;
}
