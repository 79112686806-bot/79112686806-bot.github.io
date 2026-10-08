// Разбор озвучки на фразы по паузам: каждая фраза распознаётся отдельно (whisper-server, модель грузится один раз),
// поэтому видны все дубли и оборванные пробы с точным временем.
// Запуск: node phrases.mjs "public/voice/01 Колесо.mp3"  → рядом .phrases.json [{ i, t0, t1, text }]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2];
const SIL_DB = -38, SIL_MIN = 0.3, PAD = 0.12;
const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input]).toString();
// ffmpeg пишет результат silencedetect в stderr
const r = spawnSync('ffmpeg', ['-v', 'info', '-i', input, '-af', `silencedetect=noise=${SIL_DB}dB:d=${SIL_MIN}`, '-f', 'null', '-'], { encoding: 'utf8' });
const starts = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
const speech = [];
let prev = 0;
for (let k = 0; k < starts.length; k++) { if (starts[k] - prev > 0.08) speech.push([prev, starts[k]]); prev = ends[k] ?? dur; }
if (dur - prev > 0.08) speech.push([prev, dur]);

const server = spawn(resolve('whisper/Release/whisper-server.exe'), ['-m', resolve('whisper-models/ggml-large-v3-turbo.bin'), '-l', 'ru', '--port', '8189', '-mc', '0', '-nf'], { stdio: 'ignore' });
for (let k = 0; k < 120; k++) { try { await fetch('http://127.0.0.1:8189/'); break; } catch { await new Promise((ok) => setTimeout(ok, 1000)); } }

mkdirSync('out/tmp', { recursive: true });
const phrases = [];
for (const [i, [a, b]] of speech.entries()) {
  const t0 = Math.max(0, a - PAD), t1 = Math.min(dur, b + PAD), wav = resolve(`out/tmp/ph.wav`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t0), '-to', String(t1), '-i', input, '-ar', '16000', '-ac', '1', wav]);
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(wav)]), 'ph.wav');
  fd.append('response_format', 'json'); fd.append('language', 'ru'); fd.append('temperature', '0');
  const res = await (await fetch('http://127.0.0.1:8189/inference', { method: 'POST', body: fd })).json();
  const text = (res.text || '').trim();
  phrases.push({ i, t0: +t0.toFixed(2), t1: +t1.toFixed(2), text });
  console.log(`${String(i).padStart(3)} ${t0.toFixed(2).padStart(7)}–${t1.toFixed(2).padStart(7)}  ${text}`);
}
server.kill();
writeFileSync(input.replace(/\.\w+$/, '.phrases.json'), JSON.stringify(phrases, null, 1));
