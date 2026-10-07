// data.js — static game data: types, moves, Pokémon, items, encounter tables, leaders.
// Stats are real base stats folded into 4 stats: atk = max(Atk, SpA), def = avg(Def, SpD).

const TYPE_COLORS = {
  normal: '#9fa19f', fire: '#e62829', water: '#2980ef', grass: '#3fa129', electric: '#fac000', ice: '#3dcef3',
  fighting: '#ff8000', poison: '#9141cb', ground: '#915121', flying: '#81b9ef', psychic: '#ef4179', bug: '#91a119',
  rock: '#afa981', ghost: '#704170', dragon: '#5060e1', dark: '#624d4e', steel: '#60a1b8', fairy: '#ef70ef',
};

// Real (Gen 6+) type chart. Attacker -> defender -> multiplier; anything missing is 1x.
const TYPE_CHART = {
  normal:   { rock: .5, ghost: 0, steel: .5 },
  fire:     { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2 },
  water:    { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
  electric: { water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 },
  grass:    { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 },
  ice:      { fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 },
  fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 },
  poison:   { grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 },
  flying:   { electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5, steel: .5 },
  psychic:  { fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 },
  bug:      { fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 },
  rock:     { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: .5 },
  dragon:   { dragon: 2, steel: .5, fairy: 0 },
  dark:     { fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 },
  steel:    { fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 },
  fairy:    { fire: .5, fighting: 2, poison: .5, dragon: 2, dark: 2, steel: .5 },
};

function typeEffect(moveType, defTypes) {
  const row = TYPE_CHART[moveType] || {};
  return defTypes.reduce((m, t) => m * (row[t] ?? 1), 1);
}

