/* Тест чанка 10: пульсовые зоны (analytics) + store.updateSettings (node) */
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

console.log('— ЧССmax по Танаке —');
t('208 − 0.7·возраст', () => {
  assert(an.hrMaxTanaka(46) === 176, an.hrMaxTanaka(46));   // 208-32.2=175.8→176
  assert(an.hrMaxTanaka(30) === 187);                       // 208-21=187
});

console.log('— зоны: % от ЧССmax (без пульса покоя) —');
t('5 зон, границы = доли ЧССmax', () => {
  const z = an.hrZones({ hrMax: 190 });
  assert(z.length === 5);
  assert(z[0].lo === 95 && z[0].hi === 114, JSON.stringify(z[0]));   // 50–60%
  assert(z[4].lo === 171 && z[4].hi === 190, JSON.stringify(z[4]));  // 90–100%
  assert(z[1].name === 'Аэробная база');
});
t('нет ЧССmax → null', () => {
  assert(an.hrZones({}) === null && an.hrZones({ hrMax: 0 }) === null);
});

console.log('— зоны: Карвонен (резерв ЧСС) —');
t('с пульсом покоя границы сдвигаются вверх', () => {
  const max = an.hrZones({ hrMax: 190 });
  const kar = an.hrZones({ hrMax: 190, hrRest: 50 });
  // Z2 верх: %max = 0.7·190=133; Карвонен = 50 + 0.7·140 = 148
  assert(max[1].hi === 133 && kar[1].hi === 148, JSON.stringify({ m: max[1].hi, k: kar[1].hi }));
  assert(kar[4].hi === 190);   // верх Z5 всегда = ЧССmax
});

console.log('— номер зоны по пульсу —');
t('hrZoneFor: попадание в правильную зону', () => {
  const cfg = { hrMax: 190 };               // Z1≤114, Z2≤133, Z3≤152, Z4≤171, Z5≤190
  assert(an.hrZoneFor(100, cfg) === 1);
  assert(an.hrZoneFor(130, cfg) === 2);
  assert(an.hrZoneFor(150, cfg) === 3);
  assert(an.hrZoneFor(168, cfg) === 4);
  assert(an.hrZoneFor(185, cfg) === 5);
  assert(an.hrZoneFor(210, cfg) === 5);     // выше макс → Z5
  assert(an.hrZoneFor(150, {}) === null);   // нет конфигурации
});

console.log('— подсказка по типу пробежки —');
t('лёгкая в Z4 → «интенсивнее», темповая в Z2 → «легче», совпадение → пусто', () => {
  assert(/интенсивнее/.test(an.zoneAdvice('easy', 4)), an.zoneAdvice('easy', 4));
  assert(/легче/.test(an.zoneAdvice('tempo', 2)), an.zoneAdvice('tempo', 2));
  assert(an.zoneAdvice('easy', 2) === '');
  assert(an.zoneAdvice('interval', 5) === '');
  assert(an.zoneAdvice('recovery', 1) === '');
});

console.log('— store.updateSettings —');
t('пишет числа, пустое → null, фильтрует чужие поля', () => {
  let s = store.defaultState(ex.EXERCISE_LIBRARY);
  assert(s.settings.hrMax === null && s.settings.hrRest === null);
  s = store.updateSettings(s, { age: '46', hrRest: '52', hack: 'нет' });
  assert(s.settings.age === 46 && s.settings.hrRest === 52 && s.settings.hack === undefined, JSON.stringify(s.settings));
  s = store.updateSettings(s, { hrRest: '' });
  assert(s.settings.hrRest === null);
  assert(s.settings.weightStepDefault === 2.5);   // не затёрли
});
t('настройки переживают save/load', () => {
  let s = store.defaultState(ex.EXERCISE_LIBRARY);
  s = store.updateSettings(s, { hrMax: 178, hrRest: 48 });
  store.save(s);
  const re = store.load(ex.EXERCISE_LIBRARY);
  assert(re.settings.hrMax === 178 && re.settings.hrRest === 48);
});

console.log('— интеграция: зона логичного пульса на лёгкой пробежке —');
t('лёгкий бег на 145 при max 190 → Z2/Z3, совет по easy пуст', () => {
  const cfg = { hrMax: 190 };
  const z = an.hrZoneFor(145, cfg);
  assert(z === 3, 'zone=' + z);
  assert(an.zoneAdvice('easy', z) === '');   // easy допускает 1–3
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
