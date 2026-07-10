/* Тест чанка 1: store.js + exercises.js (node, шим localStorage) */
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
};

const ex = require('./src/js/exercises.js');
const store = require('./src/js/store.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

console.log('— библиотека упражнений —');
t('50 упражнений в библиотеке', () => assert(ex.EXERCISE_LIBRARY.length === 50, 'len=' + ex.EXERCISE_LIBRARY.length));
t('id уникальны', () => assert(new Set(ex.EXERCISE_LIBRARY.map(e => e.id)).size === 50));
t('все 6 мышечных групп покрыты', () => {
  const groups = new Set(ex.EXERCISE_LIBRARY.map(e => e.primaryMuscle));
  assert(groups.size === 6, [...groups].join(','));
});
t('поиск: "жим" + фильтр chest', () => {
  const s = { exercises: ex.EXERCISE_LIBRARY };
  const r = ex.searchExercises(s, { query: 'жим', muscle: 'chest' });
  assert(r.length >= 4 && r.every(e => e.primaryMuscle === 'chest'));
});

console.log('— store: жизненный цикл —');
let state = store.load(ex.EXERCISE_LIBRARY);
t('load без данных -> дефолтное состояние', () => assert(state.sessions.length === 0 && state.exercises.length === 50));
t('save -> load восстанавливает состояние', () => {
  store.save(state);
  const re = store.load(ex.EXERCISE_LIBRARY);
  assert(re.schemaVersion === 1 && re.exercises.length === 50);
});

console.log('— store: сессия и подходы —');
let session;
({ state, session } = store.startSession(state, 'day-a'));
t('startSession создаёт сессию с weekNo из мезоцикла', () => assert(session.weekNo === 1 && state.sessions.length === 1));

let set;
({ state, set } = store.logSet(state, session.id, { exerciseId: 'bb-bench-press', setNo: 1, weight: 60, reps: 10, rir: 2 }));
t('logSet добавляет подход', () => assert(state.sessions[0].sets.length === 1 && set.weight === 60));
t('logSet: поля задела v2 присутствуют', () => assert(set.analysis === null && set.mediaRef === null));
t('logSet отклоняет мусор', () => {
  let threw = false;
  try { store.logSet(state, session.id, { exerciseId: 'x', setNo: 2, weight: 'abc', reps: 0 }); } catch (_) { threw = true; }
  assert(threw);
});

state = store.updateSet(state, set.id, { weight: 62.5, note: 'инъекция запрещённого поля' });
t('updateSet правит вес и фильтрует чужие поля', () => {
  const st = state.sessions[0].sets[0];
  assert(st.weight === 62.5 && !('note' in st === false ? false : st.note === undefined || true));
  assert(st.weight === 62.5 && st.note === undefined);
});

console.log('— store: история —');
({ state } = store.logSet(state, session.id, { exerciseId: 'bb-bench-press', setNo: 2, weight: 62.5, reps: 9, rir: 2 }));
({ state } = store.logSet(state, session.id, { exerciseId: 'bb-bench-press', setNo: 3, weight: 40, reps: 15, rir: 4, isCalibration: true }));
t('exerciseHistory исключает калибровочные по умолчанию', () => {
  const h = store.exerciseHistory(state, 'bb-bench-press');
  assert(h.length === 1 && h[0].sets.length === 2);
});
t('exerciseHistory включает калибровочные по флагу', () => {
  const h = store.exerciseHistory(state, 'bb-bench-press', { includeCalibration: true });
  assert(h[0].sets.length === 3);
});

console.log('— store: бэкап —');
t('export -> import цикл сохраняет данные', () => {
  const b = store.exportBackup(state);
  const restored = store.importBackup(b.json);
  assert(restored.sessions[0].sets.length === 3 && b.filename.startsWith('workout-backup-'));
});
t('import отклоняет мусор', () => {
  let threw = false;
  try { store.importBackup('{"hello": 1}'); } catch (_) { threw = true; }
  assert(threw);
});
t('backupOverdue: после 3 тренировок без бэкапа -> true', () => {
  let s2 = store.defaultState(ex.EXERCISE_LIBRARY);
  assert(store.backupOverdue(s2) === false);
  for (let i = 0; i < 3; i++) ({ state: s2 } = store.startSession(s2, 'day-a'));
  assert(store.backupOverdue(s2) === true);
});
t('повреждённый localStorage -> чистый старт + аварийная копия', () => {
  localStorage.setItem(store.STORAGE_KEY, '{broken json');
  const s3 = store.load(ex.EXERCISE_LIBRARY);
  assert(s3.sessions.length === 0);
  assert(localStorage.getItem(store.STORAGE_KEY + '.corrupt') === '{broken json');
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
