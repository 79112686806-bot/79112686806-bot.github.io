// Страница курса (/kursy/<slug>/): общий шаблон для сборки (готовые HTML-страницы
// для поисковиков) и для сайта (переход на курс без перезагрузки).
(function (root) {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
  };
  const lower = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : '');

  function sortedModules(c) {
    return (c.modules || []).slice().sort((a, b) => a.sort - b.sort)
      .map((m) => ({ ...m, lessons: (m.lessons || []).slice().sort((a, b) => a.sort - b.sort) }));
  }

  // «Занятие 1. Вводное» → ['Занятие 1', 'Вводное']; «Модуль 3. …» → ['Модуль 3', '…']
  const split = (t) => {
    const m = String(t || '').match(/^((?:Заняти[ея]|Модуль|Блок)\s+[\d–-]+)\.\s*(.+)$/);
    return m ? [m[1], m[2]] : ['', String(t || '')];
  };
  const stepIcon = (d) => `<span class="rs-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
  const STEP_ICON = {
    self: stepIcon('<rect x="3" y="4.5" width="18" height="11.5" rx="1.5"/><path d="M1.5 19.5h21"/><path d="M10.5 8.2l4 2.3-4 2.3z"/>'),
    teach: stepIcon('<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M2.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><path d="M13.6 14.9c.9-.6 1.8-.9 2.9-.9 2.3 0 4.1 1.5 4.6 4.5"/>'),
    chat: stepIcon('<path d="M4 5h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 17h-9l-5 3.5V17H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 5z"/><path d="M7.5 11h.01M12 11h.01M16.5 11h.01"/>'),
  };
  // значок чата на странице курса — кнопка «Вопрос нам» (support.js)
  const CHAT_BTN = STEP_ICON.chat.replace('<span class="rs-ico" aria-hidden="true">', `<button type="button" class="rs-ico" onclick="Support.open({from:'страница курса'})" title="Написать нам" aria-label="Задать вопрос в чате">`).replace(/<\/span>$/, '</button>');

  // Краткое содержание модуля: несколько строк — списком, одна — абзацем
  function summaryHtml(t) {
    const lines = String(t || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return '';
    return lines.length > 1
      ? `<ul class="lesson-summary">${lines.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
      : `<p class="lesson-summary">${esc(lines[0])}</p>`;
  }

  // c: {slug, title, subtitle, description, price, status, modules:[{sort,title,lessons:[{sort,title,summary,research_task}]}]}
  // idx: номер курса в каталоге (0…9)
  function coursePageHtml(c, idx) {
    const modules = sortedModules(c);
    const lessons = modules.reduce((n, m) => n + m.lessons.length, 0);
    const research = modules.reduce((n, m) => n + m.lessons.filter((l) => l.research_task).length, 0);
    const rub = (n, d) => Number(n || d).toLocaleString('ru-RU') + ' ₽';
    const available = c.status === 'available';
    const stat = (n, one, few, many) => `<li><b>${n}</b>${plural(n, one, few, many)}</li>`;
    const program = modules.length
      ? '<ul class="fact-stats">' + stat(modules.length, 'блок', 'блока', 'блоков') + stat(lessons, 'модуль', 'модуля', 'модулей') +
        (research ? stat(research, 'исследование', 'исследования', 'исследований') : '') + '</ul>'
      : '<p>Подробная программа курса сейчас готовится.</p>';
    // значки карточек — линии красным мелом, как на чертеже
    const icon = (d) => `<span class="fact-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
    const ICON_FORMAT = '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><path d="M10 8.5l4 1.5-4 1.5z"/>';
    const ICON_PROGRAM = '<path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z"/><path d="M12 6v13.5"/>';
    const ICON_PRICE = '<path d="M3 12.5V4h8.5L20 12.5 12.5 20z"/><circle cx="7.5" cy="8.5" r="1.3"/>';
    return `<nav class="crumbs" aria-label="Навигация"><a href="/" onclick="return go(event,'home')">Главная</a> › <a href="/programmy/" onclick="return go(event,'courses')">Программы</a> › <span>${esc(c.title)}</span></nav>
<div class="eyebrow">Программа ${idx + 1}</div>
<h1 class="course-title">Курс «${esc(c.title)}» — ${esc(lower(c.subtitle))}</h1>
<p class="section-intro">${esc(c.description)} Онлайн-курс для школьников 9–14 лет: самостоятельные видеоуроки и исследования, встречи с преподавателем и собственный инженерный проект.</p>
<div class="features how-steps course-facts">
  <div class="feature">${icon(ICON_FORMAT)}<strong>Формат</strong><p class="fact-lead">Онлайн, через личный кабинет:</p>
    <ul class="fact-list"><li>самостоятельные видеоуроки и задания</li><li>встречи с преподавателем на ключевых этапах</li><li>чат по каждому модулю</li></ul></div>
  <div class="feature">${icon(ICON_PROGRAM)}<strong>Программа</strong>${program}
    <p class="fact-note">Каждое занятие — одна онлайн-встреча с преподавателем продолжительностью <b>1 час</b>.</p>
    <p class="fact-small">Хотите больше встреч? Напишите нам — согласуем дополнительные занятия под вашего ребёнка.</p></div>
  <div class="feature">${icon(ICON_PRICE)}<strong>Стоимость</strong>
    <ul class="fact-prices">
      <li><span>Пробное занятие</span><b>${rub(c.price_trial, 1500)}</b><s>${rub(c.price_trial_base, 3000)}</s></li>
      <li><span>Модуль</span><b>${rub(c.price_lesson, 4500)}</b><small>блок — по цене его модулей</small></li>
      <li class="fact-best"><span>Весь курс + набор для исследований</span><b>${rub(c.price, 29750)}</b><small>уже оплаченное вычитается</small></li>
    </ul></div>
</div>
${available
    ? `<div class="bottom"><button class="btn primary" onclick="selectedCourse=${idx};goSignup()">Записаться на курс</button></div>`
    : '<p class="note">Курс в разработке — запись откроется позже.</p>'}
<h2>Программа курса «${esc(c.title)}»</h2>
${modules.length
    ? `<ol class="course-road">${modules.map((m, i) => {
      const [kind, name] = split(m.title);
      return `<li class="road-stop"><span class="road-mark" aria-hidden="true">${i + 1}</span><div class="road-body">${kind ? `<span class="road-kind">${esc(kind)}</span>` : ''}<h3>${esc(name)}</h3>
<ul class="road-mods">${m.lessons.map((l) => {
        const [badge, title] = split(l.title);
        return `<li class="road-mod">${badge ? `<span class="road-badge">${esc(badge)}</span>` : ''}<b>${esc(title)}</b>${summaryHtml(l.summary)}${l.research_task ? `<span class="road-lab"><i>исследование</i>${esc(l.research_task)}</span>` : ''}</li>`;
      }).join('')}</ul></div></li>`;
    }).join('\n')}
<li class="road-stop road-finish"><span class="road-mark" aria-hidden="true">✦</span><div class="road-body"><span class="road-kind">финиш</span><h3>Свой инженерный проект</h3></div></li></ol>`
    : '<p>Подробная программа появится здесь в ближайшее время.</p>'}
<h2>Как проходят занятия</h2>
<p>Курс устроен как маршрут:</p>
<ol class="road-steps">
  <li>${STEP_ICON.self}<b>Самостоятельно</b><small>видеоуроки, материалы и задания открываются модуль за модулем</small></li>
  <li>${STEP_ICON.teach}<b>С преподавателем</b><small>онлайн-встречи, чтобы обсудить изученное и поработать над собственным проектом</small></li>
  <li>${CHAT_BTN}<b>Всегда на связи</b><small>на протяжении всего курса мы на связи в чате · <button type="button" class="chat-link" onclick="Support.open({from:'страница курса'})">Задать вопрос →</button></small></li>
</ol>
<p class="road-more"><a href="/kak-prohodyat-zanyatiya/" onclick="return go(event,'how')">Подробнее о формате занятий →</a></p>`;
  }

  root.coursePageHtml = coursePageHtml;
  root.coursePageStats = (c) => {
    const modules = sortedModules(c);
    return { modules: modules.length, lessons: modules.reduce((n, m) => n + m.lessons.length, 0) };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { coursePageHtml, coursePageStats: root.coursePageStats };
})(typeof window !== 'undefined' ? window : globalThis);