// Compact move table: id: [Name, type, power, accuracy, extras]
// extras: prio (priority), fx (stat changes: [who, stat, delta]), fixed ('level' or a number),
// heal (fraction of max HP), flee, nothing, falseSwipe.
const MOVE_TABLE = {
  tackle: ['Tackle', 'normal', 40, 100], scratch: ['Scratch', 'normal', 40, 100], pound: ['Pound', 'normal', 40, 100],
  quickattack: ['Quick Attack', 'normal', 40, 100, { prio: 1 }], headbutt: ['Headbutt', 'normal', 70, 100],
  slash: ['Slash', 'normal', 70, 100], bodyslam: ['Body Slam', 'normal', 85, 100], takedown: ['Take Down', 'normal', 90, 85],
  doubleedge: ['Double-Edge', 'normal', 120, 100], thrash: ['Thrash', 'normal', 120, 100], swift: ['Swift', 'normal', 60, 100],
  hyperfang: ['Hyper Fang', 'normal', 80, 90], stomp: ['Stomp', 'normal', 65, 100], slam: ['Slam', 'normal', 80, 75],
  visegrip: ['Vise Grip', 'normal', 55, 100], lastresort: ['Last Resort', 'normal', 140, 100],
  falseswipe: ['False Swipe', 'normal', 40, 100, { falseSwipe: true }],
  sonicboom: ['Sonic Boom', 'normal', 0, 90, { fixed: 20 }],
  growl: ['Growl', 'normal', 0, 100, { fx: [['foe', 'atk', -1]] }], tailwhip: ['Tail Whip', 'normal', 0, 100, { fx: [['foe', 'def', -1]] }],
  leer: ['Leer', 'normal', 0, 100, { fx: [['foe', 'def', -1]] }], screech: ['Screech', 'normal', 0, 85, { fx: [['foe', 'def', -2]] }],
  defensecurl: ['Defense Curl', 'normal', 0, 100, { fx: [['self', 'def', 1]] }], swordsdance: ['Swords Dance', 'normal', 0, 100, { fx: [['self', 'atk', 2]] }],
  splash: ['Splash', 'normal', 0, 100, { nothing: true }],
  ember: ['Ember', 'fire', 40, 100], flamewheel: ['Flame Wheel', 'fire', 60, 100], firefang: ['Fire Fang', 'fire', 65, 95],
  flameburst: ['Flame Burst', 'fire', 70, 100], flamethrower: ['Flamethrower', 'fire', 90, 100], fireblast: ['Fire Blast', 'fire', 110, 85],
  watergun: ['Water Gun', 'water', 40, 100], aquajet: ['Aqua Jet', 'water', 40, 100, { prio: 1 }], bubblebeam: ['Bubble Beam', 'water', 65, 100],
  waterpulse: ['Water Pulse', 'water', 60, 100], brine: ['Brine', 'water', 65, 100], aquatail: ['Aqua Tail', 'water', 90, 90],
  crabhammer: ['Crabhammer', 'water', 100, 90], hydropump: ['Hydro Pump', 'water', 110, 80],
  withdraw: ['Withdraw', 'water', 0, 100, { fx: [['self', 'def', 1]] }],
  vinewhip: ['Vine Whip', 'grass', 45, 100], megadrain: ['Mega Drain', 'grass', 40, 100], razorleaf: ['Razor Leaf', 'grass', 55, 95],
  magicalleaf: ['Magical Leaf', 'grass', 60, 100], petalblizzard: ['Petal Blizzard', 'grass', 90, 100],
  thundershock: ['Thunder Shock', 'electric', 40, 100], spark: ['Spark', 'electric', 65, 100], discharge: ['Discharge', 'electric', 80, 100],
  thunderbolt: ['Thunderbolt', 'electric', 90, 100], thunder: ['Thunder', 'electric', 110, 70],
  powdersnow: ['Powder Snow', 'ice', 40, 100], iceshard: ['Ice Shard', 'ice', 40, 100, { prio: 1 }], icywind: ['Icy Wind', 'ice', 55, 95],
  aurorabeam: ['Aurora Beam', 'ice', 65, 100], icefang: ['Ice Fang', 'ice', 65, 95], icepunch: ['Ice Punch', 'ice', 75, 100],
  freezedry: ['Freeze-Dry', 'ice', 70, 100], iciclecrash: ['Icicle Crash', 'ice', 85, 90], icebeam: ['Ice Beam', 'ice', 90, 100],
  blizzard: ['Blizzard', 'ice', 110, 70],
  lowkick: ['Low Kick', 'fighting', 50, 100], karatechop: ['Karate Chop', 'fighting', 50, 100], revenge: ['Revenge', 'fighting', 60, 100],
  brickbreak: ['Brick Break', 'fighting', 75, 100], crosschop: ['Cross Chop', 'fighting', 100, 80], closecombat: ['Close Combat', 'fighting', 120, 100],
  seismictoss: ['Seismic Toss', 'fighting', 0, 100, { fixed: 'level' }],
  bulkup: ['Bulk Up', 'fighting', 0, 100, { fx: [['self', 'atk', 1], ['self', 'def', 1]] }],
  poisonsting: ['Poison Sting', 'poison', 15, 100], acid: ['Acid', 'poison', 40, 100], poisonfang: ['Poison Fang', 'poison', 50, 100],
  sludge: ['Sludge', 'poison', 65, 100], poisonjab: ['Poison Jab', 'poison', 80, 100], sludgebomb: ['Sludge Bomb', 'poison', 90, 100],
  gunkshot: ['Gunk Shot', 'poison', 120, 80], coil: ['Coil', 'poison', 0, 100, { fx: [['self', 'atk', 1], ['self', 'def', 1]] }],
  mudshot: ['Mud Shot', 'ground', 55, 95], bulldoze: ['Bulldoze', 'ground', 60, 100], boneclub: ['Bone Club', 'ground', 65, 85],
  dig: ['Dig', 'ground', 80, 100], drillrun: ['Drill Run', 'ground', 80, 95], earthpower: ['Earth Power', 'ground', 90, 100],
  bonemerang: ['Bonemerang', 'ground', 100, 90], earthquake: ['Earthquake', 'ground', 100, 100],
  peck: ['Peck', 'flying', 35, 100], gust: ['Gust', 'flying', 40, 100], wingattack: ['Wing Attack', 'flying', 60, 100],
  aerialace: ['Aerial Ace', 'flying', 60, 100], airslash: ['Air Slash', 'flying', 75, 95], drillpeck: ['Drill Peck', 'flying', 80, 100],
  hurricane: ['Hurricane', 'flying', 110, 70],
  confusion: ['Confusion', 'psychic', 50, 100], psybeam: ['Psybeam', 'psychic', 65, 100], extrasensory: ['Extrasensory', 'psychic', 80, 100],
  zenheadbutt: ['Zen Headbutt', 'psychic', 80, 90], psychic: ['Psychic', 'psychic', 90, 100],
  teleport: ['Teleport', 'psychic', 0, 100, { flee: true }], recover: ['Recover', 'normal', 0, 100, { heal: 0.5 }],
  calmmind: ['Calm Mind', 'psychic', 0, 100, { fx: [['self', 'atk', 1], ['self', 'def', 1]] }],
  agility: ['Agility', 'psychic', 0, 100, { fx: [['self', 'spd', 2]] }],
  stringshot: ['String Shot', 'bug', 0, 95, { fx: [['foe', 'spd', -1]] }], harden: ['Harden', 'normal', 0, 100, { fx: [['self', 'def', 1]] }],
  furycutter: ['Fury Cutter', 'bug', 40, 95], bugbite: ['Bug Bite', 'bug', 60, 100], xscissor: ['X-Scissor', 'bug', 80, 100],
  bugbuzz: ['Bug Buzz', 'bug', 90, 100],
  rockthrow: ['Rock Throw', 'rock', 50, 90], rocktomb: ['Rock Tomb', 'rock', 60, 95], rockslide: ['Rock Slide', 'rock', 75, 90],
  stoneedge: ['Stone Edge', 'rock', 100, 80], rockpolish: ['Rock Polish', 'rock', 0, 100, { fx: [['self', 'spd', 2]] }],
  lick: ['Lick', 'ghost', 30, 100], shadowclaw: ['Shadow Claw', 'ghost', 70, 100], shadowball: ['Shadow Ball', 'ghost', 80, 100],
  nightshade: ['Night Shade', 'ghost', 0, 100, { fixed: 'level' }],
  twister: ['Twister', 'dragon', 40, 100], dragonbreath: ['Dragon Breath', 'dragon', 60, 100], dragonclaw: ['Dragon Claw', 'dragon', 80, 100],
  dragonpulse: ['Dragon Pulse', 'dragon', 85, 100], outrage: ['Outrage', 'dragon', 120, 100], dragonrage: ['Dragon Rage', 'dragon', 0, 100, { fixed: 40 }],
  dragondance: ['Dragon Dance', 'dragon', 0, 100, { fx: [['self', 'atk', 1], ['self', 'spd', 1]] }],
  bite: ['Bite', 'dark', 60, 100], pursuit: ['Pursuit', 'dark', 40, 100], feintattack: ['Feint Attack', 'dark', 60, 100],
  suckerpunch: ['Sucker Punch', 'dark', 70, 100, { prio: 1 }], nightslash: ['Night Slash', 'dark', 70, 100], crunch: ['Crunch', 'dark', 80, 100],
  darkpulse: ['Dark Pulse', 'dark', 80, 100], nastyplot: ['Nasty Plot', 'dark', 0, 100, { fx: [['self', 'atk', 2]] }],
  metalclaw: ['Metal Claw', 'steel', 50, 95], mirrorshot: ['Mirror Shot', 'steel', 65, 85], flashcannon: ['Flash Cannon', 'steel', 80, 100],
  irontail: ['Iron Tail', 'steel', 100, 75], metalsound: ['Metal Sound', 'steel', 0, 85, { fx: [['foe', 'def', -2]] }],
  disarmingvoice: ['Disarming Voice', 'fairy', 40, 100], playrough: ['Play Rough', 'fairy', 90, 90], moonblast: ['Moonblast', 'fairy', 95, 100],
  dazzlinggleam: ['Dazzling Gleam', 'fairy', 80, 100], moonlight: ['Moonlight', 'fairy', 0, 100, { heal: 0.5 }],
};
const MOVES = {};
for (const [id, [name, type, power, acc, x = {}]] of Object.entries(MOVE_TABLE)) {
  const status = !power && !x.fixed;
  MOVES[id] = { name, type, power, acc, cat: status ? 'status' : 'phys', prio: x.prio || 0, fx: x.fx || [], fixed: x.fixed, heal: x.heal, flee: x.flee, nothing: x.nothing, falseSwipe: x.falseSwipe };
}

