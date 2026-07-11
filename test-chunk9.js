/* Тест чанка 9: бег — store.runs + миграция v1→v2 + беговая аналитика (node) */
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
};
const ex = require('./src/js/exercises.js');
const store = require('./src/js/store.js');
const an = require('./src/js/analytics.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };
const throws = (fn) => { try { fn(); return false; } catch (_) { return true; } };

const run = (date, type, km, min, extra = {}) =>
  ({ date: date + 'T12:00:00.000Z', type, distanceKm: km, durationSec: min * 60, ...extra });

console.log('— миграция v1 → v2 —');
t('старое состояние без runs получает runs:[] и schemaVersion 2', () => {
  const old = { ...store.defaultState(ex.EXERCISE_LIBRARY), schemaVersion: 1 };
  delete old.runs;
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(old));
  const s = store.load(ex.EXERCISE_LIBRARY);
  assert(s.schemaVersion === 2 && Array.isArray(s.runs) && s.runs.length === 0, JSON.stringify({ v: s.schemaVersion, runs: s.runs }));
});
t('importBackup тоже мигрирует v1-бэкап', () => {
  const old = { ...store.defaultState(ex.EXERCISE_LIBRARY), schemaVersion: 1 };
  delete old.runs;
  const s = store.importBackup(JSON.stringify(old));
  assert(s.schemaVersion === 2 && Array.isArray(s.runs));
});

console.log('— store: addRun / deleteRun —');
let state = store.defaultState(ex.EXERCISE_LIBRARY);
t('addRun сохраняет пробежку с полями', () => {
  let r;
  ({ state, run: r } = store.addRun(state, run('2026-07-06', 'easy', 8, 45, { avgHr: 150, rpe: 5 })));
  assert(r.id.startsWith('run_') && r.distanceKm === 8 && r.durationSec === 2700 && r.avgHr === 150);
  assert(state.runs.length === 1);
});
t('addRun отклоняет мусор', () => {
  assert(throws(() => store.addRun(state, { type: 'easy', distanceKm: 0, durationSec: 100 })));
  assert(throws(() => store.addRun(state, { type: null, distanceKm: 5, durationSec: 100 })));
});
t('deleteRun удаляет по id; save/load сохраняет runs', () => {
  const { state: s2, run: r } = store.addRun(state, run('2026-07-07', 'tempo', 6, 30));
  const s3 = store.deleteRun(s2, r.id);
  assert(s3.runs.length === 1);
  store.save(s2);
  assert(store.load(ex.EXERCISE_LIBRARY).runs.length === 2);
});

console.log('— темп —');
t('paceSecKm/fmtPace: 10 км за 50 мин → 5:00/км', () => {
  assert(an.paceSecKm(10, 3000) === 300);
  assert(an.fmtPace(300) === '5:00' && an.fmtPace(331) === '5:31' && an.fmtPace(0) === '–');
});

console.log('— недельный ряд —');
const NOW = new Date('2026-07-08T12:00:00Z');   // среда
t('км раскладываются по неделям, включая пустые', () => {
  let s = store.defaultState(ex.EXERCISE_LIBRARY);
  ({ state: s } = store.addRun(s, run('2026-07-06', 'easy', 8, 45)));      // текущая неделя (пн)
  ({ state: s } = store.addRun(s, run('2026-06-30', 'long', 14, 80)));     // прошлая
  ({ state: s } = store.addRun(s, run('2026-06-29', 'interval', 6, 32)));  // прошлая
  const w = an.runWeeklySeries(s, { weeks: 4, now: NOW });
  assert(w.length === 4);
  assert(w[3].km === 8 && w[2].km === 20, JSON.stringify(w));
  assert(w[2].hardMin === 32 && Math.round(w[2].easyMin) === 80);
  assert(w[0].km === 0);
});

console.log('— 80/20 —');
t('доля тяжёлого времени и статус', () => {
  let s = store.defaultState(ex.EXERCISE_LIBRARY);
  ({ state: s } = store.addRun(s, run('2026-07-01', 'easy', 8, 48)));
  ({ state: s } = store.addRun(s, run('2026-07-03', 'long', 14, 84)));
  ({ state: s } = store.addRun(s, run('2026-07-05', 'interval', 6, 33)));
  const sh = an.hardSharePct(s, { now: NOW });
  assert(sh.sessions === 3 && sh.hardPct === 20 && sh.status === 'ok', JSON.stringify(sh));
});
t('слишком много интенсива → high; мало данных → na', () => {
  let s = store.defaultState(ex.EXERCISE_LIBRARY);
  ({ state: s } = store.addRun(s, run('2026-07-01', 'tempo', 8, 40)));
  ({ state: s } = store.addRun(s, run('2026-07-03', 'interval', 6, 30)));
  ({ state: s } = store.addRun(s, run('2026-07-05', 'easy', 5, 30)));
  assert(an.hardSharePct(s, { now: NOW }).status === 'high');
  let s2 = store.defaultState(ex.EXERCISE_LIBRARY);
  ({ state: s2 } = store.addRun(s2, run('2026-07-01', 'easy', 5, 30)));
  assert(an.hardSharePct(s2, { now: NOW }).status === 'na');
});

console.log('— темп лёгких и правило 10% —');
t('easyPaceSeries: только лёгкие типы, по возрастанию даты', () => {
  let s = store.defaultState(ex.EXERCISE_LIBRARY);
  ({ state: s } = store.addRun(s, run('2026-07-05', 'easy', 10, 55)));
  ({ state: s } = store.addRun(s, run('2026-07-01', 'easy', 10, 58)));
  ({ state: s } = store.addRun(s, run('2026-07-03', 'interval', 6, 30)));   // не попадает
  const p = an.easyPaceSeries(s);
  assert(p.length === 2 && p[0].pace > p[1].pace, JSON.stringify(p));       // темп улучшился
});
t('rampWarning: >10% роста при базе ≥5 км', () => {
  assert(an.rampWarning(30, 34) === true);    // +13%
  assert(an.rampWarning(30, 32) === false);   // +7%
  assert(an.rampWarning(3, 10) === false);    // база мала — не пугаем
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
