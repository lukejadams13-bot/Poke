// scene3d.js — the 3D overworld (Three.js): terrain, water, sky, props, towns, characters,
// and wild Pokémon billboards. game.js owns the rules; this file only draws.

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const SHOWDOWN = 'https://play.pokemonshowdown.com/sprites';
const pokeImg = {
  // HOME renders are the modern 3D-model artwork; used for the overworld billboards and menus.
  home: (m) => `${SPRITE_BASE}/other/home/${m.shiny ? 'shiny/' : ''}${SPECIES[m.species].dex}.png`,
  // Animated battle sprites recorded from the 3D models (Pokémon Showdown).
  front: (m) => `${SHOWDOWN}/ani${m.shiny ? '-shiny' : ''}/${m.species}.gif`,
  back: (m) => `${SHOWDOWN}/ani-back${m.shiny ? '-shiny' : ''}/${m.species}.gif`,
  // Fallbacks: Gen 5 animated sprites, then the classic still sprite.
  front5: (m) => `${SPRITE_BASE}/other/showdown/${m.shiny ? 'shiny/' : ''}${SPECIES[m.species].dex}.gif`,
  back5: (m) => `${SPRITE_BASE}/other/showdown/back/${m.shiny ? 'shiny/' : ''}${SPECIES[m.species].dex}.gif`,
  pixel: (m) => `${SPRITE_BASE}/${SPECIES[m.species].dex}.png`,
};

const W3 = {
  renderer: null, scene: null, camera: null, sun: null, hemi: null, sky: null, stars: null, clouds: null,
  water: null, terrain: null, propsGroup: null, player: null, leaders: [], lampMat: null,
  timeUniform: { value: 0 }, texCache: {}, yaw: 0, pitch: 0.62, dist: 12, camTarget: null,
};

const TERRAIN_COLORS = {
  [T.DEEP]: '#b8a46c', [T.WATER]: '#d2c088', [T.SAND]: '#f2e2a6', [T.GRASS]: '#7ccc58', [T.TALL]: '#5fb043',
  [T.TREE]: '#4e9a3a', [T.MOUNTAIN]: '#8e8174', [T.HILL]: '#b4a679', [T.SNOW]: '#f2f6f9', [T.FROST]: '#e2edf3',
  [T.DESERT]: '#eac689', [T.CACTUS]: '#eac689', [T.PATH]: '#dcc28a', [T.BRIDGE]: '#c9b27a', [T.FLOOR]: '#e9e1cd',
  [T.FLOWER]: '#82d05e', [T.CENTER]: '#e9e1cd', [T.MART]: '#e9e1cd', [T.DOOR]: '#e9e1cd', [T.LEADER]: '#e9e1cd', [T.PINE]: '#eef3f6',
};

function init3D(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  r.setSize(innerWidth, innerHeight);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  W3.renderer = r;
  W3.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
  W3.camTarget = new THREE.Vector3();
  window.addEventListener('resize', () => {
    r.setSize(innerWidth, innerHeight);
    W3.camera.aspect = innerWidth / innerHeight;
    W3.camera.updateProjectionMatrix();
  });
}

// ---------- Small helpers ----------
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
function shadowed(mesh, cast = true, receive = true) { mesh.castShadow = cast; mesh.receiveShadow = receive; return mesh; }
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- World build ----------
function build3D(w) {
  const scene = new THREE.Scene();
  W3.scene = scene;
  scene.fog = new THREE.Fog(0xbfe3ff, 50, 150);

  W3.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a7a40, 0.9);
  scene.add(W3.hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  W3.sun = sun;

  buildSky(scene);
  buildTerrain(scene, w);
  buildWater(scene);
  buildProps(scene, w);
  buildTowns(scene, w);

  W3.player = makeTrainer({ shirt: '#e8403a', hat: '#e8403a', pants: '#2b3a67', hair: '#3a2a1e', bag: '#f2c230' });
  scene.add(W3.player.group);
}

function buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d8fe0) }, bottom: { value: new THREE.Color(0xbfe3ff) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = pow(max(vP.y, 0.0), 0.55); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  W3.sky = new THREE.Mesh(skyGeo, skyMat);
  W3.sky.renderOrder = -1;
  scene.add(W3.sky);

  const starPos = [];
  for (let i = 0; i < 1500; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
    starPos.push(Math.sin(ph) * Math.cos(th) * 380, Math.cos(ph) * 380, Math.sin(ph) * Math.sin(th) * 380);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  W3.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(W3.stars);

  // Puffy clouds: a few spheres per cloud, all in one instanced mesh, drifting slowly.
  const puffs = 160;
  const cm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666, fog: false }), puffs);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), rnd = mulberry32(99);
  let k = 0;
  while (k < puffs) {
    const cx = rnd() * 320 - 32, cz = rnd() * 320 - 32, cy = 48 + rnd() * 14, n = 4 + Math.floor(rnd() * 4);
    for (let j = 0; j < n && k < puffs; j++, k++) {
      const s = 3 + rnd() * 4;
      m.compose(new THREE.Vector3(cx + (rnd() - 0.5) * 12, cy + rnd() * 2, cz + (rnd() - 0.5) * 6), q, new THREE.Vector3(s * 1.4, s * 0.7, s));
      cm.setMatrixAt(k, m);
    }
  }
  cm.frustumCulled = false;
  W3.clouds = cm;
  scene.add(cm);
}

function buildTerrain(scene, w) {
  const CW = WORLD_W + 1, CH = WORLD_H + 1;
  const pos = new Float32Array(CW * CH * 3), col = new Float32Array(CW * CH * 3);
  const pal = {};
  for (const [k, v] of Object.entries(TERRAIN_COLORS)) pal[k] = new THREE.Color(v);
  const rock = new THREE.Color('#857766'), snow = new THREE.Color('#f7fafc'), tmp = new THREE.Color();

  for (let z = 0; z < CH; z++) for (let x = 0; x < CW; x++) {
    const i = z * CW + x;
    const h = w.corner[i];
    pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
    // Corner color = average of the 4 touching tiles -> soft biome blending.
    let r = 0, g = 0, b = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const c = pal[tileAt(w, x + dx, z + dz)] || pal[T.DEEP];
      r += c.r; g += c.g; b += c.b;
    }
    const j = 0.94 + hash2(x, z, 5) * 0.12; // subtle mottling
    col[i * 3] = (r / 4) * j; col[i * 3 + 1] = (g / 4) * j; col[i * 3 + 2] = (b / 4) * j;
  }
  const idx = new Uint32Array(WORLD_W * WORLD_H * 6);
  let n = 0;
  for (let z = 0; z < WORLD_H; z++) for (let x = 0; x < WORLD_W; x++) {
    const a = z * CW + x, b = a + 1, c = a + CW, d = c + 1;
    idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  // Steep slopes become rock, high peaks get snow caps.
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < CW * CH; i++) {
    const ny = nrm.getY(i), h = pos[i * 3 + 1], zz = pos[i * 3 + 2];
    tmp.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
    if (h > 0.5 && ny < 0.8) tmp.lerp(rock, Math.min(1, (0.8 - ny) * 3));
    const snowLine = zz < WORLD_H * 0.35 ? 4.5 : 8;
    if (h > snowLine) tmp.lerp(snow, Math.min(1, (h - snowLine) / 1.5));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  W3.terrain = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })), false, true);
  scene.add(W3.terrain);
}

// Tileable normal map from integer-frequency sine waves; scrolled over time for moving ripples.
function makeWaterNormals() {
  const S = 256, TAU = Math.PI * 2;
  const H = (x, y) => Math.sin((x / S) * TAU * 3 + Math.sin((y / S) * TAU * 2) * 1.5) + 0.6 * Math.sin((y / S) * TAU * 5 + (x / S) * TAU) + 0.3 * Math.sin(((x + y) / S) * TAU * 7);
  return canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 6, dy = (H(x, y + 1) - H(x, y - 1)) * 6;
      const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
      img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

function buildWater(scene) {
  const nm = makeWaterNormals();
  nm.colorSpace = THREE.NoColorSpace;
  nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  nm.repeat.set(90, 90);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1e8ed8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.8, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35) });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD_W / 2, 0, WORLD_H / 2);
  water.receiveShadow = true;
  W3.water = water;
  scene.add(water);
}

