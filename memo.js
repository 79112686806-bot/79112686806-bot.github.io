// Игра «Мемо «Инженерия»: общий шаблон истории карточки (сборка + браузер),
// игра на пары на /igra/ и форма идеи на /igra/ideya/.
// Данные карточек — content/memo.json (сборка кладёт их в /igra/memo-data.js как window.MEMO_CARDS).
(function (root) {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const img = (slug, small) => `/assets/memo/${slug}${small ? '-s' : ''}.webp`;

  // ---------- Значки в стиле сайта: линия «чернилами» (stroke = currentColor), 24×24 ----------
  const IC = {
    nut: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3.2"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    compass: '<circle cx="12" cy="4.5" r="1.6"/><path d="M11.2 6L6 20M12.8 6L18 20M8 15h8"/>',
    helmet: '<path d="M3 17.5h18M4.5 17.5a7.5 7.5 0 0 1 15 0M10 10.2V6.5h4v3.7M12 6.5V5"/>',
    laurel: '<path d="M8 20c-3-2-5-5-5-9M16 20c3-2 5-5 5-9M4 9.5c1.5.3 2.5 1.2 2.8 2.7M3.6 13.5c1.6 0 2.8.8 3.4 2.2M20 9.5c-1.5.3-2.5 1.2-2.8 2.7M20.4 13.5c-1.6 0-2.8.8-3.4 2.2"/><path d="M12 6l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 12l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/>',
    star: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    miss: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/><path d="M12 7.4l-1.6 3.6 2.6 2-1.6 3.6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M10 17h4v3h-4zM8.5 20.5h7"/>',
    flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3.5-9-2 1.5-3 3.5-3 5.5-1-1-1.5-2-1.5-3C7.5 10.5 6 12.6 6 15a6 6 0 0 0 6 6z"/>',
    bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
    shuffle: '<path d="M3 7h3.5c4 0 6.5 10 11 10H21M3 17h3.5c1.5 0 2.7-1.4 3.7-3.2M13.8 10.2C14.8 8.4 16 7 17.5 7H21M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>',
    cards: '<rect x="3.5" y="5" width="9" height="13" rx="1.5" transform="rotate(-8 8 11.5)"/><rect x="11.5" y="5" width="9" height="13" rx="1.5" transform="rotate(8 16 11.5)"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11.4L6 3h4l2 5 2-5h4l-2.5 8.4"/>',
    gift: '<rect x="4" y="9.5" width="16" height="10.5" rx="1"/><path d="M3 9.5h18M12 9.5V20M12 9.5C10 5.5 6 5.5 6 8s4 1.5 6 1.5zM12 9.5c2-4 6-4 6-1.5s-4 1.5-6 1.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5V17"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    books: '<path d="M4 19.5V6a1.5 1.5 0 0 1 1.5-1.5H9v15M9 4.5h4.5v15H9M14.5 6.5l3.5-.9 3 13.9-3.5.9zM3 19.5h11"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01"/>',
    calcheck: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4"/>',
    duo: '<circle cx="8.5" cy="8" r="2.8"/><circle cx="16" cy="8.5" r="2.4"/><path d="M3.5 19c.5-3.4 2.6-5.2 5-5.2s4.5 1.8 5 5.2M13.8 14.2c.7-.4 1.4-.6 2.2-.6 2.1 0 3.9 1.6 4.4 4.6"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.3M4 13a8 8 0 0 0 14.3 4.3M5.5 3v4h4M18.5 21v-4h-4"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    sparkle: '<path d="M12 3.5c.8 4.4 4.1 7.7 8.5 8.5-4.4.8-7.7 4.1-8.5 8.5-.8-4.4-4.1-7.7-8.5-8.5 4.4-.8 7.7-4.1 8.5-8.5z"/>',
    scroll: '<path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1 0-5h9M7 4a2 2 0 0 0-2 2v9.5M10 9h4M10 12.5h4"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9"/>',
    exclaim: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6.5M12 16.8v.1"/>',
    think: '<path d="M6 15.5a5 5 0 0 1 1.2-9.8A5.5 5.5 0 0 1 17.5 7a4.3 4.3 0 0 1-.8 8.5H8"/><circle cx="7" cy="19" r="1.2"/><circle cx="4.5" cy="21.2" r=".6"/>',
    chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9v6l5-3z"/>',
  };
  // cls: «fill» — залитый значок (сердце, звезда)
  const ico = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[name] || IC.sparkle}</svg>`;
  const ICONS = { short: 'sparkle', history: 'scroll', how: 'gear', then: 'hourglass', fact: 'exclaim', try: 'wrench', think: 'think' };

  // Время чтения: дети читают примерно 120 слов в минуту
  function readMinutes(card) {
    const text = [card.hook, ...card.sections.flatMap((s) => [s.text, ...s.list])].join(' ');
    return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 120));
  }
  const minutesWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'минуту' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'минуты' : 'минут');

  // Полный текст истории: рубрики, «со взрослым», «Ищи связь» ссылками.
  // heading — уровень заголовков рубрик (h2 на странице карточки, h3 в окне игры).
  function storyHtml(card, cards, { heading = 'h2', video } = {}) {
    const by = Object.fromEntries((cards || []).map((c) => [c.slug, c]));
    const paras = (t) => t.split('\n').filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
    const sections = card.sections.map((s) =>
      `<section class="story-part story-${s.key}"><${heading}><span class="story-ico">${ico(ICONS[s.key] || 'sparkle')}</span>${esc(s.title)}` +
      `${s.note ? ` <span class="story-adult" title="Делайте вместе со взрослым">${ico('duo')} ${esc(s.note)}</span>` : ''}</${heading}>` +
      paras(s.text) + (s.list.length ? `<ul>${s.list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : '') + '</section>').join('');
    const links = card.links.length
      ? `<section class="story-part story-links"><${heading}><span class="story-ico">${ico('chain')}</span>Ищи связь</${heading}><p>Эта карточка связана с другими:</p><ul class="story-chips">${card.links.map((s) => by[s] ? `<li><a href="/igra/${s}/"><img src="${img(s, true)}" alt="" loading="lazy" width="40" height="60">${esc(by[s].title)}</a></li>` : '').join('')}</ul></section>`
      : card.linksText ? `<section class="story-part story-links"><${heading}><span class="story-ico">${ico('chain')}</span>Ищи связь</${heading}><p>${esc(card.linksText)}</p></section>` : '';
    const v = video && root.HomeBlocks && root.HomeBlocks.embedUrl(video);
    const videoBlock = v ? `<div class="story-video"><div class="video-frame"><button type="button" data-embed="${esc(v)}" onclick="Memo.playVideo(this)" aria-label="Смотреть видео: ${esc(card.title)}"><img src="${img(card.slug)}" alt="" loading="lazy"><span class="video-play" aria-hidden="true">▶</span><span class="video-label">Смотреть видео-историю</span></button></div></div>` : '';
    const min = readMinutes(card);
    return `<p class="story-meta"><span>${ico('book')} читать ${min} ${minutesWord(min)}</span>${v ? `<span>${ico('film')} есть видео</span>` : ''}${card.years ? `<span>${esc(card.years)}</span>` : ''}</p>` +
      `<p class="story-hook">${esc(card.hook)}</p>${videoBlock}${sections}${links}`;
  }

  // Плеер Rutube/VK загружается только по нажатию
  function playVideo(btn) {
    const f = document.createElement('iframe');
    f.src = btn.dataset.embed; f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    f.allowFullscreen = true; f.title = btn.getAttribute('aria-label') || 'Видео';
    btn.replaceWith(f);
  }

  // ---------- Запросы к Supabase без библиотеки (только публичный ключ) ----------
  async function api(path, opts = {}) {
    const c = root.APP_CONFIG;
    if (!c) throw new Error('Нет config.js');
    const res = await fetch(`${c.supabaseUrl}/rest/v1/${path}`, { ...opts, headers: { apikey: c.supabaseKey, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.status === 204 || res.status === 201 ? null : res.json();
  }
  let videosPromise = null;
  const videos = () => (videosPromise ||= api('memo_videos?select=slug,url').then((l) => Object.fromEntries(l.map((v) => [v.slug, v.url]))).catch(() => root.MEMO_VIDEOS || {}));

  // ---------- Коллекция найденных карточек (только в этом браузере) ----------
  const KEY = 'memoFound';
  const found = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); } };
  function addFound(slug) { const s = found(); s.add(slug); try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch (e) {} return s; }
  // Коллекция: найденные карточки открыты, остальные — рубашкой с замком (без картинки, названия и ссылки).
  // В HTML страницы список полный — для поисковиков; закрывает его скрипт. fresh — только что добавленная карточка.
  function markCollection(fresh) {
    const s = found();
    document.querySelectorAll('[data-memo-card]').forEach((a) => {
      const got = s.has(a.dataset.memoCard), im = a.querySelector('img');
      if (!a.dataset.href) { a.dataset.href = a.getAttribute('href'); im.dataset.src = im.getAttribute('src'); im.dataset.alt = im.alt; }
      a.classList.toggle('locked', !got);
      if (got) { a.setAttribute('href', a.dataset.href); im.src = im.dataset.src; im.alt = im.dataset.alt; a.removeAttribute('tabindex'); a.removeAttribute('aria-hidden'); }
      else { a.removeAttribute('href'); im.src = '/assets/memo/back-s.webp'; im.alt = ''; a.setAttribute('tabindex', '-1'); a.setAttribute('aria-hidden', 'true'); }
      if (got && a.dataset.memoCard === fresh) { a.classList.remove('fresh'); void a.offsetWidth; a.classList.add('fresh'); }
    });
    const n = document.getElementById('memoCount');
    if (n) n.textContent = s.size;
    const hint = document.getElementById('memoCollHint');
    if (hint) hint.innerHTML = s.size ? `${ico('book')} Нажми на карточку — откроется её история.` : 'Найди пару — карточка и её история появятся здесь.';
  }

  // ---------- Игра на пары ----------
  // Уровни: число пар и сколько промахов подряд можно сделать, прежде чем карточки перемешаются (только «Один»)
  const LEVELS = { easy: { pairs: 6, misses: 3 }, mid: { pairs: 10, misses: 5 }, hard: { pairs: 15, misses: 8 } };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many);

  // ---------- Профиль игрока: опыт, звания, подсказки, достижения, призы (в этом браузере) ----------
  const RANKS = [
    [0, 'Новичок', 'nut'], [2000, 'Юный механик', 'wrench'], [6000, 'Подмастерье', 'gear'], [12000, 'Изобретатель', 'bulb'],
    [20000, 'Конструктор', 'compass'], [32000, 'Главный инженер', 'helmet'], [50000, 'Легенда инженерии', 'laurel'],
  ];
  // Рубашки карточек — призы за звания (номер звания, с которого открывается)
  const BACKS = [
    ['classic', 'Классика', 0, ''], ['blueprint', 'Синий чертёж', 1, 'hue-rotate(185deg) saturate(1.5)'],
    ['chalk', 'Красный мел', 2, 'hue-rotate(-25deg) saturate(2.2)'], ['emerald', 'Изумруд', 3, 'hue-rotate(95deg) saturate(1.7)'],
    ['night', 'Ночная мастерская', 4, 'invert(.88) hue-rotate(180deg) saturate(1.4)'], ['gold', 'Золото', 5, 'sepia(1) saturate(3.2) brightness(1.08)'],
    ['legend', 'Пурпур легенды', 6, 'hue-rotate(290deg) saturate(2.4)'],
  ];
  const ACH = [
    ['first_pair', 'cards', 'Первая пара', 'Найди первую пару'],
    ['combo3', 'flame', 'Комбо ×3', 'Три пары подряд без промаха'],
    ['combo5', 'bolt', 'Комбо ×5', 'Пять пар подряд без промаха'],
    ['perfect', 'target', 'Без промахов', 'Пройди раунд, не промахнувшись ни разу'],
    ['stars3', 'star', 'Три звезды', 'Получи три звезды за раунд'],
    ['win_mid', 'medal', '10 пар', 'Пройди уровень «10 пар»'],
    ['win_hard', 'medal', '15 пар', 'Пройди уровень «15 пар»'],
    ['collect10', 'books', 'Коллекционер', 'Собери 10 карточек'],
    ['collect25', 'trophy', 'Вся коллекция', 'Собери все 25 карточек'],
    ['streak3', 'cal', 'Три дня подряд', 'Играй три дня подряд'],
    ['streak7', 'calcheck', 'Неделя подряд', 'Играй семь дней подряд'],
    ['hint', 'bulb', 'Хитрость', 'Используй подсказку'],
    ['duel', 'duo', 'Дуэль', 'Сыграй вдвоём до конца'],
  ];
  const PKEY = 'memoProfile';
  const today = () => new Date().toISOString().slice(0, 10);
  function loadProfile() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch (e) {}
    return { xp: 0, hints: 1, ach: [], best: {}, back: 'classic', streak: 0, lastDay: '', games: 0, ...p };
  }
  const saveProfile = (p) => { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} };
  const rankOf = (xp) => { let i = 0; RANKS.forEach((r, k) => { if (xp >= r[0]) i = k; }); return i; };

  function initGame() {
    const board = document.getElementById('memoBoard');
    if (!board || !root.MEMO_CARDS) return;
    const cards = root.MEMO_CARDS;
    const $ = (id) => document.getElementById(id);
    const note = $('memoNote'), win = $('memoWin'), toasts = $('memoToasts');
    let P = loadProfile();
    let level = 'easy', mode = 'solo';
    try { level = localStorage.getItem('memoLevel') || level; mode = localStorage.getItem('memoMode') || mode; } catch (e) {}
    if (!LEVELS[level]) level = 'easy';
    // состояние раунда
    let first = null, lock = false, moves = 0, pairs = 0, misses = 0, missesTotal = 0, reshuffles = 0, combo = 0, points = 0;
    let turn = 0, duel = [{ pairs: 0 }, { pairs: 0 }];

    // ---------- уведомления ----------
    function toast(html, kind = '') {
      const t = document.createElement('div');
      t.className = 'memo-toast ' + kind; t.innerHTML = html;
      toasts.appendChild(t);
      while (toasts.children.length > 3) toasts.firstElementChild.remove();   // не больше трёх сразу
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3100);
    }
    // крупная надпись по центру поля на секунду — вместо текстовых сообщений
    function burst(text, kind = '') {
      const b = $('memoBurst'); if (!b) return;
      b.className = 'memo-burst'; void b.offsetWidth;
      b.innerHTML = text; b.className = 'memo-burst show ' + kind;   // text — уже экранированный HTML
    }
    function floatText(el, text) {
      const r = el.getBoundingClientRect(), f = document.createElement('div');
      f.className = 'memo-float'; f.textContent = text;
      f.style.left = (r.left + r.width / 2 + scrollX) + 'px'; f.style.top = (r.top + scrollY) + 'px';
      document.body.appendChild(f); setTimeout(() => f.remove(), 1200);
    }

    // ---------- профиль ----------
    function award(id) {
      if (P.ach.includes(id)) return;
      const a = ACH.find((x) => x[0] === id); if (!a) return;
      P.ach.push(id); addXp(200, false);
      toast(`${ico(a[1])} ${esc(a[2])} <i>+200</i>`, 'ach');
    }
    function addXp(n, show = true) {
      const before = rankOf(P.xp);
      P.xp += n; saveProfile(P);
      const after = rankOf(P.xp);
      if (after > before) {
        const back = BACKS.find((b) => b[2] === after);
        toast(`${ico(RANKS[after][2])} ${esc(RANKS[after][1])}!${back ? ` ${ico('gift')} новая рубашка` : ''}`, 'rank');
        burst(`${ico(RANKS[after][2])} ${esc(RANKS[after][1])}!`, 'rank');
      }
      if (show) renderProfile();
    }
    function renderProfile() {
      const box = $('memoProfile'); if (!box) return;
      box.hidden = false;
      const r = rankOf(P.xp), next = RANKS[r + 1];
      $('mpIco').innerHTML = ico(RANKS[r][2]);
      $('mpRank').textContent = RANKS[r][1];
      $('mpXpBar').style.width = next ? `${Math.round(((P.xp - RANKS[r][0]) / (next[0] - RANKS[r][0])) * 100)}%` : '100%';
      $('mpXpText').textContent = next ? `${P.xp}/${next[0]}` : `${P.xp}`;
      $('mpXpBar').parentElement.title = next ? `До звания «${next[1]}»` : 'Высшее звание';
      $('mpHints').textContent = P.hints;
      $('mpHint').disabled = !P.hints || mode !== 'solo';
      $('mpStreak').innerHTML = P.streak > 1 ? `${ico('flame')}${P.streak}` : '';
      applyBack();
    }
    function applyBack() {
      const b = BACKS.find((x) => x[0] === P.back) || BACKS[0];
      board.style.setProperty('--back-filter', b[3] || 'none');
      board.dataset.back = b[0];
    }
    // серия дней и ежедневная подсказка — при первом раунде за день
    function dailyCheck() {
      const d = today();
      if (P.lastDay === d) return;
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      P.streak = P.lastDay === y ? P.streak + 1 : 1;
      P.lastDay = d; P.hints += 1; saveProfile(P);
      toast(`${ico('sun')} Бонус дня +1 ${ico('bulb')}${P.streak > 1 ? ` · ${ico('flame')} ${P.streak}` : ''}`);
      if (P.streak >= 3) award('streak3');
      if (P.streak >= 7) award('streak7');
    }

    // ---------- раздача ----------
    const cfg = () => LEVELS[level];
    // reshuffle=true — после промахов: новые карточки из всех 25 (и найденные тоже), найденные пары раунда возвращаются в игру
    function deal(reshuffle) {
      const n = cfg().pairs;
      const have = found();
      const pick = reshuffle === true ? shuffle([...cards]).slice(0, n)
        : [...shuffle(cards.filter((c) => !have.has(c.slug))), ...shuffle(cards.filter((c) => have.has(c.slug)))].slice(0, n);
      const deck = shuffle([...pick, ...pick]);
      if (reshuffle !== true) { moves = 0; points = 0; missesTotal = 0; reshuffles = 0; note.textContent = ''; turn = 0; duel = [{ pairs: 0 }, { pairs: 0 }]; }
      first = null; lock = false; pairs = 0; misses = 0; combo = 0;
      board.dataset.size = n;
      board.innerHTML = deck.map((c, i) =>
        `<button type="button" class="mcard" data-slug="${c.slug}" aria-label="Карточка ${i + 1}, закрыта" style="--i:${i}">` +
        `<span class="mcard-in"><span class="mcard-back"><img src="/assets/memo/back-s.webp" alt="" width="240" height="360"></span>` +
        `<span class="mcard-face"><img src="${img(c.slug, true)}" alt="" width="240" height="360" loading="lazy"></span></span></button>`).join('');
      document.querySelectorAll('[data-level]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.level === level));
      document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
      $('memoSolo').hidden = mode !== 'solo';
      $('memoDuel').hidden = mode !== 'duel';
      win.hidden = true;
      board.classList.remove('dealt'); void board.offsetWidth; board.classList.add('dealt');
      renderScore(); renderProfile();
    }
    function renderScore() {
      $('memoPoints').textContent = points;
      $('memoCombo').textContent = '×' + Math.max(1, Math.min(combo, 5));
      $('memoComboWrap').classList.toggle('hot', combo >= 2);
      $('memoMoves').textContent = moves;
      $('memoPairs').textContent = pairs; $('memoTotal').textContent = cfg().pairs;
      $('memoMiss').innerHTML = Array.from({ length: cfg().misses }, (_, i) => `<i class="${i < cfg().misses - misses ? '' : 'lost'}">${ico('heart', 'fill')}</i>`).join('');
      $('memoMiss').title = `Промахов подряд до перемешивания: ${cfg().misses}`;
      document.querySelectorAll('#memoDuel .pl').forEach((el, i) => {
        el.classList.toggle('turn', i === turn);
        el.querySelector('[data-pairs]').textContent = duel[i].pairs;
      });
    }
    const name = (i) => esc(document.querySelectorAll('#memoDuel .pl input')[i].value.trim() || `Игрок ${i + 1}`);

    // ---------- ход ----------
    board.addEventListener('click', (e) => {
      const b = e.target.closest('.mcard');
      if (!b || lock || b.classList.contains('open') || b.classList.contains('done')) return;
      const card = cards.find((c) => c.slug === b.dataset.slug);
      b.classList.add('open'); b.setAttribute('aria-label', card.title);
      if (!first) { first = b; return; }
      moves++;
      const pair = [first, b]; first = null; lock = true;
      if (pair[0].dataset.slug === b.dataset.slug) onPair(pair, card, b); else miss(pair);
      renderScore();
    });

    // Новая карточка: история → после неё карточка попадает в коллекцию.
    // Карточка, которая уже в коллекции, историю повторно не показывает — игра просто продолжается.
    function reveal(card, isNew, done) {
      if (!isNew) { done(); return; }
      openStory(card, () => {
        addFound(card.slug); markCollection(card.slug);
        const n = found().size;
        if (n >= 10) award('collect10');
        if (n >= cards.length) award('collect25');
        done();
      });
    }

    function onPair(pair, card, el) {
      pairs++;
      const isNew = !found().has(card.slug);
      if (mode === 'duel') {
        duel[turn].pairs++;
        setTimeout(() => {
          pair.forEach((x) => x.classList.add('done', `p${turn}`));
          const pl = document.querySelectorAll('#memoDuel .pl')[turn]; pl.classList.remove('scored'); void pl.offsetWidth; pl.classList.add('scored');
          renderScore();
          reveal(card, isNew, () => { lock = false; if (pairs === cfg().pairs) finishDuel(); });
        }, 600);
        return;
      }
      combo++; misses = 0;
      const mult = Math.min(combo, 5), gain = 100 * mult + (isNew ? 50 : 0);
      points += gain;
      floatText(el, `+${gain}${mult > 1 ? ` ×${mult}!` : ''}`);
      award('first_pair');
      if (combo >= 2) burst(`${ico('flame')} ×${mult}!${combo === 3 ? ` +${ico('bulb')}` : ''}`, 'combo');
      if (combo === 3) { award('combo3'); P.hints++; saveProfile(P); }
      if (combo === 5) award('combo5');
      setTimeout(() => {
        pair.forEach((x) => x.classList.add('done'));
        reveal(card, isNew, () => { lock = false; if (pairs === cfg().pairs) finishSolo(); });
      }, 650);
    }

    function miss(pair) {
      if (mode === 'duel') {
        setTimeout(() => {
          pair.forEach((x) => { x.classList.remove('open'); x.setAttribute('aria-label', 'Карточка закрыта'); });
          turn = 1 - turn; lock = false; renderScore();
          burst(`${ico('arrow')} ${name(turn)}`, `p${turn}`);
        }, 1000);
        return;
      }
      combo = 0; misses++; missesTotal++;
      setTimeout(() => {
        pair.forEach((x) => { x.classList.remove('open'); x.setAttribute('aria-label', 'Карточка закрыта'); });
        if (misses < cfg().misses) { lock = false; return; }
        // лимит промахов подряд: все карточки (и найденные) закрываются, разлетаются и сдаются новые
        reshuffles++;
        burst(`${ico('shuffle')} Перемешка!`, 'shuffle');
        board.querySelectorAll('.mcard').forEach((x) => x.classList.remove('done', 'open'));
        setTimeout(() => { board.classList.add('shuffling'); setTimeout(() => { board.classList.remove('shuffling'); deal(true); }, 650); }, 500);
      }, 1000);
    }

    // ---------- конец раунда ----------
    function finishSolo() {
      const n = cfg().pairs;
      const stars = reshuffles ? 1 : missesTotal <= Math.ceil(n / 2) ? 3 : 2;
      const bonus = stars * 100 + (missesTotal === 0 ? 300 : 0);
      points += bonus;
      const best = P.best[level] || 0, record = points > best;
      if (record) P.best[level] = points;
      P.games++; saveProfile(P);
      addXp(points);
      if (missesTotal === 0) award('perfect');
      if (stars === 3) { award('stars3'); P.hints++; saveProfile(P); }
      if (level === 'mid') award('win_mid');
      if (level === 'hard') award('win_hard');
      renderProfile(); renderScore();
      const next = { easy: 'mid', mid: 'hard' }[level];
      // итог — значками, без пояснений (подробности — в подсказках при наведении)
      win.innerHTML = `<div class="win-card"><div class="win-stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}" style="--k:${k}">${ico('star', 'fill')}</span>`).join('')}</div>
        ${record ? `<div class="win-record">${ico('medal')} Рекорд!</div>` : ''}
        <p class="win-points"><b>${points}</b></p>
        <p class="win-row"><span title="Ходов">${ico('cards')} ${moves}</span><span title="Промахов">${ico('miss')} ${missesTotal}</span><span title="Бонус за звёзды">${ico('star')} +${bonus}</span>${stars === 3 ? `<span title="Подсказка">+1 ${ico('bulb')}</span>` : ''}<span title="Рекорд уровня">${ico('medal')} ${Math.max(best, points)}</span></p>
        <div class="win-btns"><button type="button" class="btn primary" data-memo-again>${ico('play')} Ещё</button>${next ? `<button type="button" class="btn" data-next="${next}">${ico('up')} ${LEVELS[next].pairs} пар</button>` : ''}</div></div>`;
      win.querySelector('[data-next]')?.addEventListener('click', (e) => { level = e.target.dataset.next; try { localStorage.setItem('memoLevel', level); } catch (x) {} deal(); });
      $('memoBurst').className = 'memo-burst';   // вспышка не должна лечь поверх итога
      win.hidden = false;
      board.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function finishDuel() {
      const [a, b] = duel.map((d) => d.pairs);
      const res = a === b ? 'Ничья!' : `${name(a > b ? 0 : 1)}!`;
      award('duel');
      addXp(150);
      win.innerHTML = `<div class="win-card"><div class="win-stars"><span class="on">${ico(a === b ? 'duo' : 'trophy')}</span></div><h2>${res}</h2>
        <p class="win-points"><b class="c0">${a}</b> : <b class="c1">${b}</b></p>
        <div class="win-btns"><button type="button" class="btn primary" data-memo-again>${ico('refresh')} Реванш</button></div></div>`;
      $('memoBurst').className = 'memo-burst';   // вспышка не должна лечь поверх итога
      win.hidden = false;
      board.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ---------- подсказка: на секунду открыть все закрытые карточки ----------
    $('mpHint').addEventListener('click', () => {
      if (!P.hints || lock || mode !== 'solo') return;
      const closed = [...board.querySelectorAll('.mcard:not(.open):not(.done)')];
      if (!closed.length) return;
      P.hints--; saveProfile(P); award('hint'); renderProfile();
      lock = true;
      closed.forEach((x) => x.classList.add('peek'));
      setTimeout(() => { closed.forEach((x) => x.classList.remove('peek')); lock = false; }, 1300);
    });

    // ---------- призы ----------
    $('mpPrizes').addEventListener('click', () => {
      const dlg = $('memoPrizes'), r = rankOf(P.xp);
      dlg.querySelector('.prizes-body').innerHTML = `<h2 id="memoPrizesTitle">Призы и достижения</h2>
        <h3>Звания</h3><ol class="pz-ranks">${RANKS.map((x, i) => `<li class="${i <= r ? 'got' : ''}${i === r ? ' now' : ''}"><span>${ico(x[2])}</span><b>${esc(x[1])}</b><small>${x[0]} опыта</small></li>`).join('')}</ol>
        <h3>Рубашки карточек</h3>
        <div class="pz-backs">${BACKS.map((b) => { const open = r >= b[2]; return `<button type="button" data-back="${b[0]}" ${open ? '' : 'disabled'} class="${P.back === b[0] ? 'sel' : ''}"><img src="/assets/memo/back-s.webp" alt="" style="filter:${b[3] || 'none'}">${esc(b[1])}${open ? '' : `<small>${ico('lock')} ${esc(RANKS[b[2]][1])}</small>`}</button>`; }).join('')}</div>
        <h3>Достижения: ${P.ach.length} из ${ACH.length}</h3><div class="pz-ach">${ACH.map((a) => `<div class="${P.ach.includes(a[0]) ? 'got' : ''}"><span>${ico(a[1])}</span><b>${esc(a[2])}</b><small>${esc(a[3])}</small></div>`).join('')}</div>
        <h3>Рекорды</h3><p>6 пар: <b>${P.best.easy || '—'}</b> · 10 пар: <b>${P.best.mid || '—'}</b> · 15 пар: <b>${P.best.hard || '—'}</b> · сыграно раундов: <b>${P.games}</b></p>`;
      dlg.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
        P.back = b.dataset.back; saveProfile(P); applyBack();
        dlg.querySelectorAll('[data-back]').forEach((x) => x.classList.toggle('sel', x === b));
      }));
      dlg.showModal();
    });

    // ---------- переключатели ----------
    document.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => {
      level = b.dataset.level; try { localStorage.setItem('memoLevel', level); } catch (e) {} deal();
    }));
    document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode; try { localStorage.setItem('memoMode', mode); } catch (e) {}
      deal();
      if (mode === 'duel') burst(`${ico('arrow')} ${name(0)}`, 'p0');
    }));
    document.addEventListener('click', (e) => { if (e.target.closest('[data-memo-again]')) deal(); });


    dailyCheck();
    deal();
    if (mode === 'duel') setTimeout(() => burst(`${ico('arrow')} ${name(0)}`, 'p0'), 700);
    videos(); // заранее, чтобы окно истории открылось сразу с видео
  }

  // ---------- Окно с историей найденной пары ----------
  async function openStory(card, onClose) {
    const dlg = document.getElementById('memoStory');
    const v = (await videos())[card.slug];
    const idea = card.slug === 'tvoya-ideya'
      ? '<p class="story-cta"><a class="btn primary" href="/igra/ideya/">Предложить свою идею</a></p>' : '';
    dlg.querySelector('.story-body').innerHTML =
      `<div class="story-head"><img class="story-card" src="${img(card.slug)}" alt="Карточка «${esc(card.title)}»" width="640" height="960">` +
      `<div><p class="eyebrow">Пара найдена!</p><h2 id="memoStoryTitle">${esc(card.title)}</h2>${storyHtml(card, root.MEMO_CARDS, { heading: 'h3', video: v })}</div></div>` +
      idea + `<p class="story-cta"><a class="btn" href="/igra/${card.slug}/" target="_blank" rel="noopener">Открыть историю отдельной страницей</a></p>`;
    dlg.querySelector('.story-scroll').scrollTop = 0;
    const close = () => { dlg.removeEventListener('close', close); dlg.querySelectorAll('iframe').forEach((f) => f.remove()); onClose && onClose(); };
    dlg.addEventListener('close', close);
    dlg.showModal();
  }

  // ---------- Видео на странице карточки (если ссылку добавили после сборки) ----------
  async function initStoryPage() {
    const page = document.querySelector('[data-memo-page]');
    if (!page) return;
    if (page.querySelector('.story-video')) return;
    const v = (await videos())[page.dataset.memoPage];
    const e = v && root.HomeBlocks && root.HomeBlocks.embedUrl(v);
    const hook = page.querySelector('.story-hook');
    if (e && hook) hook.insertAdjacentHTML('afterend', `<div class="story-video"><div class="video-frame"><button type="button" data-embed="${esc(e)}" onclick="Memo.playVideo(this)" aria-label="Смотреть видео"><img src="${img(page.dataset.memoPage)}" alt="" loading="lazy"><span class="video-play" aria-hidden="true">▶</span><span class="video-label">Смотреть видео-историю</span></button></div></div>`);
  }

  // ---------- Форма «Предложи свою идею» ----------
  function initIdeaForm() {
    const f = document.getElementById('ideaForm');
    if (!f) return;
    const msg = document.getElementById('ideaMsg');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.website.value) return; // ловушка для ботов
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true; msg.className = 'idea-msg'; msg.textContent = 'Отправляем…';
      try {
        await api('memo_ideas', {
          method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            child_name: f.child_name.value.trim().slice(0, 60), age: f.age.value ? +f.age.value : null,
            idea_title: f.idea_title.value.trim().slice(0, 120), idea_text: f.idea_text.value.trim().slice(0, 3000),
            contact: f.contact.value.trim().slice(0, 200),
          }),
        });
        f.hidden = true;
        document.getElementById('ideaDone').hidden = false;
        document.getElementById('ideaDone').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        msg.className = 'idea-msg error';
        msg.textContent = 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз.';
        btn.disabled = false;
      }
    });
  }

  root.Memo = { storyHtml, readMinutes, minutesWord, playVideo, img, ico };
  if (typeof document !== 'undefined') {
    const start = () => { initGame(); initStoryPage(); initIdeaForm(); markCollection(); };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
