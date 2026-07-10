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
const SCHEMA_VERSION = 1;

/* ---------- дефолтное состояние ---------- */

function defaultState(exerciseLibrary) {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      weightStepDefault: 2.5,
      backupReminderDays: 14,
      lastBackupAt: null,
    },
    exercises: exerciseLibrary.map((e) => ({ ...e, isCustom: false })),
    program: { days: [] },          // конструктор заполнит A/B/C
    sessions: [],
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
  // 1 -> 2: (пример на будущее) (s) => { ...s, schemaVersion: 2 }
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

function load(exerciseLibrary) {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (_) { /* private mode */ }
  if (!raw) return defaultState(exerciseLibrary);
  try {
    const parsed = JSON.parse(raw);
    validateState(parsed);
    return migrate(parsed);
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

if (typeof module !== 'undefined') {
  module.exports = {
    STORAGE_KEY, SCHEMA_VERSION,
    defaultState, load, save, validateState,
    exportBackup, importBackup, backupOverdue,
    startSession, logSet, updateSet, deleteSet,
    exerciseHistory, genId,
  };
}
