// Сборка сайта в dist/:
//  - копирует страницы и файлы, создаёт config.js с публичными ключами Supabase;
//  - для поисковиков создаёт готовые HTML-страницы разделов и курсов
//    (/programmy/, /kak-prohodyat-zanyatiya/, /kursy/<slug>/) со своими title,
//    description, заголовками и разметкой Schema.org;
//  - создаёт robots.txt, а при заданном SITE_URL — sitemap.xml и канонические адреса.
// Локально переменные берутся из .env, на Vercel — из настроек проекта.
// В config.js попадают ТОЛЬКО публичные ключи — service role сюда не добавлять.

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, cpSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../course-page.js'); // шаблон кладёт функции в globalThis (общий файл для браузера и сборки)
const { coursePageHtml, coursePageStats } = globalThis;

const FILES = ['admin.html', 'chat.js', 'course-page.js', 'favicon.svg'];
const OUT = 'dist';
const SITE_NAME = 'Инженерный клуб';

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
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
// Адрес сайта (https://домен) — для канонических ссылок и sitemap.xml. Можно не задавать.
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
// NOINDEX=1 — тестовая копия сайта (например, *.vercel.app): поисковикам индексировать запрещено
const NOINDEX = process.env.NOINDEX === '1';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const abs = (path) => (SITE_URL ? SITE_URL + path : null);
const cut = (t, n) => (t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

// ---------- Курсы из базы (публичные данные каталога) ----------
async function loadCourses() {
  try {
    const res = await fetch(`${url}/rest/v1/courses?select=slug,title,subtitle,description,price,status,sort,modules(sort,title,lessons(sort,title,research_task))&order=sort`, {
      headers: { apikey: key },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('⚠ Не удалось получить курсы из Supabase — страницы курсов не созданы:', e.message);
    return [];
  }
}

// ---------- SEO-блок <head> ----------
function seoHead({ title, description, path, jsonld }) {
  const u = abs(path);
  return `<!--seo-->
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${NOINDEX ? 'noindex, nofollow' : 'index, follow'}">
${u ? `<link rel="canonical" href="${u}">\n<meta property="og:url" content="${u}">\n` : ''}<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${SITE_URL ? `<meta property="og:image" content="${SITE_URL}/assets/founder.jpg">\n` : ''}<meta name="twitter:card" content="summary">
${(jsonld || []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<!--/seo-->`;
}

const organization = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: SITE_NAME,
  description: 'Онлайн-занятия по инженерному мышлению для школьников 9–14 лет: исследования, опыты и собственные проекты с преподавателем.',
  ...(SITE_URL ? { url: SITE_URL + '/', logo: SITE_URL + '/favicon.svg' } : {}),
  areaServed: 'RU',
  availableLanguage: 'ru',
};
const breadcrumbs = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(abs(path) ? { item: abs(path) } : {}) })),
});

// ---------- Страницы ----------
function pageHtml(template, { head, show, courseBody, courseSlug }) {
  let h = template.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, head);
  if (show !== 'home') {
    h = h.replace('<main id="homePage">', '<main id="homePage" style="display:none">');
    h = h.replace(`id="${show}Page" style="display:none"`, `id="${show}Page"`);
  }
  if (courseBody) h = h.replace('<div id="coursePageBody"></div>', `<div id="coursePageBody" data-slug="${esc(courseSlug)}">${courseBody}</div>`);
  return h;
}

function catalogGrid(courses) {
  // Каталог в готовом HTML (для поисковиков); на сайте скрипт заменит его карточками с иконками
  return courses.map((c, i) => `<a class="course" href="/kursy/${esc(c.slug)}/"><span class="num">${String(i + 1).padStart(2, '0')}</span><h3>${esc(c.title)}</h3><small>${esc(c.subtitle)}</small></a>`).join('');
}

