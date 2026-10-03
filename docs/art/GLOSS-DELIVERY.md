# Glossy Reef graphics update

The playable runner now uses the October 3 gameplay and result mockups in
`docs/art/reference/gloss-*-target.webp` as its art direction.

- Authored underwater environment: bright cyan water, blue rocks, pink/violet/yellow
  coral, pale golden sand and pink rails. Cached horizontal strips adapt the image
  to the renderer's lane projection, with moving light and roadside props.
- A transparent 4×3 runtime atlas supplies positive/negative resin gates and props.
  Gate text, effects and collision boundaries remain live and retain their values.
- A new glossy clownfish pose uses continuous bob, pitch and breathing, with the
  existing formation, gain flash and damage blink. Existing enemy, boss and buddy
  animation sheets remain available; gameplay rules and tuning are unchanged.
- DOM HUD and menus use beveled cyan/blue controls, orange price capsules, cream
  cards, pearl coins and matching fish/bubble/fire artwork. Text stays dynamic.
- The rounded Fredoka variable font is bundled under its SIL Open Font License.
- New images and font are precached for offline play; sprite manifest is version 15
  and service-worker cache is `reef-rumble-gloss-v3.1.0` (commit stamped on publish).

## Verification

- `npm test`: 21 passed, 0 failed.
- `npm run check-art`: all P0/P1 art valid; manifest textures 78.8 MiB.
- Combined existing sprite textures plus new environment/atlas/UI: 89.04 MiB,
  within the existing 96 MiB decoded-image budget.
- `node tools/build-site.mjs`: deployable site built successfully.
- Chromium smoke test: desktop and iPhone portrait; drag steering, pause/resume,
  complete a level, restart, persist progress, reload and boot offline.
- Actual gameplay and defeat layouts visually inspected at 402×874.

The scene is authored raster art plus Canvas2D projection and animation; it does
not add a real-time 3D engine or third-party runtime dependencies. Exact pixel
positions vary with viewport, live game state and the player's progress.
