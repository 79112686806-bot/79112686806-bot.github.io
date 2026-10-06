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
require('../course-page.js'); // шаблоны кладут функции в globalThis (общие файлы для браузера и сборки)
require('../home-blocks.js');
const { coursePageHtml, coursePageStats, HomeBlocks } = globalThis;

const FILES = ['admin.html', 'chat.js', 'course-page.js', 'home-blocks.js', 'favicon.svg'];

// Данные самозанятого (site-info.json) — для документов и подвала. Пустое поле → заметная пометка.
const INFO = JSON.parse(readFileSync('site-info.json', 'utf8'));
const INFO_LABELS = { legalName: 'Фамилия Имя Отчество', legalShort: 'Фамилия И. О.', inn: 'ИНН', address: 'город или адрес для корреспонденции', email: 'электронная почта', phone: 'телефон', workHours: 'режим работы', docsDate: 'дата редакции', brand: 'название' };
const infoValue = (k) => (k === 'npd' ? 'плательщик налога на профессиональный доход (самозанятый)' : INFO[k] ? String(INFO[k]).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) : `<mark class="todo">[${INFO_LABELS[k] || k}]</mark>`);
function requisitesHtml() {
  const rows = [['ФИО', 'legalName'], ['Статус', 'npd'], ['ИНН', 'inn'], ['Адрес', 'address'], ['Электронная почта', 'email'], ['Телефон', 'phone']];
  const bank = ['bankName', 'bankAccount', 'bankCorr', 'bankBik'].some((k) => INFO[k])
    ? [['Банк', 'bankName'], ['Расчётный счёт', 'bankAccount'], ['Корр. счёт', 'bankCorr'], ['БИК', 'bankBik']] : [];
  return `<table class="req-table"><tbody>${[...rows, ...bank].map(([t, k]) => `<tr><th>${t}</th><td>${infoValue(k)}</td></tr>`).join('')}</tbody></table>`;
}
const fillInfo = (html) => html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k === 'requisites' ? requisitesHtml() : infoValue(k)));

// Документы для работы сайта в РФ (тексты — docs/*.html). Кроме контактов — закрыты от индексации:
// одинаковые по смыслу юридические тексты считаются малоценными страницами.
const DOCS = [
  { path: '/kontakty/', file: 'kontakty', title: 'Контакты и реквизиты', index: true,
    description: 'Контакты инженерного клуба для школьников 9–14 лет: электронная почта, телефон, режим работы и реквизиты.' },
  { path: '/dokumenty/oferta/', file: 'oferta', title: 'Публичная оферта' },
  { path: '/dokumenty/polzovatelskoe-soglashenie/', file: 'polzovatelskoe-soglashenie', title: 'Пользовательское соглашение' },
  { path: '/dokumenty/politika-konfidencialnosti/', file: 'politika-konfidencialnosti', title: 'Политика обработки персональных данных' },
  { path: '/dokumenty/soglasie-na-obrabotku/', file: 'soglasie-na-obrabotku', title: 'Согласие на обработку персональных данных' },
  { path: '/dokumenty/oplata-i-vozvrat/', file: 'oplata-i-vozvrat', title: 'Оплата, получение услуги и возврат' },
];
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
  const program = 'modules(sort,title,lessons(sort,title,research_task))';
  // с вариантами цен; если миграция с ценами ещё не выполнена — без них (цены возьмутся по умолчанию)
  for (const fields of ['slug,title,subtitle,description,price,price_trial,price_trial_base,price_block,price_lesson,status,sort', 'slug,title,subtitle,description,price,status,sort']) {
    try {
      const res = await fetch(`${url}/rest/v1/courses?select=${fields},${program}&order=sort`, { headers: { apikey: key } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('⚠ Не удалось получить курсы из Supabase' + (fields.includes('price_trial') ? ' с вариантами цен — пробую без них' : ' — страницы курсов не созданы') + ':', e.message);
    }
  }
  return [];
}

// ---------- Видео и одобренные отзывы для главной (публичные данные) ----------
async function loadPublic(path) {
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`⚠ Не удалось получить ${path.split('?')[0]}:`, e.message, '(таблица ещё не создана?)');
    return [];
  }
}

