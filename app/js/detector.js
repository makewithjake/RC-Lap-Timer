import { computeDisplayRect, normalizeFitMode } from './videoTransform.js';

// ── Detection constants ───────────────────────────────────────────────────────
/**
 * Minimum fraction of in-zone pixels that must exceed the per-pixel luminance
 * change threshold to fire a trigger event. Fixed at 5%.
 * A passing RC car changes 10–30% of zone pixels; ambient shadows change ~1–2%.
 */
const TRIGGER_RATIO = 0.05;

// ── Runtime state ─────────────────────────────────────────────────────────────
let _rafId        = null;      // requestAnimationFrame handle; non-null = loop is running
let _hiddenCanvas = null;      // Off-screen HTMLCanvasElement sized to the ROI bounding box
let _hiddenCtx    = null;      // 2D context for _hiddenCanvas
let _prevPixels   = null;      // Float32Array — luminance values from the previous frame
let _currPixels   = null;      // Float32Array — luminance values from the current frame (reused)
let _roiPx        = null;      // Computed ROI geometry in pixel space (see _computeROIPixels)
let _sampleRect   = null;      // Precomputed source/destination mapping for ROI sampling
let _config          = null;      // Frozen config object set in startDetection()
let _lastTrigger     = -Infinity; // performance.now() timestamp of the last fired trigger
let _resumeAttempted = false;     // Guard: prevents repeated play() calls while awaiting resume
let _debugFrameCount = 0;         // Monotonic counter for throttled diagnostic logging

// ── A2 — ROI Pixel Space Computation ─────────────────────────────────────────

/**
 * Converts normalized ROI → pixel-space geometry relative to the display canvas.
 *
 * @param {{ p1Norm: {x,y}, p2Norm: {x,y}, zoneWidthNorm: number }} roi
 * @param {number} displayW   canvas.width snapshotted at startDetection() time
 * @param {number} displayH   canvas.height snapshotted at startDetection() time
 * @returns {{
 *   p1:       { x: number, y: number },
 *   p2:       { x: number, y: number },
 *   halfZone: number,
 *   left:     number,
 *   top:      number,
 *   width:    number,
 *   height:   number,
 * }}
 */
function _computeROIPixels(roi, displayW, displayH) {
  const p1x      = roi.p1Norm.x * displayW;
  const p1y      = roi.p1Norm.y * displayH;
  const p2x      = roi.p2Norm.x * displayW;
  const p2y      = roi.p2Norm.y * displayH;
  const halfZone = (roi.zoneWidthNorm * displayH) / 2;

  const rawLeft   = Math.min(p1x, p2x) - halfZone;
  const rawTop    = Math.min(p1y, p2y) - halfZone;
  const rawRight  = Math.max(p1x, p2x) + halfZone;
  const rawBottom = Math.max(p1y, p2y) + halfZone;

  const left   = Math.max(0, Math.floor(rawLeft));
  const top    = Math.max(0, Math.floor(rawTop));
  const right  = Math.min(displayW, Math.ceil(rawRight));
  const bottom = Math.min(displayH, Math.ceil(rawBottom));

  return {
    p1:       { x: p1x, y: p1y },
    p2:       { x: p2x, y: p2y },
    halfZone,
    left,
    top,
    width:    Math.max(1, right  - left),
    height:   Math.max(1, bottom - top),
  };
}

// ── A3 — Zone Membership Test ─────────────────────────────────────────────────

/**
 * @param {number} px      x coordinate relative to _roiPx.left (0 = bbox left edge)
 * @param {number} py      y coordinate relative to _roiPx.top  (0 = bbox top  edge)
 * @param {{ p1, p2, halfZone, left, top }} roiPx
 * @returns {boolean}
 */
function _isInZone(px, py, roiPx) {
  // Translate back to canvas pixel space for the distance calculation
  const cx = px + roiPx.left;
  const cy = py + roiPx.top;

  const ax = roiPx.p1.x;
  const ay = roiPx.p1.y;
  const bx = roiPx.p2.x;
  const by = roiPx.p2.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let perpDistSq;
  if (lenSq === 0) {
    // Degenerate: p1 === p2 — treat zone as a circle centred on p1
    perpDistSq = (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay);
  } else {
    // Project (cx, cy) onto the infinite line through A and B, clamped to [0, 1]
    const t     = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    perpDistSq  = (cx - projX) * (cx - projX) + (cy - projY) * (cy - projY);
  }

  return perpDistSq <= roiPx.halfZone * roiPx.halfZone;
}

// ── A4 — Luminance Helper ─────────────────────────────────────────────────────

