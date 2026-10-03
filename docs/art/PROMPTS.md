# P0 generation prompt set

> Written for the tower-defense prototype. Since v2.0 the game is an arcade wave shooter: read
> "walking along the path" as "swooping into formation and diving at the reef", and the shark's
> `charge` as a lunge up at the enemies. The material/camera seed below is unchanged; keep using it.

Tool: built-in image generation.

Shared material/camera seed:

Stop-motion claymation miniature, glossy plasticine with visible fingerprints and seams, soft studio lighting from top-left, candy-bright tropical colors, cute googly eyes, 3/4 view from slightly above, facing right, isolated on transparent background, toy diorama style, no text.

Each character uses its manifest notes below and animation rows in the listed order. Equal cells, transparent gutters, stable bottom-center ground-contact anchor. Sequential distinct poses, no captions or UI. Unused cells empty.

## player.classic

Tiny clay clownfish riding the rail, side view facing RIGHT (renderer mirrors it). Bubble-gun nozzle on top: Minus/Plus bubbles leave from the top center of the frame. shoot = quick squash (Minus), plus = bigger squash + happy face.

Rows: idle: 4 poses, swim: 4 poses, shoot: 3 poses, plus: 3 poses.

## tower.fish.1

Level 1: Tropical Fish: cheerful clay angelfish on a coral stub. Sits in a coral socket cup; the anchor is the center of the cup it stands in. Faces RIGHT (mirrored to aim left). fire = attack squash/lunge (shoot). disabled = dizzy/stuck. broken = cracked, grey, droopy.

Rows: idle: 4 poses, fire: 3 poses, disabled: 2 poses, broken: 1 poses.

## tower.octopus.1

Level 1: Octopus: purple clay octopus in a cup, tentacles curling like sausages. Sits in a coral socket cup; the anchor is the center of the cup it stands in. Faces RIGHT (mirrored to aim left). fire = attack squash/lunge (shoot). disabled = dizzy/stuck. broken = cracked, grey, droopy.

Rows: idle: 4 poses, fire: 3 poses, disabled: 2 poses, broken: 1 poses.

## tower.shark.1

Level 1: Shark: chubby grey shark, big toothy grin. Sits in a coral socket cup; the anchor is the center of the cup it stands in. Faces RIGHT (mirrored to aim left). fire = attack squash/lunge (shoot). disabled = dizzy/stuck. broken = cracked, grey, droopy. charge = swimming dash pose (the body moves along the path during charges).

Rows: idle: 4 poses, fire: 3 poses, disabled: 2 poses, broken: 1 poses, charge: 4 poses.

## tower.starfish.1

Level 1: Starfish: orange starfish standing on two points. Sits in a coral socket cup; the anchor is the center of the cup it stands in. Faces RIGHT (mirrored to aim left). fire = attack squash/lunge (throw). disabled = dizzy/stuck. broken = cracked, grey, droopy.

Rows: idle: 4 poses, fire: 3 poses, disabled: 2 poses, broken: 1 poses.

## tower.puffer.1

Level 1: Pufferfish: round yellow puffer. Sits in a coral socket cup; the anchor is the center of the cup it stands in. Faces RIGHT (mirrored to aim left). fire = attack squash/lunge (puff). disabled = dizzy/stuck. broken = cracked, grey, droopy. inflate = 0→full puff over the fuse (plays once per explosion).

Rows: idle: 4 poses, fire: 3 poses, disabled: 2 poses, broken: 1 poses, inflate: 4 poses.

## tower.seahorse.1

Level 1: Seahorse: pink seahorse with a tiny telescope. Sits in a coral socket cup; the anchor is the center of the cup it stands in. Faces RIGHT (mirrored to aim left). fire = attack squash/lunge (shoot). disabled = dizzy/stuck. broken = cracked, grey, droopy.

Rows: idle: 4 poses, fire: 3 poses, disabled: 2 poses, broken: 1 poses.

## tower.crab.1

Level 1: Crab: red crab with oversized pincers. Sits in a coral socket cup; the anchor is the center of the cup it stands in. Faces RIGHT (mirrored to aim left). fire = attack squash/lunge (pinch). disabled = dizzy/stuck. broken = cracked, grey, droopy.

Rows: idle: 4 poses, fire: 3 poses, disabled: 2 poses, broken: 1 poses.

## enemy.jelly

Jellybean Jellyfish: pink translucent jelly-bean bell, wiggly sausage tentacles, bouncy. Seen walking along the path, facing RIGHT (mirrored for leftward travel). Googly eyes! stun = dizzy stars. die = pop/squish into clay crumbs (plays once where it died). sad = droopy, teary (3 Minus stacks).

Rows: move: 6 poses, stun: 4 poses, sad: 4 poses, die: 5 poses.

## enemy.crab

Clown Crab: red/white crab with a clown nose and big googly eyes, scuttling sideways. Seen walking along the path, facing RIGHT (mirrored for leftward travel). Googly eyes! stun = dizzy stars. die = pop/squish into clay crumbs (plays once where it died). Sad state (3 Minus stacks) is shown by shrinking + a tear overlay if no sad anim.

