// game.js — main loop, input, overworld logic, menus, save/load.

const TILE = 32;
const SAVE_KEY = 'pocketwilds-save-v1';
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_KEYS = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };

const game = {
  mode: 'title', // title | world | dialog | menu | battle
  world: null, minimap: null,
  player: { x: 0, y: 0, dir: 'down', moving: false, tx: 0, ty: 0, progress: 0 },
  party: [], box: [], bag: {}, money: 0, badges: [], seen: {}, caught: {},
  time: 8 * 60, lastCenter: 0, steps: 0, lastBattleStep: 0, currentTown: null, showMap: true,
};

const markSeen = (id) => { game.seen[id] = 1; };
const markCaught = (id) => { game.seen[id] = 1; game.caught[id] = 1; };
const isNight = () => game.time < 6 * 60 || game.time >= 19 * 60;

// ---------- Input ----------
const held = new Set();   // lowercase keys currently held
const dirStack = [];      // most recently pressed direction wins

function pressDir(dir) { const i = dirStack.indexOf(dir); if (i >= 0) dirStack.splice(i, 1); dirStack.push(dir); }
function releaseDir(dir) { const i = dirStack.indexOf(dir); if (i >= 0) dirStack.splice(i, 1); }

// Action buttons, shared by keyboard and touch. 'a' = confirm/interact, 'b' = cancel/menu.
function pressButton(btn) {
  const key = btn === 'a' ? 'Enter' : 'Escape';
  if (UI.handleKey({ key })) return;
  if (game.mode !== 'world' || game.player.moving) return;
  if (btn === 'a') interact(); else openMenu();
}

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
  if (e.target.tagName === 'INPUT') return;
  if (e.repeat && ['enter', ' ', 'z', 'x', 'escape'].includes(k)) return; // holding confirm shouldn't skip dialog
  if (UI.handleKey(e)) { e.preventDefault(); return; }
  held.add(k);
  if (DIR_KEYS[k]) pressDir(DIR_KEYS[k]);
  if (game.mode !== 'world') return;
  if (['enter', ' ', 'z'].includes(k)) pressButton('a');
  else if (['escape', 'x', 'tab'].includes(k)) pressButton('b');
  else if (k === 'm') { game.showMap = !game.showMap; $('#minimap').classList.toggle('hidden', !game.showMap); }
});
document.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); held.delete(k); if (DIR_KEYS[k]) releaseDir(DIR_KEYS[k]); });
window.addEventListener('blur', () => { held.clear(); dirStack.length = 0; });

// ---------- World setup ----------
function setupWorld(seed) {
  game.world = generateWorld(seed);
  game.minimap = renderMinimap(game.world);
}

function startTown() { return game.world.towns[0]; }

function wildLevel(x, y, biome) {
  const s = startTown();
  const dist = Math.hypot(x - s.x, y - s.y);
  // Farther from home = tougher creatures. This is what makes the open world "flow".
  return Math.max(2, Math.min(70, Math.round(2 + dist / 7 + BIOME_LEVEL_BONUS[biome] + randInt(-1, 2))));
}

// ---------- Overworld update ----------
function update(dt) {
  game.time = (game.time + dt * 2) % 1440; // 1 real second = 2 game minutes
  const p = game.player;
  if (p.moving) {
    p.progress += dt * (held.has('shift') ? 9 : 5);
    if (p.progress >= 1) {
      p.x = p.tx; p.y = p.ty; p.moving = false; p.progress = 0;
      onStep();
    }
    return;
  }
  const dir = dirStack[dirStack.length - 1];
  if (!dir) return;
  p.dir = dir;
  const [dx, dy] = DIRS[dir];
  if (isWalkable(game.world, p.x + dx, p.y + dy)) { p.tx = p.x + dx; p.ty = p.y + dy; p.moving = true; }
}

