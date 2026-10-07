// monster.js — creature instances: stats, exp, moves, evolution.
// A creature is a plain object so it serializes straight into the save file.

function expForLevel(l) { return l <= 1 ? 0 : Math.floor(0.8 * l * l * l); }

function statOf(m, key) {
  const b = SPECIES[m.species].base[key];
  // Same shape as the classic formula, minus IVs/EVs to keep it readable.
  if (key === 'hp') return Math.floor((b * 2 * m.level) / 100) + m.level + 10;
  return Math.floor((b * 2 * m.level) / 100) + 5;
}
const maxHp = (m) => statOf(m, 'hp');
const monName = (m) => m.nick || SPECIES[m.species].name;

// Moves a creature of this level would know: the last 4 it learned.
function movesAt(speciesId, level) {
  const learned = [];
  for (const [l, id] of SPECIES[speciesId].learn) {
    if (l <= level && !learned.includes(id)) learned.push(id);
  }
  return learned.slice(-4);
}

function createMon(speciesId, level) {
  const m = { species: speciesId, level, exp: expForLevel(level), moves: movesAt(speciesId, level), hp: 0 };
  m.hp = maxHp(m);
  return m;
}

function healMon(m) { m.hp = maxHp(m); }

// Adds exp and levels up. Returns the list of levels reached so the battle can
// announce each one and offer new moves.
function addExp(m, amount) {
  const reached = [];
  m.exp += amount;
  while (m.level < 100 && m.exp >= expForLevel(m.level + 1)) {
    const before = maxHp(m);
    m.level++;
    m.hp += maxHp(m) - before; // level-ups also raise current HP by the gain
    reached.push(m.level);
  }
  return reached;
}

// Move ids this species learns exactly at `level`.
function newMovesAt(speciesId, level) {
  return SPECIES[speciesId].learn.filter(([l]) => l === level).map(([, id]) => id);
}

function canEvolve(m) {
  const evo = SPECIES[m.species].evolve;
  return evo && m.level >= evo.level ? evo.into : null;
}

function evolve(m, into) {
  const before = maxHp(m);
  m.species = into;
  m.hp = Math.max(1, m.hp + maxHp(m) - before);
}
