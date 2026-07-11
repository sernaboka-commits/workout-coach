/* Тест чанка 3: ui-workout.js — чистые хелперы (node, без DOM) */
const eng = require('./src/js/engine.js');
const ui = require('./src/js/ui-workout.js');
const exlib = require('./src/js/exercises.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

const meso = (weekNo) => ({ mesocycle: { cycleNo: 1, weekNo, growWeeks: 5, deloadShift: 0 } });
const item = (o = {}) => ({ exerciseId: 'bb-bench-press', repRangeMin: 8, repRangeMax: 12, workSets: 3, targetRIR: 2, restSec: 150, ...o });
const ctx = (weekNo, history = []) => ({ meso: eng.mesoStatus(meso(weekNo)), item: item(), exercise: { weightStep: 2.5 }, history });
const S = (weight, reps, rir, extra = {}) => ({ id: 'x' + Math.random(), weight, reps, rir, exerciseId: 'bb-bench-press', isCalibration: false, ...extra });

console.log('— fmtClock —');
t('150→2:30, 5→0:05, 0→0:00, 65→1:05', () => {
  assert(ui.fmtClock(150) === '2:30');
  assert(ui.fmtClock(5) === '0:05');
  assert(ui.fmtClock(0) === '0:00');
  assert(ui.fmtClock(65) === '1:05');
});

console.log('— computeRemaining —');
t('будущее → положительный остаток; прошлое → 0', () => {
  const now = 1000000;
  assert(ui.computeRemaining(now + 30000, now) === 30);
  assert(ui.computeRemaining(now - 5000, now) === 0);
});

console.log('— clampStep —');
t('шаг веса, клампы min/max, RIR 0..5', () => {
  assert(ui.clampStep(60, +1, 2.5) === 62.5);
  assert(ui.clampStep(2.5, -1, 2.5, 0, null) === 0);   // не уходит ниже 0
  assert(ui.clampStep(0, -1, 2.5, 0, null) === 0);
  assert(ui.clampStep(5, +1, 1, 0, 5) === 5);          // RIR потолок
  assert(ui.clampStep(0, -1, 1, 0, 5) === 0);          // RIR пол
});

console.log('— dayProgress —');
t('считает рабочие сеты, игнорит калибровочные', () => {
  const day = ui.demoDayA();
  const sets = [
    { exerciseId: 'bb-bench-press', isCalibration: false },
    { exerciseId: 'bb-bench-press', isCalibration: true },  // калибровочный не в счёт
    { exerciseId: 'bb-row', isCalibration: false },
  ];
  const p = ui.dayProgress(day, sets);
  const total = day.items.reduce((a, i) => a + i.workSets, 0);
  assert(p.total === total && p.done === 2, JSON.stringify(p));
});

console.log('— demoDayA —');
t('демо-день валиден: все exerciseId есть в библиотеке', () => {
  const day = ui.demoDayA();
  assert(day.items.length >= 3);
  const ids = new Set(exlib.EXERCISE_LIBRARY.map((e) => e.id));
  assert(day.items.every((i) => ids.has(i.exerciseId)), 'неизвестный exerciseId');
});

console.log('— planExercise: калибровочный сценарий (нет истории) —');
t('нет сетов → mode probe', () => {
  const p = ui.planExercise(item(), [], ctx(1), eng);
  assert(p.mode === 'probe' && p.rec.weight === null, JSON.stringify(p));
});
t('после разведочного → mode control с проекцией веса', () => {
  const probe = S(40, 15, 4, { isCalibration: true });
  const p = ui.planExercise(item(), [probe], ctx(1), eng);
  assert(p.mode === 'control' && p.rec.weight > 0 && p.calibration, JSON.stringify(p));
});
t('после контрольного → mode work, держим вес', () => {
  const probe = S(40, 15, 4, { isCalibration: true });
  const control = S(50, 10, 2);
  const p = ui.planExercise(item(), [probe, control], ctx(1), eng);
  assert(p.mode === 'work' && p.rec.weight === 50, JSON.stringify(p));
});

console.log('— planExercise: обычный сценарий (есть история) —');
t('история есть → recommend, mode work', () => {
  const history = [{ isDeload: false, sets: [S(60, 9, 2), S(60, 9, 2), S(60, 8, 2)] }];
  const p = ui.planExercise(item(), [], ctx(2, history), eng);
  assert(p.mode === 'work' && p.rec.weight === 60 && !p.rec.needsCalibration, JSON.stringify(p));
});
t('все рабочие сеты сделаны → mode done', () => {
  const history = [{ isDeload: false, sets: [S(60, 9, 2)] }];
  const exSets = [S(60, 9, 2), S(60, 9, 2), S(60, 9, 2)];
  const p = ui.planExercise(item({ workSets: 3 }), exSets, ctx(2, history), eng);
  assert(p.mode === 'done' && p.done === 3, JSON.stringify(p));
});
t('второй рабочий сет → автоподстановка веса прошлого сета', () => {
  const history = [{ isDeload: false, sets: [S(60, 9, 2)] }];
  const exSets = [S(62.5, 8, 2)];
  const p = ui.planExercise(item(), exSets, ctx(2, history), eng);
  assert(p.mode === 'work' && p.rec.weight === 62.5, JSON.stringify(p));
});

console.log('— sessionSummary: итог тренировки —');
t('тоннаж = Σ вес×повт рабочих; калибровочные не в счёт; лучший подход', () => {
  const ses = { date: '2026-07-12', sets: [
    S(40, 15, 4, { isCalibration: true }),   // калибровка — не в тоннаж
    S(50, 10, 2),                            // 500
    S(50, 9, 2),                             // 450
    { id: 'r1', exerciseId: 'bb-row', weight: 70, reps: 10, rir: 2, isCalibration: false }, // 700
  ] };
  const resolver = (id) => ({ 'bb-bench-press': { name: 'Жим' }, 'bb-row': { name: 'Тяга' } }[id] || null);
  const sum = ui.sessionSummary(ses, resolver);
  assert(sum.workSets === 3, 'workSets=' + sum.workSets);
  assert(sum.tonnage === 1650, 'tonnage=' + sum.tonnage);        // 500+450+700
  const bench = sum.exercises.find((e) => e.exerciseId === 'bb-bench-press');
  assert(bench.name === 'Жим' && bench.sets === 2 && bench.calib === 1, JSON.stringify(bench));
  assert(bench.top.weight === 50 && bench.top.reps === 10, JSON.stringify(bench.top)); // лучший 50×10
});
t('пустая сессия → нули', () => {
  const sum = ui.sessionSummary({ sets: [] }, () => null);
  assert(sum.workSets === 0 && sum.tonnage === 0 && sum.exercises.length === 0);
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
