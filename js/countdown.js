let _intervalId  = null;   // setInterval handle; non-null = countdown running
let _remaining   = 0;      // current countdown digit being displayed
let _callbacks   = null;   // { onTick, onComplete, onCancel }

/**
 * Starts a 1-second-tick countdown from `duration` down to 0.
 * Idempotent — safe to call when already counting (returns immediately).
 *
 * @param {{
 *   duration?:   number,
 *   onTick:      (n: number) => void,
 *   onComplete:  () => void,
 *   onCancel?:   () => void,
 * }} config
 */
export function startCountdown(config) {
  if (_intervalId !== null) return; // Idempotent guard

  const duration = config.duration ?? 10;
  _callbacks     = {
    onTick:     config.onTick,
    onComplete: config.onComplete,
    onCancel:   config.onCancel ?? (() => {}),
  };

  _remaining = duration;
  _callbacks.onTick(_remaining); // Show first number immediately (no 1-second delay)

  _intervalId = setInterval(() => {
    _remaining -= 1;

    if (_remaining > 0) {
      _callbacks.onTick(_remaining);
      return;
    }

    // _remaining === 0: final tick
    _callbacks.onTick(0);
    _clearInterval();
    _callbacks.onComplete();
  }, 1000);
}

/**
 * Aborts an in-progress countdown. Calls onCancel callback.
 * Safe to call when not counting (no-op).
 */
export function cancelCountdown() {
  if (_intervalId === null) return;
  _clearInterval();
  _callbacks.onCancel();
}

/** @private */
function _clearInterval() {
  clearInterval(_intervalId);
  _intervalId = null;
  _remaining  = 0;
  _callbacks  = null;
}

/**
 * @returns {boolean} true when a countdown is in progress
 */
export function isCountingDown() {
  return _intervalId !== null;
}
