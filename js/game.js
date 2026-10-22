'use strict';
(() => {
// ================= 공용 유틸 =================
const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const hash = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

const T_PLAIN = 0, T_FOREST = 1, T_HILL = 2, T_WATER = 3, T_BRIDGE = 4, CELL = 20;
const SPEED_MUL = [1, 0.65, 0.85, 0, 1];
const PAL = [
  { flag: '#b8322c', mm: '#ff6a5a' },
  { flag: '#2a4ea8', mm: '#6aa0ff' },
];
const FORMS = { rect: '방진', circle: '원진', wedge: '쐐기진', snake: '장사진', hollow: '공심진' };
const SAVE_KEY = 'banners-of-war.save.v1';

const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } })();
save.ach = save.ach || {};
save.scale = save.scale === 5 ? 5 : 1;
// 출전 규모 배율: 일반 부대 병력에만 적용하고 적장(1명)은 그대로 둔다
const SCALES = [1, 5];
const scaled = (n) => n * save.scale;
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 저장 불가 환경 */ } };

// ================= 지형 =================
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}
const wob = (x, y) => 1 + 0.1 * Math.sin(x * 0.021 + y * 0.013) * Math.cos(y * 0.017 - x * 0.009);

function buildTerrain(m) {
  const cw = Math.ceil(m.w / CELL), ch = Math.ceil(m.h / CELL), g = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL, k = wob(x, y);
    let c = T_PLAIN;
    for (const [hx, hy, hr] of m.hills || []) if (d2(x, y, hx, hy) < (hr * k) ** 2) c = T_HILL;
    for (const [fx, fy, fr] of m.forests || []) if (d2(x, y, fx, fy) < (fr * k) ** 2) c = T_FOREST;
    for (const rv of m.rivers || []) for (let i = 1; i < rv.pts.length; i++) {
      const a = rv.pts[i - 1], b = rv.pts[i];
      if (distSeg(x, y, a[0], a[1], b[0], b[1]) < (rv.w / 2) * k) { c = T_WATER; break; }
    }
    for (const br of m.bridges || []) if (distSeg(x, y, br.a[0], br.a[1], br.b[0], br.b[1]) < br.w / 2) c = T_BRIDGE;
    g[cy * cw + cx] = c;
  }
  return { w: m.w, h: m.h, cw, ch, g, bridges: m.bridges || [] };
}
const tAt = (T, x, y) => (x < 0 || y < 0 || x >= T.w || y >= T.h ? T_WATER : T.g[((y / CELL) | 0) * T.cw + ((x / CELL) | 0)]);

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const GP = {
  plain: [[66, 92, 40], [78, 104, 46], [90, 116, 52], [104, 128, 60]],
  forest: [[34, 54, 28], [42, 64, 32], [50, 74, 36], [60, 84, 40]],
  hill: [[98, 92, 54], [124, 116, 70], [142, 132, 82], [162, 152, 98]],
  water: [[34, 70, 112], [40, 82, 126], [50, 98, 144], [140, 186, 210]],
  sand: [[150, 136, 90], [168, 154, 104], [184, 170, 118]],
  dirt: [[112, 88, 56], [128, 102, 64]],
};

// 미니맵·미리보기용 (셀 단위 단색)
function renderTerrainFlat(T, scale) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(T.w * scale); c.height = Math.ceil(T.h * scale);
  const x = c.getContext('2d'), s = CELL * scale;
  const flat = [GP.plain[1], GP.forest[1], GP.hill[2], GP.water[1], GP.dirt[1]];
  for (let cy = 0; cy < T.ch; cy++) for (let cx = 0; cx < T.cw; cx++) {
    const b = flat[T.g[cy * T.cw + cx]], v = (hash(cx, cy) - 0.5) * 12;
    x.fillStyle = `rgb(${b[0] + v | 0},${b[1] + v | 0},${b[2] + v | 0})`;
    x.fillRect(Math.floor(cx * s), Math.floor(cy * s), Math.ceil(s) + 1, Math.ceil(s) + 1);
  }
  return c;
}

// 전투용 픽셀아트 지형 (1px = 월드 1단위, 2×2 블록 단위로 칠함)
function renderTerrain(T, m) {
  const W = T.w, H = T.h, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const tc = (px, py) => tAt(T, clamp(px, 0, W - 1), clamp(py, 0, H - 1));
  const hills = m.hills || [];
  for (let by = 0; by < H; by += 2) for (let bx = 0; bx < W; bx += 2) {
    const sx = bx + (vnoise(bx / 23, by / 23) - 0.5) * 18, sy = by + (vnoise(bx / 23 + 40, by / 23 + 40) - 0.5) * 18;
    const t = tc(sx, sy), big = vnoise(bx / 90, by / 90), n = hash(bx >> 1, by >> 1);
    let col;
    if (t === T_WATER) {
      const shore = tc(sx + 8, sy) !== T_WATER || tc(sx - 8, sy) !== T_WATER || tc(sx, sy + 8) !== T_WATER || tc(sx, sy - 8) !== T_WATER;
      const wave = Math.sin(bx * 0.09 + Math.sin(by * 0.04) * 3 + by * 0.03);
      col = GP.water[shore ? (n < 0.45 ? 3 : 2) : wave > 0.93 && n > 0.4 ? 3 : big > 0.55 ? 1 + (n > 0.7 ? 1 : 0) : n > 0.85 ? 1 : 0];
    } else if (t === T_BRIDGE) {
      col = GP.dirt[n > 0.5 ? 1 : 0];
    } else if (tc(sx + 12, sy) === T_WATER || tc(sx - 12, sy) === T_WATER || tc(sx, sy + 12) === T_WATER || tc(sx, sy - 12) === T_WATER) {
      col = GP.sand[(n * 3) | 0];
    } else if (t === T_HILL) {
      let s = 0;
      for (const [hx, hy, hr] of hills) if (d2(bx, by, hx, hy) < hr * hr * 1.3) s = (-(bx - hx) - (by - hy)) / hr * 0.9;
      const edge = tc(sx, sy + 10) !== T_HILL;
      col = GP.hill[edge ? 0 : clamp(Math.round(1.5 + s + (n - 0.5) * 0.9), 0, 3)];
    } else {
      const pal = t === T_FOREST ? GP.forest : GP.plain;
      col = pal[clamp(Math.floor(big * 2.2 + (n - 0.5) * 1.3 + 0.4), 0, 3)];
    }
    for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
      const i = ((by + oy) * W + bx + ox) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);

  const px = (X, Y, col) => { x.fillStyle = col; x.fillRect(X | 0, Y | 0, 1, 1); };
  // 풀포기와 들꽃
  for (let i = 0; i < 9000; i++) {
    const X = Math.random() * W, Y = Math.random() * H;
    if (tAt(T, X, Y) !== T_PLAIN) continue;
    px(X, Y, '#2e4a1e'); px(X - 1, Y + 1, '#3a5a24'); px(X + 1, Y + 1, '#3a5a24'); px(X, Y - 1, '#7a9a48');
  }
  const flowers = ['#e8d870', '#e88a8a', '#f0f0f0', '#b8a0e8'];
  for (let i = 0; i < 700; i++) {
    const X = Math.random() * W, Y = Math.random() * H;
    if (tAt(T, X, Y) !== T_PLAIN) continue;
    px(X, Y, flowers[(Math.random() * 4) | 0]); px(X, Y + 1, '#2e4a1e');
  }
  // 언덕 위 바위
  const [rw, rh, rax, ray] = Sprites.rockBox;
  for (let i = 0; i < 400; i++) {
    const X = Math.random() * W, Y = Math.random() * H;
    if (tAt(T, X, Y) === T_HILL && Math.random() < 0.5) x.drawImage(Sprites.rocks[0], Math.round(X) - rax, Math.round(Y) - ray, rw, rh);
  }
  // 숲: 흔들린 격자 위에 나무를 y 순서로 배치, 평지에도 몇 그루
  const list = [];
  for (let Y = 0; Y < H; Y += 13) for (let X = 0; X < W; X += 13) {
    const tx = X + (hash(X, Y) - 0.5) * 10, ty = Y + (hash(Y, X) - 0.5) * 10;
    if (tAt(T, tx, ty) === T_FOREST) list.push([tx, ty, (hash(X + 7, Y) * 3) | 0]);
  }
  for (let i = 0; i < 50; i++) {
    const X = Math.random() * W, Y = Math.random() * H;
    if (tAt(T, X, Y) === T_PLAIN) list.push([X, Y, 2]);
  }
  list.sort((a, b) => a[1] - b[1]);
  const [, , tax, tay] = Sprites.treeBox;
  for (const [X, Y, k] of list) {
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(Math.round(X) - 7, Math.round(Y) - 1, 15, 3);
    x.drawImage(Sprites.trees[k], Math.round(X) - tax, Math.round(Y) - tay);
  }
  // 다리: 축 정렬 판자
  for (const br of m.bridges || []) {
    const horiz = Math.abs(br.b[0] - br.a[0]) >= Math.abs(br.b[1] - br.a[1]);
    const L0 = Math.round(horiz ? Math.min(br.a[0], br.b[0]) : Math.min(br.a[1], br.b[1]));
    const L1 = Math.round(horiz ? Math.max(br.a[0], br.b[0]) : Math.max(br.a[1], br.b[1]));
    const mid = Math.round(horiz ? br.a[1] : br.a[0]), half = br.w / 2 - 8;
    const R = (along, across, la, lc, col) => { x.fillStyle = col; if (horiz) x.fillRect(along, across, la, lc); else x.fillRect(across, along, lc, la); };
    R(L0, mid + half, L1 - L0, 4, 'rgba(0,0,0,.35)');
    for (let p = L0; p < L1; p += 5) { R(p, mid - half, 4, half * 2, (p / 5) & 1 ? '#8a6038' : '#7a5230'); R(p + 4, mid - half, 1, half * 2, '#3a2414'); }
    R(L0, mid - half - 2, L1 - L0, 3, '#4a2e18'); R(L0, mid + half - 1, L1 - L0, 3, '#4a2e18');
    for (let p = L0; p < L1; p += 16) { R(p, mid - half - 4, 3, 5, '#2e1c0e'); R(p, mid + half - 2, 3, 5, '#2e1c0e'); }
  }
  return c;
}

