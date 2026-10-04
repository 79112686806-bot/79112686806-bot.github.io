// Чат темы — общий для личного кабинета (index.html) и админ-панели (admin.html).
// Переписка = ученик + тема. Ответы, правка, удаление, вложения (скрепка),
// отметки о прочтении, мгновенная доставка (Supabase Realtime).
//
// Chat.mount(элемент, {
//   sb,            — клиент Supabase
//   studentId,     — ученик, чья это переписка
//   lessonId,      — тема
//   meId,          — кто сейчас пишет
//   side,          — 'student' (кабинет) или 'teacher' (админ-панель)
//   peerName,      — как подписывать собеседника
//   isAdmin,       — админ может удалять любые сообщения
//   onRead,        — вызывается, когда переписка отмечена прочитанной
// }) → { destroy() }
(function () {
  const MAX_FILE = 50 * 1024 * 1024;
  const COLS = 'id,student_id,lesson_id,author_id,body,attachments,created_at,edited_at,deleted_at,read_at,reply_to';

  const CSS = `
.chat{--c-accent:var(--chat-accent,#9a3a1b);--c-line:var(--chat-line,#e4ddd1);--c-mine:var(--chat-mine,rgba(154,58,27,.09));--c-other:var(--chat-other,rgba(255,250,236,.75));--c-muted:var(--chat-muted,#776b5d);--c-menu:var(--chat-menu,#fffaf0);position:relative}
.chat-list{max-height:460px;min-height:120px;overflow-y:auto;padding:4px 2px 8px;scroll-behavior:smooth}
.chat-empty{color:var(--c-muted);font-size:14px;text-align:center;padding:24px 0}
.chat-day{text-align:center;margin:14px 0 8px}
.chat-day span{display:inline-block;font-size:12px;color:var(--c-muted);background:var(--c-other);border:1px solid var(--c-line);border-radius:20px;padding:2px 10px}
.chat-msg{display:flex;margin:4px 0}
.chat-msg.mine{justify-content:flex-end}
.chat-bubble{max-width:78%;padding:7px 11px 5px;border:1px solid var(--c-line);border-radius:12px;background:var(--c-other);cursor:pointer;word-wrap:break-word;overflow-wrap:anywhere;transition:box-shadow .15s}
.chat-msg.mine .chat-bubble{background:var(--c-mine);border-bottom-right-radius:4px}
.chat-msg:not(.mine) .chat-bubble{border-bottom-left-radius:4px}
.chat-bubble:hover{box-shadow:0 1px 6px rgba(0,0,0,.08)}
.chat-msg.flash .chat-bubble{box-shadow:0 0 0 2px var(--c-accent)}
.chat-author{font-size:12px;font-weight:700;color:var(--c-accent);margin-bottom:2px}
.chat-text{white-space:pre-wrap;line-height:1.45}
.chat-deleted{font-style:italic;color:var(--c-muted)}
.chat-meta{font-size:11px;color:var(--c-muted);text-align:right;margin-top:2px;white-space:nowrap}
.chat-meta .read{color:var(--c-accent)}
.chat-quote{border-left:3px solid var(--c-accent);padding:2px 8px;margin:2px 0 5px;font-size:13px;background:rgba(0,0,0,.03);border-radius:0 6px 6px 0;max-height:3.2em;overflow:hidden}
.chat-quote b{color:var(--c-accent);font-size:12px;display:block}
.chat-att-img{display:block;max-width:260px;max-height:260px;border-radius:8px;margin:3px 0}
.chat-att-video{display:block;max-width:100%;max-height:320px;border-radius:8px;margin:3px 0}
.chat-att-file{display:flex;gap:8px;align-items:center;padding:6px 8px;margin:3px 0;border:1px solid var(--c-line);border-radius:8px;text-decoration:none;color:inherit;background:rgba(255,255,255,.4)}
.chat-att-file small{color:var(--c-muted)}
.chat-compose{border-top:1px solid var(--c-line);padding-top:10px;margin-top:6px}
.chat-bar{display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 10px;margin-bottom:8px;border-left:3px solid var(--c-accent);background:rgba(0,0,0,.03);border-radius:0 6px 6px 0}
.chat-bar .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chat-bar b{color:var(--c-accent)}
.chat-files{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.chat-chip{position:relative;display:flex;align-items:center;gap:6px;padding:4px 26px 4px 6px;border:1px solid var(--c-line);border-radius:8px;font-size:12px;max-width:220px;background:rgba(255,255,255,.5)}
.chat-chip img{width:44px;height:44px;object-fit:cover;border-radius:6px}
.chat-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chat-chip button{position:absolute;right:4px;top:4px}
.chat-row{display:flex;align-items:flex-end;gap:8px}
.chat-input{flex:1;resize:none;min-height:42px;max-height:160px;padding:10px 12px;font:inherit;line-height:1.4;border:1px solid var(--c-line);border-radius:12px;background:rgba(255,255,255,.6);color:inherit}
.chat-input:focus{outline:2px solid rgba(154,58,27,.35);outline-offset:0}
.chat-icon{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid var(--c-line);background:rgba(255,255,255,.6);font-size:19px;line-height:1;cursor:pointer;display:grid;place-items:center;color:var(--c-accent);padding:0}
.chat-icon:hover{border-color:var(--c-accent)}
.chat-send{background:var(--c-accent);border-color:var(--c-accent);color:#fff}
.chat-send:disabled{opacity:.5;cursor:default}
.chat-x{border:none;background:none;cursor:pointer;color:var(--c-muted);font-size:15px;line-height:1;padding:2px}
.chat-clip-wrap{position:relative}
.chat-menu{position:absolute;z-index:30;min-width:170px;background:var(--c-menu);border:1px solid var(--c-line);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);padding:5px}
.chat-menu button{display:block;width:100%;text-align:left;border:none;background:none;padding:8px 10px;border-radius:6px;font:inherit;font-size:14px;cursor:pointer;color:inherit}
.chat-menu button:hover{background:rgba(0,0,0,.05)}
.chat-menu button.danger{color:#b3261e}
.chat-clip-menu{bottom:50px;left:0}
.chat-err{font-size:13px;color:#b3261e;min-height:0;margin-top:6px}
.chat-hint{font-size:12px;color:var(--c-muted);margin-top:4px}
[hidden]{display:none!important}
@media(max-width:600px){.chat-bubble{max-width:90%}.chat-att-img{max-width:200px}}`;

  function injectCss() {
    if (document.getElementById('chat-css')) return;
    const s = document.createElement('style');
    s.id = 'chat-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const time = (d) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  function dayLabel(d) {
    const x = new Date(d), today = new Date(), y = new Date();
    y.setDate(today.getDate() - 1);
    if (x.toDateString() === today.toDateString()) return 'Сегодня';
    if (x.toDateString() === y.toDateString()) return 'Вчера';
    const o = { day: 'numeric', month: 'long' };
    if (x.getFullYear() !== today.getFullYear()) o.year = 'numeric';
    return x.toLocaleDateString('ru-RU', o);
  }
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');

  // Временные ссылки на вложения (закрытый бакет), кешируются на час
  const urlCache = {};
  async function signedUrls(sb, paths) {
    const now = Date.now();
    const need = [...new Set(paths)].filter((p) => !urlCache[p] || urlCache[p].exp < now);
    if (need.length) {
      const { data } = await sb.storage.from('chat').createSignedUrls(need, 3600);
      (data || []).forEach((d) => { if (d.signedUrl) urlCache[d.path] = { url: d.signedUrl, exp: now + 3500e3 }; });
    }
    const out = {};
    paths.forEach((p) => { if (urlCache[p]) out[p] = urlCache[p].url; });
    return out;
  }

  function mount(root, o) {
    injectCss();
    const sb = o.sb;
    const st = { msgs: new Map(), reply: null, edit: null, files: [], channel: null, alive: true, sending: false };

    root.innerHTML = `<div class="chat">
  <div class="chat-list"><div class="chat-empty">Загружаем сообщения…</div></div>
  <div class="chat-compose">
    <div class="chat-bar" hidden></div>
    <div class="chat-files" hidden></div>
    <div class="chat-row">
      <div class="chat-clip-wrap">
        <button type="button" class="chat-icon chat-clip" title="Прикрепить фото, видео или файл">📎</button>
        <div class="chat-menu chat-clip-menu" hidden>
          <button type="button" data-k="photo">🖼 Фото</button>
          <button type="button" data-k="video">🎬 Видео</button>
          <button type="button" data-k="file">📄 Файл</button>
        </div>
      </div>
      <textarea class="chat-input" rows="1" maxlength="4000" placeholder="Сообщение"></textarea>
      <button type="button" class="chat-icon chat-send" title="Отправить (Enter)">➤</button>
    </div>
    <div class="chat-err"></div>
    <div class="chat-hint">Enter — отправить, Shift+Enter — новая строка. Нажмите на сообщение, чтобы ответить или изменить.</div>
    <input type="file" class="f-photo" accept="image/*" multiple hidden>
    <input type="file" class="f-video" accept="video/*" multiple hidden>
    <input type="file" class="f-file" multiple hidden>
  </div>
  <div class="chat-menu chat-msg-menu" hidden></div>
</div>`;
    const $ = (s) => root.querySelector(s);
    const chatEl = $('.chat'), list = $('.chat-list'), input = $('.chat-input'), bar = $('.chat-bar'),
      filesBox = $('.chat-files'), errEl = $('.chat-err'), clipBtn = $('.chat-clip'), clipMenu = $('.chat-clip-menu'),
      msgMenu = $('.chat-msg-menu'), sendBtn = $('.chat-send');

    const ownSide = (m) => (o.side === 'student' ? m.author_id === o.studentId : m.author_id !== o.studentId);
    const authorName = (m) => (m.author_id === o.meId ? 'Вы' : o.peerName);
    const setErr = (t) => { errEl.textContent = t || ''; };
    const snippet = (m) => (m.deleted_at ? 'Сообщение удалено' : m.body ? m.body.slice(0, 90) : (m.attachments || []).length ? '📎 Вложение' : '');

    // ---------- Отрисовка ----------
    async function render(keepScroll) {
      const msgs = [...st.msgs.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
      const urls = await signedUrls(sb, msgs.flatMap((m) => (m.attachments || []).map((a) => a.path)));
      if (!st.alive) return;
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      let html = '', lastDay = '';
      for (const m of msgs) {
        const day = new Date(m.created_at).toDateString();
        if (day !== lastDay) { html += `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>`; lastDay = day; }
        const mine = ownSide(m);
        const parent = m.reply_to ? st.msgs.get(m.reply_to) : null;
        const quote = parent ? `<div class="chat-quote" data-jump="${parent.id}"><b>${esc(authorName(parent))}</b>${esc(snippet(parent))}</div>` : '';
        const att = (m.attachments || []).map((a) => {
          const u = urls[a.path] ? esc(urls[a.path]) : '', n = esc(a.name || 'файл'), t = a.type || '';
          if (!u) return `<div class="chat-att-file">📎 ${n}</div>`;
          if (t.startsWith('image/')) return `<a href="${u}" target="_blank" rel="noopener" data-noclick><img class="chat-att-img" src="${u}" alt="${n}" loading="lazy"></a>`;
          if (t.startsWith('video/')) return `<video class="chat-att-video" src="${u}" controls preload="metadata" data-noclick></video>`;
          return `<a class="chat-att-file" href="${u}" target="_blank" rel="noopener" data-noclick>📄 <span>${n}<br><small>${a.size ? size(a.size) : ''}</small></span></a>`;
        }).join('');
        const body = m.deleted_at ? '<div class="chat-deleted">Сообщение удалено</div>' : m.body ? `<div class="chat-text">${esc(m.body)}</div>` : '';
        const ticks = mine && !m.deleted_at ? (m.read_at ? ' <span class="read" title="Прочитано">✓✓</span>' : ' <span title="Отправлено">✓</span>') : '';
        html += `<div class="chat-msg ${mine ? 'mine' : ''}" data-id="${m.id}"><div class="chat-bubble">
          ${!mine ? `<div class="chat-author">${esc(o.peerName)}</div>` : ''}${quote}${m.deleted_at ? '' : att}${body}
          <div class="chat-meta">${m.edited_at && !m.deleted_at ? 'изменено · ' : ''}${time(m.created_at)}${ticks}</div></div></div>`;
      }
      list.innerHTML = html || '<div class="chat-empty">Сообщений пока нет — напишите первым.</div>';
      if (!keepScroll || nearBottom) list.scrollTop = list.scrollHeight;
    }

    function upsert(rows) { rows.forEach((m) => st.msgs.set(m.id, m)); }

    async function load() {
      const { data, error } = await sb.from('lesson_messages').select(COLS)
        .eq('student_id', o.studentId).eq('lesson_id', o.lessonId)
        .order('created_at', { ascending: false }).limit(300);
      if (!st.alive) return;
      if (error) { list.innerHTML = '<div class="chat-empty">Не удалось загрузить сообщения. Обновите страницу.</div>'; return; }
      upsert(data || []);
      await render(false);
      markRead();
    }

    async function markRead() {
      const unread = [...st.msgs.values()].some((m) => !ownSide(m) && !m.read_at && !m.deleted_at);
      if (!unread || document.hidden) return;
      const { error } = await sb.rpc('mark_thread_read', { p_student_id: o.studentId, p_lesson_id: o.lessonId });
      if (!error) {
        st.msgs.forEach((m) => { if (!ownSide(m) && !m.read_at) m.read_at = new Date().toISOString(); });
        if (o.onRead) o.onRead();
      }
    }
    const onVisible = () => { if (!document.hidden) markRead(); };
    document.addEventListener('visibilitychange', onVisible);

    function subscribe() {
      st.channel = sb.channel(`chat-${o.studentId}-${o.lessonId}-${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_messages', filter: `student_id=eq.${o.studentId}` }, (p) => {
          const m = p.new;
          if (!m || m.lesson_id !== o.lessonId) return;
          upsert([m]);
          render(true);
          if (p.eventType === 'INSERT' && !ownSide(m)) markRead();
        })
        .subscribe();
    }

    // ---------- Меню сообщения ----------
    function closeMenus() { msgMenu.hidden = true; clipMenu.hidden = true; }
    function openMsgMenu(m, bubble) {
      const canEdit = m.author_id === o.meId && !m.deleted_at && (m.body || !(m.attachments || []).length);
      const canDelete = !m.deleted_at && (m.author_id === o.meId || o.isAdmin);
      msgMenu.innerHTML = [
        !m.deleted_at && '<button type="button" data-a="reply">↩ Ответить</button>',
        m.body && !m.deleted_at && '<button type="button" data-a="copy">📋 Копировать текст</button>',
        canEdit && '<button type="button" data-a="edit">✏️ Редактировать</button>',
        canDelete && '<button type="button" data-a="delete" class="danger">🗑 Удалить</button>',
      ].filter(Boolean).join('');
      if (!msgMenu.innerHTML) return;
      msgMenu.dataset.id = m.id;
      msgMenu.hidden = false;
      const c = chatEl.getBoundingClientRect(), b = bubble.getBoundingClientRect();
      // меню не выходит за границы чата (важно на узком экране телефона)
      const left = Math.max(0, Math.min(ownSide(m) ? b.right - c.left - msgMenu.offsetWidth : b.left - c.left, c.width - msgMenu.offsetWidth));
      let top = b.bottom - c.top + 4;
      if (top + msgMenu.offsetHeight > c.height) top = Math.max(0, b.top - c.top - msgMenu.offsetHeight - 4);
      msgMenu.style.left = left + 'px';
      msgMenu.style.top = top + 'px';
    }

    list.addEventListener('click', (e) => {
      if (e.target.closest('[data-noclick]')) return;
      const q = e.target.closest('[data-jump]');
      if (q) {
        const t = list.querySelector(`.chat-msg[data-id="${q.dataset.jump}"]`);
        if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1200); }
        return;
      }
      const row = e.target.closest('.chat-msg');
      if (!row) return;
      e.stopPropagation();
      clipMenu.hidden = true;
      openMsgMenu(st.msgs.get(+row.dataset.id), row.querySelector('.chat-bubble'));
    });

    msgMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      const m = st.msgs.get(+msgMenu.dataset.id);
      const a = btn.dataset.a;
      if (a === 'delete' && !btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = '🗑 Точно удалить?'; return; }
      closeMenus();
      if (a === 'reply') { st.edit = null; st.reply = m; showBar(); input.focus(); }
      if (a === 'copy') { try { await navigator.clipboard.writeText(m.body); } catch (_) { /* буфер недоступен */ } }
      if (a === 'edit') { st.reply = null; st.edit = m; clearFiles(); input.value = m.body; autosize(); showBar(); input.focus(); }
      if (a === 'delete') {
        const { data, error } = await sb.from('lesson_messages').update({ deleted_at: new Date().toISOString() }).eq('id', m.id).select(COLS).single();
        if (error) return setErr('Не удалось удалить сообщение.');
        upsert([data]); render(true);
      }
    });

    const onDocClick = (e) => { if (!e.target.closest('.chat-menu') && !e.target.closest('.chat-clip')) closeMenus(); };
    const onKey = (e) => { if (e.key === 'Escape') { closeMenus(); if (st.edit || st.reply) cancelBar(); } };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);

    // ---------- Ответ / редактирование ----------
    function showBar() {
      const m = st.edit || st.reply;
      if (!m) { bar.hidden = true; return; }
      bar.hidden = false;
      bar.innerHTML = `<span class="t">${st.edit ? '✏️ <b>Редактирование</b>' : `↩ <b>${esc(authorName(m))}</b>`}: ${esc(snippet(m))}</span><button type="button" class="chat-x" title="Отменить">✕</button>`;
      bar.querySelector('button').onclick = cancelBar;
      clipBtn.disabled = !!st.edit;
    }
    function cancelBar() { if (st.edit) input.value = ''; st.edit = null; st.reply = null; showBar(); autosize(); }

    // ---------- Вложения ----------
    clipBtn.addEventListener('click', (e) => { e.stopPropagation(); msgMenu.hidden = true; clipMenu.hidden = !clipMenu.hidden; });
    clipMenu.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      clipMenu.hidden = true;
      $('.f-' + b.dataset.k).click();
    });
    ['photo', 'video', 'file'].forEach((k) => {
      const inp = $('.f-' + k);
      inp.addEventListener('change', () => { addFiles([...inp.files]); inp.value = ''; });
    });
    input.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    });
    function addFiles(files) {
      setErr('');
      for (const f of files) {
        if (f.size > MAX_FILE) { setErr(`Файл «${f.name}» больше 50 МБ. Загрузите его на Яндекс Диск и пришлите ссылку.`); continue; }
        if (st.files.length >= 10) { setErr('Не больше 10 вложений в одном сообщении.'); break; }
        st.files.push({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
      }
      renderFiles();
    }
    function renderFiles() {
      filesBox.hidden = !st.files.length;
      filesBox.innerHTML = st.files.map((x, i) => `<div class="chat-chip">${x.preview ? `<img src="${x.preview}" alt="">` : x.file.type.startsWith('video/') ? '🎬' : '📄'}<span>${esc(x.file.name)}<br><small>${size(x.file.size)}</small></span><button type="button" class="chat-x" data-i="${i}" title="Убрать">✕</button></div>`).join('');
      filesBox.querySelectorAll('button').forEach((b) => { b.onclick = () => { const x = st.files.splice(+b.dataset.i, 1)[0]; if (x.preview) URL.revokeObjectURL(x.preview); renderFiles(); }; });
    }
    function clearFiles() { st.files.forEach((x) => x.preview && URL.revokeObjectURL(x.preview)); st.files = []; renderFiles(); }

    // ---------- Ввод и отправка ----------
    function autosize() { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight + 2) + 'px'; }
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    sendBtn.addEventListener('click', send);

    async function send() {
      if (st.sending) return;
      const body = input.value.trim();
      setErr('');
      if (st.edit) {
        if (!body) return setErr('Текст не может быть пустым. Чтобы убрать сообщение, удалите его.');
        st.sending = true; sendBtn.disabled = true;
        const { data, error } = await sb.from('lesson_messages').update({ body }).eq('id', st.edit.id).select(COLS).single();
        st.sending = false; sendBtn.disabled = false;
        if (error) return setErr('Не удалось сохранить изменения.');
        upsert([data]); st.edit = null; input.value = ''; autosize(); showBar(); render(true);
        return;
      }
      if (!body && !st.files.length) return;
      st.sending = true; sendBtn.disabled = true;
      const attachments = [];
      for (let i = 0; i < st.files.length; i++) {
        const f = st.files[i].file;
        setErr('');
        errEl.style.color = 'var(--c-muted)';
        errEl.textContent = st.files.length > 1 ? `Загружаем файлы: ${i + 1} из ${st.files.length}…` : 'Загружаем файл…';
        // В хранилище — только латиница; настоящее имя сохраняется в сообщении
        const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
        const path = `${o.studentId}/${o.lessonId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        const { error } = await sb.storage.from('chat').upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (error) {
          errEl.style.color = '';
          st.sending = false; sendBtn.disabled = false;
          return setErr(`Не удалось загрузить «${f.name}». Попробуйте ещё раз.`);
        }
        attachments.push({ path, name: f.name, type: f.type, size: f.size });
      }
      errEl.style.color = ''; setErr('');
      const { data, error } = await sb.from('lesson_messages').insert({
        student_id: o.studentId, lesson_id: o.lessonId, author_id: o.meId, body, attachments,
        reply_to: st.reply ? st.reply.id : null,
      }).select(COLS).single();
      st.sending = false; sendBtn.disabled = false;
      if (error) return setErr('Не удалось отправить сообщение. Попробуйте ещё раз.');
      input.value = ''; autosize(); clearFiles(); st.reply = null; showBar();
      upsert([data]); render(false);
    }

    load();
    subscribe();

    return {
      focus() { input.focus(); },
      destroy() {
        st.alive = false;
        if (st.channel) sb.removeChannel(st.channel);
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVisible);
        clearFiles();
      },
    };
  }

  window.Chat = { mount };
})();
