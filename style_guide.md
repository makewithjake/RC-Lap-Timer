# RC Lap Timer – Style Guide

## 1. Brand Identity

**Product Name:** RC Timer / RCTimer.app  
**Voice & Tone:** Technical, precise, no-nonsense. Language is direct and action-oriented ("Draw your Trigger Zone", "Confirm & Go to Dashboard"). Every word earns its place — this UI is read at arm's-length by someone holding a car controller.  
**Design Philosophy:** OLED-first dark mode, maximum information density within glove-friendly touch targets, zero gratuitous decoration.

---

## 2. Color Palette

All colors are defined as CSS custom properties. The true-black (`#000000`) background is a hard requirement for OLED power saving — never substitute a near-black.

### Base

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#000000` | App & page root background (OLED true-black) |
| `--color-surface` | `#111111` | Cards, modals, setting panels |
| `--color-surface-raised` | `#1A1A1A` | Elevated cards, dropdowns, input fills |
| `--color-border` | `#2A2A2A` | Dividers, input outlines, card edges |
| `--color-border-subtle` | `#1E1E1E` | Inner separators within a card |

### Text

| Token | Hex | Usage |
|---|---|---|
| `--color-text-primary` | `#FFFFFF` | Headings, large display values, labels |
| `--color-text-secondary` | `#A0A0A0` | Supporting copy, column headers, metadata |
| `--color-text-muted` | `#555555` | Placeholder text, disabled states |

### Brand Accent (Electric Lime)

| Token | Hex | Usage |
|---|---|---|
| `--color-accent` | `#C6FF00` | Primary CTAs (website buttons, "Confirm" buttons), active slider fills, feature icons, brand logotype highlight |
| `--color-accent-dim` | `#8AAF00` | Accent hover/press state |
| `--color-accent-glow` | `rgba(198,255,0,0.15)` | Glow halo behind active Detection LED, focus rings |

### Functional / Status

| Token | Hex | Usage |
|---|---|---|
| `--color-start` | `#22C55E` | START button, motion-detected confirmation flash, "System Active" indicator |
| `--color-start-dim` | `#16A34A` | START hover/press state |
| `--color-stop` | `#EF4444` | STOP button |
| `--color-stop-dim` | `#B91C1C` | STOP hover/press state |
| `--color-reset` | `#F59E0B` | RESET button |
| `--color-reset-dim` | `#B45309` | RESET hover/press state |
| `--color-best-lap` | `#00FF41` | Best-lap row highlight (neon green), Detection LED active state |
| `--color-best-lap-bg` | `rgba(0,255,65,0.15)` | Best-lap row background tint |

### Website-Specific Decorative

| Token | Description |
|---|---|
| Circuit board overlay | SVG/CSS `background-image` pattern — fine dark-green lines (`#0D2B0D` on `#000000`), very low opacity (≈8%). Applied only to marketing page hero and section backgrounds, never inside the PWA. |

---

## 3. Typography

The stack prioritizes performance and rendering quality. System fonts load instantly with no network round-trips, which is critical for offline PWA sessions.

### Font Stacks

```css
/* Primary UI font — used for all body copy, labels, and controls */
--font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
           "Helvetica Neue", Arial, sans-serif;

/* Display / Hero font — used for large headings on the marketing page only */
/* Barlow Condensed is the closest match to the bold condensed style in the
   reference screens. Load via Google Fonts with system-ui as fallback. */
--font-display: "Barlow Condensed", "Arial Narrow", Arial, sans-serif;

/* Timer / numeric readouts — prevents layout jitter as digits change */
--font-mono: "Roboto Mono", "SF Mono", "Fira Code", ui-monospace,
             SFMono-Regular, Menlo, monospace;
```

### Scale

