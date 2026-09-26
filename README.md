# Silly Park 🐶🐐🐷🐑

A Goat Simulator–style physics sandbox made for **young kids (around 5 years old)**, with local co-op for up to **4 players**.
You play a dog, goat, pig or sheep in a small, busy park. You can headbutt things, grab and drag them with a sticky tongue,
flop over like a ragdoll, bounce on trampolines and fly off launch pads.

Kids never need to read. Everything is shown with pictures, colours and sounds, and nothing can go wrong: no timers, no
losing, no game over.

## Playing

Press **any button** on a controller (or any key, or tap ▶) to start. Every extra controller joins by pressing any button,
so friends can drop in and out at any time. All players share one camera that zooms out to keep everyone on screen.

| | Controller | Keyboard P1 | Keyboard P2 | Touch |
|---|---|---|---|---|
| Move | Left stick or D-pad | `W A S D` | Arrow keys | Drag anywhere on the left half |
| ⬆️ Jump (press again in the air to flip) | **A** / ✕ (bottom) | `Space` or `K` | `Enter` / `Num 0` | Green button |
| 💥 Headbutt | **B** / ◯ (right) | `E` or `L` | `Right Shift` / `Num 2` | Red button |
| 👅 Lick & grab, press again to throw | **X** / ▢ (left) | `Q` or `J` | `Right Ctrl` / `Num 1` | Blue button |
| 📣 Animal noise | **Y** / △ (top) | `R` or `I` | `/` / `Num 3` | Yellow button |
| 🌀 Flop (ragdoll, steer by rolling) | Any bumper or trigger | `F`, `U` or `O` | `.` | Purple button |
| 🔄 Change animal | Back / Select / View | `1` or `C` | `,` | Tap your badge (top left) |
| 🎩 Change hat | Start / Menu / Options | `2` or `X` | `M` | Pink button |

`Esc` or the ⚙️ button opens a small grown-ups menu: sound, music, volume, tidy up the park, full screen, back to the
start screen, and a picture of all controls.

## Things to discover

- **Trampolines** you walk onto: hold jump while landing for an extra-big bounce.
- **Launch pads** with glowing arrows that fling you to the island, onto the barn roof, or up the hill.
- **8 golden stars**, each marked by a beam of light: on the island, on the barn roof, in the mud, above a trampoline,
  in the soccer goal, on top of the crate tower, on the hill and in the hedge maze. When all 8 are found there is a big
  party, and then the stars come back.
- **The party meter** (top of the screen) fills up with every silly thing you do. When it is full, confetti rains down,
  fireworks go off and everybody gets a new hat.
- Headbutt **trees** to make apples fall, and lick an **apple** to eat it. Headbutt **watermelons** to splat them.
- **Chickens** run away, squawk and tumble when you bonk them, and walk around dizzy afterwards.
- **Mud** makes you muddy. Swim in the **pond** to wash it off.
- The **present box** gives you a random hat. The **big red button** puts the whole park back the way it was.
- **Soccer goal**, **bowling lane** with bumpers, a **crate tower** to knock over, beach balls and rubber ducks.
- When two friends make their animal noise together, hearts appear.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # type-check
npm run build
```

Built with React 19, [react-three-fiber](https://github.com/pmndrs/react-three-fiber),
[Rapier](https://rapier.rs/) physics (`@react-three/rapier`) and Zustand. All models, textures, sounds and music are
generated in code, so there are no assets to download and it runs offline.

```
src/
  App.tsx               canvas + overlay UI, audio unlock, title-screen keyboard start
  game/
    config.ts           tuning: speeds, party points, players, species, hats
    layout.ts           where everything in the park lives
    input.ts            keyboard (2 players), up to 4 gamepads, touch; drop-in join detection
    store.ts            reactive state for UI: players, party meter, stars, menu
    runtime.ts          non-reactive per-frame registry (players, props, statics, camera)
    audio.ts, music.ts  synthesised sound effects and background music (Web Audio)
    fx.ts, FxRenderer   pooled particles (instanced) and shockwave rings
    Scene.tsx           lights, sky, shared camera, input loop, party director
    player/             animal controller (Player.tsx), models, hats
    world/              park, props, playthings (trampolines, pads, stars...), games, chickens
  ui/                   HUD, title screen, touch controls, grown-ups menu (icons only)
```

### Design rules

1. **No reading required.** The UI uses icons, colours and animation. Controller hints show the button position
   (bottom, right, left, top) and colour, which matches Xbox, PlayStation and Switch-style pads.
2. **Every button always does something visible and audible**, even when nothing is in range (the tongue still
   comes out, the headbutt still dashes).
3. **No failure states.** Nothing is timed and nothing is lost. If you fall out of the world you pop back in.
4. **Co-op first.** Drop-in with any button, one shared camera with a gentle pull that keeps friends together, and shared
   goals (stars, party meter) with nothing competitive.
5. **Performance on tablets.** Per-frame state lives in `runtime.ts`, not in React state. Particles are instanced and
   materials are shared Lambert materials.
