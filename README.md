# Бип-Бип Автобус · Beep-Beep Bus

A web game for kids aged 4 and up. The child first **builds a bus at a factory**, then **drives it along a city route**: stopping at bus stops, picking up and dropping off passengers, and waiting at red lights.

- Languages: **Русский / Қазақша / English** (switch on the main menu, the choice is remembered)
- Minimal text: icons, sounds and animations do most of the explaining
- No losing: points never drop below zero, and the child always gets at least ⭐
- All graphics are vector shapes drawn in code; all sounds are synthesized with the Web Audio API. **No external images or audio files.**

## Running

```bash
npm install
npm run dev        # http://localhost:5173 (also reachable from a phone on the same Wi-Fi)
npm test           # unit tests for the game logic
npm run build      # production build into dist/ (static files, can be hosted anywhere)
```

## Controls

| Action | Touch screen | Keyboard |
|---|---|---|
| Gas | green pedal (bottom right) | → / ↑ / D / W |
| Brake | red pedal with a hand (bottom left) | ← / ↓ / A / S |
| Horn (beep-beep) | yellow button next to the gas pedal; tap the bus in the menu | **Space** / H |
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
| Drove into another vehicle (a crash) | **−10** |
| Drove over a speed bump slowly | **+3** |
| Drove over a speed bump too fast | **−5** (and the bus is damaged) |

Yellow is not penalized (the child is still learning). A yellow light never turns red while the bus is too close and too fast to stop, so the player is never punished for something they couldn't avoid. Lights and stops are at least 2100 px apart (about 6 seconds of driving) and the bus is slow and gentle, so there is always time to react.

**Helper mode** (steering-wheel button in the menu or in the pause screen): the bus brakes by itself in front of red lights and bus stops, so even a 3–4 year old can play by just holding the gas. The first light on each level always turns red as the bus approaches, to show the rule. Stars at the end: 0 mistakes = ⭐⭐⭐, 1–2 = ⭐⭐, more = ⭐.

## Campaign: the map of Astana

**Play** opens a map of Astana with **12 levels**, one per landmark: station, concert hall, Triumph of Astana, Khan Shatyr, Palace of Peace, Baiterek, Ak Orda, Hazrat Sultan mosque, Kazak Eli, Nur Alem, Astana Arena, airport. Only level 1 is open at first; **finishing a level opens the next**, puts a green ✓ and 1–3 stars on it, builds the road to the next landmark and drives the bus there. The panel at the top shows the total points (best score of every level) and how many levels are done. A big green **«Продолжить» / "Continue" button** in the corner starts the next level, so a small child doesn't have to aim at the right landmark (tapping a landmark works too; finished levels can be replayed to improve stars and score, a locked level just shakes). The bus waits on the road in front of the next landmark.

**Every level ends at its own landmark.** The finish of the route is the building from the map (station, Baiterek, Khan Shatyr, Astana Arena, ...) drawn big behind the road with a name board, dimmed with lit windows at night, and the bus announces the arrival. Drawings: `ui/landmarkScenes.ts` (big) and `ui/landmarks.ts` (map badges).

Levels get harder: 3 stops and 3 lights on levels 1–2, up to 8 and 8 on levels 11–12, more people waiting, and a higher speed limit (340 → 510 px/s). Levels, landmark positions and texts live in `core/campaign.ts`, `core/level.ts` and `i18n`; to add levels extend `LANDMARKS` / `MAP_NODES` and `LEVEL_COUNT`.

## Pedestrians, traffic in our lane, speed bumps, the police siren

