/* ============================================================
 * program-gen.js — генератор программы (чистые функции, без DOM)
 * Контракт: generateProgram(opts, library) → { days, note }
 *   opts: { sex:'m'|'f', goal:'hypertrophy'|'strength'|'fitness',
 *           daysPerWeek:2..5, minutes:45|60|90, split:'auto'|'full'|'split' }
 *   days: [{ key, label, items:[DayItem], estMinutes }]
 *
 * Заложенные принципы (evidence-based, мета-анализы Schoenfeld et al.,
 * рекомендации Israetel/RP, Helms, Nippard):
 *   - объём 10–20 рабочих сетов на группу в неделю, частота ≥2×/нед
 *   - работа близко к отказу (RIR 1–3 — рампу ведёт движок мезоцикла)
 *   - гипертрофия: база 6–10 повт, изоляция 10–15; сила: 3–6; тонус: 10–20
 *   - отдых: база 2–3.5 мин, изоляция ~1.5 мин
 *   - приоритет упражнениям с нагрузкой в растянутой позиции
 *     (наклонный жим, румынская тяга, сгибания лёжа, французский из-за головы)
 *   - пол меняет акцент отбора, не принципы: Ж — ноги/ягодичные/дельты,
 *     М — грудь/руки/плечи (физиология роста одинакова)
 * ============================================================ */

/* ---------- параметры по цели ---------- */

const GEN_GOALS = {
  hypertrophy: {
    label: 'Гипертрофия',
    compound:  { min: 6,  max: 10, rest: 180, sets: 3 },
    isolation: { min: 10, max: 15, rest: 90,  sets: 3 },
    hint: 'база 6–10, изоляция 10–15, близко к отказу',
  },
  strength: {
    label: 'Сила',
    compound:  { min: 3, max: 6,  rest: 210, sets: 4 },
    isolation: { min: 6, max: 10, rest: 120, sets: 3 },
    hint: 'тяжёлая база 3–6 повт, длинный отдых',
  },
  fitness: {
    label: 'Тонус',
    compound:  { min: 10, max: 15, rest: 120, sets: 3 },
    isolation: { min: 12, max: 20, rest: 75,  sets: 3 },
    hint: 'умеренные веса, короче отдых, больше повторов',
  },
};

/* ---------- пулы упражнений по типам дня (в порядке приоритета) ---------- */

const GEN_POOLS = {
  // фулбади: 3 ротации, каждая группа 2–3×/нед
  fullA: ['bb-squat', 'bb-bench-press', 'bb-row', 'db-shoulder-press', 'leg-curl', 'cable-pushdown', 'cable-crunch', 'hip-thrust'],
  fullB: ['romanian-dl', 'incline-db-press', 'lat-pulldown', 'lateral-raise', 'leg-extension', 'bb-curl', 'bulgarian-split', 'hanging-leg-raise'],
  fullC: ['leg-press', 'db-bench-press', 'seated-cable-row', 'ohp', 'hip-thrust', 'hammer-curl', 'calf-raise', 'ab-wheel'],
  // верх/низ
  upper:  ['bb-bench-press', 'bb-row', 'ohp', 'lat-pulldown', 'cable-fly', 'lateral-raise', 'bb-curl', 'cable-pushdown', 'face-pull'],
  lower:  ['bb-squat', 'romanian-dl', 'leg-press', 'leg-curl', 'hip-thrust', 'leg-extension', 'calf-raise', 'cable-crunch'],
  upper2: ['incline-db-press', 'seated-cable-row', 'db-shoulder-press', 'pull-up', 'pec-deck', 'rear-delt-fly', 'hammer-curl', 'overhead-ext'],
  lower2: ['deadlift', 'hip-thrust', 'bulgarian-split', 'leg-curl', 'walking-lunge', 'leg-extension', 'calf-raise', 'hanging-leg-raise'],
  // пуш/пул/ноги
  push: ['bb-bench-press', 'ohp', 'incline-db-press', 'cable-fly', 'lateral-raise', 'overhead-ext', 'cable-pushdown'],
  pull: ['lat-pulldown', 'bb-row', 'seated-cable-row', 'face-pull', 'bb-curl', 'hammer-curl', 'straight-arm-pd'],
  legs: ['bb-squat', 'romanian-dl', 'leg-press', 'leg-curl', 'hip-thrust', 'leg-extension', 'calf-raise'],
};

const GEN_LABELS = {
  fullA: 'A', fullB: 'B', fullC: 'C',
  upper: 'Верх', lower: 'Низ', upper2: 'Верх 2', lower2: 'Низ 2',
  push: 'Пуш', pull: 'Пул', legs: 'Ноги',
};

