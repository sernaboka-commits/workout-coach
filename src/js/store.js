/* ============================================================
 * store.js — слой хранения (единственная точка чтения/записи)
 * Контракт (аналоги endpoints):
 *   load()                        GET  /state
 *   save(state)                   PUT  /state
 *   exportBackup(state)           GET  /backup   -> {filename, json}
 *   importBackup(json)            POST /backup   -> state | throws
 *   startSession(state, dayId)    POST /sessions
 *   logSet(state, sessionId, s)   POST /sessions/:id/sets
 *   updateSet(state, setId, p)    PATCH /sets/:id
 *   deleteSet(state, setId)       DELETE /sets/:id
 * Все мутирующие функции: принимают state, возвращают новый state,
 * вызывающий обязан затем сделать save(). UI в state напрямую не пишет.
 * ============================================================ */

const STORAGE_KEY = 'workoutCoach.v1';
const SCHEMA_VERSION = 2;   // v2: + runs[] (беговые тренировки)

/* ---------- дефолтное состояние ---------- */

function defaultState(exerciseLibrary) {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      weightStepDefault: 2.5,
      backupReminderDays: 14,
      lastBackupAt: null,
      age: null,          // для оценки ЧССmax (v2)
      hrMax: null,        // пульс макс, уд/мин
      hrRest: null,       // пульс покоя, уд/мин (метод Карвонена)
    },
    exercises: exerciseLibrary.map((e) => ({ ...e, isCustom: false })),
    program: { days: [] },          // конструктор заполнит A/B/C
    sessions: [],
    runs: [],                       // беговые тренировки (v2)
    runPlan: {},                    // план бега: weekday(0=Пн..6=Вс) -> тип
    mesocycle: {
      cycleNo: 1,
      weekNo: 1,                    // 1..6 (6 = делоуд при growWeeks=5)
      growWeeks: 5,
      startedAt: new Date().toISOString(),
      deloadShift: 0,               // ручной сдвиг делоуда ±1 (риск из PRD)
    },
  };
}

/* ---------- миграции ---------- */

const MIGRATIONS = {
  // 1 -> 2: добавлены беговые тренировки
  1: (s) => ({ ...s, schemaVersion: 2, runs: Array.isArray(s.runs) ? s.runs : [] }),
};

function migrate(state) {
  let s = state;
  while (s.schemaVersion < SCHEMA_VERSION) {
    const fn = MIGRATIONS[s.schemaVersion];
    if (!fn) throw new Error(`Нет миграции со схемы v${s.schemaVersion}`);
    s = fn(s);
  }
  return s;
}

/* ---------- load / save ---------- */

/** Синхронизация встроенной библиотеки со старым состоянием:
 *  - у встроенных упражнений обновляем определение из кода (название,
 *    флаги вроде bodyweight, шаг веса) — так правки библиотеки доезжают;
 *  - пользовательские (isCustom) не трогаем;
 *  - недостающие встроенные добавляем. */
function mergeLibrary(state, exerciseLibrary) {
  const byId = {};
  for (const e of exerciseLibrary || []) byId[e.id] = e;
  const refreshed = state.exercises.map((e) =>
    e.isCustom || !byId[e.id] ? e : { ...byId[e.id], isCustom: false }
  );
  const have = new Set(refreshed.map((e) => e.id));
  for (const e of exerciseLibrary || []) if (!have.has(e.id)) refreshed.push({ ...e, isCustom: false });
  return { ...state, exercises: refreshed };
}

function load(exerciseLibrary) {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (_) { /* private mode */ }
  if (!raw) return defaultState(exerciseLibrary);
  try {
    const parsed = JSON.parse(raw);
    validateState(parsed);
    return mergeLibrary(migrate(parsed), exerciseLibrary);
  } catch (err) {
    // повреждённое состояние не затираем молча: сохраняем аварийную копию
    try { localStorage.setItem(STORAGE_KEY + '.corrupt', raw); } catch (_) {}
    console.error('Состояние повреждено, старт с чистого. Копия: .corrupt', err);
    return defaultState(exerciseLibrary);
  }
}