// Grass clump: thin blades with a dark base and light tips. Wind sway is added in the shader.
function grassGeometry(blades, rnd) {
  const pos = [], col = [];
  for (let i = 0; i < blades; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.32, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 0.45 + rnd() * 0.35, wdt = 0.05 + rnd() * 0.03, rot = rnd() * Math.PI;
    const ox = Math.cos(rot) * wdt, oz = Math.sin(rot) * wdt, lean = (rnd() - 0.5) * 0.2;
    // Each blade twice (both windings) so both sides are front faces with an "up" normal.
    pos.push(x - ox, 0, z - oz, x + ox, 0, z + oz, x + lean, h, z + lean);
    pos.push(x + ox, 0, z + oz, x - ox, 0, z - oz, x + lean, h, z + lean);
    for (let k = 0; k < 2; k++) col.push(0.62, 0.75, 0.55, 0.62, 0.75, 0.55, 1.15, 1.15, 1.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function windMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = W3.timeUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 ip = vec2(0.0);
      #endif
      float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.y * 0.27) + 0.5 * sin(uTime * 3.3 + ip.x * 0.9);
      transformed.x += sway * 0.09 * position.y;
      transformed.z += sway * 0.05 * position.y;`);
    // Grass gets a fixed upward normal so it's lit like the ground it grows from.
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
  };
  return mat;
}

function buildProps(scene, w) {
  const rnd = mulberry32(w.seed + 7);
  const PARTS = {
    trunk: { geo: new THREE.CylinderGeometry(0.11, 0.17, 1, 7).translate(0, 0.5, 0), mat: std('#7a5434'), cast: true },
    leaf: { geo: new THREE.IcosahedronGeometry(0.8, 1), mat: std('#ffffff', { roughness: 0.9 }), cast: true, colored: true },
    pine: { geo: new THREE.ConeGeometry(0.85, 1.5, 9).translate(0, 0.75, 0), mat: std('#ffffff'), cast: true, colored: true },
    cactus: { geo: new THREE.CapsuleGeometry(0.17, 0.9, 4, 10).translate(0, 0.62, 0), mat: std('#4f9a42'), cast: true },
    arm: { geo: new THREE.CapsuleGeometry(0.11, 0.35, 4, 8).translate(0, 0.17, 0), mat: std('#4f9a42'), cast: true },
    grass: { geo: grassGeometry(9, rnd), mat: windMaterial(), cast: false, colored: true },
    flower: { geo: new THREE.SphereGeometry(0.07, 8, 6), mat: std('#ffffff', { roughness: 0.6 }), cast: false, colored: true },
    rock: { geo: new THREE.DodecahedronGeometry(0.4, 0), mat: std('#ffffff', { flatShading: true }), cast: true, colored: true },
    plank: { geo: new THREE.BoxGeometry(1.0, 0.12, 0.96), mat: std('#9a6a3e'), cast: true },
    rail: { geo: new THREE.BoxGeometry(0.08, 0.35, 1.0), mat: std('#6e4a2a'), cast: true },
  };
  // matrices[chunk][part] = [{ m, c }]. Chunking lets Three.js skip props that are off-screen.
  const CH = 32, chunks = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const add = (part, x, y, z, sx, sy, sz, ry = 0, color = null, rx = 0, rz = 0) => {
    const key = (Math.floor(x / CH)) + ',' + (Math.floor(z / CH));
    if (!chunks.has(key)) chunks.set(key, {});
    const c = chunks.get(key);
    (c[part] ||= []).push({ m: m4.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz)).clone(), c: color });
  };
  const green = (base, j) => new THREE.Color(base).offsetHSL((j - 0.5) * 0.04, 0, (j - 0.5) * 0.12);
  const flowerColors = ['#ff6b8a', '#ffd84a', '#ffffff', '#b07aff', '#ff9a3c'];

  for (let z = 0; z < WORLD_H; z++) for (let x = 0; x < WORLD_W; x++) {
    const t = tileAt(w, x, z), h1 = hash2(x, z, 11), h2 = hash2(x, z, 23), h3 = hash2(x, z, 37);
    const cx = x + 0.5 + (h1 - 0.5) * 0.3, cz = z + 0.5 + (h2 - 0.5) * 0.3, gy = heightAt(w, cx, cz);
    switch (t) {
      case T.TREE: {
        const sc = 0.85 + h1 * 0.5;
        add('trunk', cx, gy, cz, sc, 1.3 * sc, sc);
        add('leaf', cx, gy + 1.75 * sc, cz, sc * 1.05, sc * 0.95, sc * 1.05, h2 * 6, green('#3f8f34', h3));
        add('leaf', cx + 0.25 * sc, gy + 2.3 * sc, cz - 0.1, sc * 0.75, sc * 0.7, sc * 0.75, h3 * 6, green('#4ea33f', h2));
        break;
      }
      case T.PINE: {
        const sc = 0.8 + h1 * 0.5;
        add('trunk', cx, gy, cz, sc, 0.8 * sc, sc);
        add('pine', cx, gy + 0.55 * sc, cz, sc, sc, sc, h2, green('#2f6a4c', h3));
        add('pine', cx, gy + 1.25 * sc, cz, sc * 0.75, sc * 0.85, sc * 0.75, h2, green('#36775a', h3));
        add('pine', cx, gy + 1.85 * sc, cz, sc * 0.5, sc * 0.6, sc * 0.5, h2, new THREE.Color('#f4f8fb'));
        break;
      }
      case T.CACTUS: {
        const sc = 0.9 + h1 * 0.5;
        add('cactus', cx, gy, cz, sc, sc, sc);
        add('arm', cx + 0.2 * sc, gy + 0.55 * sc, cz, sc, sc, sc, 0, null, 0, -0.9);
        add('arm', cx - 0.2 * sc, gy + 0.75 * sc, cz, sc * 0.8, sc * 0.8, sc * 0.8, 0, null, 0, 0.9);
        break;
      }
      case T.TALL: case T.FROST: {
        const base = t === T.TALL ? '#5fb83f' : '#cfe6f2';
        for (let k = 0; k < 3; k++) {
          const ox = x + 0.2 + hash2(x, z, 50 + k) * 0.6, oz = z + 0.2 + hash2(x, z, 60 + k) * 0.6;
          const sc = 1.05 + hash2(x, z, 70 + k) * 0.45;
          add('grass', ox, heightAt(w, ox, oz) - 0.02, oz, sc, sc, sc, hash2(x, z, 80 + k) * 6, green(base, h3));
        }
        break;
      }
      case T.GRASS: case T.FLOWER: {
        if (h3 < 0.35) add('grass', cx, gy - 0.02, cz, 0.55, 0.4, 0.55, h1 * 6, green('#6cc24a', h2));
        if (t === T.FLOWER || h1 > 0.985) {
          for (let k = 0; k < 4; k++) {
            const fx = x + 0.15 + hash2(x, z, 90 + k) * 0.7, fz = z + 0.15 + hash2(x, z, 95 + k) * 0.7;
            add('flower', fx, heightAt(w, fx, fz) + 0.12, fz, 1, 1, 1, 0, new THREE.Color(flowerColors[Math.floor(hash2(x, z, 99 + k) * 5)]));
          }
        }
        if (t === T.GRASS && h2 > 0.993) add('rock', cx, gy, cz, 0.6, 0.45, 0.6, h1 * 6, new THREE.Color('#9a958c'));
        break;
      }
      case T.HILL: if (h1 < 0.12) add('rock', cx, gy + 0.05, cz, 0.6 + h2, 0.5 + h2 * 0.6, 0.6 + h3, h3 * 6, new THREE.Color(h2 > 0.5 ? '#9b8f7d' : '#a89c86')); break;
      case T.MOUNTAIN: if (h1 < 0.18) add('rock', cx, gy - 0.1, cz, 1.2 + h2 * 1.5, 0.9 + h2, 1.2 + h3 * 1.5, h3 * 6, new THREE.Color('#8a7d70')); break;
      case T.DESERT: if (h1 < 0.02) add('rock', cx, gy, cz, 0.7, 0.5, 0.7, h3 * 6, new THREE.Color('#c9a46a')); break;
      case T.SAND: if (h1 < 0.02) add('rock', cx, gy, cz, 0.5, 0.35, 0.5, h3 * 6, new THREE.Color('#d8d0c0')); break;
      case T.BRIDGE: {
        add('plank', x + 0.5, BRIDGE_Y - 0.06, z + 0.5, 1, 1, 1);
        const water = (tx, tz) => [T.WATER, T.DEEP].includes(tileAt(w, tx, tz));
        // Rails along the sides that face open water (the bridge runs the other way).
        const horiz = tileAt(w, x - 1, z) === T.BRIDGE || tileAt(w, x + 1, z) === T.BRIDGE;
        if (horiz) {
          if (water(x, z - 1)) add('rail', x + 0.5, BRIDGE_Y + 0.17, z + 0.05, 1, 1, 1, Math.PI / 2);
          if (water(x, z + 1)) add('rail', x + 0.5, BRIDGE_Y + 0.17, z + 0.95, 1, 1, 1, Math.PI / 2);
        } else {
          if (water(x - 1, z)) add('rail', x + 0.05, BRIDGE_Y + 0.17, z + 0.5, 1, 1, 1);
          if (water(x + 1, z)) add('rail', x + 0.95, BRIDGE_Y + 0.17, z + 0.5, 1, 1, 1);
        }
        break;
      }
    }
  }

  const group = new THREE.Group();
  for (const parts of chunks.values()) {
    for (const [name, list] of Object.entries(parts)) {
      const def = PARTS[name];
      const mesh = new THREE.InstancedMesh(def.geo, def.mat, list.length);
      list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); if (def.colored) mesh.setColorAt(i, it.c || new THREE.Color(1, 1, 1)); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (mesh.computeBoundingSphere) mesh.computeBoundingSphere(); else mesh.frustumCulled = false;
      shadowed(mesh, def.cast, name !== 'grass');
      group.add(mesh);
    }
  }
  W3.propsGroup = group;
  scene.add(group);
}

// ---------- Towns ----------
function pokeBallTexture() {
  return canvasTexture(128, 128, (g) => {
    g.beginPath(); g.arc(64, 64, 60, Math.PI, 0); g.fillStyle = '#e8403a'; g.fill();
    g.beginPath(); g.arc(64, 64, 60, 0, Math.PI); g.fillStyle = '#ffffff'; g.fill();
    g.fillStyle = '#222'; g.fillRect(4, 58, 120, 12);
    g.beginPath(); g.arc(64, 64, 20, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(64, 64, 12, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#222'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.stroke();
  });
}
function signTexture(text, bg, fg = '#fff', w = 256, h = 64) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const size = Math.min(h * 0.55, (w * 1.7) / text.length); // shrink long text to fit
    g.fillStyle = fg; g.font = `bold ${Math.floor(size)}px Trebuchet MS, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function makeBuilding(cx, cz, gy, roofColor, signTex) {
  const g = new THREE.Group();
  const walls = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.9, 1.9), std('#f7f2e8')));
  walls.position.set(0, 0.95, 0);
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 2.0), std('#cfc6b4')));
  base.position.y = 0.15;
  const roof = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.35, 2.3), std(roofColor, { roughness: 0.6 })));
  roof.position.y = 2.05;
  const roof2 = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 1.5), std(roofColor, { roughness: 0.6 })));
  roof2.position.y = 2.35;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.06), std('#8fd0ff', { roughness: 0.1, metalness: 0.3, emissive: '#2a5a7a', emissiveIntensity: 0.4 }));
  glass.position.set(0, 0.75, 0.96);
  const awning = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.45), std(roofColor)));
  awning.position.set(0, 1.45, 1.15);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signTex.isPokeBall ? 0.8 : 1.6, signTex.isPokeBall ? 0.8 : 0.4), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.5 }));
  sign.position.set(0, 1.75, 0.97);
  for (const wx of [-1.0, 1.0]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), W3.windowMat);
    win.position.set(wx, 1.0, 0.96);
    g.add(win);
  }
  g.add(walls, base, roof, roof2, glass, awning, sign);
  g.position.set(cx, gy, cz);
  return g;
}

