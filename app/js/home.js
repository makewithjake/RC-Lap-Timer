import { showScreen } from './router.js';
import { startCamera } from './camera.js';
import { showHistory } from './history.js';
import { showSettings } from './settings.js';
import { acquireWakeLock, lockCameraSettings } from './wakeLock.js';
import { clearLine, resizeCanvas } from './viewfinder.js';

const STORAGE_KEYS = {
  driverName:  'rc_driverName',
  carName:     'rc_carName',
  location:    'rc_location',
  setupNotes:  'rc_setupNotes',
};

function saveOnBlur(input, storageKey) {
  input.addEventListener('blur', () => {
    localStorage.setItem(storageKey, input.value.trim());
  });
}

export function initHome() {
  const driverInput     = document.getElementById('input-driver-name');
  const carInput        = document.getElementById('input-car-name');
  const locationInput   = document.getElementById('input-location');
  const setupNotesInput = document.getElementById('input-setup-notes');

  // Pre-fill from localStorage
  driverInput.value     = localStorage.getItem(STORAGE_KEYS.driverName) ?? '';
  carInput.value        = localStorage.getItem(STORAGE_KEYS.carName)    ?? '';
  locationInput.value   = localStorage.getItem(STORAGE_KEYS.location)   ?? '';
  setupNotesInput.value = localStorage.getItem(STORAGE_KEYS.setupNotes) ?? '';

  // Persist on blur
  saveOnBlur(driverInput,     STORAGE_KEYS.driverName);
  saveOnBlur(carInput,        STORAGE_KEYS.carName);
  saveOnBlur(locationInput,   STORAGE_KEYS.location);
  saveOnBlur(setupNotesInput, STORAGE_KEYS.setupNotes);

  // Navigation
  document.getElementById('btn-start-session').addEventListener('click', async () => {
    clearLine();
    showScreen('viewfinder');
    history.pushState({ screen: 'viewfinder' }, '');
    document.getElementById('viewfinder-help-modal')?.removeAttribute('hidden');
    resizeCanvas();

    const videoEl = document.getElementById('viewfinder-video');
    try {
      const stream = await startCamera(videoEl);
      await acquireWakeLock();
      await lockCameraSettings(stream);
    } catch (err) {
      // camera.js already renders the error banner — nothing further needed here
      console.error('[home] Camera start failed:', err);
    }
  });

  document.getElementById('btn-view-history').addEventListener('click', showHistory);

  document.getElementById('btn-settings').addEventListener('click', showSettings);
}

/**
 * Re-reads home screen inputs from localStorage and shows the home screen.
 * Call this after clearAllData() so inputs reflect the wiped state.
 */
export function showHome() {
  const driverInput     = document.getElementById('input-driver-name');
  const carInput        = document.getElementById('input-car-name');
  const locationInput   = document.getElementById('input-location');
  const setupNotesInput = document.getElementById('input-setup-notes');

  if (driverInput)     driverInput.value     = localStorage.getItem(STORAGE_KEYS.driverName) ?? '';
  if (carInput)        carInput.value        = localStorage.getItem(STORAGE_KEYS.carName)    ?? '';
  if (locationInput)   locationInput.value   = localStorage.getItem(STORAGE_KEYS.location)   ?? '';
  if (setupNotesInput) setupNotesInput.value = localStorage.getItem(STORAGE_KEYS.setupNotes) ?? '';

  showScreen('home');
}
