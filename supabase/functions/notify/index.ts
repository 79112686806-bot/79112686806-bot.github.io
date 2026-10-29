// Пуш-уведомления администратору о событиях на сайте.
// Вызывает база (триггеры notify_admin, через pg_net): { table, key }. Функция сама перечитывает запись,
// составляет текст и шлёт Web Push на все устройства из push_subscriptions. Текст берётся только из базы,
// поэтому подделать уведомление запросом снаружи нельзя; notify_log не даёт отправить одно событие дважды.
// GET — отдаёт публичный VAPID-ключ (админка подписывает по нему устройство); POST { test: true } с токеном
// администратора — проверочное уведомление на его устройства.
//
// Секреты функции (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — пара ключей Web Push (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT  — контакт отправителя, например mailto:club@engineeringclub.ru
//   SITE_URL       — адрес сайта (ссылки в уведомлениях ведут в админку)
//   VK_GROUP_TOKEN, VK_USER_ID — (необязательно) те же уведомления сообщением ВКонтакте от вашего сообщества;
//                    VK_USER_ID — числовой id страницы администратора (несколько — через запятую)
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// В проекте задеплоена под именем clever-action (адрес — app_config.notify_url и NOTIFY_URL в admin.html), без проверки JWT.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PUB = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
const PRIV = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