Rows: move: 6 poses, carry: 6 poses, stun: 4 poses, die: 5 poses.

## enemy.kraken

Baby Kraken: purple baby squid/kraken with tiny tentacles. Seen walking along the path, facing RIGHT (mirrored for leftward travel). Googly eyes! stun = dizzy stars. die = pop/squish into clay crumbs (plays once where it died). Sad state (3 Minus stacks) is shown by shrinking + a tear overlay if no sad anim.

Rows: move: 6 poses, grab: 4 poses, stun: 4 poses, die: 5 poses.

## enemy.puffer

Puffer Pal: yellow pufferfish, friendly. Seen walking along the path, facing RIGHT (mirrored for leftward travel). Googly eyes! stun = dizzy stars. die = pop/squish into clay crumbs (plays once where it died). Sad state (3 Minus stacks) is shown by shrinking + a tear overlay if no sad anim.

Rows: move: 6 poses, inflate: 6 poses, stun: 4 poses, die: 5 poses.

## enemy.urchin

Sea Urchin: dark purple spiky ball with clay spikes. Seen walking along the path, facing RIGHT (mirrored for leftward travel). Googly eyes! stun = dizzy stars. die = pop/squish into clay crumbs (plays once where it died). Sad state (3 Minus stacks) is shown by shrinking + a tear overlay if no sad anim.

Rows: move: 4 poses, cracked: 4 poses, stun: 4 poses, die: 5 poses.

## enemy.eel

Electric Eel: green/yellow eel with lightning-bolt pattern, slithering. Seen walking along the path, facing RIGHT (mirrored for leftward travel). Googly eyes! stun = dizzy stars. die = pop/squish into clay crumbs (plays once where it died). Sad state (3 Minus stacks) is shown by shrinking + a tear overlay if no sad anim.

Rows: move: 6 poses, stun: 4 poses, die: 5 poses.

## boss.chef

Chef Octopus (wave 5 boss): big purple octopus, apron, mustache, ladle. DRAW WITHOUT THE HAT — the hat is boss.chef.hat (it is the weak point and sways separately). Leave room at the top of the head. move2 = angrier phase-2 walk (optional). throw = lobs an ink bomb. summon = waves ladle, minis appear.

Rows: move: 6 poses, move2: 6 poses, throw: 6 poses, summon: 6 poses, die: 8 poses.

## boss.chef.hat

The tall puffy white chef hat. Anchor = bottom-center of the hat; it is placed on the chef's head at 90% of the chef sprite height and sways with the hitbox. Make it read as a target (slightly glowing/wobbly).

Rows: idle: 4 poses.

## boss.sharky

Sharky the Teething (wave 10): chubby baby shark with metal braces, drooling. windup = crouch + red-faced grr (telegraph!). charge = stretched mid-dash. stunned = seeing stars. recover = panting.

Rows: move: 6 poses, windup: 4 poses, charge: 4 poses, recover: 4 poses, stunned: 4 poses, die: 8 poses.

## boss.queen

Starfish Queen (wave 15): giant orange starfish with a gold crown and gems. closed = arms curled in, shield shards rotating around her (armored). open = arms flung wide, vulnerable belly showing (clearly different!). summon = star minions spawn.

Rows: closed: 6 poses, open: 6 poses, summon: 6 poses, die: 8 poses.

## boss.kitty

Kraken Kitty (wave 20 final boss): giant pink kraken with cat ears, whiskers and huge cute eyes; many tentacles. swipe = paw swipe toward the rail. exposed = dizzy, belly up, sparkles (after Plus pops her purr shield). move2 = phase 2+.

Rows: move: 6 poses, move2: 6 poses, swipe: 6 poses, summon: 6 poses, exposed: 4 poses, die: 10 poses.

## boss.kitty.tentacle

A Kraken Kitty tentacle wrapped around a tower socket (drawn over the tower). grip = squeezing loop. break = snaps and retracts (plays once).

Rows: grip: 6 poses, break: 5 poses.

## heart

The Coral Heart (what you defend): chunky pink brain-coral heart with a cute face. hit = flinch. low = worried/cracked (under 35% HP).

Rows: idle: 4 poses, hit: 3 poses, low: 4 poses.

## proj.minus

Purple Minus bubble with a white "−". Anchor = center.

Rows: fly: 4 poses.

## proj.plus

Yellow Plus bubble with a white "+". Anchor = center.

Rows: fly: 4 poses.

## Cleanup edits

Remove all gray/checkerboard backgrounds, panels, colored grid lines and guides. Preserve each sculpted character pose and exact animation row order. Return actual alpha transparency, not a painted checkerboard. Empty cells alpha zero.

Tentacle edit: remove all towers, gray columns, blue roofs, crowns and hardware. Leave only pink tentacle and suction cups; grip centers are transparent holes.

Board: the generated paintover drifted from the template and was excluded. Final geometry/material pass uses the existing template native SVG; path/socket positions retained verbatim.
