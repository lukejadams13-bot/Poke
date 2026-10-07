// ui.js — text box, choice menus, toasts. Everything returns a Promise so game
// logic can be written top-to-bottom with await, e.g.:
//   await UI.say('A wild Fuzzlet appeared!');
//   const i = await UI.choose(['Fight', 'Run']);

const $ = (sel) => document.querySelector(sel);

const UI = {
  _advance: null, // resolves the current say() when the player presses a key / taps
  _choice: null,  // { items, index, resolve, cancelable } for the open choose()

  say(text) {
    const box = $('#textbox');
    box.textContent = text;
    box.classList.remove('hidden');
    box.classList.add('waiting');
    return new Promise((resolve) => {
      UI._advance = () => { UI._advance = null; box.classList.remove('waiting'); resolve(); };
    });
  },

  hideText() { $('#textbox').classList.add('hidden'); },

  // options: array of strings or { label, sub, disabled }. Resolves to the index, or -1 if cancelled.
  choose(options, { prompt = null, cancelable = true, columns = 1 } = {}) {
    const box = $('#choices');
    box.innerHTML = '';
    box.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    if (prompt) { const tb = $('#textbox'); tb.textContent = prompt; tb.classList.remove('hidden', 'waiting'); }
    const items = options.map((o, i) => {
      const opt = typeof o === 'string' ? { label: o } : o;
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `${opt.icon ? `<img class="icon" src="${opt.icon}" alt="">` : ''}<span class="txt"><span class="num">${i + 1}</span>${opt.label}${opt.sub ? `<small>${opt.sub}</small>` : ''}</span>`;
      if (opt.fill) { b.classList.add('filled'); b.style.setProperty('--fill', opt.fill); } // type-colored buttons
      b.disabled = !!opt.disabled;
      b.onclick = () => UI._pick(i);
      box.appendChild(b);
      return b;
    });
    if (cancelable) {
      const b = document.createElement('button');
      b.className = 'choice cancel'; b.textContent = 'Back';
      b.onclick = () => UI._pick(-1);
      box.appendChild(b);
      items.push(b);
    }
    box.classList.remove('hidden');
    return new Promise((resolve) => {
      UI._choice = { items, index: items.findIndex((b) => !b.disabled), resolve, cancelable, count: options.length };
      UI._highlight();
    });
  },

  _highlight() {
    const c = UI._choice; if (!c) return;
    c.items.forEach((b, i) => b.classList.toggle('sel', i === c.index));
  },

  _pick(i) {
    const c = UI._choice; if (!c) return;
    if (i >= 0 && c.items[i].disabled) return;
    if (i >= c.count) i = -1; // the Back button
    UI._choice = null;
    $('#choices').classList.add('hidden');
    c.resolve(i);
  },

  toast(text, ms = 2200) {
    const t = $('#toast');
    t.textContent = text; t.classList.remove('hidden');
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  },

  busy() { return !!(UI._advance || UI._choice); },

  // Shared keyboard handling for dialogs/menus. Returns true if it consumed the key.
  handleKey(e) {
    const c = UI._choice;
    if (c) {
      const n = c.items.length;
      const step = (d) => { let i = c.index; do { i = (i + d + n) % n; } while (c.items[i].disabled && i !== c.index); c.index = i; UI._highlight(); };
      if (['ArrowDown', 's', 'S', 'ArrowRight', 'd', 'D'].includes(e.key)) step(1);
      else if (['ArrowUp', 'w', 'W', 'ArrowLeft', 'a', 'A'].includes(e.key)) step(-1);
      else if (['Enter', ' ', 'z', 'Z'].includes(e.key)) UI._pick(c.index);
      else if (['Escape', 'x', 'X', 'Backspace'].includes(e.key) && c.cancelable) UI._pick(-1);
      else if (/^[1-9]$/.test(e.key) && +e.key <= c.count) UI._pick(+e.key - 1);
      else return false;
      return true;
    }
    if (UI._advance && ['Enter', ' ', 'z', 'Z', 'x', 'X', 'Escape'].includes(e.key)) { UI._advance(); return true; }
    return false;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  $('#textbox').addEventListener('click', () => UI._advance && UI._advance());
});
