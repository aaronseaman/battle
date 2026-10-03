# Reef Rumble — Art & Animation Hand-off (for ChatGPT)

> **Status:** P0 (23/23) and P1 (45/45) are delivered and integrated, and ship with the v3.0
> lane runner at **https://aaronseaman.github.io/battle/**. See `docs/art/P0-DELIVERY.md` and
> `docs/art/P1-DELIVERY.md`.
> **Next round (P2, 11 sprites):** the P1 fix-ups below, the three fish skins, level-2 buddies
> and the respawn bubble. The "Rules for every round" below still apply.

## v3.0: Reef Rumble is a lane runner now

The game became a swipe-to-steer lane runner (like the "pick a gate" runner ads): a school of
clownfish swims up a reef road and shoots by itself; the player only swipes left / right to
pick one of two gates, dodge, and aim. All the existing character art carries over unchanged.

- **What each sprite is used for now:**
  - `player.<skin>`: every fish in the school (drawn small, ~30–50 pt; `swim` loops).
  - `tower.<type>.<level>` (buddies): buddies that swim beside the school, and the icon on
    buddy gates.
  - `enemy.*`: critters walking down the road toward the school (`move`, `die`).
  - `boss.*` (+ `boss.chef.hat`): the end-of-level boss (`move`, `move2`, `throw`, `summon`,
    `swipe`; Sharky `windup` / `charge` / `recover`; the Queen `open`; `die`).
  - `proj.bubble` (school shots), `proj.dart` / `proj.ink` / `proj.star` (buddy shots),
    `strike.ink` / `strike.star` (boss throws), `pickup.shell` (drawn big as the clams),
    `fx.pop`, `fx.poof`, `fx.ink`, `fx.spark`, `fx.confetti`.
  - Not used by the runner (kept for later): `heart`, `boss.kitty.tentacle`, the tower status
    overlays, most other `fx.*`.
- **Camera.** Mostly top-down, from behind the school, with mild perspective: the road
  narrows a little toward the top of the screen and things up the road are drawn at about 60%
  of their near size. Sprites are never rotated; enemies are mirrored to face the school. They
  must read at ~25 pt far away and ~45 pt close up.
- **Layout & mechanics references (not art references).** The game's layout and mechanics
  follow two mobile runner ads the owner shared: "Strengthen Team" (a squad at the bottom of a
  road shooting upward, numbered barrels to shoot open, two weapon panels side by side to
  choose from) and Top War's runner mode (a nearly top-down road between scenery, an enemy
  army at the top, friendly units on numbered pedestals). Use them only for where things sit
  and how big they read. **Every visual stays Reef Rumble's own claymation reef style**; don't
  copy anything from those games' art.
- **Road and scenery are procedural** for now (sand road, coral rims, kelp/coral/rocks along
  the sides). Ideas for a later round, not requested yet: a tileable clay road texture, side
  props (kelp, coral, rocks) as sprites, clay gate frames, a proper clam with an opening anim.
- The `arena` request from v2.0 is withdrawn (removed from the manifest), as are
  `strike.drop` / `strike.spike`.

## P1 fix-ups (re-pack these frames, P2 round)

Some packed frames had the pose **cropped inside its cell** (a straight cut through the clay) or
carried **a sliver of the neighbouring pose**. The game currently plays only each row's clean
frames. Regenerate or re-pack these and restore the full frame counts:

| Sprite | Row | Problem | Now playing |
|---|---|---|---|
| `tower.fish.3` | `fire` (3), `disabled` (2), `broken` (1) | right side cropped; slivers in fire#1–2, disabled#1 | frame 0 only |
| `tower.octopus.3` | `fire` (3), `disabled` (2) | fire#1–2 and disabled#1 cropped on the right; tentacle sliver in fire#2 | frame 0 only |
| `tower.crab.3` | `fire` (3) | claw cropped; neighbour claw in fire#2 | frame 0 only |
| `enemy.eel` (P0) | `stun` (4) | frame 0 is only a tail; frames 1–2 sliced | frame 3 only |
| `enemy.urchin` (P0) | `cracked` (4) | frames 1–3 sliced | frame 0 only |
| `player.classic` (P0) | `plus` frame 1 | the Plus bubble's top is flattened at the cell edge | as is |

