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
| Gas | green pedal (bottom right) | → / D |
| Brake | red pedal with a hand (bottom left) | ← / A |
| Change lane (overtake) | blue arrow button next to the brake | ↑ / W (passing lane), ↓ / S (main lane) |
| Nitro boost | orange flame button next to the horn | **Shift** / N |
| Horn (beep-beep) | yellow button next to the gas pedal; tap the bus in the menu | **Space** / H |
| Pause | ⏸ button | Esc / P |

If the child just lets go of the gas, the bus slows down smoothly by itself, so even a 4-year-old can stop with one pedal.

## Game rules and points

| Event | Points |
|---|---|
| Stopped inside the yellow bus-stop zone (doors open) | **+10** |
| Each passenger who gets on or off | **+2** (+4 bonus at their destination stop) |
| Stopped and waited at a red light | **+5** |
| Drove through a red light | **−10** |
| Drove past a stop where people were waiting | **−5** |
| Drove into another vehicle (a crash) | **−10** |
| Drove over a speed bump slowly | **+3** |
| Drove over a speed bump too fast | **−5** (and the bus is damaged) |
| Served a bus stop properly | also +20 nitro |
| Filled up when the tank was getting empty | **+4** |
| Ran out of petrol | **−10** |
| Repair at the depot | free: the child taps each broken part; +6 for a bus as good as new |

Yellow is not penalized (the child is still learning). A yellow light never turns red while the bus is too close and too fast to stop, so the player is never punished for something they couldn't avoid. Lights and stops are at least 2100 px apart (about 6 seconds of driving) and the bus is slow and gentle, so there is always time to react.

**Helper mode** (steering-wheel button in the menu or in the pause screen): the bus brakes by itself in front of red lights and bus stops, so even a 3–4 year old can play by just holding the gas. The first light on each level always turns red as the bus approaches, to show the rule. Stars at the end: 0 mistakes = ⭐⭐⭐, 1–2 = ⭐⭐, more = ⭐.

## Campaign: Astana, Almaty, and Shymkent

**Play** opens the route map across **3 cities and 24 levels**, one per landmark:
- **Astana (1–12):** station, concert hall, Triumph of Astana, Khan Shatyr, Palace of Peace, Baiterek, Ak Orda, Hazrat Sultan mosque, Kazak Eli, Nur Alem, Astana Arena, airport.
- **Almaty (13–18):** Almaty station, Panfilov Park, Almaty Circus, Kok-Tobe, Medeu, Shymbulak.
- **Shymkent (19–24):** Shymkent Airport, Shymkent Citadel, Tulip Square, Dendropark, Shymkent Zoo, Baidibek Bi.

Only level 1 is open at first; **finishing a level opens the next**, puts a green ✓ and 1–3 stars on it, builds the road to the next landmark, and drives the bus there (completing the last route of a city unlocks the next city and transitions the map). The panel at the top shows total points (best score of every level) and how many levels are done. A big green **«Продолжить» / "Continue" button** in the corner starts the next level, so a small child doesn't have to aim at the right landmark (tapping a landmark works too; finished levels can be replayed to improve stars and score, a locked level just shakes). The bus waits on the road in front of the next landmark.

**Every level ends at its own landmark and opens a postcard story.** The finish of the route is the building from the map drawn big behind the road with a name board, dimmed with lit windows at night, and the bus announces the arrival. On the result screen, a **landmark postcard** shares a kid-friendly fact about the place; the **Postcards** button on the map opens the full 24-card album to revisit any unlocked landmark story. Drawings: `ui/landmarkScenes.ts` (big) and `ui/landmarks.ts` (map badges).

Levels scale smoothly across all 24 routes: 3 stops and 3 lights on levels 1–2, growing to 8 and 8 on later levels, with more people waiting and a higher speed limit across the 24 routes (340 → 510 px/s). Levels, landmark positions and texts live in `core/campaign.ts`, `core/level.ts` and `i18n`; to add levels extend `LANDMARKS` / `MAP_NODES` and `LEVEL_COUNT`.

## Pedestrians, traffic in our lane, speed bumps, the police siren

