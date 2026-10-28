/**
 * SONIC // Minimalist Spectrogram & Waveform Canvas Renderer
 * Faithfully matches the symmetrical vertical bar spectrogram from the reference image.
 */

class Visualizer {
  constructor(canvas, audioEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audioEngine = audioEngine;

    // Visual Settings
    this.mode = 'symmetrical'; // 'symmetrical' | 'waveform' | 'single-up' | 'dual-band'
    this.barCount = 72;
    this.spacingRatio = 0.45; // Gap ratio relative to bar pitch
    this.capStyle = 'round'; // 'round' | 'flat'
    this.gain = 0.6;
    this.smoothing = 0.82;
    this.minHeight = 6;
    this.transientBoost = 2; // 1 = low, 2 = med, 3 = high
    this.showPeaks = true;
    this.centerBass = false;

    // Dynamic animation state
    this.smoothedHeights = [];
    this.peakHeights = [];
    this.peakDecay = 0.94;
    this.idlePhase = 0;
    this.animationId = null;

    // Color cache (read from CSS variables)
    this.colors = {
      canvasBg: '#296846',
      barColor: '#ffffff',
      barPeak: 'rgba(255, 255, 255, 0.85)',
      centerline: 'rgba(255, 255, 255, 0.08)',
    };

    this.initCanvasResize();
    this.updateColorPalette();
    this.initBuffers();
  }

  initCanvasResize() {
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.canvas.width = Math.floor(width * dpr);
      this.canvas.height = Math.floor(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;

      this.ctx.scale(dpr, dpr);
      this.width = width;
      this.height = height;
    };

    window.addEventListener('resize', handleResize);
    handleResize();
  }

  updateColorPalette() {
    const style = getComputedStyle(document.body);
    this.colors.canvasBg = style.getPropertyValue('--canvas-bg').trim() || '#296846';
    this.colors.barColor = style.getPropertyValue('--bar-color').trim() || '#ffffff';
    this.colors.barPeak = style.getPropertyValue('--bar-peak').trim() || 'rgba(255,255,255,0.85)';
    this.colors.centerline = style.getPropertyValue('--centerline-color').trim() || 'rgba(255,255,255,0.08)';
  }

  initBuffers() {
    this.smoothedHeights = new Float32Array(this.barCount).fill(this.minHeight);
    this.peakHeights = new Float32Array(this.barCount).fill(this.minHeight);
  }

  setBarCount(count) {
    this.barCount = count;
    this.initBuffers();
  }

