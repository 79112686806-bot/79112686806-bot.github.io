// ЮKassa: уведомления об оплате, проверка оплаты после возврата на сайт и оплата счетов, выставленных вручную.
//
// 1) HTTP-уведомления ЮKassa (payment.succeeded, payment.canceled, refund.succeeded).
//    У уведомлений ЮKassa нет подписи, поэтому им не верим на слово: каждый платёж и возврат
//    заново запрашиваем у ЮKassa по API с нашим секретным ключом и только потом меняем заказ.
// 2) {order_id} — сайт после возврата с ЮKassa (?pay=<id заказа>) узнаёт, чем закончилась оплата;
//    функция сама проверяет платёж в ЮKassa, не дожидаясь уведомления. Отвечает только статусом.
// 3) {invoice, action: 'get' | 'pay'} — счёт из админки (ссылка /?invoice=<id>): показать сумму и назначение,
//    оплатить. Аккаунт берётся по почте из счёта (нет — создаётся, пароль человек придумает по ссылке из письма).
//
// Проверку JWT для этой функции нужно ВЫКЛЮЧИТЬ (ЮKassa присылает уведомления без токена Supabase).
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function ykAuth() {
  const shop = Deno.env.get('YOOKASSA_SHOP_ID'), key = Deno.env.get('YOOKASSA_SECRET_KEY');
  if (!shop || !key) throw new Error('YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не заданы');
  return 'Basic ' + btoa(shop + ':' + key);
}
async function yk(path: string) {
  const res = await fetch('https://api.yookassa.ru/v3/' + path, { headers: { Authorization: ykAuth() } });
  if (!res.ok) throw new Error(`ЮKassa ${res.status}: ${await res.text()}`);
  return await res.json();
}

type Order = { id: string; user_id: string; course_id: number; amount: number; status: string; kind: string; items: { lesson_ids?: number[] } | null; provider_payment_id: string | null; invoice_id: string | null };

// Платёж из ЮKassa → состояние заказа. Возвращает статус заказа после проверки.
async function syncPayment(paymentId: string): Promise<{ status: string; order?: Order }> {
  const p = await yk('payments/' + encodeURIComponent(paymentId));
  const { data: order } = await admin.from('orders')
    .select('id, user_id, course_id, amount, status, kind, items, provider_payment_id, invoice_id')
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
    if (order.invoice_id) {
      await admin.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString(), order_id: order.id }).eq('id', order.invoice_id);
    }
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

// ---------- Счёт из админки ----------
const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, d) => a + '•'.repeat(Math.min(6, Math.max(2, b.length))) + d);
const QUOTE_ERRORS: Record<string, string> = {
  already_full: 'Этот курс уже полностью открыт в личном кабинете — оплачивать не нужно',
  trial_used: 'Пробное занятие уже было — напишите нам, мы пришлём новый счёт',
  module_partially_owned: 'Часть модулей уже куплена — напишите нам, мы пришлём новый счёт',
};

async function invoiceGet(id: string) {
  const { data: inv } = await admin.from('invoices').select('title, amount, status, email, courses(title)').eq('id', id).maybeSingle();
  if (!inv) return json({ error: 'not_found', message: 'Счёт не найден — проверьте ссылку' }, 404);
  return json({ status: inv.status, title: inv.title, amount: inv.amount, email: maskEmail(inv.email), course: (inv as any).courses?.title ?? '' });
}

