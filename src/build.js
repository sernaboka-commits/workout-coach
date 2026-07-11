/* ============================================================
 * build.js — склейка src → dist/index.html (без бандлера).
 * Инлайнит <link rel=stylesheet> и <script src> содержимым файлов,
 * чтобы получить один офлайн-HTML. Запуск: node src/build.js
 * ============================================================ */

const fs = require('fs');
const path = require('path');

function build() {
  const srcDir = __dirname;
  const distDir = path.join(srcDir, '..', 'dist');
  const read = (rel) => fs.readFileSync(path.join(srcDir, rel), 'utf8');

  let html = read('index.html');

  // инлайним CSS
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
    `<style>\n${read(href)}\n</style>`
  );

  // инлайним JS (сохраняя порядок подключения)
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
    `<script>\n${read(src)}\n</script>`
  );

  fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, 'index.html');
  fs.writeFileSync(outPath, html);

  // копия для GitHub Pages (раздаёт только корень или /docs)
  const docsDir = path.join(srcDir, '..', 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'index.html'), html);

  return outPath;
}

if (require.main === module) {
  const out = build();
  console.log('Собрано:', out, '(' + fs.statSync(out).size + ' байт)');
}

module.exports = { build };
