import { showScreen } from './router.js';
import { startCamera } from './camera.js';
import { showHistory } from './history.js';
import { showSettings } from './settings.js';
import { acquireWakeLock, lockCameraSettings } from './wakeLock.js';
import { clearLine, resizeCanvas } from './viewfinder.js';

const STORAGE_KEYS = {
  driverName: 'rc_driverName',
  carName: 'rc_carName',
  location: 'rc_location',
};

function saveOnBlur(input, storageKey) {
  input.addEventListener('blur', () => {
    localStorage.setItem(storageKey, input.value.trim());
  });
}

export function initHome() {
  const driverInput = document.getElementById('input-driver-name');
  const carInput = document.getElementById('input-car-name');
  const locationInput = document.getElementById('input-location');

  // Pre-fill from localStorage
  driverInput.value = localStorage.getItem(STORAGE_KEYS.driverName) ?? '';
  carInput.value = localStorage.getItem(STORAGE_KEYS.carName) ?? '';
  locationInput.value = localStorage.getItem(STORAGE_KEYS.location) ?? '';

  // Persist on blur
  saveOnBlur(driverInput, STORAGE_KEYS.driverName);
  saveOnBlur(carInput, STORAGE_KEYS.carName);
  saveOnBlur(locationInput, STORAGE_KEYS.location);

  // Navigation
  document.getElementById('btn-start-session').addEventListener('click', async () => {
    clearLine();
    showScreen('viewfinder');
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
  const driverInput   = document.getElementById('input-driver-name');
  const carInput      = document.getElementById('input-car-name');
  const locationInput = document.getElementById('input-location');

  if (driverInput)   driverInput.value   = localStorage.getItem(STORAGE_KEYS.driverName) ?? '';
  if (carInput)      carInput.value      = localStorage.getItem(STORAGE_KEYS.carName)    ?? '';
  if (locationInput) locationInput.value = localStorage.getItem(STORAGE_KEYS.location)   ?? '';

  showScreen('home');
}
