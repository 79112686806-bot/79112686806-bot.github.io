// Картинки карточек для роликов: «../Карточки МЕМО/*.png» → public/cards/<slug>.jpg (1024×1536)
// Тексты роликов берутся прямо из ../content/memo.json. Запуск: npm run prepare-cards
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';

const sharp = createRequire(new URL('../package.json', import.meta.url))('sharp'); // sharp из корня сайта
sharp.cache(false);
const SRC = '../Карточки МЕМО';
const cards = JSON.parse(readFileSync('../content/memo.json', 'utf8'));
mkdirSync('public/cards', { recursive: true });
for (const [file, slug] of [...cards.map((c) => [c.image, c.slug]), ['Оборотная сторона.png', 'back']]) {
  const withQr = file.replace(/.png$/, ' с QR.png'); // карточка «Ваша идея» с QR (npm run memo:qr в корне)
  await sharp(readFileSync(`${SRC}/${existsSync(`${SRC}/${withQr}`) ? withQr : file}`)).resize(1024, 1536, { fit: 'cover' }).jpeg({ quality: 90 }).toFile(`public/cards/${slug}.jpg`);
}
console.log(`Готово: public/cards/ — ${cards.length + 1} картинок`);
