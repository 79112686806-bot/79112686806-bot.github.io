// Распознавание озвучки (whisper.cpp) с отметками времени по словам — чтобы найти дубли и подогнать ролик под голос.
// Запуск: node transcribe.mjs "public/voice/01 Колесо.mp3"  → рядом файл .words.json [{ t0, t1, w }] (секунды)
// Программа и модель скачиваются один раз в whisper/ и whisper-models/ (в git не попадают).
import { installWhisperCpp, downloadWhisperModel } from '@remotion/install-whisper-cpp';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2];
if (!input) throw new Error('Укажите файл озвучки');
const WHISPER = resolve('whisper'), MODELS = resolve('whisper-models'), MODEL = 'large-v3-turbo';
const CLI = resolve(WHISPER, 'Release/whisper-cli.exe'); // на Windows сборка лежит в Release/
if (!existsSync(CLI)) await installWhisperCpp({ to: WHISPER, version: '1.7.6' });
await downloadWhisperModel({ model: MODEL, folder: MODELS });

mkdirSync('out/tmp', { recursive: true });
const wav = resolve('out/tmp/voice16k.wav'), base = resolve('out/tmp/voice'); // whisper.cpp принимает только 16 кГц WAV
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input, '-ar', '16000', '-ac', '1', wav]);
execFileSync(CLI, ['-m', resolve(MODELS, `ggml-${MODEL}.bin`), '-f', wav, '-l', 'ru', '-ml', '1', '-sow', '-ojf', '-of', base, '--dtw', 'large.v3.turbo', '-np'], { stdio: 'inherit' });

const json = JSON.parse(readFileSync(base + '.json', 'utf8'));
const words = json.transcription.map((s) => ({ t0: s.offsets.from / 1000, t1: s.offsets.to / 1000, w: s.text.trim() })).filter((x) => x.w);
writeFileSync(input.replace(/\.\w+$/, '.words.json'), JSON.stringify(words));
// печать по фразам: новая строка после паузы больше 0,6 с
let line = [], start = 0;
for (const [i, x] of words.entries()) {
  if (!line.length) start = x.t0;
  line.push(x.w);
  const next = words[i + 1];
  if (!next || next.t0 - x.t1 > 0.6) { console.log(`${start.toFixed(2)}–${x.t1.toFixed(2)}  ${line.join(' ')}`); line = []; }
}
