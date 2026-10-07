// battle.js — turn-based battles (wild + leader). Written as one async function so the
// flow reads like the game: choose action -> both sides act -> check faints -> repeat.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Stat stages: +1 = 1.5x, +2 = 2x, -1 = 0.67x ... same curve as the classic games.
const stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const STAT_NAMES = { atk: 'Attack', def: 'Defense', spd: 'Speed' };

const Battle = { drawn: { me: null, foe: null } };

function setPanel(side, mon) {
  const el = $(side === 'me' ? '#my-panel' : '#foe-panel');
  const mhp = maxHp(mon), pct = Math.max(0, mon.hp / mhp) * 100;
  el.querySelector('.name').textContent = monName(mon);
  el.querySelector('.lvl').textContent = `Lv ${mon.level}`;
  el.querySelector('.types').innerHTML = SPECIES[mon.species].types
    .map((t) => `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
  const fill = el.querySelector('.hp .fill');
  fill.style.width = pct + '%';
  fill.style.background = pct > 50 ? '#4cd964' : pct > 20 ? '#ffcc00' : '#ff3b30';
  if (side === 'me') {
    el.querySelector('.hptext').textContent = `${mon.hp} / ${mhp}`;
    const lo = expForLevel(mon.level), hi = expForLevel(mon.level + 1);
    el.querySelector('.exp .fill').style.width = Math.min(100, ((mon.exp - lo) / (hi - lo)) * 100) + '%';
  }
  // Only redraw the sprite canvas when the creature on that side changes.
  const key = mon.species + ':' + side;
  if (Battle.drawn[side] !== key) {
    const cv = $(side === 'me' ? '#my-sprite' : '#foe-sprite');
    drawMon(cv, mon.species, side === 'foe');
    cv.classList.remove('fainted', 'captured');
    Battle.drawn[side] = key;
  }
}

function flashSprite(side) {
  const cv = $(side === 'me' ? '#my-sprite' : '#foe-sprite');
  cv.classList.remove('hit'); void cv.offsetWidth; cv.classList.add('hit'); // restart CSS animation
}

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

async function learnMove(mon, moveId) {
  if (mon.moves.includes(moveId)) return;
  const mv = MOVES[moveId];
  if (mon.moves.length < 4) {
    mon.moves.push(moveId);
    await UI.say(`${monName(mon)} learned ${mv.name}!`);
    return;
  }
  const i = await UI.choose(mon.moves.map((id) => ({ label: `Forget ${MOVES[id].name}`, color: TYPE_COLORS[MOVES[id].type] })),
    { prompt: `${monName(mon)} wants to learn ${mv.name}, but already knows 4 moves.`, columns: 2 });
  if (i < 0) { await UI.say(`${monName(mon)} did not learn ${mv.name}.`); return; }
  const old = MOVES[mon.moves[i]].name;
  mon.moves[i] = moveId;
  await UI.say(`${monName(mon)} forgot ${old} and learned ${mv.name}!`);
}

// opts: { wild: mon } or { trainer: { name, title, party, reward } }
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

  const label = (side) => side === 'me' ? monName(me) : `${trainer ? 'Foe' : 'Wild'} ${monName(foe)}`;
  const spdOf = (side) => statOf(side === 'me' ? me : foe, 'spd') * stageMult(stages[side].spd);
  const refresh = () => { setPanel('me', me); setPanel('foe', foe); };

  Battle.drawn = { me: null, foe: null };
  $('#battle').classList.remove('hidden');
  refresh();
  markSeen(foe.species);

  await UI.say(trainer ? `${trainer.title} ${trainer.name} wants to battle!` : `A wild ${monName(foe)} appeared!`);
  if (trainer) await UI.say(`${trainer.name} sent out ${monName(foe)}!`);
  await UI.say(`Go, ${monName(me)}!`);

  // Foe AI: usually picks the move with the best expected damage, sometimes random.
  function pickFoeMove() {
    if (Math.random() < 0.3) return pick(foe.moves);
    let best = foe.moves[0], bestScore = -1;
    for (const id of foe.moves) {
      const mv = MOVES[id];
      const stab = SPECIES[foe.species].types.includes(mv.type) ? 1.5 : 1;
      const score = mv.cat === 'status' ? 15 : mv.power * stab * typeEffect(mv.type, SPECIES[me.species].types) * (mv.acc / 100);
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  async function doMove(side, moveId) {
    const user = side === 'me' ? me : foe, target = side === 'me' ? foe : me;
    const tside = side === 'me' ? 'foe' : 'me';
    const mv = MOVES[moveId];
    await UI.say(`${label(side)} used ${mv.name}!`);
    if (Math.random() * 100 >= mv.acc) { await UI.say(`${label(side)}'s attack missed!`); return; }

    if (mv.cat === 'status') {
      const who = mv.effect.who === 'self' ? side : tside;
      const st = stages[who], before = st[mv.effect.stat];
      st[mv.effect.stat] = Math.max(-6, Math.min(6, before + mv.effect.delta));
      const name = STAT_NAMES[mv.effect.stat];
      if (st[mv.effect.stat] === before) await UI.say(`${label(who)}'s ${name} won't go any ${mv.effect.delta > 0 ? 'higher' : 'lower'}!`);
      else await UI.say(`${label(who)}'s ${name} ${mv.effect.delta > 0 ? 'rose' : 'fell'}!`);
      return;
    }

    const eff = typeEffect(mv.type, SPECIES[target.species].types);
    if (eff === 0) { await UI.say(`It doesn't affect ${label(tside)}...`); return; }
    const atk = statOf(user, 'atk') * stageMult(stages[side].atk);
    const def = statOf(target, 'def') * stageMult(stages[tside].def);
    const stab = SPECIES[user.species].types.includes(mv.type) ? 1.5 : 1; // same-type attack bonus
    const crit = Math.random() < 1 / 16 ? 1.5 : 1;
    // Classic damage formula shape: level and power scale it, atk/def ratio adjusts it.
    let dmg = Math.floor(((2 * user.level / 5 + 2) * mv.power * atk / def) / 50 + 2);
    dmg = Math.max(1, Math.floor(dmg * stab * eff * crit * (0.85 + Math.random() * 0.15)));
    target.hp = Math.max(0, target.hp - dmg);
    flashSprite(tside);
    refresh();
    await sleep(400);
    if (crit > 1) await UI.say('A critical hit!');
    if (eff > 1) await UI.say("It's super effective!");
    else if (eff < 1) await UI.say("It's not very effective...");
  }

  async function chooseFromParty(prompt, filter, cancelable = true) {
    const opts = party.map((m) => ({
      label: `${monName(m)} <b>Lv ${m.level}</b>`,
      sub: `HP ${m.hp}/${maxHp(m)} · ${SPECIES[m.species].types.join('/')}`,
      disabled: !filter(m),
    }));
    const i = await UI.choose(opts, { prompt, cancelable, columns: 2 });
    return i < 0 ? null : party[i];
  }

  async function chooseAction() {
    for (;;) {
      const i = await UI.choose(['Fight', 'Bag', 'Team', 'Run'], { prompt: `What will ${monName(me)} do?`, cancelable: false, columns: 2 });
      if (i === 0) {
        const opts = me.moves.map((id) => {
          const mv = MOVES[id];
          return { label: mv.name, sub: `${mv.type} · ${mv.power ? mv.power + ' power' : 'status'} · ${mv.acc}% acc`, color: TYPE_COLORS[mv.type] };
        });
        const j = await UI.choose(opts, { prompt: 'Choose a move.', columns: 2 });
        if (j >= 0) return { type: 'move', move: me.moves[j] };
      } else if (i === 1) {
        const ids = Object.keys(ITEMS).filter((k) => game.bag[k] > 0);
        if (!ids.length) { await UI.say('Your bag is empty!'); continue; }
        const opts = ids.map((k) => ({
          label: `${ITEMS[k].name} x${game.bag[k]}`, sub: ITEMS[k].ball && trainer ? "Can't catch a leader's creature" : ITEMS[k].desc,
          disabled: !!(ITEMS[k].ball && trainer),
        }));
        const j = await UI.choose(opts, { prompt: 'Use which item?', columns: 2 });
        if (j < 0) continue;
        const item = ids[j];
        if (ITEMS[item].ball) return { type: 'ball', item };
        const target = await chooseFromParty(`Use ${ITEMS[item].name} on which creature?`, (m) => useItemOnPreview(item, m));
        if (target) return { type: 'item', item, mon: target };
      } else if (i === 2) {
        const m = await chooseFromParty('Switch to which creature?', (m) => m.hp > 0 && m !== me);
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
    // Lower HP + higher catch rate + better orb = better odds.
    const a = ((3 * mhp - 2 * foe.hp) / (3 * mhp)) * (sp.catchRate / 255) * ITEMS[item].ball;
    const p = Math.min(1, a * 1.3 + 0.02);
    const caught = Math.random() < p;
    const shakes = caught ? 3 : [0, 1, 2].filter(() => Math.random() < Math.cbrt(p)).length;
    const cv = $('#foe-sprite');
    cv.classList.add('captured');
    for (let s = 0; s < shakes; s++) await UI.say('.'.repeat(s + 1) + ' wobble');
    if (!caught) {
      cv.classList.remove('captured');
      await UI.say(pick(['Oh no! It broke free!', 'Argh! Almost had it!', 'It burst out of the orb!']));
      return false;
    }
    await UI.say(`Gotcha! ${monName(foe)} was caught!`);
    markCaught(foe.species);
    if (party.length < 6) party.push(foe);
    else { game.box.push(foe); await UI.say(`Your team is full, so ${monName(foe)} was sent to the storage box.`); }
    return true;
  }

  async function awardExp() {
    const gainers = [...participants].filter((m) => m.hp > 0 && party.includes(m));
    if (!gainers.length) return;
    const total = Math.floor((SPECIES[foe.species].exp * foe.level) / 7 * (trainer ? 1.5 : 1));
    const each = Math.max(1, Math.floor(total / gainers.length));
    for (const m of gainers) {
      await UI.say(`${monName(m)} gained ${each} EXP!`);
      const levels = addExp(m, each);
      refresh();
      for (const L of levels) {
        await UI.say(`${monName(m)} grew to Lv ${L}!`);
        for (const mv of newMovesAt(m.species, L)) await learnMove(m, mv);
      }
    }
  }

  async function finish(result) {
    if (result !== 'lose') {
      // Evolutions happen after the battle, like the classics.
      for (const m of party) {
        const into = canEvolve(m);
        if (!into) continue;
        const from = monName(m);
        await UI.say(`What? ${from} is evolving!`);
        evolve(m, into);
        drawMon($('#my-sprite'), m.species, false);
        await UI.say(`Congratulations! ${from} evolved into ${SPECIES[into].name}!`);
        markSeen(into); markCaught(into);
      }
    }
    $('#battle').classList.add('hidden');
    UI.hideText();
    return result;
  }

  // ---- Main battle loop ----
  for (;;) {
    const act = await chooseAction();

    if (act.type === 'run') {
      if (trainer) { await UI.say("You can't run from a Leader battle!"); continue; }
      runAttempts++;
      if (spdOf('me') >= spdOf('foe') || Math.random() < 0.3 + runAttempts * 0.2) {
        await UI.say('Got away safely!');
        return finish('run');
      }
      await UI.say("Couldn't get away!");
      await doMove('foe', pickFoeMove());
    } else if (act.type === 'ball') {
      if (await throwBall(act.item)) return finish('caught');
      await doMove('foe', pickFoeMove());
    } else if (act.type === 'item') {
      game.bag[act.item]--;
      await UI.say(useItemOn(act.item, act.mon));
      refresh();
      await doMove('foe', pickFoeMove());
    } else if (act.type === 'switch') {
      await UI.say(`${monName(me)}, come back!`);
      me = act.mon; stages.me = { atk: 0, def: 0, spd: 0 }; participants.add(me);
      refresh();
      await UI.say(`Go, ${monName(me)}!`);
      await doMove('foe', pickFoeMove());
    } else {
      // Priority moves first, then the faster creature (ties are a coin flip).
      const foeMove = pickFoeMove();
      const myP = MOVES[act.move].prio || 0, foeP = MOVES[foeMove].prio || 0;
      const meFirst = myP !== foeP ? myP > foeP : spdOf('me') === spdOf('foe') ? Math.random() < 0.5 : spdOf('me') > spdOf('foe');
      for (const side of meFirst ? ['me', 'foe'] : ['foe', 'me']) {
        if (me.hp <= 0 || foe.hp <= 0) break;
        await doMove(side, side === 'me' ? act.move : foeMove);
      }
    }

    if (foe.hp <= 0) {
      $('#foe-sprite').classList.add('fainted');
      await UI.say(`${label('foe')} fainted!`);
      await awardExp();
      if (++fi < foes.length) {
        foe = foes[fi]; stages.foe = { atk: 0, def: 0, spd: 0 };
        participants = new Set(me.hp > 0 ? [me] : []);
        markSeen(foe.species);
        refresh();
        await UI.say(`${trainer.name} sent out ${monName(foe)}!`);
      } else {
        const reward = trainer ? trainer.reward : foe.level * 5 + randInt(0, 10);
        game.money += reward;
        await UI.say(trainer ? `You defeated ${trainer.name}! You got $${reward}.` : `You found $${reward}.`);
        return finish('win');
      }
    }

    if (me.hp <= 0) {
      $('#my-sprite').classList.add('fainted');
      await UI.say(`${monName(me)} fainted!`);
      if (!party.some((m) => m.hp > 0)) {
        await UI.say('You have no creatures left that can fight...');
        await UI.say('You hurried back to the Healing Center!');
        return finish('lose');
      }
      me = await chooseFromParty('Send out which creature?', (m) => m.hp > 0, false);
      stages.me = { atk: 0, def: 0, spd: 0 }; participants.add(me);
      refresh();
      await UI.say(`Go, ${monName(me)}!`);
    }
  }
}

// Dry-run of useItemOn: would this item do anything? (Doesn't change the creature.)
function useItemOnPreview(itemId, mon) {
  const it = ITEMS[itemId];
  if (it.revive) return mon.hp <= 0;
  if (it.heal) return mon.hp > 0 && mon.hp < maxHp(mon);
  return false;
}
