/* ============================================================
 * engine.js — движок прогрессии (чистые функции, без DOM)
 * Контракт (аналоги endpoints):
 *   recommend(exerciseId, setNo, ctx)  GET  /recommendation
 *   calibrate(probeSet, ctx)           POST /calibration
 *   mesoStatus(state)                  GET  /mesocycle
 *   advanceWeek(state, opts)           POST /mesocycle/advance
 *   shiftDeload(state, delta)          POST /mesocycle/shift
 *   context(state, exerciseId, item)   helper: собирает ctx из state
 *
 * ctx для recommend: { meso, item, exercise, history }
 *   meso     — результат mesoStatus(state)
 *   item     — элемент DayTemplate: { repRangeMin, repRangeMax, workSets, targetRIR, restSec }
 *   exercise — { weightStep, ... } из библиотеки
 *   history  — store.exerciseHistory(...) (новые первыми, без калибровок)
 *
 * Все функции чистые: не пишут в store, не трогают DOM. Мутирующие
 * (advanceWeek/shiftDeload) принимают state и возвращают новый state.
 *
 * Параметры движка зафиксированы в CLAUDE.md:
 *   - RIR-рампа: нед.1→3, нед.2–3→2, нед.4–5→1, делоуд→4
 *   - Перегруз: RIR 0 в 2+ сетах → удержание; повторно → −5%
 *   - Делоуд: 60% рабочего веса, 50% сетов
 *   - Прогрессия: все сеты у потолка повторов → +1 шаг веса, возврат к низу
 *   - Калибровка: разведочный подход → проекция по Эпли → контрольный подход
 * ============================================================ */

/* ---------- утилиты ---------- */

/** Округление веса к сетке шага (nearest | floor | ceil). */
function roundToStep(weight, step, mode = 'nearest') {
  if (!step || step <= 0) return weight;
  const n = weight / step;
  const r = mode === 'floor' ? Math.floor(n) : mode === 'ceil' ? Math.ceil(n) : Math.round(n);
  return +(r * step).toFixed(3);
}

/** Оценка 1ПМ по Эпли из подхода до отказа (reps = повторы до отказа). */
function epley1rm(weight, repsToFailure) {
  return weight * (1 + repsToFailure / 30);
}

/** Целевой RIR недели роста (без делоуда). Рампа масштабируется под growWeeks. */
function targetRIRForWeek(weekNo, growWeeks) {
  // нед.1 → RIR 3; следующая треть → RIR 2; последние две пятых → RIR 1
  if (weekNo <= Math.ceil(growWeeks * 0.2)) return 3;   // gw=5: нед.1
  if (weekNo <= Math.ceil(growWeeks * 0.6)) return 2;   // gw=5: нед.2–3
  return 1;                                             // gw=5: нед.4–5
}

/** Краткое текстовое описание результатов сессии для UI/причины. */
function summarize(sets) {
  return {
    sets: sets.map((s) => ({ weight: s.weight, reps: s.reps, rir: s.rir })),
    text: sets
      .map((s) => `${s.weight}×${s.reps}${s.rir != null ? ' RIR' + s.rir : ''}`)
      .join(', '),
  };
}

/* ---------- мезоцикл ---------- */

function mesoStatus(state) {
  const m = state.mesocycle;
  const growWeeks = m.growWeeks || 5;
  const deloadShift = m.deloadShift || 0;
  const deloadWeek = growWeeks + 1 + deloadShift;
  const isDeload = m.weekNo >= deloadWeek;
  const targetRIR = isDeload ? 4 : targetRIRForWeek(m.weekNo, growWeeks);
  return { cycleNo: m.cycleNo, weekNo: m.weekNo, growWeeks, deloadShift, deloadWeek, isDeload, targetRIR };
}

/** Переход на следующую неделю; после делоуда — новый цикл (weekNo=1). */
function advanceWeek(state, { now = new Date() } = {}) {
  const m = state.mesocycle;
  const growWeeks = m.growWeeks || 5;
  const deloadWeek = growWeeks + 1 + (m.deloadShift || 0);
  if (m.weekNo >= deloadWeek) {
    return {
      ...state,
      mesocycle: { ...m, cycleNo: m.cycleNo + 1, weekNo: 1, deloadShift: 0, startedAt: now.toISOString() },
    };
  }
  return { ...state, mesocycle: { ...m, weekNo: m.weekNo + 1 } };
}

/** Ручной сдвиг делоуда ±1 неделя (риск из PRD). Клампится к [-1, +1]. */
function shiftDeload(state, delta) {
  const cur = state.mesocycle.deloadShift || 0;
  const next = Math.max(-1, Math.min(1, cur + delta));
  return { ...state, mesocycle: { ...state.mesocycle, deloadShift: next } };
}

/* ---------- сбор контекста из state ---------- */

/**
 * Собирает ctx для recommend из полного state.
 * exerciseHistory — функция store.exerciseHistory (инъекция, чтобы не тянуть store).
 */
function context(state, exerciseId, item, exerciseHistoryFn) {
  const meso = mesoStatus(state);
  const exercise = state.exercises.find((e) => e.id === exerciseId) || { weightStep: state.settings.weightStepDefault };
  const history = exerciseHistoryFn
    ? exerciseHistoryFn(state, exerciseId, { includeCalibration: false, limit: 10 })
    : [];
  return { meso, item, exercise, history };
}

/* ---------- калибровка нового упражнения ---------- */

/**
 * Проекция рабочего веса из разведочного подхода по Эпли.
 * probeSet: { weight, reps, rir } — не до отказа (reps до отказа = reps + rir).
 * ctx: { targetReps, targetRIR, weightStep }
 * → { weight, e1rm, confidence, targetReps, targetRIR, reason }
 */
