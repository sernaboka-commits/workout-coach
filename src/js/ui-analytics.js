/* ============================================================
 * ui-analytics.js — экран аналитики: e1RM (canvas), объём по группам
 * (canvas), бейджи стагнации, лента истории с редактированием.
 * Чистые модели графиков экспортируются для тестов; отрисовка на
 * <canvas> и правки истории — DOM/браузер.
 * Зависимости в браузере — глобали analytics.js / store.js / exercises.js.
 * ============================================================ */

/* ---------- чистые модели графиков (тестируемые) ---------- */

/** Модель линейного графика e1RM → координаты точек в пикселях. */
function lineChartModel(points, { w = 320, h = 160, pad = 28 } = {}) {
  const n = points.length;
  if (n === 0) return { pts: [], empty: true, min: 0, max: 0, n: 0 };
  const vals = points.map((p) => p.e1rm);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }                 // избегаем деления на 0
  const plotW = w - 2 * pad, plotH = h - 2 * pad;
  const pts = points.map((p, i) => ({
    x: pad + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)),
    y: pad + plotH * (1 - (p.e1rm - min) / (max - min)),
    e1rm: p.e1rm,
    isCalibration: !!p.isCalibration,
  }));
  return { pts, empty: false, min, max, n };
}

/** Модель столбчатого графика объёма + линии коридора. */
function barChartModel(bars, { w = 320, h = 160, pad = 28, corridor = [10, 20] } = {}) {
  const [lo, hi] = corridor;
  const maxScale = Math.max(hi + 2, ...bars.map((b) => b.count));
  const plotW = w - 2 * pad, plotH = h - 2 * pad;
  const slot = plotW / Math.max(1, bars.length);
  const bw = slot * 0.62;
  const yOf = (v) => pad + plotH * (1 - v / maxScale);
  const rects = bars.map((b, i) => {
    const y = yOf(b.count);
    return {
      x: pad + i * slot + (slot - bw) / 2,
      y,
      w: bw,
      h: pad + plotH - y,
      muscle: b.muscle,
      count: b.count,
      status: b.status,
    };
  });
  return { rects, loY: yOf(lo), hiY: yOf(hi), maxScale, baseY: pad + plotH };
}

/* ---------- палитра (canvas не читает CSS-переменные) ---------- */
const APAL = {
  line: '#4c8dff', cal: '#b07cff', grid: '#2b313b', axis: '#3a4759',
  text: '#94a0b0', ok: '#4c8dff', low: '#f0a336', high: '#ff5d5d', barBg: '#3a4759',
};

/* ---------- DOM ---------- */

