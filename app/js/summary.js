/**
 * summary.js — Post-Session Summary Screen (Phase 6, Task Group B)
 *
 * Exports:
 *   initSummary()  — wire event listeners once at app startup
 *   showSummary()  — entry point called by app.js when a session ends
 *   computeStats() — pure stats computation
 *   renderChart()  — SVG lap-time line chart renderer
 */

import { buildSessionRecord, saveSession } from './storage.js';
import { showScreen } from './router.js';

// ── B1 — Lap Time Formatter ───────────────────────────────────────────────────

/**
 * Formats a lap time in milliseconds to a human-readable string.
 * Under 60 s → "45.234"
 * 60 s or over → "1:12.034"
 * @param {number} ms
 * @returns {string}
 */
function _formatLapTime(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(3);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}

// ── B2 — Stats Computation ────────────────────────────────────────────────────

/**
 * Computes session statistics from raw lap data.
 * Source laps use `lapTime` (not `lapTimeMs`) — this matches the session.js contract.
 * Average is derived from completed lap durations only (not external total time).
 *
 * @param {Array<{ lapTime: number }>} laps
 * @returns {{ bestLapMs: number, avgLapMs: number, consistencyScore: number }}
 */
export function computeStats(laps) {
  if (!laps || laps.length === 0) {
    return { bestLapMs: 0, avgLapMs: 0, consistencyScore: 0 };
  }

  const bestLapMs = Math.min(...laps.map((l) => l.lapTime));
  const totalLapMs = laps.reduce((acc, l) => acc + l.lapTime, 0);
  const avgLapMs   = Math.round(totalLapMs / laps.length);
  const consistencyScore = Math.round(
    Math.sqrt(
      laps.reduce((acc, l) => acc + (l.lapTime - avgLapMs) ** 2, 0) / laps.length
    )
  );

  return { bestLapMs, avgLapMs, consistencyScore };
}

// ── B3 — SVG Performance Chart ────────────────────────────────────────────────

/**
 * Clears and re-renders the lap time line chart into svgEl.
 * All visual styling is applied via CSS class names — no inline stroke/fill.
 *
 * @param {SVGSVGElement} svgEl
 * @param {Array<{ lapTime: number, lapNumber: number }>} laps  — source laps (lapTime, not lapTimeMs)
 * @param {number} bestLapMs
 */
export function renderChart(svgEl, laps, bestLapMs) {
  // Clear existing content
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  svgEl.setAttribute('viewBox', '0 0 300 150');
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  if (!laps || laps.length === 0) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Plot area: left=40, top=12, right=284, bottom=120
  const plotLeft   = 40;
  const plotTop    = 12;
  const plotRight  = 284;
  const plotBottom = 120;
  const plotW      = plotRight - plotLeft;  // 244
  const plotH      = plotBottom - plotTop;  // 108

  // Y scale: add 8% padding
  const lapTimes = laps.map((l) => l.lapTime);
  const rawMin   = Math.min(...lapTimes);
  const rawMax   = Math.max(...lapTimes);
  const range    = rawMax - rawMin || 1; // avoid division by zero
  const pad      = range * 0.08;
  const paddedMin = rawMin - pad;
  const paddedMax = rawMax + pad;
  const paddedRange = paddedMax - paddedMin;

  function xOf(lapNumber) {
    if (laps.length === 1) return plotLeft + plotW / 2;
    return plotLeft + ((lapNumber - 1) / (laps.length - 1)) * plotW;
  }

  function yOf(lapTimeMs) {
    return plotBottom - ((lapTimeMs - paddedMin) / paddedRange) * plotH;
  }

  // ── Grid lines (4 horizontal dashed lines at 25%, 50%, 75%, 100%) ──
  [0.25, 0.5, 0.75, 1.0].forEach((pct) => {
    const y = plotBottom - pct * plotH;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', plotLeft);
    line.setAttribute('y1', y);
    line.setAttribute('x2', plotRight);
    line.setAttribute('y2', y);
    line.setAttribute('class', 'chart-grid');
    svgEl.appendChild(line);
  });

  // ── Polyline ──
  const points = laps
    .map((l) => `${xOf(l.lapNumber).toFixed(1)},${yOf(l.lapTime).toFixed(1)}`)
    .join(' ');
  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('class', 'chart-line');
  svgEl.appendChild(polyline);

  // ── Data points ──
  laps.forEach((l) => {
    const cx   = xOf(l.lapNumber);
    const cy   = yOf(l.lapTime);
    const isBest = l.lapTime === bestLapMs;

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', cx.toFixed(1));
    circle.setAttribute('cy', cy.toFixed(1));
    circle.setAttribute('r', '5');
    circle.setAttribute('class', isBest ? 'chart-dot chart-dot--best' : 'chart-dot');
    svgEl.appendChild(circle);
  });

  // ── X-axis labels: lap 1, midpoint, last ──
  const xLabelLaps = [1];
  if (laps.length > 2) {
    xLabelLaps.push(Math.round((laps.length + 1) / 2));
  }
  if (laps.length > 1) {
    xLabelLaps.push(laps.length);
  }
  // deduplicate
  [...new Set(xLabelLaps)].forEach((lapNum) => {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', xOf(lapNum).toFixed(1));
    text.setAttribute('y', '138');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart-label-x');
    text.textContent = lapNum;
    svgEl.appendChild(text);
  });

  // ── Y-axis labels: paddedMin and paddedMax ──
  [[paddedMin, plotBottom], [paddedMax, plotTop]].forEach(([ms, y]) => {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', '36');
    text.setAttribute('y', y.toFixed(1));
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'chart-label-y');
    text.textContent = _formatLapTime(Math.max(0, ms));
    svgEl.appendChild(text);
  });
}

