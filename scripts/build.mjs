// Сборка сайта в dist/: копирует страницы и создаёт config.js
// с публичными ключами Supabase из переменных окружения.
// Локально переменные берутся из .env, на Vercel — из настроек проекта.
// В config.js попадают ТОЛЬКО публичные ключи — service role сюда не добавлять.

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';

const PAGES = ['index.html'];
const OUT = 'dist';

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Не заданы NEXT_PUBLIC_SUPABASE_URL и/или NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env или настройки Vercel).');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const page of PAGES) copyFileSync(page, `${OUT}/${page}`);

const config = { supabaseUrl: url, supabaseKey: key };
writeFileSync(`${OUT}/config.js`, `window.APP_CONFIG=${JSON.stringify(config)};\n`);

console.log(`Готово: ${OUT}/ (${PAGES.join(', ')}, config.js)`);
