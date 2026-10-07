// world.js — procedural open world: terrain, biomes, towns, paths.
// The whole map is generated from one seed, so a save only needs the seed.

const WORLD_W = 256, WORLD_H = 256;
const T = {
  DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, TALL: 4, TREE: 5, MOUNTAIN: 6, HILL: 7, SNOW: 8, FROST: 9,
  DESERT: 10, CACTUS: 11, PATH: 12, BRIDGE: 13, FLOOR: 14, FLOWER: 15, CENTER: 16, MART: 17, DOOR: 18, LEADER: 19, PINE: 20,
};
const BLOCKED = new Set([T.DEEP, T.WATER, T.TREE, T.PINE, T.MOUNTAIN, T.CACTUS, T.CENTER, T.MART, T.LEADER]);

// Chance per step of a wild encounter, by tile. Tall grass is the classic hotspot;
// open desert/snow/beach/hills still have occasional encounters so every biome is "alive".
const ENCOUNTER_RATE = { [T.TALL]: 0.12, [T.FROST]: 0.12, [T.DESERT]: 0.04, [T.SNOW]: 0.03, [T.SAND]: 0.04, [T.HILL]: 0.05 };

function generateWorld(seed) {
  const N = WORLD_W * WORLD_H;
  const tiles = new Uint8Array(N), biome = new Uint8Array(N);
  const idx = (x, y) => y * WORLD_W + x;
  const elevAt = new Float32Array(N);

  // Pass 1: raw elevation. Distance from center pushes edges down -> an island.
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const nx = x / WORLD_W - 0.5, ny = y / WORLD_H - 0.5;
    const d = Math.sqrt(nx * nx + ny * ny) * 2;
    elevAt[idx(x, y)] = fbm(x / 40, y / 40, seed, 5) - Math.max(0, d - 0.55) * 0.9;
  }
  // Noise values bunch up near 0.5, so instead of fixed cutoffs we use percentiles:
  // e.g. the lowest 30% of tiles become water on every seed. Keeps the land/sea mix stable.
  const sorted = Float32Array.from(elevAt).sort();
  const pct = (p) => sorted[Math.floor(p * (N - 1))];
  const L = { deep: pct(0.24), water: pct(0.31), sand: pct(0.35), hill: pct(0.88), mount: pct(0.945) };

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const e = elevAt[idx(x, y)];
      const moist = (fbm(x / 34, y / 34, seed + 101, 4) - 0.5) * 2.4 + 0.5;
      // North is cold, south is hot, with noise so the borders wiggle.
      const temp = y / WORLD_H + (fbm(x / 50, y / 50, seed + 202, 3) - 0.5) * 0.5;
      const patch = fbm(x / 7, y / 7, seed + 303, 2);   // tall-grass / tree clumps
      const r = hash2(x, y, seed + 404);                  // per-tile decoration roll

      let t, b;
      if (e < L.deep) { t = T.DEEP; b = BIOME.OCEAN; }
      else if (e < L.water) { t = T.WATER; b = BIOME.OCEAN; }
      else if (e < L.sand) { t = T.SAND; b = BIOME.BEACH; }
      else if (e > L.mount) { t = T.MOUNTAIN; b = BIOME.HILL; }
      else if (e > L.hill) { t = r < 0.04 ? T.MOUNTAIN : T.HILL; b = BIOME.HILL; }
      else if (temp < 0.32) {
        b = BIOME.SNOW;
        t = patch > 0.56 ? T.FROST : r < 0.05 ? T.PINE : T.SNOW;
      } else if (temp > 0.66 && moist < 0.6) {
        b = BIOME.DESERT;
        t = r < 0.025 ? T.CACTUS : T.DESERT;
      } else if (moist > 0.62) {
        b = BIOME.FOREST;
        t = patch > 0.52 ? T.TREE : patch > 0.40 ? T.TALL : T.GRASS;
      } else {
        b = BIOME.MEADOW;
        t = patch > 0.58 ? T.TALL : r < 0.03 ? T.FLOWER : r < 0.045 ? T.TREE : T.GRASS;
      }
      tiles[idx(x, y)] = t; biome[idx(x, y)] = b;
    }
  }

  // --- Towns: spread out on dry land. ---
  const rnd = mulberry32(seed + 505);
  const towns = [];
  const isLand = (x, y) => elevAt[idx(x, y)] >= L.sand && elevAt[idx(x, y)] <= L.mount;
  for (let minDist = 55; towns.length < 7 && minDist > 15; minDist -= 8) {
    for (let tries = 0; tries < 5000 && towns.length < 7; tries++) {
      const x = 20 + Math.floor(rnd() * (WORLD_W - 40));
      const y = 20 + Math.floor(rnd() * (WORLD_H - 40));
      let land = 0;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) if (isLand(x + dx, y + dy)) land++;
      if (land < 130) continue; // ~90% of the 143-tile footprint must be land
      if (towns.some((t) => Math.hypot(t.x - x, t.y - y) < minDist)) continue;
      towns.push({ x, y });
    }
  }

  // Start town = closest to the middle of the island; others sorted by distance from it
  // so leader difficulty ramps as you travel outward.
  towns.sort((a, b) => Math.hypot(a.x - 128, a.y - 128) - Math.hypot(b.x - 128, b.y - 128));
  const start = towns[0];
  towns.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
  towns.forEach((t, i) => { t.name = TOWN_NAMES[i % TOWN_NAMES.length]; t.leader = i > 0 && i <= LEADERS.length ? i - 1 : -1; });

  // --- Paths: minimum spanning tree between towns (Prim's), carved as L-shaped roads. ---
  const inTree = [0], edges = [];
  while (inTree.length < towns.length) {
    let best = null;
    for (const a of inTree) for (let b = 0; b < towns.length; b++) {
      if (inTree.includes(b)) continue;
      const dd = Math.hypot(towns[a].x - towns[b].x, towns[a].y - towns[b].y);
      if (!best || dd < best.d) best = { a, b, d: dd };
    }
    inTree.push(best.b); edges.push(best);
  }
  const carve = (x, y) => {
    if (x < 1 || y < 1 || x >= WORLD_W - 1 || y >= WORLD_H - 1) return;
    const i = idx(x, y), t = tiles[i];
    tiles[i] = t === T.DEEP || t === T.WATER ? T.BRIDGE : T.PATH;
  };
  for (const { a, b } of edges) {
    const A = towns[a], B = towns[b];
    const sx = Math.sign(B.x - A.x) || 1, sy = Math.sign(B.y - A.y) || 1;
    for (let x = A.x; x !== B.x + sx; x += sx) { carve(x, A.y); carve(x, A.y + 1); }
    for (let y = A.y; y !== B.y + sy; y += sy) { carve(B.x, y); carve(B.x + 1, y); }
  }

  // --- Stamp towns on top: plaza, healing center, mart, leader. ---
  const doors = {}, leaders = [];
  for (const [ti, t] of towns.entries()) {
    for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) {
      const i = idx(t.x + dx, t.y + dy);
      const edge = Math.abs(dx) === 6 || Math.abs(dy) === 5;
      tiles[i] = edge && hash2(t.x + dx, t.y + dy, seed) < 0.35 ? T.FLOWER : T.FLOOR;
      biome[i] = BIOME.TOWN;
    }
    for (let dx = -5; dx <= -3; dx++) for (let dy = -4; dy <= -3; dy++) tiles[idx(t.x + dx, t.y + dy)] = T.CENTER;
    for (let dx = 3; dx <= 5; dx++) for (let dy = -4; dy <= -3; dy++) tiles[idx(t.x + dx, t.y + dy)] = T.MART;
    tiles[idx(t.x - 4, t.y - 2)] = T.DOOR; doors[`${t.x - 4},${t.y - 2}`] = { kind: 'center', town: ti };
    tiles[idx(t.x + 4, t.y - 2)] = T.DOOR; doors[`${t.x + 4},${t.y - 2}`] = { kind: 'mart', town: ti };
    if (t.leader >= 0) {
      tiles[idx(t.x, t.y - 3)] = T.LEADER;
      leaders.push({ x: t.x, y: t.y - 3, town: ti, id: t.leader });
    }
  }

  return { seed, tiles, biome, towns, doors, leaders };
}