// ================= 공간 격자 =================
const GS = 40;
class Grid {
  constructor(w, h) { this.cw = Math.ceil(w / GS) + 1; this.ch = Math.ceil(h / GS) + 1; this.c = []; for (let i = 0; i < this.cw * this.ch; i++) this.c.push([]); }
  clear() { for (const a of this.c) a.length = 0; }
  add(u) { this.c[clamp((u.y / GS) | 0, 0, this.ch - 1) * this.cw + clamp((u.x / GS) | 0, 0, this.cw - 1)].push(u); }
  near(x, y, r, out) {
    out.length = 0;
    const x0 = clamp(((x - r) / GS) | 0, 0, this.cw - 1), x1 = clamp(((x + r) / GS) | 0, 0, this.cw - 1);
    const y0 = clamp(((y - r) / GS) | 0, 0, this.ch - 1), y1 = clamp(((y + r) / GS) | 0, 0, this.ch - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const a = this.c[cy * this.cw + cx]; for (let i = 0; i < a.length; i++) out.push(a[i]); }
    return out;
  }
}
const NB_A = [], NB_B = [];

// ================= 진형 =================
function formationSlots(n, ax, ay, face, form, sp) {
  const fx = Math.cos(face), fy = Math.sin(face), rx = -fy, ry = fx, out = [];
  const put = (lat, dep) => out.push([ax + rx * lat + fx * dep, ay + ry * lat + fy * dep]);
  if (n <= 1) { put(0, 0); return out; }
  if (form === 'circle') {
    put(0, 0);
    for (let k = 1; out.length < n; k++) {
      const cnt = Math.min(Math.floor(TAU * k), n - out.length);
      for (let j = 0; j < cnt; j++) { const a = (j / cnt) * TAU; put(Math.cos(a) * k * sp, Math.sin(a) * k * sp); }
    }
  } else if (form === 'wedge') {
    for (let k = 0; out.length < n; k++) {
      const cnt = Math.min(2 * k + 1, n - out.length);
      for (let j = 0; j < cnt; j++) put((j - (cnt - 1) / 2) * sp, -k * sp * 0.9);
    }
  } else if (form === 'snake') {
    for (let i = 0; i < n; i++) put(((i % 3) - 1) * sp, -((i / 3) | 0) * sp);
  } else if (form === 'hollow') {
    const s = Math.max(2, Math.ceil(n / 4)) * sp;
    for (let i = 0; i < n; i++) {
      const p = (i / n) * 4 * s, e = Math.floor(p / s), o = p - e * s;
      if (e === 0) put(-s / 2 + o, s / 2); else if (e === 1) put(s / 2, s / 2 - o); else if (e === 2) put(s / 2 - o, -s / 2); else put(-s / 2, -s / 2 + o);
    }
  } else {
    const cols = Math.max(1, Math.round(Math.sqrt(n * 2.2)));
    for (let i = 0; i < n; i++) {
      const row = (i / cols) | 0, cnt = Math.min(cols, n - row * cols);
      put((i - row * cols - (cnt - 1) / 2) * sp, -row * sp);
    }
  }
  return out;
}

// ================= 전투 상태 =================
let G = null;
const cv = $('#gl'), ctx = cv.getContext('2d');
let DPR = 1;
function resize() { DPR = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
addEventListener('resize', resize); resize();

const mouse = { x: innerWidth / 2, y: innerHeight / 2, l: false };
const keys = new Set();
const key = (c) => keys.has(c);
const mouseWorld = () => ({ x: (mouse.x - innerWidth / 2) / G.zoom + G.cam.x, y: (mouse.y - innerHeight / 2) / G.zoom + G.cam.y });

function startBattle(b) {
  const T = buildTerrain(b.map);
  const terr = renderTerrain(T, b.map);
  G = {
    b, T, terr, terrCtx: terr.getContext('2d'), mmTerr: renderTerrainFlat(T, 0.07),
    units: [], regs: [], proj: [], fx: [], texts: [], markers: [],
    t: 0, frame: 0, speed: 1, paused: false, over: false, tac: false,
    zoom: 1.6, zoomT: 1.6, zoomSave: 1.6, cam: { x: b.player.hero.x, y: b.player.hero.y }, shake: 0,
    sel: new Set(), kills: 0, combo: 0, comboT: 0, lost: [0, 0], init: [0, 0],
    grid: new Grid(T.w, T.h), followFace: b.player.face || 0, wind: false, done: new Set(), generalDead: false,
    regId: 0, thinkT: 0, hudT: 0, mmT: 0,
  };
  const h = b.player.hero;
  G.hero = {
    isHero: true, side: 0, x: h.x, y: h.y, r: 11, hp: b.heroHp, maxHp: b.heroHp, st: 100, mu: b.heroMu || 0,
    face: b.player.face || 0, atk: b.heroAtk || 1, def: b.heroDef || 0.5, inv: 0, flash: 0, dead: false,
    swingT: 0, swingDur: 0.25, combo: 0, comboWin: 0, queued: false, charging: false, charge: 0,
    dashT: 0, dashSet: null, dodgeT: 0, ddx: 0, ddy: 0, musouT: 0, musouTick: 0, cd: { q: 0, e: 0, r: 0 },
  };
  for (const d of b.player.regs) addReg(d, 0);
  for (const d of b.enemy.regs) addReg(d, 1);
  if (b.enemy.general) addReg({ type: 'general', count: 1, wait: 9999, ...b.enemy.general }, 1, true);
  buildHud();
  $('#menu').classList.remove('show'); $('#result').classList.remove('show'); $('#pause').classList.remove('show');
  $('#hud').classList.add('show'); $('#hud').classList.remove('tac');
  banner(b.name);
  log(`${b.name} — ${b.objective}`, 'gold');
}

function addReg(d, side, isGeneral = false) {
  const t = UNIT_TYPES[d.type], count = isGeneral ? d.count : scaled(d.count);
  const face = side ? (G.b.enemy.face ?? Math.PI) : (G.b.player.face || 0);
  const r = {
    id: G.regId++, side, tk: d.type, type: t, name: d.name || t.name, units: [], init: count, alive: count,
    morale: 100, routing: false, lt: !!d.lt, wait: d.wait || 0, formation: d.formation || 'rect',
    home: { x: d.x, y: d.y }, face, cx: d.x, cy: d.y, ax: d.x, ay: d.y, mode: 'idle', buffT: 0,
    isGeneral, dead: false, target: null, el: null,
    num: side === 0 ? G.regs.filter((x) => x.side === 0).length + 1 : 0,
  };
  r.order = side === 0 && !d.lt ? { k: 'hold', x: d.x, y: d.y, face } : { k: 'auto' };
  const mul = side ? G.b.enemyMul : { hp: 1, atk: 1 };
  const slots = formationSlots(count, d.x, d.y, face, r.formation, t.sp || 15);
  for (let i = 0; i < count; i++) {
    let [x, y] = slots[i];
    if (tAt(G.T, x, y) === T_WATER) { x = d.x + rand(-10, 10); y = d.y + rand(-10, 10); }
    const u = {
      type: t, tk: d.type, r: t.r, side, reg: r, x, y, sx: x, sy: y, hp: t.hp * mul.hp, maxHp: t.hp * mul.hp, atkMul: mul.atk,
      cd: rand(0, t.cd), face, kbx: 0, kby: 0, mom: 0, flash: 0, atkA: 0, dead: false,
    };
    r.units.push(u); G.units.push(u);
  }
  G.regs.push(r); G.init[side] += count;
  return r;
}

// ================= 탐색/경로 =================
function nearestEnemy(x, y, side, r) {
  let best = null, bd = r * r;
  const a = G.grid.near(x, y, r, NB_A);
  for (let i = 0; i < a.length; i++) {
    const o = a[i]; if (o.side === side || o.dead) continue;
    const d = d2(x, y, o.x, o.y); if (d < bd) { bd = d; best = o; }
  }
  const h = G.hero;
  if (side === 1 && !h.dead && d2(x, y, h.x, h.y) < bd) best = h;
  return best;
}
function enemyRegNear(x, y, r, side = 1) {
  let best = null, bd = r * r;
  for (const o of G.regs) if (o.side === side && !o.dead) { const d = d2(x, y, o.cx, o.cy); if (d < bd) { bd = d; best = o; } }
  return best;
}
function pickTarget(r) {
  let best = null, bd = Infinity;
  for (const o of G.regs) {
    if (o.side === r.side || o.dead) continue;
    let d = d2(r.cx, r.cy, o.cx, o.cy);
    if (o.routing) d *= 2.2;
    if (d < bd) { bd = d; best = o; }
  }
  const h = G.hero;
  if (r.side === 1 && !h.dead && d2(r.cx, r.cy, h.x, h.y) * (G.b.mode === 'musou' ? 0.5 : 1.2) < bd) best = { cx: h.x, cy: h.y, dead: false, hero: true };
  return best;
}
function crossesWater(x1, y1, x2, y2) {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 15);
  for (let i = 1; i < n; i++) if (tAt(G.T, x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n) === T_WATER) return true;
  return false;
}
// 강을 건너야 하면 가장 가까운 다리의 입구/출구를 경유점으로 돌려준다
function route(x1, y1, x2, y2) {
  if (!G.T.bridges.length || !crossesWater(x1, y1, x2, y2)) return null;
  let best = null, bc = Infinity;
  for (const br of G.T.bridges) for (const [p, q] of [[br.a, br.b], [br.b, br.a]]) {
    const c = Math.hypot(p[0] - x1, p[1] - y1) + Math.hypot(q[0] - p[0], q[1] - p[1]) + Math.hypot(x2 - q[0], y2 - q[1]);
    if (c < bc) { bc = c; best = [p, q]; }
  }
  const [p, q] = best;
  return crossesWater(x1, y1, q[0], q[1]) ? { x: p[0], y: p[1] } : { x: q[0], y: q[1] };
}
function moveBy(e, dx, dy) {
  const nx = e.x + dx, ny = e.y + dy;
  if (tAt(G.T, nx, e.y) !== T_WATER) e.x = nx;
  if (tAt(G.T, e.x, ny) !== T_WATER) e.y = ny;
}

