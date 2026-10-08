// Сжатие картинок мемо: «Карточки МЕМО/*.png» (≈3,7 МБ каждая) → assets/memo/*.webp.
// Запуск: npm run memo:images   (нужен sharp: npm install)
//  - <slug>-s.webp — 240×360, для игрового поля
//  - <slug>.webp   — 640×960, для окна с историей и страницы карточки
//  - back(-s).webp — рубашка карточки

import sharp from 'sharp';
import { readFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'Карточки МЕМО', OUT = 'assets/memo';
const cards = JSON.parse(readFileSync('content/memo.json', 'utf8'));
mkdirSync(OUT, { recursive: true });
sharp.cache(false);

const jobs = [...cards.map((c) => [c.image, c.slug]), ['Оборотная сторона.png', 'back']];
let total = 0;
for (const [file, slug] of jobs) {
  // если есть версия с QR (npm run memo:qr — карточка «Ваша идея»), берём её
  const withQr = file.replace(/.png$/, ' с QR.png');
  const input = readFileSync(join(SRC, existsSync(join(SRC, withQr)) ? withQr : file));
  for (const [suffix, w, h, q] of [['-s', 240, 360, 72], ['', 640, 960, 76]]) {
    const out = join(OUT, `${slug}${suffix}.webp`);
    await sharp(input).resize(w, h, { fit: 'cover' }).webp({ quality: q, effort: 6 }).toFile(out);
    total += statSync(out).size;
  }
}
console.log(`Готово: ${OUT}/ — ${jobs.length * 2} файлов, ${(total / 1048576).toFixed(1)} МБ`);
