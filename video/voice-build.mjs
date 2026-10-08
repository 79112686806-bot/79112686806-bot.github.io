// Чистая озвучка для ролика: из записи берутся только хорошие дубли (список в voice-edits/<id>.json),
// режутся по блокам (0-nachalo, 1-short … 9-final), выравниваются по громкости и сохраняются в public/voice/<id>/.
// Заодно для каждого слова сценария вычисляется момент, когда оно звучит, — ролик по этим меткам
// подгоняет длину сцен и показывает текст вместе с голосом. Результат — src/voice.json.
// Запуск: node voice-build.mjs 01-koleso   (сначала node phrases.mjs "<запись>" и правка voice-edits/<id>.json)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { voiceParts, cardId } from './voice-parts.mjs';

const id = process.argv[2];
const cards = JSON.parse(readFileSync('../content/memo.json', 'utf8'));
const card = cards.find((c) => cardId(c) === id);
if (!card) throw new Error(`Нет карточки ${id}`);
const edit = JSON.parse(readFileSync(`voice-edits/${id}.json`, 'utf8'));
const phrases = JSON.parse(readFileSync(edit.source.replace(/\.\w+$/, '.phrases.json'), 'utf8'));
const GAP = 0.28, FADE = 0.015;

// Оставленные куски: номер фразы или явный отрезок { from, to, text } (когда дубль внутри одной фразы)
const ranges = edit.keep.map((k) => (typeof k === 'number' ? { t0: phrases[k].t0, t1: phrases[k].t1, text: phrases[k].text } : { t0: k.from, t1: k.to, text: k.text }));

// ---------- Выравнивание слов записи со сценарием ----------
const norm = (w) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]/g, '');
const parts = voiceParts(card, cards);
const script = parts.flatMap((p, si) => `${p.head} ${p.body}`.split(/\s+/).filter(Boolean).map((w) => ({ si, n: norm(w) })));
const spoken = ranges.flatMap((r, ri) => { const ws = r.text.split(/\s+/).filter((w) => norm(w)); return ws.map((w, k) => ({ ri, k, of: ws.length, n: norm(w) })); });
const same = (a, b) => a && b && (a === b || (a.length > 3 && b.length > 3 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)))));
const N = script.length, M = spoken.length, d = Array.from({ length: N + 1 }, () => new Int32Array(M + 1));
for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--) d[i][j] = same(script[i].n, spoken[j].n) ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
const match = new Array(N).fill(-1);
for (let i = 0, j = 0; i < N && j < M;) {
  if (same(script[i].n, spoken[j].n)) { match[i++] = j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++;
}
console.log(`Совпало слов: ${match.filter((m) => m >= 0).length} из ${N} (в записи ${M})`);

// блок каждого куска — по большинству совпавших слов
const votes = ranges.map(() => ({}));
match.forEach((j, i) => { if (j >= 0) { const v = votes[spoken[j].ri]; v[script[i].si] = (v[script[i].si] || 0) + 1; } });
let last = 0;
const rangeSeg = votes.map((v) => { const best = Object.entries(v).sort((a, b) => b[1] - a[1])[0]; if (best) last = +best[0]; return last; });

// ---------- Нарезка звука ----------
mkdirSync('out/tmp', { recursive: true });
const outDir = `public/voice/${id}`;
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
const norm16 = resolve('out/tmp/source-norm.wav'); // вся запись, выровненная по громкости (−16 LUFS)
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', edit.source, '-af', 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', norm16]);

const segments = {};
for (const [si, p] of parts.entries()) {
  const mine = ranges.map((r, ri) => ({ ...r, ri })).filter((r) => rangeSeg[r.ri] === si);
  if (!mine.length) { console.warn(`⚠ ${p.file}: в записи нет этого блока`); continue; }
  // куски подряд с паузой GAP, края — короткое затухание (без щелчков)
  const inputs = [], filters = [];
  let at = 0;
  const startOf = {};
  mine.forEach((r, k) => {
    inputs.push('-ss', String(r.t0), '-to', String(r.t1), '-i', norm16);
    const len = r.t1 - r.t0;
    filters.push(`[${k}:a]afade=t=in:d=${FADE},afade=t=out:st=${(len - FADE).toFixed(3)}:d=${FADE},apad=pad_dur=${k < mine.length - 1 ? GAP : 0}[a${k}]`);
    startOf[r.ri] = at; at += len + (k < mine.length - 1 ? GAP : 0);
  });
  const file = `${outDir}/${p.file}.wav`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', `${filters.join(';')};${mine.map((_, k) => `[a${k}]`).join('')}concat=n=${mine.length}:v=0:a=1[out]`, '-map', '[out]', '-ar', '48000', '-ac', '1', file]);
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();

  // моменты слов блока: позиция слова внутри куска — пропорционально его номеру
  const idx = script.map((s, i) => [s, i]).filter(([s]) => s.si === si).map(([, i]) => i);
  const times = idx.map((i) => {
    const j = match[i];
    if (j < 0 || startOf[spoken[j].ri] === undefined) return null;
    const r = ranges[spoken[j].ri], sp = spoken[j];
    return +(startOf[sp.ri] + 0.1 + (r.t1 - r.t0 - 0.2) * (sp.k / sp.of)).toFixed(2);
  });
  // несовпавшие слова — между соседями
  for (let k = 0; k < times.length; k++) if (times[k] === null) {
    let a = k - 1; while (a >= 0 && times[a] === null) a--;
    let b = k + 1; while (b < times.length && times[b] === null) b++;
    const ta = a >= 0 ? times[a] : 0, tb = b < times.length ? times[b] : dur;
    times[k] = +(ta + ((tb - ta) * (k - a)) / (b - a)).toFixed(2);
  }
  segments[p.file] = { src: `voice/${id}/${p.file}.wav`, dur: +dur.toFixed(2), words: times };
  console.log(`${p.file}: ${dur.toFixed(1)} с, кусков ${mine.length}`);
}

const store = existsSync('src/voice.json') ? JSON.parse(readFileSync('src/voice.json', 'utf8')) : {};
store[card.slug] = { segments };
writeFileSync('src/voice.json', JSON.stringify(store, null, 1) + '\n');
console.log(`Готово: ${outDir}/ и src/voice.json`);