// ================= 부대 AI =================
function followPos(r) {
  const f = G.followFace, fx = Math.cos(f), fy = Math.sin(f), rx = -fy, ry = fx, h = G.hero;
  const list = G.regs.filter((x) => x.side === 0 && !x.dead && !x.routing && x.order.k === 'follow' && !!x.type.ranged === !!r.type.ranged);
  const i = list.indexOf(r), slot = [0, -1, 1, -2, 2, -3, 3, -4, 4][i] ?? i;
  const dep = r.type.ranged ? -90 : 90;
  return { x: h.x + fx * dep + rx * slot * 130, y: h.y + fy * dep + ry * slot * 130 };
}

function thinkReg(r, dt) {
  let n = 0, sx = 0, sy = 0;
  for (const u of r.units) if (!u.dead) { n++; sx += u.x; sy += u.y; }
  r.alive = n;
  if (!n) {
    if (!r.dead) { r.dead = true; if (!r.isGeneral) log(`${r.side ? '적' : '아군'} ${r.name} 전멸`, r.side ? 'good' : 'bad'); }
    return;
  }
  r.cx = sx / n; r.cy = sy / n;
  if (r.buffT > 0) r.buffT -= dt;

  // 사기: 손실이 클수록 회복 상한이 낮아진다
  const cap = 35 + 65 * n / r.init, h = G.hero;
  const threat = nearestEnemy(r.cx, r.cy, r.side, 220);
  if (!threat) r.morale += (r.routing ? 3 : 1.5) * dt;
  if (!h.dead) {
    const hd = d2(r.cx, r.cy, h.x, h.y);
    if (r.side === 1 && hd < 180 * 180) r.morale -= 1 * dt;
    if (r.side === 0 && hd < 260 * 260) r.morale += dt;
  }
  r.morale = clamp(r.morale, 0, cap);
  if (r.isGeneral) r.morale = 100;
  if (r.routing) {
    if (r.morale > 50 && !threat && n > r.init * 0.2) { r.routing = false; log(`${r.name} 재집결`, r.side ? 'bad' : 'good'); }
    else { r.mode = 'rout'; return; }
  } else if (r.morale < 22 && !r.isGeneral) {
    r.routing = true; r.mode = 'rout';
    log(`${r.side ? '적' : '아군'} ${r.name} 붕괴! 패주한다`, r.side ? 'good' : 'bad');
    return;
  }

  const o = r.order;
  let ax = r.ax, ay = r.ay, face = r.face, tgt = null, engR = 120;
  if (o.k === 'attack' || o.k === 'charge') {
    tgt = o.target && !o.target.dead ? o.target : pickTarget(r);
    if (!tgt) r.order = { k: 'hold', x: r.cx, y: r.cy, face: r.face };
  } else if (o.k === 'auto') {
    if (G.t < r.wait && !nearestEnemy(r.cx, r.cy, r.side, 520)) { ax = r.home.x; ay = r.home.y; engR = 90; }
    else tgt = pickTarget(r);
  } else if (o.k === 'follow') {
    const p = followPos(r); ax = p.x; ay = p.y; face = G.followFace; engR = 150;
  } else {
    ax = o.x; ay = o.y; face = o.face; engR = o.k === 'hold' ? 100 : 0;
    if (o.k === 'move' && d2(r.cx, r.cy, ax, ay) < 50 * 50) o.k = 'hold';
  }
  if (tgt) {
    const dx = tgt.cx - r.cx, dy = tgt.cy - r.cy, d = Math.hypot(dx, dy) || 1;
    face = Math.atan2(dy, dx);
    if (r.type.ranged) {
      const keep = r.type.range * 0.75;
      if (d > keep) { ax = tgt.cx - dx / d * keep; ay = tgt.cy - dy / d * keep; } else { ax = r.cx; ay = r.cy; }
    } else { ax = tgt.cx; ay = tgt.cy; engR = 180; }
  }
  r.target = tgt && !tgt.hero ? tgt : null;
  r.face = face; r.ax = ax; r.ay = ay;

  const near = engR > 0 && !r.type.ranged && nearestEnemy(r.cx, r.cy, r.side, engR + n * 0.6);
  let form = r.formation, sf = face;
  const wp = route(r.cx, r.cy, ax, ay);
  if (wp) { ax = wp.x; ay = wp.y; form = 'snake'; sf = Math.atan2(ay - r.cy, ax - r.cx); }
  const dist = Math.sqrt(d2(r.cx, r.cy, ax, ay));
  r.mode = near ? 'fight' : dist > 80 || wp ? 'march' : 'idle';
  // 행군 중에는 진형 기준점을 조금씩 앞으로 끌어 대형을 유지
  if (dist > 120) {
    if (!wp && dist > 300) sf = Math.atan2(ay - r.cy, ax - r.cx);
    const step = 90 / dist; ax = r.cx + (ax - r.cx) * step; ay = r.cy + (ay - r.cy) * step;
  }
  const alive = r.units.filter((u) => !u.dead);
  const slots = formationSlots(alive.length, ax, ay, sf, form, r.type.sp || 15);
  for (let i = 0; i < alive.length; i++) { alive[i].sx = slots[i][0]; alive[i].sy = slots[i][1]; }
}

// ================= 병사 =================
function updUnit(u, dt) {
  const t = u.type, reg = u.reg;
  u.cd -= dt; if (u.flash > 0) u.flash -= dt; if (u.atkA > 0) u.atkA -= dt;
  let mx = 0, my = 0, sp = t.speed * (SPEED_MUL[tAt(G.T, u.x, u.y)] || 1);
  const toSlot = () => {
    const dx = u.sx - u.x, dy = u.sy - u.y, d = Math.hypot(dx, dy);
    if (d > 3) { const k = Math.min(1, d / 24); mx = dx / d * k; my = dy / d * k; if (d > 40) sp *= 1.15; u.face = Math.atan2(dy, dx); }
    else u.face += angDiff(u.face, reg.face) * Math.min(1, dt * 6);
  };
  if (reg.routing) {
    const e = nearestEnemy(u.x, u.y, u.side, 160);
    mx = u.side ? 1 : -1; my = e ? clamp((u.y - e.y) / 60, -1, 1) * 0.7 : 0;
    const l = Math.hypot(mx, my); mx /= l; my /= l; sp *= 1.1; u.face = Math.atan2(my, mx);
    if (u.x < 30 || u.x > G.T.w - 30) { u.dead = true; reg.alive--; G.lost[u.side]++; return; }
  } else if (t.ranged) {
    const close = nearestEnemy(u.x, u.y, u.side, 24);
    if (close) { u.face = Math.atan2(close.y - u.y, close.x - u.x); if (u.cd <= 0) strike(u, close, 0.4); }
    else {
      toSlot();
      if (d2(u.x, u.y, u.sx, u.sy) < 900 && u.cd <= 0) {
        const e = nearestEnemy(u.x, u.y, u.side, t.range * (u.side === 0 && G.wind ? 1.25 : 1));
        if (e) shoot(u, e); else u.cd = 0.3;
      }
    }
  } else {
    const fight = reg.mode === 'fight';
    const R = fight ? 150 : reg.mode === 'march' ? 24 : reg.order.k === 'hold' ? 55 : 80;
    let e = nearestEnemy(u.x, u.y, u.side, R);
    if (e && !fight && d2(e.x, e.y, u.sx, u.sy) > (R + 40) ** 2) e = null;
    if (e) {
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy) || 1;
      u.face = Math.atan2(dy, dx);
      if (d > t.range + e.r) { mx = dx / d; my = dy / d; if (reg.order.k === 'charge') sp *= 1.25; }
      else if (u.cd <= 0) strike(u, e);
    } else toSlot();
  }
  const vx = mx * sp, vy = my * sp;
  u.mom += (Math.hypot(vx, vy) - u.mom) * Math.min(1, dt * 4);
  if (u.mom > 6) u.anim = (u.anim || 0) + dt * u.mom / 9;
  moveBy(u, (vx + u.kbx) * dt, (vy + u.kby) * dt);
  const dec = Math.pow(0.004, dt); u.kbx *= dec; u.kby *= dec;
}

function strike(u, e, mul = 1) {
  const t = u.type;
  u.cd = t.cd * rand(0.85, 1.15); u.atkA = 0.18;
  let dmg = t.atk * u.atkMul * mul * (u.reg.buffT > 0 ? 1.3 : 1);
  if (e.type && e.type.cav && t.vsCav) dmg *= t.vsCav;
  const charging = t.cav && u.mom > t.speed * 0.6;
  if (charging) { dmg *= 2.2; if (e.tk === 'spear') hurt(u, 14, e); }
  const a = Math.atan2(e.y - u.y, e.x - u.x), kb = charging ? 90 : 12;
  hurt(e, dmg, u, Math.cos(a) * kb, Math.sin(a) * kb);
}

