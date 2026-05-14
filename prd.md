# Product Requirements Document – RC Web Lap Timer (PWA)

## Project Overview

- **Goal:** A lightweight, mobile-first, offline-ready Progressive Web App (PWA) that uses a phone's camera as an automated motion-sensing finish line for RC cars.
- **Key Philosophy:** Efficiency First — minimize CPU/GPU cycles by scanning only a user-defined "Trigger Zone" to maximize battery life during long track sessions.

## Core Stack

- Vanilla JavaScript (ES6+) – no frameworks
- HTML5 Canvas API – trigger zone drawing + motion detection
- CSS3 – OLED-friendly dark mode (pure black backgrounds)
- Web Audio API – low-latency beeps and TTS announcements
- Service Workers – full offline / airplane-mode capability
- localStorage – session data and settings persistence
- `navigator.wakeLock` + camera constraints – hardware access

## UI & Interaction Flow

### Phase 1 – Setup (Viewfinder)

- **Full-screen Live Feed:** High-frame-rate camera preview
- **Trigger Zone Drawing:** Transparent canvas overlay for drawing a single thick line
  - User clicks to set point 1, drags to set point 2, releases to confirm
  - Each point can be repositioned after placement by clicking and dragging
- **Hardware Calibration:**
  - Wake Lock API button – keeps screen active during sessions
  - Exposure/Focus Lock button – stabilizes camera
  - Status indicators confirm "Screen Lock is Active" and "Camera Stabilized"
- **Delayed Start:** 10-second countdown toggle to allow solo drivers to reach their controllers

### Phase 2 – Racing (Dashboard)

- **Minimized Feed:** Video stream hidden to conserve power
- **Control Cluster:** Large, high-contrast, glove-friendly buttons
  - Start/Stop toggle – green START → red STOP → reverts on click; single button
  - Reset button
- **Live Feedback:**
  - TTS audio readouts announce each lap time in real time
  - Scrolling table showing Lap Number, Split Time, and Best Lap (highlighted)
- **Theme:** OLED-friendly dark mode (pure black backgrounds)

### Phase 3 – Post-Session & Visualization

- **Session Summary:** Line chart of Lap Time vs. Lap Number for consistency and trend analysis
- **Data Table:** Full breakdown of the completed session

## Functional Logic

### Motion Detection & Calibration

- **ROI Scanning:** Only pixels within the user-drawn Trigger Zone are processed
- **Luminance Frame Differencing:** Brightness-based detection to resist color-shifting sunlight
- **Stability Delay:** ~2-second "frames to skip" window after camera init for auto-exposure/focus to settle
- **Sensitivity:** Adjustable % threshold slider
- **Debounce:** 1.0 s – 5.0 s slider to prevent double-triggers from spoilers or shadows
- **Test Mode:** "Virtual LED" visual flash + audible beep (Web Audio API) for hands-free calibration

### Timing Sequence

1. User presses **Start** (optional countdown begins)
2. **Trigger 1** – car crosses line; Master Timer starts
3. **Trigger 2+** – current time recorded, lap timer resets, TTS announces time, split added to table
4. **Stop / Goal Met** – timer freezes, camera stream cut, session saved to history

## Data & Session Management

- **Profiles:** Driver Name and Car Name fields to categorize sessions
- **Persistence:** All session data and settings (Sensitivity, Debounce) saved via localStorage

## Roadmap

- [ ] **V2.0** – Multi-car identification using HSV Color Blob tracking
- [ ] **V2.1** – Export lap history as CSV or JSON
- [ ] **V2.2** – WebRTC Remote Display: one device acts as sensor, another as remote dashboard

## Notes / Rules

- Stack is locked to Vanilla JS, HTML5 Canvas, and CSS3 – no frameworks
- Offline-first: Service Workers must cover all app functionality
- Camera access requires `{ video: true }` constraint and Wake Lock API (`navigator.wakeLock`)
- Trigger Zone scanning must remain the only active pixel-processing region – never process the full frame
- Debounce and Sensitivity values must persist across sessions via localStorage
- OLED dark mode required – use `#000000` backgrounds throughout, not near-black grays
