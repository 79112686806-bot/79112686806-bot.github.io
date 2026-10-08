// Рендер роликов мемо в out/<номер>-<адрес>.mp4. Запуск: npm run render  (или npm run render -- 05 12 — только выбранные)
// Перед первым запуском: npm install и npm run prepare-cards.
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const only = process.argv.slice(2);
mkdirSync('out', { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve('src/index.ts'), publicDir: resolve('public') });
const comps = (await getCompositions(serveUrl)).filter((c) => !only.length || only.some((n) => c.id.startsWith(n)));

for (const [i, comp] of comps.entries()) {
  const out = `out/${comp.id}.mp4`;
  if (!only.length && existsSync(out)) { console.log(`${comp.id}: уже есть, пропускаю`); continue; }
  const t = Date.now();
  // crf 28: пергамент и текст почти неподвижны — качество не страдает, файл в разы меньше
  await renderMedia({ composition: comp, serveUrl, codec: 'h264', crf: 28, outputLocation: out, inputProps: comp.defaultProps });
  console.log(`${i + 1}/${comps.length} ${comp.id}: ${Math.round((Date.now() - t) / 1000)} с`);
}
console.log('Готово: video/out/');