function calibrate(probeSet, ctx) {
  const targetReps = ctx.targetReps;
  const targetRIR = ctx.targetRIR == null ? 2 : ctx.targetRIR;
  const step = ctx.weightStep || 2.5;

  const probeEff = Number(probeSet.reps) + Number(probeSet.rir == null ? 0 : probeSet.rir);
  const e1rm = epley1rm(Number(probeSet.weight), probeEff);
  const targetEff = targetReps + targetRIR;
  const raw = e1rm / (1 + targetEff / 30);
  const weight = roundToStep(raw, step);

  // уверенность падает с ростом дистанции экстраполяции и вне окна 10–15 повторов
  let confidence = 0.9 - Math.abs(probeEff - targetEff) * 0.03;
  if (probeSet.reps < 8 || probeSet.reps > 18) confidence -= 0.2;
  confidence = Math.max(0.3, Math.min(0.95, confidence));

  return {
    weight,
    e1rm: +e1rm.toFixed(1),
    confidence: +confidence.toFixed(2),
    targetReps,
    targetRIR,
    reason: `Проекция по Эпли: e1RM≈${e1rm.toFixed(1)} кг → ${weight} кг под ${targetReps}×RIR${targetRIR}. Подтверди контрольным подходом.`,
  };
}

/* ---------- рекомендация на подход ---------- */

/**
 * Рекомендация веса/повторов/RIR на следующий подход.
 * → { weight, reps, targetRIR, reason, isDeload, needsCalibration, lastResult }
 * weight === null при needsCalibration (истории нет).
 */
function recommend(exerciseId, setNo, ctx) {
  const { meso, item, exercise } = ctx;
  const step = exercise.weightStep || 2.5;
  const targetRIR = meso.targetRIR;

  // сессии с рабочими (не калибровочными) сетами, без делоуда, новые первыми
  const history = (ctx.history || []).filter(
    (h) => !h.isDeload && h.sets.some((s) => !s.isCalibration)
  );

  // нет истории → режим калибровки
  if (history.length === 0) {
    return {
      weight: null,
      reps: item.repRangeMin,
      targetRIR,
      isDeload: meso.isDeload,
      needsCalibration: true,
      lastResult: null,
      reason: 'Нет истории по упражнению — нужна калибровка (разведочный подход).',
    };
  }

  const last = history[0];
  const lastWork = last.sets.filter((s) => !s.isCalibration);
  const workWeight = Math.max(...lastWork.map((s) => s.weight));
  const lastResult = summarize(lastWork);

  // делоуд: 60% рабочего веса, низ диапазона; число сетов (50%) решает UI
  if (meso.isDeload) {
    const w = roundToStep(workWeight * 0.6, step);
    return {
      weight: w,
      reps: item.repRangeMin,
      targetRIR,
      isDeload: true,
      needsCalibration: false,
      lastResult,
      reason: `Делоуд: 60% рабочего веса (${workWeight}→${w} кг), половина сетов, RIR ${targetRIR}.`,
    };
  }

  // перегруз: RIR 0 в 2+ рабочих сетах сессии
  const overreach = (sess) =>
    !!sess && sess.sets.filter((s) => !s.isCalibration && s.rir === 0).length >= 2;
  const lastOver = overreach(last);
  const prevOver = overreach(history[1]);

  // повторный перегруз (две сессии подряд) → −5%
  if (lastOver && prevOver) {
    const w = roundToStep(workWeight * 0.95, step); // nearest: ближе к целевым −5%, чем floor
    return {
      weight: w,
      reps: item.repRangeMin,
      targetRIR,
      isDeload: false,
      needsCalibration: false,
      lastResult,
      reason: `Повторный перегруз (RIR 0) — снижаем 5% (${workWeight}→${w} кг).`,
    };
  }

  // одиночный перегруз → удержание веса
  if (lastOver) {
    return {
      weight: workWeight,
      reps: item.repRangeMax,
      targetRIR,
      isDeload: false,
      needsCalibration: false,
      lastResult,
      reason: 'Фактическое усилие выше целевого (RIR 0) — закрепляем вес.',
    };
  }

  // двойная прогрессия: все рабочие сеты у потолка повторов → +шаг веса, возврат к низу
  const allCeiling = lastWork.length > 0 && lastWork.every((s) => s.reps >= item.repRangeMax);
  if (allCeiling) {
    const w = roundToStep(workWeight + step, step);
    return {
      weight: w,
      reps: item.repRangeMin,
      targetRIR,
      isDeload: false,
      needsCalibration: false,
      lastResult,
      reason: `Все сеты у потолка (${item.repRangeMax}) — +${step} кг, возврат к ${item.repRangeMin} повт.`,
    };
  }

  // иначе — тот же вес, добавляем повторы (цель — потолок диапазона)
  const maxReps = Math.max(...lastWork.map((s) => s.reps));
  const targetReps = Math.min(Math.max(maxReps + 1, item.repRangeMin), item.repRangeMax);
  return {
    weight: workWeight,
    reps: targetReps,
    targetRIR,
    isDeload: false,
    needsCalibration: false,
    lastResult,
    reason: `Двойная прогрессия — тот же вес, цель +повторы (до ${item.repRangeMax}).`,
  };
}

/* export для node-тестов; в браузере — глобальные объявления */
if (typeof module !== 'undefined') {
  module.exports = {
    roundToStep,
    epley1rm,
    targetRIRForWeek,
    mesoStatus,
    advanceWeek,
    shiftDeload,
    context,
    calibrate,
    recommend,
  };
}