| Role | Size | Weight | Font | Line Height |
|---|---|---|---|---|
| Hero headline (web) | `clamp(2.5rem, 5vw, 4.5rem)` | 800 (ExtraBold) | `--font-display` | 1.05 |
| Section heading (web) | `2rem` | 700 | `--font-display` | 1.1 |
| App section label | `1.125rem` (18px) | 700 | `--font-ui` | 1.3 |
| Body / supporting copy | `1rem` (16px) | 400 | `--font-ui` | 1.5 |
| Small / metadata | `0.875rem` (14px) | 400 | `--font-ui` | 1.4 |
| Lap table data | `1rem` (16px) | 500 | `--font-ui` | 1 |
| Master Timer display | `clamp(3rem, 12vw, 5.5rem)` | 700 | `--font-mono` | 1 |
| Countdown digits | `clamp(6rem, 25vw, 12rem)` | 800 | `--font-mono` | 1 |

### Rules

- **Tabular figures are required** on all numeric readouts: `font-variant-numeric: tabular-nums;`
- **Letter-spacing:** Hero/display text at `-0.02em`; UI labels at `0`; all-caps labels at `0.08em`
- **Uppercase labels** (e.g., "MASTER TIMER", "LAP TABLE", "DETECTION LED") use `text-transform: uppercase` with the `0.08em` letter-spacing above
- Never use more than two weight levels within a single component

---

## 4. Spacing & Layout

### Base Unit

All spacing is derived from an **8px base unit**. Use multiples: `4px 8px 12px 16px 24px 32px 48px 64px`.

### App Layout

- **Full-bleed screens:** The app is always full-viewport-height (`100dvh`). No visible scrollbars on the main stage.
- **Safe areas:** Respect `env(safe-area-inset-*)` for all button rows and status bars.
- **Content padding:** `16px` horizontal padding on all inner panels and card interiors.
- **Bottom control cluster:** `24px` from the safe-area bottom edge; buttons never float above the fold on short screens.

### Marketing Page Layout

- **Max content width:** `1200px`, centered.
- **Section padding:** `80px` top/bottom on desktop, `48px` on mobile.
- **Hero:** Full-viewport-height (`100dvh`), content centered with `text-align: center`.
- **Feature grid:** 3-column on desktop (`repeat(3, 1fr)`), single column on mobile.

---

## 5. Borders & Elevation

Because the background is pure black, elevation is expressed with border color and subtle background lightening — never with drop shadows (invisible on OLED black).

| Level | Background | Border |
|---|---|---|
| Base (root) | `#000000` | — |
| Surface (card) | `#111111` | `1px solid #2A2A2A` |
| Raised (modal, dropdown) | `#1A1A1A` | `1px solid #333333` |
| Input fill | `#1A1A1A` | `1px solid #2A2A2A` |
| Input focus | `#1A1A1A` | `1px solid var(--color-accent)` + `box-shadow: 0 0 0 3px var(--color-accent-glow)` |

---

## 6. Border Radius

| Component | Radius |
|---|---|
| Large CTAs / Action buttons | `12px` |
| Small inline buttons | `8px` |
| Cards / panels | `12px` |
| Input fields, sliders track | `6px` |
| Detection LED (circular) | `50%` |
| Pill badges ("BEST", "System Active") | `999px` |

---

## 7. Components

### 7.1 Buttons

