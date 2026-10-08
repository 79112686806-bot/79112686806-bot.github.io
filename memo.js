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
  const LEVELS = { easy: 6, mid: 10, hard: 15 };
  const MAX_MISSES = 3; // столько промахов подряд — и карточки сдаются заново
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function initGame() {
    const board = document.getElementById('memoBoard');
    if (!board || !root.MEMO_CARDS) return;
    const cards = root.MEMO_CARDS;
    const moves = document.getElementById('memoMoves'), pairs = document.getElementById('memoPairs'), total = document.getElementById('memoTotal');
    const missEl = document.getElementById('memoMiss'), note = document.getElementById('memoNote');
    let first = null, lock = false, nMoves = 0, nPairs = 0, misses = 0, level = 'easy';
    try { level = localStorage.getItem('memoLevel') || level; } catch (e) {}

    // reshuffle=true — после промахов: новые карточки из всех 25 (и найденные тоже), найденные пары раунда возвращаются в игру
    function deal(reshuffle) {
      const n = LEVELS[level] || 6;
      // при новой игре сначала карточки, которых ещё нет в коллекции, — чтобы за несколько игр собрать все 25
      const have = found();
      const pick = reshuffle === true ? shuffle([...cards]).slice(0, n)
        : [...shuffle(cards.filter((c) => !have.has(c.slug))), ...shuffle(cards.filter((c) => have.has(c.slug)))].slice(0, n);
      const deck = shuffle([...pick, ...pick]);
      if (reshuffle !== true) { nMoves = 0; if (note) note.textContent = ''; }
      first = null; lock = false; nPairs = 0; misses = 0;
      moves.textContent = nMoves; showMisses(); pairs.textContent = 0; total.textContent = n;
      board.dataset.size = n;
      board.innerHTML = deck.map((c, i) =>
        `<button type="button" class="mcard" data-slug="${c.slug}" aria-label="Карточка ${i + 1}, закрыта" style="--i:${i}">` +
        `<span class="mcard-in"><span class="mcard-back"><img src="/assets/memo/back-s.webp" alt="" width="240" height="360"></span>` +
        `<span class="mcard-face"><img src="${img(c.slug, true)}" alt="" width="240" height="360" loading="lazy"></span></span></button>`).join('');
      document.querySelectorAll('.memo-levels button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.level === level));
      document.getElementById('memoWin').hidden = true;
      board.classList.remove('dealt'); void board.offsetWidth; board.classList.add('dealt');
    }

    function showMisses() {
      if (missEl) missEl.innerHTML = Array.from({ length: MAX_MISSES }, (_, i) => `<i class="${i < misses ? 'on' : ''}"></i>`).join('');
    }

    board.addEventListener('click', (e) => {
      const b = e.target.closest('.mcard');
      if (!b || lock || b.classList.contains('open') || b.classList.contains('done')) return;
      const card = cards.find((c) => c.slug === b.dataset.slug);
      b.classList.add('open'); b.setAttribute('aria-label', card.title);
      if (!first) { first = b; return; }
      nMoves++; moves.textContent = nMoves;
      if (first.dataset.slug === b.dataset.slug) {
        const pair = [first, b]; first = null; lock = true;
        nPairs++; pairs.textContent = nPairs; misses = 0; showMisses();
        setTimeout(() => {
          pair.forEach((x) => x.classList.add('done'));
          addFound(card.slug); markCollection();
          openStory(card, () => { lock = false; if (nPairs === (LEVELS[level] || 6)) win(); });
        }, 650);
      } else {
        const pair = [first, b]; first = null; lock = true;
        misses++; showMisses();
        setTimeout(() => {
          pair.forEach((x) => { x.classList.remove('open'); x.setAttribute('aria-label', 'Карточка закрыта'); });
          if (misses < MAX_MISSES) { lock = false; return; }
          // три промаха подряд: все карточки (и найденные) закрываются, разлетаются и сдаются новые
          if (note) note.textContent = `${MAX_MISSES} промаха подряд — карточки перемешались! Найденные пары тоже вернулись в игру.`;
          board.querySelectorAll('.mcard').forEach((x) => x.classList.remove('done', 'open'));
          setTimeout(() => { board.classList.add('shuffling'); setTimeout(() => { board.classList.remove('shuffling'); deal(true); }, 650); }, 500);
        }, 1000);
      }
    });

    function win() {
      const w = document.getElementById('memoWin');
      w.querySelector('[data-moves]').textContent = nMoves;
      w.hidden = false;
      w.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    document.querySelectorAll('.memo-levels button').forEach((b) => b.addEventListener('click', () => {
      level = b.dataset.level; try { localStorage.setItem('memoLevel', level); } catch (e) {} deal();
    }));
    document.querySelectorAll('[data-memo-again]').forEach((b) => b.addEventListener('click', () => deal()));
    deal();
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
