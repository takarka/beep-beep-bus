# Бип-Бип Автобус · Beep-Beep Bus

A web game for kids aged 4 and up. The child first **builds a bus at a factory**, then **drives it along a city route**: stopping at bus stops, picking up and dropping off passengers, and waiting at red lights.

- Languages: **Русский / Қазақша / English** (switch on the main menu, the choice is remembered)
- Minimal text: icons, sounds and animations do most of the explaining
- No losing: points never drop below zero, and the child always gets at least ⭐
- All graphics are vector shapes drawn in code; all sounds are synthesized with the Web Audio API. **No external images or audio files.**

## Running

```bash
cd bus-game
npm install
npm run dev        # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm test           # unit tests for the game logic
npm run build      # production build into dist/ (static files, can be hosted anywhere)
```

## Controls

| Action | Touch screen | Keyboard |
|---|---|---|
| Gas | green pedal (bottom right) | → / ↑ / D / W |
| Brake | red pedal with a hand (bottom left) | ← / ↓ / A / S / Space |
| Horn | tap the bus in the menu | H |
| Pause | ⏸ button | Esc / P |

If the child just lets go of the gas, the bus slows down smoothly by itself, so even a 4-year-old can stop with one pedal.

## Game rules and points

| Event | Points |
|---|---|
| Stopped inside the yellow bus-stop zone (doors open) | **+10** |
| Each passenger who gets on or off | **+2** |
| Stopped and waited at a red light | **+5** |
| Drove through a red light | **−10** |
| Drove past a stop where people were waiting | **−5** |

Yellow is not penalized (the child is still learning). The first light on each level always turns red as the bus approaches, to show the rule. Stars at the end: 0 mistakes = ⭐⭐⭐, 1–2 = ⭐⭐, more = ⭐.

## Stack and architecture

**Vite + TypeScript + Phaser 3.** Phaser is a mature 2D engine. It provides scenes, tweens, particles, multi-touch and automatic screen scaling (`Scale.FIT`, a 1280×720 logical canvas). A UI framework (React/Vue) isn't needed here: the whole interface lives inside the game canvas. That keeps it fast on weak tablets.

```
src/
  main.ts               entry point: font, settings, audio unlock, Phaser.Game
  config.ts             logical size, palette, colour helpers
  i18n/index.ts         ru / kk / en dictionaries (a missing translation is a compile error)
  core/                 pure logic, no Phaser → covered by tests
    level.ts            level generation (stops, lights, finish) with a seed
    traffic.ts          traffic light model (green → yellow → red)
    rules.ts            stop zones, red-light crossing, points, stars
    settings.ts         language / sound / music (localStorage)
    progress.ts         unlocked level and best stars
    rng.ts, storage.ts
  bus/
    design.ts           bus design model (body, doors, wheels, colour…) + validation
    geometry.ts         bus layout maths (where doors, windows, wheels go)
    BusView.ts          bus drawing from the model, doors, wheels, passengers in windows
  audio/AudioEngine.ts  synthesized sounds, engine hum, background music
  ui/                   buttons, pedals, icons, procedural textures, parallax
  scenes/
    BootScene           texture generation
    MenuScene           menu, language, sound
    FactoryScene        7 steps of building the bus
    DriveScene          the route: physics, lights, stops, HUD
    ResultScene         stars, stats, next level
tests/core.test.ts      logic tests (including all 48 bus configurations)
```

Rules and balance (speeds, zones, points, light timings) live in `core/rules.ts`, `core/traffic.ts` and at the top of `DriveScene.ts`, so they're easy to tune.

### How to add things

- **A new bus part** (e.g. a horn type): add the value to `bus/design.ts` → draw it in `BusView.ts` → add a step to `STEPS` in `FactoryScene.ts` and a name to `i18n`.
- **A new language**: add a dictionary to `i18n/index.ts` and its code to `LANGS`.
- **A new object on the road** (crosswalk with pedestrians, STOP sign): add the data to `core/level.ts`, the rule to `core/rules.ts`, drawing and checks to `DriveScene.ts`.

See [ROADMAP.md](ROADMAP.md) for the development plan.
