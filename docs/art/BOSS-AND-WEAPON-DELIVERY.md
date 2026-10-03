# Boss and weapon update — 3.2.0

All four bosses now use transparent glossy WebP sheets with eight poses each: idle, anticipation, attack, recovery, expression, defeated, and bubble escape. Continuous renderer motion adds breathing, tilt, squash, charge stretch and hit reactions while retaining the simulation hitboxes. Reduced-motion preferences limit motion.

Boss victories feature star particles, expanding rings, a defeated-to-escape pose transition, pearls arcing toward the balance, a short musical fanfare, and a reward reveal. The displayed reward counts toward the actual already-paid reward; animation never grants additional coins. Small-phone sheets scroll to keep all controls reachable.

New saves and migrated saves begin with one centered bubble per volley. The permanent Multi-shot Bubbles upgrade costs 25 coins initially and unlocks one additional shot per purchase, capped at seven. Wider volleys preserve total damage; fish count remains health rather than a source of extra shots. Number gates now increase after three hits so the single-shot starting weapon can interact with them meaningfully.

Validation: 25 simulation tests pass, including centering, symmetric spread, damage preservation, purchase persistence, upgrade cap and save migration. Browser checks exercised all four bosses, attack poses, defeat effects, reward screen, and a real purchase from one to two shots. Victory layouts were checked at 320×568, 375×667, 402×874 and 440×956. Desktop/iPhone smoke and offline assets passed. Art manifest v16 passes with 68 sheets and approximately 49.1 MiB decoded sprite memory (96 MiB budget).
