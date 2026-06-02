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
import { renderChart } from './summary.js';

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

function _parseSessionDate(dateValue) {
  if (!dateValue) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return new Date(`${dateValue}T00:00:00`);
  }

  const localDate = new Date(`${dateValue}T00:00:00`);
  if (!Number.isNaN(localDate.getTime())) {
    return localDate;
  }

  const parsed = new Date(dateValue);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
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
    const parsed = _parseSessionDate(s.date);
    const label = parsed
      ? parsed.toLocaleDateString('en-US', {
          weekday: 'short',
          year:    'numeric',
          month:   'long',
          day:     'numeric',
        })
      : 'Unknown Date';
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
  const emptyEl = document.getElementById('history-empty');
  const containerEl = document.getElementById('history-list-container');

  if (!containerEl) return;

  containerEl.innerHTML = '';

  if (!sessions || sessions.length === 0) {
    if (emptyEl) {
      emptyEl.removeAttribute('hidden');
      containerEl.appendChild(emptyEl);
    }
    return;
  }

  // Ensure newest-first order regardless of caller
  const sorted = [...sessions].sort((a, b) => {
    const aDate = _parseSessionDate(a.date);
    const bDate = _parseSessionDate(b.date);
    const aTime = aDate ? aDate.getTime() : -Infinity;
    const bTime = bDate ? bDate.getTime() : -Infinity;

    if (bTime !== aTime) return bTime - aTime;
    return String(b.date ?? '').localeCompare(String(a.date ?? ''));
  });

  if (emptyEl) emptyEl.setAttribute('hidden', '');

  const groups = _groupByDate(sorted);
  const fragment = document.createDocumentFragment();

  groups.forEach(({ dateLabel, sessions: groupSessions }) => {
    const groupEl = document.createElement('section');
    groupEl.className = 'history-date-group';

    const header = document.createElement('h2');
    header.className   = 'history-date-header';
    header.textContent = dateLabel;
    groupEl.appendChild(header);

    const groupList = document.createElement('ul');
    groupList.className = 'history-list';
    groupList.setAttribute('role', 'list');

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

      groupList.appendChild(li);
    });

    groupEl.appendChild(groupList);
    fragment.appendChild(groupEl);
  });

  containerEl.appendChild(fragment);
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
let _pointerMoved      = false;

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
  const containerEl = document.getElementById('history-list-container');
  if (!containerEl) return;

  // Pointer events (touch + mouse)
  containerEl.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.session-card');
    if (!card) return;

    _startPointerX = e.clientX;
    _startPointerY = e.clientY;
    _pointerMoved  = false;

    _pendingDeleteId = card.dataset.sessionId;
    _longPressTimer  = setTimeout(() => {
      _longPressTimer = null;
      _showDeleteChip();
    }, 500);
  });

  containerEl.addEventListener('pointerup', (e) => {
    const wasTap = _longPressTimer !== null;
    _cancelLongPress();
    if (wasTap && !_pointerMoved) {
      const deleteChip = document.getElementById('delete-confirm-chip');
      const chipVisible = deleteChip && !deleteChip.hasAttribute('hidden');
      if (!chipVisible) {
        const card = e.target.closest('.session-card');
        if (card) _openSessionDetail(card.dataset.sessionId);
      }
    }
  });

  containerEl.addEventListener('pointerleave', () => {
    _cancelLongPress();
  });

  containerEl.addEventListener('pointermove', (e) => {
    if (_longPressTimer === null) return;
    const dx = e.clientX - _startPointerX;
    const dy = e.clientY - _startPointerY;
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      _pointerMoved = true;
      _cancelLongPress();
    }
  });
}

// ── C4b — Session Detail Modal ────────────────────────────────────────────────

function _openSessionDetail(sessionId) {
  const session = getHistory().find((s) => s.id === sessionId);
  if (!session) return;

  const modal = document.getElementById('session-detail-modal');
  if (!modal) return;

  document.getElementById('session-detail-title').textContent = session.carName || '—';
  document.querySelector('#session-detail-modal .session-detail-subtitle').textContent =
    session.driverName || '';

  const detailDate = _parseSessionDate(session.date);
  document.getElementById('detail-date').textContent = detailDate
    ? detailDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown Date';
  document.getElementById('detail-location').textContent = session.location || '—';

  const notesEl = document.getElementById('detail-setup-notes');
  if (session.setupNotes) {
    notesEl.textContent = session.setupNotes;
    notesEl.classList.remove('is-empty');
  } else {
    notesEl.textContent = 'No notes';
    notesEl.classList.add('is-empty');
  }

  document.getElementById('detail-best-lap').textContent  = _formatLapTime(session.bestLapMs);
  document.getElementById('detail-avg-lap').textContent   = _formatLapTime(session.avgLapMs);
  document.getElementById('detail-total-time').textContent = _formatLapTime(session.totalTimeMs);

  const tbody = document.getElementById('detail-lap-tbody');
  tbody.innerHTML = '';
  (session.laps ?? []).forEach((lap) => {
    const tr = document.createElement('tr');
    if (lap.gapMs === 0) tr.setAttribute('data-best', 'true');
    const gapText = lap.gapMs === 0 ? 'Best' : '+' + _formatLapTime(lap.gapMs);
    const tdLap  = document.createElement('td');
    const tdTime = document.createElement('td');
    const tdGap  = document.createElement('td');
    tdLap.textContent  = lap.lapNumber;
    tdTime.textContent = _formatLapTime(lap.lapTimeMs);
    tdGap.textContent  = gapText;
    tr.appendChild(tdLap);
    tr.appendChild(tdTime);
    tr.appendChild(tdGap);
    tbody.appendChild(tr);
  });

  const chartSvg = document.getElementById('detail-chart');
  if (chartSvg) {
    chartSvg.innerHTML = '';
    renderChart(
      chartSvg,
      (session.laps ?? []).map((l) => ({ lapTime: l.lapTimeMs, lapNumber: l.lapNumber })),
      session.bestLapMs
    );
  }

  modal.removeAttribute('hidden');
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

  document.getElementById('btn-detail-close')?.addEventListener('click', () => {
    document.getElementById('session-detail-modal')?.setAttribute('hidden', '');
  });
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


