/* ============================================================
 * ui-workout.js — экран активной тренировки + таймер отдыха
 * DOM-код изолирован в initWorkout(); чистые хелперы экспортируются
 * отдельно (тестируются node-ом без DOM).
 *
 * Зависимости в браузере — глобальные функции store.js/engine.js
 * (startSession/logSet/save/getExercise/exerciseHistory, recommend/
 * calibrate/mesoStatus/context). В node инъектируются через opts.
 *
 * ВРЕМЕННО (до чанка 6): захардкожен демо-день A и стартует свежая
 * сессия при монтировании. Реальный выбор дня/сессии — конструктор
 * (чанк 4) и app.js (чанк 6).
 * ============================================================ */

/* ---------- демо-день A (заглушка до конструктора) ---------- */

function demoDayA() {
  return {
    id: 'day-a',
    label: 'A',
    items: [
      { exerciseId: 'bb-bench-press', repRangeMin: 6,  repRangeMax: 10, workSets: 3, targetRIR: 2, restSec: 180 },
      { exerciseId: 'bb-row',         repRangeMin: 8,  repRangeMax: 12, workSets: 3, targetRIR: 2, restSec: 150 },
      { exerciseId: 'ohp',            repRangeMin: 8,  repRangeMax: 12, workSets: 3, targetRIR: 2, restSec: 150 },
      { exerciseId: 'bb-curl',        repRangeMin: 10, repRangeMax: 15, workSets: 3, targetRIR: 2, restSec: 90  },
    ],
  };
}

/* ---------- дни недели ---------- */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];   // индекс 0=Пн … 6=Вс

/** JS getDay() (0=Вс) → наш индекс (0=Пн). */
function todayIdx(now = new Date()) {
  return (now.getDay() + 6) % 7;
}

/** День программы, назначенный на этот день недели (или null). */
function pickDayForDate(days, idx) {
  return (days || []).find((d) => d.weekday === idx) || null;
}

/* ---------- чистые хелперы (тестируемые) ---------- */

/* кнопка «?» из help.js; в node-тестах help.js не подключён — пусто */
function _hint(id) {
  return (typeof hintBtn === 'function') ? hintBtn(id) : '';
}

/** Пошаговое пояснение калибровочной тренировки (чистая функция).
 *  → { step, title, text } | null */
function calibrationGuide(plan, item) {
  if (!plan || !item) return null;
  if (plan.mode === 'probe') {
    return {
      step: '1',
      title: 'Калибровочная тренировка',
      text: `Новое упражнение — сегодня подбираем вес лесенкой. Поставь посильный вес и сделай подход, останавливаясь С ЗАПАСОМ (не до отказа): дальше нет смысла, вес и так ясен. Запиши вес, повторы и RIR. Было легко — добавим вес и повторим; так за несколько подходов спустимся до ~${item.repRangeMin} повторов. Знаешь свой рабочий вес? Пропусти подбор кнопкой ниже.`,
    };
  }
  if (plan.mode === 'ramp') {
    const w = plan.rec && plan.rec.weight != null ? ` до ${plan.rec.weight} кг` : '';
    return {
      step: String((plan.calNo || 1) + 1),
      title: 'Лесенка — добавляем вес',
      text: `Добавь${w} и сделай следующий подход, снова с запасом, не до отказа. Когда дойдёшь до ~${item.repRangeMin} повторов — лесенка закончится, и по всем прикидкам рассчитается твой рабочий вес на следующую тренировку.`,
    };
  }
  if (plan.mode === 'cal-done') {
    const ref = plan.refSet
      ? ` (опора — прикидка ${plan.refSet.weight}×${plan.refSet.reps}${plan.refSet.rir != null ? ' RIR ' + plan.refSet.rir : ''}; слишком тяжёлые ступени ограничивают вес сверху)`
      : '';
    return {
      step: '✓',
      title: 'Вес подобран',
      text: `Готово: по лесенке из ${plan.calCount} прикидок рассчитан рабочий вес — ${plan.workWeight} кг${ref}. В следующую тренировку начнёшь с него, и пойдут обычные рекомендации. Сегодня к этому упражнению можно не возвращаться.`,
    };
  }
  return null;
}