  start() {
    if (!this.animationId) {
      this.render = this.render.bind(this);
      this.animationId = requestAnimationFrame(this.render);
    }
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Main Render Loop (Target 60-120fps)
   */
  render() {
    this.animationId = requestAnimationFrame(this.render);

    const { freqData, timeData, isSilent } = this.audioEngine.getAudioData();
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const centerY = h / 2;

    // Draw background
    ctx.fillStyle = this.colors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    // Optional faint center baseline guide
    ctx.strokeStyle = this.colors.centerline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.05, centerY);
    ctx.lineTo(w * 0.95, centerY);
    ctx.stroke();

    // Calculate bar dimensions
    // Leave 8% margin on left and right for generous editorial macro-whitespace
    const usableWidth = w * 0.86;
    const startX = w * 0.07;
    const totalSlotWidth = usableWidth / this.barCount;
    const gap = totalSlotWidth * this.spacingRatio;
    const barWidth = Math.max(2, totalSlotWidth - gap);

    // Compute raw bar targets from audio
    const rawTargets = new Float32Array(this.barCount);
    const maxAmplitude = h * 0.42; // Maximum half-height (keeps bars inside screen)

    if (freqData && !isSilent) {
      if (this.mode === 'waveform' && timeData) {
        this.computeWaveformData(timeData, rawTargets, maxAmplitude);
      } else {
        this.computeFrequencyData(freqData, rawTargets, maxAmplitude);
      }
    } else {
      // Idle ambient breathing wave (subtle resting pulse)
      this.idlePhase += 0.035;
      for (let i = 0; i < this.barCount; i++) {
        const norm = (i / this.barCount) * Math.PI * 4;
        const breath = Math.sin(norm + this.idlePhase) * Math.cos(norm * 0.5 - this.idlePhase * 0.5);
        rawTargets[i] = this.minHeight + Math.max(0, breath * 4);
      }
    }

    // Physics: Smoothing & peak decay
    const smoothFactor = 1 - this.smoothing;
    for (let i = 0; i < this.barCount; i++) {
      const target = rawTargets[i];
      // Faster rise, smooth fall
      if (target > this.smoothedHeights[i]) {
        this.smoothedHeights[i] += (target - this.smoothedHeights[i]) * Math.min(1, smoothFactor * 2.2);
      } else {
        this.smoothedHeights[i] += (target - this.smoothedHeights[i]) * smoothFactor * 0.8;
      }

      // Peak tracking
      if (this.smoothedHeights[i] > this.peakHeights[i]) {
        this.peakHeights[i] = this.smoothedHeights[i];
      } else {
        this.peakHeights[i] = Math.max(this.minHeight, this.peakHeights[i] * this.peakDecay);
      }
    }

    // Render bars
    ctx.fillStyle = this.colors.barColor;
    ctx.strokeStyle = this.colors.barColor;
    ctx.lineWidth = barWidth;
    ctx.lineCap = this.capStyle === 'round' ? 'round' : 'square';

    for (let i = 0; i < this.barCount; i++) {
      const x = startX + i * totalSlotWidth + barWidth / 2;
      const barH = Math.max(this.minHeight, this.smoothedHeights[i]);

      if (this.mode === 'single-up') {
        // Bottom to Top
        const bottomY = centerY + maxAmplitude;
        const topY = bottomY - barH * 2;
        this.drawBarLine(ctx, x, bottomY, topY, barWidth);
      } else if (this.mode === 'dual-band') {
        // Dual band: top half and bottom half separated by a clean gap
        const gapDist = 8;
        const halfH = barH * 0.8;
        // Upper
        this.drawBarLine(ctx, x, centerY - gapDist, centerY - gapDist - halfH, barWidth);
        // Lower
        this.drawBarLine(ctx, x, centerY + gapDist, centerY + gapDist + halfH, barWidth);
      } else {
        // Symmetrical Mirror (Exact match to reference photo!)
        // Center-aligned: extends equally upwards and downwards
        const halfH = barH / 2;
        const topY = centerY - halfH;
        const bottomY = centerY + halfH;
        this.drawBarLine(ctx, x, topY, bottomY, barWidth);

        // Optional Peak accent caps (discrete floating markers)
        if (this.showPeaks && this.peakHeights[i] > barH + 4) {
          const peakHalf = this.peakHeights[i] / 2;
          ctx.fillStyle = this.colors.barPeak;
          const dotSize = Math.max(2, barWidth * 0.8);
          // Top peak
          ctx.beginPath();
          ctx.arc(x, centerY - peakHalf, dotSize / 2, 0, Math.PI * 2);
          ctx.fill();
          // Bottom peak
          ctx.beginPath();
          ctx.arc(x, centerY + peakHalf, dotSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = this.colors.barColor;
        }
      }
    }
  }

  /**
   * Draws a vertical bar with precise round or flat cap
   */
  drawBarLine(ctx, x, y1, y2, barWidth) {
    if (this.capStyle === 'round') {
      // Ensure distance between endpoints is at least 0.5px for clean rounded pill
      const minSpan = barWidth * 0.05;
      let startY = y1;
      let endY = y2;
      if (Math.abs(endY - startY) < minSpan) {
        startY = y1 - minSpan / 2;
        endY = y1 + minSpan / 2;
      }
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    } else {
      // Crisp flat rectangle
      const topY = Math.min(y1, y2);
      const height = Math.abs(y2 - y1);
      ctx.fillRect(x - barWidth / 2, topY, barWidth, height);
    }
  }

  /**
   * Logarithmic/Perceptual Frequency Extraction with Equal Loudness Compensation
   */
  computeFrequencyData(freqData, outputArray, maxAmplitude) {
    const binCount = freqData.length; // e.g. 1024 bins
    const sampleRate = this.audioEngine.audioCtx ? this.audioEngine.audioCtx.sampleRate : 44100;
    const nyquist = sampleRate / 2;

    // Perceptually relevant musical spectrum: 28 Hz to 16,000 Hz
    const minFreq = 28;
    const maxFreq = 16000;

    for (let i = 0; i < this.barCount; i++) {
      let mappedIndex = i;
      if (this.centerBass) {
        // Bass centered in the middle of the screen, treble on the wings
        const mid = (this.barCount - 1) / 2;
        const distFromMid = Math.abs(i - mid) / mid;
        mappedIndex = Math.floor(distFromMid * (this.barCount - 1));
      }

      // Logarithmic frequency mapping: f = min * (max / min) ^ (i / (N-1))
      const normIdx = mappedIndex / (this.barCount - 1);
      const startF = minFreq * Math.pow(maxFreq / minFreq, Math.max(0, normIdx - 0.5 / this.barCount));
      const endF = minFreq * Math.pow(maxFreq / minFreq, Math.min(1, normIdx + 0.5 / this.barCount));

      const startBin = Math.max(0, Math.min(binCount - 1, Math.floor((startF / nyquist) * binCount)));
      const endBin = Math.max(startBin + 1, Math.min(binCount, Math.ceil((endF / nyquist) * binCount)));

      let sum = 0;
      let count = 0;
      for (let b = startBin; b < endBin; b++) {
        sum += freqData[b];
        count++;
      }
      const rawAvg = count > 0 ? sum / count : 0; // 0 to 255

      // Perceptual tilt curve: High frequencies have much lower electrical energy than low bass.
      // We apply an equalization curve so cymbals & snares produce visible dynamic peaks.
      const freqCenter = (startF + endF) / 2;
      const trebleBoost = 1.0 + Math.log10(Math.max(1, freqCenter / 200)) * 0.42;

      // Transient punch calculation
      const normalizedValue = (rawAvg / 255.0) * this.gain * trebleBoost;
      const amplified = Math.pow(normalizedValue, 1.15) * maxAmplitude;

      outputArray[i] = Math.max(this.minHeight, amplified);
    }
  }

  /**
   * Time-domain Oscilloscope / Waveform Mirroring
   */
  computeWaveformData(timeData, outputArray, maxAmplitude) {
    const totalSamples = timeData.length;
    const step = Math.floor(totalSamples / this.barCount);

    for (let i = 0; i < this.barCount; i++) {
      const sampleIndex = i * step;
      // Byte data is centered around 128 (silence)
      const rawSample = (timeData[sampleIndex] - 128) / 128.0; // -1.0 to +1.0
      const absSample = Math.abs(rawSample) * this.gain * 1.5;
      outputArray[i] = Math.max(this.minHeight, absSample * maxAmplitude);
    }
  }
}
