/**
 * audio.js — Audio & Speech Engine (Task Group C)
 *
 * Provides:
 *  - Web Audio API beep generator (lazy AudioContext)
 *  - Speech Synthesis (TTS) wrapper
 *  - TTS lap announcement formatter
 *
 * AudioContext is created on first call to playBeep() to comply with
 * browser autoplay policy which requires a user gesture before audio
 * is allowed.
 */

// ---------------------------------------------------------------------------
// C1 — Web Audio API Beep Generator
// ---------------------------------------------------------------------------

/** @type {AudioContext|null} */
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (mobile browsers may suspend after inactivity)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a sine-wave beep.
 * @param {number} frequency - Hz (default 880)
 * @param {number} duration  - milliseconds (default 120)
 * @param {number} volume    - 0–1 (default 0.6)
 */
export function playBeep(frequency = 880, duration = 120, volume = 0.6) {
  const ctx = getAudioContext();
  const durationSec = duration / 1000;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

  // Ramp gain down to avoid clicking artifacts at end of tone
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + durationSec);
}

/** Short mid-tone beep used for countdown ticks. */
export function playCountdownBeep() {
  playBeep(880, 120);
}

/** Higher, longer beep for "GO" / race start. */
export function playFinalBeep() {
  playBeep(1200, 300);
}

/** Quick confirmation beep for each lap crossing. */
export function playLapBeep() {
  playBeep(660, 80);
}

// ---------------------------------------------------------------------------
// C2 — Speech Synthesis (TTS) Wrapper
// ---------------------------------------------------------------------------

/** @type {SpeechSynthesisVoice|null} */
let preferredVoice = null;

/**
 * Speak text aloud via the Speech Synthesis API.
 * Cancels any in-progress utterance before starting.
 * @param {string} text
 * @param {{ rate?: number, pitch?: number, volume?: number, voice?: SpeechSynthesisVoice|null }} [options]
 */
export function speak(text, options = {}) {
  if (!('speechSynthesis' in window)) {
    console.warn('[audio] Speech Synthesis not supported on this device.');
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate   = options.rate   ?? 1.0;
  utterance.pitch  = options.pitch  ?? 1.0;
  utterance.volume = options.volume ?? 1.0;
  utterance.voice  = options.voice  ?? preferredVoice ?? null;

  window.speechSynthesis.speak(utterance);
}

/**
 * Returns a Promise that resolves with the list of available TTS voices.
 * Handles the async `voiceschanged` event on Chrome where voices are not
 * immediately available at page load.
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
export function getAvailableVoices() {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    // Chrome fires voiceschanged asynchronously
    window.speechSynthesis.addEventListener('voiceschanged', function handler() {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    });
  });
}

/**
 * Store a preferred voice by name for all subsequent speak() calls.
 * @param {string} voiceName - The `SpeechSynthesisVoice.name` value to match.
 */
export function setPreferredVoice(voiceName) {
  getAvailableVoices().then((voices) => {
    const match = voices.find((v) => v.name === voiceName) ?? null;
    if (!match) {
      console.warn(`[audio] Voice "${voiceName}" not found. Available:`, voices.map((v) => v.name));
    }
    preferredVoice = match;
  });
}

// ---------------------------------------------------------------------------
// C3 — TTS Lap Announcement Formatter
// ---------------------------------------------------------------------------

/**
 * Convert a number (0–99) to its English word representation.
 * Used for constructing natural-sounding lap time strings.
 * @param {number} n
 * @returns {string}
 */
function numberToWords(n) {
  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ];
  const tens = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  ];

  if (n < 20) return ones[n];
  if (n < 100) {
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + ones[n % 10] : '');
  }
  return String(n); // fallback for values >= 100
}

/**
 * Announce a completed lap via TTS.
 * Formats the time as a human-readable string, e.g.:
 *   "Lap 3: one minute, twelve point four seconds"
 *   "Lap 3: forty-five point two seconds"
 *
 * This function is designed to be called directly by Phase 5 session
 * management with no modification needed.
 *
 * @param {number} lapNumber  - 1-based lap index
 * @param {number} lapTimeMs  - lap duration in milliseconds
 */
export function announceLap(lapNumber, lapTimeMs) {
  const totalSeconds = lapTimeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  // One decimal place for the seconds portion
  const wholeSeconds = Math.floor(seconds);
  const tenths = Math.round((seconds - wholeSeconds) * 10);

  let timePhrase;
  if (minutes > 0) {
    const minuteWord  = minutes === 1 ? 'one minute' : `${numberToWords(minutes)} minutes`;
    const secondsWord = wholeSeconds === 1 ? 'one' : numberToWords(wholeSeconds);
    timePhrase = `${minuteWord}, ${secondsWord} point ${tenths} seconds`;
  } else {
    const secondsWord = wholeSeconds === 1 ? 'one' : numberToWords(wholeSeconds);
    timePhrase = `${secondsWord} point ${tenths} seconds`;
  }

  const lapWord = lapNumber === 1 ? 'one' : numberToWords(lapNumber);
  speak(`Lap ${lapWord}: ${timePhrase}`);
}
