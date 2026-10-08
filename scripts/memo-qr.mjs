// QR-коды мемо: три на коробке ведут на игру (/igra/), один на карточке «Ваша идея» — на форму идеи (/igra/ideya/).
// Запуск: npm run memo:qr   (адрес сайта — SITE_URL из .env или https://engineeringclub.ru)
// Результат:
//  - «Карточки МЕМО/Коробка с QR.png» — развёртка для печати (тот же размер, что и «Коробка.png»);
//  - «Карточки МЕМО/Ваша идея с QR.png» — карточка 25 для печати (её же берут сайт и ролики);
//  - «Карточки МЕМО/QR/qr-igra.svg|png», «qr-ideya.svg|png» — отдельные коды для макетов.
// Печатать только после подключения домена: QR ведёт на адрес сайта.

import QRCode from 'qrcode';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

if (existsSync('.env')) for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*SITE_URL\s*=\s*(.*?)\s*$/);
  if (m && !process.env.SITE_URL) process.env.SITE_URL = m[1].replace(/^(['"])(.*)\1$/, '$2');
}
const SITE = (process.env.SITE_URL || 'https://engineeringclub.ru').replace(/\/+$/, '');
const DIR = 'Карточки МЕМО';
const INK = '#3a2313', CREAM = '#f7efdc';
const LINKS = { igra: `${SITE}/igra/`, ideya: `${SITE}/igra/ideya/` };

// Места под QR на развёртке «Коробка.png» (2808×1985): светлые квадраты внутри рамок.
// rotate: 180 — нижний клапан напечатан вверх ногами.
const SPOTS = [
  { x: 2194, y: 417, size: 204, rotate: 0 },   // верхний клапан, рядом с «Инженерный клуб»
  { x: 2175, y: 1079, size: 186, rotate: 0 },  // задняя стенка, «Продолжение — на сайте»
  { x: 1495, y: 1362, size: 204, rotate: 180 }, // нижний клапан
];
// Карточка «Ваша идея» (1024×1536): пустая рамка по центру, внутри x 260–763, y 785–1265
const IDEA = { x: 291, y: 805, size: 440 };

// QR как SVG: квадратные модули, поле 2 модуля (внутри светлого квадрата рамки)
function qrSvg(text, px, margin = 2, bg = CREAM) {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, total = n + margin * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(y, x)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${bg}"/><path fill="${INK}" d="${d}"/></svg>`;
}

mkdirSync(`${DIR}/QR`, { recursive: true });
sharp.cache(false);
for (const [name, url] of Object.entries(LINKS)) {
  writeFileSync(`${DIR}/QR/qr-${name}.svg`, qrSvg(url, 1000, 4));
  await sharp(Buffer.from(qrSvg(url, 1200, 4))).png().toFile(`${DIR}/QR/qr-${name}.png`);
}

const layers = [];
for (const s of SPOTS) {
  let img = sharp(Buffer.from(qrSvg(LINKS.igra, s.size))).png();
  if (s.rotate) img = img.rotate(s.rotate);
  layers.push({ input: await img.toBuffer(), left: s.x, top: s.y });
}
await sharp(readFileSync(`${DIR}/Коробка.png`)).composite(layers).png({ compressionLevel: 9 }).toFile(`${DIR}/Коробка с QR.png`);

const ideaQr = await sharp(Buffer.from(qrSvg(LINKS.ideya, IDEA.size, 2, '#f7e6c4'))).png().toBuffer();
await sharp(readFileSync(`${DIR}/Ваша идея.png`)).composite([{ input: ideaQr, left: IDEA.x, top: IDEA.y }]).png({ compressionLevel: 9 }).toFile(`${DIR}/Ваша идея с QR.png`);

console.log(`QR: коробка → ${LINKS.igra}, карточка «Ваша идея» → ${LINKS.ideya}`);
console.log(`Готово: «${DIR}/Коробка с QR.png», «${DIR}/Ваша идея с QR.png» и папка «${DIR}/QR/»`);
