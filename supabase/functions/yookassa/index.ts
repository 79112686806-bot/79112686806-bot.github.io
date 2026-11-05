// ЮKassa: уведомления об оплате и проверка оплаты после возврата покупателя на сайт.
//
// 1) HTTP-уведомления ЮKassa (payment.succeeded, payment.canceled, refund.succeeded).
//    У уведомлений ЮKassa нет подписи, поэтому им не верим на слово: каждый платёж и возврат
//    заново запрашиваем у ЮKassa по API с нашим секретным ключом и только потом меняем заказ.
// 2) Сайт после возврата с ЮKassa (?pay=<id заказа>) спрашивает {order_id} от имени покупателя —
//    функция сама проверяет платёж в ЮKassa, не дожидаясь уведомления.
//
// Проверку JWT для этой функции нужно ВЫКЛЮЧИТЬ (ЮKassa присылает уведомления без токена Supabase);
// покупателя функция проверяет сама по его токену.
//
// Секреты функции (Edge Functions → Secrets):
//   YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY — ключи магазина (тестового или боевого)
//   SITE_URL, RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO — как у checkout (письмо после оплаты)
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function yk(path: string) {
  const shop = Deno.env.get('YOOKASSA_SHOP_ID'), key = Deno.env.get('YOOKASSA_SECRET_KEY');
  if (!shop || !key) throw new Error('YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не заданы');
  const res = await fetch('https://api.yookassa.ru/v3/' + path, { headers: { Authorization: 'Basic ' + btoa(shop + ':' + key) } });
  if (!res.ok) throw new Error(`ЮKassa ${res.status}: ${await res.text()}`);
  return await res.json();
}

type Order = { id: string; user_id: string; course_id: number; amount: number; status: string; kind: string; items: { lesson_ids?: number[] } | null; provider_payment_id: string | null };

// Платёж из ЮKassa → состояние заказа. Возвращает статус заказа после проверки.
async function syncPayment(paymentId: string): Promise<{ status: string; order?: Order }> {
  const p = await yk('payments/' + encodeURIComponent(paymentId));
  const { data: order } = await admin.from('orders')
    .select('id, user_id, course_id, amount, status, kind, items, provider_payment_id')
    .eq('provider_payment_id', p.id).maybeSingle<Order>();
  if (!order) { console.warn('платёж без заказа', p.id); return { status: 'unknown' }; }
  if (p.metadata?.order_id && p.metadata.order_id !== order.id) { console.error('order_id не совпадает', p.id); return { status: order.status, order }; }

  if (p.status === 'succeeded' && p.paid) {
    // сумма платежа должна совпасть с суммой заказа (считал сервер)
    if (Math.round(Number(p.amount?.value) * 100) !== order.amount * 100 || p.amount?.currency !== 'RUB') {
      console.error('сумма не совпадает', p.id, p.amount, order.amount); return { status: order.status, order };
    }
    if (order.status !== 'pending') return { status: order.status, order };
    // «захватываем» заказ одним обновлением — так письмо уйдёт один раз, даже если уведомление пришло дважды
    const { data: claimed } = await admin.from('orders').update({ paid_at: new Date().toISOString() })
      .eq('id', order.id).eq('status', 'pending').is('paid_at', null).select('id');
    if (!claimed?.length) return { status: 'paid', order };
    const { error } = await admin.rpc('mark_order_paid', { p_order_id: order.id });
    if (error) { await admin.from('orders').update({ paid_at: null }).eq('id', order.id).eq('status', 'pending'); throw error; }
    try { await sendWelcomeEmail(order); } catch (e) { console.error('email', e); }
    return { status: 'paid', order };
  }
  if (p.status === 'canceled') {
    await admin.from('orders').update({ status: 'canceled' }).eq('id', order.id).eq('status', 'pending');
    return { status: order.status === 'pending' ? 'canceled' : order.status, order };
  }
  return { status: order.status, order }; // pending / waiting_for_capture
}

// Возврат: проверяем у ЮKassa и отмечаем заказ. Доступ к курсу админ решает сам (возвраты бывают частичными).
async function syncRefund(refundId: string) {
  const r = await yk('refunds/' + encodeURIComponent(refundId));
  if (r.status !== 'succeeded') return;
  await admin.from('orders').update({ status: 'refunded' }).eq('provider_payment_id', r.payment_id).eq('status', 'paid');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  // 1) уведомление ЮKassa: 200 — принято; 500 — ЮKassa повторит позже
  if (body?.type === 'notification' && body.object?.id) {
    try {
      if (String(body.event).startsWith('refund.')) await syncRefund(String(body.object.id));
      else await syncPayment(String(body.object.id));
      return json({ ok: true });
    } catch (e) { console.error('notification', body.event, e); return json({ error: 'retry' }, 500); }
  }

  // 2) покупатель вернулся на сайт: проверяем свой заказ
  if (typeof body?.order_id === 'string') {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data } = token ? await admin.auth.getUser(token) : { data: null };
    const uid = data?.user?.id;
    if (!uid) return json({ error: 'auth' }, 401);
    const { data: o } = await admin.from('orders').select('status, provider_payment_id, user_id').eq('id', body.order_id).maybeSingle();
    if (!o || o.user_id !== uid) return json({ error: 'not_found' }, 404);
    if (o.status !== 'pending' || !o.provider_payment_id) return json({ status: o.status });
    try { return json({ status: (await syncPayment(o.provider_payment_id)).status }); }
    catch (e) { console.error('check', e); return json({ status: 'pending' }); }
  }
  return json({ error: 'bad_request' }, 400);
});

async function sendWelcomeEmail(o: Order) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.log('RESEND_API_KEY не задан — письмо не отправлено'); return; }
  const [{ data: u }, { data: c }] = await Promise.all([
    admin.auth.admin.getUserById(o.user_id),
    admin.from('courses').select('title').eq('id', o.course_id).single(),
  ]);
  const to = u?.user?.email; if (!to) return;
  const n = (o.items?.lesson_ids ?? []).length;
  const what = o.kind === 'trial' ? 'пробное занятие' : o.kind === 'custom' ? `выбранные модули (${n})` : 'весь курс и набор для исследований';
  const from = Deno.env.get('EMAIL_FROM') ?? 'Инженерный клуб <onboarding@resend.dev>';
  const replyTo = Deno.env.get('EMAIL_REPLY_TO') ?? 'engineeringclub@yandex.com';
  const html = `
<h2>Добро пожаловать в Инженерный клуб!</h2>
<p>Оплата прошла: курс «${escapeHtml(c?.title ?? '')}», ${escapeHtml(what)}. Доступ открыт в личном кабинете.</p>
<p><b>Логин для входа:</b> ${escapeHtml(to)}<br>
<b>Пароль:</b> тот, который вы придумали при оформлении.</p>
<p><a href="${SITE_URL}">Перейти на сайт</a> → «Личный кабинет».</p>
<p>Забыли пароль? В окне входа нажмите «Забыли пароль?» — пришлём ссылку для нового.</p>
<p>Кассовый чек ЮKassa пришлёт на эту же почту отдельным письмом.</p>
<p>Есть вопрос? Просто ответьте на это письмо — мы прочитаем и поможем.</p>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, reply_to: replyTo, subject: 'Доступ к курсу открыт — Инженерный клуб', html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
