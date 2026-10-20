// Загрузка роликов интерактивной серии в закрытый бакет Supabase Storage «episodes».
// Запуск: node scripts/upload-episode.mjs ep1 video/out/ep1/player/clips
// Ключ — SUPABASE_SERVICE_ROLE_KEY из .env (только локально, в браузер и в репозиторий не попадает).
// Бакет создаётся, если его ещё нет; правила доступа — в миграции 20261020000021_episodes.sql.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv('.env');

const [episode, dir] = process.argv.slice(2);
if (!episode || !dir) throw new Error('node scripts/upload-episode.mjs <серия> <папка с роликами>');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
const auth = { Authorization: `Bearer ${key}`, apikey: key };

const b = await fetch(`${url}/storage/v1/bucket/episodes`, { headers: auth });
if (b.status !== 200) {
  const r = await fetch(`${url}/storage/v1/bucket`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'episodes', name: 'episodes', public: false, file_size_limit: 52428800 }) });
  if (!r.ok) throw new Error('Не удалось создать бакет: ' + (await r.text()));
  console.log('Создан бакет episodes');
}

const files = readdirSync(dir).filter((f) => f.endsWith('.mp4'));
for (const f of files) {
  const r = await fetch(`${url}/storage/v1/object/episodes/${episode}/${f}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'video/mp4', 'x-upsert': 'true', 'Cache-Control': 'max-age=86400' },
    body: readFileSync(join(dir, f)),
  });
  if (!r.ok) throw new Error(`${f}: ${await r.text()}`);
  console.log('✓', `${episode}/${f}`);
}
console.log(`Готово: ${files.length} роликов в episodes/${episode}/`);