/**
 * BT.601 luminance (gamma-encoded approximation).
 * @param {number} r  0–255
 * @param {number} g  0–255
 * @param {number} b  0–255
 * @returns {number}  0–255
 */
function _luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Computes source-video and destination-hidden-canvas rectangles for drawing
 * the portion of the ROI that overlaps the displayed video.
 *
 * @param {{ left:number, top:number, width:number, height:number }} roiPx
 * @param {{ scale:number, offsetX:number, offsetY:number, displayWidth:number, displayHeight:number }} displayRect
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @returns {{
 *   sx:number, sy:number, sw:number, sh:number,
 *   dx:number, dy:number, dw:number, dh:number
 * } | null}
 */
function _computeSampleRect(roiPx, displayRect, videoWidth, videoHeight) {
  const roiLeft = roiPx.left;
  const roiTop = roiPx.top;
  const roiRight = roiPx.left + roiPx.width;
  const roiBottom = roiPx.top + roiPx.height;

  const videoLeft = displayRect.offsetX;
  const videoTop = displayRect.offsetY;
  const videoRight = displayRect.offsetX + displayRect.displayWidth;
  const videoBottom = displayRect.offsetY + displayRect.displayHeight;

  const overlapLeft = Math.max(roiLeft, videoLeft);
  const overlapTop = Math.max(roiTop, videoTop);
  const overlapRight = Math.min(roiRight, videoRight);
  const overlapBottom = Math.min(roiBottom, videoBottom);

  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return null;

  const sx = Math.max(0, (overlapLeft - displayRect.offsetX) / displayRect.scale);
  const sy = Math.max(0, (overlapTop - displayRect.offsetY) / displayRect.scale);
  const sw = Math.min(videoWidth, (overlapRight - displayRect.offsetX) / displayRect.scale) - sx;
  const sh = Math.min(videoHeight, (overlapBottom - displayRect.offsetY) / displayRect.scale) - sy;

  if (sw <= 0 || sh <= 0) return null;

  const dx = overlapLeft - roiLeft;
  const dy = overlapTop - roiTop;
  const dw = overlapRight - overlapLeft;
  const dh = overlapBottom - overlapTop;

  return { sx, sy, sw, sh, dx, dy, dw, dh };
}

// ── A5 — RAF Tick ─────────────────────────────────────────────────────────────

function _tick() {
  const { videoEl, sensitivity, debounce, onTrigger } = _config;

  // Step 1: Guard — video not ready
  if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    _debugFrameCount++;
    if (_debugFrameCount % 60 === 0) {
      console.warn(
        `[detector] WAITING frame=${_debugFrameCount}` +
        ` readyState=${videoEl.readyState} videoWidth=${videoEl.videoWidth}` +
        ` paused=${videoEl.paused} srcObject=${videoEl.srcObject ? 'set' : 'null'}`
      );
    }
    _rafId = requestAnimationFrame(_tick);
    return;
  }

  // Step 1b: Guard — video paused (iOS Safari pauses <video> when its containing
  // element gets display:none, e.g. when the viewfinder section is hidden behind
  // the dashboard). A paused video returns the same frozen frame on every
  // drawImage call → changeRatio stays 0 → onTrigger never fires.
  if (videoEl.paused) {
    if (!_resumeAttempted) {
      _resumeAttempted = true;
      videoEl.play()
        .then(() => { _resumeAttempted = false; })
        .catch(() => { _resumeAttempted = false; });
    }
    _rafId = requestAnimationFrame(_tick);
    return;
  }
  _resumeAttempted = false; // Video is playing — clear the one-shot flag

  try {

  // Step 2: Draw ROI crop to hidden canvas (transform-aware for contain/cover)
  _hiddenCtx.clearRect(0, 0, _roiPx.width, _roiPx.height);
  if (_sampleRect !== null) {
    _hiddenCtx.drawImage(
      videoEl,
      _sampleRect.sx, _sampleRect.sy,
      _sampleRect.sw, _sampleRect.sh,
      _sampleRect.dx, _sampleRect.dy,
      _sampleRect.dw, _sampleRect.dh
    );
  }

  // Step 3: Sample pixels
  const imgData = _hiddenCtx.getImageData(0, 0, _roiPx.width, _roiPx.height);
  const data    = imgData.data;

  // Step 4: Per-pixel threshold
  // sensitivity ∈ [1, 100]; higher = more sensitive = lower per-pixel threshold
  const pixelChangeThreshold = (100 - sensitivity) * 2.55;

  // Step 5: Luminance differencing loop
  let inZoneCount  = 0;
  let changedCount = 0;

  for (let py = 0; py < _roiPx.height; py++) {
    for (let px = 0; px < _roiPx.width; px++) {
      if (!_isInZone(px, py, _roiPx)) continue;
      inZoneCount++;
      const i   = (py * _roiPx.width + px) * 4;
      const lum = _luminance(data[i], data[i + 1], data[i + 2]);
      _currPixels[py * _roiPx.width + px] = lum;
      if (
        _prevPixels !== null &&
        Math.abs(lum - _prevPixels[py * _roiPx.width + px]) > pixelChangeThreshold
      ) {
        changedCount++;
      }
    }
  }

  // Step 6: Trigger decision
  if (_prevPixels !== null && inZoneCount > 0) {
    const changeRatio = changedCount / inZoneCount;
    const now = performance.now();
    if (changeRatio >= TRIGGER_RATIO && (now - _lastTrigger) / 1000 >= debounce) {
      _lastTrigger = now;
      try { onTrigger(); } catch (e) { console.error('[detector] onTrigger threw:', e); }
    }
  }

  // Step 7: Swap pixel buffers.
  // On the very first tick _prevPixels is null — allocate the second buffer now
  // so both buffers exist from frame 2 onward. From frame 2 onward a plain swap
  // reuses both pre-allocated arrays with zero new allocation.
  if (_prevPixels === null) {
    _prevPixels = _currPixels;
    _currPixels = new Float32Array(_prevPixels.length);
  } else {
    [_prevPixels, _currPixels] = [_currPixels, _prevPixels];
  }

  } catch (e) {
    console.error('[detector] _tick error (loop kept alive):', e);
  }

  // Step 8: Reschedule — always outside try/catch so the loop survives any error
  _rafId = requestAnimationFrame(_tick);
}

