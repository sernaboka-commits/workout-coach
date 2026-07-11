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

/* ============================================================
 * Бег (v2). Методология: Дэниелс (типы тренировок), Сейлер 80/20
 * (поляризация: ≥75–80% времени — лёгкая интенсивность), правило
 * ~10% недельного прироста объёма.
 * ============================================================ */

const RUN_TYPES = {
  recovery: { label: 'Восстановительный', hard: false },
  easy:     { label: 'Лёгкий',            hard: false },
  long:     { label: 'Длинный',           hard: false },
  tempo:    { label: 'Темповый',          hard: true },
  interval: { label: 'Интервалы',         hard: true },
  reps:     { label: 'Повторы/спринты',   hard: true },
};

/** Темп, сек/км. */
function paceSecKm(distanceKm, durationSec) {
  return durationSec / distanceKm;
}

/** Сек/км → "м:сс". */
function fmtPace(sec) {
  if (!isFinite(sec) || sec <= 0) return '–';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Недельный ряд: последние weeks недель (включая текущую, старые первыми).
 *  → [{ weekStart, km, easyMin, hardMin }] */
function runWeeklySeries(state, { weeks = 8, now = new Date() } = {}) {
  const out = [];
  const cur = startOfWeek(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(cur); start.setUTCDate(start.getUTCDate() - i * 7);
    out.push({ weekStart: start.toISOString().slice(0, 10), _ms: start.getTime(), km: 0, easyMin: 0, hardMin: 0 });
  }
  for (const r of state.runs || []) {
    const ms = startOfWeek(new Date(r.date)).getTime();
    const w = out.find((x) => x._ms === ms);
    if (!w) continue;
    w.km += r.distanceKm;
    const min = r.durationSec / 60;
    if (RUN_TYPES[r.type] && RUN_TYPES[r.type].hard) w.hardMin += min; else w.easyMin += min;
  }
  return out.map(({ _ms, ...w }) => ({ ...w, km: +w.km.toFixed(1) }));
}

/** Ряд темпа лёгких пробежек (recovery/easy/long), по возрастанию даты. */
function easyPaceSeries(state) {
  return (state.runs || [])
    .filter((r) => RUN_TYPES[r.type] && !RUN_TYPES[r.type].hard)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((r) => ({ date: r.date, pace: +paceSecKm(r.distanceKm, r.durationSec).toFixed(1), hr: r.avgHr }));
}

/** Доля интенсивного времени за окно (80/20 Сейлера).
 *  → { easyMin, hardMin, hardPct, sessions, status } */
function hardSharePct(state, { days = 28, now = new Date() } = {}) {
  const fromMs = now.getTime() - days * 86400000;
  let easyMin = 0, hardMin = 0, sessions = 0;
  for (const r of state.runs || []) {
    if (new Date(r.date).getTime() < fromMs) continue;
    sessions++;
    const min = r.durationSec / 60;
    if (RUN_TYPES[r.type] && RUN_TYPES[r.type].hard) hardMin += min; else easyMin += min;
  }
  const total = easyMin + hardMin;
  const hardPct = total > 0 ? Math.round((hardMin / total) * 100) : 0;
  // статус имеет смысл при ≥3 пробежках; порог 25% — мягкая граница 80/20
  const status = sessions < 3 ? 'na' : hardPct <= 25 ? 'ok' : 'high';
  return { easyMin: Math.round(easyMin), hardMin: Math.round(hardMin), hardPct, sessions, status };
}

/** Правило ~10%: резкий рост объёма прошлой недели к позапрошлой. */
function rampWarning(prevKm, lastKm) {
  return prevKm >= 5 && lastKm > prevKm * 1.1;
}

/* ---------- пульсовые зоны ----------
 * 5 зон. С пульсом покоя — метод Карвонена (резерв ЧСС, самый
 * индивидуальный); без него — доля от ЧССmax. Оценка ЧССmax по
 * Танаке (208 − 0.7·возраст) точнее классической 220−возраст.
 */
const HR_ZONES = [
  { n: 1, name: 'Восстановление', lo: 0.50, hi: 0.60, use: 'восстановит. бег, разминка' },
  { n: 2, name: 'Аэробная база',  lo: 0.60, hi: 0.70, use: 'лёгкий/длинный (основа объёма)' },
  { n: 3, name: 'Темповая',       lo: 0.70, hi: 0.80, use: 'темповый, «комфортно тяжело»' },
  { n: 4, name: 'Порог (ПАНО)',   lo: 0.80, hi: 0.90, use: 'пороговые, длинные интервалы' },
  { n: 5, name: 'МПК (VO2max)',   lo: 0.90, hi: 1.00, use: 'короткие интервалы, повторы' },
];

/* целевые зоны по типу пробежки — для подсказки о несоответствии */
const RUN_ZONE_TARGET = {
  recovery: [1, 2], easy: [1, 3], long: [2, 3], tempo: [3, 4], interval: [4, 5], reps: [4, 5],
};

function hrMaxTanaka(age) {
  return Math.round(208 - 0.7 * Number(age));
}

/** ЧСС для доли интенсивности: Карвонен при наличии пульса покоя. */
function hrTarget(pct, hrMax, hrRest) {
  return Math.round(hrRest ? hrRest + pct * (hrMax - hrRest) : pct * hrMax);
}

/** Таблица зон в ударах/мин. → [{ n, name, lo, hi, use }] или null. */
function hrZones({ hrMax, hrRest } = {}) {
  if (!(hrMax > 0)) return null;
  const rest = hrRest > 0 ? hrRest : 0;
  return HR_ZONES.map((z) => ({ n: z.n, name: z.name, use: z.use, lo: hrTarget(z.lo, hrMax, rest), hi: hrTarget(z.hi, hrMax, rest) }));
}

/** Номер зоны (1–5) для конкретного пульса. */
function hrZoneFor(hr, cfg) {
  const zs = hrZones(cfg);
  if (!zs || !(hr > 0)) return null;
  for (const z of zs) if (hr <= z.hi) return z.n;
  return 5;
}

/** Подсказка, если фактическая зона не совпала с типом пробежки. */
function zoneAdvice(type, zone) {
  const t = RUN_ZONE_TARGET[type];
  if (!t || !zone) return '';
  if (zone < t[0]) return 'легче, чем задумано';
  if (zone > t[1]) return 'интенсивнее, чем нужно для этого типа';
  return '';
}

/* Назначение и ориентиры по каждому типу (для цели перед тренировкой). */
const RUN_TYPE_INFO = {
  recovery: { zone: [1, 2], rpe: '2–3',  goal: 'Активное восстановление: разгон кровотока между тяжёлыми днями, без нагрузки.', howto: 'Очень легко и коротко, разговорный темп, никаких ускорений.' },
  easy:     { zone: [1, 3], rpe: '3–4',  goal: 'Аэробная база: капилляры, митохондрии, экономичность — фундамент объёма (80/20).', howto: 'Комфортный разговорный темп. Должно быть легче, чем кажется нужным.' },
  long:     { zone: [2, 3], rpe: '4–5',  goal: 'Выносливость и жировой обмен: увеличиваем время на ногах.', howto: 'Ровный лёгкий темп, последнюю треть не разгоняйся.' },
  tempo:    { zone: [3, 4], rpe: '7–8',  goal: 'Лактатный порог (ПАНО): сдвигаем порог — «комфортно тяжело».', howto: '20–40 мин непрерывно или блоки по 8–15 мин у порога.' },
  interval: { zone: [4, 5], rpe: '8–9',  goal: 'МПК (VO2max): поднимаем аэробный потолок.', howto: 'Отрезки 3–5 мин в Z4–Z5, отдых равный или чуть короче (напр. 5×3 мин).' },
  reps:     { zone: [4, 5], rpe: '9–10', goal: 'Скорость и экономичность, нейромышечность.', howto: 'Короткие быстрые отрезки (10–30 с) с ПОЛНЫМ восстановлением. Качество, не усталость.' },
};

/**
 * Цель на сегодняшнюю пробежку данного типа (перед тренировкой):
 * назначение, целевая зона/пульс/RPE и конкретный ориентир прогрессии
 * от прошлой такой пробежки.
 * → { goal, howto, rpe, zoneLabel, zoneBpm, progress, lever } | null
 */
function runTarget(type, lastRun, cfg) {
  const info = RUN_TYPE_INFO[type];
  if (!info) return null;
  const zones = hrZones(cfg);
  let zoneBpm = null;
  if (zones) {
    const lo = zones.find((z) => z.n === info.zone[0]);
    const hi = zones.find((z) => z.n === info.zone[1]);
    if (lo && hi) zoneBpm = `${lo.lo}–${hi.hi} уд`;
  }
  const adv = lastRun ? runTypeAdvice(lastRun, cfg) : null;
  return {
    goal: info.goal, howto: info.howto, rpe: info.rpe,
    zoneLabel: info.zone[0] === info.zone[1] ? `Z${info.zone[0]}` : `Z${info.zone[0]}–Z${info.zone[1]}`,
    zoneBpm,
    progress: adv ? adv.text : 'первая пробежка этого типа — задай базовый ориентир и запиши',
    lever: adv ? adv.lever : null,
  };
}

/**
 * Интенсивность пробежки как номер зоны 1–5: по пульсу (если есть),
 * иначе по RPE, иначе null.
 */
function intensityZone(run, cfg) {
  if (run.avgHr && cfg && cfg.hrMax) { const z = hrZoneFor(run.avgHr, cfg); if (z) return z; }
  if (run.rpe) { const r = Number(run.rpe); return r <= 4 ? 2 : r <= 6 ? 3 : r <= 8 ? 4 : 5; }
  return null;
}

/**
 * Рекомендация на СЛЕДУЮЩУЮ пробежку этого типа — один рычаг.
 * Методология: Дэниелс (типы), Сейлер 80/20 (лёгкое — реально лёгким),
 * прогрессия объёма ~10%/нед, интервалы — рост отрезков/темпа.
 * → { lever:'distance'|'duration'|'reps'|'pace'|'hold', text } | null
 */
function runTypeAdvice(run, cfg) {
  if (!run || !RUN_TYPES[run.type]) return null;
  const type = run.type;
  const km = Number(run.distanceKm);
  const min = Math.round(Number(run.durationSec) / 60);
  const zone = intensityZone(run, cfg);
  const [, hi] = RUN_ZONE_TARGET[type];
  const tooHard = (zone != null && zone > hi) || (run.rpe != null && Number(run.rpe) >= 9);
  const newKm = Math.round(km * 1.1 * 10) / 10;
  const zTxt = zone != null ? ` (Z${zone})` : '';

  if (type === 'recovery') {
    return tooHard
      ? { lever: 'pace', text: `пульс был высоковат${zTxt} — в след. раз медленнее, это восстановление (Z1–Z2)` }
      : { lever: 'hold', text: `держи коротко и очень легко — восстановительные не прогрессируют по нагрузке` };
  }
  if (type === 'easy') {
    return tooHard
      ? { lever: 'pace', text: `лёгкий ушёл в Z${zone} — в след. раз медленнее (Z1–Z2), дистанция та же` }
      : { lever: 'distance', text: `темп ок — добавь ~10% дистанции (${km}→${newKm} км), не ускоряясь` };
  }
  if (type === 'long') {
    return tooHard
      ? { lever: 'pace', text: `длинный шёл быстровато${zTxt} — в след. раз спокойнее, аэробно` }
      : { lever: 'duration', text: `выносливость: +1–2 км или +5–10 мин (сейчас ${km} км / ${min} мин), темп лёгкий` };
  }
  if (type === 'tempo') {
    return tooHard
      ? { lever: 'hold', text: `было жёстко${zTxt} — повтори тот же темп/время, пока не ускоряйся` }
      : { lever: 'duration', text: `порог: добавь ~5 мин у порога или чуть быстрее (сейчас ${min} мин)` };
  }
  if (type === 'interval') {
    return tooHard
      ? { lever: 'hold', text: `было очень тяжело — повтори тот же объём отрезков` }
      : { lever: 'reps', text: `МПК: добавь 1 отрезок или сократи отдых, темп держи` };
  }
  if (type === 'reps') {
    return tooHard
      ? { lever: 'hold', text: `держи качество скорости — повтори тот же объём` }
      : { lever: 'reps', text: `добавь 1 ускорение при ПОЛНОМ восстановлении — следи за скоростью, не усталостью` };
  }
  return null;
}

/* ---------- календарь тренировок (силовые + бег на одной сетке) ---------- */

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Сетка месяца 6×7 (Пн-первый). Каждая ячейка:
 * { date, dayNum, inMonth, workoutSets, runs:[{type,hard,km}], plannedLabel }
 * month — 0..11.
 */
function monthGrid(state, { year, month }) {
  const first = new Date(Date.UTC(year, month, 1));
  const startIdx = (first.getUTCDay() + 6) % 7;                 // Пн = 0
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - startIdx);

  const sesByDate = {}, runByDate = {};
  for (const s of state.sessions || []) {
    const k = String(s.date).slice(0, 10);
    const n = (s.sets || []).filter((x) => !x.isCalibration).length;
    if (n) sesByDate[k] = (sesByDate[k] || 0) + n;
  }
  for (const r of state.runs || []) {
    const k = String(r.date).slice(0, 10);
    (runByDate[k] = runByDate[k] || []).push({ type: r.type, hard: !!(RUN_TYPES[r.type] && RUN_TYPES[r.type].hard), km: r.distanceKm });
  }
  const plannedByWd = {};
  for (const d of (state.program && state.program.days) || []) if (d.weekday != null) plannedByWd[d.weekday] = d.label;
  const plannedRunByWd = state.runPlan || {};

  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(gridStart);
      cur.setUTCDate(gridStart.getUTCDate() + w * 7 + d);
      const k = cur.toISOString().slice(0, 10);
      row.push({
        date: k, dayNum: cur.getUTCDate(), inMonth: cur.getUTCMonth() === month,
        workoutSets: sesByDate[k] || 0, runs: runByDate[k] || [],
        plannedLabel: plannedByWd[d] || null, plannedRun: plannedRunByWd[d] || null,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

if (typeof module !== 'undefined') {
  module.exports = {
    e1rm, bestE1rm, e1rmSeries, weeklyVolume, stagnation,
    startOfWeek, weekKey, MUSCLE_ORDER, VOLUME_CORRIDOR,
    RUN_TYPES, paceSecKm, fmtPace, runWeeklySeries, easyPaceSeries, hardSharePct, rampWarning,
    HR_ZONES, RUN_ZONE_TARGET, hrMaxTanaka, hrZones, hrZoneFor, zoneAdvice,
    intensityZone, runTypeAdvice, RUN_TYPE_INFO, runTarget,
    WEEKDAY_SHORT, monthGrid,
  };
}
