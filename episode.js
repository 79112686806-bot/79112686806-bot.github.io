// Интерактивные мультфильмы («серии») в личном кабинете.
// Серия — набор роликов-узлов в закрытом бакете episodes (<серия>/<узел>.mp4) и граф переходов ниже:
// после узла с вопросом крутится петля ожидания (<узел>-wait), ребёнок отвечает голосом
// (Web Speech API) или кнопками/полем, и по ответу выбирается следующий узел.
// Episode.mount(el, { id, sb, onMeet, onAnswer }) → { pause, resume, destroy }; onMeet — кнопка «Встреча с преподавателем»,
// onAnswer({ run, node, question, answer, heard, via }) — ответ на вопрос серии (run — один просмотр,
// via: voice | text | button | mixed | skip | timeout, heard — что дословно распознал микрофон).
(function () {
  const has = (t, ...w) => w.some((x) => t.includes(x));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- Сценарии серий ----------
  // ask: вопрос после ролика; kind: name | choice | free | ideas | any; next(ответ) → следующий узел
  const EPISODES = {
    ep1: {
      title: 'Серия 1. Как мыслит инженер',
      start: 'n01',
      slots: { name: [660, 300, 600, 80], problem: [580, 222, 340, 104], ideas: [572, 400, 816, 296] },   // в пикселях кадра 1920×1080
      endText: 'Не забудь задание: найди дома три предмета, которые придумали инженеры, и подумай, как бы ты их улучшил.',
      graph: (S) => ({
        n01: { ask: { kind: 'name', q: 'Как тебя зовут?', input: 'Твоё имя' }, next: () => 'n02' },
        n02: { next: () => 'n03', show: ['name'], delay: 800 },
        n03: { ask: { kind: 'choice', q: 'Что придумали раньше?', opts: [['wheel', 'Колесо', ['колес', 'колёс']], ['bag', 'Чемодан на колёсиках', ['чемод', 'сумк']]] }, next: (a) => (a === 'wheel' ? 'n04a' : 'n04b'), outs: ['n04a', 'n04b'] },
        n04a: { next: () => 'n05' }, n04b: { next: () => 'n05' }, n05: { next: () => 'n06' },
        n06: { ask: { kind: 'free', q: 'Какая вещь тебя бесит?', input: 'Например: наушники вечно путаются', save: 'problem' }, next: () => 'n07', showAfter: ['problem'] },
        n07: { show: ['problem'], ask: { kind: 'ideas', q: 'Мозговой штурм: говори все идеи подряд!', secs: 20, input: 'Напиши идею и нажми Enter' }, next: () => (S.ideas.length >= 3 ? 'n08a' : 'n08b'), outs: ['n08a', 'n08b'] },
        n08a: { show: ['problem', 'ideas'], next: () => 'n09' }, n08b: { show: ['problem', 'ideas'], next: () => 'n09' },
        n09: { ask: { kind: 'choice', q: 'Куда отправимся?', opts: [['past', 'В прошлое', ['прош', 'древн', 'назад', 'истор']], ['future', 'В будущее', ['будущ', 'вперёд', 'вперед', 'завтра']]] }, next: (a) => (a === 'future' ? 'n10b' : 'n10a'), outs: ['n10a', 'n10b'] },
        n10a: { next: () => 'n11' }, n10b: { next: () => 'n11' },
        n11: { ask: { kind: 'any', q: 'Скажи: «Поехали!»', opts: [['go', 'Поехали!', []]] }, next: () => 'n12' },
        n12: { next: () => null },
      }),
    },
  };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function mount(root, { id, sb, onMeet, onAnswer }) {
    const E = EPISODES[id];
    if (!E) { root.textContent = 'Серия не найдена'; return null; }
    const S = { name: '', problem: '', ideas: [] };
    const G = E.graph(S);
    const wrap = document.createElement('div'); wrap.className = 'ep-player';
    wrap.innerHTML =
      `<div class="ep-stage">` +
        `<div class="ep-slot ep-slot-name"></div><div class="ep-slot ep-slot-problem"></div><div class="ep-slot ep-slot-ideas"></div>` +
        `<div class="ep-tools">${onMeet ? '<button type="button" data-a="meet" title="Встреча с преподавателем" aria-label="Встреча с преподавателем">📞</button>' : ''}` +
          `<button type="button" data-a="fs" title="Во весь экран" aria-label="Во весь экран">⛶</button></div>` +
        `<div class="ep-load">Загружаем серию…</div>` +
        `<div class="ep-end" hidden><div class="ep-eye">Серия пройдена!</div><h3 class="ep-end-title"></h3><p>${E.endText}</p>` +
          `<div class="ep-end-btns"><button type="button" class="btn" data-a="again">↻ Посмотреть ещё раз</button>` +
          `${onMeet ? '<button type="button" class="btn primary" data-a="meet">📞 Встреча с преподавателем</button>' : ''}</div></div>` +
      `</div>` +
      `<div class="ep-ask" role="dialog" aria-live="polite" hidden><h4></h4><div class="ep-mic"><i></i><span></span></div>` +
        `<div class="ep-heard"></div><div class="ep-opts"></div><div class="ep-timer" hidden><b></b></div></div>`;
    root.replaceChildren(wrap);
    const $ = (s) => wrap.querySelector(s);
    const stage = $('.ep-stage'), askEl = $('.ep-ask'), heard = $('.ep-heard'), opts = $('.ep-opts');
    const slot = { name: $('.ep-slot-name'), problem: $('.ep-slot-problem'), ideas: $('.ep-slot-ideas') };
    for (const [k, [x, y, w, h]] of Object.entries(E.slots)) Object.assign(slot[k].style, { left: x / 19.2 + '%', top: y / 10.8 + '%', width: w / 19.2 + '%', height: h / 10.8 + '%' });

    const newRun = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
    let run = newRun();
    let urls = {}, cur = null, onScreen = null, paused = false, dead = false, micOk = !!SR, rec = null;
    const vids = {}, resumeQ = [];
    let pausedAt = 0, pausedTotal = 0;
    const clock = () => Date.now() - pausedTotal;

    // ---------- Видео: по элементу на ролик, следующие заранее подгружаются ----------
    function vid(n) {
      if (vids[n]) return vids[n];
      const v = document.createElement('video');
      v.src = urls[n]; v.preload = 'auto'; v.playsInline = true;
      if (n.endsWith('-wait')) { v.loop = true; v.muted = true; }
      stage.insertBefore(v, stage.firstChild);
      return (vids[n] = v);
    }
    function preload(n) {
      const g = G[n]; if (!g) return;
      if (g.ask) vid(n + '-wait');
      (g.outs || [g.next('')]).forEach((x) => x && vid(x));
    }
    function show(n) {
      const v = vid(n); onScreen = v;
      Object.values(vids).forEach((x) => { if (x !== v) { x.classList.remove('on'); if (!x.paused) x.pause(); } });
      v.currentTime = 0; v.classList.add('on');
      if (!paused) playOrTap(v);
    }
    // iOS иногда не даёт запустить следующий ролик со звуком без нажатия — тогда показываем кнопку
    function playOrTap(v) {
      v.play().catch((e) => {
        if (e.name !== 'NotAllowedError' || dead) return;
        let b = $('.ep-tap');
        if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'ep-tap'; b.textContent = '▶ Продолжить'; stage.append(b); }
        b.onclick = () => { b.remove(); if (onScreen) onScreen.play().catch(() => {}); };
      });
    }
    // во весь экран: где можно — настоящий полноэкранный режим, на iPhone — растягиваем плеер на всё окно
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    function setMax(on) { wrap.classList.toggle('ep-max', on); document.documentElement.classList.toggle('ep-lock', on); }
    function exitFs() { setMax(false); if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {}); }
    function toggleFs() {
      if (fsEl() || wrap.classList.contains('ep-max')) return exitFs();
      const req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
      if (!req) return setMax(true);
      const p = req.call(wrap); if (p && p.catch) p.catch(() => setMax(true));
    }
    function overlays(list) { for (const k in slot) slot[k].classList.toggle('on', list.includes(k)); }
    function play(n) {
      cur = n; const g = G[n];
      overlays([]); setTimeout(() => cur === n && overlays(g.show || []), g.delay || 0);
      preload(n);
      vid(n).onended = () => {
        if (g.ask) {
          show(n + '-wait'); overlays([...(g.show || []), ...(g.showAfter || [])]);
          askQ(g.ask).then((r) => {
            if (onAnswer) try { onAnswer({ run, node: n, question: g.ask.q, answer: r.answer || '', heard: r.heard || null, via: r.via }); } catch (e) { console.error(e); }
            go(g.next(r.val));
          });
        }
        else go(g.next());
      };
      show(n);
    }
    function go(n) { if (dead) return; if (n) play(n); else finish(); }

    // ---------- Распознавание речи; без него — кнопки и поле ввода ----------
    function listen({ continuous = false, onText, onFinal, onEnd }) {
      if (!micOk) return null;
      const r = new SR(); r.lang = 'ru-RU'; r.interimResults = true; r.continuous = continuous; r.maxAlternatives = 1;
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const txt = e.results[i][0].transcript.trim();
          if (e.results[i].isFinal) onFinal && onFinal(txt); else onText && onText(txt);
        }
      };
      r.onerror = (e) => { if (['not-allowed', 'service-not-allowed', 'network'].includes(e.error)) { micOk = false; micState(false); } };
      r.onend = () => onEnd && onEnd();
      try { r.start(); } catch (e) {}
      return r;
    }
    function micState(on) { $('.ep-mic').classList.toggle('off', !on); $('.ep-mic span').textContent = on ? 'Говори — я слушаю' : 'Микрофон недоступен — ответь кнопкой'; }
    // слушаем по кругу, пока вопрос открыт; на паузе — ждём продолжения
    const loopListen = (isDone, o) => { const loop = () => { if (isDone() || dead) return; if (paused) { resumeQ.push(loop); return; } rec = listen({ ...o, onEnd: () => setTimeout(loop, 200) }); }; loop(); };

    function askQ(a) {
      return new Promise((resolve) => {
        let done = false, timer = null;
        const end = (val, info = {}) => { if (done) return; done = true; clearInterval(timer); try { rec && rec.abort(); } catch (e) {} askEl.hidden = true; resolve({ val, ...info }); };
        const isDone = () => done;
        $('.ep-ask h4').textContent = a.q; heard.textContent = ''; opts.innerHTML = ''; micState(micOk);
        $('.ep-timer').hidden = a.kind !== 'ideas';
        askEl.hidden = false;
        const btn = (label, val, main, info) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = 'btn' + (main ? ' primary' : ''); b.onclick = () => end(val, typeof info === 'function' ? info() : info || { answer: label, via: 'button' }); opts.append(b); return b; };
        const input = (ph, onEnter) => { const i = document.createElement('input'); i.placeholder = ph; i.maxLength = 60; i.onkeydown = (e) => { if (e.key === 'Enter' && i.value.trim()) { onEnter(i.value.trim()); i.value = ''; } }; opts.append(i); return i; };
        const onText = (t) => (heard.textContent = t + '…');

        if (a.kind === 'choice' || a.kind === 'any') {
          a.opts.forEach(([val, label]) => btn(label, val, true));
          const pick = (txt) => { const t = txt.toLowerCase(); heard.textContent = '«' + txt + '»';
            const o = a.opts.find(([, , w]) => has(t, ...w)) || (a.kind === 'any' ? a.opts[0] : null);
            if (o) setTimeout(() => end(o[0], { answer: o[1], via: 'voice', heard: txt }), 500); };
          loopListen(isDone, { onText, onFinal: pick });
        } else if (a.kind === 'name' || a.kind === 'free') {
          const save = (txt, via) => {
            const v = a.kind === 'name' ? cap(txt.replace(/^(меня зовут|я|зовут)\s+/i, '').split(/\s+/).slice(0, 2).join(' ')) : cap(txt);
            if (a.kind === 'name') { S.name = v.slice(0, 24); slot.name.textContent = S.name; }
            else { S[a.save] = v.slice(0, 80); slot.problem.textContent = S[a.save]; }
            heard.textContent = '«' + v + '»'; setTimeout(() => end(v, { answer: v, via, heard: via === 'voice' ? txt : null }), 700);
          };
          input(a.input, (t) => save(t, 'text')); btn('Пропустить', '', false, { answer: '', via: 'skip' });
          loopListen(isDone, { onText, onFinal: (t) => t && save(t, 'voice') });
        } else if (a.kind === 'ideas') {
          slot.ideas.innerHTML = ''; S.ideas = []; slot.ideas.classList.add('on');
          const vias = new Set(), said = [];
          const add = (txt, via) => txt.split(/\s*(?:,|\bи ещё\b|\bещё\b|\bили\b)\s*/i).map((s) => s.trim()).filter((s) => s.length > 2).forEach((s) => {
            if (S.ideas.length >= 12) return;
            S.ideas.push(cap(s)); vias.add(via); const d = document.createElement('div'); d.className = 'ep-idea'; d.textContent = cap(s).slice(0, 60); slot.ideas.append(d);
          });
          const result = () => ({ answer: S.ideas.join('; '), via: vias.size > 1 ? 'mixed' : [...vias][0] || 'timeout', heard: said.length ? said.join(' | ') : null });
          input(a.input, (t) => add(t, 'text')); btn('Готово', 'done', true, result);
          const t0 = clock(), bar = $('.ep-timer b');
          timer = setInterval(() => { if (paused) return; const p = 1 - (clock() - t0) / (a.secs * 1000); bar.style.width = Math.max(0, p * 100) + '%'; if (p <= 0) end('done', result()); }, 100);
          loopListen(isDone, { continuous: true, onText, onFinal: (t) => { heard.textContent = ''; if (t) { said.push(t); add(t, 'voice'); } } });
        }
      });
    }

    // ---------- Финал, кнопки, пауза ----------
    function finish() {
      overlays([]);
      $('.ep-end-title').textContent = S.name ? `До встречи, ${S.name}!` : 'До встречи в клубе!';
      $('.ep-end').hidden = false;
    }
    function restart() {
      $('.ep-end').hidden = true; S.name = ''; S.problem = ''; S.ideas = []; run = newRun();
      for (const k in slot) slot[k].innerHTML = '';
      play(E.start);
    }
    function pause() {
      if (paused) return; paused = true; pausedAt = Date.now();
      if (onScreen && !onScreen.paused) onScreen.pause();
      try { rec && rec.abort(); } catch (e) {}
    }
    function resume() {
      if (!paused) return; paused = false; pausedTotal += Date.now() - pausedAt;
      if (onScreen && $('.ep-end').hidden) playOrTap(onScreen);
      resumeQ.splice(0).forEach((f) => f());
    }
    wrap.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'fs') toggleFs();
      else if (a === 'again') restart();
      else if (a === 'meet') { pause(); exitFs(); onMeet(); }
    });

    // ---------- Старт: временные ссылки на все ролики серии, затем первый узел ----------
    (async () => {
      const names = Object.keys(G).flatMap((n) => (G[n].ask ? [n, n + '-wait'] : [n]));
      const { data, error } = await sb.storage.from('episodes').createSignedUrls(names.map((n) => `${id}/${n}.mp4`), 4 * 3600);
      if (dead) return;
      if (error || !data) { $('.ep-load').textContent = 'Не удалось загрузить серию. Обновите страницу и попробуйте ещё раз.'; return; }
      data.forEach((d, i) => { if (d.signedUrl) urls[names[i]] = d.signedUrl; });
      $('.ep-load').remove();
      play(E.start);
    })();

    return {
      pause, resume,
      destroy() { dead = true; pause(); exitFs(); Object.values(vids).forEach((v) => { v.removeAttribute('src'); v.load(); }); root.replaceChildren(); },
    };
  }

  window.Episode = { mount, titles: Object.fromEntries(Object.entries(EPISODES).map(([k, v]) => [k, v.title])) };
})();
