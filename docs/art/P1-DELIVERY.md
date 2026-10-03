# Reef Rumble — P0 + P1 art delivery

Extract at the repository root on `claude/reef-rumble-pwa` and replace `assets/art/manifest.json` with the supplied version 9.

Complete cumulative delivery: 24/24 P0 and 45/45 P1 keys, 69 PNG sheets. P2 remains null and uses existing placeholders. P0 image bytes are unchanged from the previous delivery. Only art files and the art manifest are changed; no gameplay, configuration or renderer edits.

P1 includes seven level-three towers, three minions, eight projectiles/enemy attacks, one shell pickup and 26 event/status effects. Clay material, top-left lighting and camera match the handoff. Creature sprites face right; particles and overlays contain only their effects.

The shell fall loop uses three poses rather than four; land remains four. Other P1 animations retain requested frame counts. Main one-shot timing follows the handoff. Large P1 sheets are at 70% or 75% of recommended sheet resolution with reciprocal manifest scale to retain world size; frames <=64 px retain original resolution. Scale/anchor flags are preserved. Center holes in grab/purr/aura overlays are transparent to show the game entity beneath.

Validation: `node tools/check-art.mjs` prints `manifest OK`, with total decoded texture memory below the 96 MB budget. Every sheet <=4096 px. All 632 active character/projectile/effect frames pass nonempty-alpha and >=2 px transparent-padding checks. The actual SpriteBank loader decoded all 69 sheets; every animation frame sampled within its sheet bounds. See VALIDATION.txt for output.

The P0 board retains the original template geometry. P1 creature/effect images were produced with built-in image generation, visually inspected, corrected where required and assembled into fixed cells. P1-PROMPTS.json records the final source prompts.

Device acceptance remains outstanding: browser installation/download was unavailable in this workspace, so a live art-preview pass and played wave were not completed. Please review on native iPhone before publishing, especially tower attack poses, overlay placement and loop transitions. Automated image/loader checks do not establish visual perfection or real-device frame rate.

No additional game events, data or renderer changes requested.
