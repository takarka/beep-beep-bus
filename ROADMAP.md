# Development plan

## ✅ Version 0.1: MVP (done)

- Factory: 7 steps (body ×4 incl. articulated, doors 1–3, wheels ×4, colour ×8, headlights ×4, stickers ×4, number 1–3 digits)
- Route: smooth road, parallax city, bus stops with passengers, traffic lights with random timing
- Points, a gentle "mistake" (no losing), stars at the end, endless levels (more stops and lights, higher speed)
- 3 languages (ru/kk/en), synthesized sounds and music, sound/music toggles
- Saved bus, unlocked level and stars (localStorage)
- Desktop (keyboard + mouse) and touch (multi-touch pedals); landscape on phones with a "rotate your device" hint

## ✅ Version 0.2 (part 1, done)

- Much more room between lights and stops, slower and gentler bus, fairer yellow light
- Articulated ("accordion") bus; body types are labelled in the factory
- Bus is editable from the menu, pause and results screens; ▶ shortcut in the factory
- Horn button (beep-beep) on the screen
- Helper mode (auto-brake), fullscreen button, PWA (home screen + offline)
- Garage with up to 3 saved buses

## ✅ Version 0.3 (done)

- **Map of Astana** with 12 levels (landmarks), check marks and stars, unlocking, total points
- Seasons (summer, autumn, winter, spring), day and night, rain and snow, own setting per level + weather picker
- Space bar = horn
- Each level finishes at its own landmark from the map; big "Continue" button on the map

## ✅ Version 0.4 (part 1, done)

- Oncoming traffic in the far lane: passenger cars, a police car, a small bus; they obey lights and keep their distance

## ✅ Version 0.5 (done)

- Pedestrians on the zebra (cross on red; the red waits for them)
- Traffic in our own lane: solid vehicles, queues, crashes, hasty drivers who may run into us
- Speed bumps with a warning sign: gentle / hop / hard jolt, other vehicles slow down
- Police siren after three mistakes in a row

## ✅ Version 0.6 (done)

- The zebra crossing is drawn the right way round (bars along the road, people cross over them)
- Wear and tear: crashes and hard bumps damage the bus (looks, smoke, slower, coughing engine, fewer stars)

## ✅ Version 0.7 (done)

- Petrol and gas stations (a stop with a pump zone): free refuelling, repair of the bus for points, an empty tank makes the bus crawl until help comes
- Damage is no longer permanent: the station repairs the bus

## ✅ Version 0.8 (done)

- Four lanes; other drivers overtake our bus when it is in their way; collisions between vehicles stay
- Our own lane changes (overtaking by the player via button or Up/Down / W/S); flashing turn signals on all vehicles when changing lanes
- Nitro boost; longer stretches between lights, stops, stations and bumps

## ✅ Version 0.9 (done)

- Damage and petrol carry over from one level to the next (saved per bus in the garage, shown on the map, results, menu and garage cards; fixed at gas stations)

## ✅ Version 1.0: Repair depot (done)

**Idea:** the gas station only sells petrol. Broken bits are fixed at a separate **depot** with its own screen, where the child repairs the bus by tapping each broken part.

1. **Parts model** (`src/bus/parts.ts`, pure + tests): the health number (0–100) is turned into a list of concrete broken parts (cracked windows, windshield, broken headlight, hanging bumper, dents, scratches, soot, damaged tyres). Each part has the health it gives back and how many taps it needs. The same list is drawn on the bus on the road and in the depot, so the child sees on the route what will have to be fixed.
2. **Level**: one depot on every level from 2 in their own gaps, away from lights, stops and stations; marked on the route bar.
3. **On the road**: a workshop building with a wrench sign, an orange stop zone and an arrow (like a bus stop); a warning board far ahead. Stop in the zone → the route freezes and the **Depot** screen opens. Helper mode brakes for the depot when the bus is in a bad state.
4. **Depot screen** (`DepotScene`): the bus in a workshop bay; every broken part pulses with a wrench bubble; each tap = a spark, a clank and a progress ring; when a part is fixed it flashes and the health bar climbs; 100% = fanfare. A pump button refuels the tank (a few taps). A big green "Drive on" button returns to the route exactly where it stopped (leaving early with a half-fixed bus is allowed).
5. **Gas station**: now only free petrol (no repair).
6. **Texts** ru/kk/en, sounds from existing synth sounds, **tests** (parts, level), browser check on desktop and phone sizes.

## 🔜 Version 0.2: mobile and polish (remaining)

- [ ] Phone testing: button sizes, safe areas (notch), fullscreen on the first tap
- [x] **Voice prompts** in three languages ("Stop!", "Bus stop!", "Well done!", etc. via Web Speech API with toggle)
- [ ] Parent settings (behind a "hold for 3 seconds" gate): difficulty, reset progress
- [x] Animated passengers (walking, waving), a speech bubble with an icon of where they're going

## 🚀 Version 0.3: more gameplay

- [x] Pedestrians at crossings without a traffic light (you must stop and let them pass)
- [x] **STOP sign**, "children" sign, speed bumps
- [x] Parked cars, a bot bus that stops at the bus stops too
- [x] Oncoming drivers overtaking each other
- [x] More vehicle types (taxi, truck, ambulance that you must let pass)
- [x] Evening / sunrise, fog, wipers
- [x] More routes / cities after Astana (Almaty, Shymkent)
- [x] Landmark story on each level: a short postcard or fact when it is completed
- [x] More levels on the map (extend `core/campaign.ts`)
- [x] Passengers with a destination: "take me to the park", where the child picks the right stop

## 🎨 Version 0.4: garage and rewards

- [ ] Points unlock new parts: trolleybus, a double-decker with an open roof (it was replaced by the van), spoilers, horns, flags
- [ ] Sticker album / achievements ("10 stops without mistakes")
- [ ] Bus photo: save a picture of your bus

## 🛠 Technical

- [ ] E2E tests (Playwright): smoke test "menu → factory → route → result"
- [ ] CI: build + tests on every push, deploy to GitHub Pages
- [ ] Move to a separate repository
- [ ] Optional: artist illustrations instead of procedural graphics (`BusView` and `ui/textures.ts` can be swapped for sprites without touching the logic)
