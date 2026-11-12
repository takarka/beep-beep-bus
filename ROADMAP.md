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

## 🔜 Version 0.2: mobile and polish (remaining)

- [ ] Phone testing: button sizes, safe areas (notch), fullscreen on the first tap
- [ ] **Voice prompts** in three languages (recorded files: "Stop!", "Bus stop!", "Well done!")
- [ ] Parent settings (behind a "hold for 3 seconds" gate): difficulty, reset progress
- [ ] Animated passengers (walking, waving), a speech bubble with an icon of where they're going

## 🚀 Version 0.3: more gameplay

- [ ] **Pedestrian crossing**: a pedestrian walks across, you must let them pass (+points)
- [ ] **STOP sign**, "children" sign, speed bumps
- [ ] Other cars on the road (keep your distance)
- [ ] Day / evening / night (turn on the headlights!), rain (wipers)
- [ ] Different routes: city, village, seaside, mountains
- [ ] Passengers with a destination: "take me to the park", where the child picks the right stop

## 🎨 Version 0.4: garage and rewards

- [ ] Points unlock new parts: trolleybus, double-decker with an open roof, spoilers, horns, flags
- [ ] Sticker album / achievements ("10 stops without mistakes")
- [ ] Bus photo: save a picture of your bus

## 🛠 Technical

- [ ] E2E tests (Playwright): smoke test "menu → factory → route → result"
- [ ] CI: build + tests on every push, deploy to GitHub Pages
- [ ] Move to a separate repository
- [ ] Optional: artist illustrations instead of procedural graphics (`BusView` and `ui/textures.ts` can be swapped for sprites without touching the logic)
