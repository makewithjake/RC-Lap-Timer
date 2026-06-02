# RC Lap Timer

A lightweight, mobile-first Progressive Web App (PWA) that turns your phone's camera into an automated finish-line detector for RC car racing — no extra hardware required.

## How It Works

Point your phone at the finish line and draw a **Trigger Zone** across the track. The app watches only that narrow strip of pixels, detects motion when a car crosses, and instantly records the lap time with a text-to-speech announcement.

## Features

- **Camera-based detection** — uses your phone's rear camera as a virtual finish line sensor
- **Trigger Zone drawing** — tap to place a two-point line over the track; drag handles to reposition
- **Luminance frame differencing** — brightness-based motion detection that resists color-shifting sunlight
- **Calibration controls** — adjustable sensitivity, debounce delay (1–5 s), and zone width sliders
- **Virtual LED test mode** — hands-free calibration with a visual flash and audible beep before racing
- **10-second countdown** — delayed start for solo drivers to reach their controllers
- **Live race dashboard** — big lap timer, scrolling lap table with best-lap highlighting and gap column
- **Text-to-speech readouts** — each lap time announced aloud in real time
- **Session history** — lap time chart and full data table after each session
- **Wake Lock** — keeps the screen on during races
- **Fully offline** — service worker caches all assets; works in airplane mode
- **OLED-friendly dark mode** — pure black backgrounds for battery efficiency
- **No install required** — runs in the browser; add to home screen for a native app feel

## Stack

| Layer | Technology |
|---|---|
| Language | Vanilla JavaScript (ES6+) |
| Detection | HTML5 Canvas API (ROI pixel sampling) |
| Audio | Web Audio API + `speechSynthesis` |
| Persistence | `localStorage` |
| Offline | Service Worker (cache-first) |
| Styling | CSS3 with design tokens |

## Codebase Layout

- app/index.html is the lap timer application shell.
- app/js is the canonical runtime source for lap timer logic.
- index.html is the marketing/landing page shell.
- js is reserved for landing-page scripts (for example, landing interactions).

Rule:
- Do not add duplicate lap timer runtime modules under both app/js and js.
- Bugfixes and feature changes for race/session behavior must be implemented in app/js.

## Usage

1. Open the app and enter driver name, car name, and location.
2. On the **Viewfinder** screen, draw a line across the finish line.
3. Adjust sensitivity and debounce; verify detection live.
4. Toggle **Delayed Start** if racing solo, then tap **Confirm**.
6. Cross the line to start the master timer — every subsequent crossing records a lap.
7. Tap **Stop** when finished; review the session summary and lap chart.
