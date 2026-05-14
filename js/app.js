import { showScreen } from './router.js';
import { initHome } from './home.js';
import { stopCamera } from './camera.js';
import {
  releaseWakeLock,
  setWakeLockStatusCallback,
  setCameraLockStatusCallback,
} from './wakeLock.js';
import { playBeep, speak } from './audio.js';

// ── Status chip helpers ───────────────────────────────────────

function updateWakeLockChip(active) {
  const chip = document.getElementById('status-wake-lock');
  if (!chip) return;
  chip.textContent = active ? '🔒 Screen Active' : '🔓 Screen May Sleep';
  chip.dataset.state = active ? 'active' : 'inactive';
}

function updateCameraLockChip(locked) {
  const chip = document.getElementById('status-camera-lock');
  if (!chip) return;
  chip.textContent = locked ? '📷 Camera Stabilized' : '📷 Camera Auto';
  chip.dataset.state = locked ? 'active' : 'inactive';
}

// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered, scope:', registration.scope);
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err);
      });
  }

  // 2. Wire reactive status indicator callbacks
  setWakeLockStatusCallback(updateWakeLockChip);
  setCameraLockStatusCallback(updateCameraLockChip);

  // 3. Show default landing screen
  showScreen('home');

  // 4. Initialise Home Screen logic
  initHome();

  // 5. Test TTS button — milestone verification (F3); remove/repurpose in Phase 3
  const testTtsBtn = document.getElementById('btn-test-tts');
  if (testTtsBtn) {
    testTtsBtn.addEventListener('click', () => {
      speak('RC Lap Timer is ready');
      playBeep();
    });
  }

  // 6. Clean up camera + wake lock when user leaves the page
  window.addEventListener('pagehide', () => {
    stopCamera();
    releaseWakeLock();
  });
});
