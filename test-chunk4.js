/* Тест чанка 4: store-мутаторы программы + ui-program хелперы (node) */
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
};
const ex = require('./src/js/exercises.js');
const store = require('./src/js/store.js');
const prog = require('./src/js/ui-program.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };
const throws = (fn) => { try { fn(); return false; } catch (_) { return true; } };

let state = store.defaultState(ex.EXERCISE_LIBRARY);

console.log('— дни: создание и метки —');
let dayA, dayB;
t('addDay присваивает метку A, затем B', () => {
  ({ state, day: dayA } = store.addDay(state));
  ({ state, day: dayB } = store.addDay(state));
  assert(dayA.label === 'A' && dayB.label === 'B', dayA.label + ',' + dayB.label);
  assert(state.program.days.length === 2);
});
t('не мутирует исходный state', () => {
  const before = store.defaultState(ex.EXERCISE_LIBRARY);
  store.addDay(before);
  assert(before.program.days.length === 0);
});

console.log('— элементы дня —');
t('addDayItem добавляет нормализованный элемент', () => {
  state = store.addDayItem(state, dayA.id, prog.defaultItemFor(ex.getExercise(state, 'bb-bench-press')));
  const it = state.program.days.find((d) => d.id === dayA.id).items[0];
  assert(it.exerciseId === 'bb-bench-press' && it.workSets === 3 && it.repRangeMax === 10, JSON.stringify(it));
});
t('addDayItem отклоняет мусор (workSets<=0, кривой диапазон)', () => {
  assert(throws(() => store.addDayItem(state, dayA.id, { exerciseId: 'x', repRangeMin: 8, repRangeMax: 12, workSets: 0, restSec: 60 })));
  assert(throws(() => store.addDayItem(state, dayA.id, { exerciseId: 'x', repRangeMin: 12, repRangeMax: 8, workSets: 3, restSec: 60 })));
});
t('updateDayItem правит поле и фильтрует чужие', () => {
  state = store.updateDayItem(state, dayA.id, 0, { workSets: 4, note: 'мусор' });
  const it = state.program.days.find((d) => d.id === dayA.id).items[0];
  assert(it.workSets === 4 && it.note === undefined, JSON.stringify(it));
});
t('moveDayItem меняет порядок; за границей — без изменений', () => {
  state = store.addDayItem(state, dayA.id, prog.defaultItemFor(ex.getExercise(state, 'bb-curl')));
  let d = state.program.days.find((x) => x.id === dayA.id);
  assert(d.items[0].exerciseId === 'bb-bench-press');
  state = store.moveDayItem(state, dayA.id, 0, +1);
  d = state.program.days.find((x) => x.id === dayA.id);
  assert(d.items[0].exerciseId === 'bb-curl' && d.items[1].exerciseId === 'bb-bench-press', JSON.stringify(d.items.map(i => i.exerciseId)));
  const unchanged = store.moveDayItem(state, dayA.id, 0, -1); // вверх с 0 — no-op
  assert(unchanged.program.days.find((x) => x.id === dayA.id).items[0].exerciseId === 'bb-curl');
});
t('removeDayItem удаляет по индексу', () => {
  state = store.removeDayItem(state, dayA.id, 0);
  const d = state.program.days.find((x) => x.id === dayA.id);
  assert(d.items.length === 1 && d.items[0].exerciseId === 'bb-bench-press');
});
t('операции над несуществующим днём кидают', () => {
  assert(throws(() => store.addDayItem(state, 'нет', prog.defaultItemFor(ex.getExercise(state, 'ohp')))));
});

console.log('— удаление дня —');
t('deleteDay убирает нужный день', () => {
  state = store.deleteDay(state, dayB.id);
  assert(state.program.days.length === 1 && state.program.days[0].id === dayA.id);
});

console.log('— пользовательские упражнения —');
let custom;
t('addCustomExercise добавляет с isCustom и id cx_*', () => {
  ({ state, exercise: custom } = store.addCustomExercise(state, { name: 'Мой жим', primaryMuscle: 'chest', kind: 'compound', weightStep: 2.5 }));
  assert(custom.isCustom === true && custom.id.startsWith('cx_') && state.exercises.some((e) => e.id === custom.id), JSON.stringify(custom));
});
t('addCustomExercise без имени кидает', () => {
  assert(throws(() => store.addCustomExercise(state, { name: '  ' })));
});
t('своё упражнение находится поиском и годится для дня', () => {
  const found = store.addDayItem(state, dayA.id, prog.defaultItemFor(custom));
  const it = found.program.days[0].items.slice(-1)[0];
  assert(it.exerciseId === custom.id);
  const r = ex.searchExercises(state, { query: 'мой жим' });
  assert(r.length === 1 && r[0].isCustom);
});
t('deleteCustomExercise удаляет только кастомные', () => {
  assert(throws(() => store.deleteCustomExercise(state, 'bb-bench-press')));  // встроенное — нельзя
  const s2 = store.deleteCustomExercise(state, custom.id);
  assert(!s2.exercises.some((e) => e.id === custom.id));
});

console.log('— ui-program хелперы —');
t('defaultItemFor: база vs изоляция', () => {
  const compound = prog.defaultItemFor({ id: 'a', kind: 'compound' });
  const iso = prog.defaultItemFor({ id: 'b', kind: 'isolation' });
  assert(compound.repRangeMin === 6 && compound.restSec === 150);
  assert(iso.repRangeMin === 10 && iso.repRangeMax === 15 && iso.restSec === 90);
});
t('itemSummary читаемо описывает элемент', () => {
  const s = prog.itemSummary({ repRangeMin: 6, repRangeMax: 10, workSets: 3, targetRIR: 2, restSec: 150 }, { name: 'Жим' });
  assert(/Жим/.test(s) && /6–10×3/.test(s) && /RIR 2/.test(s), s);
});
t('groupByMuscle: альтернативы на одну группу рядом, внутри — по алфавиту', () => {
  const sorted = prog.groupByMuscle(state.exercises.filter((e) => !e.isCustom));
  // все ноги подряд одним блоком (включая добавленный в конец библиотеки гакк)
  const muscles = sorted.map((e) => e.primaryMuscle);
  const firstLegs = muscles.indexOf('legs'), lastLegs = muscles.lastIndexOf('legs');
  assert(muscles.slice(firstLegs, lastLegs + 1).every((m) => m === 'legs'), 'ноги разорваны');
  const legs = sorted.filter((e) => e.primaryMuscle === 'legs').map((e) => e.name);
  assert(legs.includes('Гакк-приседания') && legs.indexOf('Гакк-приседания') < legs.indexOf('Приседания со штангой'), legs.join('|'));
  // порядок групп: грудь раньше ног, ноги раньше кора
  assert(muscles.indexOf('chest') < firstLegs && lastLegs < muscles.lastIndexOf('core'));
});
t('замена упражнения: updateDayItem меняет exerciseId, сохраняя параметры', () => {
  const before = state.program.days.find((d) => d.id === dayA.id).items[0];
  const s2 = store.updateDayItem(state, dayA.id, 0, { exerciseId: 'leg-press' });
  const after = s2.program.days.find((d) => d.id === dayA.id).items[0];
  assert(after.exerciseId === 'leg-press' && after.workSets === before.workSets && after.restSec === before.restSec, JSON.stringify(after));
});
t('seedProgramIfEmpty засевает пустую, не трогает заполненную', () => {
  const empty = store.defaultState(ex.EXERCISE_LIBRARY);
  const seeded = prog.seedProgramIfEmpty(empty);
  assert(seeded.program.days.length >= 1 && seeded !== empty);
  const already = prog.seedProgramIfEmpty(state);
  assert(already === state);  // не пустая — возвращается как есть
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