/* акценты по полу: сдвигают приоритет отбора, когда время ограничено */
const GEN_F_BOOST = ['hip-thrust', 'romanian-dl', 'bulgarian-split', 'leg-curl', 'leg-press', 'walking-lunge', 'calf-raise', 'hyperextension', 'lateral-raise', 'cable-lateral'];
const GEN_M_BOOST = ['bb-bench-press', 'incline-db-press', 'ohp', 'bb-curl', 'hammer-curl', 'cable-pushdown', 'overhead-ext', 'lateral-raise'];

/* ---------- выбор сплита ---------- */

function genPickSplit(daysPerWeek, pref) {
  const n = Math.min(5, Math.max(2, daysPerWeek));
  const FULL = { 2: ['fullA', 'fullB'], 3: ['fullA', 'fullB', 'fullC'], 4: ['fullA', 'fullB', 'fullC', 'fullA'], 5: ['fullA', 'fullB', 'fullC', 'fullA', 'fullB'] };
  const SPLIT = { 2: ['upper', 'lower'], 3: ['push', 'pull', 'legs'], 4: ['upper', 'lower', 'upper2', 'lower2'], 5: ['upper', 'lower', 'push', 'pull', 'legs'] };
  // авто: ≤3 дней частотнее и эффективнее фулбади; 4–5 — по группам
  const mode = pref === 'full' || (pref !== 'split' && n <= 3) ? FULL : SPLIT;
  return mode[n];
}

/* ---------- оценка длительности тренировки ---------- */

/** Минуты на день: сет ~45с + отдых, плюс ~1.5 мин на смену снаряда. */
function genEstimateMin(items) {
  return items.reduce((m, it) => m + it.workSets * (0.75 + it.restSec / 60) + 1.5, 0);
}

/* ---------- генерация ---------- */

function generateProgram(opts, library) {
  const sex = opts.sex === 'f' ? 'f' : 'm';
  const goal = GEN_GOALS[opts.goal] ? opts.goal : 'hypertrophy';
  const g = GEN_GOALS[goal];
  const minutes = Number(opts.minutes) || 60;
  const budget = Math.max(25, minutes - 8);           // минус разминка
  const byId = {};
  for (const e of library) byId[e.id] = e;
  const boost = sex === 'f' ? GEN_F_BOOST : GEN_M_BOOST;

  const keys = genPickSplit(opts.daysPerWeek, opts.split || 'auto');
  const seenLabels = new Set();

  const days = keys.map((key, di) => {
    // приоритет: позиция в пуле, акцент пола −1.5; для «силы» изоляция −в конец
    const scored = GEN_POOLS[key]
      .filter((id) => byId[id])
      .map((id, i) => {
        let score = i;
        if (boost.includes(id)) score -= 1.5;
        if (goal === 'strength' && byId[id].kind === 'isolation') score += 3;
        return { id, score };
      })
      .sort((a, b) => a.score - b.score);

    // собираем упражнения, пока влезаем в бюджет времени (минимум 3)
    const items = [];
    for (const { id } of scored) {
      const p = byId[id].kind === 'compound' ? g.compound : g.isolation;
      const item = {
        exerciseId: id,
        repRangeMin: p.min, repRangeMax: p.max,
        workSets: p.sets, targetRIR: 2, restSec: p.rest,
      };
      if (items.length >= 3 && genEstimateMin([...items, item]) > budget) continue;
      items.push(item);
      if (genEstimateMin(items) >= budget) break;
    }

    // метка: у сплитов своя, у фулбади при повторе ключа — следующая буква
    let label = GEN_LABELS[key] || 'ABCDE'[di];
    while (seenLabels.has(label)) label = 'ABCDE'[di] || label + '′';
    seenLabels.add(label);

    return { key, label, items, estMinutes: Math.round(genEstimateMin(items)) };
  });

  const note = `${g.label}: ${g.hint}. Объём ~10–20 сетов/группу в неделю, каждая группа ≥2×/нед. `
    + (sex === 'f' ? 'Акцент: ноги/ягодичные/дельты.' : 'Акцент: грудь/спина/руки.');

  return { days, note, goal, sex, minutes };
}

/* export для node-тестов; в браузере — глобальные объявления */
if (typeof module !== 'undefined') {
  module.exports = { GEN_GOALS, GEN_POOLS, GEN_LABELS, genPickSplit, genEstimateMin, generateProgram };
}
