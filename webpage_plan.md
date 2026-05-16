# RC Lap Timer – Marketing Webpage Implementation Plan

## Overview

A standalone marketing landing page for the RC Lap Timer PWA, designed to be hosted via GitHub Pages. The page showcases app features and provides a prominent PWA install CTA. Design follows the style guide exactly — OLED true-black, Electric Lime (`#C6FF00`) accent, circuit board overlay, Barlow Condensed display font.

---

## 1. Hosting Architecture & Repository Structure

### GitHub Pages Strategy

**Approach: Root-served, app relocated to `/app/`**

- GitHub Pages is configured to serve from the **`main` branch root**.
- The marketing page becomes the new `index.html` at the repo root.
- The PWA app is moved to an `/app/` subdirectory (`/app/index.html`).
- The service worker (`sw.js`) is relocated to `/app/sw.js` and its scope is adjusted to `/app/`.
- The "Launch App" / install CTA button links to `/app/` (relative) or the full deployed URL.

### Final File Structure (after reorganization)

```
/ (root)
├── index.html              ← Marketing landing page (NEW)
├── styles/
│   └── landing.css         ← All marketing page styles (NEW)
├── js/
│   └── landing.js          ← Install prompt logic + scroll animations (NEW)
├── Assets/
│   ├── icons/
│   ├── circuit-overlay.svg ← Circuit board background SVG (NEW)
│   └── app-screenshot.png  ← App mockup/screenshot for hero (NEW or existing)
├── app/                    ← PWA app relocated here
│   ├── index.html          ← (was root index.html)
│   ├── manifest.json
│   ├── sw.js
│   ├── js/
│   └── styles/
└── CNAME                   ← Optional: custom domain (e.g., rctimer.app)
```

### GitHub Pages Config

- Go to **Settings → Pages → Source**: Deploy from branch `main`, folder `/root`.
- Add `CNAME` file if using a custom domain.
- Ensure `manifest.json` inside `/app/` has `"start_url": "/app/"` and `"scope": "/app/"`.

---

## 2. Design Specification

Follows [style_guide.md](style_guide.md) exactly. Key marketing-page rules:

| Property | Value |
|---|---|
| Background | `#000000` + circuit board SVG overlay (8% opacity) |
| Hero font | `Barlow Condensed` (Google Fonts), weight 800 |
| Body font | System UI stack (`--font-ui`) |
| Accent color | `#C6FF00` (Electric Lime) |
| Max content width | `1200px` centered |
| Hero | `100dvh`, vertically + horizontally centered |
| Section padding | `80px` top/bottom desktop / `48px` mobile |
| Feature grid | 3-column desktop → 1-column mobile |
| Decorative | Radial lime glow behind hero image/mockup |
| Navigation | Sticky top nav: Features · How It Works · Install · Download |

### Circuit Board Overlay

- SVG `<pattern>` of thin `#0D2B0D` lines on `#000000`, applied as `background-image`.
- Opacity ~8%, used on hero and alternating section backgrounds only.
- Never rendered inside the PWA itself.

---

## 3. Page Sections

### Section 1: Navigation Bar
- Logo / wordmark left-aligned: `RC TIMER` in Electric Lime, Barlow Condensed
- Nav links right-aligned: **Features** · **How It Works** · **Install** · **Download**
- Sticky on scroll with `background: rgba(0,0,0,0.85)` + `backdrop-filter: blur(12px)` glass effect
- Mobile: collapses to hamburger menu (animated open/close)

### Section 2: Hero
- Full-viewport-height (`100dvh`)
- Circuit board SVG overlay + subtle radial lime glow centered on hero image
- Eyebrow label: `THE FREE OPEN-SOURCE RC LAP TIMER` (uppercase, `--color-text-secondary`)
- Headline: `Your Phone Is Your Finish Line.` (Barlow Condensed, ExtraBold, `clamp(2.5rem, 5vw, 4.5rem)`)
- Subheadline: 1–2 lines of supporting copy (~16px, `--color-text-secondary`)
- **Primary CTA:** Electric Lime button — `Install Free App` (triggers PWA install prompt)
- **Secondary CTA:** Ghost button — `See How It Works` (smooth-scrolls to How It Works section)
- App screenshot/mockup image (phone frame with dashboard screenshot), positioned right on desktop, below text on mobile