function shoot(u, e) {
  const t = u.type, d = Math.sqrt(d2(u.x, u.y, e.x, e.y)), spread = d * 0.06;
  u.cd = t.cd * rand(0.85, 1.2); u.atkA = 0.25; u.face = Math.atan2(e.y - u.y, e.x - u.x);
  const dmg = t.atk * u.atkMul * (u.reg.buffT > 0 ? 1.3 : 1) * (u.side === 0 && G.wind ? 1.4 : 1);
  G.proj.push({ x0: u.x, y0: u.y, x1: e.x + rand(-spread, spread), y1: e.y + rand(-spread, spread), t: 0, dur: Math.max(0.25, d / 380), side: u.side, dmg, src: u });
}

function hurt(t, amt, src, kx = 0, ky = 0) {
  if (t.dead || G.over) return;
  if (t.isHero) {
    if (t.inv > 0) return;
    amt *= t.def; t.hp -= amt; t.flash = 0.12; t.mu = Math.min(100, t.mu + amt * 0.02);
    G.shake = Math.max(G.shake, 2);
    if (t.hp <= 0) { t.hp = 0; t.dead = true; endBattle(false, `${G.b.heroName}이(가) 쓰러졌다`); }
    return;
  }
  let m = 1 - t.type.armor;
  if (t.reg.routing) m *= 1.5;
  if (tAt(G.T, t.x, t.y) === T_HILL && !(src && tAt(G.T, src.x, src.y) === T_HILL)) m *= 0.8;
  t.hp -= amt * m; t.flash = 0.1; t.kbx += kx; t.kby += ky;
  if (src === G.hero) { G.hero.mu = Math.min(100, G.hero.mu + 0.3); G.comboT = 2.5; }
  if (t.hp <= 0) kill(t, src);
}

function kill(u, src) {
  u.dead = true;
  const reg = u.reg; reg.alive--; reg.morale -= 90 / reg.init; G.lost[u.side]++;
  if (reg.isGeneral) {
    G.generalDead = true; banner('적장 격파!'); log(`적장 ${reg.name}을(를) 베었다!`, 'gold');
    for (const r of G.regs) if (r.side === 1) r.morale -= 45; else r.morale = Math.min(100, r.morale + 30);
  }
  if (src === G.hero) {
    G.kills++; G.combo++; G.comboT = 2.5; G.hero.mu = Math.min(100, G.hero.mu + 0.8); reg.morale -= 0.5;
  }
  const c = G.terrCtx;
  c.fillStyle = 'rgba(90,14,10,.5)';
  for (let i = 0; i < 5; i++) c.fillRect(Math.round(u.x + rand(-4, 4)), Math.round(u.y + rand(-3, 2)), 2, 2);
  for (let i = 0; i < 4; i++) G.fx.push({ k: 'p', x: u.x, y: u.y, vx: rand(-60, 60), vy: rand(-60, 60), t: 0, dur: rand(0.3, 0.6), c: '#8a1a10' });
}

function separate() {
  for (const u of G.units) {
    if (u.dead) continue;
    const a = G.grid.near(u.x, u.y, 18, NB_B);
    let px = 0, py = 0;
    for (const o of a) {
      if (o === u || o.dead) continue;
      const dx = u.x - o.x, dy = u.y - o.y, rr = u.r + o.r, dd = dx * dx + dy * dy;
      if (dd >= rr * rr) continue;
      if (dd < 1e-4) { px += rand(-0.5, 0.5); py += rand(-0.5, 0.5); continue; }
      const d = Math.sqrt(dd), p = (rr - d) / d * 0.3; px += dx * p; py += dy * p;
    }
    if (px || py) moveBy(u, px, py);
  }
}

// ================= 주장 =================
const busy = (h) => h.dead || h.dashT > 0 || h.dodgeT > 0 || h.musouT > 0;

function heroArc(rad, half, dmg, kb, cap) {
  const h = G.hero, a = G.grid.near(h.x, h.y, rad + 12, NB_B), hit = [];
  for (const u of a) {
    if (u.dead || u.side === 0) continue;
    const dx = u.x - h.x, dy = u.y - h.y, dd = dx * dx + dy * dy, rr = rad + u.r;
    if (dd > rr * rr) continue;
    if (half < Math.PI && Math.abs(angDiff(h.face, Math.atan2(dy, dx))) > half) continue;
    hit.push([dd, u, dx, dy]);
  }
  hit.sort((p, q) => p[0] - q[0]);
  const n = Math.min(hit.length, cap);
  for (let i = 0; i < n; i++) {
    const [dd, u, dx, dy] = hit[i], d = Math.sqrt(dd) || 1, v = dmg * h.atk * rand(0.9, 1.1);
    hurt(u, v, h, dx / d * kb, dy / d * kb);
    if (i < 5) { floatText(u.x, u.y - 10, Math.round(v), '#ffe8a0'); G.fx.push({ k: 'spark', x: u.x + rand(-3, 3), y: u.y - 10 + rand(-3, 3), t: 0, dur: 0.16 }); }
  }
  if (n) G.shake = Math.max(G.shake, 2);
  return n;
}
function swing() {
  const h = G.hero, s = h.combo;
  h.combo = (s + 1) % 3; h.comboWin = 0.75; h.swingDur = h.swingT = s === 2 ? 0.34 : 0.24; h.swingDir = s === 1 ? -1 : 1;
  const rad = [64, 64, 80][s], half = [1.0, 1.0, 1.5][s];
  heroArc(rad, half, [34, 34, 60][s], [50, 50, 200][s], [4, 4, 7][s]);
  G.fx.push({ k: 'slash', x: h.x, y: h.y, a: h.face, r: rad, half, t: 0, dur: 0.22, big: s === 2, dir: h.swingDir });
}
function attackPress() {
  const h = G.hero;
  if (busy(h) || h.charging) return;
  if (h.swingT > 0) { h.queued = true; return; }
  swing();
}
function chargeStart() { const h = G.hero; if (!busy(h) && h.swingT <= 0) { h.charging = true; h.charge = 0; } }
function chargeRelease() {
  const h = G.hero; if (!h.charging) return;
  h.charging = false; const c = h.charge;
  heroArc(70 + 70 * c, Math.PI + 0.01, 50 + 120 * c, 120 + 200 * c, 4 + Math.round(8 * c));
  G.fx.push({ k: 'ring', x: h.x, y: h.y, r0: 20, r1: 70 + 70 * c, t: 0, dur: 0.3, c: '#ffe08c', c2: '#e09040' });
  G.shake = Math.max(G.shake, 3 + 6 * c); h.swingT = h.swingDur = 0.3;
}
function dash() {
  const h = G.hero; if (busy(h) || h.cd.q > 0 || h.st < 15) return;
  h.dashT = 0.24; h.inv = 0.24; h.cd.q = 5; h.st -= 15; h.dashSet = new Set(); h.charging = false;
}
function dashHits() {
  const h = G.hero, a = G.grid.near(h.x, h.y, 36, NB_B).slice(), px = -Math.sin(h.face), py = Math.cos(h.face);
  for (const u of a) {
    if (h.dashSet.size >= 8) break;
    if (u.dead || u.side === 0 || h.dashSet.has(u) || d2(u.x, u.y, h.x, h.y) > (30 + u.r) ** 2) continue;
    h.dashSet.add(u);
    const s = (u.x - h.x) * px + (u.y - h.y) * py >= 0 ? 1 : -1, v = 70 * h.atk;
    hurt(u, v, h, px * s * 140, py * s * 140); floatText(u.x, u.y - 10, Math.round(v), '#ffe8a0');
  }
}
function slam() {
  const h = G.hero; if (busy(h) || h.cd.e > 0) return;
  h.cd.e = 8; h.charging = false;
  heroArc(125, Math.PI + 0.01, 80, 230, 12);
  G.fx.push({ k: 'ring', x: h.x, y: h.y, r0: 10, r1: 130, t: 0, dur: 0.35, c: '#e6c896', c2: '#8a6a40' });
  G.shake = 8;
}
function roar() {
  const h = G.hero; if (busy(h) || h.cd.r > 0) return;
  h.cd.r = 22;
  let rallied = 0;
  for (const r of G.regs) {
    if (r.dead) continue;
    if (r.side === 0 && d2(r.cx, r.cy, h.x, h.y) < 450 * 450) {
      if (r.routing) rallied++;
      r.routing = false; r.morale = Math.max(r.morale + 35, 65); r.buffT = 12;
    } else if (r.side === 1 && d2(r.cx, r.cy, h.x, h.y) < 250 * 250) r.morale -= 12;
  }
  for (const u of G.grid.near(h.x, h.y, 150, NB_B).slice()) {
    if (u.dead || u.side === 0) continue;
    const dx = u.x - h.x, dy = u.y - h.y, d = Math.hypot(dx, dy) || 1;
    if (d < 150) { u.kbx += dx / d * 180; u.kby += dy / d * 180; }
  }
  G.fx.push({ k: 'ring', x: h.x, y: h.y, r0: 20, r1: 450, t: 0, dur: 0.6, c: '#ffd25a', c2: '#fff0b0' });
  banner('전군, 함성을 올려라!', 'order');
  if (rallied) log(`함성으로 ${rallied}개 부대가 재집결했다`, 'good');
}
function musou() {
  const h = G.hero; if (busy(h) || h.mu < 100) return;
  h.mu = 0; h.musouT = 2.6; h.musouTick = 0; h.charging = false;
  banner('무 쌍 난 무', 'musou');
}
function dodge() {
  const h = G.hero; if (busy(h) || h.st < 22) return;
  let ix = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0), iy = (key('KeyS') ? 1 : 0) - (key('KeyW') ? 1 : 0);
  if (!ix && !iy) { ix = -Math.cos(h.face); iy = -Math.sin(h.face); }
  const l = Math.hypot(ix, iy); h.ddx = ix / l; h.ddy = iy / l;
  h.dodgeT = 0.28; h.inv = 0.36; h.st -= 22; h.charging = false;
}

