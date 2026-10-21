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

Open **http://localhost:5173** and choose **PLAYER VS CPU**:

1. Pick **your** fighter from all nine (A / D, then F).
2. Pick the **CPU's** fighter from the same roster. Mirror matches are allowed, and the CPU wears an alternate costume.
3. Pick the **CPU difficulty**: Easy, Normal, Hard or Expert.
4. Pick a **stage**: Skyfall Arena, Corneria or Final Destination. Then press **FIGHT!**

G goes back a step, Esc returns to the menu, and the mouse works on every screen. After a match you can **Rematch** (same fighters, difficulty and stage) or go back to **Character Select**.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm test` | Vitest gameplay tests (shared simulation) |
| `npm run typecheck` | TypeScript checks for every workspace |
| `npm run build` | Production build → `apps/client/dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | typecheck + test + build |
| `npm run sim` | Run a complete CPU-vs-CPU match headlessly in Node (no browser). Optional args: `npm run sim -- goku batman hard expert corneria` |

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

Nine fighters. All of them are available to both you and the CPU.

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

| | Spider-Man | Batman | Naruto | Goku |
|---|---|---|---|---|
| Identity | Aerial mobility, web control | Heavyweight tactician | Fast close-range combos | Strong strikes, energy attacks |
| Weight | Light (85) | Heavy (125) | Medium (95) | Medium-heavy (108) |
| Movement | Best air speed and double jump | Slow, short jumps | Fast runner | Medium-high speed |
| Light | Web-Slinger Jabs (2+2+3%) | Martial Arts Combo (3+4%) | Taijutsu Barrage (2+1+1+3%) | Rapid Punches (2+2+3%) |
| Heavy | Spinning Spider Kick (11%, both sides) | Cape Strike (15%) | Whirlwind Kick (12%, both sides) | Charged Strike (14%; hold to charge, up to 20%) |
| Special | **Web Shot**: a projectile that restrains for ~0.6 s. In the air, special + ↑ **web-zips** upward | **Batarang**: a boomerang that flies out and returns | **Rasengan**: a shadow clone forms it, then it dashes in, grinds 4 hits, and blasts (14%) | **Kamehameha**: hold to charge (10–19%), a piercing beam, 4 s cooldown |
| Aerial | Web-Dive Kick (spike) | Cape Dive (spike) | Ninja Dive Strike (spike) | Energy Kick (spike) |

| | Gundam RX-78 | Darth Vader |
|---|---|---|
| Identity | Heaviest fighter, thruster mobility | Slow, relentless, hits hardest |
| Weight | Heavy (132, the heaviest) | Heavy (120) |
| Movement | **Three jumps** (thruster boosts), low jumps, slow acceleration | The slowest walker, short jumps |
| Light | Beam Saber Slashes (4+3%) | Lightsaber Slashes (3+4%) |
| Heavy | Overhead Saber (15%, tall arc) | Saber Cleave (15%, strongest knockback) |
| Special | **Beam Rifle**: a fast shot (8%), 1.25 s cooldown | **Force Choke**: lifts and holds a foe in midair for ~0.8 s (6%), opening a follow-up; 2.5 s cooldown |
| Aerial | Saber Plunge (spike) | Dark Saber Spin (spike, hits both sides) |

When you and the CPU pick the same fighter, the CPU wears an alternate costume.

## Stages

| Stage | Layout |
|---|---|
| **Skyfall Arena** | Floating island with two soft platforms (the original stage) |
| **Corneria** | A long carrier above planet Corneria. The sky is painted art cropped from the stage concept board (`assets/references/corneria-reference.png`, using `tools/stages/crop-backdrop.mjs`). The ship is drawn in code in the board's style. The deck steps down at the nose and up at the rear deck; there's a soft platform on a sensor mast and one on the tail fin. No hazards. |
| **Final Destination** | One wide, flat, symmetrical platform in deep space. No platforms, no hazards. |

Stages are pure data (`packages/shared/src/stage.ts`). Each one defines:
- its id, name and description
- a render `theme`
- its collision platforms (solid or one-way)
- spawn and respawn points
- its blast zone
- camera bounds
- a reserved `hazards` list

Corneria's slopes are built from flat stepped surfaces: the steps are 40 px, and fighters walk up them automatically. Adding a stage means adding one `StageDef` (plus, optionally, its art in `render/backdrop.ts`).

## Project structure

