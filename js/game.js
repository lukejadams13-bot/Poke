// game.js — main loop, input, overworld rules (movement, wild spawns, towns), menus, save/load.

const SAVE_KEY = 'pokewilds-save-v2';
const MOVE_KEYS = { arrowup: 'f', w: 'f', arrowdown: 'b', s: 'b', arrowleft: 'l', a: 'l', arrowright: 'r', d: 'r' };
const WALK_SPEED = 4.2, RUN_SPEED = 7.5, PLAYER_R = 0.28;

const game = {
  mode: 'title', // title | world | dialog | menu | battle
  world: null, minimap: null,
  player: { x: 0, y: 0, z: 0, angle: 0, moving: false, running: false },
  party: [], box: [], bag: {}, money: 0, badges: [], seen: {}, caught: {},
  time: 8 * 60, lastCenter: 0, currentTown: null, showMap: true,
  wild: [], spawnTimer: 0, graceUntil: 0,
};

const markSeen = (id) => { game.seen[id] = 1; };
const markCaught = (id) => { game.seen[id] = 1; game.caught[id] = 1; };
const isNight = () => game.time < 6 * 60 || game.time >= 19 * 60;

// ---------- Input ----------
const held = new Set();      // lowercase keys currently held
const touchDirs = new Set(); // 'f' | 'b' | 'l' | 'r' from the on-screen pad

function pressButton(btn) {
  const key = btn === 'a' ? 'Enter' : 'Escape';
  if (UI.handleKey({ key })) return;
  if (game.mode !== 'world') return;
  if (btn === 'a') interact(); else openMenu();
}

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
  if (e.target.tagName === 'INPUT') return;
  if (e.repeat && ['enter', ' ', 'z', 'x', 'escape'].includes(k)) return; // holding confirm shouldn't skip dialog
  if (UI.handleKey(e)) { e.preventDefault(); return; }
  held.add(k);
  if (game.mode !== 'world') return;
  if (['enter', ' ', 'z'].includes(k)) pressButton('a');
  else if (['escape', 'x', 'tab'].includes(k)) pressButton('b');
  else if (k === 'm') { game.showMap = !game.showMap; $('#minimap').classList.toggle('hidden', !game.showMap); }
});
document.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { held.clear(); touchDirs.clear(); });

