# Bugfix 09 — Session Sorting / Date Grouping

## Problem Statement

On the History screen, sessions from multiple days are not appearing in the correct date ranges. The date headers are created, but the sessions underneath them are grouped incorrectly or collapse into an invalid date bucket.

The screenshot suggests the list is rendering date headers, but the underlying session date values are not being interpreted consistently.

## Working Hypothesis

The bug is most likely caused by a mismatch between how session dates are stored and how the History screen parses them for grouping.

Current suspicion:
- Session records may be storing a locale-formatted date string instead of a stable ISO date string.
- The History screen then tries to parse that value into a `Date` for grouping.
- If parsing fails, grouping falls back to an invalid bucket or the sessions are sorted against the wrong date key.

A second-order risk is that sessions are sorted by the raw date string instead of a normalized date value, which can produce incorrect ordering across different days.

## Scope

Focus only on the session history pipeline:
- Session date creation at save time
- Session date parsing and grouping in the History view
- Sorting order before headers are rendered

## Proposed Fix Strategy

1. Verify the exact date format stored in each session record.
2. Normalize session date storage to a stable format that can be parsed reliably.
3. Update History grouping to use a local calendar-day key that does not shift across time zones.
4. Ensure sessions are sorted newest-first before grouping, and that grouping preserves that order inside each date bucket.

## Validation Plan

Use a small, repeatable test method so the fix can be confirmed without guessing.

### Manual data test

Create or reuse sessions from at least three different calendar days, with multiple sessions on one of the days.

Expected result after the fix:
- Each date header appears once per calendar day.
- Sessions from the same day are grouped under the same header.
- Date headers appear in newest-first order.
- Sessions inside each group also remain newest-first.

### Cheap discriminating check

Before changing code, inspect the raw session records in local storage and compare:
- the stored `date` string
- the result of parsing that date with `new Date(...)`
- the rendered header label in History

If the stored date cannot round-trip cleanly, that confirms the root cause without touching the UI logic.

### Regression check

After the fix, reload the app and confirm that:
- history grouping survives a hard refresh
- sessions still render correctly after deleting one entry
- search/filtering does not break the date headers

## Acceptance Criteria

- Sessions from different days are grouped under the correct calendar-day header.
- No sessions appear under an `Invalid Date` header.
- The History list order is stable after refresh.
- A repeatable test exists that proves the fix using sample data across multiple days.

## Verification Result

Confirmed resolved after a hard refresh on macOS Chrome with sample sessions spanning multiple days. The correct date headers render, and each session appears under the right calendar-day group.
