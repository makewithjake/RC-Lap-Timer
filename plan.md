# RC Lap Timer – Implementation Plan

## Current Focus


## Completed


## Phase 1: Foundation & PWA Scaffold
_Goal: Establish the shell and offline capabilities before adding complex logic._

- [ ] **1.1 Project Structure & PWA Manifest** – Create the basic HTML/CSS/JS file structure. Set up `manifest.json` with icons and theme colors.
- [ ] **1.2 Service Worker Registration** – Implement a basic Service Worker to cache the shell (`index.html`, styles, and main script) for offline use.
- [ ] **1.3 Home Screen (Screen 1)** – Build the app entry point: text fields for Driver Name, Car Name, and Location; large high-contrast "Start New Session" and "View History" navigation buttons; gear icon that links to Global Settings (Screen 7).

> **Milestone:** The app is installable via Chrome/Safari and opens to the Home screen without an internet connection.

## Phase 2: Hardware Interfacing (Camera & Audio)
_Goal: Gain stable access to the device's sensors._

- [ ] **2.1 Camera Stream & Viewfinder** – Use `getUserMedia` to stream video into a `<video>` element. Ensure it requests the `"environment"` (back) camera.
- [ ] **2.2 Lock APIs** – Implement the Wake Lock API to keep the screen on and the ImageCapture API (where supported) to lock focus/exposure. Show status indicators confirming "Screen Lock is Active" and "Camera Stabilized."
- [ ] **2.3 Stability Delay** – Skip the first ~2 seconds of frames after camera init to allow auto-exposure/focus to settle before detection begins.
- [ ] **2.4 Audio & Speech Engine** – Initialize the Web Audio API for beeps and `window.speechSynthesis` for TTS lap announcements.

> **Milestone:** User can see the camera feed, toggle a "Screen Stay Awake" button, and trigger a test TTS voice notification.

## Phase 3: The Setup Layer / Viewfinder (Screen 2)
_Goal: Allow the user to define where the car will be detected and calibrate detection settings._

- [ ] **3.1 Transparent Canvas Overlay** – Place a `<canvas>` directly over the video feed.
- [ ] **3.2 Drawing Logic** – Implement touch/click-drag events to allow the user to draw a "Thick Line" (Trigger Zone). Points can be repositioned by clicking and dragging after placement.
- [ ] **3.3 Calibration Tools UI** – Build the three sliders directly on the Viewfinder screen:
  - **Sensitivity Slider** – adjustable % threshold for detection.
  - **Debounce Slider** – 1.0s–5.0s range to prevent double-triggers.
  - **Zone Width Slider** – changes the pixel-width of the detection zone around the drawn line.
- [ ] **3.4 Data Normalization** – Convert the drawn coordinates and Zone Width into a localized Region of Interest (ROI) array that the processing logic can consume.
- [ ] **3.5 Confirm Button** – Large "Confirm" action button that advances the user to the Countdown Overlay or Race Dashboard.

> **Milestone:** A user can draw a line over the track path, adjust all three calibration sliders, and the ROI coordinates plus settings are stored and ready for the detection engine.

## Phase 4: Motion Detection Engine (The Core)
_Goal: The most critical phase — turning pixels into data._

- [ ] **4.1 Frame Differencing Logic**
  - Create a hidden canvas to sample pixel data from the ROI only (never the full frame).
  - Implement Luminance Differencing: compare the brightness of current pixels in the ROI vs. the previous frame.
- [ ] **4.2 Detection Logic**
  - Apply the Sensitivity threshold from the calibration slider.
  - Apply Debounce logic (ignore all triggers for N seconds after a hit) using the Debounce slider value.
- [ ] **4.3 Virtual LED Test Mode** – Flash a corner Virtual LED element green and play an audible beep on each trigger without starting a real race, enabling hands-free calibration on the Viewfinder (Screen 2).

> **Milestone:** Move your hand across the drawn line; the app beeps and the Virtual LED flashes every time motion is detected within the zone.