// Drag on the 3D view to orbit the camera; scroll / pinch-less wheel to zoom.
(() => {
  let drag = null;
  const cv = $('#world');
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    W3.yaw -= (e.clientX - drag.x) * 0.006;
    W3.pitch = Math.max(0.2, Math.min(1.25, W3.pitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('wheel', (e) => { W3.dist = Math.max(5, Math.min(24, W3.dist + e.deltaY * 0.01)); e.preventDefault(); }, { passive: false });
})();

// ---------- World helpers ----------
function startTown() { return game.world.towns[0]; }

function wildLevel(x, z, biome) {
  const s = startTown();
  const dist = Math.hypot(x - s.x, z - s.y);
  // Farther from home = tougher Pokémon. This is what gives the open world its progression.
  return Math.max(2, Math.min(70, Math.round(2 + dist / 7 + BIOME_LEVEL_BONUS[biome] + randInt(-1, 2))));
}

// Player collision: test a small box around the feet against blocked tiles.
function blockedAt(x, z) {
  for (const [ox, oz] of [[-PLAYER_R, -PLAYER_R], [PLAYER_R, -PLAYER_R], [-PLAYER_R, PLAYER_R], [PLAYER_R, PLAYER_R]]) {
    if (!isWalkable(game.world, Math.floor(x + ox), Math.floor(z + oz))) return true;
  }
  return false;
}

function placePlayer(x, z, angle = 0) {
  Object.assign(game.player, { x, z, angle, y: heightAt(game.world, x, z), moving: false });
  W3.snapCam = true;
}

// ---------- Overworld update ----------
function update(dt, now) {
  game.time = (game.time + dt * 2) % 1440; // 1 real second = 2 game minutes
  const p = game.player;

  // Camera rotation keys
  if (held.has('q')) W3.yaw += dt * 2.2;
  if (held.has('e')) W3.yaw -= dt * 2.2;

  // Movement relative to the camera: "forward" walks away from the camera.
  let ix = 0, iz = 0;
  for (const [k, d] of Object.entries(MOVE_KEYS)) if (held.has(k)) { if (d === 'f') iz -= 1; if (d === 'b') iz += 1; if (d === 'l') ix -= 1; if (d === 'r') ix += 1; }
  for (const d of touchDirs) { if (d === 'f') iz -= 1; if (d === 'b') iz += 1; if (d === 'l') ix -= 1; if (d === 'r') ix += 1; }
  const len = Math.hypot(ix, iz);
  p.moving = len > 0;
  p.running = held.has('shift');
  if (p.moving) {
    ix /= len; iz /= len;
    const sy = Math.sin(W3.yaw), cy = Math.cos(W3.yaw);
    const vx = ix * cy + iz * sy, vz = -ix * sy + iz * cy;
    const sp = (p.running ? RUN_SPEED : WALK_SPEED) * dt;
    // Slide along walls: try each axis separately.
    if (!blockedAt(p.x + vx * sp, p.z)) p.x += vx * sp;
    if (!blockedAt(p.x, p.z + vz * sp)) p.z += vz * sp;
    // Turn smoothly toward the walking direction.
    const target = Math.atan2(vx, vz);
    let diff = target - p.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.angle += diff * Math.min(1, dt * 14);
  }
  p.y = heightAt(game.world, p.x, p.z);

  const tx = Math.floor(p.x), tz = Math.floor(p.z);
  const town = townAt(game.world, tx, tz);
  if (town !== game.currentTown) { game.currentTown = town; if (town) UI.toast(town.name); }
  const door = game.world.doors[`${tx},${tz}`];
  if (door) { enterBuilding(door); return; }

  updateWild(dt, now);
}

// ---------- Wild Pokémon in the overworld ----------
function trySpawn(near = false) {
  const p = game.player, w = game.world;
  const a = Math.random() * Math.PI * 2, r = (near ? 6 : 14) + Math.random() * 26;
  const tx = Math.floor(p.x + Math.cos(a) * r), tz = Math.floor(p.z + Math.sin(a) * r);
  if (tx < 1 || tz < 1 || tx >= WORLD_W - 1 || tz >= WORLD_H - 1 || !isWalkable(w, tx, tz)) return;
  const weight = SPAWN_WEIGHT[tileAt(w, tx, tz)] || 0;
  if (Math.random() > weight) return;
  const b = biomeAt(w, tx, tz), table = ENCOUNTERS[b];
  if (!table) return;
  const night = isNight();
  const entry = weightedPick(table.map((e) => ({ ...e, w: night && e.night ? e.night : e.w })));
  let level = wildLevel(tx, tz, b);
  if (SPECIES[entry.id].legendary) level = Math.max(level, 50);
  const mon = createMon(entry.id, level);
  // High-level wild Pokémon show up already evolved.
  for (let into; (into = canEvolve(mon)); ) { evolve(mon, into); mon.moves = movesAt(into, level); healMon(mon); }
  if (Math.random() < 1 / 200) mon.shiny = true;
  const sp = SPECIES[mon.species];
  const wd = {
    mon, x: tx + 0.5, z: tz + 0.5, y: 0, homeX: tx + 0.5, homeZ: tz + 0.5, vx: 0, vz: 0, moving: false,
    wait: Math.random() * 2, phase: Math.random() * 10,
    bold: Math.random() < 0.35, // bold ones come toward you, like in the modern games
    floats: sp.types.includes('flying') && !['pidgey', 'spearow'].includes(sp.id) || ['gastly', 'haunter', 'magnemite', 'magneton'].includes(sp.id),
  };
  wd.y = heightAt(w, wd.x, wd.z);
  game.wild.push(wd);
  addWild3D(wd);
}

function clearWild() { game.wild.forEach(removeWild3D); game.wild = []; }

function updateWild(dt, now) {
  const p = game.player, w = game.world;
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = 0.2;
    if (game.wild.length < 22) trySpawn();
  }
  for (const wd of [...game.wild]) {
    const dx = p.x - wd.x, dz = p.z - wd.z, dist = Math.hypot(dx, dz);
    if (dist > 48) { removeWild3D(wd); game.wild.splice(game.wild.indexOf(wd), 1); continue; }

    // Touching a wild Pokémon starts the battle.
    if (dist < 0.45 + wd.scale * 0.22 && now > game.graceUntil && !game.currentTown) { startWildBattle(wd); return; }

    let tx = wd.homeX, tz = wd.homeZ, speed = 1.3;
    if (wd.bold && dist < 7 && !game.currentTown) { tx = p.x; tz = p.z; speed = 2.2; }
    else {
      wd.wait -= dt;
      if (wd.wait <= 0) {
        wd.wait = 2 + Math.random() * 4;
        wd.goalX = wd.homeX + (Math.random() - 0.5) * 7;
        wd.goalZ = wd.homeZ + (Math.random() - 0.5) * 7;
      }
      if (wd.goalX !== undefined) { tx = wd.goalX; tz = wd.goalZ; }
    }
    const gx = tx - wd.x, gz = tz - wd.z, gd = Math.hypot(gx, gz);
    wd.moving = gd > 0.25;
    if (wd.moving) {
      wd.vx = gx / gd; wd.vz = gz / gd;
      const nx = wd.x + wd.vx * speed * dt, nz = wd.z + wd.vz * speed * dt;
      const ok = isWalkable(w, Math.floor(nx), Math.floor(nz)) && biomeAt(w, Math.floor(nx), Math.floor(nz)) !== BIOME.TOWN;
      if (ok) { wd.x = nx; wd.z = nz; } else { wd.goalX = wd.x; wd.goalZ = wd.z; wd.moving = false; }
    }
    wd.y = heightAt(w, wd.x, wd.z);
  }
}

async function startWildBattle(wd) {
  game.mode = 'battle';
  game.wild.splice(game.wild.indexOf(wd), 1);
  removeWild3D(wd);
  await battleTransition();
  afterBattle(await runBattle({ wild: wd.mon, biome: biomeAt(game.world, Math.floor(wd.x), Math.floor(wd.z)) }));
}

function battleTransition() {
  const f = $('#flash');
  f.classList.remove('hidden', 'go'); void f.offsetWidth; f.classList.add('go');
  return new Promise((r) => setTimeout(() => { f.classList.add('hidden'); r(); }, 550));
}

async function afterBattle(result) {
  game.graceUntil = performance.now() + 2000; // a moment to walk away before the next encounter
  if (result === 'lose') {
    const t = game.world.towns[game.lastCenter];
    game.money = Math.floor(game.money / 2);
    game.party.forEach(healMon);
    placePlayer(t.x - 3.5, t.y - 0.8, 0);
    clearWild();
    game.currentTown = t;
    game.mode = 'dialog';
    await UI.say(`You hurried back to the Pokémon Center in ${t.name}. Your team was healed, but you dropped half your money.`);
    UI.hideText();
  }
  game.mode = 'world';
  saveGame();
}

// Talk to a nearby Gym Leader.
function interact() {
  const p = game.player;
  const L = game.world.leaders.find((l) => Math.hypot(l.x + 0.5 - p.x, l.y + 0.5 - p.z) < 1.9);
  if (L) leaderBattle(L);
}

async function leaderBattle(L) {
  game.mode = 'dialog';
  const data = LEADERS[L.id], town = game.world.towns[L.town];
  if (game.badges.includes(L.id)) {
    await UI.say(`${data.name}: You already have my ${data.badge}. The other Gym Leaders are waiting!`);
    UI.hideText(); game.mode = 'world'; return;
  }
  await UI.say(`${data.name}: Welcome to ${town.name}! I'm the Gym Leader here.`);
  const go = await UI.choose(['Battle!', 'Not yet'], { prompt: `Challenge ${data.name} for the ${data.badge}? (Their team is around Lv. ${data.level})`, cancelable: false });
  if (go !== 0) { await UI.say(`${data.name}: Train up and come back anytime.`); UI.hideText(); game.mode = 'world'; return; }
  // Ace (last Pokémon) is at full level, earlier ones a bit lower.
  const party = data.team.map((id, i) => createMon(id, data.level - (data.team.length - 1 - i) * 2));
  game.mode = 'battle';
  await battleTransition();
  const res = await runBattle({ trainer: { name: data.name, title: data.title, party, reward: data.level * 100 }, biome: BIOME.TOWN });
  if (res === 'win') {
    game.badges.push(L.id);
    game.mode = 'dialog';
    await UI.say(`${data.name}: What a battle! You've earned the ${data.badge}.`);
    await UI.say(`You received the ${data.badge}! (${game.badges.length}/${LEADERS.length} badges)`);
    if (game.badges.length === LEADERS.length) {
      await UI.say('You have collected every badge on the island!');
      await UI.say("You're the Champion! Keep exploring to complete your Pokédex.");
    }
  }
  afterBattle(res);
}

// ---------- Buildings ----------
async function enterBuilding(door) {
  game.mode = 'dialog';
  const p = game.player;
  if (door.kind === 'center') {
    game.party.forEach(healMon);
    game.lastCenter = door.town;
    await UI.say('Nurse Joy: Welcome to the Pokémon Center! ... Your Pokémon are fighting fit!');
    await boxMenu();
  } else {
    await martMenu();
  }
  UI.hideText();
  // Step back out the door so we don't re-trigger it.
  placePlayer(Math.floor(p.x) + 0.5, Math.floor(p.z) + 1.3, 0);
  game.mode = 'world';
  saveGame();
}

async function martMenu() {
  const ids = Object.keys(ITEMS);
  for (;;) {
    const i = await UI.choose(ids.map((k) => ({ label: `${ITEMS[k].name} <b>₽${ITEMS[k].price}</b>`, sub: `${ITEMS[k].desc} You have ${game.bag[k] || 0}.` })),
      { prompt: `Welcome to the Poké Mart! You have ₽${game.money}.`, columns: 2 });
    if (i < 0) return;
    const it = ITEMS[ids[i]];
    if (game.money < it.price) { await UI.say("You don't have enough money."); continue; }
    game.money -= it.price;
    game.bag[ids[i]] = (game.bag[ids[i]] || 0) + 1;
    UI.toast(`Bought a ${it.name}!`, 1000);
  }
}

const monLabel = (m) => ({ label: `${monName(m)}${m.shiny ? ' ★' : ''} <b>Lv. ${m.level}</b>`, sub: `HP ${m.hp}/${maxHp(m)} · ${SPECIES[m.species].types.join('/')}`, icon: pokeImg.home(m) });

async function boxMenu() {
  for (;;) {
    const i = await UI.choose(['Deposit', 'Withdraw'], { prompt: `PC Box: team ${game.party.length}/6, box ${game.box.length}.` });
    if (i < 0) return;
    if (i === 0) {
      if (game.party.length <= 1) { await UI.say("You can't deposit your last Pokémon!"); continue; }
      const j = await UI.choose(game.party.map(monLabel), { prompt: 'Deposit which Pokémon?', columns: 2 });
      if (j >= 0) game.box.push(...game.party.splice(j, 1));
    } else {
      if (!game.box.length) { await UI.say('The box is empty.'); continue; }
      if (game.party.length >= 6) { await UI.say('Your team is full.'); continue; }
      const j = await UI.choose(game.box.map(monLabel), { prompt: 'Withdraw which Pokémon?', columns: 2 });
      if (j >= 0) { const m = game.box.splice(j, 1)[0]; healMon(m); game.party.push(m); }
    }
  }
}

// ---------- Pause menu ----------
async function openMenu() {
  game.mode = 'menu';
  for (;;) {
    const i = await UI.choose([
      { label: 'Pokémon', fill: '#e8403a' }, { label: 'Bag', fill: '#f2a51a' }, { label: 'Pokédex', fill: '#3fa129' },
      { label: 'Save', fill: '#2980ef' }, { label: 'Controls', fill: '#6b6f7e' }],
    { prompt: `₽${game.money} · Badges ${game.badges.length}/${LEADERS.length}`, columns: 2 });
    if (i < 0) break;
    if (i === 0) await teamMenu();
    else if (i === 1) await bagMenu();
    else if (i === 2) {
      const seen = Object.keys(game.seen).length, caught = Object.keys(game.caught).length;
      const list = SPECIES_IDS.map((id) => game.caught[id] ? SPECIES[id].name : game.seen[id] ? `(${SPECIES[id].name})` : '???').join(', ');
      await UI.say(`Pokédex: seen ${seen}, caught ${caught} of ${SPECIES_IDS.length}.\n${list}`);
    } else if (i === 3) { saveGame(); await UI.say('Game saved.'); }
    else await UI.say(CONTROLS_TEXT);
  }
  UI.hideText();
  game.mode = 'world';
}

const CONTROLS_TEXT = 'Move: WASD / arrows (Shift to run) · Camera: drag, Q/E, scroll to zoom\nTalk / confirm: Enter, Space or Z · Menu / back: Esc or X · Map: M\nWild Pokémon roam the island. Walk into one to battle. Places farther from home have stronger Pokémon.';

async function teamMenu() {
  for (;;) {
    const i = await UI.choose(game.party.map(monLabel), { prompt: 'Your team', columns: 2 });
    if (i < 0) return;
    const m = game.party[i];
    const j = await UI.choose(['Summary', 'Make lead'], { prompt: `${monName(m)}?` });
    if (j === 0) {
      const sp = SPECIES[m.species];
      const next = m.level < 100 ? expForLevel(m.level + 1) - m.exp : 0;
      await UI.say(`#${String(sp.dex).padStart(3, '0')} ${monName(m)}${m.shiny ? ' ★' : ''}  Lv. ${m.level}  (${sp.types.join('/')})\n` +
        `HP ${m.hp}/${maxHp(m)}  ATK ${statOf(m, 'atk')}  DEF ${statOf(m, 'def')}  SPD ${statOf(m, 'spd')}\n` +
        `Moves: ${m.moves.map((id) => MOVES[id].name).join(', ')}\n` +
        `EXP to next level: ${next}${sp.evolve ? `  ·  Evolves at Lv. ${sp.evolve.level}` : ''}`);
    } else if (j === 1) {
      game.party.unshift(...game.party.splice(i, 1));
    }
  }
}

async function bagMenu() {
  for (;;) {
    const ids = Object.keys(ITEMS).filter((k) => game.bag[k] > 0);
    if (!ids.length) { await UI.say('Your bag is empty.'); return; }
    const i = await UI.choose(ids.map((k) => ({ label: `${ITEMS[k].name} x${game.bag[k]}`, sub: ITEMS[k].desc, disabled: !!ITEMS[k].ball })), { prompt: 'Bag', columns: 2 });
    if (i < 0) return;
    const item = ids[i];
    const j = await UI.choose(game.party.map((m) => ({ ...monLabel(m), disabled: !useItemOnPreview(item, m) })), { prompt: `Use ${ITEMS[item].name} on?`, columns: 2 });
    if (j < 0) continue;
    game.bag[item]--;
    await UI.say(useItemOn(item, game.party[j]));
  }
}

// ---------- Save / load ----------
function saveGame() {
  const p = game.player;
  const data = {
    v: 2, seed: game.world.seed, player: { x: p.x, z: p.z, angle: p.angle }, yaw: W3.yaw,
    party: game.party, box: game.box, bag: game.bag, money: game.money, badges: game.badges,
    seen: game.seen, caught: game.caught, time: game.time, lastCenter: game.lastCenter,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* private mode etc. — game still works */ }
}

function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}

