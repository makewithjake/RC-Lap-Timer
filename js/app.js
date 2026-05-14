import { showScreen } from './router.js';
import { initHome } from './home.js';
import { stopCamera } from './camera.js';
import {
  releaseWakeLock,
  setWakeLockStatusCallback,
  setCameraLockStatusCallback,
} from './wakeLock.js';
import { playBeep, speak } from './audio.js';
import {
  initCanvas,
  clearLine,
  hasCompleteLine,
  getROI,
  setZoneWidth as setCanvasZoneWidth,
  onLineChange,
} from './viewfinder.js';
import {
  setSensitivity,
  setDebounce,
  getZoneWidth,
  setZoneWidth,
  getAllSettings,
} from './calibration.js';
import { startDetection, stopDetection, isDetecting } from './detector.js';

// ── Status chip helpers ───────────────────────────────────────

function updateWakeLockChip(active) {
  const chip = document.getElementById('status-wake-lock');
  if (!chip) return;
  chip.textContent = active ? '🔒 Screen Active' : '🔓 Screen May Sleep';
  chip.dataset.state = active ? 'active' : 'inactive';
}

function updateCameraLockChip(locked) {
  const chip = document.getElementById('status-camera-lock');
  if (!chip) return;
  chip.textContent = locked ? '📷 Camera Stabilized' : '📷 Camera Auto';
  chip.dataset.state = locked ? 'active' : 'inactive';
}

// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered, scope:', registration.scope);
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err);
      });
  }

  // 2. Wire reactive status indicator callbacks
  setWakeLockStatusCallback(updateWakeLockChip);
  setCameraLockStatusCallback(updateCameraLockChip);

  // 3. Show default landing screen
  showScreen('home');

  // 4. Initialise Home Screen logic
  initHome();

  // ── Phase 3: Calibration slider wiring ────────────────────────────────────

  function _syncSliderFill(sliderEl) {
    const min = parseFloat(sliderEl.min);
    const max = parseFloat(sliderEl.max);
    const val = parseFloat(sliderEl.value);
    const pct = ((val - min) / (max - min)) * 100;
    sliderEl.style.setProperty('--slider-fill', `${pct.toFixed(1)}%`);
  }

  function _initCalibrationSliders() {
    const sliderSensitivity  = document.getElementById('slider-sensitivity');
    const sliderDebounce     = document.getElementById('slider-debounce');
    const sliderZoneWidth    = document.getElementById('slider-zone-width');
    const sensitivityDisplay = document.getElementById('sensitivity-value');
    const debounceDisplay    = document.getElementById('debounce-value');
    const zoneWidthDisplay   = document.getElementById('zone-width-value');

    // Initial fill sync (mirrors the HTML default values)
    _syncSliderFill(sliderSensitivity);
    _syncSliderFill(sliderDebounce);
    _syncSliderFill(sliderZoneWidth);

    sliderSensitivity.addEventListener('input', () => {
      const v = +sliderSensitivity.value;
      setSensitivity(v);
      sensitivityDisplay.textContent = `${v}%`;
      sliderSensitivity.setAttribute('aria-valuenow', v);
      _syncSliderFill(sliderSensitivity);
      _restartDetectionIfActive(); // Phase 4
    });

    sliderDebounce.addEventListener('input', () => {
      const v = parseFloat(sliderDebounce.value).toFixed(1);
      setDebounce(+v);
      debounceDisplay.textContent = `${v}s`;
      sliderDebounce.setAttribute('aria-valuenow', v);
      _syncSliderFill(sliderDebounce);
      _restartDetectionIfActive(); // Phase 4
    });

    sliderZoneWidth.addEventListener('input', () => {
      const v = +sliderZoneWidth.value;
      setZoneWidth(v);           // calibration.js state
      setCanvasZoneWidth(v);     // viewfinder.js canvas redraw
      zoneWidthDisplay.textContent = `${v}px`;
      sliderZoneWidth.setAttribute('aria-valuenow', v);
      _syncSliderFill(sliderZoneWidth);
      _restartDetectionIfActive(); // Phase 4 (zone width changes ROI geometry)
    });
  }

  // ── Phase 3: Canvas drawing init ───────────────────────────────────────

  function _initViewfinderCanvas() {
    const canvasEl   = document.getElementById('viewfinder-canvas');
    const videoEl    = document.getElementById('viewfinder-video');
    const confirmBtn = document.getElementById('viewfinder-confirm');
    const clearBtn   = document.getElementById('btn-clear-line');

    initCanvas(canvasEl, videoEl);

    // Confirm button and Clear button state: gated on line completeness
    onLineChange((hasLine) => {
      confirmBtn.disabled = !hasLine;
      clearBtn.classList.toggle('is-visible', hasLine);

      // Phase 4: Auto-start test mode when trigger line is complete; stop when cleared.
      if (hasLine) {
        const roi      = getROI();
        const settings = getAllSettings();
        startDetection({
          videoEl:     videoEl,
          canvasEl:    canvasEl,
          roi,
          sensitivity: settings.sensitivity,
          debounce:    settings.debounce,
          onTrigger:   _onDetectionTrigger,
        });
      } else {
        stopDetection();
      }
    });

    // Start disabled — a drawn line is required (supersedes Phase 2 stability-delay enable)
    confirmBtn.disabled = true;

    clearBtn.addEventListener('click', () => {
      clearLine(); // onLineChange callback fires automatically, updating button states
    });
  }

  // ── Phase 4: Virtual LED flash ────────────────────────────────────────────
  const _ledEl = document.getElementById('virtual-led');
  let _ledFlashTimer = null;

  /**
   * Flashes the Virtual LED for 300 ms.
   * If called during an active flash, the timer is reset to give a full 300 ms
   * from the most recent trigger — preventing the LED from cutting off early.
   */
  function _activateVirtualLED() {
    if (!_ledEl) return;
    if (_ledFlashTimer !== null) clearTimeout(_ledFlashTimer);
    _ledEl.dataset.active = 'true';
    _ledFlashTimer = setTimeout(() => {
      _ledEl.dataset.active = 'false';
      _ledFlashTimer = null;
    }, 300);
  }

  /** Single shared onTrigger callback used by both startDetection() call sites. */
  function _onDetectionTrigger() {
    _activateVirtualLED();
    playBeep();
  }

  // ── Phase 4: Restart detection with updated settings on slider change ────────
  function _restartDetectionIfActive() {
    if (!isDetecting()) return;
    stopDetection();
    const roi      = getROI();
    const settings = getAllSettings();
    if (roi === null) return; // Guard: line was cleared between isDetecting() and getROI()
    startDetection({
      videoEl:     document.getElementById('viewfinder-video'),
      canvasEl:    document.getElementById('viewfinder-canvas'),
      roi,
      sensitivity: settings.sensitivity,
      debounce:    settings.debounce,
      onTrigger:   _onDetectionTrigger,
    });
  }

  _initViewfinderCanvas();
  _initCalibrationSliders();

  // ── Phase 3: Confirm button navigation ─────────────────────────────────

  const confirmBtn = document.getElementById('viewfinder-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      stopDetection();             // Phase 4: tear down test mode before navigating

      const roi      = getROI();          // from viewfinder.js
      const settings = getAllSettings();  // from calibration.js

      // Temporary session holder for Phase 4/5 consumption.
      // Phase 5 will replace this with a proper session state module.
      window.__rcSession = { roi, settings };

      console.log('[Phase 3] Session state ready:', window.__rcSession);

      // Screen 'dashboard' does not yet exist; router silently no-ops until Phase 5.
      showScreen('dashboard');
    });
  }

  // 5. Clean up camera + wake lock when user leaves the page
  window.addEventListener('pagehide', () => {
    stopCamera();
    releaseWakeLock();
  });
});
