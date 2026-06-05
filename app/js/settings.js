/**
 * settings.js — Global Settings Screen (Phase 6, Task Group D)
 *
 * Exports:
 *   initSettings()  — wire event listeners once at app startup
 *   showSettings()  — entry point called when navigating to Settings
 */

import { getSettings, saveSettings, clearAllData } from './storage.js';
import { getAvailableVoices, setPreferredVoice }   from './audio.js';
import { showScreenState } from './navigation.js';
import { showHome } from './home.js';

// ── D1 — Settings Form Hydration ──────────────────────────────────────────────

/**
 * Reads getSettings() and populates all form controls to match stored values.
 * @param {import('./storage.js').Settings} settings
 */
function _hydrateForm(settings) {
  const pitchEl     = document.getElementById('setting-tts-pitch');
  const pitchLabel  = document.getElementById('label-pitch');
  const volumeEl    = document.getElementById('setting-tts-volume');
  const volumeLabel = document.getElementById('label-volume');
  const voiceEl     = document.getElementById('setting-tts-voice');

  if (pitchEl) {
    pitchEl.value = settings.ttsPitch;
    if (pitchLabel) pitchLabel.textContent = Number(settings.ttsPitch).toFixed(1);
  }

  if (volumeEl) {
    volumeEl.value = settings.ttsVolume;
    if (volumeLabel) volumeLabel.textContent = Number(settings.ttsVolume).toFixed(1);
  }

  if (voiceEl && settings.ttsVoiceName) {
    const matching = voiceEl.querySelector(`option[value="${CSS.escape(settings.ttsVoiceName)}"]`);
    if (matching) voiceEl.value = settings.ttsVoiceName;
  }

  if (voiceEl) {
    voiceEl.disabled = !settings.ttsEnabled;
  }

  // Toggle buttons
  document.querySelectorAll('.toggle-btn[data-value]').forEach((btn) => {
    btn.classList.toggle('toggle-btn--active', btn.dataset.value === settings.units);
  });

  const ttsToggleEl    = document.getElementById('toggle-tts-enabled');
  const ttsToggleLbl   = document.getElementById('label-tts-enabled');
  if (ttsToggleEl) {
    const enabled = Boolean(settings.ttsEnabled);
    ttsToggleEl.setAttribute('aria-checked', String(enabled));
    ttsToggleEl.dataset.active = String(enabled);
    if (ttsToggleLbl) ttsToggleLbl.textContent = enabled ? 'On' : 'Off';
  }

  const lapStartAudioEl = document.getElementById('setting-lap-start-audio');
  if (lapStartAudioEl) {
    lapStartAudioEl.value = localStorage.getItem('rc_lapStartAudio') ?? "Let's Go!";
  }
}

// ── D2 — Voice Selector Population ───────────────────────────────────────────

let _voiceListPopulated = false;

async function _populateVoiceList() {
  const voiceEl = document.getElementById('setting-tts-voice');
  if (!voiceEl) return;

  const voices = await getAvailableVoices();

  // Rebuild options
  voiceEl.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value       = '';
  defaultOpt.textContent = 'System Default';
  voiceEl.appendChild(defaultOpt);

  voices.forEach((voice) => {
    const opt = document.createElement('option');
    opt.value       = voice.name;
    opt.textContent = `${voice.name} (${voice.lang})`;
    voiceEl.appendChild(opt);
  });

  // Set selected to stored preference
  const storedVoice = getSettings().ttsVoiceName;
  if (storedVoice) {
    voiceEl.value = storedVoice;
  }

  _voiceListPopulated = true;
}

// ── D3 — Live Input Listeners ─────────────────────────────────────────────────