// ---- Web Push на Web Crypto (шифрование aes128gcm — RFC 8291, подпись VAPID — RFC 8292), без npm-пакетов ----
const enc = new TextEncoder();
const b64uDec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const b64uEnc = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cat = (...a: Uint8Array[]) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
let vapidKey: CryptoKey | null = null;
async function vapidJwt(aud: string) {
  if (!vapidKey) {
    const p = b64uDec(PUB);
    vapidKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: PRIV, x: b64uEnc(p.slice(1, 33)), y: b64uEnc(p.slice(33, 65)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  const part = (o: unknown) => b64uEnc(enc.encode(JSON.stringify(o)));
  const unsigned = part({ typ: 'JWT', alg: 'ES256' }) + '.' + part({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT });
  return unsigned + '.' + b64uEnc(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKey, enc.encode(unsigned)));
}
async function encryptPayload(p256dh: string, auth: string, text: string) {
  const ua = b64uDec(p256dh), secret = b64uDec(auth);
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(secret, shared, cat(enc.encode('WebPush: info\0'), ua, as), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([as.length]), as, ct);
}
// ---- те же уведомления сообщением ВКонтакте: пишет ваше сообщество (ключ доступа с правом «сообщения») ----
const VK_TOKEN = Deno.env.get('VK_GROUP_TOKEN') ?? '';
const VK_USERS = (Deno.env.get('VK_USER_ID') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
// → сколько человек получили сообщение; ошибки — в failed
async function sendVk(note: Note, failed: string[]) {
  if (!VK_TOKEN || !VK_USERS.length) return 0;
  let ok = 0;
  const text = [note.title, note.body, SITE_URL ? SITE_URL + note.url : ''].filter(Boolean).join('\n');
  await Promise.all(VK_USERS.map(async (user_id) => {
    try {
      const r = await fetch('https://api.vk.com/method/messages.send', {
        method: 'POST',
        body: new URLSearchParams({ access_token: VK_TOKEN, v: '5.199', user_id, random_id: String(crypto.getRandomValues(new Uint32Array(1))[0]), message: text, dont_parse_links: '1' }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.response) ok++; else failed.push(`вк: ${j.error?.error_code ?? r.status} ${j.error?.error_msg ?? ''}`.trim());
    } catch (e) { failed.push('вк: ' + String((e as Error).message ?? e)); }
  }));
  return ok;
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, text: string) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: `vapid t=${await vapidJwt(new URL(sub.endpoint).origin)}, k=${PUB}`, 'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
    body: await encryptPayload(sub.p256dh, sub.auth, text),
  });
  return { status: r.status, text: r.ok ? '' : (await r.text()).slice(0, 200) };
}

type Note = { dedupe: string; title: string; body: string; url: string };
const cut = (s: unknown, n = 140) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const RUB = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

async function studentName(id: string) {
  const { data } = await db.from('profiles').select('student_name,parent_name').eq('id', id).maybeSingle();
  if (data?.student_name || data?.parent_name) return data.student_name || data.parent_name;
  const { data: u } = await db.auth.admin.getUserById(id);
  return u?.user?.email ?? 'Ученик';
}
async function lessonInfo(id: number) {
  const { data } = await db.from('lessons').select('title,modules(course_id)').eq('id', id).maybeSingle();
  return { title: data?.title ?? 'тема', course: (data?.modules as { course_id?: number } | null)?.course_id };
}
async function courseTitle(id: number | null) {
  if (!id) return '';
  const { data } = await db.from('courses').select('title').eq('id', id).maybeSingle();
  return data?.title ?? '';
}

// событие → текст уведомления (null — не уведомлять)
async function compose(table: string, key: Record<string, unknown>): Promise<Note | null> {
  switch (table) {
    case 'lesson_messages': {
      const { data: m } = await db.from('lesson_messages').select('id,student_id,lesson_id,author_id,body,attachments').eq('id', key.id).maybeSingle();
      if (!m || m.author_id !== m.student_id) return null;
      const [name, l] = await Promise.all([studentName(m.student_id), lessonInfo(m.lesson_id)]);
      return { dedupe: `lm:${m.id}`, title: `💬 ${name} · ${l.title}`, body: cut(m.body) || '📎 Вложение', url: `/admin.html#student/${m.student_id}/${l.course ?? ''}/${m.lesson_id}` };
    }
    case 'support_messages': {
      const { data: m } = await db.from('support_messages').select('id,user_id,body,from_admin,support_threads(name,is_guest)').eq('id', key.id).maybeSingle();
      if (!m || m.from_admin) return null;
      const t = m.support_threads as { name?: string; is_guest?: boolean } | null;
      const who = t?.name || (t?.is_guest ? 'Гость сайта' : await studentName(m.user_id));
      return { dedupe: `sm:${m.id}`, title: `❓ Вопрос с сайта · ${who}`, body: cut(m.body), url: `/admin.html#support/${m.user_id}` };
    }
    case 'lesson_progress': {
      const { data: p } = await db.from('lesson_progress').select('user_id,lesson_id,status,submitted_at').eq('user_id', key.user_id).eq('lesson_id', key.lesson_id).maybeSingle();
      if (!p || p.status !== 'submitted') return null;
      const [name, l] = await Promise.all([studentName(p.user_id), lessonInfo(p.lesson_id)]);
      return { dedupe: `lp:${p.user_id}:${p.lesson_id}:${p.submitted_at}`, title: '✅ Тема на проверке', body: `${name} — ${l.title}`, url: `/admin.html#student/${p.user_id}/${l.course ?? ''}/${p.lesson_id}` };
    }
    case 'leads': {
      const { data: r } = await db.from('leads').select('id,parent_name,contact,comment,course_id').eq('id', key.id).maybeSingle();
      if (!r) return null;
      const course = await courseTitle(r.course_id);
      return { dedupe: `ld:${r.id}`, title: '📝 Новая заявка', body: cut([r.parent_name, course, r.contact, r.comment].filter(Boolean).join(' · ')), url: '/admin.html#leads' };
    }
    case 'orders': {
      const { data: o } = await db.from('orders').select('id,user_id,course_id,amount,status').eq('id', key.id).maybeSingle();
      if (!o || o.status !== 'paid') return null;
      const [name, course] = await Promise.all([studentName(o.user_id), courseTitle(o.course_id)]);
      return { dedupe: `or:${o.id}`, title: `💳 Оплата ${RUB(o.amount)}`, body: `${name} · ${course}`, url: `/admin.html#student/${o.user_id}` };
    }
    case 'reviews': {
      const { data: r } = await db.from('reviews').select('id,author_name,text,status').eq('id', key.id).maybeSingle();
      if (!r || r.status !== 'pending') return null;
      return { dedupe: `rv:${r.id}`, title: `⭐ Отзыв на проверке · ${r.author_name}`, body: cut(r.text), url: '/admin.html#reviews' };
    }
    case 'episode_answers': {
      const { data: a } = await db.from('episode_answers').select('id,user_id,run_id,question,answer').eq('id', key.id).maybeSingle();
      if (!a) return null;
      const name = await studentName(a.user_id);   // один пуш на просмотр серии, а не на каждый ответ
      return { dedupe: `ep:${a.run_id}`, title: `🎬 ${name} смотрит мультфильм`, body: cut(`${a.question} — ${a.answer || '(без ответа)'}`), url: '/admin.html#episodes' };
    }
    case 'shop_orders': {
      const { data: o } = await db.from('shop_orders').select('id,user_id,kind,title,price,note').eq('id', key.id).maybeSingle();
      if (!o || o.kind !== 'prize') return null;
      const name = await studentName(o.user_id);
      return { dedupe: `so:${o.id}`, title: `🎁 Приз из лавки · ${name}`, body: cut(`${o.title} (${o.price} ⚙)${o.note ? ' — ' + o.note : ''}`), url: '/admin.html#shop' };
    }
    case 'memo_ideas': {
      const { data: i } = await db.from('memo_ideas').select('id,child_name,age,idea_title').eq('id', key.id).maybeSingle();
      if (!i) return null;
      return { dedupe: `mi:${i.id}`, title: `💡 Идея для карточки: ${cut(i.idea_title, 60)}`, body: `${i.child_name}${i.age ? ', ' + i.age + ' лет' : ''}`, url: '/admin.html#memo' };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') return json({ publicKey: PUB });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: { table?: string; key?: Record<string, unknown>; test?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  let note: Note | null, only: string | null = null;
  if (body.test) {
    // «Проверить» в админке: только для администратора, только на его устройства
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(jwt);
    const { data: p } = u?.user ? await db.from('profiles').select('role').eq('id', u.user.id).maybeSingle() : { data: null };
    if (p?.role !== 'admin') return json({ error: 'forbidden' }, 403);
    only = u!.user!.id;
    note = { dedupe: '', title: '🔔 Проверка уведомлений', body: 'Всё работает — так будут приходить события с сайта.', url: '/admin.html' };
  } else {
    if (!body.table || !body.key) return json({ error: 'bad_request' }, 400);
    note = await compose(body.table, body.key);
    if (!note) return json({ ok: true, skipped: true });
    // одно событие — одно уведомление
    const { error: dup } = await db.from('notify_log').insert({ key: note.dedupe });
    if (dup) return json({ ok: true, duplicate: true });
  }

  const failed: string[] = [];
  const vk = await sendVk(note, failed);

  let q = db.from('push_subscriptions').select('endpoint,p256dh,auth');
  if (only) q = q.eq('user_id', only);
  const { data: subs } = PUB ? await q : { data: [] };
  const payload = JSON.stringify({ title: note.title, body: note.body, url: SITE_URL + note.url, tag: note.dedupe || 'test' });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      const r = await sendPush(s, payload);
      if (r.status < 300) sent++;
      else if (r.status === 404 || r.status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);   // устройство отписалось
      else { failed.push(`${new URL(s.endpoint).host}: ${r.status} ${r.text}`); console.error('push', r.status, r.text); }
    } catch (e) {
      failed.push(String((e as Error).message ?? e)); console.error('push', e);
    }
  }));
  // для проверки из админки — почему не отправилось
  return json({ ok: true, sent, devices: (subs ?? []).length, vk, vkOn: !!(VK_TOKEN && VK_USERS.length), ...(only ? { failed } : {}) });
});