function tileAt(w, x, y) {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return T.DEEP;
  return w.tiles[y * WORLD_W + x];
}
function biomeAt(w, x, y) { return w.biome[y * WORLD_W + x]; }
function isWalkable(w, x, y) { return !BLOCKED.has(tileAt(w, x, y)); }
function townAt(w, x, y) {
  return w.towns.find((t) => Math.abs(t.x - x) <= 6 && Math.abs(t.y - y) <= 5) || null;
}

// Base colors, also used for the minimap.
const TILE_COLORS = {
  [T.DEEP]: '#1d4e89', [T.WATER]: '#2f7fc1', [T.SAND]: '#e8d8a0', [T.GRASS]: '#6abe5a', [T.TALL]: '#3f9a3a',
  [T.TREE]: '#2d6e2d', [T.MOUNTAIN]: '#6e6058', [T.HILL]: '#a89a78', [T.SNOW]: '#eef4f8', [T.FROST]: '#cfe6f0',
  [T.DESERT]: '#e6c27a', [T.CACTUS]: '#e6c27a', [T.PATH]: '#c9a96b', [T.BRIDGE]: '#9a6a3a', [T.FLOOR]: '#d8c8a8',
  [T.FLOWER]: '#6abe5a', [T.CENTER]: '#d84040', [T.MART]: '#4060d0', [T.DOOR]: '#5a3a20', [T.LEADER]: '#d8c8a8', [T.PINE]: '#eef4f8',
};

