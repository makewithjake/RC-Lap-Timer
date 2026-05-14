# Phase 1 Implementation Plan – Foundation & PWA Scaffold

## Reference
> Sourced from `plan.md` → **Phase 1: Foundation & PWA Scaffold**
> _Goal: Establish the shell and offline capabilities before adding complex logic._

---

## Milestone Definition
The app is **installable via Chrome/Safari** and opens to the **Home Screen** without an internet connection.

---

## Project Architecture (No Code Yet)

```
rc-lap-timer/
├── index.html              # Single-page app shell; all screens rendered here
├── manifest.json           # PWA install metadata, icons, theme
├── sw.js                   # Service Worker — caches shell for offline use
│
├── styles/
│   ├── tokens.css          # CSS custom properties (color palette, typography, spacing)
│   ├── global.css          # Resets, base layout rules, shared utility classes
│   └── home.css            # Styles scoped to the Home Screen (Screen 1)
│
├── js/
│   ├── app.js              # Entry point — boots the app, registers SW, kicks off router
│   ├── router.js           # Screen navigation — shows/hides screen sections by ID
│   └── home.js             # Home Screen logic — reads form fields, handles nav buttons
│
└── Assets/
    └── icons/              # PWA icons (192×192, 512×512 in PNG; SVG source if possible)
```

**Stack constraints (from PRD):**
- Vanilla JS (ES6+) — no frameworks
- CSS3 — no preprocessors
- OLED true-black (`#000000`) backgrounds — hard requirement

---

## Task Breakdown

Tasks are organized into **sequential stages**. Within each stage, all listed tasks are **fully independent and can be assigned to separate agents simultaneously**.

---

