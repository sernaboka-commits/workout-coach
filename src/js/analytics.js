/* ============================================================
 * analytics.js — аналитика (чистые функции без DOM)
 * Контракт (аналоги endpoints):
 *   e1rmSeries(state, exerciseId, opts)   GET /analytics/e1rm
 *   weeklyVolume(state, opts)             GET /analytics/volume
 *   stagnation(state, opts)               GET /analytics/stagnation
 *
 * Единообразие e1RM (подтверждено пользователем): одна формула Эпли из
 * engine.js; RIR всегда приводится к повторам до отказа (reps + rir).
 * ============================================================ */

/* engine в node — через require; в браузере epley1rm — глобаль */
var _ANALYTICS_ENGINE = (typeof module !== 'undefined') ? require('./engine.js') : null;

/** Единая точка расчёта e1RM: вес × повторы-до-отказа по Эпли. */
function e1rm(weight, reps, rir) {
  const rtf = Number(reps) + (rir == null ? 0 : Number(rir));
  const fn = _ANALYTICS_ENGINE ? _ANALYTICS_ENGINE.epley1rm : epley1rm;
  return fn(Number(weight), rtf);
}

const MUSCLE_ORDER = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
const VOLUME_CORRIDOR = [10, 20];

/* ---------- недели (UTC, детерминизм независимо от tz) ---------- */

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7;       // Пн = 0
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}
function weekKey(d) {
  return startOfWeek(d).toISOString().slice(0, 10);
}

/* ---------- e1RM: ряд «сессия → лучший e1RM» ---------- */

/** Лучший e1RM среди набора сетов (по одному упражнению). */
function bestE1rm(sets) {
  let best = 0;
  for (const s of sets) {
    const v = e1rm(s.weight, s.reps, s.rir);
    if (v > best) best = v;
  }
  return best;
}

/**
 * Ряд e1RM по сессиям (по возрастанию даты).
 * Точка: { date, weekNo, isDeload, e1rm, isCalibration }.
 * Для тренда берём лучший рабочий сет; если в сессии были только
 * калибровочные — точка помечается isCalibration.
 */
function e1rmSeries(state, exerciseId) {
  const sessions = [...state.sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const out = [];
  for (const ses of sessions) {
    const all = ses.sets.filter((s) => s.exerciseId === exerciseId);
    if (!all.length) continue;
    const work = all.filter((s) => !s.isCalibration);
    const isCal = work.length === 0;
    const best = bestE1rm(isCal ? all : work);
    out.push({
      date: ses.date,
      weekNo: ses.weekNo,
      isDeload: !!ses.isDeload,
      e1rm: +best.toFixed(1),
      isCalibration: isCal,
    });
  }
  return out;
}

/* ---------- недельный объём по мышечным группам ---------- */

/**
 * Число рабочих сетов по primaryMuscle за неделю (weekOffset назад от now).
 * → { weekStart, byMuscle: [{ muscle, count, status }] }
 * status: 'low' (<10) | 'ok' | 'high' (>20).
 */
function weeklyVolume(state, { now = new Date(), weekOffset = 0, corridor = VOLUME_CORRIDOR } = {}) {
  const start = startOfWeek(now);
  start.setUTCDate(start.getUTCDate() - weekOffset * 7);
  const startMs = start.getTime();
  const endMs = startMs + 7 * 86400000;

  const muscleOf = {};
  for (const ex of state.exercises) muscleOf[ex.id] = ex.primaryMuscle;

  const counts = Object.fromEntries(MUSCLE_ORDER.map((m) => [m, 0]));
  for (const ses of state.sessions) {
    const ms = new Date(ses.date).getTime();
    if (ms < startMs || ms >= endMs) continue;
    for (const s of ses.sets) {
      if (s.isCalibration) continue;
      const m = muscleOf[s.exerciseId];
      if (m in counts) counts[m] += 1;
    }
  }

  const [lo, hi] = corridor;
  const byMuscle = MUSCLE_ORDER.map((m) => ({
    muscle: m,
    count: counts[m],
    status: counts[m] < lo ? 'low' : counts[m] > hi ? 'high' : 'ok',
  }));
  return { weekStart: start.toISOString().slice(0, 10), byMuscle };
}

/* ---------- детектор стагнации ---------- */

/**
 * Упражнения без роста e1RM minWeeks+ недель (вне делоуда), с допуском.
 * Стагнация: пик e1RM за последние minWeeks недель не превысил пик
 * предыдущих недель более чем на tolerance (доля).
 * → [{ exerciseId, name, weeks, priorPeak, recentPeak, hint }]
 */
function stagnation(state, { minWeeks = 3, tolerance = 0.01, now = new Date() } = {}) {
  const out = [];
  for (const ex of state.exercises) {
    const series = e1rmSeries(state, ex.id).filter((p) => !p.isCalibration && !p.isDeload);
    if (series.length < 2) continue;

    // максимум e1RM по неделям, по возрастанию
    const byWeek = new Map();
    for (const p of series) {
      const k = weekKey(new Date(p.date));
      byWeek.set(k, Math.max(byWeek.get(k) || 0, p.e1rm));
    }
    const weeks = [...byWeek.keys()].sort().map((k) => byWeek.get(k));
    if (weeks.length < minWeeks + 1) continue;   // нужна база + окно наблюдения

    const recent = weeks.slice(-minWeeks);
    const prior = weeks.slice(0, -minWeeks);
    const priorPeak = Math.max(...prior);
    const recentPeak = Math.max(...recent);

    if (recentPeak <= priorPeak * (1 + tolerance)) {
      out.push({
        exerciseId: ex.id,
        name: ex.name,
        weeks: minWeeks,
        priorPeak: +priorPeak.toFixed(1),
        recentPeak: +recentPeak.toFixed(1),
        hint: `e1RM не растёт ${minWeeks}+ нед. Гипотеза (не директива): сменить вариацию, проверить объём/сон/питание.`,
      });
    }
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = {
    e1rm, bestE1rm, e1rmSeries, weeklyVolume, stagnation,
    startOfWeek, weekKey, MUSCLE_ORDER, VOLUME_CORRIDOR,
  };
}