/** Поле ввода подхода: подпись + [−][input][+] на всю ширину. */
function entryField(exId, field, label, value, p, step, mode, min, max) {
  const mn = min != null ? ` min="${min}"` : '';
  const mx = max != null ? ` max="${max}"` : '';
  return `<div class="ef">
    <span class="ef-lbl">${label}</span>
    <div class="ef-ctrl">
      <button class="step" data-act="${p}-" data-ex="${exId}">−</button>
      <input class="val-in" type="number" inputmode="${mode}" step="${step}"${mn}${mx} data-field="${field}" data-ex="${exId}" value="${value}">
      <button class="step" data-act="${p}+" data-ex="${exId}">+</button>
    </div>
  </div>`;
}

/** Краткий текст результатов сессии: "60×10 RIR2, 60×9 RIR2". */
function setsText(sets) {
  return sets.map((s) => `${s.weight > 0 ? s.weight + '×' : ''}${s.reps}${s.rir != null ? ' RIR' + s.rir : ''}`).join(', ');
}

/** Секунды → "m:ss". */
function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Остаток таймера отдыха в секундах, не меньше 0. */
function computeRemaining(endTs, now) {
  return Math.max(0, Math.ceil((endTs - now) / 1000));
}

/** Шаг степпера с клампом к [min, max]; точность приводится к сетке шага. */
function clampStep(value, delta, step, min, max) {
  let v = +(Number(value) + delta * step).toFixed(3);
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return v;
}

/** Итог тренировки: рабочие подходы, тоннаж, разбивка по упражнениям.
 *  exResolver(id) → упражнение или null (для названий). Чистая функция. */
function sessionSummary(session, exResolver) {
  const sets = (session && session.sets) || [];
  const work = sets.filter((s) => !s.isCalibration);
  const tonnage = work.reduce((t, s) => t + Number(s.weight) * Number(s.reps), 0);
  const byEx = {};
  for (const s of sets) (byEx[s.exerciseId] = byEx[s.exerciseId] || []).push(s);
  const exercises = Object.keys(byEx).map((id) => {
    const ws = byEx[id].filter((x) => !x.isCalibration);
    const top = ws.reduce((a, x) => (a && a.weight * a.reps >= x.weight * x.reps ? a : x), null);
    const ex = exResolver ? exResolver(id) : null;
    return { exerciseId: id, name: ex ? ex.name : id, sets: ws.length, calib: byEx[id].length - ws.length, top };
  });
  return { workSets: work.length, tonnage: Math.round(tonnage), exercises };
}

/** Прогресс дня: сколько рабочих сетов сделано из плановых. */
function dayProgress(day, sessionSets) {
  let done = 0, total = 0;
  for (const it of day.items) {
    total += it.workSets;
    done += sessionSets.filter((s) => s.exerciseId === it.exerciseId && !s.isCalibration).length;
  }
  return { done: Math.min(done, total), total };
}

/**
 * Что показывать по упражнению сейчас (чистая функция).
 * exSets — сеты этого упражнения в текущей сессии (по порядку добавления).
 * ctx — как для recommend: { meso, item, exercise, history } (история
 *       С калибровочными сетами; текущая сессия из неё исключается тут).
 * engine — { recommend, calibrate, weightFromLadder }.
 * opts.skipCalibration — пользователь знает рабочий вес, лесенку не делаем.
 * → { mode: 'probe'|'ramp'|'cal-done'|'work'|'done', rec?, ... }
 */