function save(state) {
  validateState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

/* ---------- валидация (минимальная, структурная) ---------- */

function validateState(s) {
  const fail = (m) => { throw new Error('Invalid state: ' + m); };
  if (!s || typeof s !== 'object') fail('not an object');
  if (typeof s.schemaVersion !== 'number') fail('schemaVersion');
  if (!Array.isArray(s.exercises)) fail('exercises');
  if (!s.program || !Array.isArray(s.program.days)) fail('program.days');
  if (!Array.isArray(s.sessions)) fail('sessions');
  if (!s.mesocycle || typeof s.mesocycle.weekNo !== 'number') fail('mesocycle');
  if (s.schemaVersion >= 2 && !Array.isArray(s.runs)) fail('runs');
  return true;
}

/* ---------- бэкап ---------- */

function exportBackup(state) {
  const stamped = {
    ...state,
    settings: { ...state.settings, lastBackupAt: new Date().toISOString() },
  };
  const date = new Date().toISOString().slice(0, 10);
  return {
    state: stamped,                                   // сохранить после скачивания
    filename: `workout-backup-${date}.json`,
    json: JSON.stringify(stamped, null, 2),
  };
}

function importBackup(jsonString) {
  const parsed = JSON.parse(jsonString);              // throws при мусоре
  validateState(parsed);
  return migrate(parsed);
}

function backupOverdue(state, now = new Date()) {
  const { lastBackupAt, backupReminderDays } = state.settings;
  if (!lastBackupAt) return state.sessions.length >= 3;   // напоминаем после 3 тренировок
  const ageDays = (now - new Date(lastBackupAt)) / 86400000;
  return ageDays >= backupReminderDays;
}

/* ---------- id ---------- */

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------- сессии и подходы ---------- */

function startSession(state, dayId, { date = new Date().toISOString(), isDeload = false } = {}) {
  const session = {
    id: genId('ses'),
    date,
    dayId,
    weekNo: state.mesocycle.weekNo,
    isDeload,
    sets: [],
    note: null,
  };
  return { state: { ...state, sessions: [...state.sessions, session] }, session };
}

function logSet(state, sessionId, setInput) {
  const set = {
    id: genId('set'),
    exerciseId: setInput.exerciseId,
    setNo: setInput.setNo,
    weight: Number(setInput.weight),
    reps: Number(setInput.reps),
    rir: setInput.rir == null ? null : Number(setInput.rir),
    isCalibration: !!setInput.isCalibration,
    analysis: null,                 // задел v2: видеоанализ
    mediaRef: null,                 // задел v2
  };
  if (!(set.weight >= 0) || !(set.reps > 0)) throw new Error('Некорректные вес/повторы');
  const sessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, sets: [...s.sets, set] } : s
  );
  if (!sessions.some((s) => s.id === sessionId)) throw new Error('Сессия не найдена: ' + sessionId);
  return { state: { ...state, sessions }, set };
}

function updateSet(state, setId, patch) {
  let found = false;
  const allowed = ['weight', 'reps', 'rir', 'isCalibration'];
  const sessions = state.sessions.map((s) => ({
    ...s,
    sets: s.sets.map((st) => {
      if (st.id !== setId) return st;
      found = true;
      const clean = Object.fromEntries(
        Object.entries(patch).filter(([k]) => allowed.includes(k))
      );
      return { ...st, ...clean };
    }),
  }));
  if (!found) throw new Error('Подход не найден: ' + setId);
  return { ...state, sessions };
}

function deleteSet(state, setId) {
  const sessions = state.sessions.map((s) => ({
    ...s,
    sets: s.sets.filter((st) => st.id !== setId),
  }));
  return { ...state, sessions };
}

/* ---------- выборки истории (для engine и UI) ---------- */

/** Все подходы упражнения, сгруппированные по сессиям, новые первыми */
function exerciseHistory(state, exerciseId, { includeCalibration = false, limit = 10 } = {}) {
  const out = [];
  const sessions = [...state.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const ses of sessions) {
    const sets = ses.sets.filter(
      (st) => st.exerciseId === exerciseId && (includeCalibration || !st.isCalibration)
    );
    if (sets.length) out.push({ sessionId: ses.id, date: ses.date, isDeload: ses.isDeload, weekNo: ses.weekNo, sets });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- программа: дни A/B/C и их упражнения ----------
 * Тот же контракт, что у сессий: принимают state, возвращают новый
 * (addDay/addCustomExercise возвращают { state, day|exercise }).
 * DayTemplate = { id, label, items: [DayItem] }
 * DayItem = { exerciseId, repRangeMin, repRangeMax, workSets, targetRIR, restSec }
 */

function nextDayLabel(days) {
  const used = new Set(days.map((d) => d.label));
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
  return 'День ' + (days.length + 1);
}

function normalizeItem(item) {
  const it = {
    exerciseId: item.exerciseId,
    repRangeMin: Number(item.repRangeMin),
    repRangeMax: Number(item.repRangeMax),
    workSets: Number(item.workSets),
    targetRIR: item.targetRIR == null ? 2 : Number(item.targetRIR),
    restSec: Number(item.restSec),
  };
  if (!it.exerciseId) throw new Error('Нужен exerciseId');
  if (!(it.workSets > 0)) throw new Error('workSets должно быть > 0');
  if (!(it.repRangeMin > 0) || !(it.repRangeMax >= it.repRangeMin)) throw new Error('Некорректный диапазон повторов');
  return it;
}

function mapDay(state, dayId, fn) {
  let found = false;
  const days = state.program.days.map((d) => {
    if (d.id !== dayId) return d;
    found = true;
    return fn(d);
  });
  if (!found) throw new Error('День не найден: ' + dayId);
  return { ...state, program: { ...state.program, days } };
}

function addDay(state, { label, weekday = null } = {}) {
  const day = {
    id: genId('day'),
    label: label || nextDayLabel(state.program.days),
    weekday: weekday == null ? null : Number(weekday),   // 0=Пн … 6=Вс
    items: [],
  };
  return { state: { ...state, program: { ...state.program, days: [...state.program.days, day] } }, day };
}

/** Правка самого дня (метка, день недели). */
function updateDay(state, dayId, patch) {
  const allowed = ['label', 'weekday'];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  return mapDay(state, dayId, (d) => ({ ...d, ...clean }));
}

function deleteDay(state, dayId) {
  return { ...state, program: { ...state.program, days: state.program.days.filter((d) => d.id !== dayId) } };
}

function addDayItem(state, dayId, item) {
  const it = normalizeItem(item);
  return mapDay(state, dayId, (d) => ({ ...d, items: [...d.items, it] }));
}

function updateDayItem(state, dayId, index, patch) {
  const allowed = ['exerciseId', 'repRangeMin', 'repRangeMax', 'workSets', 'targetRIR', 'restSec'];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  return mapDay(state, dayId, (d) => {
    if (index < 0 || index >= d.items.length) throw new Error('Нет элемента #' + index);
    return { ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...clean } : it)) };
  });
}