**Cause.** The poses were wider than their cells and got clipped during packing. Leave **≥ 8 px of
clear space around every pose** before packing. If a pose needs more room, make the whole sheet's
`frame` larger; anchors are fractions, so keep the ground point in the same place.

**Check.** If ImageMagick is available, `node tools/scan-art.mjs` flags cropped poses. Report the
fix-ups as new PNG masters plus the corrected `frames`/`col`/`fps` values for those rows.

## Rules for every round

These notes come from fitting P0 and P1 into the game at iPhone 17 size; following them avoids
another round of fixes.

1. **Start from `main`.** `assets/art/manifest.json` is the current version (v14): always edit
   the latest manifest from `main`, never an older copy (the P1 delivery was built on v8 and had
   to be merged by hand).
   - Fill in **only the entries you deliver** (this round: P2 and the fix-ups).
   - **Don't edit delivered entries' tuning.** They point at the shipped `.webp` files and carry
     in-game tuning: level-1/2 towers `scale 1.15`, level-3 towers and their overlays `1.5333`,
     heart `1.3`, bosses `4/3`, and the Chef's hat `attach`.
2. **Deliver PNG masters** in the same folder layout (`assets/art/towers/…`, `fx/…`, …).
   - I convert them to WebP for shipping and bump the version.
   - Remove temp files (no `.tmp`).
3. **Match P0 exactly.** Reuse the prompt seed in `docs/art/PROMPTS.md`. Compare against the
   shipped sheets in `assets/art/**`, the screenshots in `docs/art/reference/` and the live
   game.
4. **Level-3 towers (evolutions) are the same character, upgraded.** Same coral-cup base,
   frame `160×176`, anchor `[0.5, 0.82]`. The manifest already sets `scale 1.15` to match
   level 1. The upgrade must read at a glance: bigger, fancier, glowing, with props
   (headphones, hammer head, crown…).
5. **Shark / Hammerhead `charge` frames are the body only, with no coral base**, because the
   body lunges up at the enemies and swims back.
6. **Status overlays sit on top of a tower.** That's `fx.grab`, `fx.blind`, `fx.plus_power`
   and `fx.zapped`.
   - They use the tower's frame and anchor, and are pre-scaled `1.15`.
   - Keep the middle see-through so the tower stays recognisable, and loop them seamlessly.
7. **`fx.purr`** must cover Kraken Kitty: `352×352` at scale 1, or `264×264` with `"scale": 1.3333`
   like the boss sheet.
8. **One-shot effects** (`fx.*` with `play`): 4–8 frames, **≤ 0.5 s**, with the impact point
   at the anchor `[0.5, 0.6]`. Fade or scatter out, and no text.
9. **Minions are mini versions of their parents.**
   - `enemy.octoMini`: a tiny Chef Octopus with a mini chef hat.
   - `enemy.starMinion`: a small cartwheeling starfish, no crown.
   - `enemy.jellyMini`: a small jelly bean.
   - All use `64×64` frames and must still read at about 16 pt on screen.
10. **Projectiles.** Draw `proj.star` / `proj.ministar` upright and still; the game spins them
    (`spin`). `proj.dart` points **right**; the game rotates it to its flight direction
    (`orient`). Use no motion blur.
11. **Padding.** Every cell needs ≥ 2 px of transparent padding, and no art may touch a cell
    edge. I scan for this.
12. **Validate.** Run `node tools/check-art.mjs`.
    - If you can run a browser, also check `art-preview.html` locally.
    - If you can't, say so, and I'll review everything in-game at iPhone 17 size.
13. **Hand-back.** A zip of `assets/art/**` with `manifest.json` (version → 15) and a short
    `DELIVERY.md`, or a PR against `main`.

**You are making the graphics and animations** for *Reef Rumble: Clay Coral Defense*, an
iPhone-first PWA lane runner. The game is finished and fully playable with
placeholder shapes. The renderer already loads sprite sheets from `assets/art/` and swaps
them in **per sprite key**: every sheet you deliver replaces one placeholder, and anything
missing keeps its placeholder. So you can deliver in batches, and each batch is
immediately visible in the game.

You do **not** need to write rendering code. You deliver:

