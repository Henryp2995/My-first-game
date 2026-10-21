# Arena Rush

A browser-based 2D platform fighter: percentage damage, knockback, three stocks, and a five-minute timer. Play **you vs a CPU opponent** locally, with four CPU difficulty levels.

> **Unofficial, noncommercial fan project.** Not affiliated with or endorsed by Nintendo. The fighters are inspired by Mr. Game & Watch, Luigi and Sheik. All of their art is drawn procedurally at runtime and all sound is synthesized, so the project contains no ripped sprites, audio, logos or proprietary code.

**Status:** Phases 1–2 are done, so Player vs CPU is playable locally. Online multiplayer (each friend on their own computer) comes in Phase 3 (see [Roadmap](#roadmap)).

---

## Quick start

Requirements: **Node.js 20+** (developed with Node 22 LTS) and npm 10+.

```bash
npm install        # install all workspaces
npm run dev        # start the game at http://localhost:5173
```

Open **http://localhost:5173** and choose **PLAYER VS CPU**. Character select has three steps:

1. Pick **your** fighter (A / D, then F).
2. Pick the **CPU's** fighter.
3. Pick the **CPU difficulty**: Easy, Normal, Hard or Expert.

G goes back a step, Esc returns to the menu, and the mouse works on every step.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm test` | Vitest gameplay tests (shared simulation) |
| `npm run typecheck` | TypeScript checks for every workspace |
| `npm run build` | Production build → `apps/client/dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | typecheck + test + build |
| `npm run sim` | Run a complete CPU-vs-CPU match headlessly in Node (no browser). Optional args: `npm run sim -- luigi sheik easy expert` |

Dev tool: open `http://localhost:5173/?gallery` to see every fighter in every pose, which helps with art work.

## Controls

You are always Player 1 (red **P1** tag). The CPU is always Player 2 (gray **CPU** tag).

| Action | Key |
|---|---|
| Move | A / D |
| Jump / double jump | W |
| Drop through platform / fast fall | S |
| Light attack (in the air: aerial) | F |
| Heavy attack | G |
| Special | H |
| Dodge | Left Shift |

Global keys: **Esc** pauses (R restarts, Q quits), **M** toggles sound, **`** (backtick) shows hitboxes and hurtboxes.

Tips:
- Tap jump for a short hop and hold it for a full jump.
- Directional specials take the held direction. For example, Sheik's Vanish teleports up when you hold ↑ / W.
- Hold Luigi's special to charge the rocket, then release to launch it. About 1 in 8 rockets misfire.
- G&W's Judge rolls 1–9. A 1 hurts G&W himself, a 7 heals him, and a 9 is a near-certain KO.
- If you get close to the stage lip while recovering, you snap onto it automatically.

## CPU opponent

The CPU (`packages/shared/src/cpu.ts`) reads the match state and returns an ordinary `InputFrame`, the same thing the keyboard produces. It goes through the same input pipeline and the same combat rules as a human player, with no cheating on positions or damage.

What it does:
- **Approach and space:** closes in, keeps its distance, and backs off.
- **Attack:** picks moves whose real hitboxes would reach you. It uses quick attacks to build damage and saves heavies for when you're at KO percent.
- **Play the stage:** jumps after you onto platforms and drops through them.
- **Defend:** dodges attacks it sees coming.
- **Recover:** after knockback it drifts toward the stage, double-jumps, then uses a recovery move: Luigi's rising uppercut or rocket, Sheik's upward Vanish, or an air dodge.
- **Avoid self-KOs:** it won't run off ledges or use Key Drop offstage.

| Difficulty | Reaction delay | Behavior |
|---|---|---|
| Easy | ~0.4 s | Hesitates, attacks rarely, often botches recovery |
| Normal | ~0.25 s | A fair fight, dodges sometimes |
| Hard | ~0.15 s | Aggressive, finishes with heavies, always recovers |
| Expert | ~0.07 s | Near-instant reactions, dodges most attacks |

To keep it fair, every CPU caps how many quick attacks it chains into a stunned player before backing off, so you always get a breather. Each level beats the one below it in most matchups; the tests check this.

> Some keyboards can't register many keys at once ("ghosting"). If a key stops responding while several others are held, that's the hardware.

## Fighters

| | Mr. Game & Watch | Luigi | Sheik |
|---|---|---|---|
| Speed | High | Medium | Very High |
| Power | Medium | High | Low |
| Jump | Medium | Very High | High |
| Weight | Light (75) | Medium (100) | Light (82) |
| Difficulty | Medium | Easy | Hard |
| Light | Pump Jab (5%) | One-Two Punch (3+4%) | Needle Flurry (2+2+3%) |
| Heavy | Hammer Swing (14%) | Power Uppercut (15%; in the air it rises, which helps recovery) | Spinning Kick (11%, hits both sides) |
| Special | Judge (random 1–9) | Green Rocket (charge, misfire chance) | Vanish (directional teleport + burst) |
| Aerial | Key Drop (plunges down, spikes) | Down Kick (spike) | Diagonal Kick |

When you and the CPU pick the same fighter, the CPU wears an alternate costume.

## Project structure

```
arena-rush/
├── apps/
│   ├── client/               Phaser 3 + Vite browser game
│   │   └── src/
│   │       ├── scenes/       Boot, Menu, Select, Battle, Results, Online (placeholder), Gallery (dev)
│   │       ├── render/       Pose/skeleton animation, procedural fighter art, stage, VFX
│   │       ├── input/        InputSource interface: keyboard (P1) and CPU sources
│   │       ├── audio/        Web Audio synthesized SFX + mute
│   │       ├── ui/           Menu widgets
│   │       └── net/          Phase 3 online session contract (types only)
│   └── server/               Node app; currently a headless CPU-vs-CPU simulation runner
├── packages/
│   └── shared/               Phaser-free game logic (runs in browser and Node)
│       ├── src/
│       │   ├── config.ts     Rules and balance knobs (stocks, timer, dodge, hitstun, …)
│       │   ├── fighters.ts   Fighter stats and movesets as data
│       │   ├── stage.ts      Skyfall Arena platforms, blast zones, spawns
│       │   ├── combat.ts     Knockback, hitstun, hitstop, hit/hurt boxes
│       │   ├── match.ts      The 60 Hz simulation: stepMatch(state, inputs) → events
│       │   ├── input.ts      InputFrame + compact network encoding
│       │   ├── cpu.ts        CPU opponent (state in → InputFrame out), 4 difficulty profiles
│       │   └── rng.ts        Deterministic seeded RNG
│       └── test/             Vitest suites
└── package.json              npm workspaces
```

### Architecture

- **The simulation is deterministic and has no knowledge of rendering.** `stepMatch(state, inputs)` advances the match by one 1/60 s frame and returns events such as `hit`, `ko`, `jump` and `matchEnd`. Its only input is one `InputFrame` (button states) per player, and all randomness (Judge, rocket misfires) comes from a seeded RNG stored in the state. Given the same seed and the same inputs, it always produces the same match, which a test verifies.
- **Rendering only reads.** The client drives the sim with a fixed-timestep accumulator and draws `MatchState`. Effects, sounds and camera shake react to the events. Fighters are drawn from a pose/skeleton system (`render/pose.ts` → `render/art.ts`), so real sprites can replace `drawFighter` later without touching gameplay.
- **Fighters are data.** Every move is a `MoveDef` with startup/active/recovery frames, hitboxes (damage, base knockback, growth, angle), cooldown, landing lag and an optional behavior (`judge`, `rocket`, `vanish`). One combat engine runs all three fighters. To rebalance, edit `packages/shared/src/fighters.ts` and `config.ts`.
- **Every fighter is driven by an `InputSource`.** `MatchSetup.players` is a list of slots: `{ fighter, control: 'human' }` or `{ fighter, control: 'cpu', difficulty }`. The battle scene creates a `KeyboardInputSource` (P1 keys) or a `CpuInputSource` for each slot. The simulation itself has no idea who is human.
- **The client is ready for networking.** Clients only produce inputs, and `encodeInput` packs an input frame into 9 bits. In Phase 3 a `'remote'` slot type and a network `InputSource` get added, and the server runs the same `stepMatch` (and `CpuController`, for bots) inside a Colyseus room.

### Knockback model

`launchSpeed = (base + growth × percentAfterHit × (0.5 + damage/20)) × 2 / (1 + weight/100)`

A launch is stored as a separate knockback velocity that decays linearly (`knockbackDecay`) while gravity keeps acting on the fighter. Hitstun scales with launch speed, and hitstop scales with damage. Roughly where heavies KO a medium-weight fighter from mid-stage: G&W hammer about 125%, Luigi uppercut about 115%, Sheik spin kick about 185% (about 140% near the ledge).

## Testing

`npm test` runs 64 Vitest tests against the shared simulation. They cover:

- movement, acceleration, traction differences, gravity and landing
- one-way platforms (jumping through and dropping through)
- jump limits, double jump, short hop vs full jump, coyote time, jump buffering
- character stats and the balance table, damage ranges for lights and heavies
- hit detection (range, facing, multi-hit groups, startup frames, aerials)
- attack cooldowns and recovery lockout
- damage, knockback scaling, weight, hitstun and hitstop
- each special (Judge determinism and outcomes, rocket charge, vanish teleport)
- dodge invulnerability (0.25 s) and dodge cooldown (1.5 s)
- stock loss, KO credit, respawn, the respawn-platform timeout, elimination
- winner detection (by stocks, on time by stocks and then damage, draws)
- the countdown, determinism, and input encoding
- the CPU: produces only InputFrames, approaches, releases buttons between presses, damages a player at every difficulty, each difficulty beats the one below, recovers to the stage for every fighter, finishes full matches, and caps jab strings

## Roadmap

- **Phase 3, online play:** a Colyseus server that runs `stepMatch` authoritatively at 60 Hz, private rooms with join codes, names, online character select, ready-up, input sync, disconnect handling, and rematches. The contract is sketched in `apps/client/src/net/types.ts`.
- **Phase 4, polish:** better sprites and animation, balance passes, music, gamepad support.
- **Phase 5, deployment:** a static host for the client and a WebSocket-capable host for the server.

## Known limitations (MVP)

- Local play is one human vs one CPU. The sim supports up to four fighters, and online play will use them.
- There is no ledge-grab state. Recovering close to the lip snaps you onto the stage instead.
- There is no shielding or grabbing; dodging is the only defensive option.
- There is no gamepad support yet.
- The art is procedural placeholder art, designed to be replaced.
