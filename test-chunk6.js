/* Тест чанка 6: сборка dist/index.html (node) */
const fs = require('fs');
const path = require('path');
const { build } = require('./src/build.js');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '->', e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assert'); };

console.log('— сборка dist/index.html —');
const outPath = build();
const html = fs.readFileSync(outPath, 'utf8');

t('dist/index.html создан и непустой', () => {
  assert(fs.existsSync(outPath) && html.length > 5000, 'size=' + html.length);
});
t('нет внешних ссылок (полностью офлайн, один файл)', () => {
  assert(!/<script src=/.test(html), 'остался внешний <script src>');
  assert(!/<link rel="stylesheet"/.test(html), 'остался внешний <link>');
});
t('CSS заинлайнен (есть тема)', () => {
  assert(/<style>/.test(html) && /--accent/.test(html) && /\.rest-bar/.test(html));
});
t('все модули заинлайнены', () => {
  const markers = [
    'EXERCISE_LIBRARY',      // exercises
    'function save',         // store
    'function recommend',    // engine
    'function weeklyVolume', // analytics
    'function initWorkout',  // ui-workout
    'function initProgram',  // ui-program
    'function initAnalytics',// ui-analytics
    'function initApp',      // app
  ];
  for (const m of markers) assert(html.includes(m), 'нет модуля: ' + m);
});
t('точки монтирования всех экранов присутствуют', () => {
  ['workout-root', 'program-root', 'analytics-root', 'settings-root'].forEach((id) =>
    assert(html.includes('id="' + id + '"'), 'нет ' + id));
});
t('экспортные блоки node не ломают браузер (обёрнуты в typeof module)', () => {
  // каждый module.exports должен идти под защитой typeof module
  const idx = html.indexOf('module.exports');
  assert(idx === -1 || /typeof module/.test(html), 'module.exports без защиты');
});
t('порядок: store и engine раньше app', () => {
  assert(html.indexOf('function save') < html.indexOf('function initApp'));
  assert(html.indexOf('function recommend') < html.indexOf('function initApp'));
});

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