function planExercise(item, exSets, ctx, engine, opts = {}) {
  const work = exSets.filter((s) => !s.isCalibration);
  // история без текущей сессии (её сеты пришли и в exSets)
  const prior = (ctx.history || []).filter(
    (h) => !h.sets.some((s) => exSets.some((x) => x.id === s.id))
  );
  const hasWorkHistory = prior.some((h) => !h.isDeload && h.sets.some((s) => !s.isCalibration));
  const hasCalHistory = prior.some((h) => !h.isDeload && h.sets.some((s) => s.isCalibration));

  if (work.length >= item.workSets) return { mode: 'done', done: work.length };

  // собственный вес: без калибровки, прогрессия повторами/RIR
  if (ctx.exercise && ctx.exercise.bodyweight) {
    if (work.length > 0) return { mode: 'work', rec: nextSetRec(work[work.length - 1], ctx, item, engine) };
    return { mode: 'work', rec: engine.recommend(item.exerciseId, work.length + 1, ctx) };
  }

  // калибровочная тренировка: истории нет вовсе — вся первая тренировка
  // упражнения = лесенка прикидок (все сеты калибровочные); рабочий вес
  // считается по лучшему e1RM лесенки и применяется со СЛЕДУЮЩЕЙ тренировки
  if (!hasWorkHistory && !hasCalHistory && !ctx.meso.isDeload && work.length === 0) {
    const mid = Math.round((item.repRangeMin + item.repRangeMax) / 2);
    if (opts.skipCalibration) {
      return {
        mode: 'work',
        skipped: true,
        rec: {
          weight: null, reps: mid, targetRIR: ctx.meso.targetRIR,
          reason: `Подбор пропущен — выставь свой рабочий вес, цель ${item.repRangeMin}–${item.repRangeMax} повт при RIR ${ctx.meso.targetRIR}.`,
        },
      };
    }
    const cals = exSets.filter((s) => s.isCalibration);
    if (!cals.length) {
      return {
        mode: 'probe',
        rec: {
          weight: null,
          reps: mid + 3,
          targetRIR: 3,
          reason: 'Первая прикидка: посильный вес, НЕ до отказа.',
        },
      };
    }
    const last = cals[cals.length - 1];
    const ladderCap = Math.min(5, Math.max(3, item.workSets + 1));
    if (Number(last.reps) <= item.repRangeMin || cals.length >= ladderCap) {
      // лесенка спустилась к низу диапазона (или лимит) — вес подобран
      const wl = engine.weightFromLadder(cals, {
        repRangeMin: item.repRangeMin, repRangeMax: item.repRangeMax,
        targetRIR: ctx.meso.targetRIR, weightStep: ctx.exercise.weightStep,
      });
      return { mode: 'cal-done', calCount: cals.length, workWeight: wl ? wl.weight : null, refSet: wl ? wl.refSet : null };
    }
    // следующая ступень: вес под «на ~3 повтора меньше», по-прежнему с запасом
    const cal = engine.calibrate(last, {
      targetReps: Math.max(item.repRangeMin, Number(last.reps) - 3),
      targetRIR: 2,
      weightStep: ctx.exercise.weightStep,
    });
    return {
      mode: 'ramp',
      calNo: cals.length,
      calibration: cal,
      rec: { weight: cal.weight, reps: cal.targetReps, targetRIR: 2, reason: cal.reason },
    };
  }

  // обычная рекомендация (в т.ч. рабочий вес из калибровочной лесенки)
  const rec = engine.recommend(item.exerciseId, work.length + 1, ctx);
  if (work.length > 0) {
    // следующий сет этой сессии: тот же вес, повторы пересчитаны от факта прошлого сета
    return { mode: 'work', rec: nextSetRec(work[work.length - 1], ctx, item, engine) };
  }
  return { mode: 'work', rec };
}

/** Рекомендация на следующий сет ЭТОЙ сессии от фактического прошлого сета (RIR-aware). */
function nextSetRec(prev, ctx, item, engine) {
  const t = ctx.meso.targetRIR;
  const reps = engine.projectReps(prev, t, item);
  const rir = prev.rir == null ? t : prev.rir;
  const rtf = Number(prev.reps) + rir;
  const did = prev.weight > 0 ? `${prev.reps}×${prev.weight}` : `${prev.reps} повт`;
  return {
    weight: prev.weight,
    reps,
    targetRIR: t,
    needsCalibration: false,
    bodyweight: !(prev.weight > 0) && !!(ctx.exercise && ctx.exercise.bodyweight),
    reason: `Прошлый подход ${did}${prev.rir != null ? ' RIR ' + prev.rir : ''} → до отказа ~${rtf}. Цель RIR ${t}: ${reps} повт.`,
  };
}

