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
      .register('/app/sw.js', { scope: '/app/' })
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
        if (_ledEl) _ledEl.dataset.state = 'active';
        if (_motionChipEl) {
          _motionChipEl.dataset.state = 'active';
          _motionChipEl.textContent   = '● Motion: ON';
        }
      } else {
        stopDetection();
        if (_ledEl) _ledEl.dataset.state = 'idle';
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
  const _ledEl        = document.getElementById('virtual-led');
  const _motionChipEl = document.getElementById('status-motion');
  const _flashEl      = document.getElementById('detection-flash');
  let _ledFlashTimer = null;

  function _activateVirtualLED() {
    if (!_ledEl) return;
    if (_ledFlashTimer !== null) clearTimeout(_ledFlashTimer);

    // LED circle
    _ledEl.dataset.state = 'triggered';
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
      _ledEl.dataset.state = 'active';
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
    if (_ledEl) _ledEl.dataset.state = 'active';
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
        initDashboard({ roi, detectionSettings: settings });
      };

      if (delayedStart) {
        showScreen('countdown');
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

  // ── Phase 5: Countdown helper ───────────────────────────────────────────────
  function _runCountdown(onComplete) {
    const digitEl = document.getElementById('countdown-digit');

    startCountdown({
      duration: 10,
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
          if (_ledEl) _ledEl.dataset.state = 'active';
        }
      },
    });
  }

  // 5. Clean up camera + wake lock when user leaves the page
  window.addEventListener('pagehide', () => {
    stopCamera();
    releaseWakeLock();
  });
});
