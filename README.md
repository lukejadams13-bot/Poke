# Pokémon Wilds

A personal, open-world Pokémon fan game that runs in the browser. You explore a 3D island built from a seed, walk into wild Pokémon roaming the overworld to battle them, catch and train a team, and beat six Gym Leaders.

There's no build step. It's plain HTML, CSS and JavaScript plus a bundled copy of Three.js (`vendor/`).

## Play

- Double-click `index.html`, or run `python3 -m http.server` in this folder and open http://localhost:8000.
- **Needs an internet connection for Pokémon art.** Sprites load from PokeAPI (GitHub) and Pokémon Showdown. Without a connection, Pokémon show as colored placeholders.
- Needs a browser with WebGL (any modern desktop or phone browser).

| Action | Keys | Touch |
|---|---|---|
| Move (relative to camera) | WASD / arrows, Shift to run | D-pad |
| Camera | Drag, Q/E rotate, scroll to zoom | Drag |
| Talk / confirm | Enter, Space, Z | A |
| Menu / back | Esc, X | B |
| Toggle minimap | M | |

Progress autosaves after battles and building visits.

## Features

- **3D open world:** a 256x256 island with rolling hills, mountains with snow caps, forests, desert, tundra, beaches, swaying tall grass, water, clouds, a day/night cycle with stars and lit windows, and shadows.
- **Visible wild Pokémon,** like Scarlet/Violet and Legends. They wander, some come at you, and you walk into one to battle. Spawns depend on biome and time of day (Gastly and Oddish come out at night, and there's a rare Articuno in the tundra after dark). Shinies are 1/200.
- **82 real Pokémon** (mostly Kanto) with real types, real base stats folded into 4 stats, evolutions, and learnsets.
- **Battles:** the real 18-type chart, STAB, crits, priority, stat stages, fixed-damage moves (Seismic Toss, Night Shade, Dragon Rage), Recover, False Swipe, Teleport (wild Abra really do run), and Splash. Plus EXP, learning moves, evolution, and Poké/Great/Ultra Balls.
- **Towns:** a Pokémon Center (heals, PC Box) and Poké Mart in each. Six Gym Leaders (Erika, Brock, Lt. Surge, Blaine, Misty, Pryce) get stronger the farther their town is from home.
- **Difficulty by distance:** wild levels scale with distance from Pallet Town.

## Code map

| File | What it does |
|---|---|
| `js/data.js` | Types, moves, Pokémon, items, encounter tables, Gym Leaders. **Edit this to add content.** |
| `js/world.js` | Seeded world generation (biomes, heights, towns, roads) |
| `js/scene3d.js` | Three.js rendering: terrain, water, sky, props, buildings, trainer model, Pokémon billboards |
| `js/game.js` | Main loop, movement, wild spawning and AI, menus, save/load |
| `js/battle.js` | The battle loop and battle animations |
| `js/monster.js` | Stats, EXP curve, leveling, evolution |
| `js/ui.js` | Text box and menus (Promise-based, so game code can `await` them) |
| `js/rng.js` | Seeded random numbers and noise |

### Adding a Pokémon

Add a line to `DEX_TABLE` in `js/data.js` (`name dex types hp atk def spd family [evoLevel evoInto]`). If it's a new family, add a learnset to `LEARN`. Then add it to an `ENCOUNTERS` table. Its art loads automatically from its Pokédex number.

Pokémon and all related names and art are © Nintendo / Game Freak / The Pokémon Company. This is a personal, non-commercial fan project.