function updHero(dt) {
  const h = G.hero; if (h.dead) return;
  for (const k in h.cd) if (h.cd[k] > 0) h.cd[k] -= dt;
  if (h.inv > 0) h.inv -= dt; if (h.flash > 0) h.flash -= dt;
  let ix = 0, iy = 0;
  if (!G.tac) {
    ix = (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0);
    iy = (key('KeyS') || key('ArrowDown') ? 1 : 0) - (key('KeyW') || key('ArrowUp') ? 1 : 0);
  }
  const il = Math.hypot(ix, iy); if (il) { ix /= il; iy /= il; }
  if (!G.tac && h.dashT <= 0 && h.musouT <= 0) { const m = mouseWorld(); h.face = Math.atan2(m.y - h.y, m.x - h.x); }
  const tm = SPEED_MUL[tAt(G.T, h.x, h.y)], terr = tm > 0 ? Math.max(0.75, tm) : 1;
  let vx = 0, vy = 0;
  if (h.dodgeT > 0) { h.dodgeT -= dt; vx = h.ddx * 430; vy = h.ddy * 430; }
  else if (h.dashT > 0) { h.dashT -= dt; vx = Math.cos(h.face) * 560; vy = Math.sin(h.face) * 560; dashHits(); }
  else {
    let sp = 150;
    if ((key('ShiftLeft') || key('ShiftRight')) && il && h.st > 1 && !h.charging && h.swingT <= 0) { sp = 235; h.st -= 26 * dt; }
    else h.st = Math.min(100, h.st + 22 * dt);
    if (h.swingT > 0) sp *= 0.35;
    if (h.charging) sp *= 0.5;
    vx = ix * sp * terr; vy = iy * sp * terr;
  }
  if (il) G.followFace += angDiff(G.followFace, Math.atan2(iy, ix)) * Math.min(1, dt * 1.5);
  moveBy(h, vx * dt, vy * dt);
  h.moving = il > 0;
  if (h.moving) h.anim = (h.anim || 0) + dt * Math.hypot(vx, vy) / 9;

  if (h.swingT > 0) { h.swingT -= dt; if (h.swingT <= 0 && h.queued) { h.queued = false; swing(); } }
  else if (mouse.l && !G.tac && !h.charging && !busy(h)) swing();
  if (h.comboWin > 0) { h.comboWin -= dt; if (h.comboWin <= 0) h.combo = 0; }
  if (h.charging) h.charge = Math.min(1, h.charge + dt * 0.9);
  if (h.musouT > 0) {
    h.musouT -= dt; h.inv = 0.1; h.face += dt * 14; h.musouTick -= dt;
    if (h.musouTick <= 0) { h.musouTick = 0.12; heroArc(150, Math.PI + 0.01, 38, 90, 8); G.fx.push({ k: 'ring', x: h.x, y: h.y, r0: 40, r1: 150, t: 0, dur: 0.2, c: '#ffaa3c', c2: '#d05020' }); }
    if (h.musouT <= 0) { heroArc(230, Math.PI + 0.01, 150, 320, 20); G.fx.push({ k: 'ring', x: h.x, y: h.y, r0: 30, r1: 240, t: 0, dur: 0.5, c: '#fff0c8', c2: '#ffaa3c' }); G.shake = 12; }
  }
  if ((h.mu >= 100 || h.musouT > 0) && Math.random() < dt * (h.musouT > 0 ? 60 : 18)) {
    G.fx.push({ k: 'ember', x: h.x + rand(-10, 10), y: h.y + rand(-6, 2), vx: rand(-8, 8), vy: -rand(30, 60), t: 0, dur: rand(0.4, 0.8) });
  }
  if (!nearestEnemy(h.x, h.y, 0, 220)) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.012 * dt);
  // 주장은 병사를 밀어낸다
  for (const o of G.grid.near(h.x, h.y, 24, NB_B)) {
    if (o.dead) continue;
    const dx = o.x - h.x, dy = o.y - h.y, rr = h.r + o.r, dd = dx * dx + dy * dy;
    if (dd < rr * rr && dd > 0.01) { const d = Math.sqrt(dd), p = rr - d; moveBy(o, dx / d * p * 0.7, dy / d * p * 0.7); moveBy(h, -dx / d * p * 0.3, -dy / d * p * 0.3); }
  }
}

// ================= 지휘 =================
const playerRegs = () => G.regs.filter((r) => r.side === 0 && !r.dead);
function cmdRegs() {
  const s = playerRegs().filter((r) => G.sel.has(r.id));
  return s.length ? s : playerRegs().filter((r) => !r.lt);
}
function issue(k) {
  const regs = cmdRegs(); if (!regs.length) return;
  const m = mouseWorld();
  if (k === 'auto') {
    const all = regs.every((r) => r.order.k === 'auto');
    for (const r of regs) r.order = all ? { k: 'follow' } : { k: 'auto' };
    banner(all ? '지휘권을 되찾았다 — 열진 전진' : '자율 지휘로 전환', 'order'); return;
  }
  if (k === 'follow') { for (const r of regs) r.order = { k: 'follow' }; banner('열을 지어 전진하라!', 'order'); return; }
  const er = enemyRegNear(m.x, m.y, Math.max(140, 40 / G.zoom));
  if (k === 'charge' || (k === 'attack' && er)) {
    for (const r of regs) r.order = { k, target: er || pickTarget(r) };
    if (er) G.markers.push({ x: er.cx, y: er.cy, t: 0, dur: 1.2, c: '#ff5a3a' });
    banner(k === 'charge' ? '돌격하라!' : `${er.name}을(를) 쳐라!`, 'order'); return;
  }
  const kind = k === 'hold' ? 'hold' : 'move';
  const ce = enemyRegNear(m.x, m.y, 1e5);
  const face = ce ? Math.atan2(ce.cy - m.y, ce.cx - m.x) : G.followFace;
  const fx = Math.cos(face), fy = Math.sin(face), rx = -fy, ry = fx, n = regs.length;
  regs.forEach((r, i) => {
    const lat = (i - (n - 1) / 2) * 120, back = r.type.ranged ? -70 : 0;
    r.order = { k: kind, x: m.x + rx * lat + fx * back, y: m.y + ry * lat + fy * back, face };
  });
  G.markers.push({ x: m.x, y: m.y, t: 0, dur: 1.2, c: '#ffd23a' });
  banner(kind === 'hold' ? '그 자리를 사수하라!' : '지정 위치로 진군!', 'order');
}
function setForm(f) {
  const regs = cmdRegs(); for (const r of regs) r.formation = f;
  if (regs.length) banner(`${FORMS[f]}을 펼쳐라!`, 'order');
}
function selectReg(num, add) {
  const r = playerRegs().find((x) => x.num === num); if (!r) return;
  if (add) { if (G.sel.has(r.id)) G.sel.delete(r.id); else G.sel.add(r.id); }
  else { G.sel.clear(); G.sel.add(r.id); }
}
function toggleTac() {
  G.tac = !G.tac; $('#hud').classList.toggle('tac', G.tac); $('#btn-tac').classList.toggle('on', G.tac);
  if (G.tac) { G.zoomSave = G.zoomT; G.zoomT = Math.min(innerWidth / G.T.w, (innerHeight - 140) / G.T.h) * 0.95; G.hero.charging = false; }
  else G.zoomT = G.zoomSave;
}
function tacClick(btn, shift) {
  const m = mouseWorld();
  if (btn === 0) {
    const r = enemyRegNear(m.x, m.y, Math.max(60, 30 / G.zoom), 0);
    if (r) selectReg(r.num, shift); else if (!shift) G.sel.clear();
  } else if (btn === 2) issue('attack');
}

// ================= 메인 루프 =================
function update(dt) {
  G.t += dt; G.frame++;
  for (const ev of G.b.events || []) {
    if (G.done.has(ev) || G.t < ev.t) continue;
    G.done.add(ev);
    if (ev.wind) G.wind = true;
    if (ev.regs) for (const d of ev.regs) addReg(d, 1);
    if (ev.msg) { log(ev.msg, 'gold'); banner(ev.msg, 'order'); }
  }
  G.grid.clear(); for (const u of G.units) if (!u.dead) G.grid.add(u);
  G.thinkT -= dt;
  if (G.thinkT <= 0) { G.thinkT = 0.25; for (const r of G.regs) if (!r.dead) thinkReg(r, 0.25); }
  for (const u of G.units) if (!u.dead) updUnit(u, dt);
  separate();
  updHero(dt);
  for (const p of G.proj) {
    p.t += dt;
    if (p.t >= p.dur) {
      p.done = true;
      const e = nearestEnemy(p.x1, p.y1, p.side, 10);
      if (e) hurt(e, p.dmg * (e.isHero ? 0.5 : 1) * (tAt(G.T, e.x, e.y) === T_FOREST ? 0.6 : 1), p.src);
    }
  }
  G.proj = G.proj.filter((p) => !p.done);
  for (const f of G.fx) { f.t += dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; } }
  G.fx = G.fx.filter((f) => f.t < f.dur);
  for (const t of G.texts) { t.t += dt; t.y -= 30 * dt; }
  G.texts = G.texts.filter((t) => t.t < t.dur);
  for (const mk of G.markers) mk.t += dt;
  G.markers = G.markers.filter((mk) => mk.t < mk.dur);
  if ((G.frame & 63) === 0) { G.units = G.units.filter((u) => !u.dead); for (const r of G.regs) r.units = r.units.filter((u) => !u.dead); }
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  checkEnd();
}