function setupWorld(seed) {
  game.world = generateWorld(seed);
  game.minimap = renderMinimap(game.world);
  build3D(game.world);
  game.wild = [];
}

function loadGame(data) {
  setupWorld(data.seed);
  Object.assign(game, {
    party: data.party, box: data.box, bag: data.bag, money: data.money, badges: data.badges,
    seen: data.seen, caught: data.caught, time: data.time, lastCenter: data.lastCenter,
  });
  W3.yaw = data.yaw || 0;
  placePlayer(data.player.x, data.player.z, data.player.angle);
  game.currentTown = townAt(game.world, Math.floor(data.player.x), Math.floor(data.player.z));
  enterWorld();
}

function enterWorld() {
  $('#title').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#minimap').classList.toggle('hidden', !game.showMap);
  for (let i = 0; i < 600 && game.wild.length < 18; i++) trySpawn(true); // populate the area right away
  game.graceUntil = performance.now() + 2000;
  game.mode = 'world';
}

async function newGame(seed) {
  setupWorld(seed);
  const t = startTown();
  Object.assign(game, { party: [], box: [], bag: { pokeball: 5, potion: 3 }, money: 3000, badges: [], seen: {}, caught: {}, time: 8 * 60, lastCenter: 0, currentTown: t });
  W3.yaw = 0;
  placePlayer(t.x + 0.5, t.y + 2.5, 0);
  enterWorld();
  game.mode = 'dialog';
  await UI.say(`Welcome to the world of Pokémon! This is ${t.name}, your home town.`);
  await UI.say('Professor Oak: Wild Pokémon live all over this island, from the meadows and forests to the frozen north and the southern desert.');
  await UI.say("Professor Oak: You'll need a partner. Choose one of these three!");
  const starters = ['bulbasaur', 'charmander', 'squirtle'];
  const i = await UI.choose(starters.map((id) => ({ label: SPECIES[id].name, sub: `${SPECIES[id].types[0]} type`, fill: TYPE_COLORS[SPECIES[id].types[0]], icon: pokeImg.home({ species: id }) })),
    { prompt: 'Which Pokémon will you choose?', cancelable: false });
  const starter = createMon(starters[i], 5);
  game.party.push(starter);
  markCaught(starter.species);
  await UI.say(`You chose ${monName(starter)}! Take these Poké Balls and Potions too.`);
  await UI.say(`Six Gym Leaders are spread across the island. Beat them all to become Champion. The farther you travel from ${t.name}, the stronger the Pokémon get.`);
  await UI.say(CONTROLS_TEXT);
  UI.hideText();
  game.mode = 'world';
  saveGame();
}

