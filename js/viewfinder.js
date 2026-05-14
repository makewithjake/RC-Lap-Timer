// js/viewfinder.js — Task Group A: Canvas Overlay & Drawing Module (Phase 3)

// ── Module-level state ────────────────────────────────────────────────────────
let _canvas = null;
let _ctx = null;
let _videoEl = null;
let _points = [];           // Array of {x, y} in canvas pixel coords; max 2 items
let _draggingIndex = -1;    // Index of handle being dragged (-1 = none)
let _zoneWidthPx = 20;      // Kept in sync via setZoneWidth(); default 20
let _onLineChangeCb = null; // Registered via onLineChange()

// ── Private helpers ───────────────────────────────────────────────────────────

function _resizeCanvas() {
  const oldW = _canvas.width;
  const oldH = _canvas.height;

  _canvas.width = _canvas.offsetWidth;
  _canvas.height = _canvas.offsetHeight;

  if (_points.length > 0 && oldW > 0 && oldH > 0) {
    for (const p of _points) {
      p.x = p.x * (_canvas.width / oldW);
      p.y = p.y * (_canvas.height / oldH);
    }
  }

  _redraw();
}

function _hitTestHandle(x, y) {
  for (let i = 0; i < _points.length; i++) {
    const dx = _points[i].x - x;
    const dy = _points[i].y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= 24) {
      return i;
    }
  }
  return -1;
}

function _notify() {
  if (_onLineChangeCb) {
    _onLineChangeCb(hasCompleteLine());
  }
}

function _getCanvasPos(clientX, clientY) {
  const rect = _canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(_canvas.width,  clientX - rect.left)),
    y: Math.max(0, Math.min(_canvas.height, clientY - rect.top)),
  };
}

function _redraw() {
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  if (_points.length === 2) {
    const [p1, p2] = _points;

    // Zone band — rgba(198,255,0,0.25) = --color-accent at 25% opacity
    _ctx.beginPath();
    _ctx.moveTo(p1.x, p1.y);
    _ctx.lineTo(p2.x, p2.y);
    _ctx.lineWidth = _zoneWidthPx;
    _ctx.lineCap = 'round';
    _ctx.strokeStyle = 'rgba(198,255,0,0.25)'; // --color-accent at 25% opacity
    _ctx.stroke();

    // Center trigger line — #C6FF00 = --color-accent
    _ctx.beginPath();
    _ctx.moveTo(p1.x, p1.y);
    _ctx.lineTo(p2.x, p2.y);
    _ctx.lineWidth = 2;
    _ctx.lineCap = 'round';
    _ctx.strokeStyle = '#C6FF00'; // --color-accent
    _ctx.stroke();
  }

  // Handle circles for each placed point
  for (const p of _points) {
    _ctx.beginPath();
    _ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    _ctx.fillStyle = '#C6FF00'; // --color-accent
    _ctx.fill();
    _ctx.lineWidth = 2;
    _ctx.strokeStyle = '#000000';
    _ctx.stroke();
  }
}

// ── Touch event handlers ──────────────────────────────────────────────────────

function _onTouchStart(event) {
  event.preventDefault();
  const touch = event.changedTouches[0];
  const { x, y } = _getCanvasPos(touch.clientX, touch.clientY);

  if (_points.length < 2) {
    _points.push({ x, y });
    _redraw();
    _notify();
  } else {
    const idx = _hitTestHandle(x, y);
    if (idx >= 0) {
      _draggingIndex = idx;
    }
  }
}

function _onTouchMove(event) {
  event.preventDefault();
  if (_draggingIndex === -1) return;
  const touch = event.changedTouches[0];
  const { x, y } = _getCanvasPos(touch.clientX, touch.clientY);
  _points[_draggingIndex] = { x, y };
  _redraw();
}

function _onTouchEnd() {
  _draggingIndex = -1;
}

// ── Mouse event handlers ──────────────────────────────────────────────────────

function _onMouseDown(event) {
  const { x, y } = _getCanvasPos(event.clientX, event.clientY);

  if (_points.length < 2) {
    _points.push({ x, y });
    _redraw();
    _notify();
  } else {
    const idx = _hitTestHandle(x, y);
    if (idx >= 0) {
      _draggingIndex = idx;
    }
  }
}

function _onMouseMove(event) {
  if (_draggingIndex === -1) return;
  const { x, y } = _getCanvasPos(event.clientX, event.clientY);
  _points[_draggingIndex] = { x, y };
  _redraw();
}

function _onMouseUp() {
  _draggingIndex = -1;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * A1 — Initialize the canvas overlay.
 * Call once after the Viewfinder screen is active and the camera stream has started.
 * @param {HTMLCanvasElement} canvasEl
 * @param {HTMLVideoElement}  videoEl
 */
export function initCanvas(canvasEl, videoEl) {
  _canvas = canvasEl;
  _ctx = canvasEl.getContext('2d');
  _videoEl = videoEl;

  _resizeCanvas();

  window.addEventListener('resize', _resizeCanvas);

  // Belt-and-suspenders for iOS Safari (CSS also sets touch-action: none)
  canvasEl.style.touchAction = 'none';

  // Touch events (passive: false to allow preventDefault)
  canvasEl.addEventListener('touchstart', _onTouchStart, { passive: false });
  canvasEl.addEventListener('touchmove',  _onTouchMove,  { passive: false });
  canvasEl.addEventListener('touchend',   _onTouchEnd);

  // Mouse events
  canvasEl.addEventListener('mousedown', _onMouseDown);
  canvasEl.addEventListener('mousemove', _onMouseMove);
  canvasEl.addEventListener('mouseup',   _onMouseUp);

  _redraw();
}

/**
 * A5 — Clear the drawn line; reset state; fire change callback.
 */
export function clearLine() {
  _points = [];
  _redraw();
  _notify();
}

/**
 * A5 — Returns true when both endpoints have been placed.
 * @returns {boolean}
 */
export function hasCompleteLine() {
  return _points.length === 2;
}

/**
 * A4 — Returns normalized ROI data, or null if the line is not complete.
 * @returns {{ p1Norm: {x: number, y: number}, p2Norm: {x: number, y: number}, zoneWidthNorm: number } | null}
 */
export function getROI() {
  if (_points.length < 2) return null;

  const p1Norm        = { x: _points[0].x / _canvas.width,  y: _points[0].y / _canvas.height };
  const p2Norm        = { x: _points[1].x / _canvas.width,  y: _points[1].y / _canvas.height };
  // Zone width normalized to canvas height — Phase 4 recovers pixel width via zoneWidthNorm × canvas.height
  const zoneWidthNorm = _zoneWidthPx / _canvas.height;

  return { p1Norm, p2Norm, zoneWidthNorm };
}

/**
 * A5 — Update the zone band width (in pixels) and redraw.
 * @param {number} px
 */
export function setZoneWidth(px) {
  _zoneWidthPx = px;
  _redraw();
}

/**
 * A5 — Register a callback to be fired whenever the line state changes.
 * @param {(hasLine: boolean) => void} callback
 */
export function onLineChange(callback) {
  _onLineChangeCb = callback;
}
