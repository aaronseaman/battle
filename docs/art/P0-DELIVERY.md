# Reef Rumble — P0 art delivery

Extract this archive at the repository root on `claude/reef-rumble-pwa`, replacing `assets/art/manifest.json`.

24/24 P0 keys delivered as PNG sheets, manifest version 8. P1/P2 remain null and use the existing placeholders. No gameplay or renderer files changed.

Validation: `node tools/check-art.mjs` prints `manifest OK`; approximately 70.5 MB decoded of the 96 MB budget. All sheets <=4096 px. 355 active character/projectile frames checked for nonempty alpha and >=2 px transparent padding. Tower fire <=0.25 s; all die animations <=0.5 s.

The board preserves the original template path coordinates and widths, all 14 socket centers, spawn cave and rail. It was painted from the template's native SVG geometry to avoid image-generation position drift. The heart is separate and its destination is clear. Board material polish can be developed further while retaining those exact coordinates.

Main boss frames use 75% of recommended resolution and scale 4/3 to retain their original world size. Frame counts were adjusted to the delivered poses: Sharky charge 3, Kitty move2 5, Chef throw 5, Heart idle/low 3, Minus/Plus fly 2. Death timing is increased where needed to meet 0.5 s.

Chef hat remains separate. Tentacle contains no tower art and has transparent grip holes. Queen closed and open have different silhouettes; Sharky windup has a red face and crouch.

Character sheets were made with built-in image generation, then packed into uniform cells. Background cleanup was performed with the image-generation editor. Prompts are documented in PROMPTS.md.

Limitations: a live `art-preview.html` pass and played wave could not be completed because no browser executable was installed and the browser download failed. Native iPhone visual/performance verification remains outstanding. This is a first P0 art pass, not a claim of final device acceptance. Review loops and boss cues on-device before publishing.

No additional game data, events or renderer changes requested.
