/* Тест чанка 8: program-gen — генератор программы (node, чистые функции) */
const ex = require('./src/js/exercises.js');
const gen = require('./src/js/program-gen.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

const LIB = ex.EXERCISE_LIBRARY;
const ids = new Set(LIB.map((e) => e.id));
const G = (o) => gen.generateProgram(o, LIB);
const muscleOf = Object.fromEntries(LIB.map((e) => [e.id, e.primaryMuscle]));

console.log('— пулы валидны —');
t('все id в пулах существуют в библиотеке', () => {
  for (const [key, pool] of Object.entries(gen.GEN_POOLS))
    for (const id of pool) assert(ids.has(id), `${key}: нет ${id}`);
});

console.log('— выбор сплита —');
t('авто: 2–3 дня → фулбади, 4–5 → по группам', () => {
  assert(gen.genPickSplit(3, 'auto').every((k) => k.startsWith('full')));
  assert(gen.genPickSplit(4, 'auto').includes('upper') && gen.genPickSplit(5, 'auto').includes('legs'));
});
t('явный выбор перекрывает авто', () => {
  assert(gen.genPickSplit(4, 'full').every((k) => k.startsWith('full')));
  assert(gen.genPickSplit(2, 'split').join() === 'upper,lower');
});

console.log('— структура результата —');
t('3 дня фулбади: метки A/B/C, валидные элементы', () => {
  const r = G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 3, minutes: 60, split: 'full' });
  assert(r.days.length === 3);
  assert(r.days.map((d) => d.label).join('') === 'ABC', r.days.map((d) => d.label).join(''));
  for (const d of r.days) {
    assert(d.items.length >= 3, 'мало упражнений: ' + d.items.length);
    for (const it of d.items) {
      assert(ids.has(it.exerciseId), it.exerciseId);
      assert(it.workSets > 0 && it.repRangeMin > 0 && it.repRangeMax >= it.repRangeMin && it.restSec > 0);
    }
  }
});
t('сплит 4 дня: метки Верх/Низ', () => {
  const r = G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 4, minutes: 60, split: 'auto' });
  assert(r.days.map((d) => d.label).join(',') === 'Верх,Низ,Верх 2,Низ 2', r.days.map((d) => d.label).join(','));
});

console.log('— время на тренировку —');
t('45 мин даёт меньше упражнений, чем 90', () => {
  const a = G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 3, minutes: 45, split: 'full' });
  const b = G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 3, minutes: 90, split: 'full' });
  const na = a.days.reduce((s, d) => s + d.items.length, 0);
  const nb = b.days.reduce((s, d) => s + d.items.length, 0);
  assert(na < nb, `45мин=${na}, 90мин=${nb}`);
});
t('оценка длительности близка к бюджету (60 мин)', () => {
  const r = G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 3, minutes: 60, split: 'full' });
  for (const d of r.days) assert(d.estMinutes <= 62, `${d.label}: ${d.estMinutes} мин`);
});

console.log('— цель меняет параметры —');
t('сила: база 3–6 повт, 4 сета, отдых ≥180; изоляция в конце', () => {
  const r = G({ sex: 'm', goal: 'strength', daysPerWeek: 3, minutes: 90, split: 'full' });
  const first = r.days[0].items[0];
  assert(first.repRangeMax <= 6 && first.workSets === 4 && first.restSec >= 180, JSON.stringify(first));
});
t('гипертрофия: база 6–10, изоляция 10–15', () => {
  const r = G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 3, minutes: 90, split: 'full' });
  const kinds = Object.fromEntries(LIB.map((e) => [e.id, e.kind]));
  for (const d of r.days) for (const it of d.items) {
    if (kinds[it.exerciseId] === 'compound') assert(it.repRangeMin === 6 && it.repRangeMax === 10, it.exerciseId);
    else assert(it.repRangeMin === 10 && it.repRangeMax === 15, it.exerciseId);
  }
});
t('тонус: больше повторов, короче отдых', () => {
  const r = G({ sex: 'f', goal: 'fitness', daysPerWeek: 2, minutes: 60, split: 'full' });
  const first = r.days[0].items[0];
  assert(first.repRangeMin >= 10 && first.restSec <= 120, JSON.stringify(first));
});

console.log('— пол меняет акцент —');
t('Ж получает больше упражнений на ноги/ягодичные, чем М (90 мин фулбади)', () => {
  const legs = (r) => r.days.reduce((s, d) => s + d.items.filter((it) => muscleOf[it.exerciseId] === 'legs').length, 0);
  const f = legs(G({ sex: 'f', goal: 'hypertrophy', daysPerWeek: 3, minutes: 90, split: 'full' }));
  const m = legs(G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 3, minutes: 90, split: 'full' }));
  assert(f > m, `Ж=${f}, М=${m}`);
});

console.log('— недельный объём в разумном коридоре —');
t('фулбади 3×90: крупные группы ≥6 сетов/нед', () => {
  const r = G({ sex: 'm', goal: 'hypertrophy', daysPerWeek: 3, minutes: 90, split: 'full' });
  const vol = {};
  for (const d of r.days) for (const it of d.items)
    vol[muscleOf[it.exerciseId]] = (vol[muscleOf[it.exerciseId]] || 0) + it.workSets;
  for (const m of ['chest', 'back', 'legs']) assert((vol[m] || 0) >= 6, `${m}=${vol[m]}`);
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
