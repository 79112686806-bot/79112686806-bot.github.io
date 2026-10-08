// Тексты для записи озвучки: voice-scripts/<номер>-<адрес>.txt — что читать и как назвать каждый файл.
// Запуск: node voice-scripts.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { voiceParts, cardId } from './voice-parts.mjs';

const cards = JSON.parse(readFileSync('../content/memo.json', 'utf8'));
mkdirSync('voice-scripts', { recursive: true });
for (const c of cards) {
  const id = cardId(c);
  writeFileSync(`voice-scripts/${id}.txt`,
    `Ролик ${id}: «${c.title}»\nМожно записать всё одним файлом (public/voice/${id}.mp3) — дубли и пробы потом вырезаются,\n` +
    `или каждый блок отдельным файлом в папке public/voice/${id}/ с указанным именем.\n\n` +
    voiceParts(c, cards).map((p) => `=== ${p.file}.mp3 ===\n${p.head}\n${p.body}\n`).join('\n'));
}
console.log(`Готово: voice-scripts/ — ${cards.length} файлов`);
