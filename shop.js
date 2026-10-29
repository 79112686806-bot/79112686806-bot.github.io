// Лавка мастера: на что потратить шестерёнки — заморозки серии, украшения транспорта на карте и настоящие призы.
// Данные — таблицы shop_items / shop_orders и rpc shop_buy (миграция 20261026000029_shop.sql); списывает шестерёнки только сервер.
// Настоящие призы — с условиями (need_streak — рекорд серии, need_blocks — пройдено блоков) и не чаще раза в 30 дней:
// shop_prize_info (миграция 20261029000035_city_merge_prizes.sql), проверяет их снова shop_buy.
// Нужны hero.js (окна, звук) и path.js (стили, значок шестерёнки).
// Shop.open(el, { sb, userId, onChange }) — onChange(status) после покупки (обновить панель наград).
(function () {
  const H = () => window.Hero;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
  const gear = (s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke-width="3.4" stroke-dasharray="2.6 2.9"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="2"/></svg>`;
  const STATUS = { new: ['ждёт вручения', 'wait'], done: ['вручён', 'ok'], cancelled: ['отменён — шестерёнки вернулись', 'off'] };

  const CSS = `
.shop{font-family:"PT Serif",Georgia,serif;color:var(--ink,#3a2313)}
.shop-head{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;padding:16px 20px;margin:0 0 20px;border:1.5px solid var(--line,rgba(74,44,20,.26));border-bottom-width:4px;border-radius:6px;background:rgba(255,248,230,.55)}
.shop-head h2{margin:0;flex:1 1 220px;font:700 30px/1.1 "Cormorant Garamond",Georgia,serif}
.shop-head h2 small{display:block;font:400 14px/1.4 "PT Serif",Georgia,serif;color:var(--ink-soft,#6e4b2c);margin-top:4px}
.shop-bal{display:flex;align-items:center;gap:8px;color:#8a6d1f}.shop-bal b{font:700 34px/1 "Cormorant Garamond",Georgia,serif;color:var(--ink,#3a2313)}
.shop-bal small{font-size:13px;color:var(--ink-soft,#6e4b2c)}
.shop h3{margin:22px 0 10px;font:700 23px/1.15 "Cormorant Garamond",Georgia,serif;color:var(--sanguine,#9a3a1b)}
.shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.shop-it{position:relative;display:grid;grid-template-rows:auto auto 1fr auto;gap:6px;padding:14px 14px 12px;border:1.5px solid var(--line,rgba(74,44,20,.26));border-bottom-width:4px;border-radius:6px;background:rgba(255,252,242,.75)}
.shop-it .ic{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-size:30px;background:radial-gradient(circle at 35% 30%,#fff8e6,#ecd9ad);border:2px solid #c9a227;box-shadow:0 3px 0 #8a6d1f}
.shop-it b{font:700 18px/1.15 "Cormorant Garamond",Georgia,serif}
.shop-it p{margin:0;font-size:13.5px;line-height:1.4;color:var(--ink-soft,#6e4b2c)}
.shop-it .left{position:absolute;top:12px;right:12px;font-size:12px;color:var(--ink-soft,#6e4b2c)}
.shop-buy{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px;padding:9px 12px;border:1.5px solid var(--sanguine,#9a3a1b);border-radius:5px;background:var(--sanguine,#9a3a1b);color:#fff6e6;font:700 15px "PT Serif",Georgia,serif;cursor:pointer}
.shop-buy:hover{filter:brightness(1.08)}
.shop-buy[disabled]{cursor:default;background:transparent;color:var(--ink-soft,#6e4b2c);border-color:var(--line,rgba(74,44,20,.3));filter:none}
.shop-it.own{background:rgba(233,244,226,.7)}.shop-it.own .shop-buy{color:#3f7d4a;border-color:#8fb58f}
.shop-need{height:6px;border-radius:3px;background:rgba(74,44,20,.14);overflow:hidden}.shop-need i{display:block;height:100%;width:var(--p);background:linear-gradient(90deg,#c9a227,#e0661b)}
.shop-how{margin:4px 0 0;font-size:14px;color:var(--ink-soft,#6e4b2c)}
.shop-cond{margin:2px 0 0;padding:0;list-style:none;display:grid;gap:2px;font-size:13px;color:#a65435}.shop-cond li.ok{color:#3f7d4a}.shop-cond em{font-style:normal;opacity:.75}
.shop-my{display:grid;gap:8px}
.shop-my li{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;padding:9px 12px;border:1px dashed var(--line,rgba(74,44,20,.3));border-radius:5px;background:rgba(255,252,242,.6);list-style:none}
.shop-my li span{flex:1 1 200px}.shop-my li em{font-style:normal;font-size:13px;color:var(--ink-soft,#6e4b2c)}
.shop-my .st{font-size:13px;font-weight:700}.shop-my .st.wait{color:#b8692a}.shop-my .st.ok{color:#3f7d4a}.shop-my .st.off{color:#8a7c66}
.shop-my ul{margin:0;padding:0;display:grid;gap:8px}
.shop-ok{display:grid;justify-items:center;text-align:center}
.shop-ok .ic{font-size:72px;animation:heroPop .6s cubic-bezier(.2,.9,.3,1.6)}
.shop-note{width:100%;margin:6px 0 4px;padding:10px;border:1.5px solid var(--line,rgba(74,44,20,.3));border-radius:5px;font:inherit;background:#fffaf0}
@media(max-width:560px){.shop-grid{grid-template-columns:1fr 1fr;gap:8px}.shop-it{padding:10px}.shop-it .ic{width:44px;height:44px;font-size:24px}.shop-it b{font-size:16px}.shop-it p{font-size:12.5px}.shop-buy{font-size:13.5px;padding:8px 6px}.shop-head h2{font-size:25px}}
`;
  function style() { if (window.Path) Path.style(); if (document.getElementById('shop-css')) return; const s = document.createElement('style'); s.id = 'shop-css'; s.textContent = CSS; document.head.append(s); }

  async function open(el, { sb, userId, onChange }) {
    style();
    el.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Открываем лавку…</p>';
    const [{ data: items, error }, { data: orders }, { data: st }, { data: pi }] = await Promise.all([
      sb.from('shop_items').select('*').eq('active', true).order('sort').order('id'),
      sb.from('shop_orders').select('id,item_id,kind,code,title,price,status,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      sb.rpc('hero_status'), sb.rpc('shop_prize_info')]);
    if (error || !st) { el.innerHTML = '<p class="note">Лавка пока закрыта — загляни чуть позже.</p>'; return; }
    const gears = st.gears || 0, my = orders || [];
    const taken = (it) => my.filter((o) => o.item_id === it.id && o.status !== 'cancelled').length;
    const P = pi || { best_streak: st.best_streak || 0, blocks: 0 }, wait = P.next_on && new Date(P.next_on) > new Date() ? new Date(P.next_on) : null;
    // условия настоящего приза: [выполнено, текст]
    const conds = (it) => [it.need_streak && [P.best_streak >= it.need_streak, `🔥 серия ${it.need_streak} ${plural(it.need_streak, 'день', 'дня', 'дней')} подряд <em>(рекорд ${P.best_streak})</em>`],
      it.need_blocks && [P.blocks >= it.need_blocks, `📘 пройдено ${it.need_blocks} ${plural(it.need_blocks, 'блок', 'блока', 'блоков')} курса <em>(сейчас ${P.blocks})</em>`]].filter(Boolean);
    const card = (it) => {
      const own = it.kind === 'ride' && my.some((o) => o.code === it.code && o.status !== 'cancelled');
      const limit = it.per_user && it.kind === 'prize' && taken(it) >= it.per_user, out = it.stock === 0, fullFreeze = it.kind === 'freeze' && st.freezes >= 2;
      const cs = it.kind === 'prize' ? conds(it) : [], miss = cs.some(([ok]) => !ok), later = it.kind === 'prize' && wait;
      const need = it.price - gears, why = own ? '✓ уже есть' : limit ? '✓ уже взят' : out ? 'закончился' : fullFreeze ? 'заморозок уже 2' : miss ? '🔒 выполни условия'
        : later ? `можно с ${wait.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : need > 0 ? `ещё ${need} ${gear(15)}` : '';
      return `<div class="shop-it${own || limit ? ' own' : ''}">${it.stock != null && it.stock > 0 && it.stock <= 10 ? `<span class="left">осталось ${it.stock}</span>` : ''}<span class="ic">${esc(it.icon || '🎁')}</span><b>${esc(it.title)}</b><p>${esc(it.about || '')}</p>`
        + (cs.length ? `<ul class="shop-cond">${cs.map(([ok, t]) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${t}</li>`).join('')}</ul>` : '')
        + `<div>${need > 0 && !why.startsWith('✓') && !out && !fullFreeze ? `<div class="shop-need"><i style="--p:${Math.round((gears * 100) / it.price)}%"></i></div>` : ''}`
        + `<button type="button" class="shop-buy" data-id="${it.id}" ${why ? 'disabled' : ''}>${why || `Купить за ${it.price} ${gear(16)}`}</button></div></div>`;
    };
    const fun = (items || []).filter((i) => i.kind !== 'prize'), real = (items || []).filter((i) => i.kind === 'prize');
    el.innerHTML = `<div class="shop"><div class="shop-head"><h2>Лавка мастера<small>Шестерёнки дают за сундуки, задания дня и серию дней. Здесь их можно потратить.</small></h2>`
      + `<div class="shop-bal">${gear(30)}<span><b>${gears}</b><br><small>${plural(gears, 'шестерёнка', 'шестерёнки', 'шестерёнок')}${st.freezes ? ` · ❄️ ×${st.freezes}` : ''}</small></span></div></div>`
      + (fun.length ? `<h3>Для путешествия</h3><div class="shop-grid">${fun.map(card).join('')}</div>` : '')
      + (real.length ? `<h3>Настоящие призы</h3><p class="shop-how">Их нужно заслужить: накопить шестерёнки и выполнить условия. Настоящий приз можно взять раз в 30 дней — вручит преподаватель, на занятии или по почте. Если что-то не получится, шестерёнки вернутся.</p><div class="shop-grid" style="margin-top:10px">${real.map(card).join('')}</div>` : '')
      + (my.length ? `<h3>Мои покупки</h3><div class="shop-my"><ul>${my.map((o) => { const [t, c] = o.kind === 'prize' ? STATUS[o.status] : o.status === 'cancelled' ? STATUS.cancelled : ['есть', 'ok'];
        return `<li><span>${esc(o.title)}</span><em>${o.price} ${gear(13)} · ${new Date(o.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</em><b class="st ${c}">${t}</b></li>`; }).join('')}</ul></div>` : '')
      + '</div>';
    el.querySelectorAll('.shop-buy:not([disabled])').forEach((b) => (b.onclick = () => buy((items || []).find((i) => i.id === +b.dataset.id))));

    function buy(it) {
      const prize = it.kind === 'prize';
      const o = H().overlay(`<div class="shop-ok"><span class="ic">${esc(it.icon || '🎁')}</span><h3>${esc(it.title)}</h3><p class="hero-hint">Купить за ${it.price} ${plural(it.price, 'шестерёнку', 'шестерёнки', 'шестерёнок')}? Останется ${gears - it.price}.</p>`
        + (prize ? `<input class="shop-note" maxlength="300" placeholder="Пожелание (необязательно): цвет, размер…">` : '')
        + `<div class="hero-btns"><button type="button" class="hero-b" data-a="no">Не сейчас</button><button type="button" class="hero-b main" data-a="yes">Купить</button></div></div>`);
      o.box.querySelector('[data-a=no]').onclick = o.close;
      const yes = o.box.querySelector('[data-a=yes]');
      yes.onclick = async () => {
        yes.disabled = true; yes.textContent = 'Покупаем…';
        const { data, error } = await sb.rpc('shop_buy', { p_item: it.id, p_note: prize ? o.box.querySelector('.shop-note').value : null });
        const box = o.box.querySelector('.shop-ok');
        if (error) {
          box.innerHTML = `<h3>Не получилось</h3><p class="hero-hint">${/шестерёнок|закончился|уже|нельзя|нет в лавке|нужн|раз в 30/.test(error.message) ? esc(error.message) + '.' : 'Проверьте связь и попробуйте ещё раз.'}</p><div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main">Понятно</button></div>`;
          box.querySelector('button').onclick = () => { o.close(); open(el, { sb, userId, onChange }); };
          return;
        }
        H().ding(true);
        box.innerHTML = `<span class="ic">${esc(it.icon || '🎁')}</span><h3>${prize ? 'Приз твой!' : 'Готово!'}</h3><p class="hero-hint">${prize ? 'Преподаватель увидит покупку и вручит приз. Следить можно в «Моих покупках».' : it.kind === 'freeze' ? 'Заморозка спасёт серию, если пропустишь день.' : 'Загляни на карту курса — украшение уже на твоём транспорте.'}</p><div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main">Отлично!</button></div>`;
        box.querySelector('button').onclick = async () => { o.close(); await open(el, { sb, userId, onChange }); if (onChange) onChange(data); };
      };
    }
  }

  window.Shop = { open, style };
})();
