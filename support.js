// «Вопрос нам» — чат с клубом для всех посетителей сайта (страницы «Как проходят занятия», курсов, кабинет).
// Вошедший ученик пишет от своего аккаунта; гость — без регистрации: отдельный анонимный вход
// (makeSupabase({ storageKey: 'sb-support' })), который не путается со входом в личный кабинет.
// Переписка одна на посетителя: support_threads + support_messages; ответы приходят сразу (Realtime).
// Администратор отвечает в админ-панели → «Вопросы с сайта».
// Support.open({ from }) — открыть окно; Support.unread() → сколько новых ответов (для значков).
(function () {
  const CSS = `
.sup-back{position:fixed;inset:0;z-index:1500;background:rgba(36,22,12,.35);opacity:0;transition:opacity .25s}
.sup-back.on{opacity:1}
.sup{position:fixed;right:20px;bottom:20px;z-index:1501;width:min(400px,calc(100vw - 24px));height:min(620px,calc(100vh - 40px));display:flex;flex-direction:column;
  background:var(--parchment,#f2e4c4);border:1px solid rgba(74,44,20,.3);border-radius:6px;box-shadow:0 24px 60px rgba(30,15,5,.45);
  color:var(--ink,#3a2313);font-family:"PT Serif",Georgia,serif;transform:translateY(24px) scale(.97);opacity:0;transition:transform .3s cubic-bezier(.2,.9,.3,1.2),opacity .25s}
.sup.on{transform:none;opacity:1}
.sup-head{display:flex;align-items:center;gap:12px;padding:14px 16px 12px;border-bottom:1px solid rgba(74,44,20,.2)}
.sup-ava{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--sanguine,#9a3a1b);color:#fff7e6}
.sup-ava svg{width:24px;height:24px}
.sup-head h3{margin:0;font:700 22px/1.05 "Cormorant Garamond",Georgia,serif}
.sup-head small{display:block;font-size:12.5px;color:var(--ink-soft,#6e4b2c)}
.sup-x{margin-left:auto;flex:none;width:36px;height:36px;border:0;border-radius:50%;background:none;color:var(--ink,#3a2313);font-size:22px;cursor:pointer}
.sup-x:hover{background:rgba(74,44,20,.1)}
.sup-list{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}
.sup-msg{max-width:82%;padding:8px 12px 6px;border-radius:12px;font-size:15px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;animation:supIn .3s ease-out}
.sup-msg time{display:block;margin-top:2px;font-size:11px;color:var(--ink-soft,#6e4b2c);text-align:right}
.sup-them{align-self:flex-start;background:rgba(255,250,236,.9);border:1px solid rgba(74,44,20,.18);border-bottom-left-radius:4px}
.sup-me{align-self:flex-end;background:rgba(154,58,27,.12);border:1px solid rgba(154,58,27,.25);border-bottom-right-radius:4px}
.sup-me.sending{opacity:.6}
.sup-sys{align-self:center;max-width:92%;font-size:13px;color:var(--ink-soft,#6e4b2c);text-align:center}
@keyframes supIn{from{opacity:0;transform:translateY(6px)}}
.sup-intro{padding:0 14px 8px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.sup-intro input,.sup-form textarea{width:100%;font:inherit;font-size:14.5px;color:var(--ink,#3a2313);background:rgba(255,250,236,.85);border:1px solid rgba(74,44,20,.28);border-radius:6px;padding:8px 10px}
.sup-intro p{grid-column:1/-1;margin:0;font-size:12.5px;color:var(--ink-soft,#6e4b2c)}
.sup-form{display:flex;gap:8px;align-items:flex-end;padding:10px 14px 14px;border-top:1px solid rgba(74,44,20,.2)}
.sup-form textarea{resize:none;min-height:44px;max-height:140px;line-height:1.4}
.sup-form textarea:focus,.sup-intro input:focus{outline:2px solid rgba(154,58,27,.35);outline-offset:0}
.sup-send{flex:none;width:46px;height:46px;border:0;border-radius:50%;background:var(--sanguine,#9a3a1b);color:#fff7e6;font-size:20px;cursor:pointer;transition:transform .15s}
.sup-send:hover{transform:scale(1.06)}.sup-send:disabled{opacity:.5;transform:none;cursor:default}
.sup-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.sup-err{padding:0 14px 6px;font-size:13px;color:var(--sanguine,#9a3a1b)}.sup-err:empty{display:none}
.sup-mail{display:inline-block;margin-top:6px;padding:6px 12px;border:1.5px solid var(--sanguine,#9a3a1b);border-radius:4px;color:var(--sanguine,#9a3a1b);font-weight:700;text-decoration:none}.sup-mail:hover{background:var(--sanguine,#9a3a1b);color:#fff7e6}
.sup-pill{position:fixed;right:18px;bottom:18px;z-index:1400;display:flex;align-items:center;gap:8px;padding:10px 16px 10px 12px;border:0;border-radius:40px;background:var(--sanguine,#9a3a1b);color:#fff7e6;
  font:700 15px "PT Serif",Georgia,serif;box-shadow:0 10px 26px rgba(60,20,5,.4);cursor:pointer;animation:supIn .4s ease-out}
.sup-pill i{width:9px;height:9px;border-radius:50%;background:#ffd36b;box-shadow:0 0 0 0 rgba(255,211,107,.7);animation:supPulse 1.6s infinite}
@keyframes supPulse{70%{box-shadow:0 0 0 10px rgba(255,211,107,0)}100%{box-shadow:0 0 0 0 rgba(255,211,107,0)}}
@media (max-width:560px){.sup{right:0;bottom:0;width:100vw;height:100%;height:100dvh;border-radius:0;border:0}.sup-intro{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.sup,.sup-back,.sup-msg{transition:none;animation:none}}`;
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 17h-9l-5 3.5V17H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 5z"/><path d="M7.5 11h.01M12 11h.01M16.5 11h.01"/></svg>';
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tm = (d) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  let guestClient = null, box = null, back = null, chan = null, ctx = null, hasThread = false, from = '';

  // кто пишет: вошедший ученик — своим аккаунтом, иначе гость (анонимный вход создаётся при первом сообщении)
  async function who() {
    const main = typeof sb !== 'undefined' ? sb : null;   // клиент страницы (const sb в index.html)
    if (main) {
      const { data: { session } } = await main.auth.getSession().catch(() => ({ data: {} }));
      if (session && !session.user.is_anonymous) return { c: main, user: session.user, guest: false };
    }
    if (!guestClient) guestClient = makeSupabase({ storageKey: 'sb-support' });
    const { data: { session } } = await guestClient.auth.getSession().catch(() => ({ data: {} }));
    return { c: guestClient, user: session ? session.user : null, guest: true };
  }

  function addMsg(m, mine) {
    const list = box.querySelector('.sup-list');
    if (m.id && list.querySelector(`[data-id="${m.id}"]`)) return;
    const d = document.createElement('div');
    d.className = 'sup-msg ' + (mine ? 'sup-me' : 'sup-them'); if (m.id) d.dataset.id = m.id;
    d.innerHTML = `${esc(m.body)}<time>${m.created_at ? tm(m.created_at) : 'отправляется…'}</time>`;
    list.append(d); list.scrollTop = list.scrollHeight;
    return d;
  }
  function sys(t) { const d = document.createElement('div'); d.className = 'sup-sys'; d.textContent = t; box.querySelector('.sup-list').append(d); }

  async function markRead() {
    if (!ctx || !ctx.user) return;
    await ctx.c.from('support_messages').update({ read_at: new Date().toISOString() }).eq('user_id', ctx.user.id).eq('from_admin', true).is('read_at', null);
    pill(0);
  }
  function listen() {
    if (chan || !ctx || !ctx.user) return;
    chan = ctx.c.channel('support-' + ctx.user.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: 'user_id=eq.' + ctx.user.id }, (p) => {
      const m = p.new;
      if (box && box.classList.contains('on')) { if (m.from_admin) { addMsg(m, false); markRead(); } else addMsg(m, true); }
      else if (m.from_admin) pill(1);
    }).subscribe();
  }

  async function load() {
    const list = box.querySelector('.sup-list'); list.innerHTML = '';
    const hi = { body: 'Здравствуйте! Спросите о курсах, занятиях или оплате — ответим здесь же, обычно в течение дня. 🙂' };
    addMsg(hi, false).querySelector('time').remove();
    ctx = await who();
    box.querySelector('.sup-intro').hidden = !ctx.guest;
    if (!ctx.user) return;
    const [{ data: th }, { data: msgs }] = await Promise.all([
      ctx.c.from('support_threads').select('name,contact').eq('user_id', ctx.user.id).maybeSingle(),
      ctx.c.from('support_messages').select('id,body,from_admin,created_at').eq('user_id', ctx.user.id).order('created_at').limit(200),
    ]);
    hasThread = !!th;
    if (th) { box.querySelector('[name=name]').value = th.name || ''; box.querySelector('[name=contact]').value = th.contact || ''; if (th.name || th.contact) box.querySelector('.sup-intro').hidden = true; }
    (msgs || []).forEach((m) => addMsg(m, !m.from_admin));
    listen(); markRead();
  }

  async function send() {
    const ta = box.querySelector('textarea'), btn = box.querySelector('.sup-send'), err = box.querySelector('.sup-err');
    const text = ta.value.trim(); if (!text) return;
    err.textContent = ''; btn.disabled = true;
    const tmp = addMsg({ body: text }, true); tmp.classList.add('sending'); ta.value = ''; grow(ta);
    // скрытое поле видят и заполняют только боты — им делаем вид, что всё отправлено
    if (box.querySelector('[name=website]').value) { tmp.classList.remove('sending'); btn.disabled = false; return; }
    try {
      if (!ctx || !ctx.user) {
        ctx = ctx || await who();
        if (!ctx.user) {
          const { data, error } = await ctx.c.auth.signInAnonymously();
          if (error) throw new Error('auth');
          ctx.user = data.user;
        }
      }
      const name = box.querySelector('[name=name]').value.trim().slice(0, 80), contact = box.querySelector('[name=contact]').value.trim().slice(0, 200);
      if (!hasThread || name || contact) {
        const row = { user_id: ctx.user.id, page: (from ? from + ' · ' : '') + location.pathname.slice(0, 150) };
        if (name || !hasThread) row.name = name || null;
        if (contact || !hasThread) row.contact = contact || null;
        const { error } = await ctx.c.from('support_threads').upsert(row, { onConflict: 'user_id' });
        if (error) throw error;
        hasThread = true;
      }
      const { data: m, error } = await ctx.c.from('support_messages').insert({ user_id: ctx.user.id, body: text }).select('id,body,created_at').single();
      if (error) throw error;
      tmp.remove(); addMsg(m, true);
      if (!box.querySelector('.sup-intro').hidden) box.querySelector('.sup-intro').hidden = true;
      if (!box.dataset.thanked) { box.dataset.thanked = '1'; sys('Сообщение отправлено. Ответ придёт сюда — можно закрыть окно и вернуться позже.'); }
      listen();
    } catch (e) {
      console.error(e); tmp.remove(); ta.value = text; grow(ta);
      if (/Слишком много/.test(e && e.message)) err.textContent = 'Слишком много сообщений подряд. Попробуйте чуть позже.';
      else {
        // чат не отвечает — сразу предлагаем письмо с уже написанным вопросом
        err.textContent = e && e.message === 'auth' ? 'Чат сейчас недоступен — отправьте вопрос письмом, ответим на почту.' : 'Не получилось отправить. Проверьте интернет или отправьте вопрос письмом.';
        const mail = (window.APP_CONFIG || {}).siteEmail;
        if (mail) {
          const f = box.querySelector('.sup-intro'), who = ['name', 'contact'].map((n) => (f.querySelector(`[name=${n}]`) || {}).value || '').map((v) => v.trim()).filter(Boolean).join(', ');
          const a = document.createElement('a'); a.className = 'sup-mail';
          a.href = `mailto:${mail}?subject=${encodeURIComponent('Вопрос с сайта')}&body=${encodeURIComponent(text + (who ? '\n\n' + who : ''))}`;
          a.textContent = '✉ Написать на почту'; err.append(' ', a);
        }
      }
    } finally { btn.disabled = false; ta.focus(); }
  }
  const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };

  function build() {
    if (!document.getElementById('sup-css')) { const st = document.createElement('style'); st.id = 'sup-css'; st.textContent = CSS; document.head.append(st); }
    back = document.createElement('div'); back.className = 'sup-back'; back.onclick = close;
    box = document.createElement('div'); box.className = 'sup'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Вопрос нам');
    box.innerHTML = `<div class="sup-head"><span class="sup-ava">${ICON}</span><div><h3>Вопрос нам</h3><small>Инженерный клуб · отвечаем в чате</small></div><button type="button" class="sup-x" aria-label="Закрыть">×</button></div>
      <div class="sup-list" aria-live="polite"></div>
      <div class="sup-intro"><input name="name" maxlength="80" placeholder="Как к вам обращаться" autocomplete="name"><input name="contact" maxlength="200" placeholder="Телефон или Telegram" autocomplete="tel"><p>Необязательно — если удобнее получить ответ ещё и там.</p></div>
      <div class="sup-err" role="alert"></div>
      <form class="sup-form"><input name="website" class="sup-hp" tabindex="-1" autocomplete="off" aria-hidden="true"><textarea rows="1" maxlength="2000" placeholder="Напишите вопрос…" aria-label="Сообщение"></textarea><button type="submit" class="sup-send" aria-label="Отправить">➜</button></form>`;
    box.querySelector('.sup-x').onclick = close;
    const ta = box.querySelector('textarea');
    ta.addEventListener('input', () => grow(ta));
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    box.querySelector('form').onsubmit = (e) => { e.preventDefault(); send(); };
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(back, box);
  }
  function open(o = {}) {
    from = o.from || '';
    if (!box) build();
    pill(0);
    back.style.display = box.style.display = '';
    requestAnimationFrame(() => { back.classList.add('on'); box.classList.add('on'); });
    if (innerWidth <= 560) document.documentElement.style.overflow = 'hidden';
    load().then(() => box.querySelector('textarea').focus({ preventScroll: true })).catch((e) => { console.error(e); sys('Не удалось загрузить переписку. Обновите страницу.'); });
  }
  function close() {
    if (!box) return;
    back.classList.remove('on'); box.classList.remove('on'); document.documentElement.style.overflow = '';
    setTimeout(() => { if (!box.classList.contains('on')) back.style.display = box.style.display = 'none'; }, 300);
  }

  // кнопка «Вам ответили» — если пришёл ответ, пока окно закрыто (или при следующем заходе на сайт)
  let pillEl = null;
  function pill(n) {
    if (!n) { if (pillEl) pillEl.hidden = true; return; }
    if (!pillEl) { pillEl = document.createElement('button'); pillEl.type = 'button'; pillEl.className = 'sup-pill'; pillEl.innerHTML = '<i></i>Вам ответили в чате'; pillEl.onclick = () => open({ from: 'ответ' }); if (!document.getElementById('sup-css')) { const st = document.createElement('style'); st.id = 'sup-css'; st.textContent = CSS; document.head.append(st); } document.body.append(pillEl); }
    pillEl.hidden = false;
  }
  async function unread() {
    const w = await who(); if (!w.user) return 0;
    const { count } = await w.c.from('support_messages').select('id', { count: 'exact', head: true }).eq('user_id', w.user.id).eq('from_admin', true).is('read_at', null);
    if (!ctx) { ctx = w; listen(); }
    return count || 0;
  }

  window.Support = { open, close, unread };
  // при заходе на сайт: есть непрочитанный ответ — показать кнопку (только если раньше уже писали)
  window.addEventListener('load', () => {
    let wrote = false; try { wrote = !!localStorage.getItem('sb-support') || !!Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k)); } catch (e) {}
    if (wrote && !/admin\.html$/.test(location.pathname)) setTimeout(() => unread().then((n) => n && pill(n)).catch(() => {}), 1500);
  });
})();