function checkEnd() {
  if (G.over) return;
  const en = G.regs.filter((r) => r.side === 1 && !r.dead), pl = playerRegs();
  const pending = (G.b.events || []).some((ev) => ev.regs && !G.done.has(ev));
  if (G.generalDead && G.b.mode === 'musou') return endBattle(true, '적장을 베었다');
  if (!pending && en.every((r) => r.routing)) return endBattle(true, G.generalDead ? '적장을 베고 적군을 무너뜨렸다' : '적군이 모두 무너졌다');
  if (G.b.mode !== 'musou' && pl.every((r) => r.routing)) return endBattle(false, '아군이 모두 무너졌다');
  if (G.t >= G.b.timeLimit) endBattle(false, '제한 시간이 다 되었다');
}

const achText = (a) => `${a.t} — ${a.k === 'kills' ? a.d.replace(a.v, scaled(a.v)) : a.d}`;
function achDone(a, s) {
  switch (a.k) {
    case 'win': return s.win;
    case 'kills': return s.kills >= scaled(a.v);
    case 'survive': return s.win && s.survive >= a.v;
    case 'time': return s.win && s.time <= a.v;
    case 'general': return s.general;
    default: return false;
  }
}

function endBattle(win, reason) {
  if (G.over) return;
  G.over = true; G.hero.charging = false; mouse.l = false;
  const b = G.b, s = { win, kills: G.kills, time: G.t, survive: 1 - G.lost[0] / G.init[0], general: G.generalDead };
  const prev = save.ach[b.id] || [], now = b.achievements.map((a, i) => !!prev[i] || achDone(a, s));
  save.ach[b.id] = now; persist();
  banner(win ? '승 리' : '패 배');
  setTimeout(() => {
    if (!G || !G.over) return;
    const R = $('#result'); R.className = 'screen show ' + (win ? 'win' : 'lose');
    $('#res-title').textContent = win ? '승리' : '패배';
    $('#res-reason').textContent = reason;
    $('#res-body').innerHTML = [
      ['전투 시간', fmtTime(G.t)], ['주장 격파', G.kills + '명'],
      ['아군 손실', `${G.lost[0]} / ${G.init[0]}`], ['적군 손실', `${G.lost[1]} / ${G.init[1]}`],
      ['적장', G.generalDead ? '격파' : '생존'],
    ].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('');
    $('#res-ach').innerHTML = b.achievements.map((a, i) =>
      `<div class="${now[i] ? 'ok' : ''} ${now[i] && !prev[i] ? 'new' : ''}">${now[i] ? '◆' : '◇'} ${achText(a)}</div>`).join('');
  }, 1400);
}

// ================= 렌더링 =================
// 얼굴 방향 → 스프라이트 방향 (8방향, 45° 구간)
const DIR8 = [0, 4, 1, 5, 2, 7, 3, 6];
const dirOf = (f) => DIR8[Math.round(Math.atan2(Math.sin(f), Math.cos(f)) / (Math.PI / 4) + 8) & 7];
function spriteAt(c, kind, side, variant, frame, dir, x, y) {
  const s = Sprites.unit(kind, side, variant, frame, dir), a = Sprites.anchor(kind);
  c.drawImage(s, Math.round(x) - a[2], Math.round(y) - a[3]);
}
function drawSoldier(c, u) {
  const variant = u.flash > 0 ? 2 : u.reg.routing ? 1 : 0;
  const frame = u.atkA > 0 ? 4 : ((u.anim || 0) | 0) & 3;
  spriteAt(c, u.tk, u.side, variant, frame, dirOf(u.face), u.x, u.y);
}

// ---------- 픽셀 효과 (효과 픽셀 1칸 = 월드 2단위) ----------
const PXS = 2;
const pxDot = (c, x, y, s = PXS) => c.fillRect(Math.round(x / s) * s, Math.round(y / s) * s, s, s);
function pxArc(c, cx, cy, r, a0, a1, col, gap = 1) {
  c.fillStyle = col;
  const step = PXS / Math.max(r, 1);
  let i = 0;
  for (let a = a0; a <= a1; a += step, i++) if (i % gap === 0) pxDot(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
}
// 3×5 비트맵 숫자
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001010010', '111101111101111', '111101111001111'];
function pxNumber(c, str, x, y, col, s = PXS) {
  const w = str.length * 4 * s - s, x0 = Math.round((x - w / 2) / s) * s, y0 = Math.round(y / s) * s;
  for (const pass of [0, 1]) {
    c.fillStyle = pass ? col : '#1a0c06';
    for (let i = 0; i < str.length; i++) {
      const g = DIGITS[str.charCodeAt(i) - 48];
      if (!g) continue;
      for (let b = 0; b < 15; b++) {
        if (g[b] !== '1') continue;
        const px = x0 + (i * 4 + (b % 3)) * s, py = y0 + ((b / 3) | 0) * s;
        if (pass) c.fillRect(px, py, s, s); else c.fillRect(px - s, py - s, s * 3, s * 3);
      }
    }
  }
}
function drawFx(c, f) {
  const p = f.t / f.dur;
  if (f.k === 'slash') {
    // 궤적이 휘둘러지며 펼쳐지고, 바깥 띠부터 사라진다
    const span = 2 * f.half * Math.min(1, p / 0.35), bands = Math.ceil((f.big ? 4 : 3) * (1 - p));
    const a0 = f.dir > 0 ? f.a - f.half : f.a + f.half - span;
    const cols = ['#ffffff', '#fff0b0', '#ffc860', '#e07a30'];
    for (let k = 0; k < bands; k++) pxArc(c, f.x, f.y - 8, f.r - k * PXS, a0, a0 + span, cols[k], p > 0.6 ? 2 : 1);
  } else if (f.k === 'ring') {
    const r = f.r0 + (f.r1 - f.r0) * p;
    pxArc(c, f.x, f.y, r, 0, TAU, f.c, p < 0.4 ? 1 : p < 0.75 ? 2 : 3);
    if (p < 0.5) pxArc(c, f.x, f.y, r - PXS * 2, 0, TAU, f.c2 || f.c, 3);
  } else if (f.k === 'spark') {
    const n = 1 + Math.round(3 * (1 - p));
    c.fillStyle = '#fff6c8'; pxDot(c, f.x, f.y);
    c.fillStyle = p < 0.5 ? '#ffe070' : '#ff9a40';
    for (let i = 1; i <= n; i++) { pxDot(c, f.x + i * PXS, f.y); pxDot(c, f.x - i * PXS, f.y); pxDot(c, f.x, f.y + i * PXS); pxDot(c, f.x, f.y - i * PXS); }
  } else if (f.k === 'ember') {
    c.fillStyle = p < 0.35 ? '#fff0a0' : p < 0.7 ? '#ffb040' : '#c84a20'; pxDot(c, f.x, f.y);
  } else {
    c.fillStyle = f.c; pxDot(c, f.x, f.y);
  }
}
function drawArrow(c, p) {
  const f = p.t / p.dur, x = p.x0 + (p.x1 - p.x0) * f, len = Math.hypot(p.x1 - p.x0, p.y1 - p.y0) || 1;
  const y = p.y0 + (p.y1 - p.y0) * f - 10 - Math.sin(Math.PI * f) * len * 0.15;
  // 포물선 기울기를 반영한 화살 방향
  const dx = (p.x1 - p.x0) / len, dy = (p.y1 - p.y0) / len - Math.cos(Math.PI * f) * Math.PI * 0.15;
  const dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
  for (let i = 0; i < 8; i++) {
    c.fillStyle = i < 2 ? '#e6eaf0' : i > 5 ? '#f4f0e6' : '#8a5a2a';
    c.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1);
  }
}

function drawHero(c) {
  const h = G.hero; if (h.dead) return;
  const x = h.x, y = h.y, dir = dirOf(h.face);
  if (h.charging) {
    const col = h.charge >= 1 ? '#fff0a0' : '#ffc860';
    pxArc(c, x, y, 70 + 70 * h.charge, G.t * 2, G.t * 2 + TAU, col, 3);
  }
  const frame = h.charging ? 5 : h.swingT > 0 || h.musouT > 0 ? 4 : h.moving ? ((h.anim | 0) & 3) : 0;
  if (h.dodgeT > 0) { c.globalAlpha = 0.35; spriteAt(c, 'hero', 0, 0, frame, dir, x - h.ddx * 16, y - h.ddy * 16); }
  c.globalAlpha = h.inv > 0 && h.musouT <= 0 ? 0.6 : 1;
  spriteAt(c, 'hero', 0, h.flash > 0 ? 2 : 0, frame, dir, x, y);
  c.globalAlpha = 1;
}

