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
  return sets.map((s) => `${s.weight}×${s.reps}${s.rir != null ? ' RIR' + s.rir : ''}`).join(', ');
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
 * ctx — как для recommend: { meso, item, exercise, history }.
 * engine — { recommend, calibrate }.
 * → { mode: 'probe'|'control'|'work'|'done', rec?, calibration?, done? }
 */
function planExercise(item, exSets, ctx, engine) {
  const work = exSets.filter((s) => !s.isCalibration);
  const probe = exSets.find((s) => s.isCalibration);
  const hasHistory = (ctx.history || []).some(
    (h) => !h.isDeload && h.sets.some((s) => !s.isCalibration)
  );

  if (work.length >= item.workSets) return { mode: 'done', done: work.length };

  // калибровочный сценарий: истории нет
  if (!hasHistory && !ctx.meso.isDeload) {
    if (!probe) {
      return {
        mode: 'probe',
        rec: {
          weight: null,
          reps: Math.round((item.repRangeMin + item.repRangeMax) / 2),
          targetRIR: 4,
          reason: 'Разведочный подход: 10–15 повторов, НЕ до отказа. Он калибровочный.',
        },
      };
    }
    if (work.length === 0) {
      const target = Math.round((item.repRangeMin + item.repRangeMax) / 2);
      const cal = engine.calibrate(probe, {
        targetReps: target,
        targetRIR: ctx.meso.targetRIR,
        weightStep: ctx.exercise.weightStep,
      });
      return {
        mode: 'control',
        calibration: cal,
        rec: { weight: cal.weight, reps: target, targetRIR: ctx.meso.targetRIR, reason: cal.reason },
      };
    }
    // контрольный сделан — продолжаем от последнего рабочего веса
    const prev = work[work.length - 1];
    return {
      mode: 'work',
      rec: {
        weight: prev.weight,
        reps: Math.min(prev.reps, item.repRangeMax),
        targetRIR: ctx.meso.targetRIR,
        reason: 'Калибровка подтверждена — держим вес.',
      },
    };
  }

  // обычная рекомендация
  const rec = engine.recommend(item.exerciseId, work.length + 1, ctx);
  if (work.length > 0) {
    // автоподстановка прошлого сета этой сессии
    const prev = work[work.length - 1];
    return { mode: 'work', rec: { ...rec, weight: prev.weight } };
  }
  return { mode: 'work', rec };
}

/* ---------- DOM: монтирование экрана (браузер) ---------- */

function initWorkout(root, opts = {}) {
  const S = opts.store || {
    startSession, logSet, save, getExercise, exerciseHistory,
  };
  const E = opts.engine || { recommend, calibrate, mesoStatus, context };
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
  let timer = null;        // { endTs, restSec, handle }

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
    return planExercise(item, exSets(item.exerciseId), ctxFor(item), E);
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
          <div class="wk-title">День ${day.label}${wd} · Неделя ${meso.weekNo}${meso.isDeload ? ' · ДЕЛОУД' : ''}</div>
          <div class="wk-sub">Цель недели: RIR ${meso.targetRIR}</div>
        </div>
        <div class="wk-prog">${prog.done}/${prog.total}</div>
      </header>`);

    for (const item of day.items) {
      const ex = S.getExercise(state, item.exerciseId) || { name: item.exerciseId, weightStep: 2.5 };
      const plan = planFor(item);
      const logged = exSets(item.exerciseId);
      const badge = plan.mode === 'probe' ? '<span class="badge cal">калибровка</span>'
        : plan.mode === 'control' ? '<span class="badge cal">контроль</span>'
        : plan.mode === 'done' ? '<span class="badge ok">готово</span>' : '';

      const rows = logged.map((s, i) => `
        <div class="set-row done">
          <span class="set-no">${s.isCalibration ? 'кал.' : '#' + (i + 1)}</span>
          <span class="set-res">${s.weight} кг × ${s.reps}${s.rir != null ? ' · RIR ' + s.rir : ''}</span>
          <button class="mini" data-act="undo" data-set="${s.id}">✕</button>
        </div>`).join('');

      // прошлая сессия по этому упражнению (без калибровочных)
      const hist = S.exerciseHistory(state, item.exerciseId, { limit: 2 })
        .filter((h) => !h.sets.some((s) => logged.some((l) => l.id === s.id)))[0];
      const prevLine = hist
        ? `<div class="prev-line">Прошлый раз (${String(hist.date).slice(0, 10)}): ${setsText(hist.sets)}</div>`
        : '';

      let active = '';
      if (plan.mode !== 'done') {
        const d = ensureDraft(item, plan);
        const recVals = plan.rec && plan.rec.weight != null
          ? `<b>Рекомендация: ${plan.rec.weight} кг × ${plan.rec.reps} · RIR ${plan.rec.targetRIR}</b><br>`
          : '';
        active = `
          <div class="rec-line">${recVals}${plan.rec ? plan.rec.reason : ''}</div>
          <div class="entry" data-ex="${item.exerciseId}">
            ${entryField(item.exerciseId, 'weight', 'Вес, кг', d.weight, 'w', ex.weightStep || 2.5, 'decimal', 0, null)}
            ${entryField(item.exerciseId, 'reps', 'Повторы', d.reps, 'r', 1, 'numeric', 1, null)}
            ${entryField(item.exerciseId, 'rir', 'RIR (в запасе)', d.rir, 'i', 1, 'numeric', 0, 5)}
            <button class="log-wide" data-act="log" data-ex="${item.exerciseId}">✓ Записать подход</button>
          </div>`;
      }

      parts.push(`
        <section class="ex-card${plan.mode === 'done' ? ' complete' : ''}">
          <div class="ex-head">
            <div class="ex-name">${ex.name} ${badge}</div>
            <div class="ex-meta">${item.repRangeMin}–${item.repRangeMax} повт · ${item.workSets} сетов · отдых ${fmtClock(item.restSec)}
              · <a class="vid-link" href="${videoUrl(ex)}" target="_blank" rel="noopener">🎬 видео</a></div>
          </div>
          ${prevLine}
          ${rows}
          ${active}
        </section>`);
    }

    root.innerHTML = `<div class="wk-screen">${parts.join('')}</div>${timerHtml()}`;
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
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const exId = btn.dataset.ex;

    if (act === 'switch-day') { setDay(btn.dataset.day); return; }
    if (act === 'rest+') { if (timer) { timer.endTs += 15000; timer.restSec += 15; if (!timer.handle) startRest(computeRemaining(timer.endTs, Date.now())); render(); } return; }
    if (act === 'rest-skip') { stopRest(); return; }
    if (act === 'undo') { removeSet(btn.dataset.set); return; }

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
    const res = S.logSet(state, session.id, {
      exerciseId: item.exerciseId,
      setNo,
      weight: d.weight,
      reps: d.reps,
      rir: d.rir,
      isCalibration: d.mode === 'probe',
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

/* ---------- сигналы окончания отдыха ---------- */

let _audioCtx = null;
function beep() {
  try {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = _audioCtx.createOscillator();
    const g = _audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.001;
    o.connect(g); g.connect(_audioCtx.destination);
    const t = _audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.start(t); o.stop(t + 0.36);
  } catch (_) { /* тишина, если звук недоступен */ }
}
function buzz() {
  try { if (navigator && navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (_) {}
}

/* export для node-тестов; в браузере — глобальные объявления */
if (typeof module !== 'undefined') {
  module.exports = {
    demoDayA, fmtClock, computeRemaining, clampStep, dayProgress, planExercise, initWorkout,
    WEEKDAYS, todayIdx, pickDayForDate, setsText,
  };
}
