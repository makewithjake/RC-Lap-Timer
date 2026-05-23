import { showScreen, currentScreen } from './router.js';
import { getSettings, saveSettings } from './storage.js';
import { initHome } from './home.js';
import { initSummary } from './summary.js';
import { initHistory } from './history.js';
import { initSettings } from './settings.js';
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
import { startCountdown, cancelCountdown } from './countdown.js';
import { initDashboard } from './dashboard.js';

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
      .register('./sw.js')
      .then(() => {
        // Service Worker registered successfully
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

  // 5. Initialise Phase 6 screens
  initSummary();
  initHistory();
  initSettings();

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

    // Restore persisted calibration values from localStorage (rc_sensitivity, rc_debounce, rc_zoneWidth)
    const storedSensitivity = localStorage.getItem('rc_sensitivity');
    const storedDebounce    = localStorage.getItem('rc_debounce');
    const storedZoneWidth   = localStorage.getItem('rc_zoneWidth');

    if (storedSensitivity !== null) {
      const v = parseInt(storedSensitivity, 10);
      setSensitivity(v);
      sliderSensitivity.value = v;
      if (sensitivityDisplay) sensitivityDisplay.textContent = `${v}%`;
      sliderSensitivity.setAttribute('aria-valuenow', v);
    }
    if (storedDebounce !== null) {
      const v = parseFloat(storedDebounce);
      setDebounce(v);
      sliderDebounce.value = v;
      if (debounceDisplay) debounceDisplay.textContent = `${v.toFixed(1)}s`;
      sliderDebounce.setAttribute('aria-valuenow', v.toFixed(1));
    }
    if (storedZoneWidth !== null) {
      const v = parseInt(storedZoneWidth, 10);
      setZoneWidth(v);
      setCanvasZoneWidth(v);
      sliderZoneWidth.value = v;
      if (zoneWidthDisplay) zoneWidthDisplay.textContent = `${v}px`;
      sliderZoneWidth.setAttribute('aria-valuenow', v);
    }

    // Initial fill sync (uses current slider values, restored or default)
    _syncSliderFill(sliderSensitivity);
    _syncSliderFill(sliderDebounce);
    _syncSliderFill(sliderZoneWidth);

    sliderSensitivity.addEventListener('input', () => {
      const v = +sliderSensitivity.value;
      setSensitivity(v);
      sensitivityDisplay.textContent = `${v}%`;
      sliderSensitivity.setAttribute('aria-valuenow', v);
      _syncSliderFill(sliderSensitivity);
      localStorage.setItem('rc_sensitivity', String(v));
      _restartDetectionIfActive(); // Phase 4
    });

    sliderDebounce.addEventListener('input', () => {
      const v = parseFloat(sliderDebounce.value).toFixed(1);
      setDebounce(+v);
      debounceDisplay.textContent = `${v}s`;
      sliderDebounce.setAttribute('aria-valuenow', v);
      _syncSliderFill(sliderDebounce);
      localStorage.setItem('rc_debounce', v);
      _restartDetectionIfActive(); // Phase 4
    });

    sliderZoneWidth.addEventListener('input', () => {
      const v = +sliderZoneWidth.value;
      setZoneWidth(v);           // calibration.js state
      setCanvasZoneWidth(v);     // viewfinder.js canvas redraw
      zoneWidthDisplay.textContent = `${v}px`;
      sliderZoneWidth.setAttribute('aria-valuenow', v);
      _syncSliderFill(sliderZoneWidth);
      localStorage.setItem('rc_zoneWidth', String(v));
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
        if (_motionChipEl) {
          _motionChipEl.dataset.state = 'active';
          _motionChipEl.textContent   = '● Motion: ON';
        }
      } else {
        stopDetection();
        if (_motionChipEl) {
          _motionChipEl.dataset.state = 'idle';
          _motionChipEl.textContent   = '● Motion: OFF';
        }
      }
    });

    // Start disabled — a drawn line is required (supersedes Phase 2 stability-delay enable)
    confirmBtn.disabled = true;

    clearBtn.addEventListener('click', () => {
      clearLine(); // onLineChange callback fires automatically, updating button states
    });
  }

  // ── Phase 4: Virtual LED flash ────────────────────────────────────────────
  const _motionChipEl = document.getElementById('status-motion');
  const _flashEl      = document.getElementById('detection-flash');
  let _ledFlashTimer = null;

  function _activateVirtualLED() {
    if (_ledFlashTimer !== null) clearTimeout(_ledFlashTimer);

    // HUD chip
    if (_motionChipEl) {
      _motionChipEl.dataset.state = 'triggered';
      _motionChipEl.textContent   = '● DETECTED!';
    }
    // Full-screen green flash
    if (_flashEl) {
      _flashEl.classList.add('is-active');
    }

    _ledFlashTimer = setTimeout(() => {
      if (_motionChipEl) {
        _motionChipEl.dataset.state = 'active';
        _motionChipEl.textContent   = '● Motion: ON';
      }
      if (_flashEl) _flashEl.classList.remove('is-active');
      _ledFlashTimer = null;
    }, 600);
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
    if (_motionChipEl) {
      _motionChipEl.dataset.state = 'active';
      _motionChipEl.textContent   = '● Motion: ON';
    }
  }

  function _readViewfinderSessionConfig() {
    const toggleEl   = document.getElementById('toggle-delayed-start');
    const goalLapsEl = document.getElementById('input-goal-laps');

    const delayedStart = toggleEl?.getAttribute('aria-checked') === 'true' ?? false;
    const rawGoal      = goalLapsEl?.value?.trim();
    const goalLaps     = rawGoal && !isNaN(parseInt(rawGoal, 10))
      ? Math.max(1, parseInt(rawGoal, 10))
      : null;

    return { delayedStart, goalLaps };
  }

  _initViewfinderCanvas();
  _initCalibrationSliders();

  // ── Phase 5: Delayed Start toggle wiring ──────────────────────────────────
  const _delayedStartBtn   = document.getElementById('toggle-delayed-start');
  const _delayedStartLabel = document.getElementById('delayed-start-value');

  if (_delayedStartBtn) {
    _delayedStartBtn.addEventListener('click', () => {
      const isActive = _delayedStartBtn.getAttribute('aria-checked') === 'true';
      const next     = !isActive;
      _delayedStartBtn.setAttribute('aria-checked', String(next));
      _delayedStartBtn.dataset.active = String(next);
      if (_delayedStartLabel) _delayedStartLabel.textContent = next ? 'On' : 'Off';
    });
  }

  // ── Countdown duration input (viewfinder) ───────────────────────────────────
  const _countdownInput = document.getElementById('input-countdown-duration');
  if (_countdownInput) {
    // Hydrate from stored settings
    _countdownInput.value = getSettings().countdownDuration;
    // Persist on change
    _countdownInput.addEventListener('change', () => {
      const v = Math.max(1, Math.min(60, parseInt(_countdownInput.value, 10) || 10));
      _countdownInput.value = v;
      saveSettings({ countdownDuration: v });
    });
  }

  const _goalLapsInput = document.getElementById('input-goal-laps');
  const _goalLapsLabel = document.getElementById('goal-laps-value');

  if (_goalLapsInput) {
    _goalLapsInput.addEventListener('input', () => {
      const v = _goalLapsInput.value.trim();
      if (_goalLapsLabel) {
        _goalLapsLabel.textContent = v && !isNaN(parseInt(v, 10)) ? `${parseInt(v, 10)} laps` : '∞';
      }
    });
  }

  // ── Phase 3: Confirm button navigation ─────────────────────────────────

  const confirmBtn = document.getElementById('viewfinder-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      stopDetection(); // Phase 4: tear down test mode

      const roi      = getROI();
      const settings = getAllSettings();
      const { delayedStart, goalLaps } = _readViewfinderSessionConfig();

      const driverName = document.getElementById('input-driver-name')?.value.trim() ?? '';
      const carName    = document.getElementById('input-car-name')?.value.trim()    ?? '';
      const location   = document.getElementById('input-location')?.value.trim()    ?? '';

      window.__rcSession = {
        roi,
        settings,
        goalLaps,
        delayedStart,
        meta: { driverName, carName, location },
      };

      const _enterDashboard = () => {
        showScreen('dashboard');
        history.pushState({ screen: 'dashboard' }, '');
        initDashboard({ roi, detectionSettings: settings });
      };

      if (delayedStart) {
        showScreen('countdown');
        history.pushState({ screen: 'countdown' }, '');
        _runCountdown(_enterDashboard);
      } else {
        _enterDashboard();
      }
    });
  }

  // ── Stub screen back buttons ────────────────────────────────────────────────
  document.getElementById('btn-history-back')?.addEventListener('click', () => showScreen('home'));
  document.getElementById('btn-settings-back')?.addEventListener('click', () => showScreen('home'));

  // ── Phase 5: Cancel button — wired once at init so it always works ─────────
  const _cancelCountdownBtn = document.getElementById('btn-cancel-countdown');
  if (_cancelCountdownBtn) {
    _cancelCountdownBtn.addEventListener('click', () => {
      cancelCountdown();
    });
  }
  // ── Phase 7.5: Viewfinder help popup ───────────────────────────────────────
  document.getElementById('btn-viewfinder-help')?.addEventListener('click', () => {
    document.getElementById('viewfinder-help-modal')?.removeAttribute('hidden');
  });
  document.getElementById('btn-help-close')?.addEventListener('click', () => {
    document.getElementById('viewfinder-help-modal')?.setAttribute('hidden', '');
  });
  // ── Phase 5: Countdown helper ───────────────────────────────────────────────
  function _runCountdown(onComplete) {
    const digitEl = document.getElementById('countdown-digit');

    startCountdown({
      duration: parseInt(document.getElementById('input-countdown-duration')?.value, 10) || getSettings().countdownDuration,
      onTick: (n) => {
        if (!digitEl) return;
        digitEl.classList.add('is-ticking');
        requestAnimationFrame(() => {
          digitEl.textContent = n === 0 ? 'GO!' : String(n);
          requestAnimationFrame(() => digitEl.classList.remove('is-ticking'));
        });
        if (n === 0) {
          import('./audio.js').then(({ playFinalBeep }) => playFinalBeep());
        } else {
          import('./audio.js').then(({ playCountdownBeep }) => playCountdownBeep());
        }
      },
      onComplete: () => {
        onComplete();
      },
      onCancel: () => {
        showScreen('viewfinder');
        history.pushState({ screen: 'viewfinder' }, '');
        const roi      = getROI();
        const settings = getAllSettings();
        if (roi && hasCompleteLine()) {
          startDetection({
            videoEl:     document.getElementById('viewfinder-video'),
            canvasEl:    document.getElementById('viewfinder-canvas'),
            roi,
            sensitivity: settings.sensitivity,
            debounce:    settings.debounce,
            onTrigger:   _onDetectionTrigger,
          });
        }
      },
    });
  }

  // 6. Handle back swipe / device back button
  window.addEventListener('popstate', () => {
    const screen = currentScreen();
    if (screen === 'viewfinder') {
      stopDetection();
      clearLine();
      stopCamera();
      releaseWakeLock();
      showScreen('home');
    } else if (screen === 'countdown' || screen === 'dashboard') {
      history.pushState({ screen }, '');
    }
  });

  // 7. Clean up camera + wake lock when user leaves the page
  window.addEventListener('pagehide', () => {
    stopCamera();
    releaseWakeLock();
  });
});
