// Награды в курсе: панель: серия дней 🔥, шестерёнки ⚙ и три задания дня с сундуком.
// Данные — rpc hero_status и hero_claim (миграция 20261026000028_hero_path.sql); награды решает сервер.
// Нужен hero.js (окна, звук, конфетти, характеристики).
// Path.bar(el, { sb, userId, onGears }) — панель (нажатие на шестерёнки — onGears, лавка); возвращает статус (или null, если миграции ещё нет).
// Сама карта курса — world.js (World.map); отсюда она берёт сундуки (Path.claim, Path.chestSvg, Path.cupSvg).
(function () {
  const H = () => window.Hero;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
  const ico = (d, s = 24, w = 1.8) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    flame: '<path d="M12 2.5c.8 3.6 5.5 5.3 5.5 10.7a5.5 5.5 0 0 1-11 0c0-2.4 1.1-4 2.3-5.1.1 2 1 3.2 2.2 3.4-.3-3.2-.6-6.2 1-9z" fill="currentColor" stroke="none"/><path d="M12 21c-1.8 0-3-1.3-3-3 0-1.6 1.2-2.6 2-3.6.3 1.3 1 1.8 1.7 1.9.4-.9.6-1.8.5-2.8 1.3 1.1 1.8 2.5 1.8 4 0 2-1.2 3.5-3 3.5z" fill="#ffe3a3" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="7" stroke-width="3.4" stroke-dasharray="2.6 2.9"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="3"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    cart: '<path d="M3 4h2.5l2.2 10.5h10l2-7.5H6.4"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    wait: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    star: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z" fill="currentColor"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor"/>',
  };
  // сундук: крышка (группа .lid) откидывается при открытии
  const chestSvg = (open) => `<svg viewBox="0 0 64 56" class="pm-chest-svg" aria-hidden="true">
    <ellipse cx="32" cy="52" rx="24" ry="3.5" fill="rgba(40,20,5,.25)"/>
    <rect x="8" y="24" width="48" height="26" rx="3" fill="#8a5a2b" stroke="#4a2c14" stroke-width="2"/>
    <rect x="8" y="24" width="48" height="6" fill="#6d4420"/>
    <path d="M18 24v26M46 24v26" stroke="#c9a227" stroke-width="4"/>
    <g class="lid" style="transform-origin:8px 24px;${open ? 'transform:rotate(-38deg)' : ''}">
      <path d="M8 24v-6a10 10 0 0 1 10-10h28a10 10 0 0 1 10 10v6z" fill="#a06a33" stroke="#4a2c14" stroke-width="2"/>
      <path d="M18 8.5V24M46 8.5V24" stroke="#c9a227" stroke-width="4"/>
    </g>
    <rect x="27.5" y="20" width="9" height="11" rx="2" fill="#e8c14a" stroke="#4a2c14" stroke-width="1.6"/>
    <circle cx="32" cy="25.5" r="1.6" fill="#4a2c14"/>
  </svg>`;
  const cupSvg = `<svg viewBox="0 0 64 64" class="pm-chest-svg" aria-hidden="true">
    <ellipse cx="32" cy="60" rx="18" ry="3" fill="rgba(40,20,5,.25)"/>
    <path d="M18 8h28v10c0 9-6 16-14 16s-14-7-14-16z" fill="#e0b53c" stroke="#6b4a12" stroke-width="2"/>
    <path d="M18 12H10c0 8 4 12 9 12M46 12h8c0 8-4 12-9 12" fill="none" stroke="#6b4a12" stroke-width="2.5"/>
    <path d="M28 34h8v10h-8z" fill="#c9a227" stroke="#6b4a12" stroke-width="2"/>
    <rect x="20" y="44" width="24" height="8" rx="1.5" fill="#8a5a2b" stroke="#4a2c14" stroke-width="2"/>
    <path d="M32 13l2 4.2 4.6.6-3.3 3.1.8 4.5-4.1-2.2-4.1 2.2.8-4.5-3.3-3.1 4.6-.6z" fill="#fff4cf"/>
  </svg>`;

  const CSS = `
/* панель: серия, шестерёнки, задания дня */
.pb{display:grid;grid-template-columns:auto auto 1fr;align-items:start;gap:12px;margin:0 0 22px;font-family:"PT Serif",Georgia,serif;color:var(--ink,#3a2313)}
.pb-chip{display:flex;align-items:center;gap:10px;padding:12px 16px;border:1.5px solid var(--line,rgba(74,44,20,.26));border-bottom-width:4px;border-radius:6px;background:rgba(255,248,230,.55);cursor:pointer;font:inherit;color:inherit;text-align:left}
.pb-chip:hover{border-color:var(--sanguine,#9a3a1b)}
.pb-chip u{text-decoration:none;font-weight:700;color:var(--sanguine,#9a3a1b)}
.pb-chip b{font:700 26px/1 "Cormorant Garamond",Georgia,serif}
.pb-chip small{display:block;font-size:12.5px;color:var(--ink-soft,#6e4b2c);line-height:1.25}
.pb-fire{color:#b7aa98}.pb-fire.on{color:#e0661b;animation:pbFlick 2.4s ease-in-out infinite}
.pb-gear{color:#8a6d1f}.pb-gear:hover svg{animation:pbSpin 2.4s linear infinite}
.pb-q{padding:12px 16px;border:1.5px solid var(--line,rgba(74,44,20,.26));border-bottom-width:4px;border-radius:6px;background:rgba(255,248,230,.55);display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center}
.pb-q h4{margin:0;font:700 19px/1.1 "Cormorant Garamond",Georgia,serif;display:flex;gap:6px;align-items:center}
.pb-q ul{grid-column:1;list-style:none;margin:0;padding:0;display:grid;gap:6px}
.pb-q li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:13.5px}
.pb-q li em{font-style:normal;color:var(--ink-soft,#6e4b2c);font-size:12.5px}
.pb-q li.ok{color:#3f7d4a}.pb-q li.ok em::before{content:"✓ "}
.pb-q .bar{grid-column:1/-1;height:7px;border-radius:4px;background:rgba(74,44,20,.14);overflow:hidden}
.pb-q .bar i{display:block;height:100%;width:var(--p);background:linear-gradient(90deg,#c9a227,#e0661b);transition:width .8s}
.pb-q li.ok .bar i{background:#3f7d4a}
.pb-box{grid-row:1/3;grid-column:2;width:74px;border:0;background:none;padding:0;cursor:default;display:grid;justify-items:center;gap:2px;font:inherit;font-size:11.5px;color:var(--ink-soft,#6e4b2c)}
.pb-box .pm-chest-svg{width:64px;height:56px}
.pb-box.lock .pm-chest-svg{filter:grayscale(.85) opacity(.55)}
.pb-box.ready{cursor:pointer;color:var(--sanguine,#9a3a1b);font-weight:700}.pb-box.ready .pm-chest-svg{animation:pmWiggle 1.6s ease-in-out infinite;filter:drop-shadow(0 0 8px rgba(232,180,60,.9))}
.pb-box.done .pm-chest-svg{opacity:.6}
@media(max-width:760px){.pb{grid-template-columns:1fr 1fr}.pb-q{grid-column:1/-1}.pb-chip{padding:10px 12px}.pb-chip b{font-size:23px}}
@keyframes pbFlick{0%,100%{transform:scale(1) rotate(0)}30%{transform:scale(1.07) rotate(-3deg)}60%{transform:scale(.97) rotate(2deg)}}
@keyframes pbSpin{to{transform:rotate(360deg)}}
/* анимации сундуков и станций (их использует и world.js) */
@keyframes pmPulse{from{transform:scale(.85);opacity:1}to{transform:scale(1.25);opacity:0}}
@keyframes pmBob{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-5px)}}
@keyframes pmWiggle{0%,60%,100%{transform:rotate(0)}70%{transform:rotate(-6deg)}80%{transform:rotate(6deg)}90%{transform:rotate(-3deg)}}
/* открытие сундука, серия дней */
.pm-open{display:grid;justify-items:center;text-align:center}
.pm-open .pm-chest-svg{width:150px;height:130px;animation:pmShake .5s ease-in-out 2}
.pm-open .lid{transition:transform .5s cubic-bezier(.3,1.6,.5,1) 1s}
.pm-open.go .lid{transform:rotate(-38deg)}
.pm-gears{position:relative;height:0;width:0}
.pm-gears i{position:absolute;left:-12px;top:-120px;width:24px;height:24px;color:#c9a227;opacity:0;animation:pmFly 1.3s cubic-bezier(.2,.7,.3,1) forwards;animation-delay:calc(1.1s + var(--d))}
.pm-gears i svg{width:24px;height:24px}
.pm-prize{opacity:0;animation:pmIn .5s cubic-bezier(.2,.9,.3,1.5) 1.5s forwards}
@keyframes pmIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
@keyframes pmShake{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
@keyframes pmFly{0%{opacity:1;transform:translate(0,30px) scale(.4)}60%{opacity:1;transform:translate(calc(var(--x) * 140px),calc(var(--y) * -90px)) scale(1) rotate(200deg)}100%{opacity:0;transform:translate(calc(var(--x) * 170px),calc(var(--y) * -40px)) rotate(320deg)}}
.pm-fire{display:grid;justify-items:center;text-align:center}
.pm-fire .big{color:#e0661b;animation:heroPop .6s cubic-bezier(.2,.9,.3,1.6)}
.pm-fire .big svg{width:120px;height:120px;animation:pbFlick 1.6s ease-in-out infinite .6s}
.pm-fire .num{font:700 64px/1 "Cormorant Garamond",Georgia,serif;color:#c4501a;margin:-6px 0 2px}
.pm-week{display:flex;gap:8px;justify-content:center;margin:14px 0 4px}
.pm-week span{display:grid;justify-items:center;gap:4px;font-size:12px;color:var(--ink-soft,#6e4b2c)}
.pm-week i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(74,44,20,.13);color:#fff}
.pm-week i.on{background:#e0661b;animation:heroPop .4s cubic-bezier(.2,.9,.3,1.6) backwards;animation-delay:var(--d)}
.pm-week i svg{width:16px;height:16px}
@media(prefers-reduced-motion:reduce){.pm-prize{animation:none;opacity:1}.pb-fire.on,.pb-gear svg,.pm-tag,.pm-st.current .pm-node::before,.pm-chest.ready .pm-chest-svg,.pb-box.ready .pm-chest-svg,.pm-open .pm-chest-svg,.pm-fire .big svg{animation:none}}
`;
  function style() { H().style(); if (document.getElementById('path-css')) return; const s = document.createElement('style'); s.id = 'path-css'; s.textContent = CSS; document.head.append(s); }

  // ---------- Открыть сундук: тряска, крышка, летят шестерёнки, награда ----------
  async function claim(sb, kind, id, { cup } = {}) {
    const o = H().overlay(`<div class="pm-open">${cup ? cupSvg : chestSvg(false)}<span class="pm-gears"></span><div class="pm-prize"></div></div>`);
    const { data, error } = await sb.rpc('hero_claim', { p_kind: kind, p_id: id ?? null });
    const box = o.box.querySelector('.pm-open'), prize = o.box.querySelector('.pm-prize');
    if (error) {
      prize.style.animationDelay = '0s';
      prize.innerHTML = `<h3>${/уже открыт/.test(error.message) ? 'Этот сундук уже открыт' : 'Сундук пока не открывается'}</h3><p class="hero-hint">${/уже открыт/.test(error.message) ? '' : /не выполнены|не пройден/.test(error.message) ? esc(error.message) + '.' : 'Проверьте связь и попробуйте ещё раз.'}</p><div class="hero-btns"><span></span><button type="button" class="hero-b main">Понятно</button></div>`;
      prize.querySelector('button').onclick = o.close;
      return null;
    }
    box.classList.add('go');
    o.box.querySelector('.pm-gears').innerHTML = Array.from({ length: 14 }, () => `<i style="--x:${(Math.random() * 2 - 1).toFixed(2)};--y:${(0.4 + Math.random()).toFixed(2)};--d:${(Math.random() * 0.3).toFixed(2)}s">${ico(I.gear)}</i>`).join('');
    const S = H().STATS, chips = Object.entries(data.deltas || {}).map(([k, v]) => S[k] ? `<span class="hero-chip" style="--c:${S[k].color}">+${v} ${S[k].name}</span>` : '').join('');
    prize.innerHTML = `<h3>${esc(data.note || 'Награда!')}</h3><p class="hero-big">+${data.gears} ${plural(data.gears, 'шестерёнка', 'шестерёнки', 'шестерёнок')}</p>`
      + (chips ? `<div>${chips}</div>` : '') + `<div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main">Забрать!</button></div>`;
    setTimeout(() => H().ding(true), 1100); setTimeout(() => H().ding(true), 1500);
    return new Promise((ok) => { prize.querySelector('button').onclick = () => { o.close(); ok(data); }; });
  }

  // ---------- «Серия N дней!» — один раз в день, когда день засчитан ----------
  const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  function streakShow(st) {
    const n = st.streak, today = new Date(st.today + 'T12:00:00'), wd = (today.getDay() + 6) % 7;
    const week = DAYS.map((d, i) => { const back = wd - i; const on = back >= 0 && back < n; return `<span><i class="${on ? 'on' : ''}" style="--d:${0.4 + i * 0.08}s">${on ? ico(I.flame, 16) : ''}</i>${d}</span>`; }).join('');
    const o = H().overlay(`<div class="pm-fire"><span class="big">${ico(I.flame, 120)}</span><p class="num">${n}</p>`
      + `<h3>${n === 1 ? 'Серия началась!' : plural(n, 'день', 'дня', 'дней') === 'день' ? `${n} день подряд!` : `${n} ${plural(n, 'день', 'дня', 'дней')} подряд!`}</h3>`
      + `<div class="pm-week">${week}</div>`
      + `<p class="hero-hint">${n === 1 ? 'Занимайся завтра тоже — огонёк разгорится. За 3, 7, 14 и 30 дней подряд — шестерёнки.' : 'Так держать! Приходи завтра, чтобы не погасить огонёк.'}${st.freezes ? ` Заморозок: ${st.freezes} — спасут серию, если пропустишь день.` : ''}</p>`
      + `<div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main">Продолжить</button></div></div>`);
    o.box.querySelector('.hero-b').onclick = o.close; H().ding(true);
  }

  // ---------- Панель ----------
  async function bar(el, { sb, userId, onGears }) {
    if (!H()) return null;
    style();
    const { data: st, error } = await sb.rpc('hero_status');
    if (error || !st) { el.innerHTML = ''; return null; }
    const q = st.quests || [], ok = q.filter((x) => x.have >= x.target).length;
    const boxState = st.daily_claimed ? 'done' : st.quests_done ? 'ready' : 'lock';
    el.innerHTML = `<div class="pb">
      <button type="button" class="pb-chip" data-a="fire" title="Серия дней"><span class="pb-fire${st.today_done ? ' on' : ''}">${ico(I.flame, 34)}</span><span><b>${st.streak}</b><small>${plural(st.streak, 'день', 'дня', 'дней')} подряд${st.today_done || !st.streak ? '' : '<br>сегодня — ещё нет'}</small></span></button>
      <button type="button" class="pb-chip" data-a="gear" title="Шестерёнки — потратить в лавке"><span class="pb-gear">${ico(I.gear, 32)}</span><span><b>${st.gears}</b><small>${plural(st.gears, 'шестерёнка', 'шестерёнки', 'шестерёнок')}${st.freezes ? `<br><span title="Заморозки спасают серию дней">${ico(I.snow, 11)} ×${st.freezes}</span>` : ''}${onGears ? '<br><u>в лавку →</u>' : ''}</small></span></button>
      <div class="pb-q"><h4><span style="color:var(--sanguine,#9a3a1b)">${ico(I.target, 20)}</span>Задания дня <small class="hero-hint">· ${ok} из ${q.length}</small></h4>
        <button type="button" class="pb-box ${boxState}" data-a="box" ${boxState === 'ready' ? '' : 'tabindex="-1"'} aria-label="Сундук за задания дня">${chestSvg(boxState === 'done')}<span>${boxState === 'ready' ? 'Открыть!' : boxState === 'done' ? 'открыт' : 'сундук'}</span></button>
        <ul>${q.map((x) => { const p = Math.min(100, Math.round((x.have * 100) / x.target)); return `<li class="${x.have >= x.target ? 'ok' : ''}"><span>${esc(x.title)}</span><em>${Math.min(x.have, x.target)} / ${x.target}</em><span class="bar"><i style="--p:${p}%"></i></span></li>`; }).join('')}</ul>
      </div></div>`;
    el.querySelector('[data-a=fire]').onclick = () => streakShow(st);
    el.querySelector('[data-a=gear]').onclick = () => onGears && onGears();
    el.querySelector('.pb-q h4').onclick = () => el.querySelector('.pb-q').classList.toggle('open');   // на телефоне список заданий свёрнут
    const b = el.querySelector('[data-a=box]');
    b.onclick = async () => { if (!b.classList.contains('ready')) return; if (await claim(sb, 'daily')) bar(el, { sb, userId, onGears }); };
    // день засчитан — один раз показываем огонёк
    const key = 'streakSeen:' + userId;
    let seen = null; try { seen = localStorage.getItem(key); } catch (e) {}
    if (st.today_done && seen !== st.today) { try { localStorage.setItem(key, st.today); } catch (e) {} streakShow(st); }
    return st;
  }

  window.Path = { bar, claim, streakShow, chestSvg, cupSvg, style };
})();