// Learnsets are shared by an evolution family: [level, move, level, move, ...]
const LEARN = {
  bulba: [1, 'tackle', 1, 'growl', 5, 'vinewhip', 9, 'poisonsting', 13, 'razorleaf', 19, 'sludge', 25, 'magicalleaf', 33, 'petalblizzard', 41, 'sludgebomb'],
  charm: [1, 'scratch', 1, 'growl', 5, 'ember', 9, 'metalclaw', 13, 'dragonbreath', 17, 'firefang', 21, 'slash', 28, 'flamethrower', 36, 'airslash', 40, 'dragonclaw', 46, 'fireblast'],
  squirt: [1, 'tackle', 1, 'tailwhip', 5, 'watergun', 8, 'withdraw', 13, 'bubblebeam', 17, 'bite', 21, 'waterpulse', 28, 'aquatail', 36, 'flashcannon', 42, 'hydropump'],
  cater: [1, 'tackle', 1, 'stringshot', 7, 'harden', 9, 'bugbite', 10, 'confusion', 12, 'gust', 18, 'psybeam', 24, 'bugbuzz', 30, 'airslash', 36, 'psychic'],
  weed: [1, 'poisonsting', 1, 'stringshot', 7, 'harden', 9, 'bugbite', 14, 'agility', 20, 'poisonjab', 26, 'xscissor', 32, 'swordsdance'],
  pidg: [1, 'tackle', 5, 'gust', 9, 'quickattack', 15, 'wingattack', 21, 'agility', 27, 'aerialace', 33, 'airslash', 44, 'hurricane'],
  ratt: [1, 'tackle', 1, 'tailwhip', 4, 'quickattack', 10, 'bite', 16, 'hyperfang', 22, 'crunch', 28, 'swordsdance', 34, 'doubleedge'],
  spear: [1, 'peck', 1, 'growl', 5, 'leer', 9, 'pursuit', 13, 'aerialace', 21, 'agility', 29, 'drillpeck', 37, 'drillrun'],
  ekan: [1, 'leer', 1, 'poisonsting', 9, 'bite', 17, 'screech', 20, 'acid', 22, 'crunch', 28, 'poisonjab', 36, 'sludgebomb', 42, 'coil', 48, 'gunkshot'],
  pika: [1, 'thundershock', 1, 'growl', 5, 'tailwhip', 9, 'quickattack', 13, 'spark', 18, 'agility', 26, 'irontail', 30, 'thunderbolt', 42, 'thunder'],
  sand: [1, 'scratch', 1, 'defensecurl', 6, 'poisonsting', 9, 'mudshot', 14, 'slash', 20, 'dig', 26, 'swordsdance', 32, 'xscissor', 38, 'earthquake'],
  clef: [1, 'pound', 1, 'growl', 7, 'disarmingvoice', 13, 'defensecurl', 19, 'swift', 25, 'moonlight', 31, 'bodyslam', 37, 'moonblast'],
  vulp: [1, 'ember', 1, 'tailwhip', 9, 'quickattack', 15, 'flameburst', 20, 'feintattack', 26, 'extrasensory', 31, 'flamethrower', 39, 'fireblast'],
  jigg: [1, 'pound', 1, 'defensecurl', 5, 'disarmingvoice', 13, 'headbutt', 21, 'swift', 29, 'bodyslam', 37, 'dazzlinggleam', 45, 'doubleedge'],
  odd: [1, 'megadrain', 5, 'growl', 9, 'acid', 15, 'razorleaf', 19, 'magicalleaf', 23, 'sludge', 29, 'moonblast', 35, 'petalblizzard', 41, 'sludgebomb'],
  veno: [1, 'tackle', 1, 'stringshot', 11, 'confusion', 15, 'poisonfang', 17, 'psybeam', 23, 'bugbite', 31, 'bugbuzz', 37, 'psychic'],
  digl: [1, 'scratch', 4, 'growl', 7, 'mudshot', 14, 'bulldoze', 18, 'suckerpunch', 22, 'dig', 28, 'slash', 34, 'earthpower', 40, 'earthquake'],
  meow: [1, 'scratch', 1, 'growl', 6, 'bite', 17, 'screech', 22, 'feintattack', 30, 'slash', 33, 'nastyplot', 38, 'nightslash', 44, 'playrough'],
  psyd: [1, 'scratch', 1, 'tailwhip', 4, 'watergun', 11, 'confusion', 15, 'waterpulse', 24, 'zenheadbutt', 33, 'aquatail', 38, 'psychic', 43, 'hydropump'],
  mank: [1, 'scratch', 1, 'leer', 5, 'lowkick', 9, 'karatechop', 13, 'seismictoss', 17, 'screech', 21, 'brickbreak', 25, 'bulkup', 29, 'crosschop', 35, 'closecombat'],
  abra: [1, 'teleport', 16, 'confusion', 21, 'psybeam', 27, 'recover', 33, 'psychic', 39, 'calmmind', 45, 'shadowball'],
  mach: [1, 'lowkick', 1, 'leer', 7, 'karatechop', 13, 'seismictoss', 19, 'revenge', 25, 'bulkup', 31, 'brickbreak', 37, 'crosschop', 45, 'closecombat'],
  tenta: [1, 'poisonsting', 7, 'acid', 10, 'watergun', 16, 'bubblebeam', 22, 'screech', 25, 'sludge', 31, 'brine', 34, 'sludgebomb', 40, 'hydropump'],
  geo: [1, 'tackle', 1, 'defensecurl', 6, 'rockthrow', 12, 'rocktomb', 16, 'bulldoze', 22, 'rockslide', 28, 'dig', 34, 'stoneedge', 40, 'earthquake'],
  pony: [1, 'tackle', 1, 'growl', 5, 'tailwhip', 9, 'ember', 13, 'flamewheel', 17, 'stomp', 25, 'agility', 29, 'takedown', 33, 'flamethrower', 41, 'fireblast'],
  magn: [1, 'tackle', 7, 'thundershock', 11, 'sonicboom', 19, 'spark', 23, 'mirrorshot', 25, 'metalsound', 29, 'flashcannon', 35, 'discharge', 41, 'thunderbolt'],
  seel: [1, 'headbutt', 3, 'growl', 7, 'icywind', 11, 'iceshard', 17, 'aurorabeam', 21, 'aquajet', 27, 'brine', 31, 'takedown', 37, 'aquatail', 41, 'icebeam'],
  gast: [1, 'lick', 8, 'poisonsting', 12, 'nightshade', 19, 'suckerpunch', 22, 'sludge', 26, 'shadowball', 33, 'darkpulse', 40, 'sludgebomb'],
  onix: [1, 'tackle', 1, 'harden', 6, 'rockthrow', 12, 'rocktomb', 18, 'dragonbreath', 24, 'rockslide', 30, 'irontail', 36, 'dig', 42, 'stoneedge'],
  cubo: [1, 'growl', 3, 'tailwhip', 7, 'boneclub', 11, 'headbutt', 17, 'leer', 21, 'bonemerang', 29, 'thrash', 37, 'doubleedge'],
  krab: [1, 'watergun', 1, 'leer', 5, 'visegrip', 9, 'harden', 13, 'mudshot', 17, 'metalclaw', 25, 'brine', 29, 'crabhammer', 33, 'swordsdance', 38, 'xscissor'],
  scy: [1, 'quickattack', 1, 'leer', 9, 'pursuit', 13, 'falseswipe', 17, 'agility', 21, 'wingattack', 25, 'furycutter', 29, 'slash', 37, 'xscissor', 41, 'nightslash', 45, 'swordsdance', 49, 'airslash'],
  jynx: [1, 'pound', 1, 'lick', 8, 'powdersnow', 11, 'confusion', 18, 'icepunch', 25, 'psybeam', 33, 'bodyslam', 39, 'icebeam', 44, 'psychic', 50, 'blizzard'],
  karp: [1, 'splash', 15, 'tackle', 20, 'bite', 23, 'twister', 26, 'icefang', 29, 'aquatail', 35, 'crunch', 38, 'dragondance', 41, 'hydropump', 47, 'hurricane'],
  eevee: [1, 'tackle', 1, 'tailwhip', 5, 'growl', 9, 'quickattack', 13, 'bite', 17, 'swift', 23, 'takedown', 29, 'bodyslam', 37, 'lastresort'],
  artic: [1, 'gust', 1, 'powdersnow', 15, 'iceshard', 22, 'aurorabeam', 29, 'airslash', 36, 'agility', 43, 'icebeam', 50, 'hurricane', 57, 'blizzard'],
  drat: [1, 'tackle', 1, 'leer', 5, 'twister', 15, 'dragonrage', 21, 'slam', 25, 'agility', 31, 'aquatail', 35, 'dragonclaw', 41, 'dragondance', 47, 'dragonpulse', 51, 'outrage', 55, 'wingattack', 61, 'hurricane'],
  swin: [1, 'tackle', 5, 'mudshot', 8, 'powdersnow', 11, 'iceshard', 14, 'icywind', 18, 'bulldoze', 24, 'icefang', 28, 'takedown', 33, 'earthquake', 41, 'blizzard'],
  snea: [1, 'scratch', 1, 'leer', 8, 'quickattack', 10, 'feintattack', 14, 'icywind', 22, 'agility', 25, 'metalclaw', 28, 'iceshard', 32, 'screech', 35, 'nightslash', 40, 'iciclecrash', 47, 'swordsdance'],
  snor: [1, 'powdersnow', 1, 'leer', 10, 'iceshard', 14, 'icywind', 19, 'bite', 23, 'icefang', 28, 'headbutt', 37, 'icebeam', 42, 'crunch', 48, 'blizzard'],
};

