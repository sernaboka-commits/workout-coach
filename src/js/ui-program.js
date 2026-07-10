/* ============================================================
 * ui-program.js — конструктор дней A/B/C + библиотека упражнений
 * DOM в initProgram(); чистые хелперы экспортируются для тестов.
 * Зависимости в браузере — глобали store.js/exercises.js. В node
 * инъектируются через opts.store / opts.state.
 * ============================================================ */

/* ---------- чистые хелперы ---------- */

/** Дефолтные параметры элемента дня под тип упражнения. */
function defaultItemFor(ex) {
  const iso = ex.kind === 'isolation';
  return {
    exerciseId: ex.id,
    repRangeMin: iso ? 10 : 6,
    repRangeMax: iso ? 15 : 10,
    workSets: 3,
    targetRIR: 2,
    restSec: ex.kind === 'compound' ? 150 : 90,
  };
}

/** Короткое описание элемента дня для строки списка. */
function itemSummary(item, ex) {
  const name = ex ? ex.name : item.exerciseId;
  return `${name} · ${item.repRangeMin}–${item.repRangeMax}×${item.workSets} · RIR ${item.targetRIR} · ${item.restSec}с`;
}

/** Стартовая программа (день A) — засев пустой программы (заменит демо чанка 6). */
function starterProgram() {
  return [{
    id: 'day-a',
    label: 'A',
    items: [
      { exerciseId: 'bb-bench-press', repRangeMin: 6,  repRangeMax: 10, workSets: 3, targetRIR: 2, restSec: 180 },
      { exerciseId: 'bb-row',         repRangeMin: 8,  repRangeMax: 12, workSets: 3, targetRIR: 2, restSec: 150 },
      { exerciseId: 'ohp',            repRangeMin: 8,  repRangeMax: 12, workSets: 3, targetRIR: 2, restSec: 150 },
      { exerciseId: 'bb-curl',        repRangeMin: 10, repRangeMax: 15, workSets: 3, targetRIR: 2, restSec: 90  },
    ],
  }];
}

function seedProgramIfEmpty(state) {
  if (state.program.days.length > 0) return state;
  return { ...state, program: { ...state.program, days: starterProgram() } };
}

/* ---------- DOM ---------- */