// ---------- HUD + minimap ----------
let hudCache = '';
function drawHud(now) {
  const w = game.world, p = game.player;
  if (game.showMap) {
    const mm = $('#minimap').getContext('2d');
    mm.drawImage(game.minimap, 0, 0);
    for (const t of w.towns) { mm.fillStyle = '#fff'; mm.fillRect(t.x - 3, t.y - 3, 7, 7); mm.fillStyle = '#e8403a'; mm.fillRect(t.x - 2, t.y - 2, 5, 5); }
    // Player arrow pointing where they're facing.
    mm.save(); mm.translate(p.x, p.z); mm.rotate(-p.angle);
    mm.fillStyle = '#fff'; mm.beginPath(); mm.moveTo(0, 7); mm.lineTo(-5, -5); mm.lineTo(5, -5); mm.closePath(); mm.fill();
    mm.fillStyle = Math.floor(now / 300) % 2 ? '#ffd400' : '#e8403a'; mm.beginPath(); mm.moveTo(0, 5); mm.lineTo(-3, -3); mm.lineTo(3, -3); mm.closePath(); mm.fill();
    mm.restore();
  }
  const place = game.currentTown ? game.currentTown.name : BIOME_NAMES[biomeAt(w, Math.floor(p.x), Math.floor(p.z))];
  const hh = String(Math.floor(game.time / 60)).padStart(2, '0'), mi = String(Math.floor(game.time % 60)).padStart(2, '0');
  const hud = `${place}|₽${game.money} · Badges ${game.badges.length}/${LEADERS.length} · ${hh}:${mi} ${isNight() ? 'Night' : 'Day'}`;
  if (hud !== hudCache) {
    hudCache = hud;
    const [a, b] = hud.split('|');
    $('#hud-loc').textContent = a; $('#hud-info').textContent = b;
  }
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (document.body.dataset.mode !== game.mode) document.body.dataset.mode = game.mode; // CSS hooks (touch pad)
  if (game.mode === 'world') update(dt, now);
  else game.player.moving = false;
  if (game.world && game.mode !== 'battle') {
    render3D(now, dt, { player: game.player, wild: game.wild, minutes: game.time, badges: game.badges });
    drawHud(now);
  }
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
function setupTouch() {
  for (const b of document.querySelectorAll('#touch [data-dir]')) {
    const dir = b.dataset.dir;
    const on = (e) => { e.preventDefault(); e.stopPropagation(); touchDirs.add(dir); };
    const off = (e) => { e.preventDefault(); touchDirs.delete(dir); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  }
  for (const b of document.querySelectorAll('#touch [data-btn]')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); pressButton(b.dataset.btn); });
  }
}

function setupTitle() {
  const save = readSave();
  const box = $('#title-buttons');
  if (save) {
    const cont = document.createElement('button');
    cont.textContent = `Continue (${save.badges.length} badges, ${save.party.length} Pokémon)`;
    cont.onclick = () => loadGame(save);
    box.appendChild(cont);
  }
  const ng = document.createElement('button');
  ng.textContent = 'New Game';
  ng.onclick = () => {
    if (save && !confirm('Start over? Your current save will be replaced.')) return;
    const raw = $('#seed').value.trim();
    // Any text works as a seed: numbers directly, words get hashed.
    const seed = raw ? (/^\d+$/.test(raw) ? +raw : [...raw].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)) : Math.floor(Math.random() * 1e9);
    $('#title-buttons').innerHTML = '<p>Building the island...</p>';
    setTimeout(() => newGame(seed), 30); // let the message paint before the heavy build
  };
  box.appendChild(ng);
}

init3D($('#world'));
setupTouch();
setupTitle();
requestAnimationFrame(frame);
