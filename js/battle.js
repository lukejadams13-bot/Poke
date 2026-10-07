// battle.js — turn-based battles (wild + Gym Leader). Written as one async function so the
// flow reads like the game: choose action -> both sides act -> check faints -> repeat.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Stat stages: +1 = 1.5x, +2 = 2x, -1 = 0.67x ... same curve as the main games.
const stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const STAT_NAMES = { atk: 'Attack', def: 'Defense', spd: 'Speed' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const Battle = { drawn: { me: null, foe: null } };

// Animated 3D-model sprite first; fall back to the HOME render / Gen 5 animation, then the still sprite.
function setMonImg(img, mon, back) {
  const urls = back ? [pokeImg.back(mon), pokeImg.home(mon), pokeImg.back5(mon), pokeImg.pixel(mon)]
                   : [pokeImg.front(mon), pokeImg.home(mon), pokeImg.front5(mon), pokeImg.pixel(mon)];
  let i = 0;
  img.onerror = () => { if (++i < urls.length) img.src = urls[i]; };
  img.onload = () => {
    const home = img.naturalWidth > 200; // HOME renders are 512px; animated sprites are ~50-150px
    const scale = Math.max(1.6, Math.min(2.6, innerWidth / 420)) * (back ? 1.25 : 1);
    const shrink = Math.max(0.6, Math.min(1, innerWidth / 800)); // smaller on phones
    img.style.width = (home ? (back ? 230 : 190) * shrink : img.naturalWidth * scale * shrink) + 'px';
    img.style.setProperty('--flip', home && back ? -1 : 1); // HOME renders face left; flip for our side
  };
  img.src = urls[0];
}

function setPanel(side, mon) {
  const el = $(side === 'me' ? '#my-panel' : '#foe-panel');
  const mhp = maxHp(mon), pct = Math.max(0, mon.hp / mhp) * 100;
  el.querySelector('.name').textContent = monName(mon) + (mon.shiny ? ' ★' : '');
  el.querySelector('.lvl').textContent = `Lv. ${mon.level}`;
  el.querySelector('.types').innerHTML = SPECIES[mon.species].types
    .map((t) => `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
  const fill = el.querySelector('.hp .fill');
  fill.style.width = pct + '%';
  fill.style.background = pct > 50 ? 'linear-gradient(#6ff08a,#2fc456)' : pct > 20 ? 'linear-gradient(#ffe066,#f2b705)' : 'linear-gradient(#ff7a6e,#e8302a)';
  if (side === 'me') {
    el.querySelector('.hptext').textContent = `${mon.hp} / ${mhp}`;
    const lo = expForLevel(mon.level), hi = expForLevel(mon.level + 1);
    el.querySelector('.exp .fill').style.width = Math.min(100, ((mon.exp - lo) / (hi - lo)) * 100) + '%';
  }
  if (Battle.drawn[side] !== mon) {
    const img = $(side === 'me' ? '#my-sprite' : '#foe-sprite');
    img.className = '';
    setMonImg(img, mon, side === 'me');
    restartAnim(img, side === 'me' ? 'sendout' : 'appear');
    Battle.drawn[side] = mon;
  }
}

function restartAnim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function flashSprite(side) { restartAnim($(side === 'me' ? '#my-sprite' : '#foe-sprite'), 'hit'); }

// Shared by battle and overworld menus. Returns a message, or null if the item does nothing.
function useItemOn(itemId, mon) {
  const it = ITEMS[itemId], mhp = maxHp(mon);
  if (it.revive) {
    if (mon.hp > 0) return null;
    mon.hp = Math.floor(mhp / 2);
    return `${monName(mon)} was revived!`;
  }
  if (it.heal) {
    if (mon.hp <= 0 || mon.hp >= mhp) return null;
    const before = mon.hp;
    mon.hp = Math.min(mhp, mon.hp + it.heal);
    return `${monName(mon)} recovered ${mon.hp - before} HP.`;
  }
  return null;
}

// Dry-run of useItemOn: would this item do anything? (Doesn't change the Pokémon.)
function useItemOnPreview(itemId, mon) {
  const it = ITEMS[itemId];
  if (it.revive) return mon.hp <= 0;
  if (it.heal) return mon.hp > 0 && mon.hp < maxHp(mon);
  return false;
}

async function learnMove(mon, moveId) {
  if (mon.moves.includes(moveId)) return;
  const mv = MOVES[moveId];
  if (mon.moves.length < 4) {
    mon.moves.push(moveId);
    await UI.say(`${monName(mon)} learned ${mv.name}!`);
    return;
  }
  const i = await UI.choose(mon.moves.map((id) => ({ label: `Forget ${MOVES[id].name}`, fill: TYPE_COLORS[MOVES[id].type] })),
    { prompt: `${monName(mon)} wants to learn ${mv.name}, but already knows 4 moves.`, columns: 2 });
  if (i < 0) { await UI.say(`${monName(mon)} did not learn ${mv.name}.`); return; }
  const old = MOVES[mon.moves[i]].name;
  mon.moves[i] = moveId;
  await UI.say(`1, 2 and... Poof! ${monName(mon)} forgot ${old} and learned ${mv.name}!`);
}

// Poké Ball flies to the foe, sucks it in, wobbles. Visual only; the odds are decided before.
async function ballAnimation(shakes, caught, ballId) {
  const ball = $('#ball'), foe = $('#foe-sprite');
  ball.dataset.kind = ballId;
  ball.className = '';
  restartAnim(ball, 'throw');
  await sleep(650);
  foe.classList.add('captured');
  await sleep(450);
  for (let s = 0; s < shakes; s++) { restartAnim(ball, 'wobble'); await sleep(700); }
  if (caught) { ball.classList.add('caught'); await sleep(500); }
  else { ball.className = 'hidden'; foe.classList.remove('captured'); restartAnim(foe, 'appear'); }
}

// opts: { wild: mon, biome } or { trainer: { name, title, party, reward }, biome }
// Resolves to 'win' | 'lose' | 'run' | 'caught'.
async function runBattle(opts) {
  const trainer = opts.trainer || null;
  const foes = trainer ? trainer.party : [opts.wild];
  const party = game.party;
  let fi = 0, foe = foes[0];
  let me = party.find((m) => m.hp > 0);
  const stages = { me: { atk: 0, def: 0, spd: 0 }, foe: { atk: 0, def: 0, spd: 0 } };
  let participants = new Set([me]); // everyone who fought this foe shares the exp
  let runAttempts = 0;

  const label = (side) => side === 'me' ? monName(me) : `${trainer ? 'The opposing' : 'The wild'} ${monName(foe)}`;
  const spdOf = (side) => statOf(side === 'me' ? me : foe, 'spd') * stageMult(stages[side].spd);
  const refresh = () => { setPanel('me', me); setPanel('foe', foe); };

  Battle.drawn = { me: null, foe: null };
  const el = $('#battle');
  el.className = 'bg-' + (BIOME_NAMES[opts.biome ?? BIOME.MEADOW] || 'Meadow').toLowerCase();
  $('#ball').className = 'hidden';
  setPanel('foe', foe);
  $('#my-sprite').style.visibility = 'hidden';
  $('#my-panel').style.visibility = 'hidden';
  markSeen(foe.species);

  if (foe.shiny) await UI.say('✦ It sparkles! ✦');
  await UI.say(trainer ? `You are challenged by ${trainer.title} ${trainer.name}!` : `A wild ${monName(foe)} appeared!`);
  if (trainer) await UI.say(`${trainer.name} sent out ${monName(foe)}!`);
  $('#my-sprite').style.visibility = ''; $('#my-panel').style.visibility = '';
  setPanel('me', me);
  await UI.say(`Go! ${monName(me)}!`);

  // Foe AI: usually picks the move with the best expected damage, sometimes random.
  function pickFoeMove() {
    const usable = foe.moves.filter((id) => !(MOVES[id].flee && trainer));
    if (!trainer && usable.some((id) => MOVES[id].flee)) return usable.find((id) => MOVES[id].flee); // wild Abra teleports away
    if (Math.random() < 0.25) return pick(usable);
    let best = usable[0], bestScore = -1;
    for (const id of usable) {
      const mv = MOVES[id];
      const stab = SPECIES[foe.species].types.includes(mv.type) ? 1.5 : 1;
      let score = mv.cat === 'status' ? 15 : mv.fixed ? (mv.fixed === 'level' ? foe.level : mv.fixed) * 1.2 :
        mv.power * stab * typeEffect(mv.type, SPECIES[me.species].types) * (mv.acc / 100);
      if (mv.heal) score = foe.hp < maxHp(foe) * 0.4 ? 200 : 0;
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  // Returns 'fled' if the user teleported out of a wild battle.
  async function doMove(side, moveId) {
    const user = side === 'me' ? me : foe, target = side === 'me' ? foe : me;
    const tside = side === 'me' ? 'foe' : 'me';
    const mv = MOVES[moveId];
    await UI.say(`${label(side)} used ${mv.name}!`);
    if (mv.nothing) { await UI.say('But nothing happened!'); return; }
    if (mv.flee) {
      if (trainer) { await UI.say('But it failed!'); return; }
      await UI.say(`${label(side)} teleported away!`);
      return 'fled';
    }
    if (mv.heal) {
      const mhp = maxHp(user);
      if (user.hp >= mhp) { await UI.say(`${label(side)}'s HP is full!`); return; }
      user.hp = Math.min(mhp, user.hp + Math.floor(mhp * mv.heal));
      refresh();
      await UI.say(`${label(side)} restored its HP.`);
      return;
    }
    if (Math.random() * 100 >= mv.acc) { await UI.say(`${label(tside)} avoided the attack!`); return; }

    if (mv.cat === 'status') {
      for (const [whoKey, stat, delta] of mv.fx) {
        const who = whoKey === 'self' ? side : tside;
        const st = stages[who], before = st[stat];
        st[stat] = Math.max(-6, Math.min(6, before + delta));
        const how = Math.abs(delta) > 1 ? (delta > 0 ? 'rose sharply' : 'harshly fell') : (delta > 0 ? 'rose' : 'fell');
        if (st[stat] === before) await UI.say(`${label(who)}'s ${STAT_NAMES[stat]} won't go any ${delta > 0 ? 'higher' : 'lower'}!`);
        else await UI.say(`${label(who)}'s ${STAT_NAMES[stat]} ${how}!`);
      }
      return;
    }

    const eff = typeEffect(mv.type, SPECIES[target.species].types);
    if (eff === 0) { await UI.say(`It doesn't affect ${label(tside).replace(/^The/, 'the')}...`); return; }
    let dmg, crit = 1;
    if (mv.fixed) {
      dmg = mv.fixed === 'level' ? user.level : mv.fixed; // Seismic Toss, Night Shade, Dragon Rage, Sonic Boom
    } else {
      const atk = statOf(user, 'atk') * stageMult(stages[side].atk);
      const def = statOf(target, 'def') * stageMult(stages[tside].def);
      const stab = SPECIES[user.species].types.includes(mv.type) ? 1.5 : 1; // same-type attack bonus
      crit = Math.random() < 1 / 24 ? 1.5 : 1;
      dmg = Math.floor(((2 * user.level / 5 + 2) * mv.power * atk / def) / 50 + 2);
      dmg = Math.max(1, Math.floor(dmg * stab * eff * crit * (0.85 + Math.random() * 0.15)));
    }
    target.hp = Math.max(mv.falseSwipe ? Math.min(1, target.hp) : 0, target.hp - dmg);
    flashSprite(tside);
    refresh();
    await sleep(450);
    if (crit > 1) await UI.say('A critical hit!');
    if (!mv.fixed && eff > 1) await UI.say("It's super effective!");
    else if (!mv.fixed && eff < 1) await UI.say("It's not very effective...");
  }

  async function chooseFromParty(prompt, filter, cancelable = true) {
    const opts = party.map((m) => ({ ...monLabel(m), disabled: !filter(m) }));
    const i = await UI.choose(opts, { prompt, cancelable, columns: 2 });
    return i < 0 ? null : party[i];
  }

  async function chooseAction() {
    for (;;) {
      const i = await UI.choose([
        { label: 'Fight', fill: '#e8403a' }, { label: 'Bag', fill: '#f2a51a' },
        { label: 'Pokémon', fill: '#3fa129' }, { label: 'Run', fill: '#2980ef' }],
      { prompt: `What will ${monName(me)} do?`, cancelable: false, columns: 2 });
      if (i === 0) {
        const opts = me.moves.map((id) => {
          const mv = MOVES[id];
          const eff = mv.cat === 'status' || mv.fixed ? null : typeEffect(mv.type, SPECIES[foe.species].types);
          const hint = eff === null ? '' : eff === 0 ? ' · No effect' : eff > 1 ? ' · Super effective' : eff < 1 ? ' · Not very effective' : '';
          return { label: mv.name, sub: `${mv.type.toUpperCase()} · ${mv.power ? mv.power + ' power' : mv.fixed ? 'fixed dmg' : 'status'}${hint}`, fill: TYPE_COLORS[mv.type] };
        });
        const j = await UI.choose(opts, { prompt: 'Choose a move.', columns: 2 });
        if (j >= 0) return { type: 'move', move: me.moves[j] };
      } else if (i === 1) {
        const ids = Object.keys(ITEMS).filter((k) => game.bag[k] > 0);
        if (!ids.length) { await UI.say('Your Bag is empty!'); continue; }
        const opts = ids.map((k) => ({
          label: `${ITEMS[k].name} x${game.bag[k]}`, sub: ITEMS[k].ball && trainer ? "You can't catch another trainer's Pokémon!" : ITEMS[k].desc,
          disabled: !!(ITEMS[k].ball && trainer),
        }));
        const j = await UI.choose(opts, { prompt: 'Use which item?', columns: 2 });
        if (j < 0) continue;
        const item = ids[j];
        if (ITEMS[item].ball) return { type: 'ball', item };
        const target = await chooseFromParty(`Use ${ITEMS[item].name} on which Pokémon?`, (m) => useItemOnPreview(item, m));
        if (target) return { type: 'item', item, mon: target };
      } else if (i === 2) {
        const m = await chooseFromParty('Switch to which Pokémon?', (m) => m.hp > 0 && m !== me);
        if (m) return { type: 'switch', mon: m };
      } else {
        return { type: 'run' };
      }
    }
  }

  async function throwBall(item) {
    game.bag[item]--;
    await UI.say(`You threw a ${ITEMS[item].name}!`);
    const sp = SPECIES[foe.species], mhp = maxHp(foe);
    // Lower HP + higher catch rate + better ball = better odds (simplified main-series formula).
    const a = ((3 * mhp - 2 * foe.hp) / (3 * mhp)) * (sp.catchRate / 255) * ITEMS[item].ball;
    const p = Math.min(1, a * 1.3 + 0.02);
    const caught = Math.random() < p;
    let shakes = 3;
    if (!caught) { shakes = 0; while (shakes < 3 && Math.random() < Math.cbrt(p)) shakes++; shakes = Math.min(shakes, 2); }
    UI.hideText();
    await ballAnimation(shakes, caught, item);
    if (!caught) {
      await UI.say(['Oh no! The Pokémon broke free!', 'Aww! It appeared to be caught!', 'Aargh! Almost had it!', 'Gah! It was so close, too!'][shakes] || 'Oh no!');
      return false;
    }
    await UI.say(`Gotcha! ${monName(foe)} was caught!`);
    if (!game.caught[foe.species]) await UI.say(`${monName(foe)}'s data was added to the Pokédex.`);
    markCaught(foe.species);
    if (party.length < 6) party.push(foe);
    else { game.box.push(foe); await UI.say(`Your team is full, so ${monName(foe)} was sent to the PC Box.`); }
    return true;
  }

  async function awardExp() {
    const gainers = [...participants].filter((m) => m.hp > 0 && party.includes(m));
    if (!gainers.length) return;
    const total = Math.floor((SPECIES[foe.species].exp * foe.level) / 7 * (trainer ? 1.5 : 1));
    const each = Math.max(1, Math.floor(total / gainers.length));
    for (const m of gainers) {
      await UI.say(`${monName(m)} gained ${each} Exp. Points!`);
      const levels = addExp(m, each);
      refresh();
      for (const L of levels) {
        await UI.say(`${monName(m)} grew to Lv. ${L}!`);
        for (const mv of newMovesAt(m.species, L)) await learnMove(m, mv);
      }
    }
  }

  async function finish(result) {
    if (result !== 'lose') {
      // Evolutions happen after the battle, like the main games.
      for (const m of party) {
        const into = canEvolve(m);
        if (!into) continue;
        const from = monName(m);
        const img = $('#my-sprite');
        Battle.drawn.me = null; me = m; refresh();
        await UI.say(`What? ${from} is evolving!`);
        restartAnim(img, 'evolving');
        await sleep(1600);
        evolve(m, into);
        Battle.drawn.me = null; refresh();
        await UI.say(`Congratulations! Your ${from} evolved into ${SPECIES[into].name}!`);
        markSeen(into); markCaught(into);
      }
    }
    $('#battle').classList.add('hidden');
    $('#battle').className = 'hidden';
    UI.hideText();
    return result;
  }

  // ---- Main battle loop ----
  for (;;) {
    const act = await chooseAction();

    if (act.type === 'run') {
      if (trainer) { await UI.say("No! There's no running from a trainer battle!"); continue; }
      runAttempts++;
      if (spdOf('me') >= spdOf('foe') || Math.random() < 0.3 + runAttempts * 0.2) {
        await UI.say('You got away safely!');
        return finish('run');
      }
      await UI.say("You couldn't get away!");
      if (await doMove('foe', pickFoeMove()) === 'fled') return finish('run');
    } else if (act.type === 'ball') {
      if (await throwBall(act.item)) return finish('caught');
      if (await doMove('foe', pickFoeMove()) === 'fled') return finish('run');
    } else if (act.type === 'item') {
      game.bag[act.item]--;
      await UI.say(useItemOn(act.item, act.mon));
      refresh();
      if (await doMove('foe', pickFoeMove()) === 'fled') return finish('run');
    } else if (act.type === 'switch') {
      await UI.say(`${monName(me)}, come back!`);
      me = act.mon; stages.me = { atk: 0, def: 0, spd: 0 }; participants.add(me);
      refresh();
      await UI.say(`Go! ${monName(me)}!`);
      if (await doMove('foe', pickFoeMove()) === 'fled') return finish('run');
    } else {
      // Priority moves first, then the faster Pokémon (ties are a coin flip).
      const foeMove = pickFoeMove();
      const myP = MOVES[act.move].prio, foeP = MOVES[foeMove].prio;
      const meFirst = myP !== foeP ? myP > foeP : spdOf('me') === spdOf('foe') ? Math.random() < 0.5 : spdOf('me') > spdOf('foe');
      for (const side of meFirst ? ['me', 'foe'] : ['foe', 'me']) {
        if (me.hp <= 0 || foe.hp <= 0) break;
        if (await doMove(side, side === 'me' ? act.move : foeMove) === 'fled') return finish('run');
      }
    }

    if (foe.hp <= 0) {
      restartAnim($('#foe-sprite'), 'fainted');
      await UI.say(`${label('foe')} fainted!`);
      await awardExp();
      if (++fi < foes.length) {
        foe = foes[fi]; stages.foe = { atk: 0, def: 0, spd: 0 };
        participants = new Set(me.hp > 0 ? [me] : []);
        markSeen(foe.species);
        refresh();
        await UI.say(`${trainer.name} sent out ${monName(foe)}!`);
      } else {
        const reward = trainer ? trainer.reward : foe.level * 12 + randInt(0, 20);
        game.money += reward;
        await UI.say(trainer ? `You defeated ${trainer.title} ${trainer.name}! You got ₽${reward} for winning!` : `You picked up ₽${reward}.`);
        return finish('win');
      }
    }

    if (me.hp <= 0) {
      restartAnim($('#my-sprite'), 'fainted');
      await UI.say(`${monName(me)} fainted!`);
      if (!party.some((m) => m.hp > 0)) {
        await UI.say('You have no more Pokémon that can fight!');
        await UI.say('You blacked out!');
        return finish('lose');
      }
      me = await chooseFromParty('Send out which Pokémon?', (m) => m.hp > 0, false);
      stages.me = { atk: 0, def: 0, spd: 0 }; participants.add(me);
      refresh();
      await UI.say(`Go! ${monName(me)}!`);
    }
  }
}
