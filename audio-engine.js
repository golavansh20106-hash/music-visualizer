/**
 * SONIC // Minimalist Audio Engine
 * Manages Web Audio Context, AnalyserNode, System Audio Capture, Mic, File Player & Built-in Synth.
 */

class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.activeStream = null;
    this.sourceType = 'idle'; // 'loopback' | 'file' | 'synth' | 'idle'

    // Direct Python Hardware Loopback Bridge
    this.ws = null;
    this.isWsConnected = false;
    this.externalFreqData = null;
    this.deviceName = 'PC Audio Loopback';

    // FFT analysis buffer
    this.fftSize = 2048;
    this.freqData = null;
    this.timeData = null;

    // Listeners for UI state
    this.onStateChange = null;
    this.onError = null;

    // Synth Demo State
    this.synthInterval = null;
    this.synthPlaying = false;
    this.synthTempo = 85; // BPM
    this.synthStep = 0;

    // Connect to Python WASAPI loopback bridge immediately
    this.connectWebSocket();
  }

  /**
   * Connects to local Python WASAPI Loopback Bridge on ws://127.0.0.1:3001
   * Completely bypasses browser screen-share permissions and restrictions.
   */
  connectWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    const host = window.location.hostname || '127.0.0.1';
    const wsUrl = `ws://${host}:3001`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[*] Connected to Python Hardware Audio Loopback Bridge');
        this.isWsConnected = true;
        if (this.sourceType !== 'synth' && this.sourceType !== 'file') {
          this.sourceType = 'loopback';
          if (this.onStateChange) {
            this.onStateChange('loopback', this.deviceName);
          }
        }
      };

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'device_info' && msg.name) {
              this.deviceName = msg.name;
              if (this.sourceType === 'loopback' && this.onStateChange) {
                this.onStateChange('loopback', this.deviceName);
              }
            }
          } catch (e) {}
        } else if (event.data instanceof ArrayBuffer) {
          this.externalFreqData = new Uint8Array(event.data);
          if (this.sourceType !== 'synth' && this.sourceType !== 'file') {
            this.sourceType = 'loopback';
          }
        }
      };

      this.ws.onclose = () => {
        this.isWsConnected = false;
        setTimeout(() => {
          if (!this.isWsConnected && this.sourceType !== 'synth' && this.sourceType !== 'file') {
            this.connectWebSocket();
          }
        }, 2000);
      };

      this.ws.onerror = () => {
        this.isWsConnected = false;
      };
    } catch (e) {
      console.warn('WebSocket connection attempt failed:', e);
    }
  }

  /**
   * Initializes or resumes the AudioContext on user interaction
   */
  async ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Master gain node
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 0.8;

      // Master analyser node
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.82;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      // Allocate buffers
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.fftSize);
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  /**
   * Disconnects and cleans up previous audio sources
   */
  cleanupCurrentSource() {
    this.stopSynth();

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        // Ignored
      }
      this.sourceNode = null;
    }

    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => track.stop());
      this.activeStream = null;
    }

    const audioEl = document.getElementById('audioElement');
    if (audioEl) {
      audioEl.pause();
      audioEl.src = '';
    }

    this.sourceType = 'idle';
  }

  /**
   * Captures whatever audio is playing across any device on the PC
   * (Earphones, Speakers, Headphones - Spotify, YouTube, Games).
   * Strictly excludes any microphone input.
   */
  async capturePCLoopback() {
    // If connected to Python WASAPI hardware bridge, activate immediately with 0 popups!
    if (this.isWsConnected) {
      this.cleanupCurrentSource();
      this.sourceType = 'loopback';
      if (this.onStateChange) {
        this.onStateChange('loopback', this.deviceName || 'PC AUDIO LOOPBACK');
      }
      return true;
    }

    // Try connecting to Python bridge first
    this.connectWebSocket();
    await new Promise((r) => setTimeout(r, 200));
    if (this.isWsConnected) {
      this.cleanupCurrentSource();
      this.sourceType = 'loopback';
      if (this.onStateChange) {
        this.onStateChange('loopback', this.deviceName || 'PC AUDIO LOOPBACK');
      }
      return true;
    }

    // Fallback to browser getDisplayMedia if python bridge is offline
    await this.ensureAudioContext();
    this.cleanupCurrentSource();

    try {
      // Prompt user to stream system audio with modern browser hints
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
          latency: 0,
        },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Clean up video stream if audio wasn't checked
        stream.getTracks().forEach((track) => track.stop());
        const err = new Error('NO_AUDIO_TRACK');
        err.code = 'CHECK_SHARE_AUDIO_BOX';
        if (this.onError) {
          this.onError(
            err,
            'No audio detected. Please check "Also share system audio" in the popup to capture your PC audio!'
          );
        }
        return false;
      }

      // Stop the video track immediately to conserve CPU/GPU
      stream.getVideoTracks().forEach((track) => track.stop());

      this.activeStream = stream;
      this.sourceType = 'loopback';

      // Connect loopback stream source to analyser ONLY
      this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);

      // Handle stream end when user clicks "Stop Sharing" in browser bar
      audioTracks[0].onended = () => {
        this.cleanupCurrentSource();
        if (this.onStateChange) this.onStateChange('idle', 'PC Audio Disconnected');
      };

      if (this.onStateChange) this.onStateChange('loopback', 'PC AUDIO LOOPBACK');
      return true;
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('System loopback capture error:', err);
        if (this.onError) this.onError(err, 'Failed to capture PC audio loopback.');
      }
      return false;
    }
  }

  /**
   * Default PC Audio Loopback entry point.
   * Exclusively captures PC playback sound and strictly blocks microphone input.
   */
  async autoConnectDefaultLoopback() {
    return await this.capturePCLoopback();
  }

  /**
   * Loads a local audio file (.mp3, .wav, .flac, etc.)
   */
  async loadLocalFile(file) {
    await this.ensureAudioContext();
    this.cleanupCurrentSource();

    const audioEl = document.getElementById('audioElement');
    if (!audioEl) return false;

    const fileUrl = URL.createObjectURL(file);
    audioEl.src = fileUrl;

    if (!audioEl._sourceConnected) {
      const mediaSource = this.audioCtx.createMediaElementSource(audioEl);
      mediaSource.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.gainNode.connect(this.audioCtx.destination);
      audioEl._sourceConnected = true;
    }

    this.sourceType = 'file';

    try {
      await audioEl.play();
      if (this.onStateChange) {
        this.onStateChange('file', file.name || 'Local File');
      }
      return true;
    } catch (err) {
      console.error('Audio playback error:', err);
      return false;
    }
  }

  /**
   * Sets Master Volume for file and demo playback
   */
  setVolume(val) {
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(val, this.audioCtx.currentTime);
    }
  }

  /**
   * Built-in Procedural Ambient Synth Beat
   * Generates warm chords, deep sub kick, crisp transient snare, and hi-hats.
   */
  async playDemoSynth() {
    await this.ensureAudioContext();
    this.cleanupCurrentSource();

    this.sourceType = 'synth';
    this.synthPlaying = true;
    this.synthStep = 0;

    // Chord progressions in D minor (Dmin9, Bbmaj7, Fmaj7, C9)
    const chords = [
      [146.83, 220.0, 261.63, 329.63, 440.0], // Dm9
      [116.54, 174.61, 220.0, 261.63, 349.23], // Bbmaj7
      [174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj9
      [130.81, 164.81, 196.0, 246.94, 293.66], // C9
    ];

    const stepDuration = (60 / this.synthTempo) / 4; // 16th note

    const scheduleBeat = () => {
      if (!this.synthPlaying) return;

      const now = this.audioCtx.currentTime;
      const step16 = this.synthStep % 16;
      const bar = Math.floor((this.synthStep / 16) % chords.length);

      // Kick drum on steps 0, 7, 10
      if (step16 === 0 || step16 === 7 || step16 === 10) {
        this._synthKick(now);
      }

      // Crisp Snare / Clap on steps 4, 12 (Generates that sharp transient spike from the reference photo!)
      if (step16 === 4 || step16 === 12) {
        this._synthSnare(now);
      }

      // Hi-Hats on every second 16th note
      if (step16 % 2 === 0) {
        this._synthHiHat(now, step16 % 4 === 2 ? 0.35 : 0.2);
      }

      // Ambient chords trigger on step 0 and step 8
      if (step16 === 0 || step16 === 8) {
        this._synthChord(chords[bar], now, stepDuration * 7.5);
      }

      this.synthStep++;
    };

    // Schedule loop
    this.synthInterval = setInterval(scheduleBeat, stepDuration * 1000);
    if (this.onStateChange) this.onStateChange('synth', 'Ambient Lo-Fi Synth');
  }

  _synthKick(time) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    gain.connect(this.gainNode);
    gain.connect(this.analyser);
    gain.connect(this.audioCtx.destination);

    osc.start(time);
    osc.stop(time + 0.36);
  }

  _synthSnare(time) {
    // Noise burst for snare snap (high frequency burst matching the reference right-side spike!)
    const bufferSize = this.audioCtx.sampleRate * 0.18;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;

    // Highpass filter for crisp transient
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1100, time);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    // Body tone
    const osc = this.audioCtx.createOscillator();
    const oscGain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.1);
    oscGain.gain.setValueAtTime(0.6, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(oscGain);
    oscGain.connect(gain);

    noise.connect(filter);
    filter.connect(gain);

    gain.connect(this.gainNode);
    gain.connect(this.analyser);
    gain.connect(this.audioCtx.destination);

    noise.start(time);
    osc.start(time);
    noise.stop(time + 0.19);
    osc.stop(time + 0.19);
  }

  _synthHiHat(time, vol = 0.25) {
    const bufferSize = this.audioCtx.sampleRate * 0.04;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);

    gain.connect(this.gainNode);
    gain.connect(this.analyser);
    gain.connect(this.audioCtx.destination);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  _synthChord(freqs, time, duration) {
    freqs.forEach((freq) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      // Warm attack and gentle release
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(gain);
      gain.connect(this.gainNode);
      gain.connect(this.analyser);
      gain.connect(this.audioCtx.destination);

      osc.start(time);
      osc.stop(time + duration);
    });
  }

  stopSynth() {
    this.synthPlaying = false;
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }

  /**
   * Fetches latest frequency & time data from AnalyserNode or Python Hardware Bridge
   */
  getAudioData() {
    // If receiving direct hardware WASAPI loopback from Python server
    if (this.sourceType === 'loopback' && this.externalFreqData) {
      let sum = 0;
      const len = this.externalFreqData.length;
      for (let i = 0; i < len; i++) {
        sum += this.externalFreqData[i];
      }
      const avg = sum / len;
      return {
        freqData: this.externalFreqData,
        timeData: null,
        avgEnergy: avg,
        isSilent: avg < 1.0,
      };
    }

    if (!this.analyser) {
      return { freqData: null, timeData: null, isSilent: true };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    // Calculate RMS energy to detect silence
    let sum = 0;
    for (let i = 0; i < this.freqData.length; i++) {
      sum += this.freqData[i];
    }
    const avg = sum / this.freqData.length;
    const isSilent = avg < 1.0;

    return {
      freqData: this.freqData,
      timeData: this.timeData,
      avgEnergy: avg,
      isSilent: isSilent,
    };
  }
}

// Global instance
window.audioEngine = new AudioEngine();
