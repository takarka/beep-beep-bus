import { describe, expect, it } from 'vitest';
import { MUSIC_THEMES, midiToHz, stepBass, stepChord, stepNote, themeForCity, type MusicThemeId } from '../src/audio/musicThemes';
import { VOICE_CUES, VOICE_PHRASES, pickVoice } from '../src/audio/voice';
import { CITIES } from '../src/core/campaign';
import { LANGS } from '../src/i18n';

describe('musicThemes', () => {
  it('maps every campaign city to a distinct driving theme', () => {
    const ids = CITIES.map((c) => themeForCity(c));
    expect(new Set(ids).size).toBe(CITIES.length);
    for (const id of ids) expect(MUSIC_THEMES[id]).toBeDefined();
  });

  it('defines valid 64-step A-B-A-C patterns for every theme', () => {
    const ids: MusicThemeId[] = ['menu', 'astana', 'almaty', 'shymkent'];
    for (const id of ids) {
      const theme = MUSIC_THEMES[id];
      expect(theme.bpm).toBeGreaterThanOrEqual(90);
      expect(theme.bpm).toBeLessThanOrEqual(150);
      expect(theme.sections).toHaveLength(4);
      for (const sec of theme.sections) expect(sec).toHaveLength(16);
      expect(theme.bass).toHaveLength(16);
      expect(theme.chords).toHaveLength(16);

      // Every step across 64 steps returns valid MIDI notes or rests
      let activeNotes = 0;
      let bassHits = 0;
      let chordHits = 0;
      for (let s = 0; s < 64; s++) {
        const n = stepNote(theme, s);
        if (n > 0) {
          activeNotes++;
          expect(n).toBeGreaterThanOrEqual(55);
          expect(n).toBeLessThanOrEqual(96);
        }
        const b = stepBass(theme, s);
        if (b !== null) {
          bassHits++;
          expect(b).toBeGreaterThanOrEqual(36);
          expect(b).toBeLessThanOrEqual(64);
        }
        const c = stepChord(theme, s);
        if (c !== null) {
          chordHits++;
          expect(c.length).toBeGreaterThanOrEqual(2);
        }
      }
      expect(activeNotes).toBeGreaterThanOrEqual(24);
      expect(bassHits).toBe(16);
      expect(chordHits).toBe(16);
    }
  });

  it('converts MIDI A4 (69) to 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
    expect(midiToHz(57)).toBeCloseTo(220, 5);
    expect(midiToHz(81)).toBeCloseTo(880, 5);
  });
});

describe('voice prompts', () => {
  it('provides non-empty phrases for every cue in all 3 languages', () => {
    for (const lang of LANGS) {
      for (const cue of VOICE_CUES) {
        expect(VOICE_PHRASES[lang][cue].trim().length).toBeGreaterThan(2);
      }
    }
  });

  it('picks exact language voice and falls back cleanly for Kazakh', () => {
    const voices = [
      { lang: 'en-US', name: 'EN' },
      { lang: 'ru-RU', name: 'RU' },
    ];
    expect(pickVoice(voices, 'en')?.name).toBe('EN');
    expect(pickVoice(voices, 'ru')?.name).toBe('RU');
    expect(pickVoice(voices, 'kk')?.name).toBe('RU');
    expect(pickVoice([...voices, { lang: 'kk-KZ', name: 'KK' }], 'kk')?.name).toBe('KK');
    expect(pickVoice([], 'ru')).toBeNull();
  });
});