## Phase 5: Countdown & Race Dashboard
_Goal: Connect detection to a stopwatch with a full racing UI._

- [ ] **5.1 Countdown Overlay (Screen 3)** – Full-screen animated countdown (10…1) with synchronized audio beeps. Include a large "Cancel" abort button. Activated by the Delayed Start toggle.
- [ ] **5.2 High-Precision Timer** – Use `performance.now()` for millisecond accuracy.
- [ ] **5.3 Session Management** – Implement logic to handle the first trigger (Master Timer starts) vs. subsequent triggers (record lap time, reset lap timer, fire TTS announcement).
- [ ] **5.4 Race Dashboard UI (Screen 4)** – Build the OLED-friendly dark mode racing screen:
  - **"Big Clock"** – current lap timer in large, bold font.
  - **Live Lap Table** – three columns: Lap #, Lap Time, and Gap (difference from best lap). Auto-scroll to latest lap; highlight the best lap row in gold/neon green.
  - **Status Bar** – displays "Lap X of Y" and "System Active" (confirming Wake Lock is on).
  - **Glove-Friendly Controls** – extra-large STOP and RESET buttons at the bottom (minimum 48×48px hit area). Camera feed is hidden by default with a button to temporarily re-open it.
- [ ] **5.5 Session Goals** – Logic to auto-stop once the defined lap count is reached, freeze the timer, cut the camera stream, and save the session.

> **Milestone:** A full race simulation: Confirm → Countdown → First Cross (Master Timer starts) → Subsequent Crosses (Lap recorded + TTS) → Goal Met (auto-stop and save).

## Phase 6: Persistence, History & Visualization
_Goal: Save data and enable review across all sessions._

- [ ] **6.1 LocalStorage Integration** – Save Profiles (Driver Name, Car Name, Location) and Session History as JSON strings in `localStorage`. All Sensitivity, Debounce, and Zone Width values must persist so the user does not recalibrate every session.
- [ ] **6.2 Post-Session Summary (Screen 5)** – Build the results screen shown automatically after Stop/Goal Met:
  - **Performance Chart** – SVG/Canvas line graph of Lap Time (Y-axis) vs. Lap Number (X-axis).
  - **Stat Cards** – Fastest Lap, Average Lap (total time ÷ lap count), Consistency Score (standard deviation of lap times).
  - **Action Row** – "Save to History," "Discard," and "Restart Session" buttons.
- [ ] **6.3 History & Data Logs (Screen 6)** – Build the session archive:
  - Scrolling list of past sessions grouped by date or location.
  - Search/filter by Car Name or Driver.
  - Each list item shows date, car, and Best Lap at a glance.
  - Long-press to delete individual sessions from `localStorage`.
- [ ] **6.4 Global Settings Screen (Screen 7)** – Build the persistent settings panel (accessed via gear icon on Home):
  - Default Countdown duration (default 10 seconds).
  - TTS voice settings (gender, pitch, volume).
  - Unit selection toggle (Metric / Imperial, for future distance tracking).
  - "Clear All Data" nuclear option to wipe `localStorage`.
  - About/PWA info panel: version number and "Offline Ready" status.

> **Milestone:** Close the app, reopen it, view a graph of a previous 10-lap session in History, and confirm all calibration sliders load with their last-used values.

## Notes / Rules
- **`requestAnimationFrame`** – All pixel processing must happen inside a `requestAnimationFrame` loop, not a `setInterval`.
- **ROI Only** – Never process the full frame; scanning must be restricted to the user-defined Trigger Zone at all times.
- **Offscreen Processing** – Move pixel math to a Web Worker if the UI feels sluggish during detection.
- **Memory Management** – Use `URL.revokeObjectURL` or equivalent cleanup if any images are captured; stop the camera stream when the session ends to preserve battery.
- **OLED Dark Mode** – Use `#000000` backgrounds throughout — never near-black grays.