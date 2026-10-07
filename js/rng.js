// rng.js — seeded randomness + noise.
// Everything world-related is seeded so the same seed always builds the same map
// (that's what makes save files tiny: we store the seed, not 65k tiles).

// mulberry32: tiny, fast, good-enough PRNG. Returns a function giving floats in [0,1).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash of an integer grid point -> [0,1). Used for noise corners
// and for per-tile decoration (which tiles get a flower, a cactus, etc).
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise: random values at integer points, smoothly blended in between.
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  // smoothstep so blends have no visible grid creases
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal noise: stack octaves (big blobs + smaller detail) for natural-looking terrain.
function fbm(x, y, seed, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Weighted pick: entries are objects with a .w weight field.
function weightedPick(entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) { if ((r -= e.w) < 0) return e; }
  return entries[entries.length - 1];
}