function makeLamp(x, z, y) {
  const g = new THREE.Group();
  const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 8), std('#3a3f4a', { metalness: 0.5, roughness: 0.4 })));
  pole.position.y = 0.9;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), W3.lampMat);
  bulb.position.y = 1.9;
  g.add(pole, bulb);
  g.position.set(x, y, z);
  return g;
}

function buildTowns(scene, w) {
  W3.lampMat = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffc35c', emissiveIntensity: 0 });
  W3.windowMat = new THREE.MeshStandardMaterial({ color: '#cfe8ff', emissive: '#ffcf70', emissiveIntensity: 0, roughness: 0.2 });
  const ball = pokeBallTexture(); ball.isPokeBall = true;
  const mart = signTexture('MART', '#2f5fd0');
  W3.leaders = [];
  for (const t of w.towns) {
    const gy = t.h;
    scene.add(makeBuilding(t.x - 3.5, t.y - 3, gy, '#e8403a', ball));
    scene.add(makeBuilding(t.x + 4.5, t.y - 3, gy, '#3c6fe0', mart));
    for (const [dx, dz] of [[-6, -5], [7, -5], [-6, 6], [7, 6]]) scene.add(makeLamp(t.x + dx, t.y + dz, gy));
    // Town name sign at the plaza's south edge.
    const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), std('#7a5434')));
    post.position.set(t.x + 2.5, gy + 0.55, t.y + 4.6);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), [std('#7a5434'), std('#7a5434'), std('#7a5434'), std('#7a5434'),
      new THREE.MeshStandardMaterial({ map: signTexture(t.name, '#f4ead2', '#4a3520', 512, 128) }), std('#7a5434')]);
    board.position.set(t.x + 2.5, gy + 1.2, t.y + 4.6);
    shadowed(board);
    scene.add(post, board);
  }
  for (const L of w.leaders) {
    const data = LEADERS[L.id], gy = w.towns[L.town].h;
    const podium = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.16, 28), std(data.color, { roughness: 0.5 })), false, true);
    podium.position.set(L.x + 0.5, gy + 0.08, L.y + 0.5);
    const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), std('#ddd', { metalness: 0.6, roughness: 0.3 })));
    pole.position.set(L.x + 1.3, gy + 1.3, L.y + 0.2);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: signTexture(data.badge.split(' ')[0], data.color, '#fff', 192, 128), side: THREE.DoubleSide }));
    flag.position.set(L.x + 1.77, gy + 2.25, L.y + 0.2);
    scene.add(podium, pole, flag);
    const npc = makeTrainer({ shirt: data.color, hat: '#2a2a2a', pants: '#333', hair: '#222', bag: null, noHat: true });
    npc.group.position.set(L.x + 0.5, gy + 0.16, L.y + 0.5);
    scene.add(npc.group);
    const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(64, 64, (g) => {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8403a'; g.font = 'bold 46px sans-serif'; g.textAlign = 'center'; g.fillText('!', 32, 49);
    }), depthTest: false }));
    bang.scale.set(0.5, 0.5, 1);
    scene.add(bang);
    W3.leaders.push({ L, npc, bang, baseY: gy + 1.65 });
  }
}