```
arena-rush/
├── apps/
│   ├── client/               Phaser 3 + Vite browser game
│   │   └── src/
│   │       ├── scenes/       Boot, Menu, Select, StageSelect, Battle, Results, Online (placeholder), Gallery (dev)
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
│       │   ├── stage.ts      Data-driven stages (Skyfall, Corneria, Final Destination) + geometry helpers
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
- **Fighters are data.** Every move is a `MoveDef` with:
  - startup, active and recovery frames
  - hitboxes (damage, base knockback, growth, angle, an optional fixed `stunFrames`, and `restrain: 'web' | 'force'`)
  - cooldown and landing lag
  - an optional `charge`
  - an optional behavior: `judge`, `rocket`, `vanish`, or `projectile` (with `returnAfter` for boomerangs, `piercing` for beams, and `airUpZip` for the web-zip)

  One combat engine runs all nine fighters. To rebalance, edit `packages/shared/src/fighters.ts` and `config.ts`.
- **Projectiles live in the shared sim.** `MatchState.projectiles` is plain, serializable data. Projectiles use the same hurtbox overlap test, intangibility rules, knockback, hitstun and combo logic as melee hitboxes. They never hit their owner, they hit each target at most once, and webs and batarangs break on solid ground.
- **Every fighter is driven by an `InputSource`.** `MatchSetup.players` is a list of slots: `{ fighter, control: 'human' }` or `{ fighter, control: 'cpu', difficulty }`. The battle scene creates a `KeyboardInputSource` (P1 keys) or a `CpuInputSource` for each slot. The simulation itself has no idea who is human.
- **The client is ready for networking.** Clients only produce inputs, and `encodeInput` packs an input frame into 9 bits. In Phase 3 a `'remote'` slot type and a network `InputSource` get added, and the server runs the same `stepMatch` (and `CpuController`, for bots) inside a Colyseus room.

### Animation and character art

All of this is client-only and visual. The simulation never reads it, and a test checks that match results are identical with or without animation running.

- **`apps/client/src/anim/`** is a Phaser-free animation layer, unit-tested under Vitest:
  - `states.ts` defines 17 animation states: idle, walk, run, jumpStart, rise, fall, land, light, heavy, special, aerial, dodge, hit, knockback, ko, respawn and victory. Each state has a **priority** and a **transition time**. Event-driven states (jump startup, landing, KO) only show when nothing more important is playing.
  - `profiles.ts` holds each fighter's movement personality as data: stance, breathing, walk and run gait (cadence, stride, knee lift, arm style), jump style (flip, tuck or thruster), squash strength, heft, LCD stepping (G&W) and rigid servo joints (Gundam).
  - `clips.ts` holds data-driven attack clips (windup, strike, follow-through and multi-hit beats). **Timing comes from each move's real frame data:** anticipation fills startup, the strike pose lands on the first active frame, multi-hit beats land on each hitbox group's first frame, and follow-through plays in recovery. Heavier fighters reach their windup sooner and hold it longer.
  - `controller.ts` turns `FighterState` plus `GameEvent`s into an `AnimFrame` each tick. It handles cross-fades, spring squash and stretch, and spring-driven capes and hair. `sampleStateFrame()` renders any state with no match running (menus, gallery, sprite baking).
- **`apps/client/src/render/characters/`** is the renderer abstraction. `createCharacterRenderer()` picks:
  1. **Sprite atlas** frames, if real artwork is registered in `manifest.ts` and loaded. Frames are named `<state>_<n>`. Looping states use fps; attacks map onto the move's real progress.
  2. **Baked sprites** with `?sprites=baked`. The procedural animation is rendered into an in-memory atlas to exercise the sprite pipeline end to end.
  3. **Procedural vector art** (`render/art.ts`), the default today.
- **Procedural art:**
  - Each fighter has a per-fighter body plan (chest, waist and hip widths; limb tapers; boxy armor for Gundam; a flat LCD silhouette for G&W).
  - Limbs are tapered and cel-shaded with rim highlights, torsos are shaped, and every fighter has a neck and shaped feet.
  - Squash and stretch, plus cape and hair secondary motion.
  - Swing trails on active frames, Gundam's thruster flames, and the existing per-move effects.
- **Dev gallery:** `?gallery` shows every fighter in key states; `?gallery=<fighterId>` shows one fighter in all 17 states.
- **Artwork still needed:** see `apps/client/public/assets/fighters/README.md` for the atlas format, frame list and sizes.

### Combat physics

All gameplay values shared by every fighter live in `packages/shared/src/config.ts` (`DEFAULT_RULES`). Per-character values (speeds, gravity, jumps, traction, weight, moves) live in `fighters.ts`.

**Knockback** is smooth (linear in percent, with no thresholds):

`launchSpeed = (base + growth × percentAfterHit × (damageFactorBase + damage × damageFactorPerDamage)) × (1 + refWeight/100) / (1 + weight/100) × scale`

The knobs are `combat.knockback.{scale, damageFactorBase, damageFactorPerDamage, referenceWeight}`, plus each hitbox's `baseKnockback`, `knockbackGrowth`, `angle` and `hitstunMultiplier`.

- **Launch direction:** the hitbox angle is measured from the attacker's facing; 90° is up and negative angles spike downward. Spinning moves (`autoDirection`) launch away from the attacker on either side. A spike on a grounded fighter pops them up instead.
- **Momentum:** the launch is stored as its own velocity and decays linearly (`knockbackDecay`) while gravity keeps acting, so fighters arc naturally. They can steer a little during hitstun (`hitstunDriftSpeed/Accel`). Fast spikes bounce off the floor (`groundBounceSpeed`).
- **Hitstun:** `launchSpeed × hitstunPerSpeed`, clamped to `[minHitstun, maxHitstun]`. Each consecutive hit in a combo multiplies it by `comboHitstunDecay` (floor `comboHitstunFloor`), and the combo resets after `comboResetFrames` free frames, so no jab string can lock a player. Landing caps the remaining hitstun at `hitstunLandingCap`.
- **Hitstop:** `hitstopBase + damage × hitstopPerDamage`, clamped to `[hitstopMin, hitstopMax]`. That gives 2–3 frames for lights, 5–6 for heavies, and up to 9 for big specials. Only the attacker and the victim freeze; everything else keeps running.
- **Recovery:** a double jump, one air dodge per airtime (`dodge.airDodgesPerAirtime`), and character recovery moves (Luigi's rising uppercut and rocket, Sheik's directional Vanish). Getting hit refunds these, but never beyond the normal amount.

Approximate KO percents against a medium-weight fighter:

| Heavy | from mid-stage | from the ledge |
|---|---|---|
| G&W Hammer | ~125% | ~95% |
| Luigi Uppercut | ~115% | ~115% |
| Sheik Spin Kick | ~185% | ~140% |

The lightweight G&W dies about 20–30% earlier. Light attacks never KO on their own.

## Testing

`npm test` runs 212 Vitest tests (shared simulation + client animation layer). They cover:

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
- combat physics: smooth knockback, weight, launch angles (mirrored when facing left, auto-direction, spikes), momentum decay under gravity, hitstun scaling, the hitstun lockout and recovery, landing cap, combo decay against perfect jab-mashing, hitstop ranges and timing, air control, fast fall, one air dodge per airtime, no jump refresh from walls, hitbox windows, single-hit registration, trades, recovery-frame cutoff, invulnerability, aerial tracking, all four blast zones, respawn
- the crossover expansion: the nine-fighter roster and identities (including Gundam's triple jump and Beam Rifle, and Vader's Force Choke hold and follow-up), each new special (web restrain, web-zip, batarang return, Rasengan multi-hit, Kamehameha charge/pierce/cooldown, charged strike), projectile rules (intangibility, ground, blast zone), geometry, spawns, respawns, landing and blast zones on all three stages, walking Corneria's steps both ways, and the CPU navigating, attacking and recovering with every fighter on every stage
- the CPU: produces only InputFrames, approaches, releases buttons between presses, damages a player at every difficulty, each difficulty beats the one below, recovers to the stage for every fighter, finishes full matches, caps jab strings, aims Vanish through its startup, uses the uppercut to recover, respects the air-dodge limit, and steers toward the stage during hitstun

## Roadmap

- **Phase 3, online play:** a Colyseus server that runs `stepMatch` authoritatively at 60 Hz, private rooms with join codes, names, online character select, ready-up, input sync, disconnect handling, and rematches. The contract is sketched in `apps/client/src/net/types.ts`.
- **Phase 4, polish:** better sprites and animation, balance passes, music, gamepad support.
- **Phase 5, deployment:** a static host for the client and a WebSocket-capable host for the server.

## Known limitations (MVP)

- Local play is one human vs one CPU. The sim supports up to four fighters, and online play will use them.
- Stages have no hazards yet (the `hazards` field is reserved). Corneria approximates slopes with steps.
- CPU-vs-CPU win rates on Hard: the six crossover fighters sit at about 43–56%. Among the originals, Sheik (~90%) and Mr. Game & Watch (~10%) are outliers. That spread predates the expansion; I left the original movesets untouched and reported it instead.
- There is no ledge-grab state. Recovering close to the lip snaps you onto the stage instead.
- There is no shielding or grabbing; dodging is the only defensive option.
- There is no gamepad support yet.
- **Character art is procedural placeholder art, not finished illustrated sprites.** The animation system and sprite pipeline are in place. Illustrated atlases for all nine fighters are still needed (see `apps/client/public/assets/fighters/README.md`).