function render() {
  const W = innerWidth, H = innerHeight;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0b0907'; ctx.fillRect(0, 0, W, H);
  if (!G) return;
  const z = G.zoom;
  let cx = G.cam.x, cy = G.cam.y;
  if (G.shake > 0) { cx += rand(-G.shake, G.shake) / z; cy += rand(-G.shake, G.shake) / z; }
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (W / 2 - cx * z), DPR * (H / 2 - cy * z));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(G.terr, 0, 0);
  const vx0 = cx - W / 2 / z - 30, vx1 = cx + W / 2 / z + 30, vy0 = cy - H / 2 / z - 30, vy1 = cy + H / 2 / z + 30;
  const vis = (u) => u.x > vx0 && u.x < vx1 && u.y > vy0 && u.y < vy1;
  const s = 1 / z;

  for (const mk of G.markers) {
    const p = mk.t / mk.dur; ctx.globalAlpha = 1 - p; ctx.strokeStyle = mk.c; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(mk.x, mk.y, (12 + 20 * p) * s, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 선택된 부대 표시와 명령선
  for (const r of G.regs) {
    if (r.side || r.dead) continue;
    const sel = G.sel.has(r.id);
    if (!sel && !G.tac) continue;
    ctx.strokeStyle = sel ? 'rgba(255,215,90,.9)' : 'rgba(255,215,90,.25)'; ctx.lineWidth = 2 * s;
    ctx.setLineDash([6 * s, 5 * s]);
    ctx.beginPath(); ctx.arc(r.cx, r.cy, 14 + Math.sqrt(r.alive) * 6, 0, TAU); ctx.stroke();
    const tx = r.target ? r.target.cx : r.ax, ty = r.target ? r.target.cy : r.ay;
    ctx.strokeStyle = r.target ? 'rgba(255,90,60,.6)' : 'rgba(255,215,90,.45)';
    ctx.beginPath(); ctx.moveTo(r.cx, r.cy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
  }
  // 그림자 → y 순서로 정렬한 스프라이트
  const list = [];
  for (const u of G.units) if (!u.dead && vis(u)) list.push(u);
  const h = G.hero;
  if (!h.dead) list.push(h);
  list.sort((a, b) => a.y - b.y);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath();
  for (const u of list) {
    const rx = u.tk === 'cav' ? 12 : u.r + 1;
    ctx.moveTo(u.x + rx, u.y); ctx.ellipse(u.x, u.y, rx, 3, 0, 0, TAU);
  }
  ctx.fill();
  for (const u of list) if (u === h) drawHero(ctx); else drawSoldier(ctx, u);
  if (!h.dead) {
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.moveTo(h.x, h.y - 42); ctx.lineTo(h.x - 6 * s, h.y - 42 - 9 * s); ctx.lineTo(h.x + 6 * s, h.y - 42 - 9 * s); ctx.closePath(); ctx.fill();
  }

  for (const p of G.proj) drawArrow(ctx, p);
  for (const f of G.fx) drawFx(ctx, f);
  // 군기
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of G.regs) {
    if (r.dead || !vis({ x: r.cx, y: r.cy })) continue;
    const big = G.tac ? 1.6 : 1, fx = r.cx, fy = r.cy - 30 - 8 * s * big, pal = PAL[r.side];
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(fx, fy + 14 * s * big); ctx.lineTo(fx, fy - 10 * s * big); ctx.stroke();
    ctx.fillStyle = r.routing ? '#777' : r.isGeneral ? '#c9a24a' : pal.flag;
    ctx.fillRect(fx, fy - 10 * s * big, 18 * s * big, 12 * s * big);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${9 * s * big}px sans-serif`;
    ctx.fillText(r.side ? (r.isGeneral ? '장' : r.type.glyph) : r.num, fx + 9 * s * big, fy - 4 * s * big);
    if (G.tac || r.isGeneral) {
      ctx.font = `${11 * s}px sans-serif`; ctx.fillStyle = r.side ? '#bcd0ff' : '#ffd0c8';
      ctx.fillText(r.name + (r.routing ? ' (패주)' : ''), fx, fy - 18 * s * big);
    }
  }
  for (const t of G.texts) pxNumber(ctx, String(t.s), t.x, t.y, t.t / t.dur < 0.6 ? t.c : '#c8a860', 1);
}

function drawMinimap() {
  const mm = $('#minimap'), c = mm.getContext('2d'), k = mm.width / G.T.w;
  c.drawImage(G.mmTerr, 0, 0, mm.width, mm.height);
  for (const u of G.units) { if (u.dead) continue; c.fillStyle = PAL[u.side].mm; c.fillRect(u.x * k - 1, u.y * k - 1, 2, 2); }
  for (const r of G.regs) if (r.isGeneral && !r.dead) { c.fillStyle = '#ffd23a'; c.fillRect(r.cx * k - 3, r.cy * k - 3, 6, 6); }
  const h = G.hero; c.fillStyle = '#fff'; c.fillRect(h.x * k - 2.5, h.y * k - 2.5, 5, 5);
  c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1;
  c.strokeRect((G.cam.x - innerWidth / 2 / G.zoom) * k, (G.cam.y - innerHeight / 2 / G.zoom) * k, innerWidth / G.zoom * k, innerHeight / G.zoom * k);
}

// ================= HUD =================
function floatText(x, y, s, c) { if (G.texts.length < 60) G.texts.push({ x: x + rand(-6, 6), y: y - 16, s, c, t: 0, dur: 0.7 }); }
let bannerTimer = 0;
function banner(text, cls = '') {
  const b = $('#banner'); b.textContent = text; b.className = 'show ' + cls;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.className = cls; }, cls === 'order' ? 1200 : 1800);
}
function log(text, cls = '') {
  const el = document.createElement('div'); el.className = 'ev ' + cls; el.textContent = text;
  const box = $('#log'); box.append(el);
  while (box.children.length > 6) box.firstChild.remove();
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 7000);
}
function iconCanvas(cvs, tk, side) {
  const c = cvs.getContext('2d'), k = tk === 'cav' ? 1.6 : 2.4, a = Sprites.anchor(tk);
  c.clearRect(0, 0, cvs.width, cvs.height); c.imageSmoothingEnabled = false;
  const s = Sprites.unit(tk, side, 0, 0, 0);
  c.drawImage(s, cvs.width / 2 - a[2] * k, cvs.height - 3 - a[3] * k, s.width * k, s.height * k);
}
function drawPortrait() {
  const cvs = $('#portrait'), c = cvs.getContext('2d'), g = c.createRadialGradient(36, 30, 4, 36, 36, 50);
  g.addColorStop(0, '#6a2a18'); g.addColorStop(1, '#1a0c08'); c.fillStyle = g; c.fillRect(0, 0, 72, 72);
  c.imageSmoothingEnabled = false;
  const s = Sprites.unit('hero', 0, 0, 0, 1), a = Sprites.anchor('hero'), k = 1.8;
  c.drawImage(s, 36 - a[2] * k, 70 - a[3] * k, s.width * k, s.height * k);
}
function buildHud() {
  const box = $('#regs'); box.innerHTML = '';
  for (const r of G.regs) {
    if (r.side) continue;
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = '<span class="key"></span><canvas width="80" height="80"></canvas><div class="nm"></div><div class="bar hp"><i></i></div><div class="bar mo"><i></i></div><div class="st"></div>';
    el.querySelector('.key').textContent = r.num; el.querySelector('.nm').textContent = r.name;
    iconCanvas(el.querySelector('canvas'), r.tk, 0);
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); selectReg(r.num, e.shiftKey); });
    r.el = el; box.append(el);
  }
  $('#hero-nm').textContent = G.b.heroName;
  $('#objective').textContent = '목표: ' + G.b.objective;
  const mm = $('#minimap'); mm.width = Math.round(G.T.w * 0.07); mm.height = Math.round(G.T.h * 0.07);
  $('#btn-speed').textContent = '전투 속도 1×';
  drawPortrait();
}
function regStatus(r) {
  if (r.dead) return '전멸';
  if (r.routing) return '패주';
  if (r.mode === 'fight') return r.order.k === 'charge' ? '돌격' : '교전';
  if (r.mode === 'march') return '행군';
  return { hold: '고수', follow: '수행', auto: '자율', move: '이동', attack: '공격', charge: '돌격' }[r.order.k] || '대기';
}
function updHud() {
  const alive = [0, 0];
  for (const u of G.units) if (!u.dead) alive[u.side]++;
  $('#s-me').textContent = alive[0]; $('#s-en').textContent = alive[1];
  $('#b-me').style.width = (alive[0] / G.init[0] * 100) + '%';
  $('#b-en').style.width = (alive[1] / G.init[1] * 100) + '%';
  $('#t-time').textContent = fmtTime(G.b.timeLimit - G.t);
  const h = G.hero;
  $('#hp-fill').style.width = (h.hp / h.maxHp * 100) + '%';
  $('#hp-txt').textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
  $('#mu-fill').style.width = h.mu + '%';
  document.querySelector('.gauge.mu').classList.toggle('full', h.mu >= 100);
  $('#st-fill').style.width = h.st + '%';
  const cdv = { q: [h.cd.q, 5], e: [h.cd.e, 8], r: [h.cd.r, 22] };
  for (const k in cdv) $(`#sk-${k} .cd`).style.height = (Math.max(0, cdv[k][0]) / cdv[k][1] * 100) + '%';
  $('#sk-t .cd').style.height = (100 - h.mu) + '%';
  $('#sk-t').classList.toggle('ready', h.mu >= 100);
  $('#sk-sp .cd').style.height = (h.st < 22 ? 100 : 0) + '%';
  $('#kills').textContent = G.kills;
  $('#combo').style.opacity = G.combo >= 3 ? 1 : 0; $('#combo-n').textContent = G.combo;
  for (const r of G.regs) {
    if (!r.el) continue;
    const el = r.el;
    el.classList.toggle('sel', G.sel.has(r.id));
    el.classList.toggle('ai', r.order.k === 'auto');
    el.classList.toggle('rout', r.routing); el.classList.toggle('dead', r.dead);
    el.querySelector('.hp i').style.width = (r.alive / r.init * 100) + '%';
    el.querySelector('.mo i').style.width = r.morale + '%';
    el.querySelector('.st').textContent = `${Math.max(0, r.alive)}명 · ${regStatus(r)}`;
  }
  const cmd = cmdRegs();
  $('#ord-who').textContent = G.sel.size ? `지휘: ${cmd.map((r) => r.num).join(', ')}번 부대` : '지휘: 본진 전체';
  const f = cmd[0] && cmd[0].formation;
  for (const b of document.querySelectorAll('#orders .f')) b.classList.toggle('on', b.dataset.f === f);
  for (const b of document.querySelectorAll('#orders [data-c]')) b.classList.toggle('on', cmd.length > 0 && cmd.every((r) => r.order.k === b.dataset.c));
}

function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000); frame.last = now;
  if (G) {
    if (!G.paused && !G.over) {
      let rem = dt * G.speed;
      while (rem > 0) { const s = Math.min(rem, 1 / 30); update(s); rem -= s; }
    }
    G.zoom += (G.zoomT - G.zoom) * Math.min(1, dt * 8);
    const tx = G.tac ? G.T.w / 2 : G.hero.x, ty = G.tac ? G.T.h / 2 : G.hero.y;
    G.cam.x += (tx - G.cam.x) * Math.min(1, dt * (G.tac ? 8 : 6)); G.cam.y += (ty - G.cam.y) * Math.min(1, dt * (G.tac ? 8 : 6));
    G.shake = Math.max(0, G.shake - dt * 30);
    G.hudT -= dt; if (G.hudT <= 0) { G.hudT = 0.1; updHud(); }
    G.mmT -= dt; if (G.mmT <= 0) { G.mmT = 0.15; drawMinimap(); }
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ================= 입력 =================
let helpOpen = false;
function toggleHelp() {
  helpOpen = !helpOpen; $('#help').classList.toggle('show', helpOpen);
  if (G && !G.over && !$('#pause').classList.contains('show')) G.paused = helpOpen;
}
function togglePause() {
  if (!G || G.over) return;
  G.paused = !G.paused; $('#pause').classList.toggle('show', G.paused);
  keys.clear(); mouse.l = false;
}
addEventListener('keydown', (e) => {
  if (e.code === 'F1') { e.preventDefault(); toggleHelp(); return; }
  if (!G) { if (e.code === 'Escape' && helpOpen) toggleHelp(); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat && !G.paused && !G.over) toggleTac(); return; }
  if (e.code === 'Escape') { if (helpOpen) toggleHelp(); else if (G.tac) toggleTac(); else togglePause(); return; }
  if (G.paused || G.over) return;
  keys.add(e.code);
  if (e.repeat) return;
  const map = {
    KeyQ: dash, KeyE: slam, KeyR: roar, KeyT: musou,
    KeyC: () => issue('follow'), KeyV: () => issue('attack'), KeyZ: () => issue('charge'), KeyX: () => issue('hold'), KeyB: () => issue('auto'),
    KeyF: () => setForm('rect'), KeyG: () => setForm('circle'), KeyH: () => setForm('wedge'), BracketLeft: () => setForm('snake'), BracketRight: () => setForm('hollow'),
    Backquote: () => G.sel.clear(), Digit0: () => G.sel.clear(),
  };
  if (e.code === 'Space') { e.preventDefault(); dodge(); }
  else if (map[e.code]) map[e.code]();
  else if (/^Digit[1-9]$/.test(e.code)) selectReg(+e.code.slice(5), e.shiftKey);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.l = false; });
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', (e) => {
  if (!G || G.paused || G.over) return;
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (G.tac) { tacClick(e.button, e.shiftKey); return; }
  if (e.button === 0) { mouse.l = true; attackPress(); } else if (e.button === 2) chargeStart();
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.l = false;
  if (e.button === 2 && G && !G.over) chargeRelease();
});
addEventListener('contextmenu', (e) => { if (G) e.preventDefault(); });
cv.addEventListener('wheel', (e) => { if (G && !G.tac) G.zoomT = clamp(G.zoomT * Math.exp(-e.deltaY * 0.0015), 0.45, 3.2); }, { passive: true });

