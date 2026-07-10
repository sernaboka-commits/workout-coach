/* Тест чанка 5: analytics.js — чистые функции (node) */
const eng = require('./src/js/engine.js');
const an = require('./src/js/analytics.js');
const uan = require('./src/js/ui-analytics.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

/* --- сборка синтетического state --- */
const exercises = [
  { id: 'bench', name: 'Жим', primaryMuscle: 'chest', kind: 'compound', weightStep: 2.5 },
  { id: 'squat', name: 'Присед', primaryMuscle: 'legs', kind: 'compound', weightStep: 2.5 },
  { id: 'curl', name: 'Бицепс', primaryMuscle: 'arms', kind: 'isolation', weightStep: 1 },
];
const mkState = (sessions) => ({ exercises, sessions });
const set = (exerciseId, weight, reps, rir, extra = {}) => ({ id: 'x' + Math.random(), exerciseId, weight, reps, rir, isCalibration: false, ...extra });
// одна сессия: дата, набор сетов, флаги
const ses = (date, sets, { isDeload = false, weekNo = 1 } = {}) => ({ id: 's' + date, date: date + 'T10:00:00.000Z', dayId: 'day-a', weekNo, isDeload, sets });

console.log('— e1rm: единообразие с engine, учёт RIR —');
t('e1rm(w,reps,rir) == engine.epley1rm(w, reps+rir)', () => {
  assert(Math.abs(an.e1rm(100, 5, 2) - eng.epley1rm(100, 7)) < 1e-9);
  assert(Math.abs(an.e1rm(100, 8, 0) - eng.epley1rm(100, 8)) < 1e-9);
});
t('RIR повышает e1RM (усилие ближе к отказу учтено)', () => {
  assert(an.e1rm(100, 5, 3) > an.e1rm(100, 5, 0));
});

console.log('— e1rmSeries —');
t('одна точка на сессию, по возрастанию даты, лучший рабочий сет', () => {
  const st = mkState([
    ses('2026-01-05', [set('bench', 60, 8, 2), set('bench', 62.5, 6, 1)]),
    ses('2026-01-12', [set('bench', 65, 8, 2)]),
  ]);
  const s = an.e1rmSeries(st, 'bench');
  assert(s.length === 2, 'len=' + s.length);
  assert(s[0].date < s[1].date);
  // лучший сет первой сессии: max(60@10eff, 62.5@7eff) = 62.5*(1+7/30)=77.08 vs 60*(1+10/30)=80 → 80
  assert(Math.abs(s[0].e1rm - 80) < 0.2, 'e1rm0=' + s[0].e1rm);
});
t('сессия только с калибровкой → точка помечена isCalibration', () => {
  const st = mkState([ses('2026-01-05', [set('bench', 40, 15, 4, { isCalibration: true })])]);
  const s = an.e1rmSeries(st, 'bench');
  assert(s.length === 1 && s[0].isCalibration === true, JSON.stringify(s));
});

console.log('— weeklyVolume —');
t('считает рабочие сеты по primaryMuscle за неделю; калибровки не в счёт', () => {
  const st = mkState([
    ses('2026-01-06', [set('bench', 60, 8, 2), set('bench', 60, 8, 2), set('squat', 100, 5, 2), set('bench', 40, 15, 4, { isCalibration: true })]),
  ]);
  const v = an.weeklyVolume(st, { now: new Date('2026-01-08T00:00:00Z') });
  const chest = v.byMuscle.find((m) => m.muscle === 'chest');
  const legs = v.byMuscle.find((m) => m.muscle === 'legs');
  assert(chest.count === 2 && legs.count === 1, JSON.stringify(v.byMuscle));
});
t('статус коридора: low/ok/high (10–20)', () => {
  const many = [];
  for (let i = 0; i < 22; i++) many.push(set('bench', 60, 8, 2)); // 22 сета груди → high
  for (let i = 0; i < 12; i++) many.push(set('squat', 100, 5, 2)); // 12 ног → ok
  const st = mkState([ses('2026-01-06', many)]);
  const v = an.weeklyVolume(st, { now: new Date('2026-01-08T00:00:00Z') });
  const byM = Object.fromEntries(v.byMuscle.map((m) => [m.muscle, m.status]));
  assert(byM.chest === 'high' && byM.legs === 'ok' && byM.arms === 'low', JSON.stringify(byM));
});
t('прошлая неделя (weekOffset:1) отделена от текущей', () => {
  const st = mkState([
    ses('2026-01-06', [set('bench', 60, 8, 2)]),               // текущая неделя (от 08.01)
    ses('2025-12-30', [set('bench', 60, 8, 2), set('bench', 60, 8, 2)]), // прошлая
  ]);
  const cur = an.weeklyVolume(st, { now: new Date('2026-01-08T00:00:00Z'), weekOffset: 0 });
  const prev = an.weeklyVolume(st, { now: new Date('2026-01-08T00:00:00Z'), weekOffset: 1 });
  assert(cur.byMuscle.find((m) => m.muscle === 'chest').count === 1);
  assert(prev.byMuscle.find((m) => m.muscle === 'chest').count === 2, JSON.stringify(prev.byMuscle));
});

console.log('— stagnation —');
// 7 недель по понедельникам; вес растёт → e1RM растёт монотонно
const weeklySessions = (exId, weights, { deloadLastWeek = false } = {}) =>
  weights.map((w, i) => {
    const d = new Date(Date.UTC(2026, 0, 5 + i * 7));            // 05.01 + i недель (понедельники)
    const iso = d.toISOString().slice(0, 10);
    return ses(iso, [set(exId, w, 5, 2)], { weekNo: (i % 6) + 1, isDeload: deloadLastWeek && i === weights.length - 1 });
  });

t('плато 3+ недели → стагнация', () => {
  const st = mkState(weeklySessions('bench', [60, 61, 62, 63, 63, 63, 63]));
  const r = an.stagnation(st, { minWeeks: 3 });
  const bench = r.find((x) => x.exerciseId === 'bench');
  assert(bench, 'ожидалась стагнация: ' + JSON.stringify(r));
});
t('стабильный рост → нет стагнации', () => {
  const st = mkState(weeklySessions('bench', [60, 61, 62, 63, 64, 65, 66]));
  const r = an.stagnation(st, { minWeeks: 3 });
  assert(!r.find((x) => x.exerciseId === 'bench'), 'ложная стагнация: ' + JSON.stringify(r));
});
t('малый рост в пределах допуска (<1%) → стагнация', () => {
  const st = mkState(weeklySessions('bench', [60, 61, 62, 63, 63.1, 63.2, 63.3]));
  const r = an.stagnation(st, { minWeeks: 3, tolerance: 0.01 });
  assert(r.find((x) => x.exerciseId === 'bench'), 'должно быть стагнацией в допуске: ' + JSON.stringify(r));
});
t('делоуд-недели исключаются из анализа', () => {
  // последняя неделя — просадка, но помечена делоудом → не портит тренд, роста всё равно нет
  const st = mkState(weeklySessions('bench', [60, 61, 62, 63, 63, 63, 63, 40], { deloadLastWeek: true }));
  const r = an.stagnation(st, { minWeeks: 3 });
  const bench = r.find((x) => x.exerciseId === 'bench');
  assert(bench && bench.recentPeak > 50, 'делоуд не должен считаться: ' + JSON.stringify(r));
});
t('недостаточно данных → упражнение пропущено', () => {
  const st = mkState(weeklySessions('bench', [60, 61]));
  assert(an.stagnation(st, { minWeeks: 3 }).length === 0);
});

console.log('— модели графиков (ui-analytics) —');
t('lineChartModel: пусто → empty', () => {
  const m = uan.lineChartModel([], { w: 300, h: 150 });
  assert(m.empty === true && m.pts.length === 0);
});
t('lineChartModel: точки в пределах холста, max→верх, min→низ', () => {
  const m = uan.lineChartModel([{ e1rm: 100 }, { e1rm: 120 }, { e1rm: 110 }], { w: 300, h: 150, pad: 20 });
  assert(m.pts.length === 3 && m.min === 100 && m.max === 120);
  assert(m.pts.every((p) => p.x >= 20 && p.x <= 280 && p.y >= 20 && p.y <= 130));
  assert(m.pts[1].y < m.pts[0].y, 'бОльший e1RM должен быть выше (меньше y)');
});
t('lineChartModel: одна точка не делит на ноль (центр по x)', () => {
  const m = uan.lineChartModel([{ e1rm: 80 }], { w: 300, h: 150, pad: 20 });
  assert(m.pts.length === 1 && isFinite(m.pts[0].x) && isFinite(m.pts[0].y));
});
t('barChartModel: коридор в кадре, статусы столбцов сохранены', () => {
  const bars = [{ muscle: 'chest', count: 22, status: 'high' }, { muscle: 'legs', count: 12, status: 'ok' }, { muscle: 'arms', count: 3, status: 'low' }];
  const m = uan.barChartModel(bars, { w: 300, h: 150, pad: 20, corridor: [10, 20] });
  assert(m.rects.length === 3 && m.maxScale >= 22);
  assert(m.loY > m.hiY, 'нижняя граница коридора ниже верхней (больше y)');
  assert(m.rects[0].status === 'high' && m.rects[0].h > m.rects[2].h, 'больше сетов → выше столбец');
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
