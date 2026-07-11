/* Тест чанка 11: monthGrid — календарь тренировок (node) */
const an = require('./src/js/analytics.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

const st = {
  program: { days: [{ id: 'a', label: 'A', weekday: 0 }, { id: 'b', label: 'B', weekday: 2 }] }, // Пн, Ср
  sessions: [
    { id: 's1', date: '2026-07-06T10:00:00Z', sets: [{ exerciseId: 'x', weight: 50, reps: 10, isCalibration: false }, { exerciseId: 'x', weight: 50, reps: 9, isCalibration: false }] }, // Пн 6 июля, 2 рабочих
    { id: 's2', date: '2026-07-08T10:00:00Z', sets: [{ exerciseId: 'x', weight: 40, reps: 15, isCalibration: true }] }, // только калибровка → не считается
  ],
  runs: [
    { id: 'r1', date: '2026-07-07T10:00:00Z', type: 'easy', distanceKm: 8, durationSec: 2700 },
    { id: 'r2', date: '2026-07-07T18:00:00Z', type: 'interval', distanceKm: 6, durationSec: 1900 },
  ],
};

console.log('— сетка месяца —');
const grid = an.monthGrid(st, { year: 2026, month: 6 }); // июль (0-based 6)
t('6 недель × 7 дней, Пн-первый', () => {
  assert(grid.length === 6 && grid.every((w) => w.length === 7));
  // 1 июля 2026 — среда → первая строка начинается с 29 июня (Пн)
  assert(grid[0][0].date === '2026-06-29', grid[0][0].date);
});
const cell = (d) => grid.flat().find((c) => c.date === d);
t('силовая: рабочие подходы считаются, калибровка — нет', () => {
  assert(cell('2026-07-06').workoutSets === 2, JSON.stringify(cell('2026-07-06')));
  assert(cell('2026-07-08').workoutSets === 0, 'калибровка попала в счёт');
});
t('пробежки в ячейке дня, с флагом hard', () => {
  const c = cell('2026-07-07');
  assert(c.runs.length === 2);
  assert(c.runs.find((r) => r.type === 'interval').hard === true);
  assert(c.runs.find((r) => r.type === 'easy').hard === false);
});
t('запланированные дни по дню недели (Пн→A, Ср→B)', () => {
  assert(cell('2026-07-06').plannedLabel === 'A');   // понедельник
  assert(cell('2026-07-08').plannedLabel === 'B');   // среда
  assert(cell('2026-07-07').plannedLabel === null);  // вторник — плана нет
});
t('inMonth: соседние месяцы помечены', () => {
  assert(cell('2026-06-29').inMonth === false);
  assert(cell('2026-07-15').inMonth === true);
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
