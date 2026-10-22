'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function load(seed = 1, transform = (s) => s) {
  const noop = () => {};
  const canvas = new Proxy({}, { get: (_, k) => k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop, set: () => true });
  const element = () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop }, getContext: () => canvas, addEventListener: noop, append: noop, querySelector: () => element() });
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const context = vm.createContext({ console, Math: math, document: { querySelector: () => element(), querySelectorAll: () => [], createElement: element }, localStorage: { getItem: () => null, setItem: noop }, addEventListener: noop, requestAnimationFrame: noop, setTimeout: noop, innerWidth: 1440, innerHeight: 860, devicePixelRatio: 1, performance: { now: () => 0 } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), context);
  let source = transform(fs.readFileSync(path.join(root, 'js/game.js'), 'utf8'));
  source = source.replace(/renderMenu\(\);\s*\}\)\(\);\s*$/, `
renderTerrain = renderTerrainFlat = () => document.createElement('canvas');
buildHud = banner = log = () => {};
globalThis.api = { startBattle, update, thinkReg, heroArc, dashHits, roar, hurt, swing, chargeRelease, slam, dash, dodge, musou, checkEnd, keys, mouse, save, BATTLES, UNIT_TYPES, get G() { return G; } };
})();`);
  vm.runInContext(source, context);
  return context.api;
}
module.exports = { load };

if (require.main === module) {
  test('tactical enemies sustain more frontline pressure without nerfing hero HP again', () => {
    const a = load();
    const expected = [[0.65, 0.8], [0.75, 0.85], [0.8, 0.95]];
    a.BATTLES.slice(0, 3).forEach((b, i) => {
      a.startBattle(b);
      const sword = a.G.units.find(u => u.side === 1 && u.tk === 'sword');
      assert.equal(sword.maxHp, a.UNIT_TYPES.sword.hp * expected[i][0]);
      assert.equal(sword.atkMul, expected[i][1]);
      assert.equal(a.G.hero.maxHp, 300);
    });
    a.startBattle(a.BATTLES[3]);
    assert.equal(a.G.hero.maxHp, 3000);
    assert.equal(a.G.units.find(u => u.side === 1).atkMul, 1.1);
  });
  test('enemy guards stay with their commander and intercept a nearby raider', () => {
    for (const bIndex of [0, 1, 2, 3]) {
      const a = load(); a.startBattle(a.BATTLES[bIndex]);
      const g = a.G, guard = g.regs.find(r => r.side === 1 && r.tk === 'guard');
      const boss = g.units.find(u => u.tk === 'general');
      g.t = 240;
      g.grid.clear(); for (const u of g.units) g.grid.add(u);
      a.thinkReg(guard, 0.25);
      assert.ok(Math.hypot(guard.ax - boss.x, guard.ay - boss.y) <= 200, `${g.b.id}: guards abandoned commander`);
      g.hero.x = boss.x - 350; g.hero.y = boss.y;
      a.thinkReg(guard, 0.25);
      assert.equal(guard.ax, g.hero.x, `${g.b.id}: failed to intercept raid`);
      g.hero.x = 500;
      a.thinkReg(guard, 0.25);
      assert.ok(Math.hypot(guard.ax - boss.x, guard.ay - boss.y) <= 200, `${g.b.id}: guards chased bait`);
    }
  });
  test('enemy commander resists repeated knockback from every hero attack path', () => {
    for (const attack of ['arc', 'arc-cap', 'dash', 'dash-cap', 'roar']) {
      const a = load(); a.startBattle(a.BATTLES[0]);
      const g = a.G, boss = g.units.find(u => u.tk === 'general');
      g.hero.x = boss.x - 20; g.hero.y = boss.y; g.hero.face = 0; g.hero.mu = 100;
      g.grid.clear();
      if (attack.endsWith('cap')) {
        for (const u of g.units.filter(u => u.side === 1 && u.tk !== 'general').slice(0, 6)) { u.x = g.hero.x + 5; u.y = g.hero.y; g.grid.add(u); }
      }
      g.grid.add(boss);
      if (attack.startsWith('arc')) a.heroArc(125, Math.PI, 1, 230, attack.endsWith('cap') ? 0 : 5);
      if (attack.startsWith('dash')) { g.hero.dashSet = new Set(attack.endsWith('cap') ? [{}, {}, {}] : []); a.dashHits(); }
      if (attack === 'roar') a.roar();
      assert.ok(Math.hypot(boss.kbx, boss.kby) <= 58, `${attack}: commander impulse ${Math.hypot(boss.kbx, boss.kby)}`);
    }
  });
}
