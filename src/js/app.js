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

  function renderSettings(root) {
    const m = mesoStatus(state);
    const overdue = backupOverdue(state);
    const last = state.settings.lastBackupAt ? state.settings.lastBackupAt.slice(0, 10) : 'никогда';

    root.innerHTML = `
      <div class="an-screen">
        <div class="wk-title">Настройки</div>

        <section class="an-card">
          <div class="an-head"><b>Мезоцикл</b></div>
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
          <div class="an-head"><b>Бэкап данных</b></div>
          ${overdue ? '<div class="cx-err" style="color:var(--warn)">Пора сделать бэкап — данные хранятся только в этом браузере.</div>' : ''}
          <div class="meso-hint">Последний бэкап: ${last}. Сессий: ${state.sessions.length}.</div>
          <div class="meso-actions">
            <button class="btn" data-act="export">Скачать JSON</button>
            <label class="btn ghost" style="cursor:pointer">Импорт JSON
              <input type="file" id="import-file" accept="application/json,.json" style="display:none">
            </label>
          </div>
          <div class="cx-err" id="backup-msg"></div>
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

    const fileInput = root.querySelector('#import-file');
    if (fileInput) fileInput.addEventListener('change', (e) => doImport(e, root));
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