1. **PNG or WebP sprite sheets** in `assets/art/…`
2. **Edits to `assets/art/manifest.json`**: set each delivered sprite's `"file"`, and adjust
   `frame` / `anchor` / frame counts if yours differ.

Repo: `github.com/aaronseaman/battle`, branch `claude/reef-rumble-pwa`.

---

## 1. Quick start

```bash
npm start                      # http://localhost:8080  — the game
                               # http://localhost:8080/art-preview.html — every delivered sprite, animated, with anchors
node tools/check-art.mjs       # validates the manifest + sheets, prints P0/P1/P2 progress and memory use
```

| File | What it is |
|---|---|
| `assets/art/manifest.json` | **The checklist and the contract.** Every sprite key the game understands, with recommended size, anchor, animations, priority and a description. `"file": null` means not delivered yet. |
| `docs/art/reference/*.jpg` | The game on iPhone 17 (P0 + P1 art, procedural road). Use these to see what each thing is, where it sits and how big it is. |
| `art-preview.html` | Plays all delivered animations with anchor crosshairs and frame boxes, at iPhone game size, 2× or 1:1. |
| `src/render/renderer.js` | For reference only: how sprites are chosen and drawn (section 5 summarizes it). |

**Don't modify** `src/core/**` (game rules), `src/config.js` (balance) or gameplay files. If a
visual needs new data from the game, write it down (section 8) instead of changing logic.

---

## 2. Art direction

**Look.** A hand-made stop-motion diorama, like peeking into a tabletop reef.
- **Everything is glossy plasticine**: visible fingerprints, thumb dents, seams, slightly
  uneven edges, soft specular highlights. Nothing vector-clean.
- **Candy-bright palette**: turquoise water, coral pink, sunshine yellow, lime green, orange.
- **Lighting**: soft studio key light from the **top-left**, the same on every sprite, with
  gentle contact shadows. *(The game also draws a soft ellipse shadow under each character,
  so keep only a subtle contact shadow in the art.)*
- **Tilt-shift miniature feel**: a toy reef seen from above. Characters stay sharp.
- **Googly eyes on every creature, towers included.** Big white eyes, black pupils, cute and
  silly. Even villains are adorable.
- **Bold silhouettes and chunky shapes.** On iPhone each sprite shows at about ¼ of its sheet
  pixel size, so details under about 4 sheet-px disappear. Use a dark clay outline or rim
  of about 4–6 px.

**Camera.** A view from behind and above the school, looking up the road. Draw
characters in **3/4 view from slightly above**, like toys on a table, and **facing RIGHT**.
The game mirrors them when they travel left (set `"facing": "left"` if a sheet faces left).

**Motion.** 12 fps stop-motion. Bouncy and squashy, with *boil*: tiny shape and texture
differences between frames, as when a real clay puppet is re-posed. Frame-to-frame
inconsistency is a feature here, not a bug. The game adds its own 12 fps squash-and-stretch
on top (`"wobble": true`), so even 1–2 frame loops feel alive.

**Palette anchors** (match the UI and the placeholder colors):

| Use | Hex |
|---|---|
| Water top / middle / bottom | `#1c8fb0` / `#46dbd3` / `#1aa9c4` |
| Deep frame / background | `#0d5d73` |
| Sand (edge) | `#f7e2a8` (`#e2b971`) |
| Kelp | `#3fae6a`, `#2a8a52` |
| Coral sockets / heart | `#ff8fa3` / `#ff6f91` |
| Minus purple / Plus yellow | `#9b5cff` / `#ffd23f` |
| Player clownfish | `#ff8a1f` + white stripes |
| Ink | `#2a2440` |

**Characters at a glance** (full notes per key are in the manifest):
- **Player:** a tiny clay clownfish with a bubble gun on its head, sliding on a rail.
- **Buddies (`tower.*`):** Tropical Fish, Octopus (→ DJ Octopus with headphones), Shark (→ Hammerhead),
  Starfish (→ glowing Five-Point Star), Pufferfish, Seahorse with a telescope (→ Sea Dragon),
  Crab (→ King Crab with a crown).
- **Enemies:** Jellybean Jellyfish, Clown Crab, Baby Kraken, Puffer Pal, Sea Urchin, Electric
  Eel, plus minions (mini chef octopus, star minion, jelly bean).
