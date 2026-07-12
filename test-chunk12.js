/* Тест чанка 12: нагрузка по детальным мышцам (доли + эффективные сеты + тоннаж) */
const ex = require('./src/js/exercises.js');
const an = require('./src/js/analytics.js');
const store = require('./src/js/store.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log('— целостность библиотеки —');
t('у каждого встроенного упражнения есть карта muscles', () => {
  for (const e of ex.EXERCISE_LIBRARY) assert(e.muscles && Object.keys(e.muscles).length, e.id);
});
t('все ключи карт — известные детальные мышцы, доли в (0,1]', () => {
  for (const e of ex.EXERCISE_LIBRARY) {
    for (const [m, f] of Object.entries(e.muscles)) {
      assert(ex.DETAIL_MUSCLES[m], `${e.id}: неизвестная мышца ${m}`);
      assert(f > 0 && f <= 1, `${e.id}: доля ${m}=${f}`);
    }
  }
});
t('у каждого упражнения есть целевая мышца с долей 1.0', () => {
  for (const e of ex.EXERCISE_LIBRARY) {
    assert(Object.values(e.muscles).some((f) => f === 1), e.id);
  }
});
t('каждая детальная мышца принадлежит существующей группе', () => {
  for (const [m, d] of Object.entries(ex.DETAIL_MUSCLES)) {
    assert(ex.MUSCLE_LABELS[d.group], `${m}: группа ${d.group}`);
    assert(d.label, m);
  }
});
t('жим лёжа: середина груди 1.0, трицепс и передняя дельта 0.5', () => {
  const bench = ex.EXERCISE_LIBRARY.find((e) => e.id === 'bb-bench-press');
  assert(bench.muscles.chest_mid === 1 && bench.muscles.triceps === 0.5 && bench.muscles.front_delt === 0.5);
});

console.log('— muscleFractions: фолбэк без карты —');
t('с картой muscles возвращается сама карта', () => {
  const e = { muscles: { biceps: 1 }, primaryMuscle: 'chest' };
  assert(ex.muscleFractions(e).biceps === 1);
});
t('без карты: 1.0 размазан по primary-группе, 0.5 — по secondary', () => {
  const fr = ex.muscleFractions({ primaryMuscle: 'arms', secondaryMuscles: ['chest'] });
  const sum = (g) => Object.entries(fr)
    .filter(([m]) => ex.DETAIL_MUSCLES[m].group === g)
    .reduce((a, [, f]) => a + f, 0);
  assert(near(sum('arms'), 1, 1e-3), 'arms=' + sum('arms'));
  assert(near(sum('chest'), 0.5, 1e-3), 'chest=' + sum('chest'));
});
t('пустое/отсутствующее упражнение → пустая карта', () => {
  assert(Object.keys(ex.muscleFractions(null)).length === 0);
});

console.log('— muscleLoad: эффективные сеты и тоннаж —');
const exercises = [
  ex.EXERCISE_LIBRARY.find((e) => e.id === 'bb-bench-press'),
  ex.EXERCISE_LIBRARY.find((e) => e.id === 'bb-curl'),
  ex.EXERCISE_LIBRARY.find((e) => e.id === 'bb-squat'),
];
const set = (exerciseId, weight, reps, extra = {}) =>
  ({ id: 'x' + Math.random(), exerciseId, weight, reps, rir: 2, isCalibration: false, ...extra });
const ses = (date, sets) => ({ id: 's' + date, date: date + 'T10:00:00.000Z', dayId: 'a', weekNo: 1, isDeload: false, sets });
const NOW = new Date('2026-01-08T00:00:00Z');   // чт; неделя пн 2026-01-05

t('вторичные мышцы получают долю: 2 сета жима → трицепс 1.0 сет', () => {
  const st = { exercises, sessions: [ses('2026-01-06', [set('bb-bench-press', 100, 10), set('bb-bench-press', 100, 10)])] };
  const ml = an.muscleLoad(st, { now: NOW });
  const arms = ml.groups.find((g) => g.group === 'arms');
  const tri = arms.muscles.find((m) => m.muscle === 'triceps');
  assert(tri.sets === 1, 'triceps=' + tri.sets);
  const chest = ml.groups.find((g) => g.group === 'chest');
  assert(chest.muscles.find((m) => m.muscle === 'chest_mid').sets === 2);
});
t('тоннаж = вес×повторы×доля', () => {
  const st = { exercises, sessions: [ses('2026-01-06', [set('bb-bench-press', 100, 10)])] };
  const ml = an.muscleLoad(st, { now: NOW });
  const chest = ml.groups.find((g) => g.group === 'chest');
  assert(chest.muscles.find((m) => m.muscle === 'chest_mid').tonnage === 1000);
  const arms = ml.groups.find((g) => g.group === 'arms');
  assert(arms.muscles.find((m) => m.muscle === 'triceps').tonnage === 500);
});
t('итог группы = сумма её детальных мышц', () => {
  const st = { exercises, sessions: [ses('2026-01-06', [set('bb-bench-press', 100, 10), set('bb-curl', 30, 10)])] };
  const ml = an.muscleLoad(st, { now: NOW });
  const arms = ml.groups.find((g) => g.group === 'arms');
  const sum = arms.muscles.reduce((a, m) => a + m.sets, 0);
  assert(near(arms.sets, +sum.toFixed(1), 1e-6), `${arms.sets} != ${sum}`);
  assert(arms.tonnage === arms.muscles.reduce((a, m) => a + m.tonnage, 0));
});
t('калибровочные сеты не считаются', () => {
  const st = { exercises, sessions: [ses('2026-01-06', [set('bb-curl', 20, 12, { isCalibration: true })])] };
  const ml = an.muscleLoad(st, { now: NOW });
  assert(ml.groups.length === 0, JSON.stringify(ml.groups));
});
t('фильтр по неделе: weekOffset=1 видит прошлую неделю, 0 — нет', () => {
  const st = { exercises, sessions: [ses('2025-12-30', [set('bb-squat', 120, 8)])] };
  assert(an.muscleLoad(st, { now: NOW, weekOffset: 0 }).groups.length === 0);
  const prev = an.muscleLoad(st, { now: NOW, weekOffset: 1 });
  const legs = prev.groups.find((g) => g.group === 'legs');
  assert(legs && legs.muscles.find((m) => m.muscle === 'quads').sets === 1);
});
t('группы в каноническом порядке, нулевые не включаются', () => {
  const st = { exercises, sessions: [ses('2026-01-06', [set('bb-squat', 120, 8), set('bb-bench-press', 100, 10)])] };
  const ml = an.muscleLoad(st, { now: NOW });
  const order = ml.groups.map((g) => g.group);
  const canon = an.MUSCLE_ORDER.filter((g) => order.includes(g));
  assert(JSON.stringify(order) === JSON.stringify(canon), order.join(','));
  assert(!order.includes('core') || ml.groups.find((g) => g.group === 'core').sets > 0);
});
t('старое своё упражнение без карты — учитывается через фолбэк', () => {
  const custom = { id: 'cx1', name: 'Своё', primaryMuscle: 'arms', secondaryMuscles: [], kind: 'isolation', weightStep: 2.5, isCustom: true };
  const st = { exercises: [...exercises, custom], sessions: [ses('2026-01-06', [set('cx1', 50, 10)])] };
  const ml = an.muscleLoad(st, { now: NOW });
  const arms = ml.groups.find((g) => g.group === 'arms');
  assert(arms && near(arms.sets, 1, 0.05), 'arms=' + (arms && arms.sets));
});

console.log('— store: своё упражнение с детальной мышцей —');
t('addCustomExercise сохраняет карту muscles', () => {
  const st0 = store.defaultState(ex.EXERCISE_LIBRARY);
  const r = store.addCustomExercise(st0, { name: 'Сгибания в тренажёре', primaryMuscle: 'arms', muscles: { biceps: 1 } });
  assert(r.exercise.muscles && r.exercise.muscles.biceps === 1);
});
t('addCustomExercise отбрасывает мусорные доли', () => {
  const st0 = store.defaultState(ex.EXERCISE_LIBRARY);
  const r = store.addCustomExercise(st0, { name: 'Х', primaryMuscle: 'arms', muscles: { biceps: 'abc', triceps: 5 } });
  assert(!r.exercise.muscles, JSON.stringify(r.exercise.muscles));
});
t('mergeLibrary доносит карты muscles в старое сохранение', () => {
  const old = store.defaultState(ex.EXERCISE_LIBRARY.map(({ muscles, ...rest }) => rest));
  const merged = store.mergeLibrary(old, ex.EXERCISE_LIBRARY);
  const bench = merged.exercises.find((e) => e.id === 'bb-bench-press');
  assert(bench.muscles && bench.muscles.chest_mid === 1);
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
