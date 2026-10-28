/**
 * SONIC // Main Application Controller
 * Handles user interactions, audio routing, settings persistence, and HUD auto-hide.
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('visualizerCanvas');
  const audioEngine = window.audioEngine;
  const visualizer = new Visualizer(canvas, audioEngine);
  visualizer.start();

  // DOM Elements - Navigation & Actions
  const hudHeader = document.getElementById('hudHeader');
  const playerHud = document.getElementById('playerHud');
  const statusBadge = document.getElementById('statusBadge');
  const statusLabel = document.getElementById('statusLabel');
  const emptyStateOverlay = document.getElementById('emptyStateOverlay');

  // Source Buttons
  const btnCaptureLoopback = document.getElementById('btnCaptureLoopback');
  const btnUploadFile = document.getElementById('btnUploadFile');
  const fileInput = document.getElementById('fileInput');
  const btnDemoTrack = document.getElementById('btnDemoTrack');

  // Empty State Buttons
  const btnEmptyLoopback = document.getElementById('btnEmptyLoopback');
  const btnEmptyDemo = document.getElementById('btnEmptyDemo');

  // Player Elements
  const audioElement = document.getElementById('audioElement');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const iconPlay = document.getElementById('iconPlay');
  const iconPause = document.getElementById('iconPause');
  const btnStop = document.getElementById('btnStop');
  const scrubberBar = document.getElementById('scrubberBar');
  const scrubberProgress = document.getElementById('scrubberProgress');
  const currentTimeLabel = document.getElementById('currentTime');
  const durationTimeLabel = document.getElementById('durationTime');
  const trackNameLabel = document.getElementById('trackName');
  const trackSubLabel = document.getElementById('trackSub');
  const trackSourcePill = document.getElementById('trackSourcePill');
  const volumeSlider = document.getElementById('volumeSlider');

  // Utility Buttons
  const btnHowTo = document.getElementById('btnHowTo');
  const btnSettingsToggle = document.getElementById('btnSettingsToggle');
  const btnSettingsClose = document.getElementById('btnSettingsClose');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const howToModal = document.getElementById('howToModal');
  const btnModalClose = document.getElementById('btnModalClose');
  const btnGuideGotIt = document.getElementById('btnGuideGotIt');
  const audioNoticeModal = document.getElementById('audioNoticeModal');
  const btnNoticeClose = document.getElementById('btnNoticeClose');
  const btnNoticeRetry = document.getElementById('btnNoticeRetry');

  // Settings Inputs
  const settingMode = document.getElementById('settingMode');
  const settingBarCount = document.getElementById('settingBarCount');
  const valBarCount = document.getElementById('valBarCount');
  const settingBarSpacing = document.getElementById('settingBarSpacing');
  const valBarSpacing = document.getElementById('valBarSpacing');
  const groupCapStyle = document.getElementById('groupCapStyle');
  const settingGain = document.getElementById('settingGain');
  const valGain = document.getElementById('valGain');
  const settingSmoothing = document.getElementById('settingSmoothing');
  const valSmoothing = document.getElementById('valSmoothing');
  const settingTransient = document.getElementById('settingTransient');
  const valTransient = document.getElementById('valTransient');
  const settingMinHeight = document.getElementById('settingMinHeight');
  const valMinHeight = document.getElementById('valMinHeight');
  const settingAutoHide = document.getElementById('settingAutoHide');
  const settingShowPeaks = document.getElementById('settingShowPeaks');
  const settingCenterBass = document.getElementById('settingCenterBass');
  const btnResetSettings = document.getElementById('btnResetSettings');
  const themeCards = document.querySelectorAll('.theme-card');

  // Auto-hide HUD timer
  let autoHideTimeout = null;
  let isAudioActive = false;

  // ------------------------------------------------------------------------
  // Audio Engine State Callbacks
  // ------------------------------------------------------------------------
  audioEngine.onStateChange = (type, label) => {
    isAudioActive = type !== 'idle';

    if (isAudioActive) {
      statusBadge.className = 'status-badge status-active';
      statusLabel.textContent = label.toUpperCase();
      emptyStateOverlay.classList.add('fade-out');
    } else {
      statusBadge.className = 'status-badge status-idle';
      statusLabel.textContent = 'STANDBY';
      emptyStateOverlay.classList.remove('fade-out');
      playerHud.classList.add('hud-hidden');
    }

    if (type === 'file' || type === 'synth') {
      playerHud.classList.remove('hud-hidden');
      trackSourcePill.textContent = type.toUpperCase();
      trackNameLabel.textContent = label;
      trackSubLabel.textContent = type === 'synth' ? 'Procedural Beat Engine' : 'Audio File';
      updatePlayPauseButton(true);
    } else {
      playerHud.classList.add('hud-hidden');
    }

    resetAutoHideTimer();
  };

  audioEngine.onError = (err, friendlyMessage) => {
    statusBadge.className = 'status-badge status-error';
    statusLabel.textContent = 'NEEDS AUDIO';

    if (err && err.code === 'CHECK_SHARE_AUDIO_BOX') {
      audioNoticeModal.classList.add('open');
    } else {
      alert(friendlyMessage);
    }
  };

  btnNoticeClose.addEventListener('click', () => {
    audioNoticeModal.classList.remove('open');
  });

  btnNoticeRetry.addEventListener('click', () => {
    audioNoticeModal.classList.remove('open');
    handleLoopbackAudio();
  });

  audioNoticeModal.addEventListener('click', (e) => {
    if (e.target === audioNoticeModal) {
      audioNoticeModal.classList.remove('open');
    }
  });

  // ------------------------------------------------------------------------
  // PC Audio Loopback (Earphones, Speakers, Headphones - Mic Excluded)
  // ------------------------------------------------------------------------
  const handleLoopbackAudio = async () => {
    await audioEngine.capturePCLoopback();
  };

  btnCaptureLoopback.addEventListener('click', handleLoopbackAudio);
  btnEmptyLoopback.addEventListener('click', handleLoopbackAudio);

  // Local File Upload
  btnUploadFile.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      audioEngine.loadLocalFile(file);
    }
  });

  // Drag and Drop Audio Files anywhere on the window
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/')) {
        audioEngine.loadLocalFile(file);
      }
    }
  });

  // Demo Synth Playback
  const handlePlayDemo = () => {
    audioEngine.playDemoSynth();
  };

  btnDemoTrack.addEventListener('click', handlePlayDemo);
  btnEmptyDemo.addEventListener('click', handlePlayDemo);

  // ------------------------------------------------------------------------
  // Media Player Controls
  // ------------------------------------------------------------------------
  function updatePlayPauseButton(isPlaying) {
    if (isPlaying) {
      iconPlay.style.display = 'none';
      iconPause.style.display = 'block';
    } else {
      iconPlay.style.display = 'block';
      iconPause.style.display = 'none';
    }
  }

  btnPlayPause.addEventListener('click', () => {
    if (audioEngine.sourceType === 'synth') {
      if (audioEngine.synthPlaying) {
        audioEngine.stopSynth();
        updatePlayPauseButton(false);
      } else {
        audioEngine.playDemoSynth();
        updatePlayPauseButton(true);
      }
    } else if (audioEngine.sourceType === 'file') {
      if (audioElement.paused) {
        audioElement.play();
        updatePlayPauseButton(true);
      } else {
        audioElement.pause();
        updatePlayPauseButton(false);
      }
    }
  });

  btnStop.addEventListener('click', () => {
    audioEngine.cleanupCurrentSource();
    if (audioEngine.onStateChange) {
      audioEngine.onStateChange('idle', 'Playback Stopped');
    }
  });

  audioElement.addEventListener('timeupdate', () => {
    if (audioElement.duration) {
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      scrubberProgress.style.width = `${pct}%`;
      currentTimeLabel.textContent = formatTime(audioElement.currentTime);
      durationTimeLabel.textContent = formatTime(audioElement.duration);
    }
  });

  audioElement.addEventListener('ended', () => {
    updatePlayPauseButton(false);
  });

  scrubberBar.addEventListener('click', (e) => {
    if (audioElement.duration) {
      const rect = scrubberBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      audioElement.currentTime = pct * audioElement.duration;
    }
  });

  volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    audioEngine.setVolume(val);
  });

  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------------------
  // Settings & Spectrogram Tuning
  // ------------------------------------------------------------------------
  btnSettingsToggle.addEventListener('click', () => {
    settingsDrawer.classList.toggle('open');
  });

  btnSettingsClose.addEventListener('click', () => {
    settingsDrawer.classList.remove('open');
  });

  // Mode Selection
  settingMode.addEventListener('change', (e) => {
    visualizer.mode = e.target.value;
  });

  // Bar Count
  settingBarCount.addEventListener('input', (e) => {
    const count = parseInt(e.target.value, 10);
    visualizer.setBarCount(count);
    valBarCount.textContent = count;
  });

  // Spacing Ratio
  settingBarSpacing.addEventListener('input', (e) => {
    const spacing = parseFloat(e.target.value);
    visualizer.spacingRatio = spacing;
    valBarSpacing.textContent = spacing.toFixed(2);
  });

  // Cap Style Pills
  groupCapStyle.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (btn) {
      groupCapStyle.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      visualizer.capStyle = btn.dataset.value;
    }
  });

  // Gain / Sensitivity
  settingGain.addEventListener('input', (e) => {
    const gain = parseFloat(e.target.value);
    visualizer.gain = gain;
    valGain.textContent = `${gain.toFixed(1)}x`;
  });

  // Smoothing
  settingSmoothing.addEventListener('input', (e) => {
    const smoothing = parseFloat(e.target.value);
    visualizer.smoothing = smoothing;
    if (audioEngine.analyser) {
      audioEngine.analyser.smoothingTimeConstant = smoothing;
    }
    valSmoothing.textContent = smoothing.toFixed(2);
  });

  // Transient Boost
  settingTransient.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    visualizer.transientBoost = val;
    valTransient.textContent = val === 1 ? 'Low' : val === 2 ? 'Medium' : 'Aggressive';
  });

  // Min Height Baseline
  settingMinHeight.addEventListener('input', (e) => {
    const minH = parseInt(e.target.value, 10);
    visualizer.minHeight = minH;
    valMinHeight.textContent = `${minH}px`;
  });

  // Toggles
  settingShowPeaks.addEventListener('change', (e) => {
    visualizer.showPeaks = e.target.checked;
  });

  settingCenterBass.addEventListener('change', (e) => {
    visualizer.centerBass = e.target.checked;
  });

  // Color Theme Switcher
  const themes = [
    'theme-reference',
    'theme-monochrome-dark',
    'theme-editorial-bone',
    'theme-obsidian',
    'theme-earth',
  ];

  function applyTheme(themeClass) {
    themes.forEach((t) => document.body.classList.remove(t));
    document.body.classList.add(themeClass);

    themeCards.forEach((c) => {
      c.classList.toggle('active', c.dataset.theme === themeClass);
    });

    visualizer.updateColorPalette();
  }

  themeCards.forEach((card) => {
    card.addEventListener('click', () => {
      applyTheme(card.dataset.theme);
    });
  });

  // Reset to Defaults
  btnResetSettings.addEventListener('click', () => {
    settingMode.value = 'symmetrical';
    visualizer.mode = 'symmetrical';

    settingBarCount.value = 72;
    valBarCount.textContent = '72';
    visualizer.setBarCount(72);

    settingBarSpacing.value = 0.45;
    valBarSpacing.textContent = '0.45';
    visualizer.spacingRatio = 0.45;

    settingGain.value = 1.4;
    valGain.textContent = '1.4x';
    visualizer.gain = 1.4;

    settingSmoothing.value = 0.82;
    valSmoothing.textContent = '0.82';
    visualizer.smoothing = 0.82;

    settingMinHeight.value = 6;
    valMinHeight.textContent = '6px';
    visualizer.minHeight = 6;

    settingShowPeaks.checked = true;
    visualizer.showPeaks = true;

    settingCenterBass.checked = false;
    visualizer.centerBass = false;

    applyTheme('theme-reference');
  });

  // ------------------------------------------------------------------------
  // How-To Modal
  // ------------------------------------------------------------------------
  btnHowTo.addEventListener('click', () => {
    howToModal.classList.add('open');
  });

  btnModalClose.addEventListener('click', () => {
    howToModal.classList.remove('open');
  });

  btnGuideGotIt.addEventListener('click', () => {
    howToModal.classList.remove('open');
    handleLoopbackAudio();
  });

  howToModal.addEventListener('click', (e) => {
    if (e.target === howToModal) {
      howToModal.classList.remove('open');
    }
  });

  // ------------------------------------------------------------------------
  // Fullscreen Toggle
  // ------------------------------------------------------------------------
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Exit fullscreen failed:', err);
      });
    }
  };

  btnFullscreen.addEventListener('click', toggleFullscreen);

  // ------------------------------------------------------------------------
  // Auto-Hide HUD for Pure Ambient Visuals
  // ------------------------------------------------------------------------
  function resetAutoHideTimer() {
    hudHeader.classList.remove('hud-hidden');
    if (isAudioActive && (audioEngine.sourceType === 'file' || audioEngine.sourceType === 'synth')) {
      playerHud.classList.remove('hud-hidden');
    }

    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
    }

    if (isAudioActive && settingAutoHide.checked && !settingsDrawer.classList.contains('open') && !howToModal.classList.contains('open')) {
      autoHideTimeout = setTimeout(() => {
        hudHeader.classList.add('hud-hidden');
        playerHud.classList.add('hud-hidden');
      }, 3200);
    }
  }

  window.addEventListener('mousemove', resetAutoHideTimer);
  window.addEventListener('touchstart', resetAutoHideTimer);

  // ------------------------------------------------------------------------
  // Global Keyboard Shortcuts
  // ------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    // Avoid triggering when focused inside inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      btnPlayPause.click();
    } else if (e.key === 'c' || e.key === 'C' || e.key === 'l' || e.key === 'L' || e.key === 'e' || e.key === 'E') {
      handleLoopbackAudio();
    } else if (e.key === 'Enter' && !isAudioActive) {
      handleLoopbackAudio();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === 't' || e.key === 'T') {
      // Cycle theme
      const currentThemeIndex = themes.findIndex((t) => document.body.classList.contains(t));
      const nextTheme = themes[(currentThemeIndex + 1) % themes.length];
      applyTheme(nextTheme);
    } else if (e.key === 's' || e.key === 'S') {
      settingsDrawer.classList.toggle('open');
    } else if (e.key === 'Escape') {
      settingsDrawer.classList.remove('open');
      howToModal.classList.remove('open');
    }

    resetAutoHideTimer();
  });
});
