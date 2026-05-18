/**
 * history.js — Session History Screen (Phase 6, Task Group C)
 *
 * Exports:
 *   initHistory()       — wire event listeners once at app startup
 *   showHistory()       — entry point called when navigating to History
 *   renderSessionList() — render (or re-render) the session list from a Session[]
 */

import { getHistory, deleteSession } from './storage.js';
import { showScreen } from './router.js';

// ── Lap Time Formatter (local copy — identical to summary.js) ─────────────────

function _formatLapTime(ms) {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(3);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}

// ── C1 — Date Grouping Helper ─────────────────────────────────────────────────

/**
 * Groups sessions by calendar date for display.
 * @param {import('./storage.js').Session[]} sessions — assumed sorted newest first
 * @returns {Array<{ dateLabel: string, sessions: import('./storage.js').Session[] }>}
 */
function _groupByDate(sessions) {
  const map = new Map();
  sessions.forEach((s) => {
    const label = new Date(s.date).toLocaleDateString('en-US', {
      weekday: 'short',
      year:    'numeric',
      month:   'long',
      day:     'numeric',
    });
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(s);
  });
  return Array.from(map.entries()).map(([dateLabel, sess]) => ({
    dateLabel,
    sessions: sess,
  }));
}

// ── C2 — Session Card Renderer ────────────────────────────────────────────────

/**
 * Clears #history-list and rebuilds it from sessions.
 * @param {import('./storage.js').Session[]} sessions
 */
export function renderSessionList(sessions) {
  const listEl  = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');
  const containerEl = document.getElementById('history-list-container');

  if (!listEl) return;

  // Clear existing content (but keep the empty state element)
  listEl.innerHTML = '';
  // Remove any previously injected date headers
  if (containerEl) {
    containerEl.querySelectorAll('.history-date-header').forEach((el) => el.remove());
  }

  if (!sessions || sessions.length === 0) {
    if (emptyEl) emptyEl.removeAttribute('hidden');
    return;
  }

  if (emptyEl) emptyEl.setAttribute('hidden', '');

  const groups = _groupByDate(sessions);

  groups.forEach(({ dateLabel, sessions: groupSessions }) => {
    // Date header
    const header = document.createElement('h2');
    header.className   = 'history-date-header';
    header.textContent = dateLabel;
    listEl.before(header); // Insert before list; subsequent groups append to list

    // For proper grouping, append each session card directly to the list
    groupSessions.forEach((session) => {
      const li = document.createElement('li');
      li.className           = 'session-card';
      li.setAttribute('role', 'listitem');
      li.dataset.sessionId   = session.id;

      li.innerHTML = `
        <div class="session-card__primary">
          <span class="session-card__car">${_escapeHtml(session.carName || '—')}</span>
          <span class="session-card__driver">${_escapeHtml(session.driverName || '')}</span>
        </div>
        <div class="session-card__secondary">
          <span class="session-card__location">${_escapeHtml(session.location || '')}</span>
          <span class="session-card__laps">${session.lapCount} laps</span>
        </div>
        <div class="session-card__best">
          <span class="session-card__best-label">BEST</span>
          <span class="session-card__best-time">${_formatLapTime(session.bestLapMs)}</span>
        </div>
      `;

      listEl.appendChild(li);
    });
  });
}

/**
 * Minimal HTML escaping to prevent XSS from stored user data.
 * @param {string} str
 * @returns {string}
 */
function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── C3 — Search / Filter ──────────────────────────────────────────────────────

function _bindSearchFilter() {
  const searchEl = document.getElementById('history-search');
  if (!searchEl) return;

  searchEl.addEventListener('input', () => {
    const query = searchEl.value.trim().toLowerCase();
    if (!query) {
      renderSessionList(getHistory());
      return;
    }
    const filtered = getHistory().filter(
      (s) =>
        (s.driverName ?? '').toLowerCase().includes(query) ||
        (s.carName    ?? '').toLowerCase().includes(query)
    );
    renderSessionList(filtered);
  });
}

// ── C4 — Long-Press Delete ────────────────────────────────────────────────────

let _pendingDeleteId   = null;
let _longPressTimer    = null;
let _startPointerX     = 0;
let _startPointerY     = 0;

function _showDeleteChip() {
  const chip = document.getElementById('delete-confirm-chip');
  if (chip) chip.removeAttribute('hidden');
}

function _hideDeleteChip() {
  const chip = document.getElementById('delete-confirm-chip');
  if (chip) chip.setAttribute('hidden', '');
  _pendingDeleteId = null;
}

function _cancelLongPress() {
  if (_longPressTimer !== null) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
}

function _bindLongPressDelete() {
  const listEl = document.getElementById('history-list');
  if (!listEl) return;

  // Pointer events (touch + mouse)
  listEl.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.session-card');
    if (!card) return;

    _startPointerX = e.clientX;
    _startPointerY = e.clientY;

    _pendingDeleteId = card.dataset.sessionId;
    _longPressTimer  = setTimeout(() => {
      _longPressTimer = null;
      _showDeleteChip();
    }, 500);
  });

  listEl.addEventListener('pointerup', () => {
    _cancelLongPress();
  });

  listEl.addEventListener('pointerleave', () => {
    _cancelLongPress();
  });

  listEl.addEventListener('pointermove', (e) => {
    if (_longPressTimer === null) return;
    const dx = e.clientX - _startPointerX;
    const dy = e.clientY - _startPointerY;
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      _cancelLongPress();
    }
  });
}

function _bindDeleteChipButtons() {
  const confirmBtn = document.getElementById('btn-delete-confirm');
  const cancelBtn  = document.getElementById('btn-delete-cancel');

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (_pendingDeleteId) {
        deleteSession(_pendingDeleteId);
      }
      _hideDeleteChip();
      renderSessionList(getHistory());
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      _hideDeleteChip();
    });
  }
}

// ── C5 — Screen Initialization ────────────────────────────────────────────────

let _initialized = false;

/**
 * Wire all event listeners. Call once at app startup. Idempotent.
 */
export function initHistory() {
  if (_initialized) return;
  _initialized = true;

  _bindSearchFilter();
  _bindLongPressDelete();
  _bindDeleteChipButtons();

  const backBtn = document.getElementById('btn-history-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => showScreen('home'));
  }
}

// ── C6 — Screen Entry ─────────────────────────────────────────────────────────

/**
 * Reset state, load sessions, and show the history screen.
 */
export function showHistory() {
  const searchEl = document.getElementById('history-search');
  if (searchEl) searchEl.value = '';

  _hideDeleteChip();
  renderSessionList(getHistory());
  showScreen('history');
}

// ── C7 — Public API ───────────────────────────────────────────────────────────
export {
  initHistory,
  showHistory,
  renderSessionList,
};