- **Pedestrians.** When a light turns red, 1–3 people cross on the zebra (on the first light of every level always, to teach it). The light stays red until everybody has crossed, and cars of both lanes wait for them too.
- **Four lanes, overtaking and turn signals.** The road has two lanes in each direction (a double yellow line in the middle, dashed lines between the lanes of a direction; stop lines only cross the lanes of their own direction). **Our bus can change lanes too** (blue arrow button next to the brake, or **↑ / W** and **↓ / S**) to overtake slower traffic, and must return to the curb lane to pick up passengers at bus stops or refuel at gas stations (Helper mode pulls back to the curb lane automatically before stops). **Other drivers overtake us** as well: a driver stuck behind something slower checks that the passing lane is clear, drifts over, speeds up, goes round and moves back once clear. **Flashing amber turn signals** blink on our bus (with a gentle click-clack sound) and on all bot vehicles whenever they change lanes or turn off into a side street. Drivers also start in the passing lane, and oncoming traffic uses both of its lanes. The collisions stay: every lane is solid, and a vehicle between two lanes blocks both.
- **Nitro.** A short burst of speed: hold the orange flame button next to the horn (or **Shift** / **N**). The bus pulls 2.6 times harder and its top speed rises to ×1.45 (fire behind the bus, speed lines, a whoosh); the surplus speed bleeds off smoothly afterwards. The nitro tank (the flame bar in the corner) lasts about 2.6 seconds from full, refills by itself in about 14 seconds (and gets +20 for every properly served bus stop); after running dry it can be used again only once 20% has refilled. Boosting burns 1.8 times more petrol, the brake always wins over it, and going fast over a speed bump or into a car hurts accordingly. The helper never boosts while it is braking.
- **Longer stretches.** Lights, bus stops, gas stations and speed bumps are now 3300–4100 px apart (before 2100–2700), so there is time to speed up, overtake and use the nitro; petrol use per metre was lowered to match, so the petrol plan is unchanged.
- **Traffic in our own lane** (from level 2): passenger cars, small buses and full-size buses (with their own random designs) drive the same way. They are **solid, nobody drives through anybody**: if we catch up with a slower vehicle we have to stay behind it, and driving into it is a **crash** (−10, sparks, a thump, the bus is shaken and can't use the gas for a second). They stop at red lights and queue, so when our bus stops at a bus stop the vehicles behind stop too. They keep a safe distance and can always stop for us, **except hasty drivers** (from level 5, marked with a red «!» when they are right behind us): they follow too close and overestimate their brakes, so if our bus stops suddenly they may **run into it** (we get a banner and a jolt, no penalty). Braking gently, as the helper does, avoids it. Vehicles turn off into side streets after a while, so nobody blocks the road forever.
- **Speed bumps** («лежачие полицейские», from level 2): a yellow-and-black bump across the road with a warning sign before it. Slow (≤ 130): the bus only wobbles and we get +3 and «Аккуратно!». Medium: the bus hops and loses some speed. Fast (> 230): a hard jolt, the bus loses half its speed, the screen shakes and it costs −5. Cars, buses and oncoming vehicles all slow down for bumps by themselves. The helper slows down before them.
- **People look like people of Kazakhstan:** dark hair with a fringe, warm skin tones, almond-shaped eyes, round faces; nine different characters used everywhere (waiting at stops, sitting on the benches, walking along the pavements): a man, a man in a cap, a girl with a bow, a woman with a ponytail, a man in a tubeteika (skullcap), a boy in a knitted hat, a woman in a headscarf, and two grandmothers in dresses (one with a grey bun and glasses, one in a white headscarf) (`LOOKS` in `src/ui/textures.ts`).
- **Townspeople on the pavements:** residents walk along both pavements (seen from the side, facing the way they go, with an eight-picture walking cycle: legs swing from the hip and bend at the knee, arms swing the other way and bend at the elbow, and the body rises and dips with each step; every person has own clothes and hair: T-shirt, jacket, dress, rucksack, cap, curls, ponytail, bun): grown-ups, children, parents with a child, some with a dog, with umbrellas in the rain, fewer at night. They only decorate the street (they never step onto the road), stop now and then to look around, and jump when the bus honks (`src/traffic/Walkers.ts`).
- **Livelier city backdrop:** two parallax layers (a hazy far skyline and the nearer buildings) with five building kinds: blocks with balconies and arched windows, glass towers with spires, houses with pitched roofs and shop awnings, a mosque with a dome and minarets, stepped buildings; roofs have water tanks, antennas, air-conditioners and billboards. Every city has its own mix (Astana: towers, Almaty: old blocks and houses, Shymkent: low houses and domes) (`src/ui/cityscape.ts`).
- **Realistic petrol use** (`fuelUse` in `core/rules.ts`): it is per second of engine work, not per metre. Standing costs a little, coasting with the foot off the gas almost nothing, holding a speed costs more the faster you go (air resistance grows with speed³, so a fast bus burns far more per metre and crawling is wasteful too), speeding up costs extra (hard pushes more), braking throws it away, nitro ×1.8, passengers add weight and a worn engine is thirstier. Smooth, calm driving saves petrol.
- **Bus horn:** a real horn chord (reedy, detuned notes, held ~0.6 s; the articulated bus is deeper and longer, the retro van toots twice, high and short).
- **People sit on the benches:** about half of the waiting passengers sit (the others stand); when the bus opens its doors they stand up, then walk to the doors. The stop name badge above the sign and the speech bubbles above people were removed; the stop is announced by the banner and the destinations are shown in the HUD.
- **Bus stop design:** a see-through glass shelter (roof on two posts, glass wall, a wooden bench inside, a warm light at night) and a second bench beside it, next to the stop sign (`src/ui/stopShelter.ts`).
- **Cars on / off:** the car button in the main menu removes every other vehicle (oncoming, same-direction, parked, ambulance) so the road is empty and only our bus drives; on by default.
- **Repair in the garage:** every bus card has a spanner button (it pulses when the bus is damaged or low on petrol) that opens the same Depot screen between games; the new condition and tank are saved for that bus.
- **Damage can be switched on or off** with the spanner button in the main menu (next to Helper). It is **off by default**: crashes and bumps still count as mistakes, but they no longer hurt the bus. Switch it on for the full wear-and-tear game below.
- **The bus gets damaged.** Every crash and every hard bump wears the bus out: a crash costs 8–25% of its condition (more the faster we hit, and more when it is our fault than when somebody runs into us), a medium bump 3–4%, a hard bump 15–17% (a gentle one nothing). The condition is shown in the corner (a spanner and a bar). The bus looks it too: scratches, dents, cracked windows, a broken headlight, a hanging bumper, light smoke below 50% and heavy dark smoke below 25%. A worn bus is **slower**: below 60% its top speed and pull drop gradually, to half at 0%, and a very worn engine coughs. The route ends with the condition shown on the result screen, and **a bus that comes home below 40% costs one star** (never the last one). **Wear and tear carries over from one level to the next** (per bus in the garage, visible on the map, menu and garage cards), so stopping at the repair depot keeps the bus in good shape.
- **Repair depot** (from level 2, one per route, an orange zone with a workshop building, a wrench sign, a warning board far before it and a wrench mark on the progress bar; helper mode stops there by itself when the condition is below 60%). Stop in the zone and a separate **Depot screen** opens: the bus stands in a workshop and every broken part (cracked windows and windshield, a broken headlight, a hanging bumper, flat tyres, dents, scratches, soot) pulses with a ring and a spanner. The child **taps each part until it is fixed** (1–3 taps each, dots show the progress, sparks fly and the part flashes), the condition bar climbs to 100% and a fanfare plays. A pump button tops up the tank (5 taps). "Drive on" returns to the route exactly where it stopped; leaving early with a half-fixed bus is fine. The broken parts shown in the depot are exactly the ones seen on the bus on the road (`src/bus/parts.ts`).
- **Petrol and the gas station** (from level 2). A petrol gauge sits next to the condition bar. Petrol is used up by driving: more per metre the faster we go, extra while pushing the gas, a little while idling at a light. A blue gas station zone (two red pumps, a round blue sign with a pump, a warning board far before it, and a pump mark on the progress bar) is handled like a bus stop: stop in the zone, a hose is connected and the tank is filled **for free** (+4 points if it was getting empty). The gas station only sells petrol; bus repairs are the depot's job (below). Driving past is allowed. There is 1 station on levels 2–5, 2 on levels 6–9 and 3 after that, spread along the route, and the first levels need no refuelling at all. Below 25% a warning beeps. **An empty tank** makes the bus crawl (a quarter of the speed); after a few seconds help brings 25% petrol, which is a mistake (−10, and it counts towards the three-in-a-row siren). The helper stops at a station by itself when petrol or the bus is in a bad way. **Remaining petrol carries over between levels** (per bus in the garage), and a brand-new bus built in an empty slot starts with a full tank and 100% condition.
- **Police siren.** Three mistakes in a row (with no good deed in between: a stop, a passenger, a polite wait at the red, a careful bump) make the siren wail for 3 seconds, with a red-and-blue flashing screen and the banner «Соблюдай правила!».

Rules and numbers: `core/rules.ts` (points, siren, bump results), `traffic/ai.ts` (drivers, bump zones), `traffic/collision.ts` (solid vehicles), `traffic/LaneTraffic.ts`, `traffic/Crossing.ts`.

## Other road users (oncoming traffic)

Passenger cars (two body shapes), a **police car** with a flashing light bar (never more than one at a time, and a rare guest) and a **small bus** drive towards us in the far lane. They are bots: they never touch our bus (they pass behind it), but they follow the rules. They stop for red at their own stop line (past the zebra crossing), stop on yellow only if they still can, keep their distance and queue up without overlapping, then drive on when the light turns green. At night their headlights glow. The road gets a bit busier on later levels. Behaviour is pure maths in `traffic/ai.ts` (covered by tests), drawing in `traffic/VehicleView.ts`, spawning in `traffic/TrafficManager.ts`.

## Seasons, day / night, weather

Every level has its own setting: summer, autumn, winter or spring, by day or by night, dry or rainy (snowy in winter). Night has a moon, stars, lit windows and street lamps, and the bus switches on its headlight beams. Autumn drops leaves, spring drops petals, rain also makes noise. The **«Погода» / "Weather"** button in the menu opens a screen to pick the season, day or night and weather yourself; the dice button returns to "auto" (the setting follows the level).

## Bus types

City, **articulated "accordion" bus**, **retro two-tone van** (in the style of the 1960s Volkswagen Transporter: your colour below the windows, a cream roof and nose, round headlights, chrome bumpers) and school bus (with a hood). Saves from older versions are converted automatically: the "long" bus became the articulated one, the double-decker became the van. The bus can be edited at any time through the garage (menu, pause and results screens); the green ▶ in the factory starts the route from any step.

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