function initAnalytics(root, opts = {}) {
  const St = opts.store || { load, save, updateSet, deleteSet, getExercise };
  const An = opts.analytics || { e1rmSeries, weeklyVolume, stagnation, MUSCLE_ORDER, VOLUME_CORRIDOR };
  const lib = opts.library || (typeof EXERCISE_LIBRARY !== 'undefined' ? EXERCISE_LIBRARY : []);
  const muscleLabels = opts.muscleLabels || (typeof MUSCLE_LABELS !== 'undefined' ? MUSCLE_LABELS : {});

  let state = opts.state || St.load(lib);
  let selEx = null;
  let editing = null;               // setId в режиме правки
  let draft = null;                 // { weight, reps, rir }

  function persist(next) { state = next; St.save(state); render(); }

  function loggedExercises() {
    const ids = new Set();
    for (const s of state.sessions) for (const st of s.sets) ids.add(st.exerciseId);
    return state.exercises.filter((e) => ids.has(e.id));
  }

  function render() {
    const exs = loggedExercises();
    if (!selEx || !exs.some((e) => e.id === selEx)) selEx = exs.length ? exs[0].id : null;

    const stg = An.stagnation(state);
    root.innerHTML = `
      <div class="an-screen">
        <div class="wk-title">Аналитика</div>

        <section class="an-card">
          <div class="an-head">
            <b>Динамика e1RM</b>
            <select class="sel" id="an-ex">
              ${exs.map((e) => `<option value="${e.id}"${e.id === selEx ? ' selected' : ''}>${e.name}</option>`).join('') || '<option>нет данных</option>'}
            </select>
          </div>
          <canvas id="an-e1rm" class="chart"></canvas>
        </section>

        <section class="an-card">
          <div class="an-head"><b>Объём за неделю</b><small>сеты · коридор ${An.VOLUME_CORRIDOR[0]}–${An.VOLUME_CORRIDOR[1]}</small></div>
          <canvas id="an-vol" class="chart"></canvas>
        </section>

        <section class="an-card">
          <div class="an-head"><b>Стагнация</b></div>
          ${stg.length
            ? stg.map((s) => `<div class="stag"><div class="stag-name">${s.name}</div><div class="stag-hint">${s.hint}</div></div>`).join('')
            : '<div class="pi-empty">Нет застоя — e1RM растёт по всем упражнениям с историей.</div>'}
        </section>

        <section class="an-card">
          <div class="an-head"><b>История</b></div>
          ${historyHtml()}
        </section>
      </div>`;

    drawCharts();
  }

  function historyHtml() {
    const sessions = [...state.sessions]
      .filter((s) => s.sets.length)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);
    if (!sessions.length) return '<div class="pi-empty">Пока нет залогированных тренировок.</div>';
    return sessions.map((s) => {
      const rows = s.sets.map((st) => setRow(st)).join('');
      return `<div class="hist-ses">
        <div class="hist-date">${s.date.slice(0, 10)}${s.isDeload ? ' · делоуд' : ''} · нед ${s.weekNo}</div>
        ${rows}
      </div>`;
    }).join('');
  }

  function setRow(st) {
    const ex = St.getExercise(state, st.exerciseId) || { name: st.exerciseId, weightStep: 2.5 };
    if (editing === st.id) {
      return `<div class="hist-edit" data-set="${st.id}">
        <div class="pi-name">${ex.name}</div>
        <div class="pi-params">
          ${eStep('weight', draft.weight, 'кг')}
          ${eStep('reps', draft.reps, 'повт')}
          ${eStep('rir', draft.rir, 'RIR')}
        </div>
        <div class="hist-actions">
          <button class="btn sm" data-act="save-set" data-set="${st.id}">Сохранить</button>
          <button class="btn sm ghost" data-act="cancel-set">Отмена</button>
          <button class="mini" data-act="del-set" data-set="${st.id}">🗑</button>
        </div>
      </div>`;
    }
    return `<div class="hist-row">
      <span class="hist-ex">${ex.name}${st.isCalibration ? ' <span class="badge cal">кал.</span>' : ''}</span>
      <span class="hist-val">${st.weight} × ${st.reps}${st.rir != null ? ' · RIR ' + st.rir : ''}</span>
      <button class="mini" data-act="edit-set" data-set="${st.id}">✎</button>
    </div>`;
  }

  function eStep(field, value, label) {
    return `<div class="mstep" data-field="${field}">
      <button class="ms-btn" data-act="e-" data-field="${field}">−</button>
      <div class="ms-val"><b>${value}</b><small>${label}</small></div>
      <button class="ms-btn" data-act="e+" data-field="${field}">+</button>
    </div>`;
  }

  /* --- отрисовка canvas --- */
  function drawCharts() {
    if (selEx) drawLine(root.querySelector('#an-e1rm'), An.e1rmSeries(state, selEx));
    drawBars(root.querySelector('#an-vol'), An.weeklyVolume(state).byMuscle);
  }

  function fitCanvas(cv) {
    if (!cv) return null;
    const cssW = cv.clientWidth || 320, cssH = 160;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    cv.width = cssW * dpr; cv.height = cssH * dpr;
    cv.style.height = cssH + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w: cssW, h: cssH };
  }

  function drawLine(cv, series) {
    const c = fitCanvas(cv); if (!c) return;
    const { ctx, w, h } = c;
    const m = lineChartModel(series, { w, h });
    ctx.clearRect(0, 0, w, h);
    if (m.empty) { emptyText(ctx, w, h, 'Нет данных'); return; }
    // ось min/max
    ctx.fillStyle = APAL.text; ctx.font = '11px sans-serif';
    ctx.fillText(m.max.toFixed(0), 4, 16);
    ctx.fillText(m.min.toFixed(0), 4, h - 8);
    // линия
    ctx.strokeStyle = APAL.line; ctx.lineWidth = 2; ctx.beginPath();
    m.pts.forEach((p, i) => { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.stroke();
    // точки
    m.pts.forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.isCalibration ? APAL.cal : APAL.line; ctx.fill();
    });
  }

  function drawBars(cv, bars) {
    const c = fitCanvas(cv); if (!c) return;
    const { ctx, w, h } = c;
    const m = barChartModel(bars, { w, h, corridor: An.VOLUME_CORRIDOR });
    ctx.clearRect(0, 0, w, h);
    // коридор
    ctx.strokeStyle = APAL.axis; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    [m.loY, m.hiY].forEach((y) => { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(w - 6, y); ctx.stroke(); });
    ctx.setLineDash([]);
    // столбцы
    m.rects.forEach((r) => {
      ctx.fillStyle = r.status === 'high' ? APAL.high : r.status === 'low' ? APAL.low : APAL.ok;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = APAL.text; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(muscleLabels[r.muscle] || r.muscle, r.x + r.w / 2, m.baseY + 12);
      if (r.count) ctx.fillText(String(r.count), r.x + r.w / 2, r.y - 3);
      ctx.textAlign = 'left';
    });
  }

  function emptyText(ctx, w, h, txt) {
    ctx.fillStyle = APAL.text; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(txt, w / 2, h / 2); ctx.textAlign = 'left';
  }

  /* --- события --- */
  root.addEventListener('change', (e) => {
    if (e.target.id === 'an-ex') { selEx = e.target.value; drawCharts(); }
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act, setId = btn.dataset.set;
    const st = setId ? findSet(setId) : null;

    if (act === 'edit-set' && st) { editing = setId; draft = { weight: st.weight, reps: st.reps, rir: st.rir == null ? 0 : st.rir }; render(); }
    else if (act === 'cancel-set') { editing = null; draft = null; render(); }
    else if (act === 'e-' || act === 'e+') { stepDraft(btn.dataset.field, act === 'e+' ? 1 : -1, st); render(); }
    else if (act === 'save-set' && st) { persist(St.updateSet(state, setId, { weight: draft.weight, reps: draft.reps, rir: draft.rir })); editing = null; draft = null; }
    else if (act === 'del-set') { persist(St.deleteSet(state, setId)); editing = null; draft = null; }
  });

  function findSet(setId) {
    for (const s of state.sessions) { const f = s.sets.find((x) => x.id === setId); if (f) return f; }
    return null;
  }
  function stepDraft(field, dir, st) {
    if (!draft) return;
    const ex = st ? (St.getExercise(state, st.exerciseId) || { weightStep: 2.5 }) : { weightStep: 2.5 };
    if (field === 'weight') draft.weight = Math.max(0, +(draft.weight + dir * (ex.weightStep || 2.5)).toFixed(3));
    else if (field === 'reps') draft.reps = Math.max(1, draft.reps + dir);
    else if (field === 'rir') draft.rir = Math.min(5, Math.max(0, draft.rir + dir));
  }

  render();
  return { render, getState: () => state };
}

if (typeof module !== 'undefined') {
  module.exports = { lineChartModel, barChartModel, initAnalytics };
}
