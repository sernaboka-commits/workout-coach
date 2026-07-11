/* ============================================================
 * ui-program.js — конструктор дней A/B/C + библиотека упражнений
 * DOM в initProgram(); чистые хелперы экспортируются для тестов.
 * Зависимости в браузере — глобали store.js/exercises.js. В node
 * инъектируются через opts.store / opts.state.
 * ============================================================ */

/* ---------- чистые хелперы ---------- */

/** Сортировка библиотеки: группы мышц по порядку, внутри — по алфавиту.
 *  Так альтернативы на один пучок оказываются рядом. */
const MUSCLE_ORDER_UI = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];
function groupByMuscle(list) {
  return [...list].sort((a, b) => {
    const d = MUSCLE_ORDER_UI.indexOf(a.primaryMuscle) - MUSCLE_ORDER_UI.indexOf(b.primaryMuscle);
    return d !== 0 ? d : a.name.localeCompare(b.name, 'ru');
  });
}

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
    addDay, updateDay, deleteDay, addDayItem, updateDayItem, removeDayItem, moveDayItem,
    addCustomExercise, deleteCustomExercise,
  };
  const lib = () => (opts.library || (typeof EXERCISE_LIBRARY !== 'undefined' ? EXERCISE_LIBRARY : []));
  const muscleLabels = opts.muscleLabels || (typeof MUSCLE_LABELS !== 'undefined' ? MUSCLE_LABELS : {});

  const onCommit = opts.onCommit || function () {};
  let state = opts.state || St.load(lib());
  let picker = null;   // { dayId } когда открыт выбор упражнения
  let query = '', muscle = null, customOpen = false;
  let wiz = { count: 3, days: [], sex: 'm', goal: 'hypertrophy', time: 60, split: 'auto' };   // мастер создания программы

  function persist(next) { state = next; St.save(state); onCommit(state); render(); }

  function render() {
    const days = state.program.days;
    // программы нет → мастер: кол-во тренировок → дни недели → создать
    if (!days.length) {
      root.innerHTML = `<div class="prog-screen">${wizardHtml()}</div>`;
      return;
    }
    const daysHtml = days.map((d) => dayCard(d)).join('');
    root.innerHTML = `
      <div class="prog-screen">
        <div class="prog-top">
          <div class="wk-title">Программа</div>
          <div>
            <button class="btn ghost sm" data-act="wiz-reset">🪄 Мастер</button>
            <button class="btn sm" data-act="add-day">+ день</button>
          </div>
        </div>
        ${daysHtml}
      </div>
      ${picker ? pickerHtml() : ''}`;
  }

  function wizardHtml() {
    const wd = (typeof WEEKDAYS !== 'undefined') ? WEEKDAYS : ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const picked = wiz.days.length;
    const opt = (act, val, cur, label) =>
      `<button class="chip${cur === val ? ' on' : ''}" data-act="${act}" data-v="${val}">${label}</button>`;
    return `
      <div class="wk-title" style="padding:6px 4px 12px">Новая программа</div>
      <section class="day-card">
        <div class="wiz-step"><b>1.</b> Пол</div>
        <div class="chips">${opt('wiz-sex', 'm', wiz.sex, 'Мужчина')}${opt('wiz-sex', 'f', wiz.sex, 'Женщина')}</div>

        <div class="wiz-step"><b>2.</b> Цель</div>
        <div class="chips">
          ${opt('wiz-goal', 'hypertrophy', wiz.goal, 'Рост мышц')}
          ${opt('wiz-goal', 'strength', wiz.goal, 'Сила')}
          ${opt('wiz-goal', 'fitness', wiz.goal, 'Тонус')}
        </div>

        <div class="wiz-step"><b>3.</b> Сколько тренировок в неделю?</div>
        <div class="chips">${[2, 3, 4, 5].map((n) =>
          `<button class="chip${wiz.count === n ? ' on' : ''}" data-act="wiz-count" data-n="${n}">${n}</button>`).join('')}</div>

        <div class="wiz-step"><b>4.</b> В какие дни? <small>(выбрано ${picked}/${wiz.count})</small></div>
        <div class="chips">${wd.map((label, i) =>
          `<button class="chip${wiz.days.includes(i) ? ' on' : ''}" data-act="wiz-wd" data-wd="${i}">${label}</button>`).join('')}</div>

        <div class="wiz-step"><b>5.</b> Время на тренировку</div>
        <div class="chips">
          ${opt('wiz-time', 45, wiz.time, '45 мин')}
          ${opt('wiz-time', 60, wiz.time, '60 мин')}
          ${opt('wiz-time', 90, wiz.time, '90 мин')}
        </div>

        <div class="wiz-step"><b>6.</b> Формат</div>
        <div class="chips">
          ${opt('wiz-split', 'auto', wiz.split, 'Авто')}
          ${opt('wiz-split', 'full', wiz.split, 'Фулбади')}
          ${opt('wiz-split', 'split', wiz.split, 'По группам')}
        </div>

        <div class="meso-actions">
          <button class="btn" data-act="wiz-generate" ${picked === wiz.count ? '' : 'disabled'}>🪄 Подобрать упражнения</button>
          <button class="btn ghost" data-act="wiz-create" ${picked === wiz.count ? '' : 'disabled'}>Создать пустую</button>
        </div>
        <div class="meso-hint">Подбор — по принципам доказательного тренинга (Schoenfeld, Israetel/RP, Helms):
        10–20 сетов на группу в неделю, каждая группа ≥2×/нед, работа близко к отказу (RIR ведёт мезоцикл),
        приоритет упражнениям с растянутой позицией. Всё можно править после создания.</div>
      </section>`;
  }

  function dayCard(d) {
    const items = d.items.map((it, i) => {
      const ex = St.getExercise(state, it.exerciseId) || { name: it.exerciseId };
      return `
        <div class="prog-item" data-day="${d.id}" data-idx="${i}">
          <div class="pi-top">
            <div class="pi-name">${ex.name} <a class="vid-link" href="${videoUrl(ex)}" target="_blank" rel="noopener">🎬</a></div>
            <div class="pi-ord">
              <button class="mini" data-act="swap-item" data-day="${d.id}" data-idx="${i}" title="Заменить аналогом">⇄</button>
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

    const wd = (typeof WEEKDAYS !== 'undefined') ? WEEKDAYS : ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const wdChips = wd.map((label, i) =>
      `<button class="chip wd${d.weekday === i ? ' on' : ''}" data-act="set-wd" data-day="${d.id}" data-wd="${i}">${label}</button>`).join('');

    return `
      <section class="day-card">
        <div class="day-head">
          <div class="day-label">День ${d.label}${d.weekday != null ? ' · ' + wd[d.weekday] : ''}</div>
          <div>
            <button class="btn sm" data-act="add-item" data-day="${d.id}">+ упражнение</button>
            <button class="mini" data-act="del-day" data-day="${d.id}">🗑</button>
          </div>
        </div>
        <div class="chips wd-row">${wdChips}</div>
        ${items}
      </section>`;
  }

  function miniStep(dayId, idx, field, value, label) {
    return `
      <div class="mstep" data-field="${field}">
        <button class="ms-btn" data-act="p-" data-day="${dayId}" data-idx="${idx}" data-field="${field}">−</button>
        <label class="ms-val"><input class="ms-in" type="number" inputmode="numeric" data-day="${dayId}" data-idx="${idx}" data-field="${field}" value="${value}"><small>${label}</small></label>
        <button class="ms-btn" data-act="p+" data-day="${dayId}" data-idx="${idx}" data-field="${field}">+</button>
      </div>`;
  }

  /** Список библиотеки: сгруппирован по мышцам, с заголовками секций. */
  function libListHtml(results) {
    const sorted = groupByMuscle(results);
    let lastMuscle = null;
    const parts = [];
    for (const e of sorted) {
      if (e.primaryMuscle !== lastMuscle) {
        lastMuscle = e.primaryMuscle;
        parts.push(`<div class="lib-head">${muscleLabels[lastMuscle] || lastMuscle}</div>`);
      }
      parts.push(`<button class="lib-row" data-act="pick" data-id="${e.id}">
         <span>${e.name}${e.isCustom ? ' <span class="badge cal">своё</span>' : ''}</span>
         <small>${muscleLabels[e.primaryMuscle] || e.primaryMuscle} · ${e.kind === 'compound' ? 'база' : 'изоляция'}</small>
       </button>`);
    }
    return parts.join('') || '<div class="pi-empty">Ничего не найдено.</div>';
  }

  function pickerHtml() {
    const results = St.searchExercises(state, { query, muscle });
    const chips = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core']
      .map((m) => `<button class="chip${muscle === m ? ' on' : ''}" data-act="filter" data-m="${m}">${muscleLabels[m] || m}</button>`).join('');
    const list = libListHtml(results);

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
            <b>${picker && picker.replaceIdx != null ? 'Заменить аналогом (та же группа)' : 'Выбрать упражнение'}</b>
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
      case 'wiz-sex': wiz.sex = btn.dataset.v; render(); break;
      case 'wiz-goal': wiz.goal = btn.dataset.v; render(); break;
      case 'wiz-time': wiz.time = +btn.dataset.v; render(); break;
      case 'wiz-split': wiz.split = btn.dataset.v; render(); break;
      case 'wiz-count': wiz.count = +btn.dataset.n; wiz.days = wiz.days.slice(0, wiz.count); render(); break;
      case 'wiz-wd': {
        const w = +btn.dataset.wd;
        if (wiz.days.includes(w)) wiz.days = wiz.days.filter((x) => x !== w);
        else if (wiz.days.length < wiz.count) wiz.days = [...wiz.days, w];
        render(); break;
      }
      case 'wiz-create': {
        if (wiz.days.length !== wiz.count) break;
        let next = state;
        for (const w of [...wiz.days].sort((a, b) => a - b)) {
          const r = St.addDay(next, { weekday: w });
          next = r.state;
        }
        persist(next); break;
      }
      case 'wiz-generate': {
        if (wiz.days.length !== wiz.count) break;
        const gen = generateProgram(
          { sex: wiz.sex, goal: wiz.goal, daysPerWeek: wiz.count, minutes: wiz.time, split: wiz.split },
          state.exercises
        );
        const wds = [...wiz.days].sort((a, b) => a - b);
        let next = state;
        gen.days.forEach((gd, i) => {
          const r = St.addDay(next, { label: gd.label, weekday: wds[i] });
          next = r.state;
          for (const it of gd.items) next = St.addDayItem(next, r.day.id, it);
        });
        persist(next); break;
      }
      case 'wiz-reset': {
        if (!confirmDel('Пересоздать программу? Текущие дни будут удалены (история тренировок сохранится).')) break;
        let next = state;
        for (const d of [...state.program.days]) next = St.deleteDay(next, d.id);
        wiz.days = [];
        persist(next); break;
      }
      case 'set-wd': {
        const cur = state.program.days.find((d) => d.id === dayId);
        const w = +btn.dataset.wd;
        persist(St.updateDay(state, dayId, { weekday: cur && cur.weekday === w ? null : w }));
        break;
      }
      case 'add-day': { const r = St.addDay(state); persist(r.state); break; }
      case 'del-day': { if (confirmDel('Удалить день?')) persist(St.deleteDay(state, dayId)); break; }
      case 'rm-item': persist(St.removeDayItem(state, dayId, idx)); break;
      case 'up': persist(St.moveDayItem(state, dayId, idx, -1)); break;
      case 'down': persist(St.moveDayItem(state, dayId, idx, +1)); break;
      case 'p-': case 'p+': stepParam(dayId, idx, btn.dataset.field, act === 'p+' ? +1 : -1); break;
      case 'add-item': picker = { dayId }; query = ''; muscle = null; customOpen = false; render(); break;
      case 'swap-item': {
        // замена аналогом: открываем список сразу с фильтром на ту же группу мышц
        const day = state.program.days.find((d) => d.id === dayId);
        const cur = day && St.getExercise(state, day.items[idx].exerciseId);
        picker = { dayId, replaceIdx: idx };
        query = ''; muscle = cur ? cur.primaryMuscle : null; customOpen = false;
        render(); break;
      }
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
      if (listEl) listEl.innerHTML = libListHtml(St.searchExercises(state, { query, muscle }));
    }
  });

  // ручной ввод параметров дня: коммитим по завершении ввода (без render — не ломаем каретку/клики)
  root.addEventListener('change', (e) => {
    const inp = e.target.closest('.ms-in');
    if (!inp) return;
    const dayId = inp.dataset.day, idx = +inp.dataset.idx, field = inp.dataset.field;
    const day = state.program.days.find((d) => d.id === dayId);
    const it = day && day.items[idx];
    if (!it) return;
    let v = parseFloat(inp.value);
    if (isNaN(v)) v = it[field];
    const min = field === 'restSec' ? 0 : field === 'targetRIR' ? 0 : 1;
    v = Math.max(min, Math.round(v));
    if (field === 'targetRIR') v = Math.min(5, v);
    if (field === 'repRangeMin') v = Math.min(v, it.repRangeMax);
    if (field === 'repRangeMax') v = Math.max(v, it.repRangeMin);
    state = St.updateDayItem(state, dayId, idx, { [field]: v });
    St.save(state); onCommit(state);
    inp.value = v;
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
    const { dayId, replaceIdx } = picker;
    picker = null;                 // закрыть оверлей ДО persist — persist перерисовывает экран
    if (replaceIdx != null) {
      // замена: упражнение меняется, сеты/повторы/отдых пользователя сохраняются
      persist(St.updateDayItem(state, dayId, replaceIdx, { exerciseId: exId }));
    } else {
      persist(St.addDayItem(state, dayId, defaultItemFor(ex)));
    }
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
  module.exports = { defaultItemFor, itemSummary, starterProgram, seedProgramIfEmpty, initProgram, groupByMuscle, MUSCLE_ORDER_UI };
}
