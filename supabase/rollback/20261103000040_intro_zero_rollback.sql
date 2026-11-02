-- Откат 20261103000040_intro_zero.sql: прежние номера занятий курса «Колесо» (с 1).
update public.modules m set title = v.title
from public.courses c, (values
  (1, 'Занятие 1. Вводное'),
  (2, 'Занятие 2. Колесо'),
  (3, 'Занятие 3. Физика и характеристики колеса'),
  (4, 'Занятие 4. Исследования и работа конструктора'),
  (5, 'Занятия 5–6. Автомобиль'),
  (6, 'Занятия 7–8. Свой проект')
) as v (sort, title)
where c.slug = 'wheel' and m.course_id = c.id and m.sort = v.sort;