// name dex types hp atk def spd family [evolveLevel evolveInto]
const DEX_TABLE = `
bulbasaur 1 grass/poison 45 65 65 45 bulba 16 ivysaur
ivysaur 2 grass/poison 60 80 80 60 bulba 32 venusaur
venusaur 3 grass/poison 80 100 100 80 bulba
charmander 4 fire 39 60 50 65 charm 16 charmeleon
charmeleon 5 fire 58 80 62 80 charm 36 charizard
charizard 6 fire/flying 78 109 85 100 charm
squirtle 7 water 44 50 64 43 squirt 16 wartortle
wartortle 8 water 59 65 80 58 squirt 36 blastoise
blastoise 9 water 79 85 105 78 squirt
caterpie 10 bug 45 30 30 45 cater 7 metapod
metapod 11 bug 50 25 55 30 cater 10 butterfree
butterfree 12 bug/flying 60 90 80 70 cater
weedle 13 bug/poison 40 35 30 50 weed 7 kakuna
kakuna 14 bug/poison 45 25 50 35 weed 10 beedrill
beedrill 15 bug/poison 65 90 60 75 weed
pidgey 16 normal/flying 40 45 38 56 pidg 18 pidgeotto
pidgeotto 17 normal/flying 63 60 52 71 pidg 36 pidgeot
pidgeot 18 normal/flying 83 80 72 101 pidg
rattata 19 normal 30 56 35 72 ratt 20 raticate
raticate 20 normal 55 81 65 97 ratt
spearow 21 normal/flying 40 60 30 70 spear 20 fearow
fearow 22 normal/flying 65 90 63 100 spear
ekans 23 poison 35 60 49 55 ekan 22 arbok
arbok 24 poison 60 95 74 80 ekan
pikachu 25 electric 35 55 45 90 pika
sandshrew 27 ground 50 75 70 40 sand 22 sandslash
sandslash 28 ground 75 100 90 65 sand
clefairy 35 fairy 70 60 56 35 clef
vulpix 37 fire 38 50 65 65 vulp
jigglypuff 39 normal/fairy 115 45 22 20 jigg
oddish 43 grass/poison 45 75 60 30 odd 21 gloom
gloom 44 grass/poison 60 85 72 40 odd 36 vileplume
vileplume 45 grass/poison 75 110 87 50 odd
venonat 48 bug/poison 60 55 52 45 veno 31 venomoth
venomoth 49 bug/poison 70 90 70 90 veno
diglett 50 ground 10 55 35 95 digl 26 dugtrio
dugtrio 51 ground 35 100 60 120 digl
meowth 52 normal 40 45 38 90 meow 28 persian
persian 53 normal 65 70 62 115 meow
psyduck 54 water 50 65 49 55 psyd 33 golduck
golduck 55 water 80 95 80 85 psyd
mankey 56 fighting 40 80 40 70 mank 28 primeape
primeape 57 fighting 65 105 65 95 mank
abra 63 psychic 25 105 35 90 abra 16 kadabra
kadabra 64 psychic 40 120 50 105 abra 38 alakazam
alakazam 65 psychic 55 135 70 120 abra
machop 66 fighting 70 80 42 35 mach 28 machoke
machoke 67 fighting 80 100 65 45 mach 40 machamp
machamp 68 fighting 90 130 82 55 mach
tentacool 72 water/poison 40 50 67 70 tenta 30 tentacruel
tentacruel 73 water/poison 80 80 97 100 tenta
geodude 74 rock/ground 40 80 65 20 geo 25 graveler
graveler 75 rock/ground 55 95 90 35 geo 38 golem
golem 76 rock/ground 80 120 115 45 geo
ponyta 77 fire 50 85 65 90 pony 40 rapidash
rapidash 78 fire 65 100 80 105 pony
magnemite 81 electric/steel 25 95 62 45 magn 30 magneton
magneton 82 electric/steel 50 120 82 70 magn
seel 86 water 65 45 62 45 seel 34 dewgong
dewgong 87 water/ice 90 70 87 70 seel
gastly 92 ghost/poison 30 100 35 80 gast 25 haunter
haunter 93 ghost/poison 45 115 50 95 gast 38 gengar
gengar 94 ghost/poison 60 130 70 110 gast
onix 95 rock/ground 35 45 102 70 onix
krabby 98 water 30 105 57 50 krab 28 kingler
kingler 99 water 55 130 82 75 krab
cubone 104 ground 50 50 72 35 cubo 28 marowak
marowak 105 ground 60 80 95 45 cubo
scyther 123 bug/flying 70 110 80 105 scy
jynx 124 ice/psychic 65 115 65 95 jynx
magikarp 129 water 20 10 37 80 karp 20 gyarados
gyarados 130 water/flying 95 125 89 81 karp
eevee 133 normal 55 55 57 55 eevee
articuno 144 ice/flying 90 95 112 85 artic
dratini 147 dragon 41 64 47 50 drat 30 dragonair
dragonair 148 dragon 61 84 67 70 drat 55 dragonite
dragonite 149 dragon/flying 91 134 97 80 drat
sneasel 215 dark/ice 55 95 65 115 snea
swinub 220 ice/ground 50 50 40 50 swin 33 piloswine
piloswine 221 ice/ground 100 100 70 50 swin
snorunt 361 ice 50 50 50 50 snor 42 glalie
glalie 362 ice 80 80 80 80 snor
`;

