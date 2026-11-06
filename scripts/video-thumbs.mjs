// Обложки роликов главной (Rutube) — своими файлами: assets/videos/<id ролика>.webp (640 px, webp).
// Зачем: адрес rutube.ru/api/... стоит за защитой от ботов (QRATOR) и браузеру без куки Rutube часто отдаёт проверку
// вместо картинки — обложки не грузились. Свой файл грузится с того же сайта и легче (≈40 КБ вместо ≈400 КБ).
// Запуск после добавления ролика в админке: npm run video:thumbs  (нужен ffmpeg; ключи — из .env, publishable хватает).
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const env = existsSync('.env') ? Object.fromEntries(readFileSync('.env', 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')])) : {};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Нужны NEXT_PUBLIC_SUPABASE_URL и publishable-ключ в .env');

const list = await (await fetch(`${url}/rest/v1/site_videos?select=title,url&published=eq.true`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json();
if (!Array.isArray(list)) throw new Error('Не удалось получить список роликов: ' + JSON.stringify(list));
mkdirSync('assets/videos', { recursive: true });
for (const v of list) {
  const id = (String(v.url).match(/rutube\.ru\/(?:video|play\/embed|shorts)\/([0-9a-f]{32})/) || [])[1];
  if (!id) { console.log('—', v.title, '(не Rutube — обложку задайте в админке)'); continue; }
  const out = `assets/videos/${id}.webp`;
  if (existsSync(out)) { console.log('есть', out); continue; }
  const info = await (await fetch(`https://rutube.ru/api/video/${id}/thumbnail/`)).json();
  const img = Buffer.from(await (await fetch(info.url)).arrayBuffer());
  const tmp = `assets/videos/${id}.tmp.jpg`; writeFileSync(tmp, img);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-vf', 'scale=640:-2', '-quality', '78', out]);
  rmSync(tmp);
  console.log('✓', out, '—', v.title);
}