### Section 3: Feature Highlights
- Section heading: `BUILT FOR THE TRACK` (Barlow Condensed, 2rem, `--color-text-primary`)
- 3-column card grid (desktop), 1-column (mobile)
- 6 feature cards, each with:
  - 48px outlined accent icon (`#C6FF00`)
  - Feature title (bold, `--font-ui`)
  - 2–3 line description (`--color-text-secondary`)
  - `1px solid #2A2A2A` border, `border-radius: 12px`, `background: #111111`

**Feature Cards:**
1. **Camera-Based Detection** — No hardware needed. Uses your phone's camera as a motion-sensing finish line.
2. **Custom Trigger Zone** — Draw your detection line directly on the live feed. Only pixels in the zone are processed — max battery life.
3. **Real-Time Lap Audio** — TTS voice announces every lap time the moment the car crosses. Eyes stay on the track.
4. **Offline Ready** — Full airplane-mode support via service worker. Works at remote tracks with no signal.
5. **Glove-Friendly Controls** — Extra-large buttons and high-contrast OLED display built for use at arm's length.
6. **Session History** — Every session saved locally. Review lap tables, charts, and personal bests anytime.

### Section 4: How It Works
- Section heading: `THREE STEPS TO YOUR FIRST LAP`
- Horizontal 3-step flow (desktop), vertical stack (mobile)
- Each step: large step number in Electric Lime, step title, description, optional inline illustration/icon
  1. **Point & Draw** — Open the app, aim the camera at your finish line, drag to draw your Trigger Zone.
  2. **Lock & Calibrate** — Freeze exposure, test sensitivity with the Virtual LED, set your debounce window.
  3. **Race** — Hit Start. The timer runs automatically every time your car crosses the line.
- Connecting line/arrow between steps on desktop

### Section 5: PWA Install Section
- Distinct background: `#111111` surface with circuit board overlay
- Heading: `FREE. INSTANT. NO APP STORE.`
- Body copy: Explain what a PWA is in one sentence.
- **Large Electric Lime install button** (triggers `BeforeInstallPrompt` if available)
- Platform-specific fallback instructions (accordion or tabs):
  - **iOS Safari:** Share button → "Add to Home Screen"
  - **Android Chrome:** Three-dot menu → "Add to Home Screen" / auto-prompt
  - **Desktop Chrome/Edge:** Install icon in address bar
- "Or open in browser" link as a ghost button

### Section 6: App Screenshots Strip
- Horizontal scrollable strip (or static grid) of 2–3 app screenshots with thin `#2A2A2A` borders
- Optional: subtle phone frame around each
- Screenshots: Viewfinder (trigger zone drawn), Dashboard (active race), Post-Session chart

### Section 7: Footer
- `RC TIMER` wordmark in Electric Lime
- Links: GitHub repo · Style Guide · PRD · Privacy (if applicable)
- Copyright line in `--color-text-muted`
- "Made with ❤️ for RC" tagline

---

## 4. Technical Requirements

### PWA Install Prompt Logic (`landing.js`)
```
- Listen for `beforeinstallprompt` event; stash the prompt.
- Show the Electric Lime install button only when the prompt is available.
- On button click: call `prompt.prompt()`, await `userChoice`.
- If dismissed or not available: scroll to platform-specific instructions section.
- Track install via `appinstalled` event.
```

### Performance
- Google Fonts (Barlow Condensed) loaded with `<link rel="preconnect">` + `display=swap`
- Critical CSS inlined for above-the-fold hero (optional: if LCP needs optimization)
- Images use `loading="lazy"` except the hero image
- Circuit board overlay is a CSS `background-image` SVG data URI (no additional network request)
- No JavaScript frameworks — vanilla JS only, matching app stack