- **Bosses:**
  - Chef Octopus (chef hat; **the hat is a separate sprite**)
  - Sharky the Teething (braces)
  - Starfish Queen (crown; arms closed vs open)
  - Kraken Kitty (giant cute kraken with cat ears)
- **Coral Heart:** a chunky brain-coral heart with a face. This is what you defend.

**Prompt seed for image generation** (keep it identical across all sprites for consistency):

> *Stop-motion claymation miniature, glossy plasticine with visible fingerprints and seams,
> soft studio lighting from top-left, candy-bright tropical colors, cute googly eyes,
> 3/4 view from slightly above, facing right, isolated on transparent background, toy
> diorama style, no text.*

Make one **character sheet per creature first** (a turnaround of the poses), then build the
animation frames from it, so the same creature stays recognisable across its animations.

---

## 3. Technical spec

**Scale.** `pxPerUnit = 2`: one world unit is 2 sheet pixels. On iPhone 17 the 800-unit-wide
reef fills the 402 pt screen width, so 1 world unit ≈ 0.5 pt. A 96 px frame shows at about
24 pt (48 device px), which keeps it crisp at the canvas's 2× resolution.

**Sheet layout.** One sprite per sheet. **Each animation is one row**, frames run left to
right, rows go in the order listed in the manifest (each anim records its `row`). Every frame
in a sheet has the same size, `frame: [w, h]`. Optional: an anim can live in its own file
(`"file"` on the anim) and/or start at a `"col"`.

```
tower.octopus.1  (frame 160×176)
row 0  idle      [f0][f1][f2][f3]
row 1  fire      [f0][f1][f2]
row 2  disabled  [f0][f1]
row 3  broken    [f0]
```

**Anchor.** `anchor: [ax, ay]` is a fraction of the frame and marks **the point that sits on
the entity's game position**:
- **Creatures and towers:** the ground-contact point / center of the footprint (towers: the
  center of the coral cup they stand in).
- **Projectiles:** the center.

The art-preview page draws the anchor as a red crosshair. Make sure it sits where the
creature touches the ground.

**Files.**
- Deliver transparent **PNG masters** (lossless). At integration they're converted to
  **WebP q90** for shipping (about 75% smaller download on iPhone, visually identical), and
  the PNG masters stay in git history. A sheet already in WebP is also accepted.
- sRGB, straight (un-premultiplied) alpha.
- Leave **≥ 2 px of transparent padding inside each frame**, so neighbouring frames don't
  bleed when scaled.
- Max **4096 px** on any side of a sheet (iOS texture limit).
- **Memory budget:** ≤ 96 MB decoded across all sheets (width × height × 4 bytes);
  `check-art` reports the total.
- Folders: `assets/art/board/` (the heart), `player/`, `towers/`, `enemies/`,
  `bosses/`, `projectiles/`, `fx/`, `ui/`.
- Lowercase-hyphen names, e.g. `towers/octopus-1.webp`.

**Timing.**
- 12 fps unless an anim says otherwise. You can change `fps` per anim.
- `"loop": false` marks a one-shot. Keep **tower `fire` ≤ 0.25 s** (towers shoot several times
  a second) and **`die` ≤ 0.5 s**. Boss one-shots (`throw`, `swipe`, `summon`) ≈ 0.5 s.

**Manifest flags.**
- `wobble`: procedural clay squash on top of your frames.
- `spin`: the game rotates the sprite continuously. Used for stars.
- `orient`: rotates the sprite to its flight direction. Used for darts.
- `scale`: size tweak without re-exporting. P0 tuning: level-1 towers `1.15`, heart `1.3`,
  and the bosses `4/3` (their cells are 75% size).
- `attach`: named points in frame fractions. `boss.chef` uses `"attach": { "hat": [0.44, 0.24] }`,
  the top of his head where the hat's anchor goes. Set it for any new chef art.

**After any change to images, bump `"version"` in the manifest.** It cache-busts the
offline service worker, so installed iPhones pick up the new art on next launch.

---

## 4. Sprite list

Full details, including a description per key, are in `assets/art/manifest.json`; it is the
source of truth.
- **P0:** needed for the game to look finished.
- **P1:** strongly wanted.
- **P2:** nice to have; level-2 towers fall back to level 1, scaled up 8%.

