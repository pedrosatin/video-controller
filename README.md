# Video Controller

A Chrome extension that lets you take control of **any `<video>` element** on any page, including players that deliberately hide speed controls or prevent seeking.

## Features

| Feature | Details |
|---|---|
| **Seek** | −10 s, −5 s, +5 s, +10 s buttons; drag the progress bar to any position |
| **Speed control** | Fine-tune ±0.1 or ±0.25; one-click presets (0.25× → 4×); range 0.1×–16× |
| **Volume** | Slider + mute toggle |
| **Fullscreen** | Uses the video's player container when possible |
| **Picture-in-Picture** | Float the video above everything |
| **Loop** | Toggle looping on/off |
| **Multiple videos** | Dropdown auto-appears when multiple `<video>` elements are detected |
| **Bypass restrictions** | Accesses native `HTMLMediaElement.prototype` setters to override per-instance locks set by player libraries |
| **Keyboard shortcuts** | Space/K play·pause · ← → seek · Shift+← → seek large · ↑↓ volume · M mute · F fullscreen · P PiP · L loop · Esc close |

## Installation (Chrome / Edge)

1. Clone or download this repository.
2. Open **chrome://extensions** (or `edge://extensions`).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `video-controller` folder.
5. The 🎬 extension icon appears in the toolbar.

## How to use

### Option A – Hover over the video
1. Navigate to a page with a video.
2. Hover over the `<video>` element – a small **🎬** button appears in the top-left corner of the video.
3. Click the 🎬 button to open the floating **Video Controller** panel.

### Option B – Extension popup
1. Click the **🎬 Video Controller** icon in the Chrome toolbar.
2. The popup lists all videos detected on the current page.
3. Click **Control** next to any video to open the panel for it.

### Controller panel
- **Drag** the header to move the panel anywhere on screen.
- Click **📌** to pin the panel in place so accidental drags don't move it.
- Click **✕** or press **Esc** to close the panel.

## File structure

```
video-controller/
├── manifest.json       # Chrome Extension Manifest V3
├── content.js          # Main logic – video detection, controller panel
├── content.css         # Panel and indicator styles
├── popup.html          # Extension toolbar popup
├── popup.js            # Popup logic (lists page videos)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Why it works on restricted players

Many streaming or LMS platforms override `video.playbackRate` at the **instance level** (via `Object.defineProperty`) to prevent users from changing speed. This extension reads the original setter straight from `HTMLMediaElement.prototype` and calls it with `.call(video, rate)`, bypassing any instance-level override.