Three tiers of visual weight. All buttons use `font-family: --font-ui`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.06em`.

**Primary CTA** (e.g., "Confirm & Go to Dashboard", "Get the PWA App")
```
background: var(--color-accent)
color: #000000
border-radius: 12px
padding: 14px 28px
font-size: 1rem
min-height: 48px
min-width: 48px
```

**Functional Action** (large glove-friendly controls)
```
START:  background: var(--color-start),  color: #000000
STOP:   background: var(--color-stop),   color: #FFFFFF
RESET:  background: var(--color-reset),  color: #000000
border-radius: 12px
padding: 18px 32px
font-size: 1.125rem
min-height: 64px
min-width: 80px
```

**Secondary / Ghost** (e.g., "Lock Focus", "Cancel")
```
background: transparent
color: var(--color-text-primary)
border: 1px solid var(--color-border)
border-radius: 8px
padding: 10px 20px
min-height: 48px
```

All buttons:
- `:active` state: `opacity: 0.85; transform: scale(0.97)`
- `cursor: pointer`; `user-select: none`
- No `:hover` color changes — use `opacity` only, since mobile has no hover intent

### 7.2 Sliders

```
track background (unfilled): var(--color-border)
track fill (filled side):    var(--color-accent)
thumb:                       var(--color-accent), 22px × 22px circle, no shadow
track height:                4px
border-radius (track):       6px
```

- Value readout displayed inline to the right of the label (e.g., "Sensitivity (Threshold): **75%**")
- Range labels ("1.0s" / "5.0s") shown below the ends of the debounce slider

### 7.3 Cards / Panels

```
background: var(--color-surface)
border: 1px solid var(--color-border)
border-radius: 12px
padding: 16px
```

- No box-shadow
- Section headers within a card: `--color-text-secondary`, `12px uppercase`, `letter-spacing: 0.08em`, with a `1px solid var(--color-border-subtle)` bottom divider

### 7.4 Lap Table

| State | Background | Text | Notes |
|---|---|---|---|
| Default row | transparent | `--color-text-primary` | Alternating rows may use `--color-surface` |
| Best lap row | `var(--color-best-lap-bg)` | `--color-best-lap` | "BEST" pill badge in `--color-best-lap` |
| Column header | transparent | `--color-text-secondary` | Uppercase, 12px |

- Three columns: "LAP #" / "LAP TIME" / "GAP" — equal thirds
- Font: `--font-ui`, `font-variant-numeric: tabular-nums`
- Row height: `44px` minimum

### 7.5 Detection LED

A full-circle indicator in the lower-right corner of the Viewfinder and Configuration screens.

```
Inactive:  background: #1A1A1A;  border: 2px solid #333333
Active:    background: var(--color-best-lap);
           box-shadow: 0 0 12px 4px var(--color-accent-glow)
Size: 48px × 48px
border-radius: 50%
```

Transition: `background 80ms ease, box-shadow 80ms ease` — snappy enough to register at car-crossing speed.

### 7.6 Input Fields

```
background: var(--color-surface-raised)
border: 1px solid var(--color-border)
border-radius: 6px
color: var(--color-text-primary)
font-size: 1rem
padding: 10px 12px
min-height: 48px
```

Placeholder: `color: var(--color-text-muted)`

### 7.7 Status Indicator Pills

For inline labels like "Screen Lock is Active" or "System Active":

```
background: rgba(34,197,94,0.15)
color: var(--color-start)
border: 1px solid rgba(34,197,94,0.25)
border-radius: 999px
font-size: 0.75rem
font-weight: 600
text-transform: uppercase
letter-spacing: 0.06em
padding: 4px 10px
```

---

## 8. Iconography

- **Style:** Outlined, 2px stroke weight, rounded line caps. Filled variants reserved for active/enabled toggle states.
- **Size grid:** 16 / 20 / 24px. Navigation and inline icons at 20px; status icons at 16px; large feature icons (marketing page) at 48px.
- **Color:** Inherit from context — primary icons use `--color-text-primary`; accent icons (active states, feature icons on marketing page) use `--color-accent`.
- **Source:** Prefer system or standard icon libraries (e.g., Heroicons, Phosphor) to avoid custom assets that break offline caching.

---

## 9. Motion & Animation

All motion serves function — no decorative animation.

| Trigger | Property | Duration | Easing |
|---|---|---|---|
| Lap trigger visual flash | `background-color` on viewport | `120ms` | `ease-out` |
| Detection LED toggle | `background`, `box-shadow` | `80ms` | `ease` |
| Countdown digit change | `opacity` 1→0→1 + `scale` | `200ms` | `ease-in-out` |
| Button press | `transform: scale(0.97)`, `opacity: 0.85` | `80ms` | `ease` |
| Screen transition (phase change) | `opacity` 0→1 | `200ms` | `ease` |
| Slider fill update | `background` (CSS gradient) | immediate | — |

- Respect `prefers-reduced-motion`: replace all transforms and opacity transitions with instant toggles when active.
- The Master Timer digits update at frame rate — no transition applied to prevent perceived lag.

---

## 10. Accessibility

- **Color alone is never the only signal** — every status change pairs a color change with a label or icon change.
- **Minimum touch target:** 48×48px for all interactive elements (as defined in `screens.md`).
- **Contrast ratios:**
  - Normal text on `#000000`: minimum 4.5:1 (WCAG AA). White (`#FFFFFF`) achieves 21:1. ✓
  - Electric lime (`#C6FF00`) on `#000000`: ~13:1. ✓ (also passes for large text)
  - `--color-start` green (`#22C55E`) on `#000000`: ~4.6:1. ✓ (AA for large text; acceptable for button labels at 700 weight)