// Catch rates that differ from the default for their evolution stage.
const CATCH_OVERRIDE = {
  bulbasaur: 45, charmander: 45, squirtle: 45, caterpie: 255, weedle: 255, pidgey: 255, rattata: 255, spearow: 255,
  magikarp: 255, onix: 45, scyther: 45, eevee: 45, jynx: 45, sneasel: 60, dratini: 45, articuno: 3, abra: 200,
  clefairy: 150, jigglypuff: 170, pikachu: 190,
};
// Overworld size multiplier (1 = about knee-to-waist height on the player).
const SIZE_OVERRIDE = {
  onix: 3.4, gyarados: 3.2, dragonite: 2.6, articuno: 2.8, dragonair: 2.4, caterpie: 0.7, weedle: 0.7, diglett: 0.7,
  pikachu: 0.85, jigglypuff: 0.85, magikarp: 1.0, kakuna: 0.8, metapod: 0.8, machamp: 2.0, golem: 1.8, piloswine: 1.7,
};

const SPECIES = {};
(() => {
  const rows = DEX_TABLE.trim().split('\n').map((l) => l.trim().split(/\s+/));
  for (const [id, dex, types, hp, atk, def, spd, fam, evoLvl, evoInto] of rows) {
    SPECIES[id] = {
      id, dex: +dex, name: id[0].toUpperCase() + id.slice(1), types: types.split('/'),
      base: { hp: +hp, atk: +atk, def: +def, spd: +spd }, family: fam,
      evolve: evoInto ? { level: +evoLvl, into: evoInto } : null,
    };
  }
  // Derive stage (1/2/3), exp yield, catch rate, learnset, size from the evolution links.
  const pre = {};
  for (const s of Object.values(SPECIES)) if (s.evolve) pre[s.evolve.into] = s.id;
  for (const s of Object.values(SPECIES)) {
    let stage = 1;
    for (let p = pre[s.id]; p; p = pre[p]) stage++;
    const single = stage === 1 && !s.evolve;
    s.stage = stage;
    s.legendary = s.id === 'articuno';
    s.exp = s.legendary ? 260 : s.id === 'magikarp' ? 40 : single ? 150 : [0, 60, 140, 230][stage];
    s.catchRate = CATCH_OVERRIDE[s.id] ?? (single ? 120 : [0, 190, 90, 45][stage]);
    s.size = SIZE_OVERRIDE[s.id] ?? (single ? 1.3 : [0, 1.0, 1.45, 1.9][stage]);
    const L = LEARN[s.family];
    s.learn = [];
    for (let i = 0; i < L.length; i += 2) s.learn.push([L[i], L[i + 1]]);
  }
})();
const SPECIES_IDS = Object.keys(SPECIES).sort((a, b) => SPECIES[a].dex - SPECIES[b].dex);

