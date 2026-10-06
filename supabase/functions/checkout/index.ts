// Оформление покупки курса.
// Новый покупатель: создаём аккаунт с паролем, который он придумал на сайте.
// Уже вошедший пользователь: покупка идёт на его аккаунт.
// Затем создаём заказ. В демо-режиме (DEMO_PAYMENTS=true) заказ сразу считается
// оплаченным: курс открывается и уходит итоговое письмо с логином (без пароля).
//
// Секреты функции (Edge Functions → Secrets):
//   DEMO_PAYMENTS  — 'true', пока не подключена ЮKassa. ПЕРЕД ЗАПУСКОМ ВЫКЛЮЧИТЬ.
//   SITE_URL       — адрес сайта для ссылки в письме
//   RESEND_API_KEY — ключ Resend; без него письмо не отправляется
//   EMAIL_FROM     — отправитель, например «Инженерный клуб <hello@ваш-домен>»
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, message: string, status = 400) => json({ error, message }, status);

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DEMO = Deno.env.get('DEMO_PAYMENTS') === 'true';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';

const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('method', 'Метод не поддерживается', 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('bad_request', 'Неверный запрос');
  }

  // Оплата возможна только после принятия оферты и согласия на обработку персональных данных
  if (body.offer_accepted !== true) {
    return fail('offer_required', 'Чтобы продолжить, примите условия оферты и дайте согласие на обработку персональных данных');
  }

  const parentName = clean(body.parent_name);
  const contact = clean(body.contact);

  const { data: course } = await admin
    .from('courses')
    .select('id, title, price, status')
    .eq('slug', clean(body.course_slug, 50))
    .maybeSingle();
  if (!course || course.status !== 'available') {
    return fail('course_unavailable', 'Этот курс пока недоступен для покупки');
  }

  // Что покупают: пробное занятие, блоки и темы или весь курс. Сумму считает база (quote_order),
  // цену из браузера не берём.
  const kind = body.kind === 'trial' || body.kind === 'custom' ? body.kind : 'full';
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200) : []);
  const moduleIds = kind === 'custom' ? ids(body.module_ids) : [];
  const lessonIds = kind === 'custom' ? ids(body.lesson_ids) : [];
  const quote = async (uid: string | null) => {
    const { data, error } = await admin.rpc('quote_order', {
      p_user_id: uid, p_course_id: course.id, p_kind: kind, p_module_ids: moduleIds, p_lesson_ids: lessonIds,
    });
    if (error) {
      console.error('quote_order', error);
      return { error: 'server' } as { amount?: number; lesson_ids?: number[] | null; error: string | null };
    }
    return (data && data[0]) || { error: 'server' };
  };
  const QUOTE_ERRORS: Record<string, [string, number]> = {
    already_full: ['Этот курс уже полностью открыт в вашем личном кабинете', 409],
    trial_used: ['Пробное занятие доступно только при первой покупке курса', 409],
    module_partially_owned: ['Часть тем этого блока у вас уже куплена — выберите оставшиеся темы по отдельности', 409],
    nothing_selected: ['Выберите блоки или темы', 400],
    bad_module: ['Блок не найден — обновите страницу', 400],
    no_lessons: ['В курсе пока нет тем', 400],
    course_unavailable: ['Этот курс пока недоступен для покупки', 400],
  };
  const quoteFail = (code: string) => {
    const [message, status] = QUOTE_ERRORS[code] ?? ['Не удалось рассчитать стоимость', 500];
    return fail(code, message, status);
  };

  // Кто покупает: вошедший пользователь или новый аккаунт
  let userId: string | null = null;
  let email = '';
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data?.user) {
      userId = data.user.id;
      email = data.user.email ?? '';
    }
  }

  if (!userId) {
    email = clean(body.email, 254).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return fail('bad_email', 'Проверьте email');
    if (password.length < 8 || password.length > 72) {
      return fail('weak_password', 'Пароль должен быть от 8 до 72 символов');
    }
    // проверяем выбор до создания аккаунта, чтобы не создавать его зря
    const pre = await quote(null);
    if (pre.error) return quoteFail(pre.error);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { parent_name: parentName, contact },
    });
    if (error) {
      if (error.code === 'email_exists' || /already/i.test(error.message)) {
        return fail('already_registered', 'Аккаунт с этим email уже есть — войдите, чтобы продолжить', 409);
      }
      if (error.code === 'weak_password') return fail('weak_password', 'Пароль слишком простой — придумайте посложнее');
      console.error('createUser', error);
      return fail('server', 'Не удалось создать аккаунт', 500);
    }
    userId = data.user.id;
  }

  const q = await quote(userId);
  if (q.error) return quoteFail(q.error);

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      user_id: userId, course_id: course.id, amount: q.amount ?? 0, provider: DEMO ? 'demo' : 'yookassa',
      kind, items: { module_ids: moduleIds, lesson_ids: q.lesson_ids ?? [] },
      offer_accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (orderError) {
    console.error('order', orderError);
    return fail('server', 'Не удалось создать заказ', 500);
  }

  // Здесь позже: создание платежа в ЮKassa и возврат ссылки на оплату
  if (!DEMO) return fail('payments_disabled', 'Оплата пока не подключена', 503);

  const { error: paidError } = await admin.rpc('mark_order_paid', { p_order_id: order.id });
  if (paidError) {
    console.error('mark_order_paid', paidError);
    return fail('server', 'Не удалось открыть курс', 500);
  }

  try {
    const what = kind === 'trial' ? 'пробное занятие' : kind === 'custom' ? `выбранные темы (${(q.lesson_ids ?? []).length})` : 'весь курс';
    await sendWelcomeEmail(email, course.title, what);
  } catch (e) {
    console.error('email', e); // курс уже открыт — ошибку письма покупателю не показываем
  }
  return json({ ok: true, demo: true });
});

async function sendWelcomeEmail(to: string, courseTitle: string, what: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.log('RESEND_API_KEY не задан — письмо не отправлено');
    return;
  }
  const from = Deno.env.get('EMAIL_FROM') ?? 'Инженерный клуб <onboarding@resend.dev>';
  const html = `
<h2>Добро пожаловать в Инженерный клуб!</h2>
<p>Оплата прошла: курс «${escapeHtml(courseTitle)}», ${escapeHtml(what)}. Доступ открыт в личном кабинете.</p>
<p><b>Логин для входа:</b> ${escapeHtml(to)}<br>
<b>Пароль:</b> тот, который вы придумали при оформлении.</p>
<p><a href="${SITE_URL}">Перейти на сайт</a> → «Личный кабинет».</p>
<p>Забыли пароль? В окне входа нажмите «Забыли пароль?» — пришлём ссылку для нового.</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: 'Доступ к курсу открыт — Инженерный клуб', html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
