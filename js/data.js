// data.js — static game data: types, moves, species, items, encounter tables, leaders.
// All creatures are original designs so the project is safe to share publicly.

const TYPE_COLORS = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', grass: '#78c850',
  electric: '#f8d030', ice: '#98d8d8', ground: '#e0c068', flying: '#a890f0',
  bug: '#a8b820', rock: '#b8a038', psychic: '#f85888', dark: '#705848', fighting: '#c03028',
};

// Attacker type -> defender type -> multiplier. Anything missing is 1x.
const TYPE_CHART = {
  normal:   { rock: 0.5 },
  fire:     { grass: 2, ice: 2, bug: 2, fire: 0.5, water: 0.5, rock: 0.5 },
  water:    { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5 },
  grass:    { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, flying: 0.5, bug: 0.5 },
  electric: { water: 2, flying: 2, grass: 0.5, electric: 0.5, ground: 0 },
  ice:      { grass: 2, ground: 2, flying: 2, fire: 0.5, water: 0.5, ice: 0.5 },
  ground:   { fire: 2, electric: 2, rock: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying:   { grass: 2, bug: 2, fighting: 2, electric: 0.5, rock: 0.5 },
  bug:      { grass: 2, psychic: 2, dark: 2, fire: 0.5, flying: 0.5, fighting: 0.5 },
  rock:     { fire: 2, ice: 2, flying: 2, bug: 2, ground: 0.5, fighting: 0.5 },
  psychic:  { fighting: 2, psychic: 0.5, dark: 0 },
  dark:     { psychic: 2, dark: 0.5, fighting: 0.5 },
  fighting: { normal: 2, rock: 2, ice: 2, dark: 2, flying: 0.5, bug: 0.5, psychic: 0.5 },
};

// Multiply effectiveness across every defender type (dual types stack, e.g. 2 * 2 = 4x).
function typeEffect(moveType, defTypes) {
  const row = TYPE_CHART[moveType] || {};
  return defTypes.reduce((m, t) => m * (row[t] ?? 1), 1);
}

// cat: 'phys' deals damage, 'status' changes stat stages. prio moves go first.
const MOVES = {
  tackle:      { name: 'Tackle',       type: 'normal',   power: 40,  acc: 100, cat: 'phys' },
  scratch:     { name: 'Scratch',      type: 'normal',   power: 40,  acc: 100, cat: 'phys' },
  quickhit:    { name: 'Quick Hit',    type: 'normal',   power: 40,  acc: 100, cat: 'phys', prio: 1 },
  bodyslam:    { name: 'Body Slam',    type: 'normal',   power: 80,  acc: 100, cat: 'phys' },
  growl:       { name: 'Growl',        type: 'normal',   power: 0,   acc: 100, cat: 'status', effect: { who: 'foe', stat: 'atk', delta: -1 } },
  harden:      { name: 'Harden',       type: 'normal',   power: 0,   acc: 100, cat: 'status', effect: { who: 'self', stat: 'def', delta: 1 } },
  ember:       { name: 'Ember',        type: 'fire',     power: 40,  acc: 100, cat: 'phys' },
  flamewheel:  { name: 'Flame Wheel',  type: 'fire',     power: 65,  acc: 100, cat: 'phys' },
  inferno:     { name: 'Inferno',      type: 'fire',     power: 95,  acc: 85,  cat: 'phys' },
  watergun:    { name: 'Water Gun',    type: 'water',    power: 40,  acc: 100, cat: 'phys' },
  bubblebeam:  { name: 'Bubble Beam',  type: 'water',    power: 65,  acc: 100, cat: 'phys' },
  hydroblast:  { name: 'Hydro Blast',  type: 'water',    power: 95,  acc: 85,  cat: 'phys' },
  vinewhip:    { name: 'Vine Whip',    type: 'grass',    power: 40,  acc: 100, cat: 'phys' },
  razorleaf:   { name: 'Razor Leaf',   type: 'grass',    power: 60,  acc: 95,  cat: 'phys' },
  solarblade:  { name: 'Solar Blade',  type: 'grass',    power: 95,  acc: 85,  cat: 'phys' },
  thundershock:{ name: 'Thundershock', type: 'electric', power: 40,  acc: 100, cat: 'phys' },
  sparkbolt:   { name: 'Spark Bolt',   type: 'electric', power: 65,  acc: 100, cat: 'phys' },
  thunder:     { name: 'Thunder',      type: 'electric', power: 100, acc: 75,  cat: 'phys' },
  iceshard:    { name: 'Ice Shard',    type: 'ice',      power: 40,  acc: 100, cat: 'phys', prio: 1 },
  frostbite:   { name: 'Frostbite',    type: 'ice',      power: 65,  acc: 100, cat: 'phys' },
  blizzard:    { name: 'Blizzard',     type: 'ice',      power: 100, acc: 75,  cat: 'phys' },
  mudslap:     { name: 'Mud Slap',     type: 'ground',   power: 35,  acc: 100, cat: 'phys' },
  earthquake:  { name: 'Earthquake',   type: 'ground',   power: 90,  acc: 100, cat: 'phys' },
  gust:        { name: 'Gust',         type: 'flying',   power: 40,  acc: 100, cat: 'phys' },
  aerialslash: { name: 'Aerial Slash', type: 'flying',   power: 70,  acc: 100, cat: 'phys' },
  bugbite:     { name: 'Bug Bite',     type: 'bug',      power: 50,  acc: 100, cat: 'phys' },
  swarmstrike: { name: 'Swarm Strike', type: 'bug',      power: 75,  acc: 95,  cat: 'phys' },
  rockthrow:   { name: 'Rock Throw',   type: 'rock',     power: 50,  acc: 90,  cat: 'phys' },
  rockslide:   { name: 'Rock Slide',   type: 'rock',     power: 80,  acc: 90,  cat: 'phys' },
  confusion:   { name: 'Confusion',    type: 'psychic',  power: 50,  acc: 100, cat: 'phys' },
  psybeam:     { name: 'Psybeam',      type: 'psychic',  power: 75,  acc: 100, cat: 'phys' },
  bite:        { name: 'Bite',         type: 'dark',     power: 60,  acc: 100, cat: 'phys' },
  nightslash:  { name: 'Night Slash',  type: 'dark',     power: 75,  acc: 100, cat: 'phys' },
  karatechop:  { name: 'Karate Chop',  type: 'fighting', power: 50,  acc: 100, cat: 'phys' },
  powerpunch:  { name: 'Power Punch',  type: 'fighting', power: 85,  acc: 95,  cat: 'phys' },
};

// shape drives the procedural sprite; stage 2 = evolved (drawn bigger).
// learn: [level, moveId]. A creature knows the last 4 moves it learned.
const SPECIES = {
  sproutle:   { name: 'Sproutle',   types: ['grass'], base: { hp: 45, atk: 49, def: 49, spd: 45 }, exp: 64, catchRate: 45, shape: 'quad', color: '#6cc46a', accent: '#2f7d3a', evolve: { level: 16, into: 'thornback' },
    learn: [[1, 'tackle'], [1, 'growl'], [5, 'vinewhip'], [12, 'razorleaf'], [20, 'bodyslam'], [30, 'solarblade']] },
  thornback:  { name: 'Thornback',  types: ['grass', 'ground'], base: { hp: 80, atk: 82, def: 83, spd: 70 }, exp: 180, catchRate: 45, shape: 'quad', color: '#4ea14c', accent: '#8a5a2b', stage: 2,
    learn: [[1, 'tackle'], [1, 'growl'], [5, 'vinewhip'], [12, 'razorleaf'], [20, 'bodyslam'], [26, 'earthquake'], [30, 'solarblade']] },
  embercub:   { name: 'Embercub',   types: ['fire'], base: { hp: 39, atk: 52, def: 43, spd: 65 }, exp: 64, catchRate: 45, shape: 'quad', color: '#f0803a', accent: '#ffd36b', evolve: { level: 16, into: 'blazebear' },
    learn: [[1, 'scratch'], [1, 'growl'], [5, 'ember'], [10, 'bite'], [14, 'flamewheel'], [30, 'inferno']] },
  blazebear:  { name: 'Blazebear',  types: ['fire', 'fighting'], base: { hp: 78, atk: 92, def: 70, spd: 80 }, exp: 180, catchRate: 45, shape: 'humanoid', color: '#d9542b', accent: '#ffd36b', stage: 2,
    learn: [[1, 'scratch'], [1, 'growl'], [5, 'ember'], [10, 'bite'], [14, 'flamewheel'], [20, 'powerpunch'], [30, 'inferno']] },
  puddlefin:  { name: 'Puddlefin',  types: ['water'], base: { hp: 44, atk: 48, def: 65, spd: 43 }, exp: 64, catchRate: 45, shape: 'serpent', color: '#5b9cf0', accent: '#d8ecff', evolve: { level: 16, into: 'tidalfin' },
    learn: [[1, 'tackle'], [1, 'harden'], [5, 'watergun'], [11, 'bite'], [14, 'bubblebeam'], [30, 'hydroblast']] },
  tidalfin:   { name: 'Tidalfin',   types: ['water', 'dark'], base: { hp: 79, atk: 85, def: 90, spd: 78 }, exp: 180, catchRate: 45, shape: 'serpent', color: '#2f5fb8', accent: '#9fd0ff', stage: 2,
    learn: [[1, 'tackle'], [1, 'harden'], [5, 'watergun'], [11, 'bite'], [14, 'bubblebeam'], [22, 'nightslash'], [30, 'hydroblast']] },

  fuzzlet:    { name: 'Fuzzlet',    types: ['normal'], base: { hp: 40, atk: 45, def: 40, spd: 56 }, exp: 50, catchRate: 255, shape: 'round', color: '#d8b48a', accent: '#fff2dc', evolve: { level: 14, into: 'fluffox' },
    learn: [[1, 'tackle'], [3, 'growl'], [8, 'quickhit'], [15, 'bite'], [22, 'bodyslam']] },
  fluffox:    { name: 'Fluffox',    types: ['normal'], base: { hp: 70, atk: 75, def: 65, spd: 90 }, exp: 140, catchRate: 120, shape: 'quad', color: '#e0a060', accent: '#fff2dc', stage: 2,
    learn: [[1, 'tackle'], [3, 'growl'], [8, 'quickhit'], [15, 'bite'], [22, 'bodyslam'], [32, 'nightslash']] },
  chirpy:     { name: 'Chirpy',     types: ['normal', 'flying'], base: { hp: 40, atk: 45, def: 40, spd: 56 }, exp: 50, catchRate: 255, shape: 'bird', color: '#c89a68', accent: '#f4e0b0', evolve: { level: 18, into: 'galewing' },
    learn: [[1, 'tackle'], [5, 'gust'], [10, 'quickhit'], [20, 'aerialslash']] },
  galewing:   { name: 'Galewing',   types: ['normal', 'flying'], base: { hp: 75, atk: 80, def: 70, spd: 100 }, exp: 160, catchRate: 90, shape: 'bird', color: '#8a6a48', accent: '#e85a3a', stage: 2,
    learn: [[1, 'tackle'], [5, 'gust'], [10, 'quickhit'], [20, 'aerialslash'], [30, 'bodyslam']] },
  buzzle:     { name: 'Buzzle',     types: ['bug'], base: { hp: 45, atk: 35, def: 50, spd: 45 }, exp: 45, catchRate: 255, shape: 'bug', color: '#b8c838', accent: '#ffe066', evolve: { level: 10, into: 'stingrae' },
    learn: [[1, 'tackle'], [1, 'harden'], [7, 'bugbite'], [18, 'swarmstrike']] },
  stingrae:   { name: 'Stingrae',   types: ['bug', 'flying'], base: { hp: 65, atk: 85, def: 60, spd: 80 }, exp: 150, catchRate: 120, shape: 'bug', color: '#e8c030', accent: '#303030', stage: 2,
    learn: [[1, 'tackle'], [1, 'harden'], [7, 'bugbite'], [12, 'gust'], [18, 'swarmstrike'], [26, 'aerialslash']] },
  sparkit:    { name: 'Sparkit',    types: ['electric'], base: { hp: 35, atk: 55, def: 40, spd: 90 }, exp: 82, catchRate: 190, shape: 'quad', color: '#f8d848', accent: '#5a4a20', evolve: { level: 22, into: 'voltfang' },
    learn: [[1, 'quickhit'], [1, 'growl'], [5, 'thundershock'], [15, 'sparkbolt'], [20, 'bite'], [32, 'thunder']] },
  voltfang:   { name: 'Voltfang',   types: ['electric', 'dark'], base: { hp: 65, atk: 92, def: 60, spd: 110 }, exp: 180, catchRate: 75, shape: 'quad', color: '#f0c020', accent: '#30304a', stage: 2,
    learn: [[1, 'quickhit'], [1, 'growl'], [5, 'thundershock'], [15, 'sparkbolt'], [20, 'bite'], [26, 'nightslash'], [32, 'thunder']] },
  mossling:   { name: 'Mossling',   types: ['grass'], base: { hp: 50, atk: 50, def: 60, spd: 30 }, exp: 60, catchRate: 200, shape: 'round', color: '#7ab85a', accent: '#a07850', evolve: { level: 20, into: 'grovelord' },
    learn: [[1, 'tackle'], [1, 'harden'], [6, 'vinewhip'], [10, 'mudslap'], [16, 'razorleaf'], [30, 'solarblade']] },
  grovelord:  { name: 'Grovelord',  types: ['grass', 'rock'], base: { hp: 95, atk: 95, def: 110, spd: 40 }, exp: 190, catchRate: 60, shape: 'humanoid', color: '#5a8a3a', accent: '#8a7050', stage: 2,
    learn: [[1, 'tackle'], [1, 'harden'], [6, 'vinewhip'], [10, 'mudslap'], [16, 'razorleaf'], [24, 'rockslide'], [30, 'solarblade']] },
  shadepaw:   { name: 'Shadepaw',   types: ['dark'], base: { hp: 45, atk: 60, def: 40, spd: 70 }, exp: 66, catchRate: 150, shape: 'quad', color: '#4a3a5a', accent: '#d04060', evolve: { level: 24, into: 'nightstalk' },
    learn: [[1, 'scratch'], [1, 'growl'], [8, 'bite'], [12, 'quickhit'], [24, 'nightslash']] },
  nightstalk: { name: 'Nightstalk', types: ['dark'], base: { hp: 75, atk: 100, def: 65, spd: 105 }, exp: 180, catchRate: 60, shape: 'quad', color: '#2a2040', accent: '#e04070', stage: 2,
    learn: [[1, 'scratch'], [1, 'growl'], [8, 'bite'], [12, 'quickhit'], [24, 'nightslash'], [34, 'aerialslash']] },
  dunewyrm:   { name: 'Dunewyrm',   types: ['ground'], base: { hp: 50, atk: 65, def: 55, spd: 45 }, exp: 70, catchRate: 150, shape: 'serpent', color: '#d8b060', accent: '#8a6a30', evolve: { level: 25, into: 'sandserpent' },
    learn: [[1, 'tackle'], [4, 'mudslap'], [10, 'bite'], [16, 'rockthrow'], [30, 'earthquake']] },
  sandserpent:{ name: 'Sandserpent',types: ['ground', 'rock'], base: { hp: 90, atk: 105, def: 100, spd: 65 }, exp: 190, catchRate: 60, shape: 'serpent', color: '#b88a40', accent: '#5a4020', stage: 2,
    learn: [[1, 'tackle'], [4, 'mudslap'], [10, 'bite'], [16, 'rockthrow'], [25, 'rockslide'], [30, 'earthquake']] },
  pebblit:    { name: 'Pebblit',    types: ['rock'], base: { hp: 40, atk: 70, def: 90, spd: 20 }, exp: 60, catchRate: 200, shape: 'round', color: '#9a9080', accent: '#5a5048', evolve: { level: 22, into: 'bouldron' },
    learn: [[1, 'tackle'], [1, 'harden'], [8, 'rockthrow'], [12, 'mudslap'], [22, 'rockslide'], [34, 'earthquake']] },
  bouldron:   { name: 'Bouldron',   types: ['rock', 'ground'], base: { hp: 80, atk: 110, def: 130, spd: 30 }, exp: 190, catchRate: 60, shape: 'humanoid', color: '#7a7064', accent: '#4a4038', stage: 2,
    learn: [[1, 'tackle'], [1, 'harden'], [8, 'rockthrow'], [12, 'mudslap'], [22, 'rockslide'], [28, 'powerpunch'], [34, 'earthquake']] },
  scorchid:   { name: 'Scorchid',   types: ['fire', 'bug'], base: { hp: 55, atk: 75, def: 55, spd: 75 }, exp: 120, catchRate: 120, shape: 'bug', color: '#e0602a', accent: '#ffcc40', stage: 2,
    learn: [[1, 'ember'], [8, 'bugbite'], [16, 'flamewheel'], [24, 'swarmstrike'], [36, 'inferno']] },
  frostkit:   { name: 'Frostkit',   types: ['ice'], base: { hp: 45, atk: 50, def: 50, spd: 65 }, exp: 68, catchRate: 150, shape: 'quad', color: '#c8ecf8', accent: '#5aa8d0', evolve: { level: 26, into: 'glaciat' },
    learn: [[1, 'scratch'], [1, 'growl'], [6, 'iceshard'], [12, 'bite'], [18, 'frostbite'], [34, 'blizzard']] },
  glaciat:    { name: 'Glaciat',    types: ['ice', 'dark'], base: { hp: 80, atk: 95, def: 80, spd: 95 }, exp: 185, catchRate: 60, shape: 'quad', color: '#9ad0e8', accent: '#304060', stage: 2,
    learn: [[1, 'scratch'], [1, 'growl'], [6, 'iceshard'], [12, 'bite'], [18, 'frostbite'], [26, 'nightslash'], [34, 'blizzard']] },
  snowl:      { name: 'Snowl',      types: ['ice', 'flying'], base: { hp: 60, atk: 60, def: 70, spd: 60 }, exp: 110, catchRate: 120, shape: 'bird', color: '#f0f4f8', accent: '#7aa0c0', stage: 2,
    learn: [[1, 'gust'], [5, 'iceshard'], [16, 'aerialslash'], [22, 'frostbite'], [36, 'blizzard']] },
  shellby:    { name: 'Shellby',    types: ['water', 'rock'], base: { hp: 50, atk: 60, def: 100, spd: 25 }, exp: 90, catchRate: 190, shape: 'round', color: '#e89a8a', accent: '#6ab0e0', stage: 2,
    learn: [[1, 'tackle'], [1, 'harden'], [6, 'watergun'], [12, 'rockthrow'], [20, 'bubblebeam'], [28, 'rockslide']] },
  crabble:    { name: 'Crabble',    types: ['water'], base: { hp: 40, atk: 75, def: 70, spd: 50 }, exp: 65, catchRate: 200, shape: 'bug', color: '#e86040', accent: '#ffd0b0', evolve: { level: 24, into: 'kingclaw' },
    learn: [[1, 'scratch'], [1, 'harden'], [5, 'watergun'], [14, 'bubblebeam'], [20, 'bodyslam'], [32, 'hydroblast']] },
  kingclaw:   { name: 'Kingclaw',   types: ['water', 'fighting'], base: { hp: 70, atk: 115, def: 100, spd: 60 }, exp: 185, catchRate: 60, shape: 'bug', color: '#c03a28', accent: '#ffd040', stage: 2,
    learn: [[1, 'scratch'], [1, 'harden'], [5, 'watergun'], [14, 'bubblebeam'], [20, 'bodyslam'], [24, 'karatechop'], [32, 'hydroblast']] },
  brawlup:    { name: 'Brawlup',    types: ['fighting'], base: { hp: 60, atk: 75, def: 45, spd: 50 }, exp: 70, catchRate: 180, shape: 'humanoid', color: '#c8a088', accent: '#c03028', evolve: { level: 28, into: 'punchamp' },
    learn: [[1, 'tackle'], [1, 'growl'], [6, 'karatechop'], [10, 'quickhit'], [16, 'rockthrow'], [22, 'powerpunch']] },
  punchamp:   { name: 'Punchamp',   types: ['fighting'], base: { hp: 90, atk: 120, def: 75, spd: 70 }, exp: 190, catchRate: 45, shape: 'humanoid', color: '#a87860', accent: '#e8c020', stage: 2,
    learn: [[1, 'tackle'], [1, 'growl'], [6, 'karatechop'], [10, 'quickhit'], [16, 'rockthrow'], [22, 'powerpunch'], [34, 'earthquake']] },
  mindmoth:   { name: 'Mindmoth',   types: ['psychic', 'bug'], base: { hp: 50, atk: 50, def: 50, spd: 70 }, exp: 72, catchRate: 150, shape: 'bug', color: '#c890e0', accent: '#f8e0ff', evolve: { level: 25, into: 'astralmoth' },
    learn: [[1, 'confusion'], [6, 'gust'], [10, 'bugbite'], [18, 'psybeam'], [24, 'aerialslash']] },
  astralmoth: { name: 'Astralmoth', types: ['psychic', 'flying'], base: { hp: 75, atk: 92, def: 70, spd: 105 }, exp: 185, catchRate: 50, shape: 'bug', color: '#8a60d0', accent: '#ffe0a0', stage: 2,
    learn: [[1, 'confusion'], [6, 'gust'], [10, 'bugbite'], [18, 'psybeam'], [24, 'aerialslash'], [30, 'swarmstrike']] },
  aurorix:    { name: 'Aurorix',    types: ['psychic', 'ice'], base: { hp: 100, atk: 100, def: 100, spd: 100 }, exp: 270, catchRate: 8, shape: 'bird', color: '#b0e8ff', accent: '#ff80c0', stage: 2, legendary: true,
    learn: [[1, 'confusion'], [1, 'iceshard'], [20, 'psybeam'], [20, 'frostbite'], [30, 'aerialslash'], [40, 'blizzard']] },
};
const SPECIES_IDS = Object.keys(SPECIES);

const ITEMS = {
  orb:         { name: 'Capture Orb', price: 100, ball: 1,   desc: 'Catches wild creatures.' },
  superorb:    { name: 'Super Orb',   price: 300, ball: 1.7, desc: 'Better catch rate.' },
  hyperorb:    { name: 'Hyper Orb',   price: 700, ball: 2.5, desc: 'Best catch rate.' },
  potion:      { name: 'Potion',      price: 150, heal: 25,  desc: 'Restores 25 HP.' },
  superpotion: { name: 'Super Potion',price: 400, heal: 70,  desc: 'Restores 70 HP.' },
  revive:      { name: 'Revive',      price: 900, revive: true, desc: 'Revives a fainted creature to half HP.' },
};

// Biome ids (stored per tile) -> encounter table. w = weight. night entries get a boost after dark.
const BIOME = { OCEAN: 0, BEACH: 1, MEADOW: 2, FOREST: 3, DESERT: 4, SNOW: 5, HILL: 6, TOWN: 7 };
const BIOME_NAMES = ['Ocean', 'Beach', 'Meadow', 'Forest', 'Desert', 'Tundra', 'Highlands', 'Town'];
const BIOME_LEVEL_BONUS = [0, 0, 0, 2, 4, 7, 5, 0];

const ENCOUNTERS = {
  [BIOME.MEADOW]: [{ id: 'fuzzlet', w: 30 }, { id: 'chirpy', w: 25 }, { id: 'buzzle', w: 20 }, { id: 'sparkit', w: 10 }, { id: 'mossling', w: 6 }, { id: 'shadepaw', w: 2, night: 10 }],
  [BIOME.FOREST]: [{ id: 'buzzle', w: 25 }, { id: 'mossling', w: 25 }, { id: 'mindmoth', w: 15 }, { id: 'chirpy', w: 10 }, { id: 'sparkit', w: 6 }, { id: 'shadepaw', w: 8, night: 30 }],
  [BIOME.DESERT]: [{ id: 'dunewyrm', w: 35 }, { id: 'pebblit', w: 25 }, { id: 'scorchid', w: 20 }, { id: 'brawlup', w: 15 }],
  [BIOME.SNOW]:   [{ id: 'frostkit', w: 40 }, { id: 'snowl', w: 28 }, { id: 'pebblit', w: 14 }, { id: 'brawlup', w: 12 }, { id: 'aurorix', w: 1, night: 3 }],
  [BIOME.BEACH]:  [{ id: 'crabble', w: 40 }, { id: 'shellby', w: 30 }, { id: 'chirpy', w: 20 }, { id: 'puddlefin', w: 3 }],
  [BIOME.HILL]:   [{ id: 'pebblit', w: 30 }, { id: 'brawlup', w: 30 }, { id: 'mindmoth', w: 20 }, { id: 'embercub', w: 3 }, { id: 'sproutle', w: 3 }],
};

// Six leaders, assigned to towns from nearest to farthest from the start, so difficulty ramps
// as you explore outward. Beat all six to become champion.
const LEADERS = [
  { name: 'Ivy',    title: 'Grass Leader',    badge: 'Leaf Badge',    level: 10, team: ['mossling', 'sproutle'], color: '#4ea14c' },
  { name: 'Rook',   title: 'Rock Leader',     badge: 'Stone Badge',   level: 15, team: ['pebblit', 'shellby', 'pebblit'], color: '#8a8070' },
  { name: 'Volta',  title: 'Electric Leader', badge: 'Spark Badge',   level: 20, team: ['sparkit', 'chirpy', 'voltfang'], color: '#e8c020' },
  { name: 'Cinder', title: 'Fire Leader',     badge: 'Ember Badge',   level: 26, team: ['scorchid', 'embercub', 'blazebear'], color: '#d9542b' },
  { name: 'Marina', title: 'Water Leader',    badge: 'Tide Badge',    level: 32, team: ['crabble', 'shellby', 'tidalfin', 'kingclaw'], color: '#3a70c8' },
  { name: 'Boreas', title: 'Ice Leader',      badge: 'Glacier Badge', level: 38, team: ['snowl', 'frostkit', 'astralmoth', 'glaciat'], color: '#7ac0e0' },
];

const TOWN_NAMES = ['Hearthollow', 'Mossvale', 'Cragport', 'Sparkridge', 'Emberfall', 'Tidecrest', 'Frostmere'];
