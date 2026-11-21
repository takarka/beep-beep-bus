import type { BodyType } from '../bus/design';
import {
  MUSIC_THEMES,
  midiToHz,
  stepBass,
  stepChord,
  stepNote,
  type MusicTheme,
  type MusicThemeId,
} from './musicThemes';

/**
 * All game sounds are synthesised with the Web Audio API — no audio files needed.
 * Browsers only allow audio after a user gesture, so `unlock()` is called on the
 * first tap/click (see main.ts). Calls before that are silently ignored, except
 * persistent layers (music / engine / ambience) which remember their intent and
 * start as soon as audio unlocks.
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
  filterHz?: number;
}

export type AmbienceKind = 'rain' | 'snow' | 'night';

const HORN_PRESETS: Record<BodyType, { f1: number; f2: number; dur: number; gap: number; filter: number }> = {
  city: { f1: 440, f2: 554, dur: 0.14, gap: 0.2, filter: 1250 },
  bendy: { f1: 294, f2: 370, dur: 0.18, gap: 0.24, filter: 900 },
  school: { f1: 349, f2: 440, dur: 0.16, gap: 0.22, filter: 1050 },
  van: { f1: 587, f2: 740, dur: 0.11, gap: 0.17, filter: 1500 },
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private voiceBus!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private musicDuck!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private visBound = false;

  private soundOn = true;
  private musicOn = true;
  private wantMusic = false;
  private musicPaused = false;
  private musicTheme: MusicTheme = MUSIC_THEMES.menu;
  private musicNight = false;
  private musicIntensity = 0.45;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private musicCache = new Map<MusicThemeId, AudioBuffer | 'missing' | 'loading'>();
  private musicTrack: { id: MusicThemeId; src: AudioBufferSourceNode; gain: GainNode } | null = null;

  private wantEngine = false;
  private lastEngineSpeed = 0;
  private wantAmbience: AmbienceKind | null = null;

  private sirenNode: OscillatorNode | null = null;
  private nitroNode: OscillatorNode | null = null;
  private ambience: { kind: AmbienceKind; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

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

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.15;

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.92;
      this.master.connect(comp).connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);

      this.voiceBus = this.ctx.createGain();
      this.voiceBus.gain.value = 1;
      this.voiceBus.connect(this.master);

      this.musicBus = this.ctx.createGain();
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = this.musicNight ? 1300 : 5200;
      this.musicDuck = this.ctx.createGain();
      this.musicDuck.gain.value = 1;
      this.musicBus.connect(this.musicFilter).connect(this.musicDuck).connect(this.master);

      this.applyGains();
      this.bindVisibility();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantMusic) {
      this.ensureMusicLoop();
      this.ensureMusicTrack(this.musicTheme.id);
    }
    if (this.wantEngine && !this.engine) {
      this.createEngine();
      this.setEngine(this.lastEngineSpeed);
    }
    if (this.wantAmbience && !this.ambience) {
      this.createAmbience(this.wantAmbience);
    }
  }

  private bindVisibility(): void {
    if (this.visBound || typeof document === 'undefined') return;
    this.visBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        if (this.ctx.state === 'running') void this.ctx.suspend();
      } else {
        if (this.ctx.state === 'suspended') {
          void this.ctx.resume().then(() => {
            if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.12;
          });
        }
      }
    });
  }

  private applyGains(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.soundOn ? 1 : 0, t, 0.02);
    const musicTarget = this.musicOn ? (this.musicPaused ? 0.06 : 0.15) : 0;
    this.musicBus.gain.setTargetAtTime(musicTarget, t, 0.06);
  }

  private live(): AudioContext | null {
    return this.ctx && this.soundOn ? this.ctx : null;
  }

  private ensureNoiseBuf(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private tone(
    { freq, dur, type = 'sine', vol = 0.25, at = 0, slideTo, attack = 0.006, filterHz }: ToneOpts,
    dest?: AudioNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + Math.max(0, at);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const target = dest ?? this.sfxBus;
    if (filterHz) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filterHz, t);
      o.connect(f).connect(g).connect(target);
    } else {
      o.connect(g).connect(target);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, at = 0, slideTo?: number, dest?: AudioNode, q = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const buf = this.ensureNoiseBuf(ctx);
    const t = ctx.currentTime + Math.max(0, at);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.025, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Temporarily ducks background music during fanfares, sirens, or voice prompts. */
  duck(factor: number, seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicDuck.gain.cancelScheduledValues(t);
    this.musicDuck.gain.setTargetAtTime(factor, t, 0.04);
    this.musicDuck.gain.setTargetAtTime(1, t + seconds, 0.25);
  }

  /** Decodes an audio file buffer (MP3/OGG/WAV) using the shared AudioContext. */
  async decodeAudio(data: ArrayBuffer): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      return await this.ctx.decodeAudioData(data.slice(0));
    } catch {
      return null;
    }
  }

  /** Plays a decoded voice prompt through the voice bus (independent of SFX mute). */
  playVoiceBuffer(buf: AudioBuffer, vol = 0.95): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.voiceBus);
    src.start();
    return src;
  }

  // ---------- sound effects ----------
  click(): void {
    if (!this.live()) return;
    this.tone({ freq: 640, dur: 0.045, type: 'triangle', vol: 0.14, slideTo: 420, attack: 0.003 });
  }

  select(): void {
    if (!this.live()) return;
    this.tone({ freq: 523, dur: 0.1, type: 'triangle', vol: 0.22 });
    this.tone({ freq: 784, dur: 0.16, type: 'triangle', vol: 0.22, at: 0.07 });
  }

  pop(): void {
    if (!this.live()) return;
    this.tone({ freq: 260, dur: 0.14, type: 'sine', vol: 0.28, slideTo: 900 });
  }

  /** Bus horn tuned to the bus body type (warm filtered dual-tone). */
  horn(body: BodyType = 'city'): void {
    if (!this.live()) return;
    const p = HORN_PRESETS[body] ?? HORN_PRESETS.city;
    for (const at of [0, p.gap]) {
      this.tone({ freq: p.f1, dur: p.dur, type: 'sawtooth', vol: 0.11, at, attack: 0.005, filterHz: p.filter });
      this.tone({ freq: p.f2, dur: p.dur, type: 'sawtooth', vol: 0.1, at, attack: 0.005, filterHz: p.filter });
    }
  }

  /** Soft pneumatic bus brake hiss when coming to a full stop. */
  airBrake(): void {
    if (!this.live()) return;
    this.noise(0.26, 0.11, 2400, 0, 1050, this.sfxBus, 1.4);
  }

  /** Subtle rubbery wiper swish in rain. */
  wiper(): void {
    if (!this.live()) return;
    this.noise(0.14, 0.032, 650, 0, 1150, this.sfxBus, 2.2);
  }

  doorOpen(): void {
    if (!this.live()) return;
    this.noise(0.48, 0.3, 2800, 0, 900);
    this.tone({ freq: 180, dur: 0.25, type: 'triangle', vol: 0.12, at: 0.14, slideTo: 120 });
  }

  doorClose(): void {
    if (!this.live()) return;
    this.noise(0.3, 0.22, 1500, 0, 2800);
    this.tone({ freq: 140, dur: 0.12, type: 'sine', vol: 0.28, at: 0.26 });
  }

  dingDong(): void {
    if (!this.live()) return;
    this.tone({ freq: 880, dur: 0.55, type: 'sine', vol: 0.2 });
    this.tone({ freq: 698, dur: 0.75, type: 'sine', vol: 0.2, at: 0.3 });
  }

  coin(): void {
    if (!this.live()) return;
    this.tone({ freq: 988, dur: 0.09, type: 'triangle', vol: 0.16 });
    this.tone({ freq: 1319, dur: 0.24, type: 'triangle', vol: 0.18, at: 0.07 });
    this.tone({ freq: 2637, dur: 0.14, type: 'sine', vol: 0.05, at: 0.07 });
  }

  /** Extra cheerful chime when a passenger exits at their requested destination. */
  destinationBonus(): void {
    if (!this.live()) return;
    const notes = [1047, 1319, 1568];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.19, at: i * 0.065 });
      this.tone({ freq: f * 2, dur: 0.14, type: 'sine', vol: 0.05, at: i * 0.065 });
    });
  }

  reward(): void {
    if (!this.live()) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.22, at: i * 0.085 }),
    );
  }

  oops(): void {
    if (!this.live()) return;
    this.tone({ freq: 392, dur: 0.26, type: 'triangle', vol: 0.26, slideTo: 330 });
    this.tone({ freq: 330, dur: 0.42, type: 'triangle', vol: 0.26, at: 0.28, slideTo: 196 });
  }

  star(i: number): void {
    if (!this.live()) return;
    this.tone({ freq: 660 * Math.pow(1.26, i), dur: 0.35, type: 'triangle', vol: 0.24 });
    this.tone({ freq: 1320 * Math.pow(1.26, i), dur: 0.25, type: 'sine', vol: 0.08 });
  }

  fanfare(): void {
    if (!this.live()) return;
    this.duck(0.35, 1.5);
    const notes = [67, 72, 76, 79, 76, 79, 84];
    const times = [0, 0.12, 0.24, 0.36, 0.54, 0.66, 0.8];
    notes.forEach((n, i) =>
      this.tone({ freq: midiToHz(n), dur: i === notes.length - 1 ? 0.6 : 0.16, type: 'triangle', vol: 0.24, at: times[i] }),
    );
  }

  /** Nitro: a whoosh that lasts while the boost is on. */
  nitroOn(): void {
    const ctx = this.live();
    if (!ctx || this.nitroNode) return;
    this.tone({ freq: 160, dur: 0.35, type: 'sawtooth', vol: 0.15, slideTo: 620, filterHz: 1400 });
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(190, ctx.currentTime + 0.4);
    gain.gain.value = 0.055;
    osc.connect(filter).connect(gain).connect(this.sfxBus);
    osc.start();
    this.nitroNode = osc;
    this.noise(1.2, 0.18, 1200, 0, 3400);
  }

  nitroOff(): void {
    try {
      this.nitroNode?.stop();
    } catch {
      /* already stopped */
    }
    this.nitroNode = null;
  }

  /** A soft turn-signal click-clack while our bus changes lanes. */
  blinker(high: boolean): void {
    if (!this.live()) return;
    this.tone({ freq: high ? 1150 : 880, dur: 0.025, type: 'triangle', vol: 0.06 });
  }

  /** The "low fuel" warning: two quick beeps. */
  lowFuel(): void {
    if (!this.live()) return;
    for (const at of [0, 0.22]) this.tone({ freq: 880, dur: 0.14, type: 'triangle', vol: 0.2, at });
  }

  /** Petrol gurgling into the tank. */
  fuel(): void {
    if (!this.live()) return;
    this.noise(1.6, 0.16, 500, 0, 900);
    for (let i = 0; i < 6; i++) {
      this.tone({ freq: 300 + i * 70, dur: 0.1, type: 'sine', vol: 0.12, at: 0.12 + i * 0.22, slideTo: 520 + i * 70 });
    }
  }

  /** Clanking of tools while the bus is mended. */
  repair(): void {
    if (!this.live()) return;
    for (let i = 0; i < 5; i++) {
      this.tone({ freq: 900, dur: 0.09, type: 'triangle', vol: 0.12, at: i * 0.3, slideTo: 380 });
      this.noise(0.07, 0.11, 2500, i * 0.3 + 0.01, 900);
    }
  }

  /** A worn-out engine coughs. */
  cough(): void {
    if (!this.live()) return;
    this.tone({ freq: 70, dur: 0.18, type: 'sawtooth', vol: 0.22, slideTo: 40, filterHz: 350 });
    this.noise(0.14, 0.18, 700, 0.02, 200);
    this.tone({ freq: 62, dur: 0.14, type: 'sawtooth', vol: 0.18, at: 0.2, slideTo: 38, filterHz: 320 });
  }

  /** The wheels thump over a speed bump; harder (`power` 0..1) = deeper and louder. */
  bump(power: number): void {
    if (!this.live()) return;
    this.tone({ freq: 140 - 60 * power, dur: 0.16 + 0.12 * power, type: 'sine', vol: 0.18 + 0.38 * power, slideTo: 50 });
    this.noise(0.1 + 0.1 * power, 0.1 + 0.28 * power, 500, 0.08, 150);
  }

  crash(): void {
    if (!this.live()) return;
    this.noise(0.45, 0.55, 1800, 0, 250);
    this.tone({ freq: 95, dur: 0.35, type: 'sine', vol: 0.5, slideTo: 45 });
    this.tone({ freq: 420, dur: 0.12, type: 'sawtooth', vol: 0.09, slideTo: 160, filterHz: 1100 });
    this.tone({ freq: 310, dur: 0.2, type: 'sawtooth', vol: 0.07, at: 0.06, slideTo: 120, filterHz: 900 });
  }

  /** Police siren: a rising and falling wail. Stops by itself after `seconds`. */
  siren(seconds = 3): void {
    const ctx = this.live();
    if (!ctx) return;
    this.stopSiren();
    this.duck(0.42, seconds);
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
    gain.gain.setValueAtTime(0.11, t0 + Math.max(0.1, seconds - 0.12));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
    this.sirenNode = osc;
  }

  /** Ambulance two-tone siren (dee-dah-dee-dah), distinct from the police wail. */
  ambulanceSiren(seconds = 1.8): void {
    const ctx = this.live();
    if (!ctx) return;
    this.stopSiren();
    this.duck(0.45, seconds);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const t0 = ctx.currentTime;
    const step = 0.36;
    let hi = true;
    for (let t = 0; t < seconds; t += step) {
      osc.frequency.setValueAtTime(hi ? 880 : 660, t0 + t);
      hi = !hi;
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.04);
    gain.gain.setValueAtTime(0.11, t0 + Math.max(0.1, seconds - 0.1));
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

  // ---------- weather / world ambience ----------
  startAmbience(kind: AmbienceKind): void {
    if (this.wantAmbience === kind && this.ambience?.kind === kind) return;
    this.stopAmbience();
    this.wantAmbience = kind;
    if (this.ctx) this.createAmbience(kind);
  }

  private createAmbience(kind: AmbienceKind): void {
    const ctx = this.ctx;
    if (!ctx || this.ambience) return;
    const src = ctx.createBufferSource();
    src.buffer = this.ensureNoiseBuf(ctx);
    src.loop = true;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);

    if (kind === 'rain') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;
      gain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.25);
      src.connect(hp).connect(lp).connect(gain).connect(this.sfxBus);
    } else if (kind === 'snow') {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 1.6;
      gain.gain.setTargetAtTime(0.028, ctx.currentTime, 0.35);
      src.connect(bp).connect(gain).connect(this.sfxBus);
    } else {
      // Gentle night air
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      gain.gain.setTargetAtTime(0.016, ctx.currentTime, 0.4);
      src.connect(lp).connect(gain).connect(this.sfxBus);
    }

    src.start();
    this.ambience = { kind, src, gain };
  }

  stopAmbience(): void {
    this.wantAmbience = null;
    if (!this.ambience || !this.ctx) {
      this.ambience = null;
      return;
    }
    const { src, gain } = this.ambience;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    try {
      src.stop(this.ctx.currentTime + 0.5);
    } catch {
      /* already stopped */
    }
    this.ambience = null;
  }

  startRain(): void {
    this.startAmbience('rain');
  }

  stopRain(): void {
    this.stopAmbience();
  }

  // ---------- engine hum ----------
  startEngine(): void {
    this.wantEngine = true;
    this.lastEngineSpeed = 0;
    if (this.ctx && !this.engine) this.createEngine();
  }

  private createEngine(): void {
    const ctx = this.ctx;
    if (!ctx || this.engine) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc2.type = 'triangle';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.sfxBus);
    osc.frequency.value = 44;
    osc2.frequency.value = 22;
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, filter, gain };
  }

  /** speed01: 0 (idle) … 1 (full speed, up to 1.3 on nitro). */
  setEngine(speed01: number): void {
    this.lastEngineSpeed = speed01;
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const s = Math.max(0, Math.min(1.3, speed01));
    // Soft 3-gear RPM curve: rises, dips slightly on upshift, rises again.
    let rpm: number;
    if (s < 0.35) rpm = s / 0.35;
    else if (s < 0.72) rpm = 0.42 + ((s - 0.35) / 0.37) * 0.58;
    else rpm = 0.54 + ((s - 0.72) / 0.58) * 0.66;

    const f = 40 + rpm * 68;
    const cutoff = 160 + s * 300;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(f / 2, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(cutoff, t, 0.09);
    this.engine.gain.gain.setTargetAtTime(0.042 + Math.min(1, s) * 0.055, t, 0.1);
  }

  stopEngine(): void {
    this.wantEngine = false;
    if (!this.engine || !this.ctx) {
      this.engine = null;
      return;
    }
    const { osc, osc2, gain } = this.engine;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    try {
      osc.stop(this.ctx.currentTime + 0.3);
      osc2.stop(this.ctx.currentTime + 0.3);
    } catch {
      /* already stopped */
    }
    this.engine = null;
  }

  // ---------- background music ----------
  startMusic(): void {
    this.wantMusic = true;
    if (this.ctx) {
      this.ensureMusicLoop();
      this.ensureMusicTrack(this.musicTheme.id);
    }
  }

  setMusicTheme(id: MusicThemeId, opts?: { night?: boolean }): void {
    const next = MUSIC_THEMES[id] ?? MUSIC_THEMES.menu;
    const night = opts?.night ?? false;
    const changed = next.id !== this.musicTheme.id;
    this.musicTheme = next;
    this.musicNight = night;
    if (changed) {
      this.step = 0;
      if (this.musicTrack && this.musicTrack.id !== next.id) this.stopMusicTrack();
    }
    if (this.ctx) {
      this.musicFilter.frequency.setTargetAtTime(night ? 1300 : 5200, this.ctx.currentTime, 0.25);
      this.ensureMusicTrack(next.id);
    }
    this.startMusic();
  }

  private ensureMusicTrack(id: MusicThemeId): void {
    if (!this.ctx || typeof fetch === 'undefined') return;
    if (this.musicTrack?.id === id) return;
    const cached = this.musicCache.get(id);
    if (cached === 'missing' || cached === 'loading') return;
    if (cached) {
      this.startMusicTrack(id, cached);
      return;
    }
    this.musicCache.set(id, 'loading');
    void fetch(`./audio/music/${id}.mp3`)
      .then(async (res) => {
        const ct = res.headers.get('content-type') ?? '';
        if (!res.ok || ct.includes('text/html')) {
          this.musicCache.set(id, 'missing');
          return;
        }
        const buf = await this.decodeAudio(await res.arrayBuffer());
        if (!buf) {
          this.musicCache.set(id, 'missing');
          return;
        }
        this.musicCache.set(id, buf);
        if (this.musicTheme.id === id && this.wantMusic) this.startMusicTrack(id, buf);
      })
      .catch(() => {
        this.musicCache.set(id, 'missing');
      });
  }

  private startMusicTrack(id: MusicThemeId, buf: AudioBuffer): void {
    if (!this.ctx) return;
    this.stopMusicTrack();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(1.6, t + 0.45);
    src.connect(gain).connect(this.musicBus);
    src.start(t);
    this.musicTrack = { id, src, gain };
  }

  private stopMusicTrack(): void {
    if (!this.musicTrack || !this.ctx) {
      this.musicTrack = null;
      return;
    }
    const { src, gain } = this.musicTrack;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.08);
    try {
      src.stop(t + 0.35);
    } catch {
      /* already stopped */
    }
    this.musicTrack = null;
  }

  /** 0 = calm/idle (menus, bus stop), 1 = energetic driving. */
  setMusicIntensity(level: number): void {
    this.musicIntensity = Math.max(0, Math.min(1, level));
  }

  setMusicPaused(paused: boolean): void {
    this.musicPaused = paused;
    this.applyGains();
  }

  private ensureMusicLoop(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.15;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Only fall back to the built-in synth if the MP3 track for this theme is confirmed missing.
    // While it is loading or playing, keep the synth silent so the old music never bleeds through.
    const state = this.musicCache.get(this.musicTheme.id);
    if ((this.musicTrack && this.musicTrack.id === this.musicTheme.id) || state !== 'missing') {
      this.nextNoteTime = ctx.currentTime + 0.12;
      return;
    }
    // Prevent catch-up burst after long pause/backgrounding.
    if (this.nextNoteTime < ctx.currentTime - 0.3) {
      this.nextNoteTime = ctx.currentTime + 0.08;
    }
    const theme = this.musicTheme;
    const bpm = this.musicNight ? theme.bpm * 0.92 : theme.bpm;
    const eighth = 60 / bpm / 2;

    while (this.nextNoteTime < ctx.currentTime + 0.24) {
      const at = Math.max(0, this.nextNoteTime - ctx.currentTime);
      const s = this.step;

      // 1. Lead melody
      const note = stepNote(theme, s);
      if (note) {
        this.tone(
          {
            freq: midiToHz(note),
            dur: eighth * theme.leadGate,
            type: theme.leadWave,
            vol: 0.42,
            at,
            attack: 0.01,
            filterHz: theme.leadFilterHz,
          },
          this.musicBus,
        );
      }

      // 2. Bass line
      const bass = stepBass(theme, s);
      if (bass) {
        this.tone(
          {
            freq: midiToHz(bass),
            dur: eighth * 3.1,
            type: theme.bassWave,
            vol: 0.58,
            at,
            attack: 0.012,
            filterHz: 600,
          },
          this.musicBus,
        );
      }

      // 3. Soft chord pluck on off-beats
      const chord = stepChord(theme, s);
      if (chord) {
        for (const cn of chord) {
          this.tone(
            {
              freq: midiToHz(cn),
              dur: eighth * 1.4,
              type: 'sine',
              vol: 0.13,
              at,
              attack: 0.015,
            },
            this.musicBus,
          );
        }
      }

      // 4. Gentle dynamic percussion (scales smoothly with driving intensity)
      const perc = this.musicIntensity;
      if (perc > 0.2) {
        const pVol = (perc - 0.2) / 0.8;
        const barStep = s % 8;
        // Soft kick
        const kickHit =
          theme.percStyle === 'folk'
            ? barStep === 0 || barStep === 3 || barStep === 6
            : barStep === 0 || (theme.percStyle !== 'light' && barStep === 4);
        if (kickHit) {
          this.tone(
            {
              freq: 112,
              dur: 0.09,
              type: 'sine',
              vol: 0.34 * pVol,
              at,
              slideTo: 42,
              attack: 0.004,
            },
            this.musicBus,
          );
        }
        // Airy shaker (filtered noise instead of harsh high square wave)
        if (barStep % 2 === 1 && theme.percStyle !== 'light') {
          this.noise(0.03, 0.09 * pVol, 5400, at, undefined, this.musicBus, 2.5);
        }
      }

      this.step = (this.step + 1) % 64;
      this.nextNoteTime += eighth;
    }
  }
}

export const audio = new AudioEngine();
