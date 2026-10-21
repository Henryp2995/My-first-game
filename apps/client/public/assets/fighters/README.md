# Fighter sprite artwork

| Fighter | Art |
|---|---|
| **Goku** | **Illustrated sprites** (43 frames), extracted from `assets/references/goku-reference.png` |
| **Gundam RX-78** | **Illustrated sprites** (33 frames), extracted from `assets/references/gundam-reference.png` |
| Everyone else | Procedural placeholder art (`src/render/art.ts`) |

A fighter switches to sprites as soon as its atlas exists and has an entry in
`src/render/characters/sprites.generated.json`. No combat code changes are needed.

## Workflow

**From separate frame PNGs** (from an artist or an image tool), drawn facing right on transparent backgrounds:

```bash
# put frames in assets/sprites/<fighter>/frames/<state>_<n>.png, then:
npm run sprites:pack -- <fighter> --height=100
```

**From a showcase board** (a sheet of frames on a dark panel background), like Goku's:

```bash
# describe the panels in a JSON config (see assets/references/goku-board.json), then:
npm run sprites:extract -- assets/references/goku-board.json
npm run sprites:pack -- goku --height=100
```

`pack` aligns every frame on the feet and torso so nothing jitters. It fills missing states from
similar ones (walk ← run, victory ← idle, …) and writes the atlas plus the manifest entry.
`--height` is how tall the idle pose appears in the game, in world px.

## Format

One Phaser **texture atlas** per fighter (and optionally one per alternate costume):

```
public/assets/fighters/<fighterId>/<fighterId>.png    # packed sheet
public/assets/fighters/<fighterId>/<fighterId>.json   # Phaser "JSON Hash" atlas (TexturePacker / free-tex-packer)
```

Frame names are `<state>_<index>`, for example `idle_0` … `idle_7` or `heavy_0` … `heavy_11`.

| State | Loop? | Recommended frames | Notes |
|---|---|---|---|
| idle | loop | 8 | breathing / stance |
| walk | loop | 8 | |
| run | loop | 8 | |
| jumpStart | once | 2 | crouch → launch |
| rise | loop | 2 | |
| fall | loop | 2 | |
| land | once | 3 | squash |
| light | once | 8 | stretched over the move's real frames (startup → active → recovery) |
| heavy | once | 12 | same |
| special | once | 12 | same |
| aerial | once | 8 | same |
| dodge | once | 4 | |
| hit | once | 2 | flinch |
| knockback | loop | 4 | tumble |
| ko | once | 4 | |
| respawn | loop | 1 | |
| victory | loop | 12 | results screen |

Attack sheets are **not** timed by fps. The renderer maps their frames onto the move's actual
startup/active/recovery progress, so the impact frame should sit at the point where the move becomes active:

| Fighter | Move | Startup / active / recovery (frames @60 Hz) |
|---|---|---|
| see `packages/shared/src/fighters.ts` | every `MoveDef` | `startup`, `active`, `recovery` |

## Drawing guidelines

- **Anchor:** feet at bottom-center by default (`anchorX: 0.5, anchorY: 1`). Set the actual values in the manifest.
- **Facing:** draw facing **right**. The renderer mirrors frames for left.
- **Size:** about 1 texture px per world px at `scale: 1`. Hurtboxes are fixed in gameplay data:
  - G&W: 36×70
  - Luigi: 40×84
  - Sheik: 36×80
  - Spider-Man: 34×78
  - Batman: 44×88
  - Naruto: 36×76
  - Goku: 38×82
  - Gundam: 46×92
  - Vader: 44×92

  Art can extend past the hurtbox (capes, weapons, hair), but keep the body inside it so hits look fair.
- **Head and hand offsets:** set these in the manifest; they position effects like energy orbs and player tags.
- **Originality:** only use original or properly licensed artwork. Do not rip sprites from commercial games.

## Testing the pipeline without art

Open the game with `?sprites=baked`. Each fighter's procedural animation is rendered into an
in-memory atlas with exactly this layout and played back through the sprite renderer.
