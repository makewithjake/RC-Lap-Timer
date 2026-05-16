/* ============================================================
   router.js — Screen Navigation
   RC Lap Timer · Phase 1
   Pure DOM state only — no URL/history manipulation.
   ============================================================ */

/** @type {string|null} */
let _currentScreen = null;

/**
 * Show the screen whose id is `screen-{screenId}` and hide all others.
 * @param {string} screenId  e.g. 'home', 'viewfinder', 'history', 'settings'
 */
export function showScreen(screenId) {
  const sections = document.querySelectorAll('main > section');

  sections.forEach((section) => {
    section.hidden = true;
  });

  const target = document.getElementById(`screen-${screenId}`);

  if (target) {
    target.hidden = false;
    _currentScreen = screenId;
  } else {
    console.warn(`[Router] No section found with id "screen-${screenId}".`);
  }
}

/**
 * Returns the id of the currently visible screen, or null before navigation.
 * @returns {string|null}
 */
export function currentScreen() {
  return _currentScreen;
}