// ---------- Characters ----------
// Stylized trainer built from primitives. Faces +z; legs/arms pivot at hips/shoulders for walking.
function makeTrainer({ shirt, hat, pants, hair, bag, noHat = false, skin = '#f3c9a2' }) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const mk = (geo, color, x, y, z, parent = body) => { const m = shadowed(new THREE.Mesh(geo, std(color, { roughness: 0.7 }))); m.position.set(x, y, z); parent.add(m); return m; };
  const limb = (x, y, color, len, rad) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); body.add(pivot);
    mk(new THREE.CapsuleGeometry(rad, len, 4, 8), color, 0, -len / 2 - rad * 0.5, 0, pivot);
    return pivot;
  };
  const legL = limb(-0.1, 0.46, pants, 0.28, 0.075), legR = limb(0.1, 0.46, pants, 0.28, 0.075);
  mk(new THREE.BoxGeometry(0.17, 0.08, 0.24), '#333', -0.1, 0.04, 0.03); // shoes (don't swing — keeps it simple)
  mk(new THREE.BoxGeometry(0.17, 0.08, 0.24), '#333', 0.1, 0.04, 0.03);
  mk(new THREE.CapsuleGeometry(0.19, 0.22, 4, 12), shirt, 0, 0.7, 0);
  const armL = limb(-0.26, 0.86, shirt, 0.22, 0.06), armR = limb(0.26, 0.86, shirt, 0.22, 0.06);
  mk(new THREE.SphereGeometry(0.06, 8, 6), skin, 0, -0.33, 0, armL); mk(new THREE.SphereGeometry(0.06, 8, 6), skin, 0, -0.33, 0, armR);
  mk(new THREE.SphereGeometry(0.23, 20, 16), skin, 0, 1.12, 0);
  const hairM = mk(new THREE.SphereGeometry(0.245, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), hair, 0, 1.14, -0.02);
  hairM.rotation.x = -0.25;
  if (!noHat) {
    mk(new THREE.SphereGeometry(0.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 1.19, 0);
    const brim = mk(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), hat, 0, 1.2, 0.17);
    brim.scale.set(1, 1, 0.8);
  }
  for (const ex of [-0.08, 0.08]) mk(new THREE.SphereGeometry(0.03, 8, 6), '#1a1a1a', ex, 1.12, 0.215);
  if (bag) mk(new THREE.BoxGeometry(0.3, 0.32, 0.14), bag, 0, 0.74, -0.2);
  return { group: g, body, legL, legR, armL, armR, phase: 0 };
}

