// Импорт историй мемо из Word-документа в content/memo.json.
// Запуск: node scripts/memo-import.mjs  (после правки документа в папке «Карточки МЕМО»)
// Документ: заголовок «N. Название (годы)», фраза-крючок, рубрики «Коротко.», «История.» … «Ищи связь:».

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

const DIR = 'Карточки МЕМО';
const docx = readdirSync(DIR).find((f) => f.endsWith('.docx'));
if (!docx) throw new Error(`В папке «${DIR}» нет документа .docx`);

// .docx — это zip-архив; достаём из него word/document.xml без сторонних программ
function readZipEntry(buf, name) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(eocd + 16); // начало центрального каталога
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), entry = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`В документе нет ${name}`);
}
const xml = readZipEntry(readFileSync(join(DIR, docx)), 'word/document.xml').toString('utf8');

const unesc = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const paras = xml.split(/<\/w:p>/).map((p) => ({
  style: (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '',
  text: unesc([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).trim(),
})).filter((p) => p.text);

// Рубрики в порядке документа
const RUBRICS = [
  ['short', 'Коротко'], ['history', 'История'], ['how', 'Как это работает'], ['then', 'Тогда и сейчас'],
  ['fact', 'Удивительно, но факт'], ['try', 'Попробуй сам'], ['think', 'Подумай'],
];

// Картинка карточки и адрес страницы (латиницей) для каждой карточки
const META = {
  'Колесо': ['koleso', 'Колесо.png'],
  'Корабль': ['korabl', 'Корабль.png'],
  'Леонардо да Винчи': ['leonardo-da-vinchi', 'Леонардо.png'],
  'Джеймс Уатт': ['dzheyms-uatt', 'Джеймс Уатт.png'],
  'Паровая машина': ['parovaya-mashina', 'Паровой двигатель.png'],
  'Алессандро Вольта': ['alessandro-volta', 'Алессандро Вольта (1745–1827).png'],
  'Двигатель внутреннего сгорания': ['dvigatel-vnutrennego-sgoraniya', 'Двигатель внутреннего сгорания.png'],
  'Карл Бенц': ['karl-benc', 'Карл Бенц (1844–1929).png'],
  'Автомобиль': ['avtomobil', 'Автомобиль.png'],
  'Томас Эдисон': ['tomas-edison', 'Томас Эдисон.png'],
  'Лампочка': ['lampochka', 'Лампочка.png'],
  'Никола Тесла': ['nikola-tesla', 'Никола Тесла.png'],
  'Александр Попов': ['aleksandr-popov', 'Александр Попов.png'],
  'Генри Форд': ['genri-ford', 'Генри Форд.png'],
  'Самолёт': ['samolet', 'Самолет.png'],
  'Константин Циолковский': ['konstantin-ciolkovskiy', 'Константин Циолковский.png'],
  'Транзистор': ['tranzistor', 'Транзистор.png'],
  'Робот': ['robot', 'Робот.png'],
  'Интернет': ['internet', 'Интернет.png'],
  'Телефон': ['telefon', 'Телефон.png'],
  'Рентген': ['rentgen', 'Рентген.png'],
  'Квантовые технологии': ['kvantovye-tehnologii', 'Квантовый.png'],
  'Биотехнологии': ['biotehnologii', 'Биотехнологии.png'],
  'Самовосстанавливающиеся материалы': ['samovosstanavlivayushchiesya-materialy', 'Самовосстанавливающиеся материалы.png'],
  'Ещё не придуманные технологии': ['tvoya-ideya', 'Ваша идея.png'],
};

const cards = [];
let card = null, lastSection = null;
for (const p of paras) {
  const head = p.style.startsWith('Heading') && p.text.match(/^(\d+)\.\s+(.+?)(?:\s+\((\d{4}[–-]\d{4})\))?$/);
  if (head) {
    const title = head[2].trim();
    if (!META[title]) throw new Error(`Нет адреса и картинки для карточки «${title}» — добавьте в META`);
    card = { n: +head[1], slug: META[title][0], title, years: head[3] || null, image: META[title][1], hook: '', sections: [], links: [], linksText: '' };
    cards.push(card); lastSection = null; continue;
  }
  if (!card) continue;
  if (p.style.startsWith('Heading')) { card = null; continue; }
  const link = p.text.match(/^Ищи связь:\s*(.+)$/);
  if (link) { card.linksText = link[1]; lastSection = null; continue; }
  // рубрика: «Название.» или «Название (пометка).», например «Попробуй сам (со взрослым).»
  let m = null;
  const rub = RUBRICS.find(([, name]) => (m = p.text.match(new RegExp('^' + name + '(?:\\s*\\(([^)]+)\\))?\\.\\s*'))));
  if (rub) {
    lastSection = { key: rub[0], title: rub[1], note: m[1] || null, text: p.text.slice(m[0].length).trim(), list: [] };
    card.sections.push(lastSection); continue;
  }
  if (p.style === 'ListParagraph' && lastSection) { lastSection.list.push(p.text); continue; }
  if (!card.hook && !card.sections.length) { card.hook = p.text; continue; }
  if (lastSection) lastSection.text += '\n' + p.text; // продолжение рубрики отдельным абзацем
}

// «Ищи связь» → ссылки на другие карточки
const byTitle = Object.fromEntries(cards.map((c) => [c.title.toLowerCase(), c.slug]));
for (const c of cards) {
  c.links = c.linksText.replace(/\.$/, '').split(/,\s*/).map((t) => byTitle[t.trim().toLowerCase()]).filter(Boolean);
}

for (const c of cards) {
  const miss = RUBRICS.filter(([k]) => !c.sections.find((s) => s.key === k)).map(([, n]) => n);
  if (miss.length) console.warn(`⚠ ${c.n}. ${c.title}: нет рубрик — ${miss.join(', ')}`);
}
mkdirSync('content', { recursive: true });
writeFileSync('content/memo.json', JSON.stringify(cards, null, 2) + '\n');
console.log(`Готово: content/memo.json — карточек: ${cards.length}`);