- **Pedestrians.** When a light turns red, 1–3 people cross on the zebra (on the first light of every level always, to teach it). The light stays red until everybody has crossed, and cars of both lanes wait for them too.
- **Traffic in our own lane** (from level 2): passenger cars, small buses and full-size buses (with their own random designs) drive the same way. They are **solid, nobody drives through anybody**: if we catch up with a slower vehicle we have to stay behind it, and driving into it is a **crash** (−10, sparks, a thump, the bus is shaken and can't use the gas for a second). They stop at red lights and queue, so when our bus stops at a bus stop the vehicles behind stop too. They keep a safe distance and can always stop for us, **except hasty drivers** (from level 5, marked with a red «!» when they are right behind us): they follow too close and overestimate their brakes, so if our bus stops suddenly they may **run into it** (we get a banner and a jolt, no penalty). Braking gently, as the helper does, avoids it. Vehicles turn off into side streets after a while, so nobody blocks the road forever.
- **Speed bumps** («лежачие полицейские», from level 2): a yellow-and-black bump across the road with a warning sign before it. Slow (≤ 130): the bus only wobbles and we get +3 and «Аккуратно!». Medium: the bus hops and loses some speed. Fast (> 230): a hard jolt, the bus loses half its speed, the screen shakes and it costs −5. Cars, buses and oncoming vehicles all slow down for bumps by themselves. The helper slows down before them.
- **The bus gets damaged.** Every crash and every hard bump wears the bus out: a crash costs 8–25% of its condition (more the faster we hit, and more when it is our fault than when somebody runs into us), a medium bump 3–4%, a hard bump 15–17% (a gentle one nothing). The condition is shown in the corner (a spanner and a bar). The bus looks it too: scratches, dents, cracked windows, a broken headlight, a hanging bumper, light smoke below 50% and heavy dark smoke below 25%. A worn bus is **slower**: below 60% its top speed and pull drop gradually, to half at 0%, and a very worn engine coughs. The route ends with the condition shown on the result screen, and **a bus that comes home below 40% costs one star** (never the last one). Every route starts with a fresh bus.
- **Police siren.** Three mistakes in a row (with no good deed in between: a stop, a passenger, a polite wait at the red, a careful bump) make the siren wail for 3 seconds, with a red-and-blue flashing screen and the banner «Соблюдай правила!».

Rules and numbers: `core/rules.ts` (points, siren, bump results), `traffic/ai.ts` (drivers, bump zones), `traffic/collision.ts` (solid vehicles), `traffic/LaneTraffic.ts`, `traffic/Crossing.ts`.

## Other road users (oncoming traffic)

Passenger cars (two body shapes), a **police car** with a flashing light bar (never more than one at a time, and a rare guest) and a **small bus** drive towards us in the far lane. They are bots: they never touch our bus (they pass behind it), but they follow the rules. They stop for red at their own stop line (past the zebra crossing), stop on yellow only if they still can, keep their distance and queue up without overlapping, then drive on when the light turns green. At night their headlights glow. The road gets a bit busier on later levels. Behaviour is pure maths in `traffic/ai.ts` (covered by tests), drawing in `traffic/VehicleView.ts`, spawning in `traffic/TrafficManager.ts`.

## Seasons, day / night, weather

Every level has its own setting: summer, autumn, winter or spring, by day or by night, dry or rainy (snowy in winter). Night has a moon, stars, lit windows and street lamps, and the bus switches on its headlight beams. Autumn drops leaves, spring drops petals, rain also makes noise. The **«Погода» / "Weather"** button in the menu opens a screen to pick the season, day or night and weather yourself; the dice button returns to "auto" (the setting follows the level).

## Bus types

City, **articulated "accordion" bus**, double-decker and school bus (with a hood). Saves from the old "long" bus are converted to the articulated one automatically. The bus can be edited at any time through the garage (menu, pause and results screens); the green ▶ in the factory starts the route from any step.

## Garage: up to 3 saved buses

«Гараж» / "Garage" (menu, pause and results screens) keeps **up to three buses at once**. Tap a card to make that bus the driver, ▶ drives with it, ✏️ edits it, ✕ deletes it (tap twice, so a small finger can't delete by accident), **+** builds a new one in an empty place. A bus saved before the garage existed moves into place 1 automatically.

## Install as an app / fullscreen

The game is a PWA: on a phone or tablet open the site, then *Add to Home Screen* (iPhone: Share → Add to Home Screen) to get a fullscreen app that also works offline after the first visit. The orange button in the menu toggles fullscreen in the browser (not available in iPhone Safari).

## Publishing

Every push to `main` builds the game, runs the tests and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup: **Settings → Pages → Source: GitHub Actions**.
The `dist/` folder after `npm run build` can also be uploaded to any static host (Netlify, itch.io).

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
    progress.ts         stars and score per level, what is unlocked
    campaign.ts         the 12 levels and their places on the map of Astana
    world.ts            seasons, day/night, weather and their colour palettes
    rng.ts, storage.ts
  traffic/              other road users: ai.ts (rules), VehicleView.ts (drawing), TrafficManager.ts (spawning)
  bus/
    design.ts           bus design model (body, doors, wheels, colour…) + validation
    garage.ts           up to 3 saved buses
    geometry.ts         bus layout maths (where doors, windows, wheels go)
    BusView.ts          bus drawing from the model, doors, wheels, passengers in windows
  audio/AudioEngine.ts  synthesized sounds, engine hum, background music
  ui/                   buttons, pedals, icons, procedural textures, parallax
  scenes/
    BootScene           texture generation
    MenuScene           menu, language, sound
    MapScene            map of Astana: levels, stars, check marks, road building
    GarageScene         up to 3 saved buses
    WorldScene          season / day-night / weather picker
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