const ITEMS = {
  pokeball:    { name: 'Poké Ball',    price: 200,  ball: 1,   desc: 'Catches wild Pokémon.' },
  greatball:   { name: 'Great Ball',   price: 600,  ball: 1.5, desc: 'Better catch rate.' },
  ultraball:   { name: 'Ultra Ball',   price: 1200, ball: 2,   desc: 'High catch rate.' },
  potion:      { name: 'Potion',       price: 200,  heal: 20,  desc: 'Restores 20 HP.' },
  superpotion: { name: 'Super Potion', price: 600,  heal: 60,  desc: 'Restores 60 HP.' },
  hyperpotion: { name: 'Hyper Potion', price: 1200, heal: 120, desc: 'Restores 120 HP.' },
  revive:      { name: 'Revive',       price: 1500, revive: true, desc: 'Revives a fainted Pokémon to half HP.' },
};

// Biome ids (stored per tile) -> encounter table. w = weight; night = weight after dark.
const BIOME = { OCEAN: 0, BEACH: 1, MEADOW: 2, FOREST: 3, DESERT: 4, SNOW: 5, HILL: 6, TOWN: 7 };
const BIOME_NAMES = ['Ocean', 'Beach', 'Meadow', 'Forest', 'Desert', 'Tundra', 'Highlands', 'Town'];
const BIOME_LEVEL_BONUS = [0, 0, 0, 2, 4, 7, 5, 0];

