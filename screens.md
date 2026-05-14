# RC Lap Timer – Screens & Wireframe Definitions

## Screens

### 1. Home / Launch Screen
The entry point of the app where the user defines the context of the race.

- **Profile Selectors:** Text fields for "Driver Name" and "Car Name"
- **Location Picker:** Text field to type in location
- **Navigation Hub:** Large, high-contrast buttons for "Start New Session" and "View History"
- **Settings:** Gear icon which opens a settings screen

### 2. The Viewfinder (Setup Screen)
The "Calibration" phase where the hardware is locked and the detection zone is defined.

- **Full-Screen Video Feed:** High-frame-rate raw camera stream
- **Drawing Overlay:** Transparent canvas layer for "finger-painting" the Trigger Zone
- **Hardware Lock Bar:**
  - Wake Lock Toggle: Icon indicating screen-stay-awake status
  - Focus/Exposure Lock: Button to freeze camera settings once the track is in view
- **Calibration Tools:**
  - Sensitivity Slider: Real-time adjustment of detection threshold
  - Debounce Slider: 1.0s–5.0s range to prevent double-triggers
  - Zone Width Slider: Changes width of detection zone around the drawn line
  - Virtual LED: Corner UI element that flashes green when motion is detected in the zone (for testing)
- **Action Button:** Large "Confirm" button to move to the Dashboard

### 3. Countdown Overlay
A high-visibility transitional state for solo drivers.

- **Large Digits:** Full-screen animated countdown (10… 9… 8…)
- **Audio Prompt:** Beep tones synchronised with the numbers
- **Abort Button:** Large "Cancel" button in case the car isn't positioned correctly

### 4. Race Dashboard (Active Session)
The high-performance screen used while the car is on the track.

- **Minimized Feed:** Feed is hidden by default; a button allows re-opening to verify camera position if necessary
- **The "Big Clock":** Current lap timer in large, bold font
- **Live Lap Table:**
  - Three columns: Lap #, Lap Time, and Gap (difference from best lap)
  - Best Lap Highlight: Row turns gold or neon green for the fastest time
- **Status Bar:** Displays "Lap X of Y" and "System Active" (confirming Wake Lock)
- **Glove-Friendly Controls:** Extra-large "STOP" and "RESET" buttons at the bottom

### 5. Post-Session Summary (Results)
Data visualization screen shown automatically after the goal is met or "Stop" is pressed.

- **Performance Chart:** Line graph showing Lap Time (Y-axis) vs. Lap Number (X-axis) for consistency tracking
- **Stat Cards:**
  - Fastest Lap: The "Purple" sector time
  - Average Lap: Total session time divided by lap count
  - Consistency Score: Standard deviation of lap times
- **Action Row:** Buttons for "Save to History," "Discard," or "Restart Session"

### 6. History & Data Logs
The archive for tracking progress over time.

- **Session List:** Scrolling list of past races, grouped by date or location
- **Search/Filter:** Filter by "Car Name" or "Driver"
- **Summary Preview:** Each list item shows date, car, and "Best Lap" at a glance
- **Deletion/Management:** Long-press to delete individual sessions and clear localStorage

### 7. Global Settings
Technical configuration that persists across all sessions.

- **Countdown Timer:** Default 10 seconds; defines countdown after feed setup before displaying the Dashboard
- **TTS Voice Settings:** Select voice gender, pitch, and volume for lap announcements
- **Unit Selection:** Toggle between Metric and Imperial (if distance tracking is added later)
- **Clear All Data:** "Nuclear Option" to wipe the app's localStorage
- **About/PWA Info:** Version number and "Offline Ready" status indicator

## UI Design Guidelines

- **Interactive Targets:** Every button must have a minimum hit area of 48×48px
- **Typography:** Use system-ui fonts for speed; prioritize weight (Bold) over stylistic flourishes
- **Visual Feedback:** Every "Trigger" must produce an immediate visual change (haptic feedback, color flash, or beep) to confirm detection for the driver at a distance