function onStep() {
  const w = game.world, p = game.player;
  game.steps++;
  const town = townAt(w, p.x, p.y);
  if (town !== game.currentTown) { game.currentTown = town; if (town) UI.toast(town.name); }
  const door = w.doors[`${p.x},${p.y}`];
  if (door) { enterBuilding(door); return; }
  const rate = ENCOUNTER_RATE[tileAt(w, p.x, p.y)] || 0;
  if (game.steps - game.lastBattleStep > 3 && Math.random() < rate) wildBattle();
}

async function wildBattle() {
  game.mode = 'battle';
  const p = game.player, b = biomeAt(game.world, p.x, p.y);
  const table = ENCOUNTERS[b];
  if (!table) { game.mode = 'world'; return; }
  const night = isNight();
  const entry = weightedPick(table.map((e) => ({ ...e, w: night && e.night ? e.night : e.w })));
  let level = wildLevel(p.x, p.y, b);
  if (SPECIES[entry.id].legendary) level = Math.max(level, 40);
  const mon = createMon(entry.id, level);
  // High-level wild creatures show up already evolved.
  for (let into; (into = canEvolve(mon)); ) { evolve(mon, into); mon.moves = movesAt(into, level); healMon(mon); }
  afterBattle(await runBattle({ wild: mon }));
}

async function afterBattle(result) {
  game.lastBattleStep = game.steps;
  if (result === 'lose') {
    const t = game.world.towns[game.lastCenter];
    game.money = Math.floor(game.money / 2);
    game.party.forEach(healMon);
    Object.assign(game.player, { x: t.x - 4, y: t.y - 1, dir: 'down', moving: false });
    game.currentTown = t;
    game.mode = 'dialog';
    await UI.say(`Your team was healed at ${t.name}'s Healing Center. You lost half your money.`);
    UI.hideText();
  }
  game.mode = 'world';
  saveGame();
}

// Facing tile interaction (leaders).
function interact() {
  const p = game.player, [dx, dy] = DIRS[p.dir];
  const L = game.world.leaders.find((l) => l.x === p.x + dx && l.y === p.y + dy);
  if (L) leaderBattle(L);
}

