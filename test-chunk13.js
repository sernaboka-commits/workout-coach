/* Тест чанка 13: база знаний (help.js), подсказки «?», пояснения калибровки */
const help = require('./src/js/help.js');
const uiw = require('./src/js/ui-workout.js');
const fs = require('fs');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

console.log('— HELP_TERMS: короткие пояснения —');
t('у каждого термина есть title и содержательный short', () => {
  for (const [id, x] of Object.entries(help.HELP_TERMS)) {
    assert(x.title && x.title.length > 2, id + ': title');
    assert(x.short && x.short.length > 40, id + ': short слишком короткий');
  }
});
t('присутствуют все термины, на которые ссылаются экраны', () => {
  // ids, используемые в hintBtn(...) по всем UI-файлам
  const used = new Set();
  for (const f of ['ui-workout.js', 'ui-analytics.js', 'ui-program.js', 'app.js']) {
    const src = fs.readFileSync('./src/js/' + f, 'utf8');
    for (const m of src.matchAll(/(?:hintBtn|_hint|hint)\('([a-z0-9-]+)'\)/g)) used.add(m[1]);
  }
  assert(used.size >= 6, 'найдено мало ссылок: ' + [...used].join(','));
  for (const id of used) assert(help.HELP_TERMS[id], 'нет термина: ' + id);
});
t('hintBtn: валидный id → кнопка с data-hint; неизвестный → пусто', () => {
  assert(help.hintBtn('rir').includes('data-hint="rir"'));
  assert(help.hintBtn('nope') === '');
});

console.log('— HELP_TOPICS: база знаний —');
t('каждая статья: id, заголовок, развёрнутый текст', () => {
  assert(help.HELP_TOPICS.length >= 6, 'мало статей');
  for (const x of help.HELP_TOPICS) {
    assert(x.id && x.title, JSON.stringify(x).slice(0, 40));
    assert(x.body && x.body.length > 120, x.id + ': body слишком короткий');
  }
});
t('ключевые темы на месте: методика, RIR, калибровка, программа, мезоцикл, мышцы', () => {
  const ids = help.HELP_TOPICS.map((x) => x.id);
  for (const need of ['method', 'rir', 'calibration', 'program', 'meso', 'muscles']) {
    assert(ids.includes(need), 'нет темы: ' + need);
  }
});
t('program-item отвечает на вопросы новичка: подходы=сеты, диапазон, вес', () => {
  const x = help.HELP_TERMS['program-item'];
  assert(/сеты/i.test(x.short), 'нет ответа «подходы = сеты»');
  assert(/от\/до/i.test(x.short) || /диапазон/i.test(x.short), 'нет объяснения диапазона');
  assert(/вес нигде не задаётся|веса в программе нет/i.test(x.short), 'нет ответа «куда вес класть»');
});

console.log('— calibrationGuide: пояснения калибровочной тренировки —');
const _item = { repRangeMin: 8, repRangeMax: 12 };
t('probe → шаг 1: лесенка, «не до отказа», упоминание пропуска', () => {
  const g = uiw.calibrationGuide({ mode: 'probe', rec: { weight: null, reps: 13 } }, _item);
  assert(g && g.step === '1', JSON.stringify(g));
  assert(/лесенк/i.test(g.text) && /не до отказа/i.test(g.text));
  assert(/~8 повторов/.test(g.text) && /пропусти/i.test(g.text), g.text);
});
t('ramp → шаг N+1, в тексте вес следующей ступени', () => {
  const g = uiw.calibrationGuide({ mode: 'ramp', calNo: 1, rec: { weight: 42.5, reps: 10 } }, _item);
  assert(g && g.step === '2', JSON.stringify(g));
  assert(g.text.includes('42.5 кг'), g.text);
  assert(uiw.calibrationGuide({ mode: 'ramp', calNo: 2, rec: { weight: 47.5 } }, _item).step === '3');
});
t('cal-done → итог: число прикидок и рабочий вес', () => {
  const g = uiw.calibrationGuide({ mode: 'cal-done', calCount: 3, workWeight: 37.5 }, _item);
  assert(g && g.step === '✓', JSON.stringify(g));
  assert(g.text.includes('37.5 кг') && g.text.includes('3 прикидок'), g.text);
});
t('обычная работа и «готово» → без пояснения', () => {
  assert(uiw.calibrationGuide({ mode: 'work' }, _item) === null);
  assert(uiw.calibrationGuide({ mode: 'done' }, _item) === null);
  assert(uiw.calibrationGuide(null, _item) === null);
});

console.log('— сборка: всё доехало в dist —');
t('dist/index.html содержит help.js, базу знаний и плашку обновления', () => {
  const dist = fs.readFileSync('./dist/index.html', 'utf8');
  for (const marker of ['HELP_TERMS', 'База знаний', 'upd-bar', 'cal-guide', 'hint-q']) {
    assert(dist.includes(marker), 'нет в dist: ' + marker);
  }
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