// Draws one tile at screen position (sx, sy). `time` animates water and grass sway.
function drawTile(ctx, w, x, y, sx, sy, S, time) {
  const t = tileAt(w, x, y);
  const h = hash2(x, y, 99);
  const fill = (c, ox = 0, oy = 0, ww = S, hh = S) => { ctx.fillStyle = c; ctx.fillRect(sx + ox, sy + oy, ww, hh); };
  const ground = (c) => { fill(c); if (h < 0.3) { ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(sx + h * S * 2, sy + h * S * 3 % S, 3, 3); } };

  switch (t) {
    case T.DEEP: case T.WATER: {
      fill(TILE_COLORS[t]);
      // Moving highlight lines fake waves.
      const wave = Math.sin(time / 600 + x * 0.7 + y * 0.4);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(sx + S * 0.2 + wave * 3, sy + S * (0.3 + h * 0.4), S * 0.35, 2);
      break;
    }
    case T.SAND: ground(TILE_COLORS[t]); break;
    case T.DESERT: ground(TILE_COLORS[t]); if (h > 0.85) { fill('#d4ac60', S * 0.3, S * 0.6, S * 0.4, 2); } break;
    case T.GRASS: ground(TILE_COLORS[t]); break;
    case T.FLOOR: fill(TILE_COLORS[t]); ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.strokeRect(sx + 0.5, sy + 0.5, S - 1, S - 1); break;
    case T.PATH: ground(TILE_COLORS[t]); break;
    case T.HILL: ground(TILE_COLORS[t]); if (h > 0.7) { fill('#8a7c60', S * h * 0.6, S * 0.5, 5, 4); } break;
    case T.SNOW: ground(TILE_COLORS[t]); break;
    case T.FLOWER: {
      fill(TILE_COLORS[T.GRASS]);
      const colors = ['#ff6b8a', '#ffd84a', '#ffffff', '#b07aff'];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = colors[(Math.floor(h * 10) + k) % 4];
        ctx.fillRect(sx + ((h * 97 * (k + 1)) % 0.8) * S + 2, sy + ((h * 53 * (k + 1)) % 0.8) * S + 2, 4, 4);
      }
      break;
    }
    case T.TALL: case T.FROST: {
      fill(t === T.TALL ? '#4fa844' : '#e2eef4');
      ctx.fillStyle = t === T.TALL ? '#2f7a2c' : '#8ec0d8';
      const sway = Math.sin(time / 400 + x + y) * 1.5;
      for (let k = 0; k < 4; k++) {
        const bx = sx + 3 + k * (S / 4.2), by = sy + S * (k % 2 ? 0.25 : 0.55);
        ctx.beginPath(); ctx.moveTo(bx, by + S * 0.4); ctx.lineTo(bx + 3 + sway, by); ctx.lineTo(bx + 6, by + S * 0.4); ctx.fill();
      }
      break;
    }
    case T.TREE: case T.PINE: {
      fill(t === T.TREE ? TILE_COLORS[T.GRASS] : TILE_COLORS[T.SNOW]);
      fill('#6a4a2a', S * 0.42, S * 0.6, S * 0.16, S * 0.35);
      ctx.fillStyle = t === T.TREE ? (h > 0.5 ? '#2d6e2d' : '#357a32') : '#2a5a48';
      ctx.beginPath();
      if (t === T.TREE) ctx.arc(sx + S / 2, sy + S * 0.42, S * 0.4, 0, Math.PI * 2);
      else { ctx.moveTo(sx + S / 2, sy + 1); ctx.lineTo(sx + S * 0.88, sy + S * 0.72); ctx.lineTo(sx + S * 0.12, sy + S * 0.72); }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(sx + S * 0.38, sy + S * 0.32, S * 0.12, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case T.CACTUS:
      fill(TILE_COLORS[T.DESERT]);
      fill('#3a8a3a', S * 0.42, S * 0.15, S * 0.16, S * 0.75);
      fill('#3a8a3a', S * 0.22, S * 0.35, S * 0.12, S * 0.25);
      fill('#3a8a3a', S * 0.66, S * 0.28, S * 0.12, S * 0.25);
      break;
    case T.MOUNTAIN: {
      fill(TILE_COLORS[T.HILL]);
      const snowy = y < WORLD_H * 0.35;
      ctx.fillStyle = h > 0.5 ? '#6e6058' : '#5e524a';
      ctx.beginPath(); ctx.moveTo(sx, sy + S); ctx.lineTo(sx + S / 2, sy + 2); ctx.lineTo(sx + S, sy + S); ctx.fill();
      ctx.fillStyle = snowy ? '#ffffff' : '#8a7c70';
      ctx.beginPath(); ctx.moveTo(sx + S * 0.36, sy + S * 0.3); ctx.lineTo(sx + S / 2, sy + 2); ctx.lineTo(sx + S * 0.64, sy + S * 0.3); ctx.fill();
      break;
    }
    case T.BRIDGE:
      fill(TILE_COLORS[T.WATER]);
      fill('#9a6a3a', 0, 2, S, S - 4);
      ctx.fillStyle = '#7a5028';
      for (let k = 0; k < 4; k++) ctx.fillRect(sx + k * (S / 4), sy + 2, 1, S - 4);
      break;
    case T.CENTER: case T.MART: {
      // Top row of a building = roof, bottom row = wall with windows.
      const roof = tileAt(w, x, y - 1) !== t;
      if (roof) { fill(t === T.CENTER ? '#d84040' : '#4060d0'); fill('rgba(0,0,0,0.15)', 0, S - 4, S, 4); }
      else { fill('#f4ecdc'); fill('#88b8e0', S * 0.3, S * 0.25, S * 0.4, S * 0.3); }
      break;
    }
    case T.DOOR: {
      fill('#f4ecdc');
      fill('#5a3a20', S * 0.2, 0, S * 0.6, S * 0.85);
      const isCenter = w.doors[`${x},${y}`]?.kind === 'center';
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(S * 0.4)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(isCenter ? '+' : '$', sx + S / 2, sy + S * 0.6);
      break;
    }
    case T.LEADER: fill(TILE_COLORS[T.FLOOR]); break; // NPC drawn separately on top
    default: fill('#f0f');
  }
}

// Pre-render the whole map at 1px per tile for the minimap.
function renderMinimap(w) {
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = WORLD_H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(WORLD_W, WORLD_H);
  for (let i = 0; i < w.tiles.length; i++) {
    const hex = TILE_COLORS[w.tiles[i]];
    img.data[i * 4] = parseInt(hex.slice(1, 3), 16);
    img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