// ── A6 — startDetection() ────────────────────────────────────────────────────

/**
 * Starts the RAF-based motion detection loop.
 *
 * @param {{
 *   videoEl:     HTMLVideoElement,
 *   canvasEl:    HTMLCanvasElement,
 *   roi:         { p1Norm: {x,y}, p2Norm: {x,y}, zoneWidthNorm: number },
 *   sensitivity: number,
 *   debounce:    number,
 *   fitMode?:    'contain' | 'cover',
 *   onTrigger:   () => void,
 * }} config
 */
export function startDetection(config) {
  if (_rafId !== null) return; // Already running — idempotent guard

  const displayW = config.canvasEl.width;
  const displayH = config.canvasEl.height;

  _roiPx = _computeROIPixels(config.roi, displayW, displayH);
  const fitMode = normalizeFitMode(config.fitMode);
  const displayRect = computeDisplayRect({
    videoWidth: config.videoEl.videoWidth,
    videoHeight: config.videoEl.videoHeight,
    viewportWidth: displayW,
    viewportHeight: displayH,
    fitMode,
  });
  _sampleRect = _computeSampleRect(
    _roiPx,
    displayRect,
    config.videoEl.videoWidth,
    config.videoEl.videoHeight
  );

  // Allocate hidden canvas sized to the ROI bounding box only
  _hiddenCanvas        = document.createElement('canvas');
  _hiddenCanvas.width  = _roiPx.width;
  _hiddenCanvas.height = _roiPx.height;
  // willReadFrequently: true — required to prevent GPU readback overhead on getImageData()
  _hiddenCtx = _hiddenCanvas.getContext('2d', { willReadFrequently: true });

  // Allocate pixel buffers once; reuse every tick (zero in-loop allocation)
  const pixelCount = _roiPx.width * _roiPx.height;
  _prevPixels = null; // First tick: no previous frame — skip comparison
  _currPixels = new Float32Array(pixelCount);

  _config = {
    videoEl:     config.videoEl,
    sensitivity: config.sensitivity,
    debounce:    config.debounce,
    fitMode,
    onTrigger:   config.onTrigger,
  };

  _lastTrigger     = -Infinity; // Ensure the very first detection fires immediately
  _resumeAttempted = false;
  _debugFrameCount = 0;

  _rafId = requestAnimationFrame(_tick);
}

// ── A7 — stopDetection() and isDetecting() ───────────────────────────────────

/**
 * Cancels the RAF loop and releases all allocated resources.
 * Safe to call when not detecting.
 */
export function stopDetection() {
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _hiddenCanvas    = null;
  _hiddenCtx       = null;
  _prevPixels      = null;
  _currPixels      = null;
  _roiPx           = null;
  _sampleRect      = null;
  _config          = null;
  _resumeAttempted = false;
}

/**
 * Returns true when the detection loop is currently running.
 * @returns {boolean}
 */
export function isDetecting() {
  return _rafId !== null;
}
