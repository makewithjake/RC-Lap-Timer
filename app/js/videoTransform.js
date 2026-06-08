/**
 * videoTransform.js — Shared preview/display ↔ source-video mapping helpers.
 */

/**
 * @param {string|undefined|null} fitMode
 * @returns {'contain'|'cover'}
 */
export function normalizeFitMode(fitMode) {
  return fitMode === 'cover' ? 'cover' : 'contain';
}

/**
 * Computes how an intrinsic video frame is displayed inside a viewport/canvas.
 *
 * @param {{
 *   videoWidth: number,
 *   videoHeight: number,
 *   viewportWidth: number,
 *   viewportHeight: number,
 *   fitMode?: 'contain'|'cover'|string,
 * }} input
 * @returns {{
 *   fitMode: 'contain'|'cover',
 *   scale: number,
 *   displayWidth: number,
 *   displayHeight: number,
 *   offsetX: number,
 *   offsetY: number,
 * }}
 */
export function computeDisplayRect(input) {
  const videoWidth = Math.max(1, Number(input.videoWidth) || 0);
  const videoHeight = Math.max(1, Number(input.videoHeight) || 0);
  const viewportWidth = Math.max(1, Number(input.viewportWidth) || 0);
  const viewportHeight = Math.max(1, Number(input.viewportHeight) || 0);
  const fitMode = normalizeFitMode(input.fitMode);

  const scaleContain = Math.min(viewportWidth / videoWidth, viewportHeight / videoHeight);
  const scaleCover = Math.max(viewportWidth / videoWidth, viewportHeight / videoHeight);
  const scale = fitMode === 'cover' ? scaleCover : scaleContain;

  const displayWidth = videoWidth * scale;
  const displayHeight = videoHeight * scale;
  const offsetX = (viewportWidth - displayWidth) / 2;
  const offsetY = (viewportHeight - displayHeight) / 2;

  return Object.freeze({
    fitMode,
    scale,
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
  });
}

/**
 * Maps a point in viewport/canvas coordinates into source-video pixel space.
 *
 * @param {{ x: number, y: number }} point
 * @param {{ scale: number, offsetX: number, offsetY: number }} displayRect
 * @returns {{ x: number, y: number }}
 */
export function mapViewportPointToVideo(point, displayRect) {
  return {
    x: (point.x - displayRect.offsetX) / displayRect.scale,
    y: (point.y - displayRect.offsetY) / displayRect.scale,
  };
}