function animateTrainer(t, moving, dt, speed = 1) {
  if (moving) t.phase += dt * 9 * speed; else t.phase *= 0.8;
  const s = Math.sin(t.phase) * (moving ? 0.7 : 0);
  t.legL.rotation.x = s; t.legR.rotation.x = -s;
  t.armL.rotation.x = -s * 0.8; t.armR.rotation.x = s * 0.8;
  t.body.position.y = moving ? Math.abs(Math.cos(t.phase)) * 0.05 : 0;
}

// ---------- Wild Pokémon billboards ----------
function fallbackTexture(m) {
  const sp = SPECIES[m.species];
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = TYPE_COLORS[sp.types[0]]; g.beginPath(); g.arc(64, 70, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText(sp.name, 64, 76);
  });
}

// Shared texture per species (+shiny). Loads the HOME render; shows a colored placeholder until then.
function monTexture(m, onReady) {
  const key = m.species + (m.shiny ? '*' : '');
  let entry = W3.texCache[key];
  if (!entry) {
    entry = W3.texCache[key] = { tex: null, waiting: [] };
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(pokeImg.home(m), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      entry.tex = tex; entry.waiting.forEach((f) => f(tex)); entry.waiting = [];
    }, undefined, () => { entry.tex = fallbackTexture(m); entry.waiting.forEach((f) => f(entry.tex)); entry.waiting = []; });
  }
  if (entry.tex) onReady(entry.tex); else entry.waiting.push(onReady);
}