async function leaderBattle(L) {
  game.mode = 'dialog';
  const data = LEADERS[L.id], town = game.world.towns[L.town];
  if (game.badges.includes(L.id)) {
    await UI.say(`${data.name}: You already have my ${data.badge}. The other leaders are waiting!`);
    UI.hideText(); game.mode = 'world'; return;
  }
  await UI.say(`${data.name}: Welcome to ${town.name}. I'm the ${data.title} here.`);
  const go = await UI.choose(['Battle!', 'Not yet'], { prompt: `Battle ${data.name} for the ${data.badge}? (Their team is around Lv ${data.level})`, cancelable: false });
  if (go !== 0) { await UI.say(`${data.name}: Train up and come back anytime.`); UI.hideText(); game.mode = 'world'; return; }
  // Ace (last creature) is at full level, earlier ones a bit lower.
  const party = data.team.map((id, i) => createMon(id, data.level - (data.team.length - 1 - i) * 2));
  game.mode = 'battle';
  const res = await runBattle({ trainer: { name: data.name, title: data.title, party, reward: data.level * 80 } });
  if (res === 'win') {
    game.badges.push(L.id);
    game.mode = 'dialog';
    await UI.say(`${data.name}: Incredible battle! You've earned this ${data.badge}.`);
    await UI.say(`You received the ${data.badge}! (${game.badges.length}/${LEADERS.length} badges)`);
    if (game.badges.length === LEADERS.length) {
      await UI.say('You have collected every badge on the island!');
      await UI.say('You are the Champion of Pocket Wilds! Keep exploring to fill your Dex.');
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
    await UI.say('Welcome to the Healing Center! Your team is fully restored.');
    await boxMenu();
  } else {
    await martMenu();
  }
  UI.hideText();
  // Step back out the door so we don't re-trigger it.
  p.y += 1; p.dir = 'down';
  game.mode = 'world';
  saveGame();
}

async function martMenu() {
  const ids = Object.keys(ITEMS);
  for (;;) {
    const i = await UI.choose(ids.map((k) => ({ label: `${ITEMS[k].name} <b>$${ITEMS[k].price}</b>`, sub: `${ITEMS[k].desc} You have ${game.bag[k] || 0}.` })),
      { prompt: `Welcome to the Mart! You have $${game.money}.`, columns: 2 });
    if (i < 0) return;
    const it = ITEMS[ids[i]];
    if (game.money < it.price) { await UI.say("You don't have enough money."); continue; }
    game.money -= it.price;
    game.bag[ids[i]] = (game.bag[ids[i]] || 0) + 1;
    UI.toast(`Bought a ${it.name}!`, 1000);
  }
}

const monLabel = (m) => ({ label: `${monName(m)} <b>Lv ${m.level}</b>`, sub: `HP ${m.hp}/${maxHp(m)} · ${SPECIES[m.species].types.join('/')}` });

async function boxMenu() {
  for (;;) {
    const i = await UI.choose(['Deposit', 'Withdraw'], { prompt: `Storage box: team ${game.party.length}/6, box ${game.box.length}.` });
    if (i < 0) return;
    if (i === 0) {
      if (game.party.length <= 1) { await UI.say("You can't deposit your last creature!"); continue; }
      const j = await UI.choose(game.party.map(monLabel), { prompt: 'Deposit which creature?', columns: 2 });
      if (j >= 0) game.box.push(...game.party.splice(j, 1));
    } else {
      if (!game.box.length) { await UI.say('The box is empty.'); continue; }
      if (game.party.length >= 6) { await UI.say('Your team is full.'); continue; }
      const j = await UI.choose(game.box.map(monLabel), { prompt: 'Withdraw which creature?', columns: 2 });
      if (j >= 0) { const m = game.box.splice(j, 1)[0]; healMon(m); game.party.push(m); }
    }
  }
}

// ---------- Pause menu ----------
async function openMenu() {
  game.mode = 'menu';
  for (;;) {
    const i = await UI.choose(['Team', 'Bag', 'Dex', 'Save', 'Controls'],
      { prompt: `$${game.money} · Badges ${game.badges.length}/${LEADERS.length}`, columns: 2 });
    if (i < 0) break;
    if (i === 0) await teamMenu();
    else if (i === 1) await bagMenu();
    else if (i === 2) {
      const seen = Object.keys(game.seen).length, caught = Object.keys(game.caught).length;
      const list = SPECIES_IDS.map((id) => game.caught[id] ? SPECIES[id].name : game.seen[id] ? `(${SPECIES[id].name})` : '???').join(', ');
      await UI.say(`Dex: seen ${seen}, caught ${caught} of ${SPECIES_IDS.length}.\n${list}`);
    } else if (i === 3) { saveGame(); await UI.say('Game saved.'); }
    else await UI.say(CONTROLS_TEXT);
  }
  UI.hideText();
  game.mode = 'world';
}

const CONTROLS_TEXT = 'Move: arrows/WASD (hold Shift to run)\nTalk / confirm: Enter, Space or Z\nMenu / back: Esc or X\nToggle map: M\nTall grass, desert, snow, beach and highlands hide wild creatures. Areas farther from home are tougher.';

async function teamMenu() {
  for (;;) {
    const i = await UI.choose(game.party.map(monLabel), { prompt: 'Your team', columns: 2 });
    if (i < 0) return;
    const m = game.party[i];
    const j = await UI.choose(['Summary', 'Make lead'], { prompt: `${monName(m)}?` });
    if (j === 0) {
      const sp = SPECIES[m.species];
      const next = m.level < 100 ? expForLevel(m.level + 1) - m.exp : 0;
      await UI.say(`${monName(m)}  Lv ${m.level}  (${sp.types.join('/')})\n` +
        `HP ${m.hp}/${maxHp(m)}  ATK ${statOf(m, 'atk')}  DEF ${statOf(m, 'def')}  SPD ${statOf(m, 'spd')}\n` +
        `Moves: ${m.moves.map((id) => MOVES[id].name).join(', ')}\n` +
        `EXP to next level: ${next}${sp.evolve ? `  ·  Evolves at Lv ${sp.evolve.level}` : ''}`);
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
    v: 1, seed: game.world.seed, player: { x: p.x, y: p.y, dir: p.dir },
    party: game.party, box: game.box, bag: game.bag, money: game.money, badges: game.badges,
    seen: game.seen, caught: game.caught, time: game.time, lastCenter: game.lastCenter, steps: game.steps,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* private mode etc. — game still works */ }
}

function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}

function loadGame(data) {
  setupWorld(data.seed);
  Object.assign(game, {
    party: data.party, box: data.box, bag: data.bag, money: data.money, badges: data.badges,
    seen: data.seen, caught: data.caught, time: data.time, lastCenter: data.lastCenter, steps: data.steps, lastBattleStep: data.steps,
  });
  Object.assign(game.player, data.player, { moving: false, progress: 0 });
  game.currentTown = townAt(game.world, game.player.x, game.player.y);
  enterWorld();
}

function enterWorld() {
  $('#title').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#minimap').classList.toggle('hidden', !game.showMap);
  game.mode = 'world';
}

async function newGame(seed) {
  setupWorld(seed);
  const t = startTown();
  Object.assign(game, { party: [], box: [], bag: { orb: 5, potion: 3 }, money: 500, badges: [], seen: {}, caught: {}, time: 8 * 60, lastCenter: 0, steps: 0, lastBattleStep: 0, currentTown: t });
  Object.assign(game.player, { x: t.x, y: t.y + 2, dir: 'down', moving: false, progress: 0 });
  enterWorld();
  game.mode = 'dialog';
  await UI.say(`Welcome to the island of Pocket Wilds! This is ${t.name}, your home town.`);
  await UI.say('Professor Alder: Wild creatures live everywhere on this island, from the meadows to the frozen north and the southern deserts.');
  await UI.say("Professor Alder: You'll need a partner. Choose one!");
  const starters = ['sproutle', 'embercub', 'puddlefin'];
  const i = await UI.choose(starters.map((id) => ({ label: SPECIES[id].name, sub: `${SPECIES[id].types[0]} type`, color: TYPE_COLORS[SPECIES[id].types[0]] })),
    { prompt: 'Which partner will you choose?', cancelable: false });
  const starter = createMon(starters[i], 5);
  game.party.push(starter);
  markCaught(starter.species);
  await UI.say(`You chose ${monName(starter)}! Take these Capture Orbs and Potions too.`);
  await UI.say(`Six Leaders are spread across the island. Beat them all to become Champion. The farther you travel from ${t.name}, the stronger things get.`);
  await UI.say(CONTROLS_TEXT);
  UI.hideText();
  game.mode = 'world';
  saveGame();
}

// ---------- Rendering ----------
const canvas = $('#world');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; ctx.imageSmoothingEnabled = false; }
window.addEventListener('resize', resize);