// ── B4 — Screen Initialization ────────────────────────────────────────────────

let _initialized = false;

/**
 * Wire event listeners once at app startup. Idempotent.
 */
export function initSummary() {
  if (_initialized) return;
  _initialized = true;

  document.getElementById('btn-save-session').addEventListener('click', () => {
    if (window.__rcSession?.result) {
      const record = buildSessionRecord(window.__rcSession.result);
      saveSession(record);
    }
    window.__rcSession = null;
    showScreen('home');
  });

  document.getElementById('btn-discard-session').addEventListener('click', () => {
    window.__rcSession = null;
    showScreen('home');
  });

  document.getElementById('btn-restart-session').addEventListener('click', () => {
    window.__rcSession = null;
    showScreen('viewfinder');
  });
}

// ── B5 — Screen Entry ─────────────────────────────────────────────────────────

/**
 * Populates and shows the post-session summary screen.
 * @param {Object} rawSession — window.__rcSession.result at time of stop
 */
export function showSummary(rawSession) {
  if (!rawSession) {
    console.warn('[summary] showSummary called with no rawSession — redirecting to home');
    showScreen('home');
    return;
  }

  // Meta line
  const metaEl = document.getElementById('summary-meta');
  if (metaEl) {
    const parts = [rawSession.driverName, rawSession.carName, rawSession.location]
      .filter(Boolean);
    metaEl.textContent = parts.join(' · ');
  }

  // Stats
  const { bestLapMs, avgLapMs, consistencyScore } = computeStats(rawSession.laps);

  const fastestEl = document.getElementById('stat-fastest');
  const avgEl     = document.getElementById('stat-avg');
  const consEl    = document.getElementById('stat-consistency');

  if (fastestEl) {
    const formatted = _formatLapTime(bestLapMs);
    fastestEl.textContent = bestLapMs < 60000 ? `${formatted}s` : formatted;
  }
  if (avgEl) {
    const formatted = _formatLapTime(avgLapMs);
    avgEl.textContent = avgLapMs < 60000 ? `${formatted}s` : formatted;
  }
  if (consEl) {
    consEl.textContent = `±${consistencyScore}ms`;
  }

  // Chart
  const svgEl = document.getElementById('summary-chart');
  // Intentionally render on empty laps too so stale SVG content gets cleared.
  if (svgEl) {
    renderChart(svgEl, rawSession.laps, bestLapMs);
  }

  showScreen('summary');
}


