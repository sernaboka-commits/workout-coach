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

/**
 * Сколько повторов делать на том же весе, чтобы попасть в целевой RIR.
 * Модель: повторы_до_отказа = сделанные_повторы + фактический_RIR.
 * Целевые повторы = повторы_до_отказа − целевой_RIR, зажатые в диапазон.
 * Именно это чинит «9 повт при RIR 2 → 10 при RIR 3»: 9+2=11 до отказа,
 * при цели RIR 3 → 11−3 = 8 повторов.
 * Если RIR не записан — считаем, что цель была выполнена (повторы не меняем).
 */
function projectReps(refSet, targetRIR, item) {
  const rir = refSet.rir == null ? targetRIR : Number(refSet.rir);
  const rtf = Number(refSet.reps) + rir;                  // повторы до отказа
  const reps = Math.round(rtf - targetRIR);
  return Math.max(item.repRangeMin, Math.min(item.repRangeMax, reps));
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

/**
 * Рекомендация на СЛЕДУЮЩУЮ тренировку по одному упражнению — какой один
 * рычаг двигать (вес / повторы / подходы), для гипертрофии.
 * Методология: двойная прогрессия (Helms/Nippard) + прогрессия объёма
 * MEV→MRV (Israetel/RP) + автрегуляция по RIR.
 * sets — рабочие сеты завершённой сессии по этому упражнению.
 * → { lever:'weight'|'reps'|'sets'|'hold'|'reduce', text, volume } | null
 */
function nextSessionAdvice(sets, item, targetRIR, opts = {}) {
  const work = (sets || []).filter((s) => !s.isCalibration);
  if (!work.length) return null;
  const step = opts.weightStep || 2.5;
  const cap = opts.setsCap || 5;
  const grow = opts.growWeek !== false;            // не перед делоудом

  const weight = Math.max(...work.map((s) => Number(s.weight)));
  const atW = work.filter((s) => Number(s.weight) === weight);
  const topReps = Math.max(...atW.map((s) => Number(s.reps)));
  const minRIR = Math.min(...atW.map((s) => (s.rir == null ? targetRIR : Number(s.rir))));
  const failCount = work.filter((s) => s.rir != null && Number(s.rir) <= 0).length;
  const nSets = work.length;

  let lever, text;
  if (failCount >= 2) {
    lever = 'reduce';
    text = `было ${failCount} подхода до отказа — удержи вес или −${step} кг, объём не добавляй`;
  } else if (topReps >= item.repRangeMax && minRIR >= targetRIR) {
    lever = 'weight';
    text = `+${step} кг и вернись к ${item.repRangeMin} повт (потолок взят с запасом RIR ${minRIR})`;
  } else if (minRIR >= targetRIR) {
    lever = 'reps';
    const goal = Math.max(item.repRangeMin, Math.min(topReps + 1, item.repRangeMax));
    text = `тот же вес — добавь повтор (цель ${goal} при RIR ${targetRIR})`;
  } else if (topReps < item.repRangeMin) {
    lever = 'reduce';
    text = `до отказа лишь ~${topReps + minRIR} повт — вес тяжеловат, −${step} кг`;
  } else {
    lever = 'hold';
    text = `было тяжелее цели (RIR ${minRIR} < ${targetRIR}) — повтори тот же вес, целься в RIR ${targetRIR}`;
  }

  // объём — вторичный рычаг: только при запасе восстановления и не у потолка подходов
  let volume = null;
  if (failCount === 0 && minRIR >= targetRIR && nSets < cap && grow && (lever === 'reps' || lever === 'hold')) {
    volume = `или прибавь 1 рабочий подход (${nSets}→${nSets + 1}) — прогресс объёмом`;
  }
  return { lever, text, volume };
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

  // представительный подход при рабочем весе — с наибольшим числом повторов
  const atWeight = lastWork.filter((s) => s.weight === workWeight);
  const refSet = atWeight.reduce((a, s) => (s.reps > a.reps ? s : a), atWeight[0]);
  const minRir = Math.min(...atWeight.map((s) => (s.rir == null ? targetRIR : Number(s.rir))));
  const rirTxt = refSet.rir != null ? ` RIR ${refSet.rir}` : '';
  const rtf = Number(refSet.reps) + (refSet.rir == null ? targetRIR : Number(refSet.rir));

  // повторный перегруз (RIR 0 в 2+ сетах две сессии подряд) → −5% как страховка
  const overreach = (sess) =>
    !!sess && sess.sets.filter((s) => !s.isCalibration && s.rir === 0).length >= 2;
  if (overreach(last) && overreach(history[1])) {
    const w = roundToStep(workWeight * 0.95, step);
    return {
      weight: w, reps: item.repRangeMin, targetRIR, isDeload: false, needsCalibration: false, lastResult,
      reason: `Повторный перегруз (RIR 0 две сессии) — снижаем 5% (${workWeight}→${w} кг).`,
    };
  }

  // прогрессия веса: потолок повторов достигнут С ЗАПАСОМ (фактический RIR ≥ целевого)
  if (refSet.reps >= item.repRangeMax && minRir >= targetRIR) {
    const w = roundToStep(workWeight + step, step);
    return {
      weight: w, reps: item.repRangeMin, targetRIR, isDeload: false, needsCalibration: false, lastResult,
      reason: `Потолок ${item.repRangeMax} повт при RIR ${refSet.rir} (запас есть) — +${step} кг, назад к ${item.repRangeMin}.`,
    };
  }

  // вес тяжеловат: даже до отказа не выходит нижняя граница при целевом RIR → −шаг
  // (сценарий «13 повт при RIR 0 в диапазоне 10–15, цель RIR 2» → снизить вес)
  if (rtf < item.repRangeMin + targetRIR) {
    const w = roundToStep(workWeight - step, step);
    return {
      weight: w, reps: item.repRangeMin, targetRIR, isDeload: false, needsCalibration: false, lastResult,
      reason: `На ${workWeight} кг до отказа лишь ~${rtf} повт — для ${item.repRangeMin} повт при RIR ${targetRIR} вес тяжеловат. −${step} кг.`,
    };
  }

  // иначе тот же вес; повторы подбираются под целевой RIR (RIR-aware)
  const reps = projectReps(refSet, targetRIR, item);
  return {
    weight: workWeight, reps, targetRIR, isDeload: false, needsCalibration: false, lastResult,
    reason: `Прошлый подход ${refSet.reps}×${workWeight}${rirTxt} → до отказа ~${rtf}. Цель RIR ${targetRIR}: ${reps} повт.`,
  };
}

/* export для node-тестов; в браузере — глобальные объявления */
if (typeof module !== 'undefined') {
  module.exports = {
    roundToStep,
    epley1rm,
    projectReps,
    nextSessionAdvice,
    targetRIRForWeek,
    mesoStatus,
    advanceWeek,
    shiftDeload,
    context,
    calibrate,
    recommend,
  };
}
