/* ============================================================
 * ui-run.js — экран беговых тренировок: журнал + графики прогресса.
 * Методология: типы по Дэниелсу, поляризация 80/20 (Сейлер),
 * правило ~10% прироста недельного объёма.
 * Чистые расчёты — в analytics.js; графики переиспользуют
 * lineChartModel/barChartModel из ui-analytics.js.
 * ============================================================ */

/* палитра canvas (CSS-переменные канвасу недоступны) */
const RPAL = { line: '#37c46a', hr: '#f0a336', bar: '#4c8dff', warn: '#f0a336', bad: '#ff5d5d', text: '#94a0b0', axis: '#3a4759' };

function initRun(root, opts = {}) {
  const St = opts.store || { save, addRun, deleteRun };
  const An = opts.analytics || {
    RUN_TYPES, fmtPace, paceSecKm, runWeeklySeries, easyPaceSeries, hardSharePct, rampWarning,
    hrMaxTanaka, hrZones, hrZoneFor, zoneAdvice,
  };

  function hrCfg() {
    const s = state.settings || {};
    const hrMax = s.hrMax || (s.age ? An.hrMaxTanaka(s.age) : null);
    return { hrMax, hrRest: s.hrRest };
  }
  const onCommit = opts.onCommit || function () {};
  let state = opts.state;

  const today = new Date().toISOString().slice(0, 10);
  const draft = { type: 'easy', date: today, km: '', min: '', sec: '', hr: '', rpe: '', intervals: '', note: '' };
  let err = '';

  function persist(next) { state = next; St.save(state); onCommit(state); render(); }

  /* --- рендер --- */
  function render() {
    const share = An.hardSharePct(state);
    const weekly = An.runWeeklySeries(state, { weeks: 8 });
    // рост объёма: сравниваем две последние ЗАВЕРШЁННЫЕ недели
    const ramp = weekly.length >= 3 && An.rampWarning(weekly[weekly.length - 3].km, weekly[weekly.length - 2].km);

    const typeChips = Object.entries(An.RUN_TYPES).map(([k, t]) =>
      `<button class="chip${draft.type === k ? ' on' : ''}" data-act="type" data-v="${k}">${t.label}</button>`).join('');

    root.innerHTML = `
      <div class="an-screen">
        <div class="wk-title">Бег</div>

        <section class="an-card">
          <div class="an-head"><b>Новая пробежка</b><input class="in short" type="date" id="run-date" value="${draft.date}"></div>
          <div class="chips">${typeChips}</div>
          <div class="run-grid">
            ${numField('km', 'км', draft.km, '0.1', 'напр. 8.5')}
            ${numField('min', 'мин', draft.min, '1', '45')}
            ${numField('sec', 'сек', draft.sec, '1', '30')}
            ${numField('hr', 'пульс', draft.hr, '1', 'опц.')}
            ${numField('rpe', 'RPE 1–10', draft.rpe, '1', 'опц.')}
          </div>
          <input class="in" id="run-intervals" placeholder="Отрезки, напр. 8×400м/отдых 90с (для интервалов)" value="${draft.intervals}">
          <input class="in" id="run-note" placeholder="Заметка (самочувствие, покрытие…)" value="${draft.note}">
          <div class="cx-err">${err}</div>
          <button class="log-wide" data-act="log-run">✓ Записать пробежку</button>
        </section>

        <section class="an-card">
          <div class="an-head"><b>Интенсивность за 4 недели</b><small>цель ≤ 20–25% тяжёлого (80/20)</small></div>
          ${share.status === 'na'
            ? '<div class="pi-empty">Мало данных — залогируй 3+ пробежки.</div>'
            : `<div class="share-row">
                 <div class="share-bar"><div class="share-hard${share.status === 'high' ? ' over' : ''}" style="width:${share.hardPct}%"></div></div>
                 <b class="${share.status === 'high' ? 'warn-txt' : 'ok-txt'}">${share.hardPct}%</b>
               </div>
               <div class="meso-hint">Лёгкого ${share.easyMin} мин · тяжёлого ${share.hardMin} мин за ${share.sessions} пробежек.
               ${share.status === 'high' ? ' <b>Выше 25% — добавь лёгких/восстановительных.</b>' : ' В коридоре поляризованной модели.'}</div>`}
          ${ramp ? '<div class="cx-err" style="margin-top:8px">⚠ Объём прошлой недели вырос >10% к позапрошлой — следи за восстановлением (правило ~10%).</div>' : ''}
        </section>

        ${zonesCardHtml()}

        <section class="an-card">
          <div class="an-head"><b>Км в неделю</b><small>8 недель</small></div>
          <canvas id="run-vol" class="chart"></canvas>
        </section>

        <section class="an-card">
          <div class="an-head"><b>Темп лёгких пробежек</b><small>ниже = быстрее</small></div>
          <canvas id="run-pace" class="chart"></canvas>
        </section>

        <section class="an-card">
          <div class="an-head"><b>Журнал</b></div>
          ${runListHtml()}
        </section>
      </div>`;

    drawVolume(root.querySelector('#run-vol'), An.runWeeklySeries(state, { weeks: 8 }));
    drawPace(root.querySelector('#run-pace'), An.easyPaceSeries(state));
  }

  function zonesCardHtml() {
    const zones = An.hrZones(hrCfg());
    if (!zones) return `<section class="an-card"><div class="an-head"><b>Пульсовые зоны</b></div>
      <div class="pi-empty">Настрой пульс в <b>Настройках</b> — покажу целевые зоны по пульсу.</div></section>`;
    return `<section class="an-card">
      <div class="an-head"><b>Мои пульсовые зоны</b><small>уд/мин</small></div>
      <div class="hr-zones">${zones.map((z) =>
        `<div class="hr-zone z${z.n}"><span class="hz-n">Z${z.n}</span>
           <span class="hz-name">${z.name}</span>
           <span class="hz-use">${z.use}</span>
           <span class="hz-bpm">${z.lo}–${z.hi}</span></div>`).join('')}</div>
    </section>`;
  }

  function numField(id, label, value, step, ph) {
    return `<label class="run-f"><small>${label}</small>
      <input class="in" id="run-${id}" type="number" inputmode="decimal" step="${step}" min="0" placeholder="${ph}" value="${value}"></label>`;
  }

  function runListHtml() {
    const runs = [...(state.runs || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);
    if (!runs.length) return '<div class="pi-empty">Пока нет пробежек.</div>';
    const cfg = hrCfg();
    return runs.map((r) => {
      const t = An.RUN_TYPES[r.type] || { label: r.type, hard: false };
      const pace = An.fmtPace(An.paceSecKm(r.distanceKm, r.durationSec));
      const zone = r.avgHr ? An.hrZoneFor(r.avgHr, cfg) : null;
      const advice = zone ? An.zoneAdvice(r.type, zone) : '';
      const zoneTag = zone ? ` · <b class="zbadge z${zone}">Z${zone}</b>` : '';
      return `<div class="run-row${t.hard ? ' hard' : ''}">
        <div class="run-main">
          <b>${String(r.date).slice(0, 10)} · ${t.label}</b>
          <span>${r.distanceKm} км · ${pace}/км${r.avgHr ? ' · ' + r.avgHr + ' уд' + zoneTag : ''}${r.rpe ? ' · RPE ' + r.rpe : ''}</span>
          ${advice ? `<small class="zadvice">⚠ ${advice}</small>` : ''}
          ${r.intervals ? `<small>${r.intervals}</small>` : ''}${r.note ? `<small>${r.note}</small>` : ''}
        </div>
        <button class="mini" data-act="del-run" data-id="${r.id}">✕</button>
      </div>`;
    }).join('');
  }

  /* --- canvas --- */
  function fit(cv) {
    if (!cv) return null;
    const w = cv.clientWidth || 320, h = 160;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    return { ctx, w, h };
  }
  function emptyTxt(ctx, w, h, t) { ctx.fillStyle = RPAL.text; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t, w / 2, h / 2); ctx.textAlign = 'left'; }

  function drawVolume(cv, weekly) {
    const c = fit(cv); if (!c) return;
    const { ctx, w, h } = c;
    ctx.clearRect(0, 0, w, h);
    if (!weekly.some((x) => x.km > 0)) { emptyTxt(ctx, w, h, 'Нет данных'); return; }
    const bars = weekly.map((x) => ({ muscle: x.weekStart.slice(5), count: x.km, status: 'ok' }));
    const m = barChartModel(bars, { w, h, corridor: [0, 0] });
    m.rects.forEach((r) => {
      ctx.fillStyle = RPAL.bar; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = RPAL.text; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(r.muscle, r.x + r.w / 2, m.baseY + 11);
      if (r.count) ctx.fillText(String(r.count), r.x + r.w / 2, r.y - 3);
      ctx.textAlign = 'left';
    });
  }

  function drawPace(cv, series) {
    const c = fit(cv); if (!c) return;
    const { ctx, w, h } = c;
    ctx.clearRect(0, 0, w, h);
    if (series.length < 2) { emptyTxt(ctx, w, h, 'Нужно 2+ лёгких пробежки'); return; }
    const m = lineChartModel(series.map((p) => ({ e1rm: p.pace })), { w, h });
    ctx.fillStyle = RPAL.text; ctx.font = '11px sans-serif';
    ctx.fillText(An.fmtPace(m.max), 4, 16);
    ctx.fillText(An.fmtPace(m.min), 4, h - 8);
    ctx.strokeStyle = RPAL.line; ctx.lineWidth = 2; ctx.beginPath();
    m.pts.forEach((p, i) => { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.stroke();
    m.pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = RPAL.line; ctx.fill(); });
  }

  /* --- события --- */
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'type') { syncDraft(); draft.type = btn.dataset.v; err = ''; render(); }
    else if (act === 'log-run') logRun();
    else if (act === 'del-run') persist(St.deleteRun(state, btn.dataset.id));
  });

  function syncDraft() {
    for (const k of ['km', 'min', 'sec', 'hr', 'rpe']) {
      const el = root.querySelector('#run-' + k); if (el) draft[k] = el.value;
    }
    const d = root.querySelector('#run-date'); if (d) draft.date = d.value || today;
    const iv = root.querySelector('#run-intervals'); if (iv) draft.intervals = iv.value;
    const nt = root.querySelector('#run-note'); if (nt) draft.note = nt.value;
  }

  function logRun() {
    syncDraft();
    const km = parseFloat(draft.km);
    const durationSec = (parseInt(draft.min || 0, 10) || 0) * 60 + (parseInt(draft.sec || 0, 10) || 0);
    try {
      const r = St.addRun(state, {
        date: draft.date ? draft.date + 'T12:00:00.000Z' : undefined,
        type: draft.type,
        distanceKm: km,
        durationSec,
        avgHr: draft.hr, rpe: draft.rpe,
        intervals: draft.intervals.trim() || null,
        note: draft.note.trim() || null,
      });
      draft.km = ''; draft.min = ''; draft.sec = ''; draft.hr = ''; draft.rpe = ''; draft.intervals = ''; draft.note = '';
      err = '';
      persist(r.state);
    } catch (ex) {
      err = ex.message; render();
    }
  }

  render();
  return { render, getState: () => state };
}

if (typeof module !== 'undefined') {
  module.exports = { initRun };
}
