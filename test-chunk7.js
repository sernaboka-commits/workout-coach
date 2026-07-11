/* Тест чанка 7: дни недели (store.addDay/updateDay), выбор дня, мастер (node) */
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
};
const ex = require('./src/js/exercises.js');
const store = require('./src/js/store.js');
const uiw = require('./src/js/ui-workout.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };
const throws = (fn) => { try { fn(); return false; } catch (_) { return true; } };

console.log('— дни недели: константы и конверсия —');
t('WEEKDAYS: 7 дней, Пн первый', () => {
  assert(uiw.WEEKDAYS.length === 7 && uiw.WEEKDAYS[0] === 'Пн' && uiw.WEEKDAYS[6] === 'Вс');
});
t('todayIdx: понедельник → 0, воскресенье → 6', () => {
  assert(uiw.todayIdx(new Date('2026-07-13T10:00:00')) === 0, 'пн 13.07.2026');   // понедельник
  assert(uiw.todayIdx(new Date('2026-07-12T10:00:00')) === 6, 'вс 12.07.2026');   // воскресенье
  assert(uiw.todayIdx(new Date('2026-07-15T10:00:00')) === 2, 'ср 15.07.2026');   // среда
});

console.log('— store: addDay с weekday, updateDay —');
let state = store.defaultState(ex.EXERCISE_LIBRARY);
let dayA, dayB;
t('addDay сохраняет weekday', () => {
  ({ state, day: dayA } = store.addDay(state, { weekday: 0 }));
  ({ state, day: dayB } = store.addDay(state, { weekday: 3 }));
  assert(dayA.weekday === 0 && dayB.weekday === 3 && dayA.label === 'A' && dayB.label === 'B');
});
t('addDay без weekday → null', () => {
  const r = store.addDay(store.defaultState(ex.EXERCISE_LIBRARY));
  assert(r.day.weekday === null);
});
t('updateDay меняет weekday и фильтрует чужие поля', () => {
  state = store.updateDay(state, dayB.id, { weekday: 4, hack: 'нет' });
  const d = state.program.days.find((x) => x.id === dayB.id);
  assert(d.weekday === 4 && d.hack === undefined, JSON.stringify(d));
});
t('updateDay кидает на несуществующем дне', () => {
  assert(throws(() => store.updateDay(state, 'нет', { weekday: 1 })));
});

console.log('— pickDayForDate —');
t('находит день по дню недели', () => {
  const d = uiw.pickDayForDate(state.program.days, 4);
  assert(d && d.id === dayB.id, JSON.stringify(d));
});
t('нет дня на эту дату → null', () => {
  assert(uiw.pickDayForDate(state.program.days, 6) === null);
  assert(uiw.pickDayForDate([], 0) === null);
});

console.log('— сценарий мастера: 3 тренировки пн/ср/пт —');
t('создаёт A/B/C с отсортированными днями недели', () => {
  let s = store.defaultState(ex.EXERCISE_LIBRARY);
  for (const w of [0, 2, 4]) ({ state: s } = store.addDay(s, { weekday: w }));
  const days = s.program.days;
  assert(days.length === 3);
  assert(days.map((d) => d.label).join('') === 'ABC');
  assert(days.map((d) => d.weekday).join(',') === '0,2,4', JSON.stringify(days.map(d => d.weekday)));
});

console.log('— setsText: прошлые результаты —');
t('формат "вес×повт RIRn" через запятую', () => {
  const txt = uiw.setsText([
    { weight: 60, reps: 10, rir: 2 },
    { weight: 60, reps: 9, rir: null },
  ]);
  assert(txt === '60×10 RIR2, 60×9', txt);
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
