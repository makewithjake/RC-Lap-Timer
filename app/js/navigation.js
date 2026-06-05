import { showScreen, currentScreen } from './router.js';

const DEFAULT_STATE = {
  screen: 'home',
  modal: null,
  sessionId: null,
};

function _normalizeState(state) {
  const normalized = {
    ...DEFAULT_STATE,
    ...(state ?? {}),
    screen: state?.screen ?? currentScreen() ?? 'home',
  };

  if (normalized.modal !== 'session-detail') {
    normalized.sessionId = null;
  }

  return normalized;
}

function _sameState(a, b) {
  return a.screen === b.screen && a.modal === b.modal && a.sessionId === b.sessionId;
}

function _writeState(state, replace) {
  const nextState = _normalizeState(state);
  const currentState = _normalizeState(history.state);

  if (replace) {
    history.replaceState(nextState, '');
    return nextState;
  }

  if (!_sameState(currentState, nextState)) {
    history.pushState(nextState, '');
  }

  return nextState;
}

export function initNavigation(initialScreen = 'home') {
  const initialState = _normalizeState(history.state?.screen ? history.state : { screen: initialScreen });
  history.replaceState(initialState, '');
  return initialState;
}

export function getNavigationState() {
  return _normalizeState(history.state);
}

export function showScreenState(screen, options = {}) {
  const { replace = false, state = {}, syncHistory = true } = options;
  const nextState = _normalizeState({ ...getNavigationState(), ...state, screen });

  showScreen(screen);

  if (syncHistory) {
    _writeState(nextState, replace);
  }

  return nextState;
}

export function updateNavigationState(patch, options = {}) {
  const { replace = false, syncHistory = true } = options;
  const nextState = _normalizeState({ ...getNavigationState(), ...(patch ?? {}) });

  if (syncHistory) {
    _writeState(nextState, replace);
  }

  return nextState;
}