### SEO & Social
- `<title>RC Timer — Camera-Based Lap Timer for RC Cars`
- `<meta name="description">` (140–160 chars)
- Open Graph tags: `og:title`, `og:description`, `og:image` (1200×630 social card)
- Twitter Card tags
- Canonical URL tag
- `robots.txt` permitting all crawlers

### Accessibility
- All images have descriptive `alt` text
- Focus rings on all interactive elements (`outline: 2px solid #C6FF00`)
- Skip-to-content link at top of page
- `prefers-reduced-motion` respected — scroll animations disabled
- Minimum 4.5:1 contrast on all text (Electric Lime on black = ~13:1 ✓)
- Hamburger menu: ARIA `expanded` attribute toggled, `aria-label` on button

---

## 5. Implementation Plan — Parallel Workstreams

The tasks below are organized into independent workstreams that can be assigned to separate agents and executed concurrently. Sequential dependencies are noted.

---

### Workstream A — Repository & GitHub Pages Setup
*Can start immediately. No dependencies.*

**Tasks:**
- [ ] A1: Create `/app/` directory and move all current PWA files (index.html, manifest.json, sw.js, js/, styles/) into it
- [ ] A2: Update `manifest.json` `start_url` to `/app/` and `scope` to `/app/`
- [ ] A3: Update `sw.js` cache paths to reflect `/app/` prefix
- [ ] A4: Update any internal `href` / `src` paths within the moved PWA files
- [ ] A5: Create `CNAME` file (placeholder — user fills in domain, or leave empty for `username.github.io`)
- [ ] A6: Verify GitHub Pages settings documentation in a `DEPLOY.md` file

---

### Workstream B — Design Tokens & Base CSS
*Can start immediately. No dependencies. Output consumed by C, D, E, F, G.*

**Tasks:**
- [ ] B1: Create `styles/landing.css` with all CSS custom properties (colors, fonts, spacing, radii, transitions)
- [ ] B2: Implement global resets, box-sizing, smooth-scroll, and `prefers-reduced-motion` media query block
- [ ] B3: Create circuit board SVG pattern as a CSS `background-image` data URI utility class (`.circuit-bg`)
- [ ] B4: Implement responsive typography scale (Barlow Condensed import + heading/body size tokens)
- [ ] B5: Implement reusable component styles: `.btn-primary`, `.btn-ghost`, `.card`, `.pill-badge`, focus ring

---

### Workstream C — Hero Section
*Depends on B (CSS tokens). Can run in parallel with D, E, F, G after B is delivered.*

**Tasks:**
- [ ] C1: Author Hero section HTML markup (`<section id="hero">`) with eyebrow, headline, subheadline, two CTAs
- [ ] C2: Style hero layout: full-viewport, flexbox centered, circuit overlay, radial lime glow
- [ ] C3: Position app screenshot/mockup image (right column desktop, below text mobile)
- [ ] C4: Implement scroll-triggered fade-in animation (respects `prefers-reduced-motion`)
- [ ] C5: Ensure hero CTA button is wired to the `installPrompt` stash in `landing.js` (coordinate with F)

---

### Workstream D — Features & How It Works Sections
*Depends on B (CSS tokens). Can run in parallel with C, E, F, G after B is delivered.*

**Tasks:**
- [ ] D1: Author Features section HTML with 6 feature cards and Heroicons/Phosphor outlined SVG icons
- [ ] D2: Implement 3-column → 1-column responsive CSS grid for feature cards
- [ ] D3: Author How It Works section HTML with 3-step flow and step numbers
- [ ] D4: Implement desktop horizontal layout with connecting accent line; mobile vertical stack
- [ ] D5: Implement scroll-triggered stagger animation for card/step entrance

---

### Workstream E — Screenshots Strip & Footer
*Depends on B (CSS tokens). Can run in parallel with C, D, F, G after B is delivered.*

