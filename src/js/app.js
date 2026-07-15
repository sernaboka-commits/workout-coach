/* ============================================================
 * app.js — контроллер приложения: общий state, роутер экранов,
 * экран настроек (мезоцикл + бэкап), напоминание о бэкапе.
 * Единственный владелец state в браузере: экраны получают его и
 * возвращают изменения через onCommit — store.save() остаётся
 * единственной точкой записи.
 * ============================================================ */

function initApp() {
  // общий state (владелец — app.js); пустая программа не засевается —
  // вместо этого экран «Программа» показывает мастер создания
  let state = load(EXERCISE_LIBRARY);

  // экраны сообщают об изменениях сюда — держим один объект state
  const onCommit = (next) => { state = next; };

  const SCREENS = {
    workout: (root) => initWorkout(root, { state, onCommit }),
    run: (root) => initRun(root, { state, onCommit }),
    program: (root) => initProgram(root, { state, onCommit }),
    analytics: (root) => initAnalytics(root, { state, onCommit }),
    settings: (root) => renderSettings(root),
  };

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.screen === name));
    // монтируем экран заново из актуального общего state
    SCREENS[name](document.getElementById(name + '-root'));
  }

  document.getElementById('nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-screen]');
    if (b) show(b.dataset.screen);
  });

  /* ---------- экран настроек: мезоцикл + бэкап ---------- */

  function effectiveHrMax() {
    const s = state.settings;
    return s.hrMax || (s.age ? hrMaxTanaka(s.age) : null);
  }

  function hrZonesHtml() {
    const zones = hrZones({ hrMax: effectiveHrMax(), hrRest: state.settings.hrRest });
    if (!zones) return '<div class="pi-empty">Укажи возраст или пульс макс — покажу твои зоны.</div>';
    const method = state.settings.hrRest ? 'Карвонен (резерв ЧСС)' : '% от ЧССmax';
    return `<div class="hr-zones">${zones.map((z) =>
      `<div class="hr-zone z${z.n}"><span class="hz-n">Z${z.n}</span>
         <span class="hz-name">${z.name}</span>
         <span class="hz-bpm">${z.lo}–${z.hi}</span></div>`).join('')}</div>
      <div class="meso-hint">Метод: ${method}. ЧССmax ${effectiveHrMax()}${state.settings.hrRest ? ', покой ' + state.settings.hrRest : ''} уд/мин.</div>`;
  }

  function renderSettings(root) {
    const m = mesoStatus(state);
    const overdue = backupOverdue(state);
    const last = state.settings.lastBackupAt ? state.settings.lastBackupAt.slice(0, 10) : 'никогда';

    root.innerHTML = `
      <div class="an-screen">
        <div class="wk-title">Настройки</div>

        <section class="an-card">
          <div class="an-head"><b>Мезоцикл ${hintBtn('meso')}</b></div>
          <div class="meso-row">
            <div class="meso-badge">Цикл ${m.cycleNo}</div>
            <div class="meso-badge">Неделя ${m.weekNo}${m.isDeload ? ' · делоуд' : ''}</div>
            <div class="meso-badge">Цель RIR ${m.targetRIR}</div>
          </div>
          <div class="meso-actions">
            <button class="btn" data-act="adv-week">Завершить неделю →</button>
            <button class="btn ghost sm" data-act="deload-earlier">Делоуд раньше</button>
            <button class="btn ghost sm" data-act="deload-later">Делоуд позже</button>
          </div>
          <div class="meso-hint">Делоуд на неделе ${m.deloadWeek}${m.deloadShift ? ` (сдвиг ${m.deloadShift > 0 ? '+' : ''}${m.deloadShift})` : ''}. Сдвиг ±1 — риск из PRD.</div>
        </section>

        <section class="an-card">
          <div class="an-head"><b>Пульсовые зоны</b></div>
          <div class="run-grid">
            <label class="run-f"><small>возраст</small><input class="in" id="hr-age" type="number" inputmode="numeric" min="10" max="99" placeholder="напр. 46" value="${state.settings.age || ''}"></label>
            <label class="run-f"><small>пульс макс</small><input class="in" id="hr-max" type="number" inputmode="numeric" min="120" max="220" placeholder="${state.settings.age ? '≈' + hrMaxTanaka(state.settings.age) : 'или возраст'}" value="${state.settings.hrMax || ''}"></label>
            <label class="run-f"><small>пульс покоя</small><input class="in" id="hr-rest" type="number" inputmode="numeric" min="30" max="100" placeholder="опц." value="${state.settings.hrRest || ''}"></label>
          </div>
          ${hrZonesHtml()}
          <div class="meso-hint">Не знаешь макс? Впиши возраст — прикинем по формуле Танаки (208−0.7·возраст). Пульс покоя (утром, лёжа) уточняет зоны методом Карвонена (по резерву ЧСС).</div>
        </section>

        <section class="an-card">
          <div class="an-head"><b>Бэкап данных</b></div>
          ${overdue ? '<div class="cx-err" style="color:var(--warn)">Пора сделать бэкап — данные хранятся только в этом браузере.</div>' : ''}
          <div class="meso-hint">Последний бэкап: ${last}. Сессий: ${state.sessions.length}.</div>
          <div class="meso-hint" id="storage-status"></div>
          <div class="meso-actions">
            <button class="btn" data-act="export">Скачать JSON</button>
            <label class="btn ghost" style="cursor:pointer">Импорт JSON
              <input type="file" id="import-file" accept="application/json,.json" style="display:none">
            </label>
          </div>
          <div class="cx-err" id="backup-msg"></div>
        </section>

        <section class="an-card">
          <div class="an-head"><b>База знаний</b><small>методика и термины</small></div>
          ${HELP_TOPICS.map((t) => `
            <details class="kb-topic">
              <summary>${t.title}</summary>
              <div class="kb-body">${t.body}</div>
            </details>`).join('')}
        </section>
      </div>`;

    root.onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'adv-week') { state = advanceWeek(state); save(state); renderSettings(root); }
      else if (act === 'deload-earlier') { state = shiftDeload(state, -1); save(state); renderSettings(root); }
      else if (act === 'deload-later') { state = shiftDeload(state, +1); save(state); renderSettings(root); }
      else if (act === 'export') { doExport(root); }
    };

    // правка пульсовых настроек — по завершении ввода, с пересчётом таблицы зон
    root.onchange = (e) => {
      const map = { 'hr-age': 'age', 'hr-max': 'hrMax', 'hr-rest': 'hrRest' };
      const field = map[e.target.id];
      if (!field) return;
      state = updateSettings(state, { [field]: e.target.value });
      save(state); renderSettings(root);
    };

    const fileInput = root.querySelector('#import-file');
    if (fileInput) fileInput.addEventListener('change', (e) => doImport(e, root));

    // статус постоянного хранилища (заполняется асинхронно)
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((p) => {
        const el = root.querySelector('#storage-status');
        if (el) el.textContent = p
          ? '✓ Хранилище постоянное: браузер не удалит данные при автоочистке.'
          : 'Браузер может стереть данные при долгом неиспользовании или нехватке места — скачивай бэкап и храни в облаке.';
      }).catch(() => {});
    }
  }

  function doExport(root) {
    const b = exportBackup(state);
    state = b.state; save(state);                        // фиксируем дату бэкапа
    const url = URL.createObjectURL(new Blob([b.json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = b.filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    renderSettings(root);
  }

  function doImport(e, root) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = importBackup(String(reader.result));
        save(state);
        renderSettings(root);
      } catch (err) {
        const msg = root.querySelector('#backup-msg');
        if (msg) msg.textContent = 'Не удалось импортировать: ' + err.message;
      }
    };
    reader.readAsText(file);
  }

  // просим браузер сделать хранилище постоянным: без этого iOS/Android
  // могут стереть localStorage неактивного сайта при автоочистке
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted()
      .then((p) => p || navigator.storage.persist())
      .catch(() => {});
  }

  /* ---------- подсказки «?» у терминов (единый обработчик) ----------
   * Кнопки hintBtn() рассыпаны по всем экранам; попап вставляется после
   * ближайшего блока и живёт до клика/перерисовки экрана. */
  document.addEventListener('click', (e) => {
    const q = e.target.closest('.hint-q');
    const openPop = document.querySelector('.hint-pop');
    if (openPop && (!q || openPop._src === q)) openPop.remove();   // клик мимо/повторный — закрыть
    if (!q) return;
    if (openPop && openPop._src === q) return;
    const t = HELP_TERMS[q.dataset.hint];
    if (!t) return;
    const box = document.createElement('div');
    box.className = 'hint-pop';
    box._src = q;
    box.innerHTML = `<b>${t.title}</b><div>${t.short}</div>`;
    const anchor = q.closest('.an-head, .wk-head, .ex-head, .rec-line') || q.parentElement;
    anchor.insertAdjacentElement('afterend', box);
  });

  /* ---------- плашка «доступна новая версия» ----------
   * SW при установке делает skipWaiting, поэтому достаточно предложить
   * перезагрузку — network-first подтянет свежий index.html. */
  function watchUpdates(reg) {
    const show = () => {
      if (document.getElementById('upd-bar')) return;
      const bar = document.createElement('div');
      bar.id = 'upd-bar';
      bar.innerHTML = `<span>Доступна новая версия</span><button id="upd-go">Обновить</button>`;
      document.body.appendChild(bar);
      bar.querySelector('#upd-go').addEventListener('click', () => location.reload());
    };
    if (reg.waiting) show();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        // controller есть = это обновление, а не первая установка
        if (nw.state === 'installed' && navigator.serviceWorker.controller) show();
      });
    });
    // проверяем обновления при возвращении в приложение (PWA живёт долго)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }

  // офлайн: регистрируем service worker (только в защищённом контексте — Pages/localhost)
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () =>
      navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {}));
  }

  // старт: экран тренировки; мягкое напоминание о бэкапе
  show('workout');
  if (backupOverdue(state)) {
    const b = document.querySelector('#nav button[data-screen="settings"]');
    if (b) b.classList.add('nudge');
  }
}

if (typeof module !== 'undefined') {
  module.exports = { initApp };
} else if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
  else initApp();
}
