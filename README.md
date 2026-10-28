# SONIC // Minimalist Audio Spectrogram & Visualizer

A real-time music visualizer web application designed with the **Utilitarian Minimalism** aesthetic. It captures whatever music or audio is playing on your PC (Spotify, YouTube, Apple Music, video games, media players) and translates it into a symmetrical vertical spectrogram matching your reference design.

---

## Visual Design Reference

- **Symmetrical Vertical Bars:** Rounded vertical bars mirrored across the central horizontal axis, matching the reference image.
- **Dynamic Spectral Distribution:** Perceptual logarithmic sub-bands ensure deep bass, melodic midrange, and sharp percussion/transient spikes (like snares and cymbals) dance with balanced energy.
- **Reference Color Palette:** Forest Green gradient background (`#296846`) with pure white (`#FFFFFF`) rounded bars, alongside four curated minimalist themes (Warm Charcoal, Editorial Bone, Obsidian Blue, and Smoked Clay).
- **Auto-Hiding Minimalist HUD:** All navigation and controls gently fade out after 3 seconds of listening, leaving a clean ambient display. Move your mouse or tap any key to bring them back.

---

## Direct Hardware WASAPI Loopback (Zero Browser Popups)

The visualizer connects directly to your PC's audio output (detected as your **Speakers (FIIO JD1)** or default Windows playback device) using a local Python WASAPI audio bridge.

- **Zero Browser Popups**: Bypasses screen-sharing dialogs, checkboxes, and permissions completely.
- **Microphone 100% Excluded**: Captures only playback audio directly from the Windows audio kernel.
- **Universal Browser Compatibility**: Works in any browser (Chrome, Edge, Brave, Firefox, Opera, etc.).

### Quick Start:
1. Double-click `run.bat` or run:
   ```bash
   python server.py
   ```
2. The browser opens automatically and immediately starts visualizing whatever music you play on Spotify, YouTube, games, or media players in real time!

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause (File or Demo) |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>T</kbd> | Cycle Color Themes |
| <kbd>S</kbd> | Open / Close Tuning Panel |
| <kbd>Esc</kbd> | Close Panels / Modal |

---

## Visual Tuning & Customization

Click the **Tuning** icon (<kbd>S</kbd>) in the header to adjust:
- **Visualizer Mode:** Symmetrical Mirror (Reference Image), Organic Waveform Mirror, Unilateral Upward, or Split Stereo.
- **Bar Count & Spacing:** Adjust the number of bars (from 24 to 140) and gap ratio.
- **Cap Style:** Round pills (Reference) or Crisp Flat rectangles.
- **Sensitivity & Gain:** 0.4x to 3.0x multiplier.
- **Fluidity / Smoothing:** Snappy vs smooth liquid decay.
- **Color Themes:** Reference Green, Warm Charcoal, Editorial Bone, Obsidian Navy, and Smoked Clay.
- **Color Palettes:** Instant switching between Reference Green, Warm Charcoal, Editorial Bone, Obsidian, and Smoked Clay.