function write(path, html) {
  const dir = `${OUT}${path}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}index.html`, html);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT);
  for (const f of FILES) copyFileSync(f, `${OUT}/${f}`);
  if (existsSync('assets')) cpSync('assets', `${OUT}/assets`, { recursive: true });
  writeFileSync(`${OUT}/config.js`, `window.APP_CONFIG=${JSON.stringify({ supabaseUrl: url, supabaseKey: key })};\n`);

  const courses = await loadCourses();
  let template = readFileSync('index.html', 'utf8');
  if (courses.length) template = template.replace('<div class="courses" id="courseGrid"></div>', `<div class="courses" id="courseGrid">${catalogGrid(courses)}</div>`);

  const pages = {
    home: {
      path: '/',
      title: 'Инженерный клуб — онлайн-занятия по инженерии для детей 9–14 лет',
      description: 'Онлайн-курсы инженерного мышления для школьников 9–14 лет: исследования, опыты и собственные проекты с преподавателем. 10 программ — от колеса до роботов. Первое занятие со скидкой 50%.',
      jsonld: [organization],
    },
    courses: {
      path: '/programmy/',
      title: '10 программ инженерного клуба для детей 9–14 лет — Инженерный клуб',
      description: 'Колесо, телефон, корабли, оптика, автомобиль, самолёт, интернет, роботы, биоинженерия и мозг человека — выберите программу инженерного клуба для ребёнка 9–14 лет.',
      jsonld: [breadcrumbs([['Главная', '/'], ['Программы', '/programmy/']]), {
        '@context': 'https://schema.org', '@type': 'ItemList', name: 'Программы инженерного клуба',
        itemListElement: courses.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, ...(abs(`/kursy/${c.slug}/`) ? { url: abs(`/kursy/${c.slug}/`) } : {}) })),
      }],
    },
    how: {
      path: '/kak-prohodyat-zanyatiya/',
      title: 'Как проходят онлайн-занятия для детей 9–14 лет — Инженерный клуб',
      description: 'Самостоятельная подготовка, обсуждение с преподавателем и собственный проект: как устроены онлайн-занятия инженерного клуба для школьников 9–14 лет.',
      jsonld: [breadcrumbs([['Главная', '/'], ['Как проходят занятия', '/kak-prohodyat-zanyatiya/']])],
    },
  };

  // Данные для смены title/description при переходах без перезагрузки
  const seoPages = {};
  for (const [k, p] of Object.entries(pages)) {
    seoPages[k] = { title: p.title, description: p.description };
    write(p.path, pageHtml(template, { head: seoHead(p), show: k }));
  }

  for (const [i, c] of courses.entries()) {
    const st = coursePageStats(c);
    const path = `/kursy/${c.slug}/`;
    const title = `Курс «${c.title}» для детей 9–14 лет онлайн — ${SITE_NAME}`;
    const description = cut(`${c.description} Онлайн-курс для школьников 9–14 лет${st.lessons ? `: ${st.lessons} тем, исследования и собственный проект` : ''}. ${Number(c.price || 20000).toLocaleString('ru-RU')} ₽, первое занятие −50%.`, 200);
    const course = {
      '@context': 'https://schema.org', '@type': 'Course', name: `Курс «${c.title}»`, description: `${c.subtitle}. ${c.description}`,
      inLanguage: 'ru', provider: { '@type': 'Organization', name: SITE_NAME, ...(SITE_URL ? { sameAs: SITE_URL + '/' } : {}) },
      audience: { '@type': 'EducationalAudience', educationalRole: 'student', audienceType: 'Школьники 9–14 лет' },
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
      offers: { '@type': 'Offer', category: 'Paid', price: c.price || 20000, priceCurrency: 'RUB', availability: c.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', ...(abs(path) ? { url: abs(path) } : {}) },
    };
    seoPages['course:' + c.slug] = { title, description };
    write(path, pageHtml(template, {
      head: seoHead({ title, description, path, jsonld: [course, breadcrumbs([['Главная', '/'], ['Программы', '/programmy/'], [c.title, path]])] }),
      show: 'course', courseBody: coursePageHtml(c, i), courseSlug: c.slug,
    }));
  }
  writeFileSync(`${OUT}/seo.js`, `window.SEO_PAGES=${JSON.stringify(seoPages)};\n`);

  // robots.txt и sitemap.xml
  writeFileSync(`${OUT}/robots.txt`, NOINDEX
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /admin.html\n${SITE_URL ? `\nSitemap: ${SITE_URL}/sitemap.xml\n` : ''}`);
  if (SITE_URL && !NOINDEX) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [['/', '1.0', 'weekly'], ['/programmy/', '0.9', 'weekly'], ['/kak-prohodyat-zanyatiya/', '0.7', 'monthly'],
      ...courses.map((c) => [`/kursy/${c.slug}/`, c.status === 'available' ? '0.8' : '0.5', 'weekly'])];
    writeFileSync(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, pr, cf]) => `  <url><loc>${SITE_URL}${p}</loc><lastmod>${today}</lastmod><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
  }

  if (NOINDEX) console.log('Режим NOINDEX: сайт закрыт от поисковиков (тестовая копия).');
  console.log(`Готово: ${OUT}/ — главная, программы, «как проходят занятия», курсов: ${courses.length}` +
    `${SITE_URL ? `, sitemap.xml (${SITE_URL})` : ' (SITE_URL не задан — sitemap.xml и канонические адреса появятся после его указания)'}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