const blobGeo = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

function addWild3D(wd) {
  const mat = new THREE.SpriteMaterial({ map: fallbackTexture(wd.mon), alphaTest: 0.35 });
  monTexture(wd.mon, (tex) => { mat.map = tex; mat.needsUpdate = true; });
  const spr = new THREE.Sprite(mat);
  spr.center.set(0.5, 0.06); // HOME renders have a little empty space under the feet
  const s = 1.25 * SPECIES[wd.mon.species].size;
  spr.scale.set(s, s, 1);
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.scale.setScalar(s * 0.65);
  wd.sprite = spr; wd.blob = blob; wd.scale = s;
  W3.scene.add(spr, blob);
  if (wd.mon.shiny) { // sparkle ring so shinies stand out in the field
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(64, 64, (g) => {
      g.fillStyle = '#fff6a0'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('✦', 32, 44);
    }), depthTest: false }));
    sp.scale.set(0.45, 0.45, 1);
    wd.sparkle = sp; W3.scene.add(sp);
  }
}

function removeWild3D(wd) {
  for (const o of [wd.sprite, wd.blob, wd.sparkle]) if (o) { W3.scene.remove(o); if (o.material !== blobMat && o.material.map && !Object.values(W3.texCache).some((e) => e.tex === o.material.map)) o.material.map.dispose(); }
}

// ---------- Per-frame ----------
const SKY = {
  day: { top: new THREE.Color('#3b8ee6'), bottom: new THREE.Color('#c4e6ff') },
  dusk: { top: new THREE.Color('#3a4f95'), bottom: new THREE.Color('#ffb07a') },
  night: { top: new THREE.Color('#0a1530'), bottom: new THREE.Color('#2b4170') },
};

function updateLighting(minutes, center) {
  // Sun angle: rises at 6:00, peaks at 12:00, sets at 18:00.
  const ang = ((minutes / 1440) - 0.25) * Math.PI * 2;
  const el = Math.sin(ang);
  const day = Math.max(0, Math.min(1, el * 3 + 0.3));         // 0 at night, 1 in full day
  const dusk = Math.max(0, 1 - Math.abs(el) * 4) * (el > -0.25 ? 1 : 0); // around sunrise/sunset
  const top = SKY.night.top.clone().lerp(SKY.day.top, day).lerp(SKY.dusk.top, dusk * 0.6);
  const bottom = SKY.night.bottom.clone().lerp(SKY.day.bottom, day).lerp(SKY.dusk.bottom, dusk * 0.7);
  W3.sky.material.uniforms.top.value.copy(top);
  W3.sky.material.uniforms.bottom.value.copy(bottom);
  W3.scene.fog.color.copy(bottom);
  W3.stars.material.opacity = Math.max(0, 1 - day * 1.5) * 0.9;
  W3.clouds.material.color.setRGB(0.5 + day * 0.5, 0.5 + day * 0.5, 0.55 + day * 0.45).lerp(new THREE.Color('#ffb08a'), dusk * 0.4);

  // Sun by day, cool moonlight by night (same light, so shadows always work).
  const sunDir = el > -0.05
    ? new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.15, el), 0.45).normalize()
    : new THREE.Vector3(-Math.cos(ang) * 0.6, 0.7, -0.4).normalize();
  W3.sun.color.set(el > -0.05 ? '#fff1d6' : '#9fb4ff').lerp(new THREE.Color('#ffaa66'), dusk * 0.6);
  W3.sun.intensity = el > -0.05 ? 0.7 + 1.8 * Math.max(0, el) : 0.9;
  W3.hemi.intensity = 0.75 + 0.2 * day;
  W3.hemi.color.set('#8ea6ff').lerp(new THREE.Color('#d6ecff'), day);
  W3.renderer.toneMappingExposure = 1.0 + 0.05 * day;
  const night = 1 - day;
  W3.lampMat.emissiveIntensity = night * 2.5;
  W3.windowMat.emissiveIntensity = night * 1.2;

  // Keep the shadow camera centered on the player; snap to the texel grid to avoid shimmer.
  const snap = 60 / 2048;
  const cx = Math.round(center.x / snap) * snap, cz = Math.round(center.z / snap) * snap;
  W3.sun.target.position.set(cx, center.y, cz);
  W3.sun.position.set(cx + sunDir.x * 70, center.y + sunDir.y * 70, cz + sunDir.z * 70);
}