function initProgram(root, opts = {}) {
  const St = opts.store || {
    load, save, searchExercises, getExercise,
    addDay, deleteDay, addDayItem, updateDayItem, removeDayItem, moveDayItem,
    addCustomExercise, deleteCustomExercise,
  };
  const lib = () => (opts.library || (typeof EXERCISE_LIBRARY !== 'undefined' ? EXERCISE_LIBRARY : []));
  const muscleLabels = opts.muscleLabels || (typeof MUSCLE_LABELS !== 'undefined' ? MUSCLE_LABELS : {});

  const onCommit = opts.onCommit || function () {};
  let state = opts.state || St.load(lib());
  let picker = null;   // { dayId } когда открыт выбор упражнения
  let query = '', muscle = null, customOpen = false;

  function persist(next) { state = next; St.save(state); onCommit(state); render(); }

  function render() {
    const days = state.program.days;
    const daysHtml = days.map((d) => dayCard(d)).join('') ||
      '<div class="placeholder">Нет дней. Добавьте первый.</div>';
    root.innerHTML = `
      <div class="prog-screen">
        <div class="prog-top">
          <div class="wk-title">Программа</div>
          <button class="btn" data-act="add-day">+ день</button>
        </div>
        ${daysHtml}
      </div>
      ${picker ? pickerHtml() : ''}`;
  }

  function dayCard(d) {
    const items = d.items.map((it, i) => {
      const ex = St.getExercise(state, it.exerciseId) || { name: it.exerciseId };
      return `
        <div class="prog-item" data-day="${d.id}" data-idx="${i}">
          <div class="pi-top">
            <div class="pi-name">${ex.name}</div>
            <div class="pi-ord">
              <button class="mini" data-act="up"   data-day="${d.id}" data-idx="${i}">↑</button>
              <button class="mini" data-act="down" data-day="${d.id}" data-idx="${i}">↓</button>
              <button class="mini" data-act="rm-item" data-day="${d.id}" data-idx="${i}">✕</button>
            </div>
          </div>
          <div class="pi-params">
            ${miniStep(d.id, i, 'repRangeMin', it.repRangeMin, 'повт min')}
            ${miniStep(d.id, i, 'repRangeMax', it.repRangeMax, 'повт max')}
            ${miniStep(d.id, i, 'workSets', it.workSets, 'сеты')}
            ${miniStep(d.id, i, 'targetRIR', it.targetRIR, 'RIR')}
            ${miniStep(d.id, i, 'restSec', it.restSec, 'отдых, с')}
          </div>
        </div>`;
    }).join('') || '<div class="pi-empty">Пусто — добавьте упражнение.</div>';

    return `
      <section class="day-card">
        <div class="day-head">
          <div class="day-label">День ${d.label}</div>
          <div>
            <button class="btn sm" data-act="add-item" data-day="${d.id}">+ упражнение</button>
            <button class="mini" data-act="del-day" data-day="${d.id}">🗑</button>
          </div>
        </div>
        ${items}
      </section>`;
  }

  function miniStep(dayId, idx, field, value, label) {
    return `
      <div class="mstep" data-field="${field}">
        <button class="ms-btn" data-act="p-" data-day="${dayId}" data-idx="${idx}" data-field="${field}">−</button>
        <div class="ms-val"><b>${value}</b><small>${label}</small></div>
        <button class="ms-btn" data-act="p+" data-day="${dayId}" data-idx="${idx}" data-field="${field}">+</button>
      </div>`;
  }

  function pickerHtml() {
    const results = St.searchExercises(state, { query, muscle });
    const chips = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']
      .map((m) => `<button class="chip${muscle === m ? ' on' : ''}" data-act="filter" data-m="${m}">${muscleLabels[m] || m}</button>`).join('');
    const list = results.map((e) =>
      `<button class="lib-row" data-act="pick" data-id="${e.id}">
         <span>${e.name}${e.isCustom ? ' <span class="badge cal">своё</span>' : ''}</span>
         <small>${muscleLabels[e.primaryMuscle] || e.primaryMuscle} · ${e.kind === 'compound' ? 'база' : 'изоляция'}</small>
       </button>`).join('') || '<div class="pi-empty">Ничего не найдено.</div>';

    const custom = customOpen ? `
      <div class="custom-form">
        <input class="in" id="cx-name" placeholder="Название своего упражнения">
        <div class="cx-err" id="cx-err"></div>
        <div class="chips">${['chest','back','legs','shoulders','arms','core'].map((m)=>`<button class="chip${m==='chest'?' on':''}" data-act="cx-m" data-m="${m}">${muscleLabels[m]||m}</button>`).join('')}</div>
        <div class="row">
          <button class="chip" data-act="cx-kind" data-kind="compound">база</button>
          <button class="chip on" data-act="cx-kind" data-kind="isolation">изоляция</button>
          <input class="in short" id="cx-step" type="number" step="0.5" value="2.5" placeholder="шаг, кг">
        </div>
        <button class="btn" data-act="cx-create">Создать и добавить</button>
      </div>` : `<button class="btn ghost" data-act="cx-open">+ своё упражнение</button>`;

    return `
      <div class="overlay" data-act="close-bg">
        <div class="sheet">
          <div class="sheet-head">
            <b>Выбрать упражнение</b>
            <button class="mini" data-act="close">✕</button>
          </div>
          <input class="in" id="lib-search" placeholder="Поиск…" value="${query}">
          <div class="chips">${chips}</div>
          <div class="lib-list">${list}</div>
          ${custom}
        </div>
      </div>`;
  }

  /* --- события --- */
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const dayId = btn.dataset.day, idx = btn.dataset.idx != null ? +btn.dataset.idx : null;

    switch (act) {
      case 'add-day': { const r = St.addDay(state); persist(r.state); break; }
      case 'del-day': { if (confirmDel('Удалить день?')) persist(St.deleteDay(state, dayId)); break; }
      case 'rm-item': persist(St.removeDayItem(state, dayId, idx)); break;
      case 'up': persist(St.moveDayItem(state, dayId, idx, -1)); break;
      case 'down': persist(St.moveDayItem(state, dayId, idx, +1)); break;
      case 'p-': case 'p+': stepParam(dayId, idx, btn.dataset.field, act === 'p+' ? +1 : -1); break;
      case 'add-item': picker = { dayId }; query = ''; muscle = null; customOpen = false; render(); break;
      case 'close': case 'close-bg': if (act === 'close' || e.target.classList.contains('overlay')) { picker = null; customOpen = false; render(); } break;
      case 'filter': muscle = (muscle === btn.dataset.m ? null : btn.dataset.m); render(); break;
      case 'pick': pickExercise(btn.dataset.id); break;
      case 'cx-open': customOpen = true; render(); break;
      // выбор мышцы/типа — только классы, без render (иначе стирается ввод названия)
      case 'cx-m': root.querySelectorAll('.custom-form [data-act="cx-m"]').forEach((x) => x.classList.remove('on')); btn.classList.add('on'); break;
      case 'cx-kind': root.querySelectorAll('[data-act="cx-kind"]').forEach((x) => x.classList.remove('on')); btn.classList.add('on'); break;
      case 'cx-create': createCustom(); break;
    }
  });

  // поиск: обновляем только список, чтобы не терять фокус ввода
  root.addEventListener('input', (e) => {
    if (e.target.id === 'lib-search') {
      query = e.target.value;
      const listEl = root.querySelector('.lib-list');
      if (listEl) {
        const results = St.searchExercises(state, { query, muscle });
        listEl.innerHTML = results.map((ex) =>
          `<button class="lib-row" data-act="pick" data-id="${ex.id}">
             <span>${ex.name}${ex.isCustom ? ' <span class="badge cal">своё</span>' : ''}</span>
             <small>${muscleLabels[ex.primaryMuscle] || ex.primaryMuscle} · ${ex.kind === 'compound' ? 'база' : 'изоляция'}</small>
           </button>`).join('') || '<div class="pi-empty">Ничего не найдено.</div>';
      }
    }
  });

  function stepParam(dayId, idx, field, dir) {
    const day = state.program.days.find((d) => d.id === dayId);
    const it = day.items[idx];
    const step = field === 'restSec' ? 15 : 1;
    const min = field === 'targetRIR' ? 0 : 1;
    let v = it[field] + dir * step;
    if (v < min) v = min;
    if (field === 'targetRIR' && v > 5) v = 5;
    if (field === 'repRangeMin' && v > it.repRangeMax) v = it.repRangeMax;
    if (field === 'repRangeMax' && v < it.repRangeMin) v = it.repRangeMin;
    persist(St.updateDayItem(state, dayId, idx, { [field]: v }));
  }

  function pickExercise(exId) {
    const ex = St.getExercise(state, exId);
    if (!ex || !picker) return;
    persist(St.addDayItem(state, picker.dayId, defaultItemFor(ex)));
    picker = null;
  }

  function createCustom() {
    const name = (root.querySelector('#cx-name') || {}).value || '';
    const step = (root.querySelector('#cx-step') || {}).value;
    const kindBtn = root.querySelector('.custom-form [data-act="cx-kind"].on');
    const kind = kindBtn ? kindBtn.dataset.kind : 'isolation';
    const mBtn = root.querySelector('.custom-form [data-act="cx-m"].on');
    const primaryMuscle = mBtn ? mBtn.dataset.m : 'chest';
    try {
      const r = St.addCustomExercise(state, { name, primaryMuscle, kind, weightStep: step });
      let next = r.state;
      if (picker) next = St.addDayItem(next, picker.dayId, defaultItemFor(r.exercise));
      picker = null; customOpen = false;
      persist(next);
    } catch (err) {
      const errEl = root.querySelector('#cx-err');   // без alert() — неблокирующая подсказка
      if (errEl) errEl.textContent = err.message;
    }
  }

  function confirmDel(msg) { return typeof confirm === 'undefined' ? true : confirm(msg); }

  render();
  return { render, getState: () => state };
}

/* export для node-тестов; в браузере — глобальные объявления */
if (typeof module !== 'undefined') {
  module.exports = { defaultItemFor, itemSummary, starterProgram, seedProgramIfEmpty, initProgram };
}