function darkness() {
  const h = game.time / 60;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return ((h - 18) / 3) * 0.5;
  if (h >= 5 && h < 7) return ((7 - h) / 2) * 0.5;
  return 0.5;
}

let hudCache = '';
function render(now) {
  const w = game.world, p = game.player, W = canvas.width, H = canvas.height;
  const px = p.moving ? p.x + (p.tx - p.x) * p.progress : p.x;
  const py = p.moving ? p.y + (p.ty - p.y) * p.progress : p.y;
  const camX = Math.round(px * TILE + TILE / 2 - W / 2), camY = Math.round(py * TILE + TILE / 2 - H / 2);
  const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
  const x1 = Math.ceil((camX + W) / TILE), y1 = Math.ceil((camY + H) / TILE);

  // Only draw tiles on screen (~2k per frame), not the whole 65k-tile map.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTile(ctx, w, x, y, x * TILE - camX, y * TILE - camY, TILE, now);

  for (const L of w.leaders) {
    const sx = L.x * TILE - camX, sy = L.y * TILE - camY;
    if (sx < -TILE || sy < -TILE || sx > W || sy > H) continue;
    drawPerson(ctx, sx, sy, TILE, 'down', { shirt: LEADERS[L.id].color, hat: '#222' });
    if (!game.badges.includes(L.id)) { // "!" bubble on leaders you haven't beaten
      ctx.fillStyle = '#fff'; ctx.fillRect(sx + TILE * 0.35, sy - TILE * 0.55, TILE * 0.3, TILE * 0.45);
      ctx.fillStyle = '#d03030'; ctx.font = `bold ${TILE * 0.4}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('!', sx + TILE / 2, sy - TILE * 0.2);
    }
  }

  const psx = Math.round(px * TILE - camX), psy = Math.round(py * TILE - camY);
  drawPerson(ctx, psx, psy, TILE, p.dir, {}, p.moving ? p.progress : 0);
  // Grass in front of the player's legs, so it looks like you're wading through it.
  const under = tileAt(w, Math.round(px), Math.round(py));
  if (under === T.TALL || under === T.FROST) {
    ctx.fillStyle = under === T.TALL ? 'rgba(63,154,58,0.85)' : 'rgba(207,230,240,0.85)';
    ctx.fillRect(psx + 2, psy + TILE * 0.7, TILE - 4, TILE * 0.3);
  }

  const dark = darkness();
  if (dark > 0) { ctx.fillStyle = `rgba(10,15,50,${dark})`; ctx.fillRect(0, 0, W, H); }

  if (game.showMap) {
    const mm = $('#minimap').getContext('2d');
    mm.drawImage(game.minimap, 0, 0);
    for (const t of w.towns) { mm.fillStyle = '#fff'; mm.fillRect(t.x - 3, t.y - 3, 7, 7); mm.fillStyle = '#d84040'; mm.fillRect(t.x - 2, t.y - 2, 5, 5); }
    mm.fillStyle = Math.floor(now / 300) % 2 ? '#ffff00' : '#000'; // blinking "you are here"
    mm.fillRect(Math.round(px) - 3, Math.round(py) - 3, 7, 7);
  }

  const place = game.currentTown ? game.currentTown.name : BIOME_NAMES[biomeAt(w, p.x, p.y)];
  const hh = String(Math.floor(game.time / 60)).padStart(2, '0'), mm = String(Math.floor(game.time % 60)).padStart(2, '0');
  const hud = `${place}|$${game.money} · Badges ${game.badges.length}/${LEADERS.length} · ${hh}:${mm} ${isNight() ? 'Night' : 'Day'}`;
  if (hud !== hudCache) { // avoid touching the DOM every frame
    hudCache = hud;
    const [a, b] = hud.split('|');
    $('#hud-loc').textContent = a; $('#hud-info').textContent = b;
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (document.body.dataset.mode !== game.mode) document.body.dataset.mode = game.mode; // CSS hooks (touch pad)
  if (game.mode === 'world') update(dt);
  if (game.world && game.mode !== 'battle') render(now);
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
function setupTouch() {
  for (const b of document.querySelectorAll('#touch [data-dir]')) {
    const dir = b.dataset.dir;
    const on = (e) => { e.preventDefault(); pressDir(dir); };
    const off = (e) => { e.preventDefault(); releaseDir(dir); };
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
    cont.textContent = `Continue (${save.badges.length} badges, ${save.party.length} on team)`;
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
    newGame(seed);
  };
  box.appendChild(ng);
}

resize();
setupTouch();
setupTitle();
requestAnimationFrame(frame);