function render3D(now, dt, state) {
  const { player, wild, minutes, badges } = state;
  W3.timeUniform.value = now / 1000;
  W3.water.material.normalMap.offset.set((now / 1000) * 0.006, (now / 1000) * 0.004);
  W3.clouds.position.x = ((now / 1000) * 0.6) % 60;

  // Player model
  const pm = W3.player;
  pm.group.position.set(player.x, player.y, player.z);
  pm.group.rotation.y = player.angle;
  animateTrainer(pm, player.moving, dt, player.running ? 1.5 : 1);

  // Leaders: idle sway + "!" over the ones you haven't beaten.
  for (const ld of W3.leaders) {
    ld.npc.body.rotation.y = Math.sin(now / 900 + ld.L.x) * 0.15;
    const show = !badges.includes(ld.L.id);
    ld.bang.visible = show;
    if (show) ld.bang.position.set(ld.L.x + 0.5, ld.baseY + 0.25 + Math.sin(now / 250) * 0.06, ld.L.y + 0.5);
  }

  // Wild Pokémon: hop while moving, face their walking direction relative to the camera.
  const camRight = new THREE.Vector3(Math.cos(W3.yaw), 0, -Math.sin(W3.yaw));
  for (const wd of wild) {
    if (!wd.sprite) continue;
    const hop = wd.moving ? Math.abs(Math.sin(now / 130 + wd.phase)) * 0.18 : Math.sin(now / 500 + wd.phase) * 0.02;
    const gy = wd.y;
    wd.sprite.position.set(wd.x, gy + hop + (wd.floats ? 0.5 + Math.sin(now / 600 + wd.phase) * 0.15 : 0), wd.z);
    const right = wd.vx * camRight.x + wd.vz * camRight.z;
    if (Math.abs(right) > 0.05) wd.flip = right > 0 ? -1 : 1;
    wd.sprite.scale.x = wd.scale * (wd.flip || 1);
    wd.blob.position.set(wd.x, gy + 0.03, wd.z);
    if (wd.sparkle) wd.sparkle.position.set(wd.x, gy + wd.scale * 0.9 + Math.sin(now / 200) * 0.1, wd.z);
  }

  // Third-person camera orbiting the player.
  const target = W3.camTarget.set(player.x, player.y + 1.0, player.z);
  const cp = Math.cos(W3.pitch), spt = Math.sin(W3.pitch);
  const want = new THREE.Vector3(target.x + Math.sin(W3.yaw) * W3.dist * cp, target.y + W3.dist * spt, target.z + Math.cos(W3.yaw) * W3.dist * cp);
  const ground = heightAt(game.world, want.x, want.z) + 0.8;
  if (want.y < ground) want.y = ground;
  const k = W3.snapCam ? 1 : 1 - Math.exp(-dt * 10);
  W3.snapCam = false;
  W3.camera.position.lerp(want, k);
  W3.camera.lookAt(target);
  W3.sky.position.copy(W3.camera.position);
  W3.stars.position.copy(W3.camera.position);

  updateLighting(minutes, player);
  W3.renderer.render(W3.scene, W3.camera);
}
