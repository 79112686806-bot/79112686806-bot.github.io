// Герой-инженер ученика (как в RPG): шесть характеристик с уровнями, анкета родителя, анимации начислений, оценка преподавателя.
// Данные — таблицы hero и hero_events (миграция 20261026000027_hero.sql). Начисляет только сервер: триггеры на ответы в серии,
// сдачу и подтверждение тем, исследования, чат; стартовые очки — hero_onboard по анкете; оценка — hero_grade (админ).
// Hero.mountCabinet(el, { sb, userId, name }) — карточка героя в кабинете (или приглашение заполнить анкету) и показ новых очков.
// Hero.pop(el, deltas) — всплывающие «+10 Фантазия» поверх элемента (плеер серии).
// Hero.adminCard(el, { sb, userId }) — админка: уровни, анкета, история, оценка преподавателя.
// Hero.gradeHtml(id) / Hero.gradeRead(id) — строка «+/−» по характеристикам (например, при подтверждении темы).
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // ключ, название, чем растёт, цвет, значок
  const STATS = [
    ['obs', 'Наблюдательность', 'замечает проблемы', '#2f6f8f', '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'],
    ['cur', 'Любопытство', 'задаёт вопросы', '#7a4fa3', '<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.2-1.5 2.2"/><path d="M12 17.3h.01"/>'],
    ['fan', 'Фантазия', 'придумывает идеи', '#c47f12', '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.9.7 1.6 1.7 1.6 2.8V17h4v-.4c0-1.1.7-2.1 1.6-2.8A6 6 0 0 0 12 3z"/>'],
    ['craft', 'Мастерство', 'собирает и делает', '#9a3a1b', '<path d="M14.7 6.3a4 4 0 0 0 4.9 5.3l-8.8 8.8a2.2 2.2 0 0 1-3.1-3.1l8.8-8.8a4 4 0 0 1 5.3-4.9l-2.6 2.6.4 2.3 2.3.4"/>'],
    ['res', 'Исследование', 'проверяет опытом', '#3f7d4a', '<path d="M9 3h6M10 3v6.2l-5.2 8.9A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.9L14 9.2V3"/><path d="M7.4 15h9.2"/>'],
    ['grit', 'Упорство', 'не сдаётся', '#6b4a2b', '<path d="M3 20.5l6.5-12 4 6.5 2.5-3.5 5 9z"/><path d="M9.5 8.5V3.5l4 1.6-4 1.6"/>'],
  ];
  const S = Object.fromEntries(STATS.map(([k, name, what, color, icon]) => [k, { k, name, what, color, icon }]));
  const KEYS = STATS.map((s) => s[0]);
  // уровни характеристики: очки, с которых начинается уровень 1…10
  const T = [0, 50, 150, 300, 500, 750, 1050, 1400, 1800, 2250];
  function level(x) {
    x = Math.max(0, x | 0); let lv = 1; while (lv < T.length && x >= T[lv]) lv++;
    const from = T[lv - 1], to = T[lv];
    return { lv, pct: to ? Math.round(((x - from) * 100) / (to - from)) : 100, left: to ? to - x : 0, max: !to };
  }
  const total = (h) => KEYS.reduce((s, k) => s + (h ? h[k] | 0 : 0), 0);
  const heroLevel = (t) => 1 + Math.floor(Math.sqrt(Math.max(0, t) / 40));
  const heroPct = (t) => { const l = heroLevel(t), a = 40 * (l - 1) ** 2, b = 40 * l ** 2; return Math.round(((t - a) * 100) / (b - a)); };
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
  const sign = (v) => (v > 0 ? '+' + v : '−' + Math.abs(v));

  // ---------- Звук: короткий «дзынь» (без файлов) ----------
  let ac = null;
  function ding(good = true) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const notes = good ? [784, 1175] : [330, 262], t0 = ac.currentTime;
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.09); g.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.35);
        o.connect(g).connect(ac.destination); o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.4);
      });
    } catch (e) {}
  }

  // ---------- Стили ----------
  const CSS = `
.hero-card{display:grid!important;grid-template-columns:minmax(180px,230px) 1fr;gap:22px;align-items:center;margin:0 0 22px;padding:22px 24px!important;color:var(--ink,#3a2313);font-family:"PT Serif",Georgia,serif;animation:heroIn .5s cubic-bezier(.2,.8,.2,1)}
.hero-me{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px}
.hero-badge{position:relative;width:112px;height:112px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff7df,#ecd39a);box-shadow:0 0 0 5px rgba(242,228,196,.7),0 10px 22px rgba(70,35,10,.22);color:var(--sanguine,#9a3a1b)}
.hero-badge svg.ring{position:absolute;inset:-7px;width:126px;height:126px;transform:rotate(-90deg)}
.hero-badge b{font:700 40px/1 "Cormorant Garamond",Georgia,serif;color:var(--ink,#3a2313)}
.hero-badge small{position:absolute;bottom:18px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft,#6e4b2c)}
.hero-me strong{font:700 22px/1.15 "Cormorant Garamond",Georgia,serif}
.hero-me span{font-size:13.5px;color:var(--ink-soft,#6e4b2c)}
.hero-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}
.hero-stat{display:grid;grid-template-columns:30px 1fr auto;grid-template-rows:auto auto;column-gap:10px;align-items:center}
.hero-stat .ic{grid-row:1/3;width:30px;height:30px;display:grid;place-items:center;border-radius:50%;color:#fff;background:var(--c)}
.hero-stat .ic svg{width:17px;height:17px}
.hero-stat b{font-size:14.5px}.hero-stat em{font-style:normal;font-size:13px;color:var(--ink-soft,#6e4b2c);white-space:nowrap}
.hero-bar{grid-column:2/4;height:7px;border-radius:2px;background:rgba(74,44,20,.14);overflow:hidden}
.hero-bar i{display:block;height:100%;width:var(--p);background:var(--c);transition:width 1.1s cubic-bezier(.2,.8,.2,1)}
.hero-foot{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border-top:1px dashed rgba(74,44,20,.25);padding-top:12px;font-size:14px;color:var(--ink-soft,#6e4b2c)}
.hero-invite{display:flex!important;flex-direction:row!important;flex-wrap:wrap;gap:18px;align-items:center;margin:0 0 22px;padding:20px 24px!important;background:linear-gradient(135deg,#fff3cf,#f4dc9a)!important;border-color:#b8892b!important}
.hero-invite p{margin:4px 0 0;font-size:15px}.hero-invite strong{font:700 23px/1.15 "Cormorant Garamond",Georgia,serif}
.hero-invite>div{flex:1;min-width:220px}
@keyframes heroIn{from{opacity:0;transform:translateY(8px)}}
@media(max-width:700px){.hero-card{grid-template-columns:1fr;gap:16px}.hero-stats{grid-template-columns:1fr}}
/* окно поверх страницы: анкета, новые очки, история */
.hero-ov{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(30,15,5,.6);animation:heroFade .25s}
.hero-box{position:relative;width:min(560px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:26px 26px 22px;border-radius:6px;background:var(--parchment,#f2e4c4);color:var(--ink,#3a2313);font-family:"PT Serif",Georgia,serif;box-shadow:0 24px 60px rgba(0,0,0,.45);border-top:4px solid var(--sanguine,#9a3a1b);animation:heroPop .35s cubic-bezier(.2,.9,.3,1.25)}
.hero-box h3{margin:0 0 6px;font:700 28px/1.12 "Cormorant Garamond",Georgia,serif}
.hero-box p{margin:6px 0}
.hero-x{position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;background:none;font-size:22px;color:var(--ink-soft,#6e4b2c);cursor:pointer}
.hero-prog{height:10px;margin:0 36px 18px 0;border-radius:6px;background:rgba(74,44,20,.15);overflow:hidden}
.hero-prog i{display:block;height:100%;width:var(--p);background:linear-gradient(90deg,#c9a227,var(--sanguine,#9a3a1b));transition:width .4s}
.hero-opts{display:grid;gap:8px;margin:14px 0}
.hero-opts.cols{grid-template-columns:repeat(3,1fr)}
.hero-opt{display:flex;gap:10px;align-items:center;width:100%;padding:12px 14px;border:1.5px solid rgba(74,44,20,.3);border-bottom-width:3px;border-radius:4px;background:rgba(255,250,236,.85);color:inherit;font:inherit;font-size:15.5px;text-align:left;cursor:pointer;transition:transform .12s,border-color .12s,background .12s}
.hero-opts.cols .hero-opt{justify-content:center;font-weight:700;font-size:18px}
.hero-opt:hover{border-color:var(--sanguine,#9a3a1b)}.hero-opt:active{transform:translateY(2px)}
.hero-opt.on{border-color:var(--sanguine,#9a3a1b);background:#fde7d2;font-weight:700}
.hero-opt.on::after{content:"✓";margin-left:auto;color:var(--sanguine,#9a3a1b)}
.hero-box textarea{width:100%;min-height:70px;font:inherit;font-size:15px;padding:9px 11px;border:1.5px solid rgba(74,44,20,.3);border-radius:4px;background:rgba(255,250,236,.85);color:inherit}
.hero-btns{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-top:14px}
.hero-b{border:1px solid var(--sanguine,#9a3a1b);border-radius:4px;padding:11px 20px;font:700 15.5px "PT Serif",Georgia,serif;cursor:pointer;background:transparent;color:var(--sanguine,#9a3a1b)}
.hero-b.main{background:var(--sanguine,#9a3a1b);color:#fff6e6}.hero-b:disabled{opacity:.45;cursor:default}
.hero-hint{font-size:13.5px;color:var(--ink-soft,#6e4b2c)}
.hero-gain{display:grid;gap:12px;margin:16px 0 6px}
.hero-gain .hero-stat em.up{color:#3f7d4a;font-weight:700}.hero-gain .hero-stat em.down{color:var(--sanguine,#9a3a1b);font-weight:700}
.hero-big{font:700 46px/1 "Cormorant Garamond",Georgia,serif;color:var(--sanguine,#9a3a1b);text-align:center;margin:6px 0 2px;animation:heroPop .5s cubic-bezier(.2,.9,.3,1.5)}
.hero-lvup{margin:12px 0 0;padding:10px 14px;border-radius:4px;background:linear-gradient(135deg,#fff3cf,#f4dc9a);border:1.5px solid #b8892b;font-weight:700;text-align:center;animation:heroPop .5s cubic-bezier(.2,.9,.3,1.5) .9s backwards}
.hero-note{margin:10px 0 0;padding:10px 14px;border-left:4px solid var(--sanguine,#9a3a1b);background:rgba(255,250,236,.8);font-size:15px}
.hero-hist{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}
.hero-hist li{padding:8px 0;border-bottom:1px dashed rgba(74,44,20,.22);font-size:14.5px}
.hero-hist small{display:block;color:var(--ink-soft,#6e4b2c)}
.hero-chip{display:inline-flex;gap:4px;align-items:center;margin:4px 6px 0 0;padding:2px 8px;border-radius:12px;font-size:13px;font-weight:700;color:#fff;background:var(--c)}
.hero-chip.down{background:#8a8076}
.hero-bits{position:absolute;left:50%;top:30%;pointer-events:none}
.hero-bits i{position:absolute;width:8px;height:12px;border-radius:2px;opacity:0;animation:heroBit 1.8s cubic-bezier(.2,.7,.4,1) var(--d) forwards}
@keyframes heroBit{0%{opacity:1;transform:translate(0,0)}35%{opacity:1;transform:translate(calc(var(--x) * 200px),-90px) rotate(calc(var(--r) / 2))}100%{opacity:0;transform:translate(calc(var(--x) * 260px),120px) rotate(var(--r))}}
@keyframes heroFade{from{opacity:0}}
@keyframes heroPop{from{opacity:0;transform:scale(.9)}}
/* всплывающие очки (плеер серии) */
.hero-pops{position:absolute;top:4%;right:3%;z-index:5;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none}
.hero-pop{display:flex;gap:6px;align-items:center;padding:6px 12px 6px 6px;border-radius:20px;background:var(--c);color:#fff;font:700 15px "PT Serif",Georgia,serif;box-shadow:0 6px 16px rgba(0,0,0,.3);animation:heroFly 2.6s cubic-bezier(.2,.8,.2,1) forwards}
.hero-pop.down{background:#7d746b}
.hero-pop span{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.25)}
.hero-pop svg{width:15px;height:15px}
@keyframes heroFly{0%{opacity:0;transform:translateY(14px) scale(.8)}12%{opacity:1;transform:none}75%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-18px)}}
/* оценка преподавателя (админка) */
.hero-grade{display:grid;gap:6px;margin:8px 0}
.hero-grade .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.hero-grade .row>span{min-width:150px;font-size:14px}
.hero-grade button{min-width:38px;padding:4px 8px;border:1px solid rgba(74,44,20,.3);border-radius:4px;background:#fffaf0;cursor:pointer;font:inherit;font-size:13.5px}
.hero-grade button.on{background:var(--c);border-color:var(--c);color:#fff;font-weight:700}
@media(prefers-reduced-motion:reduce){.hero-card,.hero-box,.hero-big,.hero-lvup,.hero-bits i,.hero-pop{animation:none}.hero-bar i{transition:none}}
`;
  function style() { if (document.getElementById('hero-css')) return; const s = document.createElement('style'); s.id = 'hero-css'; s.textContent = CSS; document.head.append(s); }

  const statRow = (k, x, extra = '', p) => {
    const s = S[k], l = level(x);
    return `<div class="hero-stat" style="--c:${s.color}"><span class="ic">${svg(s.icon)}</span><b>${s.name}</b><em${extra ? ` class="${extra.cls}"` : ''}>${extra ? extra.text : 'ур. ' + l.lv}</em>`
      + `<span class="hero-bar" title="${l.max ? 'максимальный уровень' : 'до следующего уровня — ' + l.left + ' ' + plural(l.left, 'очко', 'очка', 'очков')}"><i style="--p:${p ?? l.pct}%"></i></span></div>`;
  };
  const ring = (pct) => `<svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="none" stroke="rgba(74,44,20,.15)" stroke-width="6"/><circle cx="60" cy="60" r="56" fill="none" stroke="#c9a227" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(351.9 * pct) / 100} 352"/></svg>`;
  const bits = () => Array.from({ length: 26 }, (_, i) => `<i style="--x:${(Math.random() * 2 - 1).toFixed(2)};--r:${Math.round(Math.random() * 720 - 360)}deg;--d:${(Math.random() * 0.25).toFixed(2)}s;background:${STATS[i % 6][3]}"></i>`).join('');
  function overlay(html, onClose) {
    style();
    const ov = document.createElement('div'); ov.className = 'hero-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = `<div class="hero-box">${html}</div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); onClose && onClose(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.body.append(ov);
    return { ov, box: ov.firstChild, close };
  }

  // ---------- Анкета родителя: по вопросу на экран ----------
  const Q = [
    { k: 'age', q: 'Сколько лет ребёнку?', cols: true, opts: [9, 10, 11, 12, 13, 14].map((n) => [n, String(n)]) },
    { k: 'likes', q: 'Что ребёнок любит больше всего?', hint: 'Можно выбрать до трёх.', multi: 3, opts: [
      ['build', 'Строить, мастерить, собирать конструктор'], ['draw', 'Рисовать, придумывать истории'], ['parts', 'Разбирать вещи — узнать, как они устроены'],
      ['experiment', 'Ставить опыты, что-то измерять'], ['notice', 'Замечать мелочи, собирать коллекции'], ['games', 'Играть в игры, программировать']] },
    { k: 'fail', q: 'Когда что-то не получается, ребёнок обычно…', opts: [['quit', 'Бросает и берётся за другое'], ['help', 'Просит помощи'], ['retry', 'Пробует снова сам']] },
    { k: 'why', q: 'Как часто он спрашивает «почему?» и «как это работает?»', opts: [['rare', 'Редко'], ['some', 'Иногда'], ['often', 'Постоянно']] },
    { k: 'focus', q: 'Сколько времени может увлечённо заниматься одним делом?', opts: [['short', 'До 15 минут'], ['mid', '15–40 минут'], ['long', 'Больше часа']] },
    { k: 'team', q: 'Как ему удобнее работать?', opts: [['alone', 'Одному'], ['team', 'С кем-то вместе'], ['both', 'По-разному']] },
    { k: 'goals', q: 'Что хотите развить в первую очередь?', hint: 'Можно выбрать до двух. Это увидит преподаватель.', multi: 2, note: true, opts: [
      ['confidence', 'Уверенность в себе'], ['focus', 'Усидчивость'], ['ideas', 'Фантазию и изобретательность'], ['logic', 'Логику и умение проверять'],
      ['tech', 'Интерес к технике'], ['finish', 'Умение доводить дело до конца']] },
  ];
  const LABEL = Object.fromEntries(Q.map((q) => [q.k, Object.fromEntries(q.opts.map(([v, t]) => [v, t]))]));

  function onboard({ sb, name, onDone }) {
    const A = { likes: [], goals: [], note: '' }; let i = 0;
    const o = overlay('');
    const draw = () => {
      const q = Q[i], cur = A[q.k];
      o.box.innerHTML = `<button class="hero-x" aria-label="Закрыть">×</button><div class="hero-prog"><i style="--p:${Math.round((i * 100) / Q.length)}%"></i></div>`
        + `${i === 0 ? `<p class="hero-hint">Вопросы для родителя · ${Q.length} вопросов, около двух минут. По ответам мы выставим ${name ? esc(name) : 'ребёнку'} стартовые уровни героя.</p>` : ''}`
        + `<h3>${q.q}</h3>${q.hint ? `<p class="hero-hint">${q.hint}</p>` : ''}`
        + `<div class="hero-opts${q.cols ? ' cols' : ''}">${q.opts.map(([v, t]) => `<button type="button" class="hero-opt${(q.multi ? cur.includes(v) : cur === v) ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}</div>`
        + (q.note ? `<label class="hero-hint" for="heroNote">Что ещё важно знать преподавателю? (необязательно)</label><textarea id="heroNote" maxlength="600">${esc(A.note)}</textarea>` : '')
        + `<div class="hero-btns"><button type="button" class="hero-b" data-a="back"${i ? '' : ' hidden'}>← Назад</button>`
        + `${q.multi ? `<button type="button" class="hero-b main" data-a="next"${cur.length ? '' : ' disabled'}>${i === Q.length - 1 ? 'Создать героя' : 'Дальше →'}</button>` : ''}</div><p class="hero-err hero-hint" role="alert"></p>`;
      o.box.querySelector('.hero-x').onclick = o.close;
      o.box.querySelectorAll('.hero-opt').forEach((b) => (b.onclick = () => {
        const v = q.cols ? +b.dataset.v : b.dataset.v;
        if (q.multi) { const at = cur.indexOf(v); if (at >= 0) cur.splice(at, 1); else { if (cur.length >= q.multi) cur.shift(); cur.push(v); } draw(); }
        else { A[q.k] = v; b.classList.add('on'); setTimeout(() => { i++; draw(); }, 220); }
      }));
      const back = o.box.querySelector('[data-a=back]'); if (back) back.onclick = () => { if (q.note) A.note = o.box.querySelector('textarea').value; i--; draw(); };
      const next = o.box.querySelector('[data-a=next]');
      if (next) next.onclick = async () => {
        if (q.note) A.note = o.box.querySelector('textarea').value.trim();
        if (i < Q.length - 1) { i++; return draw(); }
        next.disabled = true; next.textContent = 'Создаём героя…';
        const { data, error } = await sb.rpc('hero_onboard', { p: A });
        if (error) { next.disabled = false; next.textContent = 'Создать героя'; o.box.querySelector('.hero-err').textContent = /уже/.test(error.message) ? 'Анкета уже заполнена.' : 'Не получилось сохранить. Проверьте связь и попробуйте ещё раз.'; return; }
        reveal(o, data, name, onDone);
      };
    };
    draw();
  }
  // «Герой создан!» — характеристики заполняются по очереди
  function reveal(o, s, name, onDone) {
    const t = total(s);
    o.box.innerHTML = `<span class="hero-bits" aria-hidden="true">${bits()}</span><h3>Герой-инженер создан!</h3>`
      + `<p>${name ? esc(name) + ', вот' : 'Вот'} твои стартовые характеристики. Они будут расти от серий, заданий, исследований и оценок преподавателя.</p>`
      + `<div class="hero-gain">${KEYS.map((k) => statRow(k, s[k], null, 0)).join('')}</div>`
      + `<p class="hero-big">Уровень ${heroLevel(t)}</p><div class="hero-btns"><span></span><button type="button" class="hero-b main">В путь! →</button></div>`;
    ding(true);
    requestAnimationFrame(() => setTimeout(() => o.box.querySelectorAll('.hero-bar i').forEach((b, n) => { b.style.transitionDelay = n * 0.12 + 's'; b.style.setProperty('--p', level(s[KEYS[n]]).pct + '%'); }), 60));
    o.box.querySelector('.hero-b.main').onclick = () => { o.close(); onDone && onDone(); };
  }

  // ---------- Новые очки: что прибавилось с прошлого раза ----------
  function celebrate({ sb, hero, events, name }) {
    const sum = {}; events.forEach((e) => { for (const [k, v] of Object.entries(e.deltas || {})) sum[k] = (sum[k] || 0) + v; });
    const gears = events.reduce((s, e) => s + (e.gears | 0), 0);
    const keys = KEYS.filter((k) => sum[k]);
    if (!keys.length) {
      if (!gears) { sb.rpc('hero_seen'); return; }
      const notes = events.filter((e) => e.gears && e.note).map((e) => e.note);
      const g = overlay(`<span class="hero-bits" aria-hidden="true">${bits()}</span><button class="hero-x" aria-label="Закрыть">×</button><h3>${esc(notes[0] || 'Награда!')}</h3>`
        + `<p class="hero-big">+${gears} ${plural(gears, 'шестерёнка', 'шестерёнки', 'шестерёнок')}</p>`
        + `<p class="hero-hint" style="text-align:center">Потрать их в своём городе или в Лавке мастера.</p>`
        + `<div class="hero-btns"><span></span><button type="button" class="hero-b main">Ура!</button></div>`, () => sb.rpc('hero_seen'));
      g.box.querySelector('.hero-x').onclick = g.close; g.box.querySelector('.hero-b.main').onclick = g.close; ding(true);
      return;
    }
    const after = hero, before = Object.fromEntries(KEYS.map((k) => [k, Math.max(0, (after[k] | 0) - (sum[k] || 0))]));
    const xp = keys.reduce((s, k) => s + sum[k], 0);
    const ups = keys.filter((k) => level(after[k]).lv > level(before[k]).lv);
    const notes = events.filter((e) => e.source === 'teacher' && e.note);
    const teacher = events.some((e) => e.source === 'teacher');
    const o = overlay(`${xp > 0 ? `<span class="hero-bits" aria-hidden="true">${bits()}</span>` : ''}<button class="hero-x" aria-label="Закрыть">×</button>`
      + `<h3>${teacher ? 'Преподаватель оценил твою работу' : xp >= 0 ? 'Новые очки героя!' : 'Очки героя изменились'}</h3>`
      + `<p class="hero-big">${xp >= 0 ? '+' + xp : '−' + Math.abs(xp)} ${plural(xp, 'очко', 'очка', 'очков')}</p>`
      + `<div class="hero-gain">${keys.map((k) => statRow(k, after[k], { cls: sum[k] > 0 ? 'up' : 'down', text: sign(sum[k]) }, level(before[k]).lv < level(after[k]).lv ? 0 : level(before[k]).pct)).join('')}</div>`
      + notes.map((e) => `<div class="hero-note">💬 ${esc(e.note)}</div>`).join('')
      + (ups.length ? `<div class="hero-lvup">🎉 Новый уровень: ${ups.map((k) => `${S[k].name} — ${level(after[k]).lv}`).join(', ')}!</div>` : '')
      + (xp < 0 ? '<p class="hero-hint">Шутить — весело, но очки дают за настоящие ответы. В следующий раз получится!</p>' : '')
      + `<div class="hero-btns"><span></span><button type="button" class="hero-b main">${xp >= 0 ? 'Круто!' : 'Понятно'}</button></div>`, () => sb.rpc('hero_seen'));
    o.box.querySelector('.hero-x').onclick = o.close; o.box.querySelector('.hero-b.main').onclick = o.close;
    ding(xp >= 0);
    setTimeout(() => o.box.querySelectorAll('.hero-gain .hero-bar i').forEach((b, n) => { b.style.transitionDelay = n * 0.15 + 's'; b.style.setProperty('--p', level(after[keys[n]]).pct + '%'); }), 350);
  }

  // ---------- История начислений ----------
  const SRC = { onboarding: 'Анкета', episode: 'Мультфильм', lesson: 'Тема', research: 'Исследование', chat: 'Чат темы', teacher: 'Оценка преподавателя', bonus: 'Бонус', quiz: 'Мини-задание', streak: 'Серия дней', chest: 'Сундук' };
  const chips = (d) => Object.entries(d || {}).map(([k, v]) => S[k] ? `<span class="hero-chip${v < 0 ? ' down' : ''}" style="--c:${S[k].color}">${sign(v)} ${S[k].name}</span>` : '').join('');
  const histHtml = (ev) => ev.length ? `<ul class="hero-hist">${ev.map((e) => `<li><b>${SRC[e.source] || ''}</b>${e.note ? ' · ' + esc(e.note) : ''}<small>${new Date(e.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small>${chips(e.deltas)}${e.gears ? `<span class="hero-chip" style="--c:${e.gears > 0 ? '#8a6d1f' : '#a65435'}">${e.gears > 0 ? '+' : '−'}${Math.abs(e.gears)} ⚙</span>` : ''}</li>`).join('')}</ul>` : '<p class="hero-hint">Пока пусто.</p>';
  async function details({ sb, userId, hero }) {
    const o = overlay('<p class="hero-hint">Загрузка…</p>');
    let { data, error } = await sb.from('hero_events').select('source,deltas,gears,note,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(40);
    if (error) ({ data } = await sb.from('hero_events').select('source,deltas,note,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(40));
    o.box.innerHTML = `<button class="hero-x" aria-label="Закрыть">×</button><h3>Мой герой-инженер</h3><p class="hero-hint">Характеристики растут от серий, заданий, исследований и вопросов. Преподаватель тоже ставит оценки — плюсы, а иногда и минусы.</p>`
      + `<div class="hero-gain">${KEYS.map((k) => statRow(k, hero[k], { text: `ур. ${level(hero[k]).lv} · ${hero[k] | 0}` })).join('')}</div>`
      + `<p class="hero-hint" style="margin-top:14px"><b>Как растут характеристики:</b> ${[['obs', 'замечаешь проблемы в сериях'], ['cur', 'задаёшь вопросы'], ['fan', 'придумываешь идеи'], ['craft', 'сдаёшь задания'], ['res', 'заполняешь исследования'], ['grit', 'исправляешь и доводишь до конца']].map(([k, t]) => `<span style="color:${S[k].color};vertical-align:-3px">${svg(S[k].icon, 15)}</span> ${t}`).join(' · ')}.</p>`
      + `<h3 style="font-size:22px;margin-top:16px">История</h3>${histHtml(data || [])}`;
    o.box.querySelector('.hero-x').onclick = o.close;
  }

  // ---------- Кабинет ----------
  async function mountCabinet(el, { sb, userId, name }) {
    style();
    const { data: hero, error } = await sb.from('hero').select('*').eq('user_id', userId).maybeSingle();
    if (error) { el.innerHTML = ''; return; }   // нет таблицы или связи — кабинет работает и без героя
    if (!hero || !hero.onboarded_at) {
      el.innerHTML = `<div class="feature hero-invite"><span class="fact-icon" aria-hidden="true">${svg(S.craft.icon)}</span><div><strong>Создайте героя-инженера</strong>`
        + `<p>Для родителя: ${Q.length} коротких вопросов о ребёнке — по ним мы выставим стартовые уровни. Дальше герой растёт от занятий, серий и оценок преподавателя.</p></div>`
        + `<button type="button" class="btn primary">Заполнить анкету →</button></div>`;
      el.querySelector('button').onclick = () => onboard({ sb, name, onDone: () => mountCabinet(el, { sb, userId, name }) });
      return;
    }
    const t = total(hero), hl = heroLevel(t);
    el.innerHTML = `<div class="feature hero-card"><div class="hero-me"><div class="hero-badge">${ring(heroPct(t))}<b>${hl}</b><small>уровень</small></div>`
      + `<strong>${name ? esc(name) : 'Герой-инженер'}</strong><span>${t} ${plural(t, 'очко', 'очка', 'очков')} опыта</span></div>`
      + `<div class="hero-stats">${KEYS.map((k) => statRow(k, hero[k])).join('')}</div>`
      + `<div class="hero-foot"><span>Очки дают серии, задания, исследования и оценки преподавателя.</span><button type="button" class="btn">Мой герой →</button></div></div>`;
    el.querySelector('.hero-foot .btn').onclick = () => details({ sb, userId, hero });
    const { data: ev } = await sb.from('hero_events').select('source,deltas,gears,note,created_at').eq('user_id', userId).is('seen_at', null).neq('source', 'onboarding').order('created_at').limit(200);
    if (ev && ev.length) celebrate({ sb, hero, events: ev, name });
    else if (ev) sb.rpc('hero_seen');
  }

  // ---------- Всплывающие очки (плеер серии) ----------
  function pop(el, deltas) {
    const list = Object.entries(deltas || {}).filter(([k, v]) => S[k] && v);
    if (!el || !list.length) return;
    style();
    let box = el.querySelector(':scope > .hero-pops');
    if (!box) { box = document.createElement('div'); box.className = 'hero-pops'; el.append(box); }
    list.forEach(([k, v], i) => setTimeout(() => {
      const p = document.createElement('div'); p.className = 'hero-pop' + (v < 0 ? ' down' : ''); p.style.setProperty('--c', S[k].color);
      p.innerHTML = `<span>${svg(S[k].icon)}</span>${sign(v)} ${S[k].name}`;
      box.append(p); setTimeout(() => p.remove(), 2700);
    }, i * 250));
    ding(list.some(([, v]) => v > 0));
  }

  // ---------- Админка ----------
  const STEPS = [-2, -1, 0, 1, 2, 3];
  const gradeHtml = (id) => `<div class="hero-grade" id="${id}">${KEYS.map((k) => `<div class="row" style="--c:${S[k].color}"><span>${S[k].name}</span>`
    + STEPS.map((n) => `<button type="button" data-k="${k}" data-n="${n}" class="${n === 0 ? 'on' : ''}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this))">${n > 0 ? '+' + n : n < 0 ? '−' + -n : '0'}</button>`).join('') + '</div>').join('')}</div>`;
  // оценка: шаг — 10 очков характеристики
  function gradeRead(id) {
    const d = {}; document.querySelectorAll(`#${id} button.on`).forEach((b) => { const n = +b.dataset.n; if (n) d[b.dataset.k] = n * 10; });
    return d;
  }
  async function adminCard(el, { sb, userId }) {
    style();
    const [{ data: hero }, { data: ev }] = await Promise.all([
      sb.from('hero').select('*').eq('user_id', userId).maybeSingle(),
      sb.from('hero_events').select('source,deltas,gears,note,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(15)]);
    const h = hero || {}, t = total(h), a = h.onboarding || {};
    const ans = h.onboarded_at ? `<div class="small" style="margin:8px 0">${[
      a.age && 'возраст: ' + a.age, (a.likes || []).length && 'любит: ' + a.likes.map((v) => LABEL.likes[v]).join('; '),
      a.fail && 'когда не получается: ' + LABEL.fail[a.fail], a.why && '«почему?»: ' + LABEL.why[a.why], a.focus && 'увлечённо занимается: ' + LABEL.focus[a.focus],
      a.team && 'удобнее: ' + LABEL.team[a.team], (a.goals || []).length && 'родитель хочет развить: ' + a.goals.map((v) => LABEL.goals[v]).join('; '),
      a.note && 'важно: ' + esc(a.note)].filter(Boolean).map((s) => `<div>• ${s}</div>`).join('')}</div>` : '<p class="small muted">Родитель ещё не заполнил анкету — уровни начнутся с нуля.</p>';
    el.innerHTML = `<h2>Герой-инженер · уровень ${heroLevel(t)} <span class="muted small">(${t} очков)</span></h2><div class="card">`
      + `<div class="hero-stats" style="margin-bottom:10px">${KEYS.map((k) => statRow(k, h[k] | 0, { text: `ур. ${level(h[k]).lv} · ${h[k] | 0}` })).join('')}</div>${ans}`
      + `<details><summary><b>Оценить героя</b> — плюсы или минусы по характеристикам (шаг — 10 очков)</summary>${gradeHtml('heroGradeAll')}`
      + `<div class="row"><input id="heroGradeNote" placeholder="Что увидеть ученику (необязательно)" maxlength="500" style="flex:1;min-width:220px"><button class="primary" type="button" id="heroGradeGo">Начислить</button></div></details>`
      + `<details style="margin-top:8px" open><summary><b>Шестерёнки: ${h.gears | 0} ⚙</b> — добавить или списать</summary>`
      + `<div class="row" style="margin-top:8px;align-items:center"><button type="button" data-gd="-10">−10</button><button type="button" data-gd="-1">−1</button>`
      + `<input id="heroGearsN" type="number" step="1" value="10" style="width:90px;text-align:center" aria-label="Сколько шестерёнок"><button type="button" data-gd="1">+1</button><button type="button" data-gd="10">+10</button>`
      + `<input id="heroGearsNote" placeholder="Причина — её увидит ученик (необязательно)" maxlength="500" style="flex:1;min-width:200px">`
      + `<button class="primary" type="button" id="heroGearsAdd">Добавить</button><button type="button" id="heroGearsSub">Списать</button></div>`
      + `<p class="small muted" style="margin:6px 0 0">Число в поле — сколько добавить или списать. Ниже нуля не списывается. Подарок ученик увидит праздничным экраном.</p></details>`
      + `<details style="margin-top:8px"><summary>История начислений</summary>${histHtml(ev || [])}</details></div>`;
    const gn = el.querySelector('#heroGearsN');
    el.querySelectorAll('[data-gd]').forEach((b) => (b.onclick = () => { gn.value = Math.max(1, (parseInt(gn.value, 10) || 0) + +b.dataset.gd); }));
    const gearsGo = async (sign) => {
      const n = Math.abs(parseInt(gn.value, 10) || 0); if (!n) return alert('Укажите, сколько шестерёнок');
      if (sign < 0 && !confirm(`Списать ${n} ⚙ у ученика?`)) return;
      const { error } = await sb.rpc('admin_gears', { p_user: userId, p_delta: sign * n, p_note: el.querySelector('#heroGearsNote').value });
      if (error) return alert('Не получилось: ' + error.message);
      adminCard(el, { sb, userId });
    };
    el.querySelector('#heroGearsAdd').onclick = () => gearsGo(1);
    el.querySelector('#heroGearsSub').onclick = () => gearsGo(-1);
    el.querySelector('#heroGradeGo').onclick = async () => {
      const d = gradeRead('heroGradeAll'); if (!Object.keys(d).length) return alert('Выберите хотя бы одну характеристику');
      const { error } = await sb.rpc('hero_grade', { p_user: userId, p_deltas: d, p_note: el.querySelector('#heroGradeNote').value });
      if (error) return alert('Не получилось: ' + error.message);
      adminCard(el, { sb, userId });
    };
  }

  window.Hero = { STATS: S, KEYS, level, mountCabinet, pop, adminCard, gradeHtml, gradeRead, onboard, overlay, ding, bits, svg, plural, sign, esc, style };
})();
