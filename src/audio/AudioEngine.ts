/**
 * All game sounds are synthesised with the Web Audio API — no audio files needed.
 * Browsers only allow audio after a user gesture, so `unlock()` is called on the
 * first tap/click (see main.ts). Calls before that are silently ignored.
 */

type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  dur: number;
  type?: Wave;
  vol?: number;
  at?: number;
  slideTo?: number;
  attack?: number;
}

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

// Cheerful C-major pentatonic loop (eighth notes). 0 = rest.
const MELODY = [
  72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 74, 72, 69, 0, 72, 0,
  72, 0, 76, 79, 81, 0, 79, 76, 74, 0, 76, 74, 72, 0, 0, 0,
];
const BASS = [48, 48, 45, 45, 41, 41, 43, 43];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;

  private soundOn = true;
  private musicOn = true;
  private wantMusic = false;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private sirenNode: OscillatorNode | null = null;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

  configure(sound: boolean, music: boolean): void {
    this.soundOn = sound;
    this.musicOn = music;
    this.applyGains();
  }

  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.applyGains();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantMusic) this.ensureMusicLoop();
  }

  private applyGains(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.soundOn ? 0.9 : 0, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(1, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.13 : 0, t, 0.05);
  }

  private live(): AudioContext | null {
    return this.ctx && this.soundOn ? this.ctx : null;
  }

  private tone({ freq, dur, type = 'sine', vol = 0.25, at = 0, slideTo, attack = 0.006 }: ToneOpts, dest?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, at = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ---------- sound effects ----------
  click(): void {
    if (!this.live()) return;
    this.tone({ freq: 700, dur: 0.07, type: 'square', vol: 0.06 });
  }

  select(): void {
    if (!this.live()) return;
    this.tone({ freq: 523, dur: 0.1, type: 'triangle', vol: 0.25 });
    this.tone({ freq: 784, dur: 0.16, type: 'triangle', vol: 0.25, at: 0.08 });
  }

  pop(): void {
    if (!this.live()) return;
    this.tone({ freq: 260, dur: 0.14, type: 'sine', vol: 0.3, slideTo: 900 });
  }

  horn(): void {
    if (!this.live()) return;
    for (const at of [0, 0.2]) {
      this.tone({ freq: 440, dur: 0.14, type: 'square', vol: 0.07, at, attack: 0.004 });
      this.tone({ freq: 554, dur: 0.14, type: 'square', vol: 0.07, at, attack: 0.004 });
    }
  }

  doorOpen(): void {
    if (!this.live()) return;
    this.noise(0.5, 0.35, 3000, 0, 900);
    this.tone({ freq: 180, dur: 0.25, type: 'triangle', vol: 0.12, at: 0.15, slideTo: 120 });
  }

  doorClose(): void {
    if (!this.live()) return;
    this.noise(0.3, 0.25, 1500, 0, 3000);
    this.tone({ freq: 140, dur: 0.12, type: 'sine', vol: 0.3, at: 0.28 });
  }

  dingDong(): void {
    if (!this.live()) return;
    this.tone({ freq: 880, dur: 0.6, type: 'sine', vol: 0.22 });
    this.tone({ freq: 698, dur: 0.8, type: 'sine', vol: 0.22, at: 0.32 });
  }

  coin(): void {
    if (!this.live()) return;
    this.tone({ freq: 988, dur: 0.08, type: 'square', vol: 0.07 });
    this.tone({ freq: 1319, dur: 0.22, type: 'square', vol: 0.07, at: 0.08 });
  }

  reward(): void {
    if (!this.live()) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.25, at: i * 0.09 }),
    );
  }

  oops(): void {
    if (!this.live()) return;
    this.tone({ freq: 392, dur: 0.28, type: 'triangle', vol: 0.3, slideTo: 330 });
    this.tone({ freq: 330, dur: 0.45, type: 'triangle', vol: 0.3, at: 0.3, slideTo: 196 });
  }

  star(i: number): void {
    if (!this.live()) return;
    this.tone({ freq: 660 * Math.pow(1.26, i), dur: 0.35, type: 'triangle', vol: 0.25 });
    this.tone({ freq: 1320 * Math.pow(1.26, i), dur: 0.25, type: 'sine', vol: 0.08 });
  }

  fanfare(): void {
    if (!this.live()) return;
    const notes = [67, 72, 76, 79, 76, 79, 84];
    const times = [0, 0.12, 0.24, 0.36, 0.54, 0.66, 0.8];
    notes.forEach((n, i) =>
      this.tone({ freq: midi(n), dur: i === notes.length - 1 ? 0.6 : 0.16, type: 'triangle', vol: 0.25, at: times[i] }),
    );
  }

  /** A worn-out engine coughs. */
  cough(): void {
    if (!this.live()) return;
    this.tone({ freq: 70, dur: 0.18, type: 'sawtooth', vol: 0.25, slideTo: 40 });
    this.noise(0.14, 0.2, 700, 0.02, 200);
    this.tone({ freq: 62, dur: 0.14, type: 'sawtooth', vol: 0.2, at: 0.2, slideTo: 38 });
  }

  /** The wheels thump over a speed bump; harder (`power` 0..1) = deeper and louder. */
  bump(power: number): void {
    if (!this.live()) return;
    this.tone({ freq: 140 - 60 * power, dur: 0.16 + 0.12 * power, type: 'sine', vol: 0.18 + 0.4 * power, slideTo: 50 });
    this.noise(0.1 + 0.1 * power, 0.1 + 0.3 * power, 500, 0.08, 150);
  }

  crash(): void {
    if (!this.live()) return;
    this.noise(0.45, 0.6, 1800, 0, 250);
    this.tone({ freq: 95, dur: 0.35, type: 'sine', vol: 0.55, slideTo: 45 });
    this.tone({ freq: 420, dur: 0.12, type: 'square', vol: 0.1, slideTo: 160 });
    this.tone({ freq: 310, dur: 0.2, type: 'sawtooth', vol: 0.07, at: 0.06, slideTo: 120 });
  }

  /** Police siren: a rising and falling wail. Stops by itself after `seconds`. */
  siren(seconds = 3): void {
    const ctx = this.live();
    if (!ctx) return;
    this.stopSiren();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(650, t0);
    for (let t = 0; t < seconds; t += 0.9) {
      osc.frequency.linearRampToValueAtTime(1150, t0 + t + 0.45);
      osc.frequency.linearRampToValueAtTime(650, t0 + t + 0.9);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.05);
    gain.gain.setValueAtTime(0.11, t0 + seconds - 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
    this.sirenNode = osc;
  }

  stopSiren(): void {
    try {
      this.sirenNode?.stop();
    } catch {
      /* already stopped */
    }
    this.sirenNode = null;
  }

  // ---------- rain ----------
  startRain(): void {
    const ctx = this.ctx;
    if (!ctx || this.rain) return;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(hp).connect(lp).connect(gain).connect(this.sfxBus);
    src.start();
    this.rain = { src, gain };
  }

  stopRain(): void {
    if (!this.rain || !this.ctx) return;
    this.rain.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    this.rain.src.stop(this.ctx.currentTime + 0.5);
    this.rain = null;
  }

  // ---------- engine hum ----------
  startEngine(): void {
    const ctx = this.ctx;
    if (!ctx || this.engine) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.sfxBus);
    osc.frequency.value = 45;
    osc2.frequency.value = 22.5;
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain };
  }

  /** speed01: 0 (idle) … 1 (full speed). */
  setEngine(speed01: number): void {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const f = 42 + speed01 * 75;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.1);
    this.engine.osc2.frequency.setTargetAtTime(f / 2, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.1);
  }

  stopEngine(): void {
    if (!this.engine || !this.ctx) return;
    const { osc, osc2, gain } = this.engine;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    osc.stop(this.ctx.currentTime + 0.3);
    osc2.stop(this.ctx.currentTime + 0.3);
    this.engine = null;
  }

  // ---------- background music ----------
  startMusic(): void {
    this.wantMusic = true;
    if (this.ctx) this.ensureMusicLoop();
  }

  private ensureMusicLoop(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.15;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const eighth = 60 / 128 / 2;
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const at = this.nextNoteTime - ctx.currentTime;
      const note = MELODY[this.step % MELODY.length]!;
      if (note) this.tone({ freq: midi(note), dur: eighth * 1.6, type: 'triangle', vol: 0.5, at }, this.musicBus);
      if (this.step % 4 === 0) {
        const bass = BASS[Math.floor(this.step / 4) % BASS.length]!;
        this.tone({ freq: midi(bass), dur: eighth * 3, type: 'sine', vol: 0.7, at }, this.musicBus);
      }
      if (this.step % 2 === 1) this.tone({ freq: 6000, dur: 0.03, type: 'square', vol: 0.03, at }, this.musicBus);
      this.step++;
      this.nextNoteTime += eighth;
    }
  }
}

export const audio = new AudioEngine();
