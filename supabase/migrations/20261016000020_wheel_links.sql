-- Курс «Колесо»: ссылки «Узнать больше» к каждому модулю (общие для всех учеников).
-- Повторный запуск безопасен: ссылка, которая уже есть у модуля, второй раз не добавляется.
insert into public.materials (lesson_id, title, kind, url, sort)
select l.id, v.title, 'link', v.url, v.sort
from (values
  -- Вводное занятие
  (1, 1, 100, 'Игровой старт в мир инженерии — «Техинсайдер»', 'https://www.techinsider.ru/made-in-russia/1681441-injenery-s-detstva-kak-igra-pomogaet-vybrat-professiyu-budushchego/'),
  (1, 1, 101, 'Как развить у ребёнка инженерное мышление — Мел (для родителей)', 'https://mel.fm/blog/molodyye-professionaly/84951-kak-razvit-u-rebenka-inzhenernoye-myshleniye'),
  -- Модуль 1
  (2, 1, 100, 'Пути прогресса: как человек изобрёл колесо — «Вокруг света»', 'https://www.vokrugsveta.ru/articles/puti-progressa-kak-chelovek-izobrel-koleso-id663497'),
  (2, 1, 101, 'Где и когда изобрели колесо: новый ответ учёных — «Вокруг света»', 'https://www.vokrugsveta.ru/articles/gde-i-kogda-izobreli-koleso-uchenye-predlozhili-novyi-otvet-na-etot-izvechnyi-vopros-id5913488/'),
  (2, 1, 102, 'Когда и где появилось первое в мире колесо — Hi-Tech Mail', 'https://hi-tech.mail.ru/news/116448-kogda-i-gde-poyavilos-pervoe-v-mire-koleso-otvet-uchenyh/'),
  -- Модуль 2
  (3, 1, 100, 'Главное — не упасть: почему лёд такой скользкий — «Техинсайдер»', 'https://www.techinsider.ru/editorial/668143-pochemu-led-skolzkiy/'),
  (3, 1, 101, 'Физики нашли ответ, почему лёд скользкий — «Российская газета»', 'https://rg.ru/2019/12/24/led-skolzkij.html'),
  (3, 1, 102, 'Трение качения — Википедия (для тех, кто хочет глубже)', 'https://ru.wikipedia.org/wiki/%D0%A2%D1%80%D0%B5%D0%BD%D0%B8%D0%B5_%D0%BA%D0%B0%D1%87%D0%B5%D0%BD%D0%B8%D1%8F'),
  -- Модуль 3
  (3, 2, 100, 'Аквапланирование: что это и как с ним бороться — «За рулём»', 'https://www.zr.ru/content/articles/909576-akvaplaniovanie-shin-chto-ehto-i'),
  (3, 2, 101, 'Какие шины выбрать: пошире или поуже? — «За рулём»', 'https://www.zr.ru/content/articles/922196-kakie-shiny-vybrat-poshire-ili-pouzhe/'),
  (3, 2, 102, 'Пятно контакта: важен ли его размер? — «За рулём»', 'https://www.zr.ru/content/articles/917652-pyatno-kontakta-chto-ehto-takoe/'),
  -- Модуль 4
  (3, 3, 100, 'Безвоздушные шины Michelin — «За рулём»', 'https://www.zr.ru/content/news/931044-bezvozdushnye-shiny-michelin-d/'),
  (3, 3, 101, 'Советский «Луноход-1»: как его создавали и испытывали — «Вокруг света»', 'https://www.vokrugsveta.ru/vs/article/7253/'),
  (3, 3, 102, 'Мотор-колёса и ядерный климат-контроль: как устроен «Луноход» — Колёса.ру', 'https://www.kolesa.ru/article/motorkolesa-i-jadernyj-klimatkontrol-kak-ustroen-lunohod-2015-04-12'),
  -- Модуль 5
  (4, 1, 100, 'Первые люди над землёй: как братья Райт изобрели самолёт — «Вокруг света»', 'https://www.vokrugsveta.ru/telegraph/technics/506/'),
  (4, 1, 101, 'Всё, что нужно знать о краш-тестах — «За рулём»', 'https://www.zr.ru/content/articles/914518-chto-nuzhno-znat-o-krash-testakh/'),
  -- Модуль 6
  (4, 2, 100, 'Подглядываем за автомобильными дизайнерами — E1.ру', 'https://www.e1.ru/text/auto/2011/12/08/53828731/'),
  (4, 2, 101, 'Костюм цифрового покроя: как машину рисуют на компьютере — «За рулём»', 'https://www.zr.ru/content/articles/5297-kostum_cifrovogo_pokroja/'),
  -- Модуль 7
  (5, 1, 100, 'Удивительное путешествие Берты Бенц — Колёса.ру', 'https://www.kolesa.ru/article/udivitelnoe-puteshestvie-berty-bents-pervyj-avtoprobeg-v-mire'),
  (5, 1, 101, 'Первый автомобиль на конвейере: история Ford T — Autonews', 'https://www.autonews.ru/news/656835ef9a7947f1457a10a6'),
  (5, 1, 102, 'Двигатель внутреннего сгорания простыми словами — Халва Медиа', 'https://media.halvacard.ru/auto/dvigatel-vnutrennego-sgoraniia'),
  (5, 1, 103, 'Как работает двигатель внутреннего сгорания — Авто.ру', 'https://auto.ru/mag/article/howworksice/'),
  -- Модуль 8
  (6, 1, 100, '20 автомобильных эмблем со смыслом — «Вокруг света»', 'https://www.vokrugsveta.ru/article/302965'),
  (6, 1, 101, 'Марки машин с интересной историей и логотипами — Авто.ру', 'https://auto.ru/mag/article/marki-mashin-sinteresnoy-istoriey-ilogotipami/')
) as v(mod_sort, lesson_sort, sort, title, url)
join public.courses c on c.slug = 'wheel'
join public.modules m on m.course_id = c.id and m.sort = v.mod_sort
join public.lessons l on l.module_id = m.id and l.sort = v.lesson_sort
where not exists (
  select 1 from public.materials x where x.lesson_id = l.id and x.user_id is null and x.url = v.url
);
