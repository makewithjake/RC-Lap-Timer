// js/calibration.js
// Phase 3: Task Group B — Calibration State Module
// Pure JS state module — no imports, no DOM dependency.

// ── B1: Constants ─────────────────────────────────────────────

const SENSITIVITY_MIN     = 1;
const SENSITIVITY_MAX     = 100;
const SENSITIVITY_DEFAULT = 75;

const DEBOUNCE_MIN     = 1.0;
const DEBOUNCE_MAX     = 5.0;
const DEBOUNCE_DEFAULT = 2.0;

const ZONE_WIDTH_MIN     = 10;
const ZONE_WIDTH_MAX     = 100;
const ZONE_WIDTH_DEFAULT = 20;

// ── B1: State ─────────────────────────────────────────────────

let _sensitivity = SENSITIVITY_DEFAULT; // integer 1–100
let _debounce    = DEBOUNCE_DEFAULT;    // float 1.0–5.0, one decimal place
let _zoneWidth   = ZONE_WIDTH_DEFAULT;  // integer 10–100 (pixel units on full-resolution canvas)

// ── B2: Getter/Setter Pairs ───────────────────────────────────

export function getSensitivity() {
  return _sensitivity;
}

export function setSensitivity(n) {
  _sensitivity = Math.round(Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, n)));
}

export function getDebounce() {
  return _debounce;
}

export function setDebounce(n) {
  _debounce = parseFloat(Math.max(DEBOUNCE_MIN, Math.min(DEBOUNCE_MAX, n)).toFixed(1));
}

export function getZoneWidth() {
  return _zoneWidth;
}

export function setZoneWidth(n) {
  _zoneWidth = Math.round(Math.max(ZONE_WIDTH_MIN, Math.min(ZONE_WIDTH_MAX, n)));
}

// ── B3: getAllSettings & resetToDefaults ──────────────────────

export function getAllSettings() {
  return { sensitivity: _sensitivity, debounce: _debounce, zoneWidth: _zoneWidth };
}

export function resetToDefaults() {
  _sensitivity = SENSITIVITY_DEFAULT;
  _debounce    = DEBOUNCE_DEFAULT;
  _zoneWidth   = ZONE_WIDTH_DEFAULT;
}
