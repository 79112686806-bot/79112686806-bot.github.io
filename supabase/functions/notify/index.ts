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
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
// В проекте задеплоена под именем clever-action (адрес — app_config.notify_url и NOTIFY_URL в admin.html), без проверки JWT.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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
if (PUB) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', PUB, Deno.env.get('VAPID_PRIVATE_KEY')!);

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
  if (!PUB) return json({ error: 'no_vapid' }, 500);

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

  let q = db.from('push_subscriptions').select('endpoint,p256dh,auth');
  if (only) q = q.eq('user_id', only);
  const { data: subs } = await q;
  const payload = JSON.stringify({ title: note.title, body: note.body, url: SITE_URL + note.url, tag: note.dedupe || 'test' });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);   // устройство отписалось
      else console.error('push', code, (e as Error).message);
    }
  }));
  return json({ ok: true, sent });
});