- **Focus rings:** All keyboard-focusable elements show `outline: 2px solid var(--color-accent); outline-offset: 2px`.
- **ARIA:** Lap table uses `role="table"` markup. Live lap readout uses `aria-live="polite"`. Timer region: `aria-live="off"` (screen readers should not interrupt at every frame update; TTS announcements via Web Audio API serve this role).
- **TTS:** Web Audio API announcements cover lap completions for drivers at a distance from the device.

---

## 11. App vs. Marketing Page

| Attribute | PWA App | Marketing Website |
|---|---|---|
| Background | `#000000` (OLED true-black) | `#000000` + circuit board overlay |
| Body font | `--font-ui` (system stack) | `--font-ui` for body |
| Hero/heading font | N/A | `--font-display` (Barlow Condensed) |
| Primary CTA color | `--color-accent` (#C6FF00) | `--color-accent` (#C6FF00) |
| Decorative elements | None | Circuit board SVG pattern, radial glow behind hero image |
| Navigation | Hamburger / bottom tabs | Top horizontal nav: Features | How It Works | Community | Download |
| Max-width constraint | Full-bleed, no max-width | `1200px` centered |
| Typography emphasis | Bold weight, functional | Bold condensed, marketing punch |

---

## 12. CSS Custom Properties — Full Reference

```css
:root {
  /* Backgrounds */
  --color-bg:              #000000;
  --color-surface:         #111111;
  --color-surface-raised:  #1A1A1A;
  --color-border:          #2A2A2A;
  --color-border-subtle:   #1E1E1E;

  /* Text */
  --color-text-primary:    #FFFFFF;
  --color-text-secondary:  #A0A0A0;
  --color-text-muted:      #555555;

  /* Brand Accent */
  --color-accent:          #C6FF00;
  --color-accent-dim:      #8AAF00;
  --color-accent-glow:     rgba(198, 255, 0, 0.15);

  /* Functional */
  --color-start:           #22C55E;
  --color-start-dim:       #16A34A;
  --color-stop:            #EF4444;
  --color-stop-dim:        #B91C1C;
  --color-reset:           #F59E0B;
  --color-reset-dim:       #B45309;
  --color-best-lap:        #00FF41;
  --color-best-lap-bg:     rgba(0, 255, 65, 0.15);

  /* Typography */
  --font-ui:      system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
                  Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-display: "Barlow Condensed", "Arial Narrow", Arial, sans-serif;
  --font-mono:    "Roboto Mono", "SF Mono", ui-monospace, SFMono-Regular,
                  Menlo, monospace;

  /* Spacing */
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-6:  24px;
  --space-8:  32px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radii */
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-full: 999px;

  /* Transitions */
  --transition-snap: 80ms ease;
  --transition-fast: 120ms ease;
  --transition-base: 200ms ease;
}
```