async function invoicePay(id: string, offerAccepted: boolean) {
  if (!offerAccepted) return json({ error: 'offer_required', message: 'Чтобы продолжить, примите условия оферты и дайте согласие на обработку персональных данных' }, 400);
  const { data: inv } = await admin.from('invoices').select('*').eq('id', id).maybeSingle();
  if (!inv) return json({ error: 'not_found', message: 'Счёт не найден — проверьте ссылку' }, 404);
  if (inv.status === 'paid') return json({ error: 'paid', message: 'Этот счёт уже оплачен' }, 409);
  if (inv.status !== 'open') return json({ error: 'canceled', message: 'Этот счёт отменён — напишите нам' }, 409);

  // уже есть неоплаченный платёж по этому счёту — открываем его же (чтобы не оплатить дважды)
  const { data: prev } = await admin.from('orders').select('id, provider_payment_id').eq('invoice_id', inv.id).eq('status', 'pending')
    .not('provider_payment_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (prev) {
    try {
      const p = await yk('payments/' + encodeURIComponent(prev.provider_payment_id));
      if (p.status === 'pending' && p.confirmation?.confirmation_url) return json({ ok: true, confirmation_url: p.confirmation.confirmation_url });
      if (p.status === 'succeeded') { await syncPayment(p.id); return json({ error: 'paid', message: 'Этот счёт уже оплачен' }, 409); }
      if (p.status === 'canceled') await syncPayment(p.id);
    } catch (e) { console.error('prev payment', e); }
  }

  // аккаунт по почте из счёта: есть — оплата на него, нет — создаём (без пароля: ссылка «придумать пароль» придёт в письме)
  let { data: userId } = await admin.rpc('user_id_by_email', { p_email: inv.email });
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email: inv.email, email_confirm: true, user_metadata: { parent_name: inv.name ?? '' } });
    if (error) { console.error('createUser', error); return json({ error: 'server', message: 'Не удалось подготовить оплату — напишите нам' }, 500); }
    userId = data.user.id;
  }

  // какие модули откроются — считает база (как при обычной покупке); цена — из счёта
  const items = inv.items ?? {};
  const { data: qd, error: qe } = await admin.rpc('quote_order', {
    p_user_id: userId, p_course_id: inv.course_id, p_kind: inv.kind,
    p_module_ids: inv.kind === 'custom' ? items.module_ids ?? [] : [], p_lesson_ids: inv.kind === 'custom' ? items.lesson_ids ?? [] : [],
  });
  const q = (qd && qd[0]) || { error: qe ? 'server' : 'server' };
  if (q.error) return json({ error: q.error, message: QUOTE_ERRORS[q.error] ?? 'Не удалось подготовить оплату — напишите нам' }, 409);

  const { data: order, error: oe } = await admin.from('orders').insert({
    user_id: userId, course_id: inv.course_id, amount: inv.amount, provider: 'yookassa', kind: inv.kind,
    items: { module_ids: items.module_ids ?? [], lesson_ids: q.lesson_ids ?? [] }, invoice_id: inv.id,
    offer_accepted_at: new Date().toISOString(),
  }).select('id').single();
  if (oe) { console.error('order', oe); return json({ error: 'server', message: 'Не удалось создать заказ — напишите нам' }, 500); }

  const value = Number(inv.amount).toFixed(2), desc = String(inv.title).slice(0, 128);
  let auth: string;
  try { auth = ykAuth(); } catch (e) { console.error(e); return json({ error: 'payments_disabled', message: 'Оплата временно недоступна — напишите нам' }, 503); }
  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: { Authorization: auth, 'Idempotence-Key': order.id, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { value, currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: `${SITE_URL}/?pay=${order.id}` },
      description: desc,
      metadata: { order_id: order.id, invoice_id: inv.id },
      receipt: {
        customer: { email: inv.email },
        tax_system_code: 3, // УСН «доходы минус расходы»
        items: [{ description: desc, quantity: '1.00', amount: { value, currency: 'RUB' }, vat_code: 1, payment_mode: 'full_payment', payment_subject: 'service' }],
      },
    }),
  });
  const p = await res.json().catch(() => ({}));
  if (!res.ok || !p.confirmation?.confirmation_url) {
    console.error('yookassa create (invoice)', res.status, p);
    await admin.from('orders').update({ status: 'canceled' }).eq('id', order.id);
    return json({ error: 'payment_create', message: 'Не удалось перейти к оплате. Попробуйте ещё раз или напишите нам' }, 502);
  }
  await admin.from('orders').update({ provider_payment_id: p.id }).eq('id', order.id);
  return json({ ok: true, confirmation_url: p.confirmation.confirmation_url });
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

  // 2) покупатель вернулся на сайт: только статус заказа (id заказа знает лишь сам покупатель)
  if (typeof body?.order_id === 'string' && UUID.test(body.order_id)) {
    const { data: o } = await admin.from('orders').select('status, provider_payment_id').eq('id', body.order_id).maybeSingle();
    if (!o) return json({ error: 'not_found' }, 404);
    if (o.status !== 'pending' || !o.provider_payment_id) return json({ status: o.status });
    try { return json({ status: (await syncPayment(o.provider_payment_id)).status }); }
    catch (e) { console.error('check', e); return json({ status: 'pending' }); }
  }

  // 3) счёт из админки
  if (typeof body?.invoice === 'string' && UUID.test(body.invoice)) {
    try {
      if (body.action === 'pay') return await invoicePay(body.invoice, body.offer_accepted === true);
      return await invoiceGet(body.invoice);
    } catch (e) { console.error('invoice', e); return json({ error: 'server', message: 'Что-то пошло не так — напишите нам' }, 500); }
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
  // аккаунт создан по счёту и ещё ни разу не входили — даём ссылку, чтобы придумать пароль
  let pass = '<b>Пароль:</b> тот, который вы придумали при оформлении.';
  if (!u.user.last_sign_in_at) {
    const { data: l, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: to, options: { redirectTo: SITE_URL } });
    if (!error && l?.properties?.action_link) pass = `<b>Пароль:</b> <a href="${l.properties.action_link}">придумайте его по этой ссылке</a> (ссылка действует ограниченное время — если устареет, нажмите «Забыли пароль?» в окне входа).`;
  }
  const n = (o.items?.lesson_ids ?? []).length;
  const what = o.kind === 'trial' ? 'пробное занятие' : o.kind === 'custom' ? `выбранные модули (${n})` : 'весь курс и набор для исследований';
  const from = Deno.env.get('EMAIL_FROM') ?? 'Инженерный клуб <onboarding@resend.dev>';
  const replyTo = Deno.env.get('EMAIL_REPLY_TO') ?? 'engineeringclub@yandex.com';
  const html = `
<h2>Добро пожаловать в Инженерный клуб!</h2>
<p>Оплата прошла: курс «${escapeHtml(c?.title ?? '')}», ${escapeHtml(what)}. Доступ открыт в личном кабинете.</p>
<p><b>Логин для входа:</b> ${escapeHtml(to)}<br>
${pass}</p>
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
