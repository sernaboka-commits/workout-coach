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
t('потолок повторов С ЗАПАСОМ (RIR ≥ цели) → +шаг веса, возврат к низу', () => {
  const history = [sess([S(60, 12, 2), S(60, 12, 2), S(60, 12, 2)])];   // 12 при RIR2 = цель
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 62.5 && r.reps === 8, JSON.stringify(r));
});
t('потолок, но БЕЗ запаса (RIR < цели) → веса не добавляем', () => {
  const history = [sess([S(60, 12, 2), S(60, 12, 2), S(60, 12, 0)])];   // последний до отказа
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 60, JSON.stringify(r));   // держим вес, не прогрессируем
});
t('RIR-aware: тот же вес, повторы подобраны под целевой RIR (не «+1 вслепую»)', () => {
  const history = [sess([S(60, 9, 2), S(60, 9, 2), S(60, 8, 2)])];       // 9 при RIR2 → до отказа 11
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 60 && r.reps === 9 && !r.needsCalibration, JSON.stringify(r)); // 11−2=9, а не 10
});
t('целевой RIR берётся из недели мезоцикла (нед.4 → RIR 1)', () => {
  const history = [sess([S(60, 9, 1), S(60, 9, 1), S(60, 8, 1)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(4)), item: item(), exercise: ex, history });
  assert(r.targetRIR === 1, JSON.stringify(r));
});

console.log('— recommend: RIR-aware вес —');
t('РЕАЛЬНЫЙ КЕЙС: 9 повт при RIR 2, цель нед.1 RIR 3 → 8 повт (а не 10!)', () => {
  const history = [sess([S(50, 9, 2)])];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(1)), item: item({ repRangeMin: 6, repRangeMax: 10 }), exercise: ex, history });
  assert(r.weight === 50 && r.reps === 8 && r.targetRIR === 3, JSON.stringify(r));  // 9+2=11 до отказа, 11−3=8
});
t('вес тяжеловат (до отказа ниже низа диапазона при цели RIR) → −шаг веса', () => {
  const history = [sess([S(45, 13, 0)])];  // 13 при RIR0 в диапазоне 10–15, цель RIR2 → нужно 13+2=15 до отказа
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item({ repRangeMin: 14, repRangeMax: 18, targetRIR: 2 }), exercise: ex, history });
  assert(r.weight === 42.5 && /тяжеловат/.test(r.reason), JSON.stringify(r));  // rtf 13 < 14+2=16 → −2.5
});
t('повторный перегруз (RIR 0 в 2 сетах, две сессии подряд) → −5%', () => {
  const history = [
    sess([S(60, 8, 0), S(60, 7, 0)], { date: '2026-07-03' }),
    sess([S(60, 8, 0), S(60, 7, 0)], { date: '2026-07-01' }),
  ];
  const r = eng.recommend('x', 1, { meso: eng.mesoStatus(meso(2)), item: item(), exercise: ex, history });
  assert(r.weight === 57.5 && /5%/.test(r.reason), JSON.stringify(r));
});
t('projectReps: 9 повт RIR 2, цель RIR 3 → 8; цель RIR 1 → 10 (клампится в диапазон)', () => {
  const it = item({ repRangeMin: 6, repRangeMax: 10 });
  assert(eng.projectReps({ reps: 9, rir: 2 }, 3, it) === 8);
  assert(eng.projectReps({ reps: 9, rir: 2 }, 1, it) === 10);
  assert(eng.projectReps({ reps: 9, rir: null }, 2, it) === 9);  // нет RIR → повторы не меняем
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

console.log('— nextSessionAdvice: рычаг прогрессии на след. тренировку —');
const adv = (sets, it, t, o) => eng.nextSessionAdvice(sets, it, t, o);
t('2+ подхода до отказа → reduce (управление усталостью)', () => {
  const r = adv([S(60, 8, 0), S(60, 7, 0), S(60, 6, 1)], item(), 2, {});
  assert(r.lever === 'reduce' && !r.volume, JSON.stringify(r));
});
t('потолок повторов с запасом (RIR ≥ цели) → weight', () => {
  const r = adv([S(60, 12, 2), S(60, 12, 2), S(60, 12, 2)], item(), 2, { weightStep: 2.5 });
  assert(r.lever === 'weight' && /\+2\.5 кг/.test(r.text), JSON.stringify(r));
});
t('в диапазоне с запасом → reps (+повтор) и опция объёма', () => {
  const r = adv([S(60, 9, 2), S(60, 9, 2), S(60, 8, 2)], item(), 2, {});
  assert(r.lever === 'reps' && /повтор/.test(r.text), JSON.stringify(r));
  assert(r.volume && /подход/.test(r.volume), 'нет опции объёма: ' + JSON.stringify(r));
});
t('взял повторы, но тяжелее цели (RIR < цели) → hold', () => {
  const r = adv([S(60, 10, 1), S(60, 9, 1), S(60, 8, 0)], item(), 2, {}); // 1 сет rir0 (<2), в диапазоне
  assert(r.lever === 'hold' && /RIR/.test(r.text), JSON.stringify(r));
});
t('до отказа ниже нижней границы диапазона → reduce', () => {
  const r = adv([S(60, 5, 0)], item({ repRangeMin: 8, repRangeMax: 12 }), 2, { weightStep: 2.5 });
  assert(r.lever === 'reduce' && /тяжелов/.test(r.text), JSON.stringify(r));
});
t('уже 5 подходов → объём не предлагаем (кэп)', () => {
  const five = [S(60, 9, 2), S(60, 9, 2), S(60, 9, 2), S(60, 9, 2), S(60, 9, 2)];
  const r = adv(five, item(), 2, { setsCap: 5 });
  assert(r.lever === 'reps' && !r.volume, JSON.stringify(r));
});
t('нет рабочих сетов → null', () => {
  assert(adv([S(40, 15, 4, { isCalibration: true })], item(), 2, {}) === null);
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
