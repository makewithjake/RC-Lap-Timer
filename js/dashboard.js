import {
  startSession,
  recordTrigger,
  stopSession,
  resetSession,
  getCurrentLapElapsed,
  getTotalElapsed,
  getLaps,
  getBestLapIndex,
  getSessionStatus,
} from './session.js';

import {
  startDetection,
  stopDetection,
} from './detector.js';

import {
  stopCamera,
  getCameraStream,
} from './camera.js';

import {
  acquireWakeLock,
  releaseWakeLock,
} from './wakeLock.js';

import {
  playLapBeep,
  announceLap,
} from './audio.js';

import { showScreen } from './router.js';

// ── Time Formatting ───────────────────────────────────────────────────────────

/**
 * Formats a duration in milliseconds to "M:SS.mm" display format.
 * Examples: 5430 → "0:05.43"  |  75230 → "1:15.23"  |  0 → "0:00.00"
 * @param {number} ms
 * @returns {string}
 */
function _formatTime(ms) {
  if (ms < 0) ms = 0;
  const totalHundredths = Math.floor(ms / 10);
  const hundredths      = totalHundredths % 100;
  const totalSeconds    = Math.floor(ms / 1000);
  const seconds         = totalSeconds % 60;
  const minutes         = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '00')}`;
}

// ── Lap Table Rendering ───────────────────────────────────────────────────────

/**
 * Appends a single lap row to the table body.
 * @param {{ lapNumber: number, lapTime: number }} lap
 */
function _appendLapRow(lap) {
  const tbody = document.getElementById('dash-lap-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.dataset.lapNumber = lap.lapNumber;
  tr.dataset.best      = 'false';

  const tdNum  = document.createElement('td');
  const tdTime = document.createElement('td');
  const tdGap  = document.createElement('td');

  tdNum.textContent  = lap.lapNumber;
  tdTime.textContent = _formatTime(lap.lapTime);
  tdGap.className    = 'lap-gap-cell';
  tdGap.textContent  = '—';

  tr.appendChild(tdNum);
  tr.appendChild(tdTime);
  tr.appendChild(tdGap);
  tbody.appendChild(tr);

  tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Re-scans all rendered rows and updates data-best and gap text cells
 * to reflect the current best lap.
 */
function _refreshBestLapHighlight() {
  const laps    = getLaps();
  const bestIdx = getBestLapIndex();
  if (bestIdx === -1) return;

  const bestLapTime = laps[bestIdx].lapTime;
  const tbody       = document.getElementById('dash-lap-tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr[data-lap-number]');
  rows.forEach((row) => {
    const lapNum = parseInt(row.dataset.lapNumber, 10) - 1;
    const lap    = laps[lapNum];
    if (!lap) return;

    const isBest  = lapNum === bestIdx;
    const gapMs   = lap.lapTime - bestLapTime;
    const gapCell = row.querySelector('.lap-gap-cell');

    row.dataset.best = String(isBest);
    if (gapCell) {
      gapCell.textContent = isBest ? 'Best' : `+${_formatTime(gapMs)}`;
    }
  });
}

// ── Status Bar ────────────────────────────────────────────────────────────────

/**
 * Updates the "Lap X of Y" text in the status bar.
 * @param {number} lapCount
 * @param {number|null} goalLaps
 */
function _updateLapCounter(lapCount, goalLaps) {
  const el = document.getElementById('dash-lap-counter');
  if (!el) return;
  if (getSessionStatus() === 'waiting-for-first') {
    el.textContent = 'Waiting…';
    return;
  }
  el.textContent = goalLaps !== null
    ? `Lap ${lapCount} of ${goalLaps}`
    : `Lap ${lapCount}`;
}

// ── Big Clock RAF Loop ────────────────────────────────────────────────────────

let _clockRafId = null;

function _startClockRaf() {
  if (_clockRafId !== null) return;

  const bigClock  = document.getElementById('dash-big-clock');
  const totalTime = document.getElementById('dash-total-time');

  function _tick() {
    if (getSessionStatus() !== 'racing') {
      _clockRafId = null;
      return;
    }
    if (bigClock)  bigClock.textContent  = _formatTime(getCurrentLapElapsed());
    if (totalTime) totalTime.textContent = _formatTime(getTotalElapsed());
    _clockRafId = requestAnimationFrame(_tick);
  }

  _clockRafId = requestAnimationFrame(_tick);
}

function _stopClockRaf() {
  if (_clockRafId !== null) {
    cancelAnimationFrame(_clockRafId);
    _clockRafId = null;
  }
}

/**
 * Freeze the clock display at the provided time values.
 * @param {number} lapMs
 * @param {number} totalMs
 */
function _freezeClock(lapMs, totalMs) {
  _stopClockRaf();
  const bigClock  = document.getElementById('dash-big-clock');
  const totalTime = document.getElementById('dash-total-time');
  if (bigClock)  bigClock.textContent  = _formatTime(lapMs);
  if (totalTime) totalTime.textContent = _formatTime(totalMs);
}

// ── System Status Chip ────────────────────────────────────────────────────────

/**
 * Sets the system status chip to active or inactive.
 * @param {boolean} active
 */
function _setSystemStatus(active) {
  const el = document.getElementById('dash-system-status');
  if (!el) return;
  el.dataset.state = active ? 'active' : 'inactive';
  el.textContent   = active ? 'System Active' : 'System Stopped';
}

// ── Camera Toggle ─────────────────────────────────────────────────────────────

function _initCameraToggle() {
  const toggleBtn = document.getElementById('btn-dash-camera-toggle');
  const preview   = document.getElementById('dash-camera-preview');
  if (!toggleBtn || !preview) return;

  toggleBtn.addEventListener('click', () => {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';

    if (!isExpanded) {
      const stream = getCameraStream();
      if (stream) preview.srcObject = stream;
      preview.classList.remove('is-hidden');
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.textContent = 'Hide Camera';
    } else {
      preview.pause();
      preview.srcObject = null;
      preview.classList.add('is-hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.textContent = 'Show Camera';
    }
  });
}

// ── Session Teardown ──────────────────────────────────────────────────────────

/**
 * @param {{ lapMs: number, totalMs: number }} frozenTime
 */
function _handleStop(frozenTime) {
  stopSession();
  stopDetection();
  _stopClockRaf();
  _freezeClock(frozenTime.lapMs, frozenTime.totalMs);
  _setSystemStatus(false);

  stopCamera();
  releaseWakeLock();

  const laps    = getLaps();
  const bestIdx = getBestLapIndex();
  window.__rcSession = window.__rcSession ?? {};
  window.__rcSession.result = {
    laps,
    bestLapIndex:  bestIdx,
    totalTime:     frozenTime.totalMs,
    driverName:    window.__rcSession.meta?.driverName ?? '',
    carName:       window.__rcSession.meta?.carName    ?? '',
    location:      window.__rcSession.meta?.location   ?? '',
    timestamp:     Date.now(),
  };

  setTimeout(() => showScreen('home'), 1500);
}

function _handleReset(roi, detectionSettings) {
  _stopClockRaf();
  stopDetection();
  resetSession();

  const tbody = document.getElementById('dash-lap-tbody');
  if (tbody) tbody.innerHTML = '';

  const bigClock  = document.getElementById('dash-big-clock');
  const totalTime = document.getElementById('dash-total-time');
  if (bigClock)  bigClock.textContent  = '0:00.00';
  if (totalTime) totalTime.textContent = '0:00.00';

  _beginSession(roi, detectionSettings);
}

// ── Session Orchestration ─────────────────────────────────────────────────────

/**
 * @param {{ p1Norm, p2Norm, zoneWidthNorm }} roi
 * @param {{ sensitivity: number, debounce: number }} detectionSettings
 */
function _beginSession(roi, detectionSettings) {
  const goalLaps = window.__rcSession?.goalLaps ?? null;

  startSession({
    goalLaps,
    onFirstCross: () => {
      _startClockRaf();
      _updateLapCounter(0, goalLaps);
    },
    onLap: (lap, allLaps) => {
      playLapBeep();
      announceLap(lap.lapNumber, lap.lapTime);
      _appendLapRow(lap);
      _refreshBestLapHighlight();
      _updateLapCounter(allLaps.length, goalLaps);
    },
    onGoalMet: (allLaps) => {
      const lastLap = allLaps[allLaps.length - 1];
      const totalMs = getTotalElapsed();
      _handleStop({ lapMs: lastLap.lapTime, totalMs });
    },
  });

  const videoEl  = document.getElementById('viewfinder-video');
  const canvasEl = document.getElementById('viewfinder-canvas');

  startDetection({
    videoEl,
    canvasEl,
    roi,
    sensitivity: detectionSettings.sensitivity,
    debounce:    detectionSettings.debounce,
    onTrigger:   recordTrigger,
  });

  _updateLapCounter(0, goalLaps);
  _setSystemStatus(true);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the Race Dashboard screen.
 * Call once per entry into Screen 4 (called from app.js Confirm handler).
 *
 * @param {{
 *   roi:               { p1Norm, p2Norm, zoneWidthNorm },
 *   detectionSettings: { sensitivity: number, debounce: number },
 * }} config
 */
export function initDashboard(config) {
  const { roi, detectionSettings } = config;

  const stopBtn = document.getElementById('btn-dash-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      const totalMs = getTotalElapsed();
      const lapMs   = getCurrentLapElapsed();
      _handleStop({ lapMs, totalMs });
    }, { once: true });
  }

  const resetBtn = document.getElementById('btn-dash-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      _handleReset(roi, detectionSettings);
    });
  }

  _initCameraToggle();
  acquireWakeLock();
  _beginSession(roi, detectionSettings);
}
