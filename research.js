// Таблицы исследований: шаблон темы (lessons.research_plan) + данные ученика (research_answers.data).
// Общий модуль для кабинета (ввод) и админ-панели (просмотр).
// Шаблон: { tables: [{ title, unit, rows: ['Вариант', …], cols: ['Заезд 1', … | { n, text: true }], avg, addRows }] }
// Данные: { tables: [{ rows: [[ячейки строки], …], extra: [{ name, cells: […] }] }] }
(function (root) {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const col = (c) => (typeof c === 'string' ? { n: c } : c);
  const num = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(x) ? x : null; };

  // Среднее по числовым столбцам строки
  function average(t, cells) {
    const vals = t.cols.map(col).map((c, i) => (c.text ? null : num(cells[i]))).filter((x) => x !== null);
    if (!vals.length) return '';
    const a = vals.reduce((s, x) => s + x, 0) / vals.length;
    return String(Math.round(a * 10) / 10).replace('.', ',');
  }

  // Строки таблицы: заданные шаблоном + свои варианты ученика
  const rowsOf = (t, d) => [
    ...t.rows.map((name, r) => ({ name, cells: (d.rows && d.rows[r]) || [], fixed: true })),
    ...(d.extra || []).map((x) => ({ name: x.name || '', cells: x.cells || [], fixed: false })),
  ];
  const title = (t) => `<h5>${esc(t.title)}${t.unit ? ` <small>(${esc(t.unit)})</small>` : ''}</h5>`;
  const head = (t) => `<thead><tr><th>Вариант</th>${t.cols.map((c) => `<th>${esc(col(c).n)}</th>`).join('')}${t.avg ? '<th>Среднее</th>' : ''}</tr></thead>`;
  const wrapTable = (t, attrs, body, after = '') => `<div class="rtable"${attrs}>${title(t)}<div class="rt-scroll"><table>${head(t)}<tbody>${body}</tbody></table></div>${after}</div>`;

  // Строка для ввода; у своего варианта (fixed=false) название тоже вводится
  const editRow = (t, row) => `<tr data-fixed="${row.fixed ? 1 : 0}">` +
    `<th>${row.fixed ? esc(row.name) : `<input class="rt-name" value="${esc(row.name)}" placeholder="Свой вариант" maxlength="60">`}</th>` +
    t.cols.map((c, ci) => `<td><input class="rt-cell" data-c="${ci}" value="${esc(row.cells[ci] ?? '')}" maxlength="${col(c).text ? 60 : 12}"${col(c).text ? '' : ' inputmode="decimal"'}></td>`).join('') +
    (t.avg ? `<td class="rt-avg">${esc(average(t, row.cells))}</td>` : '') + '</tr>';

  // Таблицы для ввода (кабинет ученика)
  function editHtml(plan, data) {
    if (!plan || !plan.tables) return '';
    return plan.tables.map((t, ti) => {
      const d = (data && data.tables && data.tables[ti]) || {};
      return wrapTable(t, ` data-t="${ti}"`, rowsOf(t, d).map((row) => editRow(t, row)).join(''),
        t.addRows ? '<button type="button" class="rt-add">+ строка</button>' : '');
    }).join('');
  }

  // Ввод: пересчёт среднего, «+ строка», onChange — для автосохранения
  function bind(box, plan, onChange) {
    box.addEventListener('input', (e) => {
      const tr = e.target.closest('.rtable tr');
      if (!tr) return;
      const t = plan.tables[+tr.closest('.rtable').dataset.t];
      const avg = tr.querySelector('.rt-avg');
      if (avg) avg.textContent = average(t, [...tr.querySelectorAll('.rt-cell')].map((i) => i.value));
      onChange();
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.rt-add');
      if (!b) return;
      const wrap = b.closest('.rtable'), t = plan.tables[+wrap.dataset.t];
      wrap.querySelector('tbody').insertAdjacentHTML('beforeend', editRow(t, { name: '', cells: [], fixed: false }));
      wrap.querySelector('tbody tr:last-child input').focus();
    });
  }

  // Введённое → объект данных
  function collect(box, plan) {
    return {
      tables: plan.tables.map((t, ti) => {
        const out = { rows: [], extra: [] };
        const wrap = box.querySelector(`.rtable[data-t="${ti}"]`);
        if (!wrap) return out;
        wrap.querySelectorAll('tbody tr').forEach((tr) => {
          const cells = [...tr.querySelectorAll('.rt-cell')].map((i) => i.value.trim());
          if (tr.dataset.fixed === '1') { out.rows.push(cells); return; }
          const name = tr.querySelector('.rt-name').value.trim();
          if (name || cells.some(Boolean)) out.extra.push({ name, cells });
        });
        return out;
      }),
    };
  }

  // Только просмотр (админ-панель)
  function viewHtml(plan, data) {
    if (!plan || !plan.tables) return '';
    return plan.tables.map((t, ti) => {
      const d = (data && data.tables && data.tables[ti]) || {};
      return wrapTable(t, '', rowsOf(t, d).map((row) =>
        `<tr><th>${esc(row.name) || '—'}</th>${t.cols.map((c, ci) => `<td>${esc(row.cells[ci] ?? '')}</td>`).join('')}${t.avg ? `<td class="rt-avg">${esc(average(t, row.cells))}</td>` : ''}</tr>`).join(''));
    }).join('');
  }

  const filled = (data) => !!(data && data.tables && data.tables.some((t) => (t.rows || []).some((r) => r.some(Boolean)) || (t.extra || []).length));

  root.Research = { editHtml, bind, collect, viewHtml, average, filled };
})(typeof window !== 'undefined' ? window : globalThis);