/* ---------- DOM: монтирование экрана (браузер) ---------- */

function initWorkout(root, opts = {}) {
  const S = opts.store || {
    startSession, logSet, save, getExercise, exerciseHistory,
  };
  const E = opts.engine || { recommend, calibrate, weightFromLadder, mesoStatus, context, projectReps, nextSessionAdvice };
  const onCommit = opts.onCommit || function () {};

  let state = opts.state;
  const allDays = (state.program.days && state.program.days.length) ? state.program.days : null;
  const meso = E.mesoStatus(state);

  // программы нет → подсказка вместо экрана
  if (!allDays && !opts.day) {
    root.innerHTML = `<div class="placeholder">Программы пока нет.<br>Создай её во вкладке <b>«Программа»</b>: количество тренировок → дни недели → упражнения.</div>`;
    return { render: () => {}, stopRest: () => {} };
  }

  // день по умолчанию: назначенный на сегодня день недели, иначе первый
  let day = opts.day || pickDayForDate(allDays, todayIdx()) || allDays[0];

  let session = null;      // ленивая: создаётся при первом залоге
  const drafts = {};       // exId -> { weight, reps, rir, mode }
  const skipCal = {};      // exId -> true: пользователь пропустил подбор веса
  let timer = null;        // { endTs, restSec, handle }
  let showSummary = false; // оверлей итога тренировки

  // возобновляем сегодняшнюю сессию этого дня, если она уже начата
  function resumeSession() {
    const today = new Date().toISOString().slice(0, 10);
    session = state.sessions.find((s) => s.dayId === day.id && String(s.date).slice(0, 10) === today) || null;
  }
  resumeSession();

  function setDay(dayId) {
    const d = (allDays || []).find((x) => x.id === dayId);
    if (!d || d === day) return;
    day = d;
    stopRest(false); timer = null;
    for (const k of Object.keys(drafts)) delete drafts[k];
    resumeSession();
    render();
  }

  function ensureSession() {
    if (!session) {
      const r = S.startSession(state, day.id, { isDeload: meso.isDeload });
      state = r.state;
      session = r.session;
    }
    return session;
  }
  function liveSession() {
    if (!session) return { sets: [] };
    return state.sessions.find((s) => s.id === session.id);
  }
  function exSets(exId) {
    return liveSession().sets.filter((s) => s.exerciseId === exId);
  }
  function ctxFor(item) {
    return E.context(state, item.exerciseId, item, S.exerciseHistory);
  }
  function planFor(item) {
    return planExercise(item, exSets(item.exerciseId), ctxFor(item), E,
      { skipCalibration: !!skipCal[item.exerciseId] });
  }
  function ensureDraft(item, plan) {
    const id = item.exerciseId;
    if (!drafts[id] || drafts[id].mode !== plan.mode) {
      drafts[id] = {
        mode: plan.mode,
        weight: plan.rec && plan.rec.weight != null ? plan.rec.weight
          : (exSets(id).slice(-1)[0]?.weight ?? item._lastW ?? 20),
        reps: plan.rec ? plan.rec.reps : item.repRangeMin,
        rir: plan.rec ? plan.rec.targetRIR : 2,
      };
    }
    return drafts[id];
  }

  /* --- рендер --- */
  function render() {
    const prog = dayProgress(day, liveSession().sets);
    const parts = [];

    // переключатель дней (если их больше одного); сегодняшний помечается
    if (allDays && allDays.length > 1) {
      const tIdx = todayIdx();
      parts.push(`<div class="day-tabs">${allDays.map((d) => `
        <button class="day-tab${d.id === day.id ? ' on' : ''}" data-act="switch-day" data-day="${d.id}">
          ${d.label}${d.weekday != null ? ' · ' + WEEKDAYS[d.weekday] : ''}${d.weekday === tIdx ? ' ●' : ''}
        </button>`).join('')}</div>`);
    }

    const wd = day.weekday != null ? ' · ' + WEEKDAYS[day.weekday] : '';
    parts.push(`
      <header class="wk-head">
        <div>
          <div class="wk-title">День ${day.label}${wd} · Неделя ${meso.weekNo}${meso.isDeload ? ' · ДЕЛОУД ' + _hint('deload') : ''}</div>
          <div class="wk-sub">Цель недели: RIR ${meso.targetRIR} ${_hint('rir')}</div>
        </div>
        <div class="wk-prog">${prog.done}/${prog.total}</div>
      </header>`);

    for (const item of day.items) {
      const ex = S.getExercise(state, item.exerciseId) || { name: item.exerciseId, weightStep: 2.5 };
      const plan = planFor(item);
      const logged = exSets(item.exerciseId);
      const badge = plan.mode === 'probe' || plan.mode === 'ramp' ? '<span class="badge cal">калибровка</span>'
        : plan.mode === 'cal-done' ? '<span class="badge ok">вес подобран</span>'
        : plan.mode === 'done' ? '<span class="badge ok">готово</span>' : '';

      let workNo = 0;
      const rows = logged.map((s) => `
        <div class="set-row done">
          <span class="set-no">${s.isCalibration ? 'кал.' : '#' + (++workNo)}</span>
          <span class="set-res">${s.weight > 0 ? s.weight + ' кг × ' + s.reps : s.reps + ' повт'}${s.rir != null ? ' · RIR ' + s.rir : ''}</span>
          <button class="mini" data-act="undo" data-set="${s.id}">✕</button>
        </div>`).join('');

      // прошлая сессия по этому упражнению (без калибровочных)
      const hist = S.exerciseHistory(state, item.exerciseId, { limit: 2 })
        .filter((h) => !h.sets.some((s) => logged.some((l) => l.id === s.id)))[0];
      const prevLine = hist
        ? `<div class="prev-line">Прошлый раз (${String(hist.date).slice(0, 10)}): ${setsText(hist.sets)}</div>`
        : '';

      let active = '';
      if (plan.mode === 'cal-done') {
        // лесенка завершена: показываем итог, без формы ввода
        const guide = calibrationGuide(plan, item);
        active = `
          <div class="cal-guide">
            <b>Подбор веса · ${guide.title} ${_hint('calibration')}</b>
            <div>${guide.text}</div>
          </div>`;
      } else if (plan.mode !== 'done') {
        const d = ensureDraft(item, plan);
        const bw = !!ex.bodyweight;
        const recVals = plan.rec && plan.rec.reps != null
          ? (bw
            ? `<b>Рекомендация: ${plan.rec.reps} повт · RIR ${plan.rec.targetRIR}</b><br>`
            : (plan.rec.weight != null ? `<b>Рекомендация: ${plan.rec.weight} кг × ${plan.rec.reps} · RIR ${plan.rec.targetRIR}</b><br>` : ''))
          : '';
        const weightField = bw
          ? `<div class="bw-note">Собственный вес — прогрессия по повторам и RIR</div>`
          : entryField(item.exerciseId, 'weight', 'Вес, кг', d.weight, 'w', ex.weightStep || 2.5, 'decimal', 0, null);
        // пошаговое пояснение калибровки; текст reason тогда не дублируем
        const guide = calibrationGuide(plan, item);
        const skipBtn = (plan.mode === 'probe')
          ? `<button class="btn ghost sm cal-skip" data-act="skip-cal" data-ex="${item.exerciseId}">Знаю рабочий вес — пропустить подбор</button>`
          : '';
        const guideHtml = guide ? `
          <div class="cal-guide">
            <b>Подбор веса · шаг ${guide.step} — ${guide.title} ${_hint('calibration')}</b>
            <div>${guide.text}</div>
            ${skipBtn}
          </div>` : '';
        active = `
          ${guideHtml}
          <div class="rec-line">${recVals}${!guide && plan.rec ? plan.rec.reason : ''}</div>
          <div class="entry" data-ex="${item.exerciseId}">
            ${weightField}
            ${entryField(item.exerciseId, 'reps', 'Повторы', d.reps, 'r', 1, 'numeric', 1, null)}
            ${entryField(item.exerciseId, 'rir', 'RIR (в запасе)', d.rir, 'i', 1, 'numeric', 0, 5)}
            <button class="log-wide" data-act="log" data-ex="${item.exerciseId}">✓ Записать подход</button>
          </div>`;
      }

      parts.push(`
        <section class="ex-card${plan.mode === 'done' ? ' complete' : ''}">
          <div class="ex-head">
            <div class="ex-name">${ex.name} ${badge}</div>
            <div class="ex-meta">${item.repRangeMin}–${item.repRangeMax} повт · ${item.workSets} подх. · отдых ${fmtClock(item.restSec)}
              · <a class="vid-link" href="${videoUrl(ex)}" target="_blank" rel="noopener">🎬 видео</a></div>
          </div>
          ${prevLine}
          ${rows}
          ${active}
        </section>`);
    }

    if (liveSession().sets.length) {
      parts.push(`<button class="btn finish-btn" data-act="finish">🏁 Завершить тренировку</button>`);
    }

    root.innerHTML = `<div class="wk-screen">${parts.join('')}</div>${timerHtml()}${showSummary ? summaryHtml() : ''}`;
  }

  function summaryHtml() {
    const ses = liveSession();
    const sum = sessionSummary(ses, (id) => S.getExercise(state, id));
    const startMs = ses.date ? new Date(ses.date).getTime() : null;
    let dur = '—';
    if (startMs) {
      const min = Math.max(1, Math.round((Date.now() - startMs) / 60000));
      dur = min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`;
    }
    const growWeek = !meso.isDeload;
    const rows = sum.exercises.map((e) => {
      const item = day.items.find((i) => i.exerciseId === e.exerciseId);
      const ex = S.getExercise(state, e.exerciseId) || { weightStep: 2.5 };
      const exSetsList = ses.sets.filter((s) => s.exerciseId === e.exerciseId);
      const adv = item ? E.nextSessionAdvice(exSetsList, item, meso.targetRIR, { weightStep: ex.weightStep, growWeek, bodyweight: !!ex.bodyweight }) : null;
      const advHtml = adv
        ? `<div class="sum-advice lv-${adv.lever}"><b>След. раз:</b> ${adv.text}${adv.volume ? `<span class="sum-vol"> · ${adv.volume}</span>` : ''}</div>`
        : (e.calib ? '<div class="sum-advice lv-hold">Калибровка завершена — рабочий вес рассчитан, увидишь его в следующей тренировке</div>' : '');
      const top = e.top ? (e.top.weight > 0 ? ` · лучший ${e.top.weight}×${e.top.reps}` : ` · лучший ${e.top.reps} повт`) : '';
      return `<div class="sum-ex">
        <div class="sum-row"><span>${e.name}</span><small>${e.sets} подх${top}</small></div>
        ${advHtml}
      </div>`;
    }).join('');
    return `
      <div class="overlay">
        <div class="sheet">
          <div class="sheet-head"><b>Тренировка сохранена ✓</b><button class="mini" data-act="close-summary">✕</button></div>
          <div class="sum-stats">
            <div class="sum-stat"><b>${sum.workSets}</b><small>рабочих подходов</small></div>
            <div class="sum-stat"><b>${sum.tonnage}</b><small>тоннаж, кг</small></div>
            <div class="sum-stat"><b>${dur}</b><small>длительность</small></div>
          </div>
          <div class="sum-list">${rows || '<div class="pi-empty">Нет подходов.</div>'}</div>
          <div class="meso-hint">Рекомендация «След. раз» — один рычаг прогрессии на упражнение (вес / повторы / подходы) по твоим результатам. Данные уже сохранены.</div>
          <button class="log-wide" data-act="close-summary">Готово</button>
        </div>
      </div>`;
  }

  function timerHtml() {
    if (!timer) return '';
    const rem = computeRemaining(timer.endTs, Date.now());
    const pct = Math.round((1 - rem / timer.restSec) * 100);
    const over = rem <= 0;
    return `
      <div class="rest-bar${over ? ' over' : ''}">
        <div class="rest-fill" style="width:${Math.min(100, pct)}%"></div>
        <div class="rest-txt">${over ? 'Отдых окончен' : 'Отдых ' + fmtClock(rem)}</div>
        <button class="rest-add" data-act="rest+">+15с</button>
        <button class="rest-skip" data-act="rest-skip">${over ? 'Ок' : 'Пропустить'}</button>
      </div>`;
  }

  /* --- таймер отдыха --- */
  // перерисовываем только полоску таймера, а не весь экран —
  // иначе ручной ввод в поле стирается каждые 250мс
  function paintTimer() {
    const bar = root.querySelector('.rest-bar');
    if (!timer || !bar) { render(); return; }
    const rem = computeRemaining(timer.endTs, Date.now());
    const over = rem <= 0;
    const pct = Math.round((1 - rem / timer.restSec) * 100);
    bar.classList.toggle('over', over);
    const fill = bar.querySelector('.rest-fill'); if (fill) fill.style.width = Math.min(100, pct) + '%';
    const txt = bar.querySelector('.rest-txt'); if (txt) txt.textContent = over ? 'Отдых окончен' : 'Отдых ' + fmtClock(rem);
    const skip = bar.querySelector('.rest-skip'); if (skip) skip.textContent = over ? 'Ок' : 'Пропустить';
  }

  function startRest(restSec) {
    stopRest(false);
    timer = { endTs: Date.now() + restSec * 1000, restSec, handle: null, dinged: false };
    timer.handle = setInterval(() => {
      const rem = computeRemaining(timer.endTs, Date.now());
      if (rem <= 0 && !timer.dinged) { timer.dinged = true; beep(); buzz(); }
      if (rem <= 0) { clearInterval(timer.handle); timer.handle = null; }
      paintTimer();
    }, 250);
    render();
  }
  function stopRest(rerender = true) {
    if (timer && timer.handle) clearInterval(timer.handle);
    timer = null;
    if (rerender) render();
  }

  /* --- события --- */
  root.addEventListener('click', (e) => {
    // закрытие итога по тапу на фон (сам оверлей, не его содержимое)
    if (showSummary && e.target.classList.contains('overlay')) { showSummary = false; render(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const exId = btn.dataset.ex;

    unlockAudio();   // любой тап на экране разблокирует звук таймера (iOS)

    if (act === 'finish') { showSummary = true; render(); return; }
    if (act === 'close-summary') { showSummary = false; render(); return; }
    if (act === 'switch-day') { setDay(btn.dataset.day); return; }
    if (act === 'rest+') { if (timer) { timer.endTs += 15000; timer.restSec += 15; if (!timer.handle) startRest(computeRemaining(timer.endTs, Date.now())); render(); } return; }
    if (act === 'rest-skip') { stopRest(); return; }
    if (act === 'undo') { removeSet(btn.dataset.set); return; }
    if (act === 'skip-cal') { skipCal[exId] = true; delete drafts[exId]; render(); return; }

    const item = day.items.find((i) => i.exerciseId === exId);
    if (!item) return;
    const ex = S.getExercise(state, exId) || { weightStep: 2.5 };
    const d = drafts[exId];
    if (!d) return;

    if (act === 'w-') d.weight = clampStep(d.weight, -1, ex.weightStep || 2.5, 0, null);
    else if (act === 'w+') d.weight = clampStep(d.weight, +1, ex.weightStep || 2.5, 0, null);
    else if (act === 'r-') d.reps = clampStep(d.reps, -1, 1, 1, 50);
    else if (act === 'r+') d.reps = clampStep(d.reps, +1, 1, 1, 50);
    else if (act === 'i-') d.rir = clampStep(d.rir, -1, 1, 0, 5);
    else if (act === 'i+') d.rir = clampStep(d.rir, +1, 1, 0, 5);
    else if (act === 'log') { logCurrent(item, d); return; }
    render();
  });

  // ручной ввод: пока печатают — обновляем черновик без render (не теряем каретку)
  root.addEventListener('input', (e) => {
    const inp = e.target.closest('.val-in');
    if (!inp) return;
    const d = drafts[inp.dataset.ex];
    if (!d) return;
    const v = parseFloat(inp.value);
    if (!isNaN(v)) d[inp.dataset.field] = v;
  });
  // по завершении ввода — клампим и показываем очищенное значение (без render)
  root.addEventListener('change', (e) => {
    const inp = e.target.closest('.val-in');
    if (!inp) return;
    const d = drafts[inp.dataset.ex];
    if (!d) return;
    const f = inp.dataset.field;
    let v = parseFloat(inp.value);
    if (isNaN(v)) v = f === 'reps' ? 1 : 0;
    if (f === 'weight') v = Math.max(0, v);
    else if (f === 'reps') v = Math.max(1, Math.round(v));
    else if (f === 'rir') v = Math.min(5, Math.max(0, Math.round(v)));
    d[f] = v;
    inp.value = v;
  });

  function logCurrent(item, d) {
    ensureSession();
    const setNo = exSets(item.exerciseId).length + 1;
    // калибровочная тренировка: ВСЕ прикидки лесенки — калибровочные,
    // рабочий вес по ним применится со следующей тренировки
    const isCal = d.mode === 'probe' || d.mode === 'ramp';
    const res = S.logSet(state, session.id, {
      exerciseId: item.exerciseId,
      setNo,
      weight: d.weight,
      reps: d.reps,
      rir: d.rir,
      isCalibration: isCal,
    });
    state = res.state;
    S.save(state);
    onCommit(state);
    delete drafts[item.exerciseId];
    startRest(item.restSec);
  }

  function removeSet(setId) {
    // локальная правка: удаляем сет из сессии и пересохраняем
    if (!session) return;
    const sess = liveSession();
    sess.sets = sess.sets.filter((s) => s.id !== setId);
    S.save(state);
    onCommit(state);
    render();
  }

  render();
  return { render, stopRest };
}

/* ---------- сигналы окончания отдыха ----------
 * iOS блокирует WebAudio вне пользовательского жеста, поэтому контекст
 * создаётся и «прогревается» на тапе (unlockAudio), а beep() лишь
 * возобновляет его и играет. navigator.vibrate на iPhone не работает —
 * оставлен как no-op-фолбэк для Android.
 */
let _audioCtx = null;
function _ac() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_audioCtx) _audioCtx = new AC();
  return _audioCtx;
}
/** Вызвать из обработчика тапа — разблокирует звук на iOS. */
function unlockAudio() {
  try {
    const ac = _ac(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    // беззвучный «тычок», чтобы iOS разблокировал аудиосессию
    const b = ac.createBuffer(1, 1, 22050);
    const src = ac.createBufferSource();
    src.buffer = b; src.connect(ac.destination); src.start(0);
  } catch (_) {}
}
function beep() {
  try {
    const ac = _ac(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    // два коротких тона — заметнее в зале
    const blip = (startAt, freq) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime + startAt;
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.start(t); o.stop(t + 0.3);
    };
    blip(0, 880); blip(0.33, 1180);
  } catch (_) { /* тишина, если звук недоступен */ }
}
function buzz() {
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([160, 80, 160]); } catch (_) {}
}

/* export для node-тестов; в браузере — глобальные объявления */
if (typeof module !== 'undefined') {
  module.exports = {
    demoDayA, fmtClock, computeRemaining, clampStep, dayProgress, planExercise, initWorkout,
    WEEKDAYS, todayIdx, pickDayForDate, setsText, sessionSummary, calibrationGuide,
  };
}
