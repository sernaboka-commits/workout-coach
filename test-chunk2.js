/* Тест чанка 2: engine.js (node, чистые функции — без localStorage) */
const eng = require('./src/js/engine.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

/* helpers для сборки данных */
const meso = (weekNo, extra = {}) => ({ mesocycle: { cycleNo: 1, weekNo, growWeeks: 5, deloadShift: 0, ...extra } });
const item = (o = {}) => ({ repRangeMin: 8, repRangeMax: 12, workSets: 3, targetRIR: 2, restSec: 150, ...o });
const ex = { weightStep: 2.5 };
// сессия истории: массив рабочих сетов -> объект в формате exerciseHistory
const sess = (sets, opts = {}) => ({ date: opts.date || '2026-07-01', isDeload: !!opts.isDeload, weekNo: opts.weekNo || 1, sets });
const S = (weight, reps, rir, extra = {}) => ({ weight, reps, rir, isCalibration: false, ...extra });

console.log('— утилиты —');
t('roundToStep: nearest/floor/ceil', () => {
  assert(eng.roundToStep(61, 2.5) === 60, 'nearest');       // 24.4 → 24 → 60
  assert(eng.roundToStep(64, 2.5, 'floor') === 62.5, 'floor'); // 25.6 → 25 → 62.5
  assert(eng.roundToStep(61, 2.5, 'ceil') === 62.5, 'ceil');   // 24.4 → 25 → 62.5
});
t('epley1rm: 100кг×1 ≈ 103.3, 100кг×10 ≈ 133.3', () => {
  assert(Math.abs(eng.epley1rm(100, 1) - 103.333) < 0.01);
  assert(Math.abs(eng.epley1rm(100, 10) - 133.333) < 0.01);
});

console.log('— mesoStatus: RIR-рампа —');
t('нед.1 → RIR 3, не делоуд', () => {
  const m = eng.mesoStatus(meso(1)); assert(m.targetRIR === 3 && m.isDeload === false, JSON.stringify(m));
});
t('нед.2 и нед.3 → RIR 2', () => {
  assert(eng.mesoStatus(meso(2)).targetRIR === 2);
  assert(eng.mesoStatus(meso(3)).targetRIR === 2);
});
t('нед.4 и нед.5 → RIR 1', () => {
  assert(eng.mesoStatus(meso(4)).targetRIR === 1);
  assert(eng.mesoStatus(meso(5)).targetRIR === 1);
});
t('нед.6 → делоуд, RIR 4', () => {
  const m = eng.mesoStatus(meso(6)); assert(m.isDeload === true && m.targetRIR === 4, JSON.stringify(m));
});
t('deloadShift -1 → делоуд на нед.5', () => {
  const m = eng.mesoStatus(meso(5, { deloadShift: -1 })); assert(m.isDeload === true && m.targetRIR === 4);
});

console.log('— advanceWeek / shiftDeload —');
t('advanceWeek: нед.1 → нед.2', () => {
  const s = eng.advanceWeek(meso(1)); assert(s.mesocycle.weekNo === 2 && s.mesocycle.cycleNo === 1);
});
t('advanceWeek: после делоуда (нед.6) → новый цикл, нед.1', () => {
  const s = eng.advanceWeek(meso(6), { now: new Date('2026-08-01') });
  assert(s.mesocycle.cycleNo === 2 && s.mesocycle.weekNo === 1 && s.mesocycle.deloadShift === 0, JSON.stringify(s.mesocycle));
});
t('advanceWeek не мутирует исходный state', () => {
  const orig = meso(1); eng.advanceWeek(orig); assert(orig.mesocycle.weekNo === 1);
});
t('shiftDeload клампит к [-1, +1]', () => {
  assert(eng.shiftDeload(meso(1), +1).mesocycle.deloadShift === 1);
  assert(eng.shiftDeload(meso(1), +5).mesocycle.deloadShift === 1);
  assert(eng.shiftDeload(meso(1), -5).mesocycle.deloadShift === -1);
});

console.log('— calibrate: проекция по Эпли —');
t('S5 PRD: 16кг×15 RIR4 → цель 10×RIR2 ≈ 18–20 кг', () => {
  const r = eng.calibrate(S(16, 15, 4), { targetReps: 10, targetRIR: 2, weightStep: 2 });
  assert(r.weight >= 16 && r.weight <= 22, 'weight=' + r.weight);
  assert(r.confidence > 0 && r.confidence < 1, 'conf=' + r.confidence);
  assert(r.e1rm > 20, 'e1rm=' + r.e1rm);
});
t('calibrate: уверенность выше при близком диапазоне', () => {
  const near = eng.calibrate(S(50, 11, 2), { targetReps: 10, targetRIR: 2, weightStep: 2.5 });
  const far = eng.calibrate(S(30, 20, 5), { targetReps: 8, targetRIR: 1, weightStep: 2.5 });
  assert(near.confidence > far.confidence, `near=${near.confidence} far=${far.confidence}`);
});

console.log('— recommend: базовые ветки —');
t('нет истории → needsCalibration', () => {
  const r = eng.recommend('x', 1, { ...eng.mesoStatus(meso(1)) && { meso: eng.mesoStatus(meso(1)) }, item: item(), exercise: ex, history: [] });
  assert(r.needsCalibration === true && r.weight === null, JSON.stringify(r));
});
t('все сеты у потолка (12) → +шаг веса, возврат к низу (8)', () => {
  const history = [sess([S(60, 12, 2), S(60, 12, 2), S(60, 12, 1)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 62.5 && r.reps === 8, JSON.stringify(r));
});
t('середина диапазона → тот же вес, +повторы', () => {
  const history = [sess([S(60, 9, 2), S(60, 9, 2), S(60, 8, 2)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 60 && r.reps === 10 && !r.needsCalibration, JSON.stringify(r));
});
t('целевой RIR берётся из недели мезоцикла (нед.4 → RIR 1)', () => {
  const history = [sess([S(60, 9, 1), S(60, 9, 1), S(60, 8, 1)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(4)), item: item(), exercise: ex, history });
  assert(r.targetRIR === 1, JSON.stringify(r));
});

console.log('— recommend: перегруз —');
t('одиночный перегруз (RIR 0 в 2 сетах) → удержание веса', () => {
  const history = [sess([S(60, 8, 0), S(60, 7, 0), S(60, 6, 1)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 60 && /перегруз|закрепл/i.test(r.reason), JSON.stringify(r));
});
t('повторный перегруз (две сессии подряд) → −5%', () => {
  const history = [
    sess([S(60, 8, 0), S(60, 7, 0)], { date: '2026-07-03' }),
    sess([S(60, 8, 0), S(60, 7, 0)], { date: '2026-07-01' }),
  ];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 57.5 && /5%/.test(r.reason), JSON.stringify(r)); // floor(60*0.95=57 → 57.5? ) проверим
});
t('один RIR 0 (не 2 сета) перегрузом не считается', () => {
  const history = [sess([S(60, 12, 0), S(60, 12, 2), S(60, 12, 2)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 62.5, JSON.stringify(r)); // потолок → прогрессия, перегруза нет
});

console.log('— recommend: делоуд —');
t('делоуд → 60% рабочего веса', () => {
  const history = [sess([S(100, 10, 2), S(100, 10, 2)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(6)), item: item(), exercise: ex, history });
  assert(r.isDeload === true && r.weight === 60 && r.targetRIR === 4, JSON.stringify(r));
});

console.log('— recommend: калибровочные сеты игнорируются —');
t('сессия только с калибровочным сетом → needsCalibration', () => {
  const history = [sess([S(40, 15, 4, { isCalibration: true })])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(1)), item: item(), exercise: ex, history });
  assert(r.needsCalibration === true, JSON.stringify(r));
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