function _bindLiveListeners() {
  const pitchEl    = document.getElementById('setting-tts-pitch');
  const pitchLabel = document.getElementById('label-pitch');
  if (pitchEl) {
    pitchEl.addEventListener('input', () => {
      const val = Number(pitchEl.value);
      if (pitchLabel) pitchLabel.textContent = val.toFixed(1);
      saveSettings({ ttsPitch: val });
    });
  }

  const volumeEl    = document.getElementById('setting-tts-volume');
  const volumeLabel = document.getElementById('label-volume');
  if (volumeEl) {
    volumeEl.addEventListener('input', () => {
      const val = Number(volumeEl.value);
      if (volumeLabel) volumeLabel.textContent = val.toFixed(1);
      saveSettings({ ttsVolume: val });
    });
  }

  const ttsToggleEl  = document.getElementById('toggle-tts-enabled');
  const ttsToggleLbl = document.getElementById('label-tts-enabled');
  if (ttsToggleEl) {
    ttsToggleEl.addEventListener('click', () => {
      // Read from settings (authoritative source) rather than DOM attribute
      const current = getSettings().ttsEnabled;
      const next    = !current;
      ttsToggleEl.setAttribute('aria-checked', String(next));
      ttsToggleEl.dataset.active = String(next);
      if (ttsToggleLbl) ttsToggleLbl.textContent = next ? 'On' : 'Off';
      saveSettings({ ttsEnabled: next });
      if (next) {
        _populateVoiceList();
      }
    });
  }

  const voiceEl = document.getElementById('setting-tts-voice');
  if (voiceEl) {
    voiceEl.addEventListener('change', () => {
      const voiceName = voiceEl.value || null;
      saveSettings({ ttsVoiceName: voiceName });
      setPreferredVoice(voiceName);
    });
  }

  document.querySelectorAll('.toggle-btn[data-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn[data-value]').forEach((b) => {
        b.classList.toggle('toggle-btn--active', b === btn);
      });
      saveSettings({ units: btn.dataset.value });
    });
  });

  const lapStartAudioEl = document.getElementById('setting-lap-start-audio');
  if (lapStartAudioEl) {
    lapStartAudioEl.addEventListener('input', () => {
      localStorage.setItem('rc_lapStartAudio', lapStartAudioEl.value);
    });
  }
}

// ── D4 — Clear All Data Flow ──────────────────────────────────────────────────

function _initClearDataFlow() {
  const clearBtn   = document.getElementById('btn-clear-data');
  const modal      = document.getElementById('clear-data-modal');
  const cancelBtn  = document.getElementById('btn-clear-cancel');
  const confirmBtn = document.getElementById('btn-clear-confirm');

  if (clearBtn && modal) {
    clearBtn.addEventListener('click', () => {
      modal.removeAttribute('hidden');
      modal.setAttribute('aria-hidden', 'false');
    });
  }

  if (cancelBtn && modal) {
    cancelBtn.addEventListener('click', () => {
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  if (confirmBtn && modal) {
    confirmBtn.addEventListener('click', () => {
      clearAllData();
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-hidden', 'true');
      showHome(); // re-reads localStorage (now empty) so inputs are blank
      // Re-hydrate form with defaults for next open
      _hydrateForm(getSettings());
    });
  }
}

// ── D5 — Offline Status Badge ─────────────────────────────────────────────────

function _updateOfflineBadge() {
  const badge = document.getElementById('about-offline-status');
  if (!badge) return;

  const sw = navigator.serviceWorker;
  if (!sw) {
    badge.textContent = 'Not supported';
    return;
  }

  const refresh = () => {
    badge.textContent = sw.controller ? '✓ Offline Ready' : 'Connecting…';
  };

  refresh();

  // Update badge if the SW takes control after this call
  sw.addEventListener('controllerchange', refresh, { once: true });

  // Also detect when a waiting SW finishes installing and activates
  if (sw.controller) return;
  sw.ready.then(() => refresh());
}

// ── D6 — Screen Initialization ────────────────────────────────────────────────

let _initialized = false;

/**
 * Wire event listeners once at app startup. Idempotent.
 */
export function initSettings() {
  if (_initialized) return;
  _initialized = true;

  const backBtn = document.getElementById('btn-settings-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (history.length > 1) {
        history.back();
      } else {
        showScreenState('home');
      }
    });
  }

  _bindLiveListeners();
  _initClearDataFlow();
}

// ── D7 — Screen Entry ─────────────────────────────────────────────────────────

/**
 * Hydrate form, populate voice list, update offline badge, show screen.
 */
export function showSettings(options = {}) {
  const settings = getSettings();
  _hydrateForm(settings);
  if (settings.ttsEnabled) {
    _populateVoiceList(); // async, non-blocking — only when TTS is on
  }
  _updateOfflineBadge();
  showScreenState('settings', {
    replace: options.replace ?? false,
    syncHistory: options.syncHistory ?? true,
    state: { modal: null },
  });
}


