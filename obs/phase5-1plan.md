# Phase 5-1 Plan — Startup & Navigation Bug Fixes

## Problem Summary

When the app opens, the user sees "10", "Get ready!", and a Cancel button instead of the Home screen. The Cancel button does nothing, and navigation to other screens is broken. This document identifies the root causes and defines a fix plan.

---

## Bug Inventory

### Bug 1 (Root Cause) — CSS `display` overrides the HTML `hidden` attribute

**Affected files:** `countdown.css`, `dashboard.css`, `home.css`

The browser's built-in user-agent stylesheet sets `[hidden] { display: none }`, but author-level CSS has a higher cascade priority and overrides it. Any CSS rule that sets a `display` value on a screen's ID selector — even when that section has `hidden` in the HTML — will make that section render.

The specific offenders:

| File | Rule | Effect |
|---|---|---|
| `countdown.css` | `#screen-countdown { display: flex; position: fixed; inset: 0; z-index: 20; }` | Countdown screen is **always visible**, covering the entire viewport at the highest z-index |
| `dashboard.css` | `#screen-dashboard { display: flex; position: fixed; inset: 0; z-index: 10; }` | Dashboard screen is **always visible** below the countdown overlay |
| `home.css` | `#screen-home { display: flex; }` | Home screen is also always rendered, but it sits in normal document flow below the fixed overlays, making it invisible |

The user sees "10", "Get ready!", and Cancel because `#screen-countdown` always renders with `position: fixed; inset: 0; z-index: 20; display: flex` — it paints on top of everything regardless of the `hidden` attribute.

**This single bug is responsible for all three visible symptoms.**

---

### Bug 2 — Cancel button has no event listener at startup

**Affected file:** `js/app.js` (`_runCountdown` function)

The Cancel button click listener is registered inside `_runCountdown()`, which is only called after a user taps Confirm with "Delayed Start" enabled. At app startup, no listener is ever attached to `#btn-cancel-countdown`.

Even after fixing Bug 1, this remains a latent issue: if a user somehow triggers the countdown and then navigates back, the `{ once: true }` listener pattern could mismatch, causing the Cancel button to do nothing.

Additionally, when no countdown is running, `cancelCountdown()` itself is a no-op (it checks `_intervalId === null` and returns early), so even if the button fired, nothing would happen.

---

### Bug 3 — History and Settings screens do not exist in the HTML

**Affected files:** `index.html`, `js/home.js`

`home.js` calls `showScreen('history')` and `showScreen('settings')` when those buttons are tapped. The router looks for `#screen-history` and `#screen-settings` in the DOM. Neither element exists in `index.html`.

The router logs a warning and does nothing:
```
[Router] No section found with id "screen-history".
[Router] No section found with id "screen-settings".
```

The user taps the button and nothing happens — no visual feedback, no error shown.

---

### Bug 4 — Countdown digit is hardcoded "10" in HTML

**Affected file:** `index.html`

The `#countdown-digit` element contains hardcoded text `10` and the `.countdown-label` contains "Get ready!". These are the exact strings the user sees due to Bug 1. Once Bug 1 is fixed this is cosmetically harmless, but the hardcoded values are only valid if the countdown duration is always 10. If the duration ever changes, the initial flash before the first `onTick` call could show a stale number.

---

## Fix Plan

### Fix 1 — Protect `[hidden]` in `global.css` (resolves Bug 1)

Add a `[hidden]` rule to `global.css` that enforces `display: none !important`. This is a widely accepted best practice (used by Bootstrap, Tailwind, and modern CSS resets) that makes the semantic `hidden` attribute immune to override by component-level `display` rules.

```css
/* Enforce the HTML hidden attribute — prevents display overrides from component CSS */
[hidden] {
  display: none !important;
}
```

**Where:** Place this rule in `global.css` after the existing utility section (near the `.visually-hidden` rule).

**Why `!important`:** The `!important` flag is appropriate here because `[hidden]` is a semantic, author-controlled visibility mechanism. Overriding it accidentally is always a bug. This is not a style concern but a behavioral guarantee.

---

### Fix 2 — Attach Cancel button listener at init, not inside `_runCountdown` (resolves Bug 2)

Move the Cancel button click handler out of `_runCountdown()` and wire it up once during `DOMContentLoaded`, alongside the other button listeners. The handler should call `cancelCountdown()`, which is already safe to call when no countdown is running (it returns early).

This ensures:
- The button always has a listener
- No risk of the `{ once: true }` pattern detaching the listener prematurely
- The `onCancel` callback in `startCountdown()` still owns the navigation-back logic

---

### Fix 3 — Add placeholder screens for History and Settings (resolves Bug 3)

Add `<section id="screen-history" hidden>` and `<section id="screen-settings" hidden>` to `index.html`. These can be minimal stubs (a heading and a back button) so the router can show them and the user gets visual feedback instead of a silent no-op.

This also establishes the correct shell so future screen content can be filled in during dedicated phases.

---

### Fix 4 — Clear hardcoded countdown digit (resolves Bug 4)

Change the initial text content of `#countdown-digit` in `index.html` from `10` to an empty string or `—`. The first `onTick` call will populate it immediately when a countdown actually starts.

---

## Fix Priority and Order

| Priority | Fix | Effort |
|---|---|---|
| 1 (Critical) | Fix 1 — `[hidden]` rule in `global.css` | 1 line |
| 2 (High) | Fix 2 — Cancel button listener at init | ~5 lines moved |
| 3 (High) | Fix 3 — Add stub History and Settings screens | ~10 lines HTML per screen |
| 4 (Low) | Fix 4 — Clear hardcoded countdown digit | 1 character |

Fix 1 must be applied first as it unblocks visual verification of all other fixes. Fixes 2–4 can be applied in the same pass.

---

## Files to Change

| File | Change |
|---|---|
| `styles/global.css` | Add `[hidden] { display: none !important; }` |
| `js/app.js` | Move Cancel button listener to `DOMContentLoaded` scope |
| `index.html` | Add `#screen-history` and `#screen-settings` stub sections |
| `index.html` | Clear hardcoded `10` from `#countdown-digit` |
