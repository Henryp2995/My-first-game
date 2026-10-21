# Sprite board brief: remaining 7 fighters

Use this when creating showcase boards (like `goku-reference.png` and `gundam-reference.png`) for the
remaining fighters. Each board gets turned into game sprites with:

```bash
npm run sprites:extract -- assets/references/<fighter>-board.json
npm run sprites:pack -- <fighter> --height=<px>
```

Save each board as `assets/references/<fighter>-reference.png` using these ids: `gnw`, `luigi`, `sheik`,
`spiderman`, `batman`, `naruto`, `vader`.

## Rules that make extraction clean

These are lessons from the Goku and Gundam boards:

1. **Same board style:** dark navy panel backgrounds (like the first two boards), with a white panel label above each row.
2. **Bigger figures:** aim for **≥120 px tall** per frame. Goku and Gundam were about 80 px, which is why they look chunky in game.
   A 2048×1365 board, or one board per few animations, helps.
3. **Space between frames:** leave a clear gap (≥ 6 px) between frames. Figures, weapons and effects must **not overlap or touch**
   the next frame. That was the main cleanup problem on the Gundam board.
4. **Labels clear of art:** no antenna, hair or trail should reach up into the label line.
5. **Consistent framing:** every frame **faces right**, at the **same scale**, with feet on the same baseline.
   Show the full body (nothing cut off by the panel edge).
6. **Effects:** effects that belong to the character pose are fine (slash trails, aura, thrusters, dust).
   **Projectiles are drawn by the game**, so leave out long beams and flying objects (web shot, batarang, energy beams).
   Showing just the firing pose is fine.
7. **Include every panel below**, especially **Landing** and **Victory**, which the first two boards lacked.

## Panels every board needs

| Panel | Frames |
|---|---|
| Idle | 4–6 |
| Run | 4–6 |
| Jump / airborne (takeoff, rising, peak, falling) | 4 |
| Landing | 2–3 |
| Light attack | 4–6 |
| Heavy attack | 3–5 |
| Special | 3–5 |
| Air attack | 3 |
| Dodge / roll | 3 |
| Hit / damage (flinch, knocked back) | 2 |
| Knockout | 2–3 |
| Victory pose | 2–4 |

## Per-fighter moves (match these so the art fits the gameplay)

| Fighter | Light | Heavy | Special | Air attack | Look / notes |
|---|---|---|---|---|---|
| **Mr. Game & Watch** (`gnw`) | Pump Jab (quick forward jab) | Hammer Swing (overhead hammer) | **Judge**: swings a sign showing a number | **Key Drop**: plunges straight down holding a key below him | Flat **black** LCD silhouette, choppy poses. Black on the dark board is fine; keep a thin gap around him. |
| **Luigi** (`luigi`) | One-Two Punch (2 jabs) | Power Uppercut (rising fist) | **Green Rocket**: crouch charge → flies horizontally headfirst | Down Kick | Tall, lanky, goofy; green cap and shirt, blue overalls, mustache. |
| **Sheik** (`sheik`) | Needle Flurry (3 rapid strikes) | Spinning Kick | **Vanish**: smoke burst disappear → reappear | Diagonal Kick (forward-down) | Blue ninja suit, face wrap, wrapped arms and legs, blond braid. |
| **Spider-Man** (`spiderman`) | Web-Slinger Jabs (3 hits) | Spinning Spider Kick | **Web Shot** pose (wrist forward); optional extra frame: **web-zip** pulling upward | Web-Dive Kick (downward) | Red and blue suit, big white lenses, low acrobatic crouch. |
| **Batman** (`batman`) | Martial Arts Combo (2 hits) | Cape Strike | **Batarang** throw pose | Cape Dive (downward) | Heavy armored build, pointed cowl, flowing cape, utility belt. |
| **Naruto** (`naruto`) | Taijutsu Barrage (4 hits) | Whirlwind Kick | **Rasengan**: shadow clone forms the orb → lunge (orb on hand is fine) | Ninja Dive Strike | Orange jumpsuit, headband, spiky blond hair. |
| **Darth Vader** (`vader`) | Lightsaber Slashes (2) | Saber Cleave (overhead) | **Force Choke**: arm extended, hand raised | Dark Saber Spin (aerial) | Black armor, helmet, cape, red lightsaber; slow and heavy poses. |

## In-game sizes (for `--height`)

| Fighter | Hurtbox | Suggested `--height` |
|---|---|---|
| Mr. Game & Watch | 36×70 | 86 |
| Luigi | 40×84 | 104 |
| Sheik | 36×80 | 98 |
| Spider-Man | 34×78 | 96 |
| Batman | 44×88 | 108 |
| Naruto | 36×76 | 94 |
| Darth Vader | 44×92 | 112 |