### STAGE 0 — Prerequisite Inventory ✅ COMPLETE
> Must complete before any other stage begins.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **0.1** | Audit `Assets/` folder and define required PWA icon sizes | ✅ Done | Existing files (`screenstyleexample.png` 2572×1388, `webpagescreenstyleexample.png` 2586×1414) are landscape screenshots — not suitable as square app icons. **Decision: placeholder icons generated.** Created `Assets/icons/icon-192.png`, `Assets/icons/icon-512.png`, `Assets/icons/icon-180.png` — black background (#000000) with Electric Lime (#C6FF00) rounded rectangle motif. Replace with final artwork before production. |
| **0.2** | Confirm final directory structure and file naming conventions | ✅ Done | Directory layout confirmed as specified above. `localStorage` keys confirmed: `rc_driverName`, `rc_carName`, `rc_location`. Icon paths: `Assets/icons/icon-192.png`, `Assets/icons/icon-512.png`, `Assets/icons/icon-180.png`. |

---

### STAGE 1 — Parallel Foundation _(4 independent agents)_
> All four tasks have zero dependencies on each other. Assign simultaneously.

#### Agent 1-A · `manifest.json` ✅ COMPLETE
**Deliverable:** A complete, valid PWA web app manifest.

| ID | Task | Details |
|----|------|---------|
| **1.1** | ~~Write `manifest.json`~~ ✅ Done | `name`: "RC Lap Timer", `short_name`: "RC Timer", `start_url`: "/", `display`: "standalone", `background_color`: "#000000", `theme_color`: "#C6FF00" (Electric Lime accent). Define `icons` array with 192×192 and 512×512 entries pointing to `Assets/icons/`. Set `orientation`: "portrait". Include `description` field. |

---

#### Agent 1-B · `sw.js` — Service Worker
**Deliverable:** A working Service Worker that caches the app shell.

| ID | Task | Details |
|----|------|---------|
| **1.2** | Write `sw.js` using a Cache-First strategy | Cache name must include a version string (e.g., `rc-timer-v1`) for future cache-busting. On `install` event: pre-cache `index.html`, `styles/tokens.css`, `styles/global.css`, `styles/home.css`, `js/app.js`, `js/router.js`, `js/home.js`, and `manifest.json`. On `fetch` event: serve from cache first; fall back to network. On `activate` event: delete old cache versions. |

---

#### Agent 1-C · CSS Files (`tokens.css`, `global.css`, `home.css`)
**Deliverable:** Three CSS files implementing the full visual design for Phase 1.

| ID | Task | Details |
|----|------|---------|
| **1.3** | Write `styles/tokens.css` | Define every CSS custom property from the style guide: `--color-bg: #000000`, `--color-surface: #111111`, `--color-surface-raised: #1A1A1A`, `--color-border: #2A2A2A`, `--color-border-subtle: #1E1E1E`, `--color-text-primary: #FFFFFF`, `--color-text-secondary: #A0A0A0`, `--color-text-muted: #555555`, `--color-accent: #C6FF00`, `--color-accent-dim: #8AAF00`, `--color-accent-glow: rgba(198,255,0,0.15)`, `--color-start: #22C55E`, `--color-stop: #EF4444`, `--color-reset: #F59E0B`. Font stacks: `--font-ui`, `--font-display`, `--font-mono`. Base spacing scale. |
| **1.4** | Write `styles/global.css` | CSS reset (box-sizing, margin/padding zero, `font-family: var(--font-ui)`). Root background `#000000`. Ensure `html, body` fill full viewport height. Base `button` reset (no browser defaults). Utility: `.visually-hidden` for accessibility. Minimum interactive hit area: all buttons must be at minimum 48×48px — enforce with a base button rule. |
| **1.5** | Write `styles/home.css` | Styles for the Home Screen layout only. Vertical flex column layout centered. App title/logo area at top. Form group styles for Driver Name, Car Name, Location fields — `background: var(--color-surface-raised)`, `border: 1px solid var(--color-border)`, white text. Primary CTA button ("Start New Session"): background `var(--color-accent)`, text `#000000`, bold, full-width, large (min 64px height). Secondary button ("View History"): outline style, `border-color: var(--color-border)`, `color: var(--color-text-primary)`. Gear icon button: top-right corner, 48×48 hit area minimum. |

---

#### Agent 1-D · `index.html` — App Shell Structure ✅ COMPLETE
**Deliverable:** The single-page HTML document with semantic structure for all Phase 1 screens declared.

| ID | Task | Details |
|----|------|---------|
| **1.6** | ~~Write `index.html`~~ ✅ Done | `<!DOCTYPE html>`, `lang="en"`, UTF-8 charset, `viewport` meta (`width=device-width, initial-scale=1`). `theme-color` meta tag: `#C6FF00`. Apple-specific PWA meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black`, `apple-touch-icon` link pointing to `Assets/icons/icon-180.png`. Link to `manifest.json`. Link to all three CSS files in order: `tokens.css` → `global.css` → `home.css`. Body contains one `<main>` with `<section id="screen-home">` as the only visible section in Phase 1. The Home Screen section contains: `<h1>` app title, gear icon `<button>` (top-right), three `<input type="text">` fields (Driver Name, Car Name, Location) with `<label>` elements, "Start New Session" `<button>`, "View History" `<button>`. Script tag at bottom of body loading `js/app.js` as `type="module"`. |

---

### STAGE 2 — Parallel JavaScript Modules _(3 independent agents)_
> Depends on Stage 1 completing. All three JS files are independent of each other and can be written simultaneously.

#### Agent 2-A · `js/router.js`
**Deliverable:** A simple screen-routing module with no external dependencies.

| ID | Task | Details |
|----|------|---------|
| **2.1** | Write `js/router.js` | Export a `Router` class or a `showScreen(screenId)` function. Logic: hide all `<section>` elements within `<main>`, then show the `<section id="screen-{screenId}">` element by removing a `hidden` attribute or toggling a CSS class. Export a `currentScreen()` getter. No history/URL manipulation needed in Phase 1 — pure DOM state only. |

---

#### Agent 2-B · `js/home.js` ✅ COMPLETE
**Deliverable:** Home Screen logic module.

| ID | Task | Details |
|----|------|---------|
| **2.2** | ~~Write `js/home.js`~~ ✅ Done | Export an `initHome()` function. On call: read any previously saved values from `localStorage` for `driverName`, `carName`, and `location` and pre-fill the input fields. Attach `input` event listeners to save field values to `localStorage` on change (debounced is fine, or on blur). Attach click handler to "Start New Session" button — calls `router.showScreen('viewfinder')` (stub for Phase 2). Attach click handler to "View History" button — calls `router.showScreen('history')` (stub). Attach click handler to gear icon — calls `router.showScreen('settings')` (stub). All navigation stubs should `console.log` the target screen name for now — no crash, no broken state. |

---

#### Agent 2-C · `js/app.js`
**Deliverable:** Entry point that wires everything together and registers the Service Worker.

| ID | Task | Details |
|----|------|---------|
| **2.3** | Write `js/app.js` | Import `Router` from `./router.js`. Import `initHome` from `./home.js`. On `DOMContentLoaded`: (1) Register the Service Worker — check `'serviceWorker' in navigator`, then call `navigator.serviceWorker.register('/sw.js')`. Log registration success/failure. (2) Initialize the router. (3) Call `showScreen('home')` as the default landing screen. (4) Call `initHome()`. No other logic in Phase 1. |

---

### STAGE 3 — Integration & Milestone Validation _(single agent)_ ✅ COMPLETE
> Depends on Stage 2 completing. Final wiring and smoke-testing.

| ID | Task | Details |
|----|------|---------|
| **3.1** | ~~Cross-check all file references~~ ✅ Done | All CSS `<link>` paths, JS `<script>` path, `manifest.json` link, and icon path in `index.html` verified against actual files. SW pre-cache list confirmed to match all 8 assets. **Fix applied:** `index.html` class names were mismatched with `home.css` selectors (written by separate parallel agents) — corrected gear button class to `home-gear-btn`, field wrappers to `home-field`, nav wrapper to `home-nav`, and CTA button classes to `btn-start-session` / `btn-view-history`. Gear button moved outside title wrapper to match CSS `position:absolute` pattern. |
| **3.2** | ~~Validate PWA installability checklist~~ ✅ Done | `manifest.json` linked in `<head>` ✅. `start_url: "/"` ✅. `icons` array with 192×192 and 512×512 entries ✅. `display: "standalone"` ✅. `sw.js` at project root (full-app scope) ✅. **Deployment note:** PWAs require HTTPS in production; `localhost` (any port) is exempt for local testing. |
| **3.3** | ~~Audit minimum touch target sizes~~ ✅ Done | Base `button` reset in `global.css` enforces `min-width: 48px; min-height: 48px` globally. Gear button: explicit `width/height: 48px` ✅. Start button: `min-height: 64px` ✅. History button: `min-height: 48px` ✅. Input fields: `min-height: 48px` ✅. All targets compliant. |
| **3.4** | ~~Validate OLED color compliance~~ ✅ Done | `body` uses `background-color: var(--color-bg)` where `--color-bg: #000000` ✅. `#screen-home` uses `background-color: var(--color-bg)` ✅. `#111111` and `#1A1A1A` are used only for surface/card elements, never for root backgrounds. Fully compliant. |
| **3.5** | ~~Write a brief local test checklist~~ ✅ Done | See **Local Test Checklist** section below. |

---

### Local Test Checklist — Phase 1 Milestone

> Run these manual steps before declaring Phase 1 complete. Use a local web server — **do not open `index.html` directly via `file://`** (Service Workers will not register).
>
> Quick server: `python3 -m http.server 8080` from the project root, then open `http://localhost:8080`.

**Step 1 — Service Worker registers and caches assets**
1. Open `http://localhost:8080` in Chrome.
2. Open DevTools (F12) → **Application** → **Service Workers**.
3. Confirm `sw.js` shows **Status: activated and is running**.
4. Open **Application** → **Cache Storage** → **rc-timer-v1**.
5. Confirm all 8 assets are listed: `index.html`, `manifest.json`, the 3 CSS files, the 3 JS files.

**Step 2 — App loads offline**
1. DevTools → **Network** tab → check ☑ **Offline**.
2. Refresh the page (Cmd+R / Ctrl+R).
3. ✅ App must load completely — no network error, no blank screen.
4. Uncheck Offline to restore connectivity.

**Step 3 — PWA installs**
1. Look for the install icon (⊕) in Chrome's address bar, or open the browser menu → **Install RC Lap Timer**.
2. ✅ Install prompt appears and the app can be added to the home screen / desktop.

**Step 4 — Home Screen renders correctly**
1. Confirm the screen shows:
   - "RC Timer" title centred near the top.
   - Gear ⚙ icon button in the top-right corner (48×48 hit area).
   - Three labelled input fields: Driver Name, Car Name, Location.
   - "START NEW SESSION" primary button (Electric Lime `#C6FF00`, min 64px tall).
   - "VIEW HISTORY" secondary/outline button below it.
2. ✅ No layout overflow, no white/grey root background, no console errors.

**Step 5 — Input persistence**
1. Type values into all three fields, then click outside each (triggers `blur`).
2. Refresh the page.
3. ✅ All three values are pre-filled from `localStorage`.

**Step 6 — Navigation stubs fire without crashing**
1. Click **Start New Session** → DevTools console logs `Navigate to: viewfinder`.
2. Click **View History** → logs `Navigate to: history`.
3. Click the gear icon → logs `Navigate to: settings`.
4. ✅ No uncaught errors; router emits a warning about the missing section (expected in Phase 1).

---

## Dependency Graph

```
STAGE 0 (Inventory)
    │
    ▼
STAGE 1 (all parallel)
  ┌─────────────────────────────────────────┐
  │  1-A manifest.json                      │
  │  1-B sw.js                              │
  │  1-C tokens.css / global.css / home.css │
  │  1-D index.html                         │
  └─────────────────────────────────────────┘
    │
    ▼
STAGE 2 (all parallel)
  ┌─────────────────────────────┐
  │  2-A router.js              │
  │  2-B home.js                │
  │  2-C app.js                 │
  └─────────────────────────────┘
    │
    ▼
STAGE 3 (Integration & Validation)
```

---

## Agent Assignment Summary

| Agent Slot | Stage | Files | Independent? |
|------------|-------|-------|--------------|
| Agent 0 | Stage 0 | — (audit only) | Run first |
| Agent 1-A | Stage 1 | `manifest.json` | ✅ Fully parallel with 1-B, 1-C, 1-D |
| Agent 1-B | Stage 1 | `sw.js` | ✅ Fully parallel with 1-A, 1-C, 1-D |
| Agent 1-C | Stage 1 | `styles/tokens.css`, `styles/global.css`, `styles/home.css` | ✅ Fully parallel with 1-A, 1-B, 1-D |
| Agent 1-D | Stage 1 | `index.html` | ✅ Fully parallel with 1-A, 1-B, 1-C |
| Agent 2-A | Stage 2 | `js/router.js` | ✅ Fully parallel with 2-B, 2-C |
| Agent 2-B | Stage 2 | `js/home.js` | ✅ Fully parallel with 2-A, 2-C |
| Agent 2-C | Stage 2 | `js/app.js` | ✅ Fully parallel with 2-A, 2-B |
| Agent 3 | Stage 3 | (validation only) | Run last |

**Maximum parallel agents at once: 4** (during Stage 1)

---

## Key Constraints & Rules for All Agents

- **No frameworks.** Vanilla JS (ES6+ modules), plain CSS, plain HTML only.
- **OLED true-black.** `background-color` for the app root and page backgrounds must be `#000000`. Never use near-black grays like `#0A0A0A` or `#111111` for the root — those are reserved for card surfaces.
- **48×48px minimum touch targets.** Every `<button>` and interactive element must have a minimum hit area of 48×48px.
- **CSS custom properties only.** All color and typography values must reference tokens from `tokens.css`, not be hardcoded in component stylesheets.
- **Module system.** All JS files use `import`/`export` (ES Modules). `app.js` is the only file loaded via `<script type="module">` in HTML.
- **`localStorage` keys.** Establish a consistent key naming convention from the start: `rc_driverName`, `rc_carName`, `rc_location`. This prevents collisions in later phases.
- **Service Worker scope.** `sw.js` must live at the root of the project (same level as `index.html`) to have full-app scope.
- **No inline styles.** All styling goes in CSS files.
- **No `console.error` suppression.** All SW registration errors must be surfaced to the console for debugging.