Frame sizes are recommendations. Change `frame` and `anchor` freely if your art needs it.

#### Player fish

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `player.classic` | P0 | 192×160 | 0.5, 0.8 | idle (4), swim (4), shoot (3, once), plus (3, once) |
| `player.golden` | P2 | 192×160 | 0.5, 0.8 | idle (4), swim (4), shoot (3, once), plus (3, once) |
| `player.neon` | P2 | 192×160 | 0.5, 0.8 | idle (4), swim (4), shoot (3, once), plus (3, once) |
| `player.galaxy` | P2 | 192×160 | 0.5, 0.8 | idle (4), swim (4), shoot (3, once), plus (3, once) |

#### Towers

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `tower.fish.1` | P0 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.fish.2` | P2 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.fish.3` | P1 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.octopus.1` | P0 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.octopus.2` | P2 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.octopus.3` | P1 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.shark.1` | P0 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1), charge (4) |
| `tower.shark.2` | P2 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1), charge (4) |
| `tower.shark.3` | P1 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1), charge (4) |
| `tower.starfish.1` | P0 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.starfish.2` | P2 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.starfish.3` | P1 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.puffer.1` | P0 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1), inflate (4, once) |
| `tower.puffer.2` | P2 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1), inflate (4, once) |
| `tower.puffer.3` | P1 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1), inflate (4, once) |
| `tower.seahorse.1` | P0 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.seahorse.2` | P2 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.seahorse.3` | P1 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.crab.1` | P0 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.crab.2` | P2 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |
| `tower.crab.3` | P1 | 160×176 | 0.5, 0.82 | idle (4), fire (3, once), disabled (2), broken (1) |

#### Enemies

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `enemy.jelly` | P0 | 96×96 | 0.5, 0.75 | move (6), stun (4), sad (4), die (5, once) |
| `enemy.jellyMini` | P1 | 64×64 | 0.5, 0.75 | move (6), stun (4), die (4, once) |
| `enemy.crab` | P0 | 96×96 | 0.5, 0.75 | move (6), carry (6), stun (4), die (5, once) |
| `enemy.kraken` | P0 | 96×96 | 0.5, 0.75 | move (6), grab (4, once), stun (4), die (5, once) |
| `enemy.puffer` | P0 | 96×96 | 0.5, 0.75 | move (6), inflate (6), stun (4), die (5, once) |
| `enemy.urchin` | P0 | 112×112 | 0.5, 0.75 | move (4), cracked (4), stun (4), die (5, once) |
| `enemy.eel` | P0 | 112×80 | 0.5, 0.75 | move (6), stun (4), die (5, once) |
| `enemy.octoMini` | P1 | 64×64 | 0.5, 0.75 | move (6), grab (4, once), stun (4), die (4, once) |
| `enemy.starMinion` | P1 | 64×64 | 0.5, 0.75 | move (6), stun (4), die (4, once) |

#### Bosses

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `boss.chef` | P0 | 256×288 | 0.5, 0.8 | move (6), move2 (6), throw (6, once), summon (6, once), die (8, once) |
| `boss.chef.hat` | P0 | 96×96 | 0.5, 0.95 | idle (4) |
| `boss.sharky` | P0 | 288×224 | 0.5, 0.75 | move (6), windup (4), charge (4), recover (4), stunned (4), die (8, once) |
| `boss.queen` | P0 | 320×320 | 0.5, 0.72 | closed (6), open (6), summon (6, once), die (8, once) |
| `boss.kitty` | P0 | 352×352 | 0.5, 0.75 | move (6), move2 (6), swipe (6, once), summon (6, once), exposed (4), die (10, once) |
| `boss.kitty.tentacle` | P0 | 128×144 | 0.5, 0.85 | grip (6), break (5, once) |

#### Coral Heart

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `heart` | P0 | 224×224 | 0.5, 0.7 | idle (4), hit (3, once), low (4) |

#### Projectiles & enemy attacks

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `proj.minus` | P0 | 48×48 | 0.5, 0.5 | fly (4) |
| `proj.plus` | P0 | 48×48 | 0.5, 0.5 | fly (4) |
| `proj.bubble` | P1 | 32×32 | 0.5, 0.5 | fly (2) |
| `proj.dart` | P1 | 64×24 | 0.5, 0.5 | fly (2) |
| `proj.ink` | P1 | 48×48 | 0.5, 0.5 | fly (2) |
| `proj.star` | P1 | 64×64 | 0.5, 0.5 | fly (2) |
| `proj.ministar` | P1 | 40×40 | 0.5, 0.5 | fly (2) |
| `strike.ink` | P1 | 64×64 | 0.5, 0.5 | fly (2) |
| `strike.spark` | P1 | 48×48 | 0.5, 0.5 | fly (2) |
| `strike.star` | P1 | 48×48 | 0.5, 0.5 | fly (2) |

#### Pickups

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `pickup.shell` | P1 | 48×48 | 0.5, 0.8 | fall (4), land (4) |

#### Effects & status overlays

| Key | Pri | Frame px | Anchor | Animations (frames) |
|---|---|---|---|---|
| `fx.pop` | P1 | 128×128 | 0.5, 0.6 | play (6, once) |
| `fx.explode` | P1 | 256×256 | 0.5, 0.6 | play (7, once) |
| `fx.ink` | P1 | 160×128 | 0.5, 0.6 | play (6, once) |
| `fx.heal` | P1 | 128×128 | 0.5, 0.6 | play (6, once) |
| `fx.shield_pop` | P1 | 128×128 | 0.5, 0.6 | play (5, once) |
| `fx.chomp` | P1 | 128×128 | 0.5, 0.6 | play (4, once) |
| `fx.crack` | P1 | 128×128 | 0.5, 0.6 | play (5, once) |
| `fx.poof` | P1 | 160×160 | 0.5, 0.6 | play (6, once) |
| `fx.pulse` | P1 | 320×256 | 0.5, 0.6 | play (6, once) |
| `fx.wave` | P1 | 512×512 | 0.5, 0.6 | play (8, once) |
| `fx.hat_hit` | P1 | 96×96 | 0.5, 0.6 | play (4, once) |
| `fx.minus_pop` | P1 | 64×64 | 0.5, 0.6 | play (4, once) |
| `fx.heart_hit` | P1 | 192×192 | 0.5, 0.6 | play (5, once) |
| `fx.player_hit` | P1 | 160×160 | 0.5, 0.6 | play (6, once) |
| `fx.sparkle` | P1 | 64×64 | 0.5, 0.6 | play (4, once) |
| `fx.sad` | P1 | 48×48 | 0.5, 0.6 | loop (4) |
| `fx.zap` | P1 | 128×128 | 0.5, 0.6 | play (4, once) |
| `fx.confetti` | P1 | 384×384 | 0.5, 0.6 | play (10, once) |
| `fx.spark` | P1 | 96×96 | 0.5, 0.6 | play (4, once) |
| `fx.minus_muzzle` | P1 | 64×64 | 0.5, 0.6 | play (3, once) |
| `fx.plus_muzzle` | P1 | 64×64 | 0.5, 0.6 | play (3, once) |
| `fx.grab` | P1 | 160×176 | 0.5, 0.82 | loop (4) |
| `fx.blind` | P1 | 160×176 | 0.5, 0.82 | loop (4) |
| `fx.plus_power` | P1 | 160×176 | 0.5, 0.82 | loop (4) |
| `fx.purr` | P1 | 352×352 | 0.5, 0.75 | loop (4) |
| `fx.respawn_bubble` | P2 | 128×128 | 0.5, 0.8 | loop (4) |
| `fx.zapped` | P1 | 160×176 | 0.5, 0.82 | loop (4) |

---

## 5. How the game picks animations

You don't implement any of this; it tells you what each animation must communicate.

| Sprite | Animation chosen when… (v3.0 runner) |
|---|---|
| Fish in the school (`player.*`) | `swim`, looping, offset per fish so the school shimmers. Every fifth fish is mirrored for variety. |
| Critter (`enemy.*`) | `move` while it walks down the road (mirrored to face the school), with a bounce added by the game. `die` plays once where it popped (`fx.pop` style burst if missing). |
| Buddy (`tower.*`) | `fire` (once) right after it shoots, otherwise `idle`. Level 2/3 art is used when the buddy levels up. |
| Chef Octopus | `throw` / `summon` (once) when he throws ink or calls minions; `move2` below half HP; otherwise `move`. The hat is drawn at his `hat` attach point. |
| Sharky | `windup` while he lines up over a lane (the game paints the lane red), `charge` while he plunges down it, `recover` while he swims back, otherwise `move`. |
| Starfish Queen | `summon` (once), otherwise `open`. |
| Kraken Kitty | `swipe` / `summon` (once), `move2` below half HP, otherwise `move`. |
| Event effects | One-shot `fx.*` sprites: `fx.pop` (clam cracked), `fx.poof` (buddy joins), `fx.ink` / `fx.spark` (boss throws land), `fx.confetti` (boss beaten, level won). |

**Drawn by the game on top of your art; don't paint these:** the fish counter above the
school, gate panels and their numbers, clam HP numbers and prizes, the boss's HP number and
bar, critter HP bars, red target circles and Sharky's red lane, floating text.

**Effects the game adds procedurally:** a white hit flash, mirroring, a walking bounce, and
the 12 fps stop-motion clock.

---

## 6. iPhone 17 notes (target device)

- **Screen:** 402 × 874 pt @3x with ProMotion. It's portrait only; landscape shows a "rotate"
  screen.
- **Safe areas:** the Dynamic Island takes the top 62 pt and the home indicator the bottom
  34 pt.
- **HUD:** sits over the top (wave, score, shells, Coral Heart bar, boss bar) and the bottom
  (meter, touch buttons).
- **The road fills the screen below a slim top bar** (level, progress, coins, pause). See
  `docs/art/reference/*.jpg` for the real framing.
- **Readability at small size matters more than detail.** Every creature must be
  recognisable as a ~24 pt silhouette, and the bosses as ~70 pt silhouettes.
- **Performance:** the game holds 60 fps with 50+ enemies and their shots on screen. Sprite drawing is
  cheap; memory is the limit, so stay inside the 96 MB decoded budget. Prefer fewer, smaller
  frames over huge sheets.

---

## 7. Optional: UI skin (P2)

The HUD and menus are plain DOM styled by `css/style.css`. You can restyle it to look like
clay buttons, cardboard signs and googly-eyed chips. Keep these intact:
- Every element **id**
- The classes the code toggles: `.item`, `.focus`, `.disabled`, `.go`, `.card`, `.panel`,
  `.modal`, `.bar`, `.in-combat`, `.touch`, `.menu-open`
- The `data-hold` / `data-tap` attributes

Put images in `assets/art/ui/`. Ideas:
- A logo image to replace the text logo in `.title .logo`
- Clay textures for `.item` buttons and the `#touch` buttons
- Icons for shells and pearls

If you use a custom font, self-host the `.woff2` in `assets/art/ui/` with `@font-face`. It must
work offline.

---

## 8. Delivering

1. Put the sheets in `assets/art/<folder>/`. Fill in `"file"` and fix `frame`, `anchor`,
   `frames` and `row` in the manifest. Bump `"version"`.
2. Run `node tools/check-art.mjs`; it must print `manifest OK`. Then check `art-preview.html`
   (anchors on the feet, loops seamless) and play a wave in the game.
3. Commit to a branch off `claude/reef-rumble-pwa` and open a PR. If you can't push, send a
   zip of `assets/art/**` (including `manifest.json`).
4. Order: this round, the P1 fix-ups first, then the rest of P2. Partial deliveries are
   welcome.
5. In the PR or zip, list anything you need from the game, e.g. "a separate sprite for the
   Queen's shield shards", "an event when an enemy starts zapping". I'll wire it up.

**Acceptance checklist**
- [ ] `check-art` passes; decoded memory ≤ 96 MB; no sheet larger than 4096 px.
- [ ] Every creature faces right (or is marked `"facing": "left"`) and anchors on its feet.
- [ ] Consistent top-left lighting and the same clay material on every sprite.
- [ ] Silhouettes read at iPhone size (art-preview → "iPhone 17 game size").
- [ ] Starfish Queen `closed` vs `open`, and Sharky's `windup`, are unmistakable at a glance.
- [ ] One-shots are short: tower `fire` ≤ 0.25 s, `die` ≤ 0.5 s.
- [ ] Loops loop cleanly, with a little boil.
- [ ] Manifest `version` bumped.
