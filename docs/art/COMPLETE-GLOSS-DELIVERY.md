# Complete glossy artwork — version 3.3.0

All 79 sprite definitions are delivered and use `assets/art/gloss/`. No legacy sprite sheets remain in the shipped asset tree. Art manifest version 17 rejects missing or non-glossy references in CI.

| Family | Delivered coverage |
| --- | --- |
| Player | Classic, Golden, Neon, Galaxy, including menu previews |
| Buddies | Fish, Octopus, Shark, Starfish, Puffer, Seahorse, Crab: all three tiers and firing poses |
| Enemies | Jelly, Mini Jelly, Crab, Kraken, Puffer, Urchin, Eel, Mini Octopus, Star Minion: swim, anticipation, defeated |
| Bosses | Four existing glossy bosses plus matching separate hat and tentacle props |
| Pickups and shots | Closed/open pearl clam, heart gem, every player/buddy projectile and boss strike |
| Effects | All 27 registered effect keys use four-frame glossy burst, ink splash, bubble bloom or confetti sheets |
| UI and PWA | Custom pearl currency, vector control charms, skin images, app icons and six iPhone launch screens |

## Implementation

Art was authored with the built-in image-generation tool. Transparent cutouts use the existing glossy player/atlas as style references. Generated atlases are packaged with `tools/art/pack-gloss.py`; source paths are supplied as a JSON map. Each character remains inside an equal cell with padding; alpha is preserved and WebP outputs are decoded before replacement. `tools/art/package-icons.py` packages the approved icon source, keeping the maskable fish within its central safe region.

Character prompts specify polished glossy resin, sculpted highlights, sparkling blue eyes, saturated candy colors, a slightly elevated three-quarter camera, consistent identity/scale across poses, actual transparency, and no clay textures, ground, labels or shadows. Enemy sheets use two swimming poses, an anticipation pose and a dazed defeat pose in a 2×2 grid. Buddy sheets use a 3×2 grid: idle tiers 1–3 above their corresponding firing poses, with cyan crystal pedestals, violet tier-two gems and a gold tier-three crest. The crab was corrected to a wide carapace, eye stalks, walking legs and pincer claws.

Projectile prompts specify a 4×3 atlas of glass bubbles, plus/minus charms, orange darts, violet ink, gold/cyan stars, cyan shield/spark orbs and a pink heart gem. Props use a 2×2 closed/open clam, chef hat and kraken tentacle atlas. Effect prompts use 2×2 four-stage glossy crystal bursts, purple liquid splashes, cyan bubble blooms, or candy confetti. Skins are gold/ivory, turquoise/pink, and violet/pink with celestial sparkles. The icon prompt specifies a single smiling glossy clownfish, a cobalt/turquoise underwater background, sparse bubbles and violet coral, with no text or device frame.

Continuous motion adds character breathing, buddy recoil and enemy defeat shrink/fade while respecting reduced-motion preferences. The one-to-seven-shot progression and simulation balance remain intact. Decorative emoji have been replaced with authored art or glossy native control vectors. Old sprites have been removed; Git history retains them.

## Verification

- 25 simulation tests pass.
- 79 of 79 sprites loaded and rendered in the browser; zero failed textures or legacy paths. All 324 declared animation cells contain visible artwork.
- All four skins and all buddy tiers inspected, plus enemy scenes, clams, projectiles and effect atlases.
- Desktop and iPhone smoke tests verify steering, pause, level completion, progress persistence, offline boot and all four offline skin previews.
- Boss attack/defeat/purchase checks and victory layouts at 320×568, 375×667, 402×874 and 440×956.
- 44 shared sprite textures consume approximately 14.91 MiB decoded, within the 96 MiB budget. P0 23/23, P1 45/45, P2 11/11 delivered.
