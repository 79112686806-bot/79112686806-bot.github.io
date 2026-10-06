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

  // c: {slug, title, subtitle, description, price, status, modules:[{sort,title,lessons:[{sort,title,research_task}]}]}
  // idx: номер курса в каталоге (0…9)
  function coursePageHtml(c, idx) {
    const modules = sortedModules(c);
    const lessons = modules.reduce((n, m) => n + m.lessons.length, 0);
    const research = modules.reduce((n, m) => n + m.lessons.filter((l) => l.research_task).length, 0);
    const rub = (n, d) => Number(n || d).toLocaleString('ru-RU') + ' ₽';
    const available = c.status === 'available';
    const program = modules.length
      ? `${modules.length} ${plural(modules.length, 'модуль', 'модуля', 'модулей')}, ${lessons} ${plural(lessons, 'тема', 'темы', 'тем')}` +
        (research ? `, ${research} ${plural(research, 'исследование', 'исследования', 'исследований')}` : '') + '.'
      : 'Подробная программа курса сейчас готовится.';
    return `<nav class="crumbs" aria-label="Навигация"><a href="/" onclick="return go(event,'home')">Главная</a> › <a href="/programmy/" onclick="return go(event,'courses')">Программы</a> › <span>${esc(c.title)}</span></nav>
<div class="eyebrow">Программа ${idx + 1}</div>
<h1 class="course-title">Курс «${esc(c.title)}» — ${esc(lower(c.subtitle))}</h1>
<p class="section-intro">${esc(c.description)} Онлайн-курс для школьников 9–14 лет: самостоятельные видеоуроки и исследования, встречи с преподавателем и собственный инженерный проект.</p>
<div class="features how-steps">
  <div class="feature"><strong>Формат</strong><p>Онлайн, через личный кабинет: самостоятельные видеоуроки и задания, встречи с преподавателем на ключевых этапах и чат по каждой теме.</p></div>
  <div class="feature"><strong>Программа</strong><p>${program}</p></div>
  <div class="feature"><strong>Стоимость</strong><p>Пробное занятие — ${rub(c.price_trial, 1250)} вместо ${rub(c.price_trial_base, 2500)}. Блок курса — ${rub(c.price_block, 10000)}, отдельная тема — ${rub(c.price_lesson, 3500)}. Весь курс — ${rub(c.price, 37500)}.</p></div>
</div>
${available
    ? `<div class="bottom"><button class="btn primary" onclick="selectedCourse=${idx};goSignup()">Записаться на курс</button></div>`
    : '<p class="note">Курс в разработке — запись откроется позже.</p>'}
<h2>Программа курса «${esc(c.title)}»</h2>
${modules.length
    ? modules.map((m) => `<h3>${esc(m.title)}</h3><ul class="course-lessons">${m.lessons.map((l) => `<li>${esc(l.title)}${l.research_task ? `<small>🔬 Исследование: ${esc(l.research_task)}</small>` : ''}</li>`).join('')}</ul>`).join('\n')
    : '<p>Подробная программа появится здесь в ближайшее время.</p>'}
<h2>Как проходят занятия</h2>
<p>Курс устроен как маршрут: часть тем школьник проходит самостоятельно — видеоуроки, материалы и задания открываются модуль за модулем, а на ключевых этапах встречается с преподавателем онлайн, чтобы обсудить изученное и поработать над собственным проектом. На протяжении всего курса мы на связи в чате. <a href="/kak-prohodyat-zanyatiya/" onclick="return go(event,'how')">Подробнее о формате занятий</a></p>`;
  }

  root.coursePageHtml = coursePageHtml;
  root.coursePageStats = (c) => {
    const modules = sortedModules(c);
    return { modules: modules.length, lessons: modules.reduce((n, m) => n + m.lessons.length, 0) };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { coursePageHtml, coursePageStats: root.coursePageStats };
})(typeof window !== 'undefined' ? window : globalThis);
