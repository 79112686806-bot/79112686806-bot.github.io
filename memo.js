// Игра «Мемо «Инженерия»: общий шаблон истории карточки (сборка + браузер),
// игра на пары на /igra/ и форма идеи на /igra/ideya/.
// Данные карточек — content/memo.json (сборка кладёт их в /igra/memo-data.js как window.MEMO_CARDS).
(function (root) {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const img = (slug, small) => `/assets/memo/${slug}${small ? '-s' : ''}.webp`;
  const ICONS = { short: '✦', history: '📜', how: '⚙', then: '⏳', fact: '❗', try: '🔧', think: '💭' };

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
      `<section class="story-part story-${s.key}"><${heading}><span class="story-ico" aria-hidden="true">${ICONS[s.key] || '•'}</span>${esc(s.title)}` +
      `${s.note ? ` <span class="story-adult" title="Делайте вместе со взрослым">👨‍👧 ${esc(s.note)}</span>` : ''}</${heading}>` +
      paras(s.text) + (s.list.length ? `<ul>${s.list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : '') + '</section>').join('');
    const links = card.links.length
      ? `<section class="story-part story-links"><${heading}><span class="story-ico" aria-hidden="true">🔗</span>Ищи связь</${heading}><p>Эта карточка связана с другими:</p><ul class="story-chips">${card.links.map((s) => by[s] ? `<li><a href="/igra/${s}/"><img src="${img(s, true)}" alt="" loading="lazy" width="40" height="60">${esc(by[s].title)}</a></li>` : '').join('')}</ul></section>`
      : card.linksText ? `<section class="story-part story-links"><${heading}><span class="story-ico" aria-hidden="true">🔗</span>Ищи связь</${heading}><p>${esc(card.linksText)}</p></section>` : '';
    const v = video && root.HomeBlocks && root.HomeBlocks.embedUrl(video);
    const videoBlock = v ? `<div class="story-video"><div class="video-frame"><button type="button" data-embed="${esc(v)}" onclick="Memo.playVideo(this)" aria-label="Смотреть видео: ${esc(card.title)}"><img src="${img(card.slug)}" alt="" loading="lazy"><span class="video-play" aria-hidden="true">▶</span><span class="video-label">Смотреть видео-историю</span></button></div></div>` : '';
    const min = readMinutes(card);
    return `<p class="story-meta"><span>📖 читать ${min} ${minutesWord(min)}</span>${v ? '<span>🎬 есть видео</span>' : ''}${card.years ? `<span>${esc(card.years)}</span>` : ''}</p>` +
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
  function markCollection() {
    const s = found();
    document.querySelectorAll('[data-memo-card]').forEach((a) => a.classList.toggle('got', s.has(a.dataset.memoCard)));
    const n = document.getElementById('memoCount');
    if (n) n.textContent = s.size;
  }

  // ---------- Игра на пары ----------
  // Уровни: число пар и сколько промахов подряд можно сделать, прежде чем карточки перемешаются (только «Один»)
  const LEVELS = { easy: { pairs: 6, misses: 3 }, mid: { pairs: 10, misses: 5 }, hard: { pairs: 15, misses: 8 } };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many);

  // ---------- Профиль игрока: опыт, звания, подсказки, достижения, призы (в этом браузере) ----------
  const RANKS = [
    [0, 'Новичок', '🔩'], [2000, 'Юный механик', '🔧'], [6000, 'Подмастерье', '⚙'], [12000, 'Изобретатель', '💡'],
    [20000, 'Конструктор', '📐'], [32000, 'Главный инженер', '🏗'], [50000, 'Легенда инженерии', '🏆'],
  ];
  // Рубашки карточек — призы за звания (номер звания, с которого открывается)
  const BACKS = [
    ['classic', 'Классика', 0, ''], ['blueprint', 'Синий чертёж', 1, 'hue-rotate(185deg) saturate(1.5)'],
    ['chalk', 'Красный мел', 2, 'hue-rotate(-25deg) saturate(2.2)'], ['emerald', 'Изумруд', 3, 'hue-rotate(95deg) saturate(1.7)'],
    ['night', 'Ночная мастерская', 4, 'invert(.88) hue-rotate(180deg) saturate(1.4)'], ['gold', 'Золото', 5, 'sepia(1) saturate(3.2) brightness(1.08)'],
    ['legend', 'Пурпур легенды', 6, 'hue-rotate(290deg) saturate(2.4)'],
  ];
  const ACH = [
    ['first_pair', '🔩', 'Первая пара', 'Найди первую пару'],
    ['combo3', '🔥', 'Комбо ×3', 'Три пары подряд без промаха'],
    ['combo5', '⚡', 'Комбо ×5', 'Пять пар подряд без промаха'],
    ['perfect', '🎯', 'Без промахов', 'Пройди раунд, не промахнувшись ни разу'],
    ['stars3', '⭐', 'Три звезды', 'Получи три звезды за раунд'],
    ['win_mid', '🥈', '10 пар', 'Пройди уровень «10 пар»'],
    ['win_hard', '🥇', '15 пар', 'Пройди уровень «15 пар»'],
    ['collect10', '📚', 'Коллекционер', 'Собери 10 карточек'],
    ['collect25', '🏆', 'Вся коллекция', 'Собери все 25 карточек'],
    ['streak3', '📅', 'Три дня подряд', 'Играй три дня подряд'],
    ['streak7', '🗓', 'Неделя подряд', 'Играй семь дней подряд'],
    ['hint', '💡', 'Хитрость', 'Используй подсказку'],
    ['duel', '🤝', 'Дуэль', 'Сыграй вдвоём до конца'],
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
      toast(`<b>${a[1]} Достижение: ${esc(a[2])}</b><small>${esc(a[3])} · +200 опыта</small>`, 'ach');
    }
    function addXp(n, show = true) {
      const before = rankOf(P.xp);
      P.xp += n; saveProfile(P);
      const after = rankOf(P.xp);
      if (after > before) {
        const back = BACKS.find((b) => b[2] === after);
        toast(`<b>${RANKS[after][2]} Новое звание: ${esc(RANKS[after][1])}!</b>${back ? `<small>Приз — рубашка «${esc(back[1])}». Выбери её в «Призах».</small>` : ''}`, 'rank');
      }
      if (show) renderProfile();
    }
    function renderProfile() {
      const box = $('memoProfile'); if (!box) return;
      box.hidden = false;
      const r = rankOf(P.xp), next = RANKS[r + 1];
      $('mpIco').textContent = RANKS[r][2];
      $('mpRank').textContent = RANKS[r][1];
      $('mpXpBar').style.width = next ? `${Math.round(((P.xp - RANKS[r][0]) / (next[0] - RANKS[r][0])) * 100)}%` : '100%';
      $('mpXpText').textContent = next ? `${P.xp} / ${next[0]} опыта до звания «${next[1]}»` : `${P.xp} опыта — высшее звание!`;
      $('mpHints').textContent = P.hints;
      $('mpHint').disabled = !P.hints || mode !== 'solo';
      $('mpStreak').textContent = P.streak > 1 ? `🔥 ${P.streak} ${plural(P.streak, 'день', 'дня', 'дней')} подряд` : '';
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
      toast(`<b>☀ Ежедневный бонус: +1 подсказка 💡</b>${P.streak > 1 ? `<small>Ты играешь ${P.streak} ${plural(P.streak, 'день', 'дня', 'дней')} подряд!</small>` : '<small>Заходи завтра — бонус будет снова.</small>'}`);
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
      $('memoMoves').textContent = moves;
      $('memoPairs').textContent = pairs; $('memoTotal').textContent = cfg().pairs;
      $('memoMiss').innerHTML = Array.from({ length: cfg().misses }, (_, i) => `<i class="${i < misses ? 'on' : ''}"></i>`).join('');
      $('memoMissWrap').title = `${cfg().misses} промахов подряд — карточки перемешаются`;
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

    function onPair(pair, card, el) {
      pairs++;
      const isNew = !found().has(card.slug);
      addFound(card.slug); markCollection();
      if (mode === 'duel') {
        duel[turn].pairs++;
        setTimeout(() => {
          pair.forEach((x) => x.classList.add('done', `p${turn}`));
          toast(`<b>${name(turn)}: пара «${esc(card.title)}»!</b><small>Ходи ещё раз. История — в коллекции ниже.</small>`);
          lock = false; renderScore();
          if (pairs === cfg().pairs) finishDuel();
        }, 600);
        return;
      }
      combo++; misses = 0;
      const mult = Math.min(combo, 5), gain = 100 * mult + (isNew ? 50 : 0);
      points += gain;
      floatText(el, `+${gain}${mult > 1 ? ` ×${mult}!` : ''}`);
      award('first_pair');
      if (combo === 3) { award('combo3'); P.hints++; saveProfile(P); toast('<b>🔥 Комбо ×3! +1 подсказка 💡</b>'); }
      if (combo === 5) award('combo5');
      const n = found().size;
      if (n >= 10) award('collect10');
      if (n >= cards.length) award('collect25');
      setTimeout(() => {
        pair.forEach((x) => x.classList.add('done'));
        openStory(card, () => { lock = false; if (pairs === cfg().pairs) finishSolo(); });
      }, 650);
    }

    function miss(pair) {
      if (mode === 'duel') {
        setTimeout(() => {
          pair.forEach((x) => { x.classList.remove('open'); x.setAttribute('aria-label', 'Карточка закрыта'); });
          turn = 1 - turn; lock = false; renderScore();
          note.innerHTML = `Ход: <b>${name(turn)}</b>`;
        }, 1000);
        return;
      }
      combo = 0; misses++; missesTotal++;
      setTimeout(() => {
        pair.forEach((x) => { x.classList.remove('open'); x.setAttribute('aria-label', 'Карточка закрыта'); });
        if (misses < cfg().misses) { lock = false; return; }
        // лимит промахов подряд: все карточки (и найденные) закрываются, разлетаются и сдаются новые
        reshuffles++;
        note.textContent = `${cfg().misses} ${plural(cfg().misses, 'промах', 'промаха', 'промахов')} подряд — карточки перемешались! Найденные пары тоже вернулись в игру.`;
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
      win.innerHTML = `<div class="win-stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}" style="--k:${k}">★</span>`).join('')}</div>
        <h2>Все пары найдены!${record ? ' <span class="win-record">Новый рекорд!</span>' : ''}</h2>
        <p class="win-points"><b>${points}</b> ${plural(points, 'очко', 'очка', 'очков')}</p>
        <p>Ходов: <b>${moves}</b> · промахов: <b>${missesTotal}</b> · бонус за звёзды: <b>+${bonus}</b>${stars === 3 ? ' · <b>+1 подсказка 💡</b>' : ''}</p>
        <p class="win-tip">${stars < 3 ? (reshuffles ? 'Чтобы получить больше звёзд — не допускай, чтобы карточки перемешались.' : `Для трёх звёзд — не больше ${Math.ceil(n / 2)} промахов за раунд.`) : 'Отлично! Попробуй уровень сложнее.'} Рекорд уровня: <b>${Math.max(best, points)}</b>.</p>
        <button type="button" class="btn primary" data-memo-again>Играть ещё</button>`;
      win.hidden = false;
      win.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function finishDuel() {
      const [a, b] = duel.map((d) => d.pairs);
      const res = a === b ? 'Ничья! 🤝' : `Победа: ${name(a > b ? 0 : 1)}!`;
      award('duel');
      addXp(150);
      win.innerHTML = `<div class="win-stars"><span class="on">🏆</span></div><h2>${res}</h2>
        <p class="win-points">${name(0)} — <b>${a}</b> · ${name(1)} — <b>${b}</b></p>
        <p class="win-tip">Найденные карточки — в коллекции ниже: там можно прочитать их истории.</p>
        <button type="button" class="btn primary" data-memo-again>Реванш</button>`;
      win.hidden = false;
      win.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        <h3>Звания</h3><ol class="pz-ranks">${RANKS.map((x, i) => `<li class="${i <= r ? 'got' : ''}${i === r ? ' now' : ''}"><span>${x[2]}</span><b>${esc(x[1])}</b><small>${x[0]} опыта</small></li>`).join('')}</ol>
        <h3>Рубашки карточек</h3><p class="pz-sub">Открываются вместе со званиями. Нажми, чтобы выбрать.</p>
        <div class="pz-backs">${BACKS.map((b) => { const open = r >= b[2]; return `<button type="button" data-back="${b[0]}" ${open ? '' : 'disabled'} class="${P.back === b[0] ? 'sel' : ''}"><img src="/assets/memo/back-s.webp" alt="" style="filter:${b[3] || 'none'}">${esc(b[1])}${open ? '' : `<small>🔒 ${esc(RANKS[b[2]][1])}</small>`}</button>`; }).join('')}</div>
        <h3>Достижения: ${P.ach.length} из ${ACH.length}</h3><div class="pz-ach">${ACH.map((a) => `<div class="${P.ach.includes(a[0]) ? 'got' : ''}"><span>${a[1]}</span><b>${esc(a[2])}</b><small>${esc(a[3])}</small></div>`).join('')}</div>
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
      note.innerHTML = mode === 'duel' ? `Ход: <b>${name(0)}</b>. Нашёл пару — ходи ещё раз, промахнулся — ход другу.` : '';
    }));
    document.addEventListener('click', (e) => { if (e.target.closest('[data-memo-again]')) deal(); });
    document.querySelectorAll('#memoDuel input').forEach((i) => i.addEventListener('input', () => { if (mode === 'duel' && !lock) note.innerHTML = `Ход: <b>${name(turn)}</b>`; }));

    dailyCheck();
    deal();
    if (mode === 'duel') note.innerHTML = `Ход: <b>${name(0)}</b>. Нашёл пару — ходи ещё раз, промахнулся — ход другу.`;
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
    addFound(page.dataset.memoPage);
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

  root.Memo = { storyHtml, readMinutes, minutesWord, playVideo, img };
  if (typeof document !== 'undefined') {
    const start = () => { initGame(); initStoryPage(); initIdeaForm(); markCollection(); };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
