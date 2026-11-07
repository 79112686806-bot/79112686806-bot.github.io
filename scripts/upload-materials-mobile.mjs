// Варианты PDF-материалов для телефона → бакет «materials», рядом с основным файлом под именем <файл>.m.pdf.
// Запуск: node scripts/upload-materials-mobile.mjs "<папка с PDF для телефона>"
// Файл в папке называется так же, как материал в админке («Модуль 7. Автомобиль.pdf»).
// Ключ — SUPABASE_SERVICE_ROLE_KEY из .env (только локально, в браузер и в репозиторий не попадает).
// Скачивать варианты ученикам разрешает миграция 20261108000047_materials_mobile.sql.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

if (existsSync('.env')) for (const line of readFileSync('.env', 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const dir = process.argv[2];
if (!dir) throw new Error('node scripts/upload-materials-mobile.mjs <папка с PDF для телефона>');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
const auth = { Authorization: `Bearer ${key}`, apikey: key };

const norm = (t) => String(t).toLowerCase().replace(/\.pdf$/, '').replace(/[«»"]/g, '').replace(/[—–-]/g, '-').replace(/\s+/g, ' ').trim();
const mats = await (await fetch(`${url}/rest/v1/materials?select=id,title,storage_path&kind=eq.file&user_id=is.null`, { headers: auth })).json();
if (!Array.isArray(mats)) throw new Error('Не удалось получить материалы: ' + JSON.stringify(mats));
const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f));
let n = 0;
for (const f of files) {
  const m = mats.find((x) => norm(x.title) === norm(f) && /\.pdf$/i.test(x.storage_path || ''));
  if (!m) { console.log('— нет материала с таким названием:', f); continue; }
  const path = m.storage_path.replace(/\.pdf$/i, '.m.pdf');
  const r = await fetch(`${url}/storage/v1/object/materials/${path}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: readFileSync(join(dir, f)),
  });
  if (!r.ok) throw new Error(`${f}: ${r.status} ${await r.text()}`);
  console.log('✓', path, '—', m.title); n++;
}
console.log(`Готово: ${n} из ${files.length}`);
