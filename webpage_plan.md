# RC Lap Timer – Marketing Webpage Plan

## Overview

Standalone marketing landing page hosted via GitHub Pages (root of repo). Showcases the PWA and drives installs. Follows the style guide exactly — OLED true-black, Electric Lime (`#C6FF00`) accent, Barlow Condensed display font, circuit board SVG overlay.

**Scope:** This file covers the marketing webpage (`/index.html`) only. The PWA app lives in `/app/`.

---

## Architecture

- GitHub Pages serves from `main` branch root
- PWA app relocated to `/app/` — `manifest.json` `start_url`/`scope` set to `/app/`, service worker cache paths prefixed with `/app/`
- Screenshots live in `/Assets/screenshots/`
- `landing.js` handles `beforeinstallprompt` capture, platform-detection, and install CTA logic

**Key files:** `index.html` · `styles/landing.css` · `js/landing.js` · `CNAME` · `DEPLOY.md`

---

## Completed

- Repository restructure: PWA moved to `/app/`, all internal paths updated
- `styles/landing.css` — tokens, resets, circuit SVG pattern, responsive typography, `.btn-primary` / `.btn-ghost` / `.card`
- Nav — sticky glass effect, hamburger menu with ARIA, `IntersectionObserver` active-link, smooth-scroll
- Hero — `100dvh`, eyebrow + headline + subheadline + dual CTAs, dashboard screenshot in phone chrome with radial lime glow
- Feature cards — 6-card 3→1 column grid with outlined Electric Lime icons
- How It Works — 3-step horizontal/vertical layout with inline screenshots, connecting accent line
- Screenshots strip — 4 slots in phone frames with Electric Lime captions, horizontal scroll
- Install section — `#111111` + circuit overlay, platform accordion (iOS / Android / Desktop)
- Footer — wordmark, nav links, copyright, tagline
- `js/landing.js` — `beforeinstallprompt` capture, platform-detection, `appinstalled` tracking
- SEO/meta — title, description, OG tags, Twitter Card, canonical, `robots.txt`
- Accessibility — skip-to-content, all `alt` text, focus rings, `prefers-reduced-motion`, WCAG AA contrast verified
- GitHub Pages deployment live

---

## Current Focus

- ~~`Screenshot_home_v1.png` should be added to carousel at bottom of page in slot 1~~ (already in slot 1)
- ~~bug: webpage on mobile issue. when hamburger menu is selected, drop down menu apperas but with transparent background, and overlays existing text, making it difficult to read.  background of this menu should be solid black.~~ Fixed: moved `nav-links` outside the sticky `<nav>` element to escape the `backdrop-filter` stacking context; bumped z-index to 200.
- ~~bug: on mobile when swiping right to hamburger/drop down menu after scrolling to bottom of page, user must scroll back upwards before reaching the menu.  swipe right should expose the menu immediately, and then if user swips left/back, should return to top of the page.~~ Fixed: removed `touchStartX <= 40` edge constraint so right-swipe works from anywhere; added exclusion for `.screenshots-strip` to prevent conflicts with horizontal scroll.
- ~~udpate marketing copy and domain info with laptrack.app for domain and LapTrack wherever RC Timer is used.~~

---

## Future Tasks
- Verify Lighthouse scores ≥ 90 across Performance, Accessibility, Best Practices, SEO
- Cross-browser QA: Chrome, Safari iOS, Firefox at 375px / 768px / 1440px
- Confirm PWA install prompt fires on Android Chrome; graceful fallback on iOS
- Create `og-image.png` social card (1200×630) matching brand aesthetic

### Features
- Add video demo embed or animated GIF in the How It Works section as an alternative to static screenshots
- Dark/light mode toggle for the marketing page (currently OLED-only)
- Blog/changelog section for updates and race tips
- Localization (i18n) for non-English markets

### Polish
- Optimize hero LCP — inline critical CSS above the fold if Lighthouse flags it
- Lazy-load screenshot strip images via `IntersectionObserver` if page weight grows
- Animate the circuit board overlay subtly (slow pan or pulse) for visual interest

### Bugs / Watch Items
- `beforeinstallprompt` is not fired on iOS Safari — confirm fallback instructions accordion displays correctly
- Verify `CNAME` custom domain does not break `/app/` service worker scope on first deploy