// ---------- SEO-блок <head> ----------
// hide=true — страница закрыта от индексации (малоценная: черновой курс без программы, документы)
function seoHead({ title, description, path, jsonld, hide }) {
  const u = abs(path);
  return `<!--seo-->
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${NOINDEX ? 'noindex, nofollow' : hide ? 'noindex, follow' : 'index, follow'}">
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
function pageHtml(template, { head, show, courseBody, courseSlug, docBody, docPath }) {
  let h = template.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, head);
  if (show !== 'home') {
    h = h.replace('<main id="homePage">', '<main id="homePage" style="display:none">');
    h = h.replace(`id="${show}Page" style="display:none"`, `id="${show}Page"`);
  }
  if (courseBody) h = h.replace('<div id="coursePageBody"></div>', `<div id="coursePageBody" data-slug="${esc(courseSlug)}">${courseBody}</div>`);
  if (docBody) h = h.replace('<div id="docBody" class="doc"></div>', `<div id="docBody" class="doc" data-path="${esc(docPath)}">${docBody}</div>`);
  return h;
}

// Частые вопросы с главной → разметка FAQPage (ответы могут показываться прямо в выдаче)
function faqJsonLd(template) {
  const strip = (t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const items = [...template.matchAll(/<details class="faq-item"><summary>([\s\S]*?)<\/summary><div class="faq-a">([\s\S]*?)<\/div><\/details>/g)];
  return items.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(([, q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
  } : null;
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

  const [courses, videos, reviews] = await Promise.all([
    loadCourses(),
    loadPublic('site_videos?select=title,description,url,thumbnail_url,created_at&published=eq.true&order=sort,id'),
    loadPublic('reviews?select=author_name,author_role,text,courses(title)&status=eq.approved&order=approved_at.desc&limit=12'),
  ]);
  let template = fillInfo(readFileSync('index.html', 'utf8')); // реквизиты в подвале
  if (courses.length) template = template.replace('<div class="courses" id="courseGrid"></div>', `<div class="courses" id="courseGrid">${catalogGrid(courses)}</div>`);
  // видео и отзывы — в готовый HTML главной (видят поисковики); пустые блоки остаются скрытыми
  const videosHtml = HomeBlocks.videosHtml(videos), reviewsHtml = HomeBlocks.reviewsHtml(reviews);
  if (videosHtml) template = template.replace('<section class="home-block" id="homeVideos" hidden>', '<section class="home-block" id="homeVideos">').replace('<div class="video-grid" id="homeVideoList"></div>', `<div class="video-grid" id="homeVideoList">${videosHtml}</div>`);
  if (reviewsHtml) template = template.replace('<section class="home-block" id="homeReviews" hidden>', '<section class="home-block" id="homeReviews">').replace('<div class="reviews" id="homeReviewList"></div>', `<div class="reviews" id="homeReviewList">${reviewsHtml}</div>`);
  // видео с превью → разметка VideoObject
  const videoLd = videos.filter((v) => v.thumbnail_url && HomeBlocks.embedUrl(v.url)).map((v) => ({
    '@context': 'https://schema.org', '@type': 'VideoObject', name: v.title, description: v.description || v.title,
    thumbnailUrl: v.thumbnail_url, uploadDate: v.created_at, embedUrl: HomeBlocks.embedUrl(v.url),
  }));

  const pages = {
    home: {
      path: '/',
      title: 'Инженерный клуб — онлайн-занятия по инженерии для детей 9–14 лет',
      description: 'Онлайн-курсы инженерного мышления для школьников 9–14 лет: исследования, опыты и собственные проекты с преподавателем. 10 программ — от колеса до роботов. Пробное занятие со скидкой 50%.',
      jsonld: [organization, faqJsonLd(template), ...videoLd].filter(Boolean),
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
      description: 'Онлайн-курс для школьников 9–14 лет как маршрут: самостоятельные видеоуроки, материалы и задания, встречи с преподавателем на ключевых этапах, свой проект и чат поддержки.',
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
    // курс без программы — малоценная страница: не индексируем, пока программа не появится
    const thin = !st.lessons;
    const path = `/kursy/${c.slug}/`;
    const title = `Курс «${c.title}» для детей 9–14 лет онлайн — ${SITE_NAME}`;
    const description = cut(`${c.description} Онлайн-курс для школьников 9–14 лет${st.lessons ? `: ${st.lessons} тем, исследования и собственный проект` : ''}. Пробное занятие — ${Number(c.price_trial || 1250).toLocaleString('ru-RU')} ₽, весь курс — ${Number(c.price || 37500).toLocaleString('ru-RU')} ₽.`, 200);
    const course = {
      '@context': 'https://schema.org', '@type': 'Course', name: `Курс «${c.title}»`, description: `${c.subtitle}. ${c.description}`,
      inLanguage: 'ru', provider: { '@type': 'Organization', name: SITE_NAME, ...(SITE_URL ? { sameAs: SITE_URL + '/' } : {}) },
      audience: { '@type': 'EducationalAudience', educationalRole: 'student', audienceType: 'Школьники 9–14 лет' },
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
      offers: { '@type': 'AggregateOffer', category: 'Paid', lowPrice: c.price_trial || 1250, highPrice: c.price || 37500, offerCount: 3, priceCurrency: 'RUB', availability: c.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', ...(abs(path) ? { url: abs(path) } : {}) },
    };
    seoPages['course:' + c.slug] = { title, description };
    write(path, pageHtml(template, {
      head: seoHead({ title, description, path, hide: thin, jsonld: [course, breadcrumbs([['Главная', '/'], ['Программы', '/programmy/'], [c.title, path]])] }),
      show: 'course', courseBody: coursePageHtml(c, i), courseSlug: c.slug,
    }));
  }
  writeFileSync(`${OUT}/seo.js`, `window.SEO_PAGES=${JSON.stringify(seoPages)};\n`);

  // Документы и контакты
  for (const d of DOCS) {
    const crumbs = `<nav class="crumbs" aria-label="Навигация"><a href="/" onclick="return go(event,'home')">Главная</a> › <span>${esc(d.title)}</span></nav>`;
    const body = crumbs + fillInfo(readFileSync(`docs/${d.file}.html`, 'utf8'));
    write(d.path, pageHtml(template, {
      head: seoHead({ title: `${d.title} — ${SITE_NAME}`, description: d.description || `${d.title} сайта «${SITE_NAME}».`, path: d.path, hide: !d.index,
        jsonld: [breadcrumbs([['Главная', '/'], [d.title, d.path]])] }),
      show: 'doc', docBody: body, docPath: d.path,
    }));
  }
  const todo = Object.keys(INFO_LABELS).filter((k) => !INFO[k]);
  if (todo.length) console.warn('⚠ В site-info.json не заполнено:', todo.map((k) => INFO_LABELS[k]).join(', '));

  // robots.txt и sitemap.xml
  writeFileSync(`${OUT}/robots.txt`, NOINDEX
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /admin.html\n${SITE_URL ? `\nSitemap: ${SITE_URL}/sitemap.xml\n` : ''}`);
  if (SITE_URL && !NOINDEX) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [['/', '1.0', 'weekly'], ['/programmy/', '0.9', 'weekly'], ['/kak-prohodyat-zanyatiya/', '0.7', 'monthly'], ['/kontakty/', '0.5', 'monthly'],
      ...courses.filter((c) => coursePageStats(c).lessons).map((c) => [`/kursy/${c.slug}/`, c.status === 'available' ? '0.8' : '0.5', 'weekly'])];
    writeFileSync(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, pr, cf]) => `  <url><loc>${SITE_URL}${p}</loc><lastmod>${today}</lastmod><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
  }

  if (NOINDEX) console.log('Режим NOINDEX: сайт закрыт от поисковиков (тестовая копия).');
  console.log(`Готово: ${OUT}/ — главная, программы, «как проходят занятия», курсов: ${courses.length}` +
    `${SITE_URL ? `, sitemap.xml (${SITE_URL})` : ' (SITE_URL не задан — sitemap.xml и канонические адреса появятся после его указания)'}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