for (const b of document.querySelectorAll('#orders [data-c]')) b.addEventListener('click', () => G && !G.over && issue(b.dataset.c));
for (const b of document.querySelectorAll('#orders [data-f]')) b.addEventListener('click', () => G && !G.over && setForm(b.dataset.f));
$('#btn-tac').onclick = () => { if (G && !G.paused && !G.over) toggleTac(); };
$('#btn-speed').onclick = () => { if (!G) return; G.speed = G.speed === 1 ? 2 : 1; $('#btn-speed').textContent = `전투 속도 ${G.speed}×`; };
$('#btn-pause').onclick = togglePause;
$('#btn-resume').onclick = togglePause;
$('#btn-help2').onclick = toggleHelp;
$('#btn-help-menu').onclick = toggleHelp;
$('#btn-help-close').onclick = toggleHelp;
$('#btn-quit').onclick = backToMenu;
$('#btn-menu').onclick = backToMenu;
$('#btn-retry').onclick = () => startBattle(G.b);
$('#btn-start').onclick = () => startBattle(menuSel);
$('#sel-scale').value = save.scale;
$('#sel-scale').onchange = (e) => { save.scale = SCALES.includes(+e.target.value) ? +e.target.value : 1; persist(); renderMenu(); };

// ================= 메뉴 =================
let menuMode = 'tactical', menuSel = BATTLES[0];
function backToMenu() {
  G = null; keys.clear(); mouse.l = false;
  for (const id of ['#hud', '#pause', '#result']) $(id).classList.remove('show');
  $('#menu').classList.add('show');
  renderMenu();
}
function renderMenu() {
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.mode === menuMode);
  const list = BATTLES.filter((b) => b.mode === menuMode);
  if (!list.includes(menuSel)) menuSel = list[0];
  const box = $('#bitems'); box.innerHTML = '';
  list.forEach((b, i) => {
    const got = (save.ach[b.id] || []).filter(Boolean).length;
    const el = document.createElement('div'); el.className = 'bi' + (b === menuSel ? ' on' : '');
    el.innerHTML = `<div class="no">${String(i + 1).padStart(2, '0')}</div><div><div class="nm"></div><div class="yr">${b.place} · ${b.year}</div></div><div class="md">${'◆'.repeat(got)}${'◇'.repeat(b.achievements.length - got)}</div>`;
    el.querySelector('.nm').textContent = b.name;
    el.onclick = () => { menuSel = b; renderMenu(); };
    box.append(el);
  });
  showDetail(menuSel);
}
function armySummary(regs) {
  const by = {};
  for (const r of regs) by[r.type] = (by[r.type] || 0) + scaled(r.count);
  return Object.entries(by).map(([k, v]) => `${UNIT_TYPES[k].name} <span>${v}</span>`).join(' · ');
}
function showDetail(b) {
  $('#bd-tag').textContent = b.mode === 'musou' ? '영웅 무쌍전' : '사실 전술전';
  $('#bd-name').textContent = b.name;
  $('#bd-sub').textContent = `${b.place} · ${b.year}년`;
  $('#bd-sides').textContent = `${b.sides[0]} vs ${b.sides[1]}`;
  const waveRegs = (b.events || []).flatMap((ev) => ev.regs || []);
  const eTotal = b.enemy.regs.concat(waveRegs).reduce((a, r) => a + scaled(r.count), 0) + (b.enemy.general ? 1 : 0);
  const pTotal = b.player.regs.reduce((a, r) => a + scaled(r.count), 0);
  $('#bd-armies').innerHTML =
    `<div class="army me"><h4>${b.sides[0]}<b>${pTotal}명</b></h4>주장 ${b.heroName}<br>${armySummary(b.player.regs)}</div>` +
    `<div class="army en"><h4>${b.sides[1]}<b>${eTotal}명</b></h4>적장 ${b.enemy.general ? b.enemy.general.name : '-'}<br>${armySummary(b.enemy.regs.concat(waveRegs))}</div>`;
  const hs = b.hist;
  $('#bd-hist').innerHTML = [['연대', hs.era], ['교전 세력', hs.sides], ['전쟁의 원인', hs.cause], ['전투 경과', hs.course], ['역사적 결과', hs.outcome], ['공략', hs.advice], ['승리 조건', b.objective]]
    .map(([k, v]) => `<h5>${k}</h5><p>${v}</p>`).join('') + `<p class="note">${hs.note}</p>`;
  const got = save.ach[b.id] || [];
  $('#bd-ach').innerHTML = b.achievements.map((a, i) => `<div class="${got[i] ? 'ok' : ''}"><i>${got[i] ? '◆' : '◇'}</i>${achText(a)}</div>`).join('');
  drawPreview(b);
}
const previewCache = new Map();
function drawPreview(b) {
  const cvs = $('#bd-map'), c = cvs.getContext('2d'), k = cvs.width / b.map.w;
  cvs.height = Math.round(b.map.h * k);
  if (!previewCache.has(b.id)) previewCache.set(b.id, renderTerrainFlat(buildTerrain(b.map), k));
  c.drawImage(previewCache.get(b.id), 0, 0);
  const dot = (r, side) => {
    const n = Math.sqrt(scaled(r.count)) * 2.4;
    c.fillStyle = PAL[side].flag; c.strokeStyle = '#000'; c.lineWidth = 1;
    c.fillRect(r.x * k - n / 2, r.y * k - n / 3, n, n * 0.66); c.strokeRect(r.x * k - n / 2, r.y * k - n / 3, n, n * 0.66);
  };
  b.player.regs.forEach((r) => dot(r, 0)); b.enemy.regs.forEach((r) => dot(r, 1));
  const star = (x, y, col) => { c.fillStyle = col; c.strokeStyle = '#000'; c.beginPath(); c.arc(x * k, y * k, 5, 0, TAU); c.fill(); c.stroke(); };
  star(b.player.hero.x, b.player.hero.y, '#ffd23a');
  if (b.enemy.general) star(b.enemy.general.x, b.enemy.general.y, '#8ab0ff');
  c.font = '12px sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'left';
  c.fillText('■ 아군   ■ 적군   ● 주장/적장', 8, cvs.height - 8);
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { menuMode = b.dataset.mode; renderMenu(); };
renderMenu();
})();