const ENCOUNTERS = {
  [BIOME.MEADOW]: [{ id: 'pidgey', w: 25 }, { id: 'rattata', w: 25 }, { id: 'caterpie', w: 12 }, { id: 'weedle', w: 12 }, { id: 'pikachu', w: 5 },
    { id: 'ekans', w: 6 }, { id: 'spearow', w: 6 }, { id: 'jigglypuff', w: 4 }, { id: 'meowth', w: 5, night: 14 }, { id: 'oddish', w: 2, night: 14 },
    { id: 'clefairy', w: 0.5, night: 5 }, { id: 'eevee', w: 1 }],
  [BIOME.FOREST]: [{ id: 'caterpie', w: 18 }, { id: 'weedle', w: 18 }, { id: 'metapod', w: 5 }, { id: 'kakuna', w: 5 }, { id: 'oddish', w: 12 },
    { id: 'pikachu', w: 6 }, { id: 'venonat', w: 2, night: 16 }, { id: 'gastly', w: 1, night: 16 }, { id: 'scyther', w: 1.5 },
    { id: 'eevee', w: 2 }, { id: 'bulbasaur', w: 1.5 }],
  [BIOME.DESERT]: [{ id: 'sandshrew', w: 25 }, { id: 'diglett', w: 20 }, { id: 'cubone', w: 12 }, { id: 'ekans', w: 12 }, { id: 'spearow', w: 10 },
    { id: 'ponyta', w: 8 }, { id: 'geodude', w: 8 }, { id: 'vulpix', w: 6 }, { id: 'charmander', w: 1 }],
  [BIOME.SNOW]:   [{ id: 'swinub', w: 25 }, { id: 'snorunt', w: 22 }, { id: 'seel', w: 15 }, { id: 'sneasel', w: 8 }, { id: 'jynx', w: 4 },
    { id: 'articuno', w: 0.3, night: 1.5 }],
  [BIOME.BEACH]:  [{ id: 'krabby', w: 25 }, { id: 'tentacool', w: 20 }, { id: 'psyduck', w: 20 }, { id: 'magikarp', w: 15 }, { id: 'pidgey', w: 8 },
    { id: 'squirtle', w: 2 }, { id: 'dratini', w: 1.5 }],
  [BIOME.HILL]:   [{ id: 'geodude', w: 25 }, { id: 'machop', w: 18 }, { id: 'mankey', w: 15 }, { id: 'magnemite', w: 10 }, { id: 'spearow', w: 10 },
    { id: 'abra', w: 8 }, { id: 'onix', w: 6 }, { id: 'ponyta', w: 6 }],
};