function removeDayItem(state, dayId, index) {
  return mapDay(state, dayId, (d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }));
}

function moveDayItem(state, dayId, index, dir) {
  return mapDay(state, dayId, (d) => {
    const items = d.items.slice();
    const j = index + dir;
    if (j < 0 || j >= items.length) return d;
    [items[index], items[j]] = [items[j], items[index]];
    return { ...d, items };
  });
}

/* ---------- беговые тренировки (v2) ----------
 * RunLog = { id, date, type, distanceKm, durationSec, avgHr|null,
 *            rpe|null, intervals|null, note|null }
 * type — ключ из RUN_TYPES (analytics.js)
 */

function addRun(state, input) {
  const run = {
    id: genId('run'),
    date: input.date || new Date().toISOString(),
    type: input.type,
    distanceKm: Number(input.distanceKm),
    durationSec: Math.round(Number(input.durationSec)),
    avgHr: input.avgHr ? Number(input.avgHr) : null,
    rpe: input.rpe ? Number(input.rpe) : null,
    intervals: input.intervals || null,
    note: input.note || null,
  };
  if (!run.type) throw new Error('Нужен тип пробежки');
  if (!(run.distanceKm > 0) || !(run.durationSec > 0)) throw new Error('Некорректные дистанция/время');
  return { state: { ...state, runs: [...(state.runs || []), run] }, run };
}

function deleteRun(state, runId) {
  return { ...state, runs: (state.runs || []).filter((r) => r.id !== runId) };
}

/** План бега: назначить тип на день недели (пустой type — снять). */
function setRunPlanDay(state, weekday, type) {
  const plan = { ...(state.runPlan || {}) };
  if (!type) delete plan[weekday]; else plan[weekday] = type;
  return { ...state, runPlan: plan };
}

/** Правка настроек (числовые поля; пустое → null). */
function updateSettings(state, patch) {
  const allowed = ['weightStepDefault', 'backupReminderDays', 'age', 'hrMax', 'hrRest'];
  const clean = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) continue;
    clean[k] = (v === '' || v == null) ? null : Number(v);
  }
  return { ...state, settings: { ...state.settings, ...clean } };
}

/* ---------- пользовательские упражнения ---------- */

function addCustomExercise(state, ex) {
  if (!ex || !ex.name || !ex.name.trim()) throw new Error('Нужно название упражнения');
  const exercise = {
    id: genId('cx'),
    name: ex.name.trim(),
    primaryMuscle: ex.primaryMuscle || 'chest',
    secondaryMuscles: Array.isArray(ex.secondaryMuscles) ? ex.secondaryMuscles : [],
    kind: ex.kind === 'compound' ? 'compound' : 'isolation',
    weightStep: Number(ex.weightStep) || state.settings.weightStepDefault,
    isCustom: true,
  };
  // карта долей по детальным мышцам (см. exercises.js); без неё
  // аналитика возьмёт фолбэк из primaryMuscle/secondaryMuscles
  if (ex.muscles && typeof ex.muscles === 'object') {
    const muscles = {};
    for (const [m, f] of Object.entries(ex.muscles)) {
      const v = Number(f);
      if (v > 0 && v <= 1) muscles[m] = v;
    }
    if (Object.keys(muscles).length) exercise.muscles = muscles;
  }
  return { state: { ...state, exercises: [...state.exercises, exercise] }, exercise };
}

function deleteCustomExercise(state, id) {
  const ex = state.exercises.find((e) => e.id === id);
  if (!ex) throw new Error('Упражнение не найдено');
  if (!ex.isCustom) throw new Error('Встроенные упражнения удалять нельзя');
  return { ...state, exercises: state.exercises.filter((e) => e.id !== id) };
}

if (typeof module !== 'undefined') {
  module.exports = {
    STORAGE_KEY, SCHEMA_VERSION,
    defaultState, load, save, validateState, mergeLibrary,
    exportBackup, importBackup, backupOverdue,
    startSession, logSet, updateSet, deleteSet,
    exerciseHistory, genId,
    nextDayLabel, addDay, updateDay, deleteDay,
    addDayItem, updateDayItem, removeDayItem, moveDayItem,
    addCustomExercise, deleteCustomExercise,
    addRun, deleteRun, setRunPlanDay, updateSettings,
  };
}