**Tasks:**
- [ ] E1: Author Screenshots section HTML — horizontal scroll strip with 2–3 app screenshots
- [ ] E2: Style screenshot containers with `#2A2A2A` borders, optional phone frame, `border-radius: 12px`
- [ ] E3: Author Footer HTML with wordmark, nav links, copyright, tagline
- [ ] E4: Style footer layout (flex, centered on mobile, spaced on desktop)

---

### Workstream F — Navigation Bar & Mobile Menu
*Depends on B (CSS tokens). Can run in parallel with C, D, E, G after B is delivered.*

**Tasks:**
- [ ] F1: Author `<nav>` HTML with logo wordmark, nav links, hamburger button
- [ ] F2: Implement sticky nav CSS: `position: sticky`, glass effect (`backdrop-filter: blur(12px)`)
- [ ] F3: Implement hamburger menu: JS toggle, `aria-expanded`, slide-in mobile drawer animation
- [ ] F4: Implement active-link highlighting on scroll using `IntersectionObserver`
- [ ] F5: Implement smooth-scroll behavior for all nav anchor links

---

### Workstream G — Install Section & PWA Install Logic
*Depends on B (CSS tokens). Landing.js logic can start immediately (no CSS dependency).*

**Tasks:**
- [ ] G1: Author Install section HTML with heading, body copy, install button, platform accordion
- [ ] G2: Style Install section with `#111111` background, circuit overlay, centered layout
- [ ] G3: Implement `landing.js`: `beforeinstallprompt` capture, button show/hide, `prompt()` call, `appinstalled` tracking
- [ ] G4: Implement platform-detection logic to show the correct instruction set (iOS vs Android vs Desktop)
- [ ] G5: Implement accordion/tabs for platform-specific install instructions (CSS-only if possible, no JS dependency)

---

### Workstream H — SEO, Meta, Social & Accessibility Audit
*Can start immediately for meta tags. Final accessibility audit depends on all other workstreams completing.*

**Tasks:**
- [ ] H1: Author full `<head>` block: title, meta description, OG tags, Twitter Card tags, canonical, Barlow Condensed preconnect
- [ ] H2: Create `og-image.png` social card (1200×630) matching the brand aesthetic
- [ ] H3: Create `robots.txt`
- [ ] H4: Add `skip-to-content` link; audit all images for `alt` text
- [ ] H5: Run contrast audit against WCAG AA for all text/background combinations used on the page
- [ ] H6: Final cross-browser and mobile responsiveness check (Chrome, Safari iOS, Firefox)

---

## 6. Dependency Graph

```
Immediately parallel:
  A (Repo setup) ─────────────────────────────────────────► A complete
  B (Tokens/CSS) ─► C (Hero)
                 ─► D (Features/How It Works)
                 ─► E (Screenshots/Footer)
                 ─► F (Nav)
                 ─► G (Install section)
  G3 (landing.js) can start immediately (no CSS dep)
  H1–H3 can start immediately (no other dep)

Final gate (H6 audit) waits for A, B, C, D, E, F, G all complete.
```

---

## 7. Acceptance Criteria

- [ ] Page scores ≥ 90 on Lighthouse Performance, Accessibility, Best Practices, SEO
- [ ] PWA install prompt fires correctly on Android Chrome and is suppressed gracefully on iOS
- [ ] All 6 feature cards, 3 how-it-works steps, and all sections render correctly at 375px, 768px, and 1440px
- [ ] Electric Lime (`#C6FF00`) is the only non-white foreground color used on headings/CTAs
- [ ] Circuit board overlay visible on hero and install section backgrounds, absent inside the app
- [ ] Navigation collapses to hamburger at ≤ 768px with full ARIA support
- [ ] `prefers-reduced-motion` disables all scroll animations
- [ ] Clicking "Install Free App" on a supported browser triggers the native install prompt
- [ ] App loads correctly from `/app/` path after restructure (service worker scope verified)
- [ ] GitHub Pages deployment confirmed live at `https://username.github.io/repo-name`
