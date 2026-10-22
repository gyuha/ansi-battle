'use strict';
// 픽셀아트 스프라이트를 코드로 생성한다. 오른쪽을 보는 원본을 그린 뒤 자동 외곽선·좌우 반전·피격 실루엣을 만들어 캐시한다.
const Sprites = (() => {
  const C = {
    out: '#140c08', skin: '#e8b890', skinD: '#b07850', metal: '#8e96a0', metalL: '#d4dae0', metalD: '#4e555e',
    pants: '#3a2e26', pantsD: '#2a201a', boot: '#22160e', wood: '#8a5a2a', woodD: '#5a3a1a', steel: '#e6eaf0',
    gold: '#e0b040', goldL: '#f8d870', goldD: '#9a7020', horse: '#7a4a28', horseL: '#9a6438', horseD: '#4a2a14',
    mane: '#24160c', white: '#f4f0e6', string: '#cfc6b0',
  };
  const TEAM = [{ t: '#c03a2c', d: '#7a1e16', l: '#f07a5a' }, { t: '#3a66c0', d: '#1e3672', l: '#7aa6f0' }];
  const ROUT = { t: '#8a7c72', d: '#5a4e48', l: '#aa9c90' };
  // 종류별 캔버스 크기와 발 기준점
  const BOX = { man: [44, 44, 22, 40], cav: [56, 48, 24, 44], tree: [26, 32, 13, 30], rock: [10, 7, 5, 6] };

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

  function painter(c, ax, ay) {
    const g = c.getContext('2d');
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(ax + x, ay + y, w, h); };
    const L = (x0, y0, x1, y1, col) => {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        P(x0, y0, 1, 1, col);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    };
    const D = (cx, cy, r, col, dither = false) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const q = x * x + y * y;
        if (q > r * r + r * 0.6) continue;
        if (dither && q > (r - 1) * (r - 1) && (x + y) & 1) continue;
        P(cx + x, cy + y, 1, 1, col);
      }
    };
    return { P, L, D };
  }

  function outline(c, col) {
    const g = c.getContext('2d'), w = c.width, h = c.height, im = g.getImageData(0, 0, w, h), d = im.data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    const [r, gg, b] = hex(col);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (a[i]) continue;
      if ((x > 0 && a[i - 1]) || (x < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w])) {
        d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  function flip(c) {
    const o = canvas(c.width, c.height), g = o.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
    return o;
  }
  function silhouette(c, col) {
    const o = canvas(c.width, c.height), g = o.getContext('2d');
    g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return o;
  }

  // ---------- 사람 (보병·궁병·친위대·주장·적장·기병 탑승자) ----------
  function man({ P, L }, tm, kind, frame, oy = 0, rider = false) {
    const atk = frame === 4, chg = frame === 5, f = frame < 4 ? frame : 0;
    const Y = (y) => y + oy;
    const lord = kind === 'hero' || kind === 'general';
    const elite = lord || kind === 'guard';

    // 몸 뒤쪽: 등깃발, 망토, 화살통, 방패
    if (lord) {
      P(-5, Y(-36), 1, 24, C.woodD);
      P(-11, Y(-36), 6, 8, tm.t); P(-11, Y(-36), 6, 1, C.gold); P(-11, Y(-29), 6, 1, C.gold); P(-9, Y(-34), 2, 3, C.gold);
    }
    if (elite) { P(-5, Y(-14), 2, 11, tm.d); P(-6, Y(-6), 2, 3, tm.d); }
    if (kind === 'archer') { P(-6, Y(-15), 2, 8, C.wood); P(-6, Y(-16), 1, 1, C.white); P(-5, Y(-17), 1, 1, C.white); }
    if (kind === 'sword' || kind === 'guard') {
      const trim = kind === 'guard' ? C.gold : C.metal;
      P(-7, Y(-13), 4, 8, tm.d); P(-7, Y(-13), 4, 1, trim); P(-7, Y(-6), 4, 1, trim); P(-6, Y(-10), 2, 2, C.metalL);
    }

    // 다리 (기병 탑승자는 앞다리 하나만)
    if (rider) {
      P(0, -12, 2, 4, C.pants); P(0, -8, 3, 1, C.boot);
    } else {
      const LG = [[-3, 1], [-2, 0], [1, -3], [0, -2]][f], lift = f === 1 || f === 3 ? 1 : 0;
      P(LG[0], -6 - lift, 2, 4, C.pantsD); P(LG[0], -2 - lift, 3, 2, C.boot);
      P(LG[1], -6, 2, 4, C.pants); P(LG[1], -2, 3, 2, C.boot);
    }

    // 몸통
    P(-3, Y(-13), 6, 7, tm.t); P(-3, Y(-13), 1, 7, tm.d); P(2, Y(-12), 1, 4, tm.l);
    if (kind !== 'archer') {
      P(-2, Y(-12), 4, 4, elite ? C.metalL : C.metal); P(-2, Y(-11), 4, 1, C.metalD); P(-2, Y(-9), 4, 1, C.metalD);
    }
    P(-3, Y(-7), 6, 1, C.woodD); P(0, Y(-7), 1, 1, C.gold);
    if (!rider) P(-3, Y(-6), 6, 1, tm.d);

    // 머리와 투구
    P(-1, Y(-14), 2, 1, C.skinD);
    P(-2, Y(-18), 4, 4, C.skin); P(-2, Y(-18), 1, 4, C.skinD); P(1, Y(-16), 1, 1, C.out);
    if (kind === 'archer') {
      P(-3, Y(-20), 5, 2, tm.d); P(-3, Y(-18), 1, 2, tm.d);
    } else {
      const hm = elite ? [C.gold, C.goldL, C.goldD] : [C.metal, C.metalL, C.metalD];
      P(-3, Y(-21), 5, 3, hm[0]); P(-2, Y(-21), 2, 1, hm[1]); P(-3, Y(-18), 6, 1, hm[2]); P(-3, Y(-18), 1, 3, hm[2]);
      if (elite) { P(-1, Y(-25), 1, 4, tm.l); P(-2, Y(-24), 1, 3, tm.t); } else P(-1, Y(-22), 1, 1, tm.t);
    }

    // 팔
    if (atk) { P(1, Y(-12), 4, 2, tm.t); P(5, Y(-12), 1, 2, C.skin); }
    else if (chg) { P(-1, Y(-14), 2, 2, tm.t); P(-2, Y(-16), 2, 2, C.skin); }
    else { P(1, Y(-12), 2, 3, tm.t); P(2, Y(-9), 2, 1, C.skin); }

    // 무기
    if (kind === 'sword' || kind === 'guard') {
      if (atk) { P(6, Y(-14), 1, 4, C.gold); P(7, Y(-13), 7, 1, C.metalL); P(7, Y(-12), 7, 1, C.steel); }
      else { P(2, Y(-10), 3, 1, C.gold); P(3, Y(-18), 1, 8, C.steel); }
    } else if (kind === 'spear') {
      if (atk) { P(-7, Y(-12), 18, 1, C.wood); P(11, Y(-12), 3, 1, C.steel); P(11, Y(-13), 1, 3, C.steel); }
      else { P(3, Y(-28), 1, 26, C.wood); P(3, Y(-31), 1, 3, C.steel); P(2, Y(-29), 3, 1, C.steel); }
    } else if (kind === 'archer') {
      const bx = atk ? 7 : 4;
      P(bx, Y(-19), 1, 2, C.wood); P(bx + 1, Y(-17), 1, 10, C.wood); P(bx, Y(-7), 1, 2, C.wood);
      P(atk ? 1 : 3, Y(-18), 1, 12, C.string);
      if (atk) { P(1, Y(-12), 8, 1, C.woodD); P(9, Y(-12), 1, 1, C.steel); }
    } else if (kind === 'hero') {
      if (atk) { P(6, Y(-15), 1, 5, C.gold); P(7, Y(-14), 12, 1, C.metalL); P(7, Y(-13), 12, 1, C.steel); P(19, Y(-13), 1, 1, C.steel); }
      else if (chg) { P(-2, Y(-17), 3, 1, C.gold); L(-2, Y(-18), -10, Y(-31), C.steel); L(-1, Y(-18), -9, Y(-31), C.metalL); }
      else { P(2, Y(-10), 3, 1, C.gold); L(3, Y(-11), 10, Y(-26), C.steel); L(4, Y(-11), 11, Y(-26), C.metalL); }
    } else if (kind === 'general') {
      if (atk || chg) { P(-6, Y(-12), 18, 1, C.wood); P(12, Y(-14), 5, 2, C.steel); P(16, Y(-15), 1, 1, C.steel); }
      else { P(4, Y(-30), 1, 28, C.wood); P(4, Y(-35), 2, 5, C.steel); P(5, Y(-36), 1, 1, C.steel); }
    } else if (kind === 'cav') {
      if (atk) { P(-8, -20, 24, 1, C.wood); P(16, -20, 3, 1, C.steel); P(16, -21, 1, 3, C.steel); }
      else { L(-3, -10, 9, -40, C.wood); P(9, -43, 1, 3, C.steel); }
    }
  }

  // ---------- 말 ----------
  function horse({ P }, tm, frame) {
    const f = frame < 4 ? frame : 0;
    const legs = [[-9, -6, 5, 8], [-7, -5, 3, 5], [-5, -3, 1, 3], [-7, -5, 3, 5]][f];
    const leg = (x, col, up) => { P(x, -7 - up, 2, 5, col); P(x, -2 - up, 2, 2, C.mane); };
    leg(legs[0], C.horseD, f === 2 ? 1 : 0); leg(legs[2], C.horseD, f === 0 ? 1 : 0);
    P(-11, -14, 2, 2, C.mane); P(-12, -12, 2, 5, C.mane);
    P(-8, -14, 16, 7, C.horse); P(-8, -14, 16, 1, C.horseL); P(-8, -8, 16, 1, C.horseD);
    P(-9, -13, 1, 5, C.horse); P(8, -13, 1, 5, C.horse);
    P(6, -18, 3, 5, C.horse); P(7, -20, 3, 3, C.horse); P(9, -21, 5, 3, C.horse); P(13, -20, 2, 2, C.horseD);
    P(8, -23, 1, 2, C.mane); P(5, -19, 2, 6, C.mane); P(11, -20, 1, 1, C.out);
    leg(legs[1], C.horse, 0); leg(legs[3], C.horse, f === 2 ? 1 : 0);
    P(-5, -15, 9, 6, tm.t); P(-5, -15, 9, 1, tm.d); P(-5, -10, 9, 1, C.gold);
  }

  function build(kind, tm, frame) {
    const box = kind === 'cav' ? BOX.cav : BOX.man;
    const c = canvas(box[0], box[1]), p = painter(c, box[2], box[3]);
    if (kind === 'cav') { horse(p, tm, frame); man(p, tm, 'cav', frame, -9, true); }
    else man(p, tm, kind, frame);
    return outline(c, C.out);
  }

  const cache = new Map();
  // variant: 0 평상, 1 패주(무채색), 2 피격(흰 실루엣)
  function unit(kind, side, variant, frame, left) {
    const k = `${kind}|${side}|${variant}|${frame}|${left ? 1 : 0}`;
    let s = cache.get(k);
    if (s) return s;
    if (left) s = flip(unit(kind, side, variant, frame, false));
    else if (variant === 2) s = silhouette(unit(kind, side, 0, frame, false), '#ffffff');
    else s = build(kind, variant === 1 ? ROUT : TEAM[side], frame);
    cache.set(k, s);
    return s;
  }
  const anchor = (kind) => (kind === 'cav' ? BOX.cav : BOX.man);

  // ---------- 지형 장식 ----------
  function tree(type) {
    const c = canvas(BOX.tree[0], BOX.tree[1]), p = painter(c, BOX.tree[2], BOX.tree[3]), { P, D } = p;
    P(-1, -7, 3, 7, C.woodD); P(-1, -7, 1, 7, '#3a2410');
    if (type === 0) {
      D(0, -16, 9, '#1e3a1c'); D(-1, -18, 7, '#2c5226', true); D(-3, -21, 4, '#4a7a34', true);
      P(-4, -23, 1, 1, '#7aa64c'); P(-2, -22, 1, 1, '#7aa64c'); P(2, -15, 1, 1, '#3e6a2e');
    } else if (type === 1) {
      for (let i = 0; i < 4; i++) {
        const y = -8 - i * 5, w = 10 - i * 2;
        P(-w, y - 4, w * 2 + 1, 4, '#1c3a24'); P(-w + 1, y - 5, w * 2 - 1, 1, '#1c3a24');
        P(-w + 1, y - 4, w - 1, 2, '#2e5a32');
      }
      P(0, -30, 1, 2, '#2e5a32');
    } else {
      D(0, -14, 7, '#24461e'); D(-1, -16, 5, '#36622a', true); D(-2, -18, 2, '#5a8a3a');
    }
    return outline(c, '#0e1a0c');
  }
  function rock() {
    const c = canvas(BOX.rock[0], BOX.rock[1]), { P } = painter(c, BOX.rock[2], BOX.rock[3]);
    P(-3, -3, 6, 3, '#7a766c'); P(-2, -4, 4, 1, '#9a968a'); P(-2, -3, 2, 1, '#b4b0a4'); P(1, -1, 2, 1, '#5a564e');
    return outline(c, '#2a2620');
  }
  const trees = [0, 1, 2].map(tree), rocks = [rock()];

  return { unit, anchor, trees, treeBox: BOX.tree, rocks, rockBox: BOX.rock, TEAM };
})();
