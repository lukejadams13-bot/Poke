# Pocket Wilds

An open-world creature-catching game that runs in the browser. Explore a procedurally generated island, catch and train creatures, and beat six Leaders to become Champion.

No build step and no dependencies: plain HTML, CSS and JavaScript.

## Play

- **Easiest:** double-click `index.html` to open it in a browser.
- **Or serve it** (needed for some mobile browsers): `python3 -m http.server` in this folder, then open http://localhost:8000.

| Action | Keys | Touch |
|---|---|---|
| Move | Arrows / WASD (hold Shift to run) | D-pad |
| Talk / confirm | Enter, Space, Z | A |
| Menu / back | Esc, X | B |
| Toggle minimap | M | |

Progress autosaves to the browser after every battle and building visit.

## What's in it

- **Open world:** a 256x256 tile island built from a seed. North is tundra, the south has desert, and there are meadows, forests, beaches and highlands in between. Roads and bridges connect seven towns. The same seed always builds the same island, and you can type one on the title screen.
- **Difficulty by distance:** wild creatures get stronger the farther you go from your home town, so you can go anywhere but have to be ready for it.
- **32 original creatures** across 13 types, with evolutions, learnsets, and different encounters by biome and time of day (some only show up at night).
- **Turn-based battles:** type matchups, same-type bonus, crits, stat stages, priority moves, EXP sharing, learning moves, and evolution.
- **Catching:** three orb tiers. Lower HP means better odds.
- **Towns:** a Healing Center (heals your team and has a storage box) and a Mart in each one. Six towns have a Leader whose team gets stronger the farther that town is from home.
- **Day/night cycle,** a minimap, a Dex, and touch controls on phones.

## Code map

| File | What it does |
|---|---|
| `js/rng.js` | Seeded random numbers and value noise for terrain |
| `js/data.js` | Types, moves, species, items, encounter tables, Leaders. **Edit this to add content.** |
| `js/monster.js` | Stats, EXP curve, leveling, evolution |
| `js/world.js` | World generation (biomes, towns, roads) and tile drawing |
| `js/sprites.js` | Creature and character sprites drawn in code, so there are no image files |
| `js/ui.js` | Text box and menus, written as Promises so game logic can use `await` |
| `js/battle.js` | The battle loop |
| `js/game.js` | Main loop, input, overworld, menus, save/load |

### Adding a creature

Add an entry to `SPECIES` in `js/data.js` with a `shape` (`round`, `quad`, `bird`, `serpent`, `bug`, `humanoid`) and two colors. The sprite is drawn automatically. Then add it to an `ENCOUNTERS` table so it shows up in the wild.