// Six Gym Leaders, assigned to towns nearest-to-farthest from home so difficulty ramps outward.
const LEADERS = [
  { name: 'Erika',     title: 'Gym Leader', badge: 'Rainbow Badge', level: 12, team: ['oddish', 'bulbasaur', 'gloom'], color: '#3fa129' },
  { name: 'Brock',     title: 'Gym Leader', badge: 'Boulder Badge', level: 17, team: ['geodude', 'cubone', 'onix'], color: '#8a7a5a' },
  { name: 'Lt. Surge', title: 'Gym Leader', badge: 'Thunder Badge', level: 22, team: ['magnemite', 'pikachu', 'magneton'], color: '#e0b000' },
  { name: 'Blaine',    title: 'Gym Leader', badge: 'Volcano Badge', level: 28, team: ['vulpix', 'ponyta', 'charmeleon', 'rapidash'], color: '#e62829' },
  { name: 'Misty',     title: 'Gym Leader', badge: 'Cascade Badge', level: 34, team: ['psyduck', 'tentacruel', 'golduck', 'gyarados'], color: '#2980ef' },
  { name: 'Pryce',     title: 'Gym Leader', badge: 'Glacier Badge', level: 40, team: ['seel', 'sneasel', 'dewgong', 'piloswine', 'glalie'], color: '#3dcef3' },
];

const TOWN_NAMES = ['Pallet Town', 'Viridian City', 'Pewter City', 'Cerulean City', 'Vermilion City', 'Celadon City', 'Cinnabar Island'];
