// Интерактивные мультфильмы («серии») в личном кабинете.
// Серия — набор роликов-узлов в закрытом бакете episodes (<серия>/<узел>.mp4) и граф переходов ниже:
// после узла с вопросом крутится петля ожидания (<узел>-wait), ребёнок отвечает голосом
// (Web Speech API) или кнопками/полем, и по ответу выбирается следующий узел.
// Управление как в обычном видеоплеере: панель поверх кадра (прячется, пока смотришь), полоса перемотки с подсказкой
// времени, ±10 с, громкость, полный экран, клавиши (пробел/K, ←/→, J/L, M, F), двойное касание по краю — ±10 с.
// Перематывать можно вперёд и назад, как в обычном плеере; вперёд — до ближайшего вопроса без ответа (вопросы не пропускаются).
// При повторе уже данные ответы не спрашиваются заново. Место просмотра запоминается на устройстве — потом можно продолжить.
// Обращения по имени — отдельные короткие записи (<серия>/names/<имя>-hi.mp3 …), плеер включает их поверх ролика
// (если имя длиннее места в ролике, кадр ждёт, пока оно прозвучит).
// Episode.mount(el, { id, sb, onMeet, onAnswer }) → { pause, resume, destroy }; onMeet — кнопка «Встреча с преподавателем»,
// onAnswer({ run, node, question, answer, heard, via, tag }) — ответ на вопрос серии (run — один просмотр,
// via: voice | text | button | mixed | skip | timeout, heard — что дословно распознал микрофон, tag — следующий узел).
// Если onAnswer вернёт обещание с { deltas } (очки героя), плеер покажет их поверх кадра (Hero.pop из hero.js).
// Серия 1 описана здесь; остальные — в episodes/<серия>.js (Episode.define), плеер подгружает файл, когда серию открывают.
// nameFrom: 'ep1' — имя ребёнка берётся из его ответа в серии 1; names: 'ep1' — записи обращений по имени из серии 1.
(function () {
  const has = (t, ...w) => w.some((x) => t.includes(x));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').trim();
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const slug = (s) => [...s.toLowerCase()].map((c) => TR[c] ?? c).join('');
  const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };

  // имена, для которых записано обращение («Очень приятно, Маша!», «До встречи, Маша!»)
  const NAMES = 'Александр Саша Максим Михаил Миша Артём Иван Ваня Даниил Даня Дмитрий Дима Кирилл Андрей Егор Никита Илья Алексей Лёша Матвей Тимофей Тима Роман Рома Владимир Вова Ярослав Слава Фёдор Федя Георгий Гоша Константин Костя Лев Лёва Николай Коля Степан Стёпа Марк Павел Паша Владислав Влад Арсений Сеня Богдан Глеб Денис Сергей Серёжа Евгений Женя Семён Тимур Савелий Платон Демид Мирон Елисей Захар Леонид Олег Вадим Антон Василий Вася Григорий Гриша Пётр Петя Всеволод Сева Давид Святослав Эмиль Артур Руслан Игорь Ростислав Виктор Витя Вячеслав Амир Ян Адам Анастасия Настя Мария Маша Анна Аня Виктория Вика Полина Елизавета Лиза Екатерина Катя Дарья Даша Софья София Соня Александра Варвара Варя Ксения Ксюша Алиса Вероника Ева Арина Алёна Валерия Лера Милана Ульяна Кира Василиса Таисия Злата Маргарита Рита Ольга Оля Татьяна Таня Юлия Юля Ирина Ира Елена Лена Наталья Наташа Светлана Света Кристина Диана Есения Мирослава Мира Агата Амелия Николь Яна Эвелина Камила Стефания Ангелина Надежда Надя Вера Олеся Алина Мила Майя Лилия Лиля Евгения Ника Марина Карина Влада Аделина Эмилия Ксеня';
  const NAME_MAP = Object.fromEntries(NAMES.split(' ').map((n) => [norm(n), n]));

  // ---------- Сценарии серий ----------
  // ask: вопрос после ролика; kind: name | choice | free | ideas | any | pick (выбор своей идеи) | checks (вопросы «да / пока нет»);
  // next(ответ) → следующий узел
  // названия всех серий (нужны карточке занятия и админке до загрузки самой серии)
  const TITLES = { ep2: 'Серия 2. Как придумали колесо' };
  const EPV = {/*EPV*/};   // метки версий файлов episodes/*.js — подставляет сборка
  const EPISODES = {
    ep1: {
      title: 'Серия 1. Как мыслит инженер',   // обложка — /assets/episodes/<серия>-cover.webp (video/ep1/cover.mjs)
      start: 'n01',
      slots: { name: [660, 300, 600, 80], problem: [580, 222, 340, 104], ideas: [572, 400, 816, 296], idea: [580, 196, 760, 76], good: [576, 346, 358, 104], fix: [986, 346, 358, 104], checks: [1290, 493, 50, 182] },   // в пикселях кадра 1920×1080
      endText: 'Не забудь задание: найди дома три предмета, которые придумали инженеры, и подумай, как бы ты их улучшил.',
      // длительность роликов, с (для полосы перемотки), момент и длина места для обращения по имени
      dur: { n01: 35.93, n02: 11.4, n03: 38.63, n04a: 4.9, n04b: 7.47, n05: 28.33, n06: 49.93, pNaush: 8.73, pZaryad: 8.83, pRyukzak: 8.73, pPoter: 8.6, pBudil: 7.8, pShnur: 6.93, pPen: 7.17, pTech: 7.67, pZont: 7.67, pChai: 7.93, pAny: 6.83, pNone: 12.37, pLife: 19.27, pOdd: 14.1, n07: 13.13, n08a: 13.5, n08b: 15.13, n09: 13.3, n10a: 26.53, n10b: 19.4, s01: 17.13, s02: 5.67, sFan: 8.9, sApp: 8.33, sBat: 9.93, sMag: 9.2, sSpr: 10.23, sKol: 8.53, sFly: 7.9, sSig: 9, sTep: 8.13, sZas: 7.7, sMat: 7.53, sRob: 10.1, sAny: 11.37, sOdd: 12.7, s03: 11.8, sGood: 17.23, sWork: 16.13, n11: 34.73, n12: 6.5 },
      voice: { n02: { slot: 'hi', at: 0.6, room: 1.77 }, n12: { slot: 'bye', at: 1.53, room: 1.3 } },
      // реакция на названную проблему: узел с примером идеи (порядок важен — «телефон разряжается» → зарядка)
      problems: [
        ['pNaush', ['наушник', 'провод', 'шнур от', 'кабел', 'путают']], ['pZaryad', ['заряд', 'разряж', 'батаре', 'аккумулятор', 'садится']],
        ['pRyukzak', ['рюкзак', 'портфел', 'сумк', 'тяжел']], ['pPoter', ['теря', 'потер', 'ключ', 'носк', 'пульт', 'найти не']],
        ['pBudil', ['будильн', 'встава', 'проспа', 'просып', 'рано']], ['pShnur', ['шнурк', 'обув', 'ботин', 'кроссовк', 'кед']],
        ['pPen', ['ручк', 'карандаш', 'ластик', 'тетрад', 'точилк', 'фломастер']], ['pTech', ['компьютер', 'планшет', 'ноутбук', 'тормоз', 'интернет', 'вайфай', 'wi-fi', 'wifi', 'телефон', 'игр']],
        ['pZont', ['зонт', 'дожд', 'лужа', 'лужи', 'промока']], ['pChai', ['чай', 'кружк', 'горяч', 'остыва', 'суп', 'какао']],
      ],
      noProblem: 'Наушники путаются',
      // ответ «не знаю / ничего» — как пустой; проблема не про вещь (люди, уроки, чувства) — психолог просит назвать предмет
      none: /^(не знаю|незнаю|не помню|ничего|нет|никакая|никакой|никакие|все удобно|все нормально|все хорошо)([\s.,!]|$)/,
      life: ['брат', 'сестр', 'мама', 'маму', 'мамой', 'папа', 'папу', 'папой', 'родител', 'бабушк', 'дедушк', 'урок', 'домашк', 'домашн', 'школ', 'учител', 'училк', 'оценк', 'двойк', 'контрольн',
        'скучн', 'скука', 'лень', 'ленюсь', 'друз', 'подруг', 'дружб', 'одноклассн', 'обижа', 'дерут', 'дразн', 'ругают', 'ругает', 'страшн', 'боюсь', 'грустн', 'одиноко', 'кошк', 'собак', 'младш', 'старш', 'не дают', 'не пускают'],
      // шутка вместо проблемы (или набор букв) — психолог смеётся и просит назвать настоящую вещь
      odd: ['динозавр', 'инопланет', 'пришельц', 'зомби', 'монстр', 'привидени', 'призрак', 'дракон', 'единорог', 'вампир', 'какашк', 'какаш', 'пук', 'жоп', 'дурак', 'ерунд', 'фигн', 'хз', 'бла-бла', 'блабла', 'хаха', 'ха-ха', 'лол', 'кринж', 'скибиди'],
      // странная идея («ковёр», «торт») — инженер просит объяснить, как она поможет
      oddIdea: ['ковер', 'ковр', 'диван', 'торт', 'пицц', 'конфет', 'морожен', 'шоколад', 'банан', 'арбуз', 'котик', 'кошк', 'собак', 'хомяк', 'слон', 'жираф', 'бегемот', 'крокодил', 'акул', 'обезьян', 'лошад', 'коров', 'свинь'],
      // пример идеи из реакции на проблему — если ребёнок не назвал своих идей
      examples: { pNaush: 'Катушка, которая сама сматывает провод', pZaryad: 'Рюкзак с солнечной батареей', pRyukzak: 'Рюкзак на колёсиках', pPoter: 'Маячок, который пищит',
        pBudil: 'Будильник, который зажигает свет', pShnur: 'Застёжка на магнитах', pPen: 'Карандаш, который сам точится', pTech: 'Подставка, которая охлаждает',
        pZont: 'Зонт, который стряхивает воду', pChai: 'Кружка с вентилятором', pNone: 'Катушка, которая сама сматывает провод' },
      // ответ инженера на выбранную идею: узел по словам в идее (порядок важен — первый подходящий)
      feedback: [
        ['sFan', ['ковер-самол', 'ковер самол', 'волшеб', 'магия', 'магич', 'телепорт', 'невидим', 'лазер', 'портал', 'машина времени', 'вечн']],
        ['sApp', ['приложени', 'телефон', 'смартфон', 'блютуз', 'bluetooth', 'программ', 'вайфай', 'wifi', 'wi-fi', 'интернет', 'сайт']],
        ['sBat', ['батаре', 'заряд', 'аккумулятор', 'солнечн', 'электр', 'мотор', 'розетк']],
        ['sMag', ['магнит']],
        ['sSpr', ['пружин', 'резинк', 'катушк', 'сматыва', 'складн', 'склады', 'рулетк', 'сворачива']],
        ['sKol', ['колес', 'колесик', 'ролик', 'тележк']],
        ['sFly', ['самолет', 'лета', 'летит', 'дрон', 'крыл', 'пропеллер', 'вертол', 'ракет', 'парашют']],
        ['sSig', ['свет', 'ламп', 'фонар', 'пищ', 'звук', 'звен', 'сигнал', 'маяч', 'gps', 'джипиэс', 'датчик', 'музык']],
        ['sTep', ['вентилятор', 'охлажд', 'холод', 'нагрев', 'подогрев', 'тепл', 'грелк']],
        ['sZas', ['липучк', 'застежк', 'клей', 'крюч', 'крепл', 'карман', 'ремен', 'зажим', 'прищеп', 'держател', 'кольц']],
        ['sMat', ['мягк', 'резин', 'ткан', 'пластик', 'металл', 'дерев', 'непромока', 'водонепрониц', 'легк', 'прочн', 'стекл', 'бумаг']],
        ['sRob', ['робот', 'сам', 'автомат', 'умн', 'искусствен']],
      ],
      checks: ['Идея решает проблему?', 'Её можно сделать?', 'Ей удобно пользоваться?'],
      graph: (S, E) => {
        const react = Object.fromEntries([...E.problems.map(([k]) => k), 'pAny', 'pNone'].map((k) => [k, { show: ['problem'], next: () => 'n07' }]));
        const reacts = ['pAny', 'pNone', 'pLife', 'pOdd', ...E.problems.map(([k]) => k)];
        // какая реакция на проблему: нет ответа → pNone, вещь → свой пример, не про вещь → pLife, прочее → pAny
        // какая реакция на проблему: нет ответа → pNone, вещь → свой пример, шутка → pOdd, не про вещь → pLife, прочее → pAny
        const silly = (t) => t.length < 3 || !/[аеиоуыэюяaeiouy]/.test(t) || new Set(t.replace(/[^а-яa-z]/g, '')).size <= 2 || has(t, ...E.odd);
        const classify = (t) => (!t || E.none.test(t) ? 'pNone' : (E.problems.find(([, w]) => has(t, ...w)) || [silly(t) ? 'pOdd' : has(t, ...E.life) ? 'pLife' : 'pAny'])[0]);
        // второй раз не про вещь — берём пример
        const onProblem = (again) => { let k = classify(norm(S.problem || '')); if (k === 'pNone' || (again && (k === 'pLife' || k === 'pOdd'))) { S.problem = E.noProblem; k = 'pNone'; } S.react = k; return k; };
        // ответ на идею: по словам в ней; странная или из одного слова — «объясни, как поможет»; прочее — sAny
        const onIdea = () => { const t = norm(S.idea || ''); return (S.fb = pickFb(t)); };
        const pickFb = (t) => { if (has(t, ...E.feedback[0][1])) return 'sFan'; if (silly(t) || has(t, ...E.oddIdea)) return 'sOdd';
          const f = E.feedback.find(([, w]) => has(t, ...w)); return f ? f[0] : /\s/.test(t) ? 'sAny' : 'sOdd'; };
        const fbIds = [...E.feedback.map(([k]) => k), 'sAny', 'sOdd'];
        const FQ = { sAny: 'Что может пойти не так?', sOdd: 'Как она решит твою проблему?' };
        const fb = Object.fromEntries(fbIds.map((k) => [k, { show: ['idea', 'good'], showAfter: ['fix'],
          ask: { kind: 'free', q: FQ[k] || 'Как это исправить?', input: 'Твоя мысль', save: 'fix', slot: 'fix' }, next: () => 's03' }]));
        return {
          n01: { ask: { kind: 'name', q: 'Как тебя зовут?', input: 'Твоё имя' }, next: () => 'n02' },
          n02: { next: () => 'n03', show: ['name'], delay: 800 },
          n03: { ask: { kind: 'choice', q: 'Что придумали раньше?', opts: [['wheel', 'Колесо', ['колес', 'колёс']], ['bag', 'Чемодан на колёсиках', ['чемод', 'сумк']]] }, next: (a) => (a === 'wheel' ? 'n04a' : 'n04b'), outs: ['n04a', 'n04b'] },
          n04a: { next: () => 'n05' }, n04b: { next: () => 'n05' }, n05: { next: () => 'n06' },
          n06: { ask: { kind: 'free', q: 'Какая вещь тебе мешает?', input: 'Например: наушники путаются', save: 'problem' }, showAfter: ['problem'], next: () => onProblem(false), outs: reacts },
          ...react,
          // проблема не про вещь (pLife) или шутка (pOdd) — психолог просит назвать предмет
          ...Object.fromEntries(['pLife', 'pOdd'].map((k) => [k, { show: ['problem'], ask: { kind: 'free', q: 'Какая вещь тебе мешает?', input: 'Например: рюкзак тяжёлый', save: 'problem' }, showAfter: ['problem'],
            next: () => onProblem(true), outs: reacts.filter((x) => x !== 'pLife' && x !== 'pOdd') }])),
          n07: { show: ['problem'], ask: { kind: 'ideas', q: 'Мозговой штурм: говори все идеи подряд!', secs: 20, input: 'Напиши идею и нажми Enter' }, next: () => (S.ideas.length >= 3 ? 'n08a' : 'n08b'), outs: ['n08a', 'n08b'] },
          n08a: { show: ['problem', 'ideas'], next: () => 'n09' }, n08b: { show: ['problem', 'ideas'], next: () => 'n09' },
          n09: { ask: { kind: 'choice', q: 'Куда отправимся?', opts: [['past', 'В прошлое', ['прош', 'древн', 'назад', 'истор']], ['future', 'В будущее', ['будущ', 'вперёд', 'вперед', 'завтра']]] }, next: (a) => (a === 'future' ? 'n10b' : 'n10a'), outs: ['n10a', 'n10b'] },
          n10a: { next: () => 's01' }, n10b: { next: () => 's01' },
          // проверка идеи: выбрать свою идею → что в ней хорошего → ответ инженера по идее и «как исправить» → три вопроса → итог
          s01: { show: ['problem', 'ideas'], delay: 900, ask: { kind: 'pick', q: 'Какая идея нравится тебе больше всех?' }, next: () => 's02' },
          s02: { show: ['idea'], delay: 500, showAfter: ['good'], ask: { kind: 'free', q: 'Что хорошего в твоей идее?', input: 'Например: ничего не теряется', save: 'good', slot: 'good' },
            next: onIdea, outs: ['sAny', ...fbIds.filter((k) => k !== 'sAny')] },
          ...fb,
          s03: { show: ['idea', 'good', 'fix'], showAfter: ['checks'], ask: { kind: 'checks', q: E.checks }, next: (a) => (a === 'good' && S.fb !== 'sOdd' ? 'sGood' : 'sWork'), outs: ['sWork', 'sGood'] },
          sGood: { show: ['idea', 'good', 'fix', 'checks'], next: () => 'n11' }, sWork: { show: ['idea', 'good', 'fix', 'checks'], next: () => 'n11' },
          n11: { ask: { kind: 'any', q: 'Скажи: «Поехали!»', opts: [['go', 'Поехали!', []]] }, next: () => 'n12' },
          n12: { next: () => null },
        };
      },
    },
  };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M4.5 11a7.5 7.5 0 0 0 15 0M12 18.5V22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const LINE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const ICON = {
    play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
    pause: svg('<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>'),
    back: svg('<path d="M12 4.5V1.8L7.6 5.6 12 9.4V6.6a6.4 6.4 0 1 1-6.4 6.4H3.5A8.5 8.5 0 1 0 12 4.5z"/><text x="12" y="16.3" font-size="6.6" font-weight="700" text-anchor="middle" font-family="Arial,sans-serif">10</text>'),
    fwd: svg('<path d="M12 4.5V1.8l4.4 3.8L12 9.4V6.6a6.4 6.4 0 1 0 6.4 6.4h2.1A8.5 8.5 0 1 1 12 4.5z"/><text x="12" y="16.3" font-size="6.6" font-weight="700" text-anchor="middle" font-family="Arial,sans-serif">10</text>'),
    vol: svg(`<path d="M3.5 9.2v5.6h3.9l4.9 4.2V5L7.4 9.2z"/><path d="M15.5 8.6a4.8 4.8 0 0 1 0 6.8M18.2 6a8.6 8.6 0 0 1 0 12" ${LINE}/>`),
    mute: svg(`<path d="M3.5 9.2v5.6h3.9l4.9 4.2V5L7.4 9.2z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" ${LINE}/>`),
    fs: svg(`<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" ${LINE}/>`),
    fsOff: svg(`<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" ${LINE}/>`),
    meet: svg('<path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/>'),
  };

  // серия из отдельного файла: сначала загрузить его, потом показать плеер (pause/resume/destroy работают и до загрузки)
  const loading = {};
  function load(id) {
    return (loading[id] ??= new Promise((ok, fail) => {
      const sc = document.createElement('script'); sc.src = `/episodes/${id}.js${EPV[id] ? '?v=' + EPV[id] : ''}`;
      sc.onload = () => (EPISODES[id] ? ok() : fail()); sc.onerror = () => { delete loading[id]; fail(); };
      document.head.append(sc);
    }));
  }
  function mount(root, opts) {
    if (EPISODES[opts.id]) return mountNow(root, opts);
    if (!TITLES[opts.id]) { root.textContent = 'Серия не найдена'; return null; }
    root.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Загружаем мультфильм…</p>';
    let real = null, gone = false;
    load(opts.id).then(() => { if (!gone) real = mountNow(root, opts); }).catch(() => { if (!gone) root.textContent = 'Не удалось загрузить серию. Обновите страницу.'; });
    return { pause: () => real && real.pause(), resume: () => real && real.resume(), destroy: () => { gone = true; if (real) real.destroy(); } };
  }
  function mountNow(root, { id, sb, onMeet, onAnswer }) {
    const E = EPISODES[id];
    const blank = () => ({ name: '', problem: '', react: '', ideas: [], idea: '', fb: '', good: '', fix: '', checks: [] });
    const S = blank();
    const G = E.graph(S, E);
    const KEY = 'ep-progress:' + id;
    const wrap = document.createElement('div'); wrap.className = 'ep-player'; wrap.tabIndex = -1;
    const cbtn = (a, label, icon) => `<button type="button" data-a="${a}" title="${label}" aria-label="${label}">${icon}</button>`;
    wrap.innerHTML =
      `<div class="ep-stage">` +
        `<div class="ep-slot ep-slot-name"></div><div class="ep-slot ep-slot-problem"></div><div class="ep-slot ep-slot-ideas"></div>` +
        `<div class="ep-slot ep-slot-idea"></div><div class="ep-slot ep-slot-good ep-slot-note"></div><div class="ep-slot ep-slot-note ep-slot-fix"></div><div class="ep-slot ep-slot-checks"></div>` +
        `<div class="ep-spin" hidden></div>` +
        `<div class="ep-skip ep-skip-l"><span>${ICON.back}−10 с</span></div><div class="ep-skip ep-skip-r"><span>${ICON.fwd}+10 с</span></div>` +
        `<button type="button" class="ep-big" data-a="toggle" aria-label="Продолжить">${ICON.play}</button>` +
        `<div class="ep-ctrl" hidden>` +
          `<div class="ep-prog" role="slider" tabindex="0" aria-label="Перемотка" aria-valuemin="0"><div class="ep-track"><i class="ep-reach"></i><i class="ep-done"></i><span class="ep-marks"></span><b class="ep-knob"></b></div><span class="ep-tip"></span></div>` +
          `<div class="ep-btns">${cbtn('toggle', 'Пауза (K)', ICON.pause)}${cbtn('back', 'Назад на 10 секунд (J)', ICON.back)}${cbtn('fwd', 'Вперёд на 10 секунд (L)', ICON.fwd)}` +
            `<div class="ep-vol">${cbtn('mute', 'Выключить звук (M)', ICON.vol)}<input type="range" min="0" max="1" step="0.05" value="1" aria-label="Громкость"></div>` +
            `<span class="ep-time">0:00 / 0:00</span><span class="ep-sp"></span>` +
            `${onMeet ? cbtn('meet', 'Встреча с преподавателем', ICON.meet) : ''}${cbtn('fs', 'Во весь экран (F)', ICON.fs)}</div>` +
        `</div>` +
        `<div class="ep-start" style="background-image:linear-gradient(rgba(30,12,2,0) 45%,rgba(30,12,2,.78)),url(/assets/episodes/${id}-cover.webp)"><div class="ep-eye">Интерактивный мультфильм</div><h3>${E.title.replace(/^Серия \d+\.\s*/, '')}</h3>` +
          `<p class="ep-start-short">${SR ? '🎤 Отвечай вслух — герои тебя услышат' : 'Отвечай кнопками или пиши ответ'}</p>` +
          `<p class="ep-start-mic">${MIC}<span>${SR ? 'Герои будут задавать вопросы — <b>отвечай вслух</b>, они тебя услышат. Когда браузер спросит про микрофон, нажми «Разрешить».' : 'Герои будут задавать вопросы — отвечай кнопками или пиши ответ.'}</span></p>` +
          `<div class="ep-start-btns"><button type="button" class="btn primary" data-a="start" disabled>Загружаем…</button><button type="button" class="btn" data-a="fresh" hidden>↻ Сначала</button></div></div>` +
        `<div class="ep-end" hidden><div class="ep-eye">Серия пройдена!</div><h3 class="ep-end-title"></h3><p>${E.endText}</p>` +
          `<div class="ep-end-btns"><button type="button" class="btn" data-a="again">↻ Посмотреть ещё раз</button>` +
          `${onMeet ? '<button type="button" class="btn primary" data-a="meet">📞 Встреча с преподавателем</button>' : ''}</div></div>` +
      `</div>` +
      `<div class="ep-ask" role="dialog" aria-live="polite" hidden><div class="ep-q"></div>` +
        `<div class="ep-voice"><span class="ep-mic">${MIC}</span><span class="ep-say"></span></div>` +
        `<div class="ep-heard"></div><div class="ep-or"></div><div class="ep-opts"></div><div class="ep-timer" hidden><b></b></div></div>`;
    root.replaceChildren(wrap);
    const $ = (s) => wrap.querySelector(s);
    const stage = $('.ep-stage'), askEl = $('.ep-ask'), heard = $('.ep-heard'), opts = $('.ep-opts'), big = $('.ep-big');
    const prog = $('.ep-prog'), doneEl = $('.ep-done'), reachEl = $('.ep-reach'), knob = $('.ep-knob'), tip = $('.ep-tip'), marksEl = $('.ep-marks'), volIn = $('.ep-vol input');
    const slot = { name: $('.ep-slot-name'), problem: $('.ep-slot-problem'), ideas: $('.ep-slot-ideas'), idea: $('.ep-slot-idea'), good: $('.ep-slot-good'), fix: $('.ep-slot-fix'), checks: $('.ep-slot-checks') };
    for (const [k, [x, y, w, h]] of Object.entries(E.slots)) Object.assign(slot[k].style, { left: x / 19.2 + '%', top: y / 10.8 + '%', width: w / 19.2 + '%', height: h / 10.8 + '%' });

    const newRun = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
    let run = newRun();
    let urls = {}, onScreen = null, paused = false, dead = false, started = false, micOk = !!SR, netErr = 0, relisten = null, rec = null, cancelAsk = null, waiting = false;
    const vids = {}, resumeQ = [];
    let pausedAt = 0, pausedTotal = 0;
    const clock = () => Date.now() - pausedTotal;
    // пройденный путь: узлы по порядку (hist) и какой из них идёт сейчас (cur); при перемотке назад путь сохраняется,
    // и дальше ролики идут по нему без повторных вопросов. reached — до какого места (с) уже досмотрели
    let hist = [], cur = 0, reached = 0, drag = null, knownName = '';
    let vol = Math.min(1, Math.max(0, +(store.get('ep-volume') ?? 1))), muted = false;

    // ---------- Видео: по элементу на ролик, следующие заранее подгружаются ----------
    function vid(n) {
      if (vids[n]) return vids[n];
      const v = document.createElement('video');
      v.src = urls[n]; v.preload = 'auto'; v.playsInline = true;
      if (n.endsWith('-wait')) { v.loop = true; v.muted = true; } else { v.volume = vol; v.muted = muted; }
      v.addEventListener('waiting', () => v === onScreen && spin(true));
      ['playing', 'canplay', 'seeked', 'pause'].forEach((ev) => v.addEventListener(ev, () => v === onScreen && spin(false)));
      stage.insertBefore(v, stage.firstChild);
      return (vids[n] = v);
    }
    // значок загрузки — только если ролик действительно подвис (не мигает на коротких паузах)
    let spinT = null;
    function spin(on) { clearTimeout(spinT); if (on) spinT = setTimeout(() => { if (!paused) $('.ep-spin').hidden = false; }, 350); else $('.ep-spin').hidden = true; }
    function preload(n) {
      const g = G[n]; if (!g) return;
      if (g.ask) vid(n + '-wait');
      const i = hist.indexOf(n);
      (i >= 0 && i < hist.length - 1 ? [hist[i + 1]] : g.outs || [g.next('')]).forEach((x) => { if (x) { vid(x); if (!E.voice[n]) primeVoice(x); } });
    }
    function show(n, at = 0) {
      const v = vid(n); onScreen = v;
      Object.values(vids).forEach((x) => { if (x !== v) { x.classList.remove('on'); if (!x.paused) x.pause(); } });
      try { v.currentTime = at; } catch (e) {}
      v.classList.add('on');
      if (v.readyState < 3) spin(true);
      if (!paused) playOrTap(v);
    }
    // iOS иногда не даёт запустить следующий ролик со звуком без нажатия — тогда показываем кнопку
    function playOrTap(v) {
      v.play().catch((e) => {
        if (e.name !== 'NotAllowedError' || dead) return;
        let b = $('.ep-tap');
        if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'ep-tap'; b.textContent = '▶ Продолжить'; stage.append(b); }
        b.onclick = () => { b.remove(); if (onScreen) onScreen.play().catch(() => {}); };
      });
    }
    // во весь экран: где можно — настоящий полноэкранный режим, на iPhone — растягиваем плеер на всё окно
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    const isFs = () => !!fsEl() || wrap.classList.contains('ep-max');
    function fsIcon() { const b = $('[data-a=fs]'); b.innerHTML = isFs() ? ICON.fsOff : ICON.fs; b.title = isFs() ? 'Выйти из полноэкранного режима (F)' : 'Во весь экран (F)'; b.setAttribute('aria-label', b.title); }
    function setMax(on) { wrap.classList.toggle('ep-max', on); document.documentElement.classList.toggle('ep-lock', on); fsIcon(); }
    function exitFs() { setMax(false); if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {}); }
    function toggleFs() {
      if (isFs()) return exitFs();
      const req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
      if (!req) return setMax(true);
      const p = req.call(wrap); if (p && p.catch) p.catch(() => setMax(true));
    }
    const onFs = () => fsIcon();
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
    function overlays(list) { for (const k in slot) slot[k].classList.toggle('on', list.includes(k)); }

    // ---------- Громкость ----------
    function applyVol() {
      for (const k in vids) if (!k.endsWith('-wait')) { vids[k].volume = vol; vids[k].muted = muted; }
      voiceEl.volume = vol; voiceEl.muted = muted;
      const off = muted || vol === 0, b = $('[data-a=mute]');
      volIn.value = off ? 0 : vol; b.innerHTML = off ? ICON.mute : ICON.vol;
      b.title = off ? 'Включить звук (M)' : 'Выключить звук (M)'; b.setAttribute('aria-label', b.title);
    }
    function toggleMute() { if (muted || vol === 0) { muted = false; if (vol === 0) vol = 0.6; } else muted = true; applyVol(); }
    volIn.addEventListener('input', () => { vol = +volIn.value; muted = vol === 0; applyVol(); store.set('ep-volume', vol); });

    // ---------- Голос по имени: короткая запись поверх ролика в заданный момент ----------
    const voiceEl = new Audio(); voiceEl.preload = 'auto';
    let voiceAt = null, voiceOn = false, hold = false;   // voiceAt — когда включить; voiceOn — звучит/звучало в этом показе; hold — кадр ждёт конца имени
    const voiceUrls = {};
    async function loadNameVoice() {
      const n = NAME_MAP[norm(S.name.split(' ')[0] || '')];
      const want = Object.values(E.voice).map((x) => x.slot);
      const paths = want.map((s) => `${E.names || id}/names/${n ? slug(n) : '_'}-${s}.mp3`);
      const { data } = await sb.storage.from('episodes').createSignedUrls(paths, 4 * 3600).catch(() => ({}));
      want.forEach((s, i) => { const u = data && data[i] && data[i].signedUrl; if (u) voiceUrls[s] = u; else if (n) voiceUrls[s] = voiceUrls['_' + s]; });
      primeVoice(Object.keys(E.voice)[0]);
    }
    // заранее загрузить запись для узла n, чтобы она начиналась без задержки
    let voiceSrc = '';
    function primeVoice(n) {
      const x = E.voice[n], u = x && voiceUrls[x.slot];
      if (!u || u === voiceSrc || voiceOn) return;
      voiceSrc = u; voiceEl.src = u; voiceEl.load();
    }
    const voiceDone = () => { if (!hold) return; hold = false; if (!paused && onScreen) playOrTap(onScreen); };
    voiceEl.addEventListener('ended', voiceDone); voiceEl.addEventListener('error', voiceDone);

    // ---------- Узлы ----------
    function play(n, at = 0) {
      const g = G[n];
      waiting = false; voiceEl.pause(); voiceOn = false; hold = false;
      voiceAt = E.voice[n] && voiceUrls[E.voice[n].slot] ? { n, ...E.voice[n] } : null;
      if (voiceAt) primeVoice(n);
      slot.ideas.querySelectorAll('.ep-pick').forEach((x) => x.classList.remove('ep-pick'));
      paintSlots();
      overlays([]);
      if (at > 0) overlays(g.show || []); else setTimeout(() => G[curNode()] === g && overlays(g.show || []), g.delay || 0);
      preload(n);
      vid(n).onended = () => {
        if (cur < hist.length - 1) { cur++; play(hist[cur]); return; }   // повтор пройденного: ответ уже есть
        if (g.ask) {
          waiting = true;
          show(n + '-wait'); overlays([...(g.show || []), ...(g.showAfter || [])]);
          askQ(g.ask).then((r) => {
            const nx = g.next(r.val);
            if (onAnswer) try {
              const q = Array.isArray(g.ask.q) ? g.ask.q.join(' / ') : g.ask.q;
              Promise.resolve(onAnswer({ run, node: n, question: q, answer: r.answer || '', heard: r.heard || null, via: r.via, tag: nx || null }))
                .then((x) => { if (x && x.deltas && window.Hero && !dead) Hero.pop(stage, x.deltas); }).catch(() => {});
            } catch (e) { console.error(e); }
            Promise.resolve(g.ask.kind === 'name' ? loadNameVoice() : null).finally(() => go(nx));
          });
        }
        else go(g.next());
      };
      show(n, at);
    }
    const curNode = () => hist[cur];
    function go(n) { if (dead) return; if (n) { hist.push(n); cur = hist.length - 1; play(n); } else finish(); }

    // ---------- Полоса перемотки: путь до конца (пройденное + ожидаемое по умолчанию) ----------
    const dur = (n) => E.dur[n] || (vids[n] && isFinite(vids[n].duration) ? vids[n].duration : 12);
    function path() {
      const p = hist.slice(); let n = hist[hist.length - 1], guard = 0;
      while (n && guard++ < 40) {
        const g = G[n];
        n = g.ask ? (g.outs ? g.outs[0] : g.next('')) : g.next();   // после вопроса — первый из вариантов
        if (n) p.push(n);
      }
      return p;
    }
    const before = (i) => { let s = 0; for (let k = 0; k < i; k++) s += dur(hist[k]); return s; };
    function pos() {
      if (!hist.length) return 0;
      const n = curNode();
      return before(cur) + (waiting || !$('.ep-end').hidden ? dur(n) : Math.min(dur(n), vids[n] ? vids[n].currentTime : 0));
    }
    function total() { return Math.max(1, path().reduce((s, n) => s + dur(n), 0)); }
    // докуда можно перемотать: конец ближайшего ролика с вопросом, на который ещё не ответили
    function limit() {
      let s = before(hist.length), n = hist[hist.length - 1], guard = 0;
      if (!n || G[n].ask) return s;
      while ((n = G[n].next()) && guard++ < 40) { s += dur(n); if (G[n].ask) break; }
      return s;
    }
    function jump(i, off) {
      if (cancelAsk) cancelAsk();
      $('.ep-end').hidden = true;
      cur = i;
      play(hist[i], Math.max(0, Math.min(dur(hist[i]) - 0.05, off)));
    }
    function seekTo(t) {
      t = Math.max(0, Math.min(t, limit()));
      let s = 0;
      for (let i = 0; i < hist.length; i++) {
        const d = dur(hist[i]);
        if (t < s + d) return jump(i, t - s);
        s += d;
      }
      // дальше пройденного: путь дописывается до нужного места (на вопросе останавливаемся — limit())
      let n = hist[hist.length - 1];
      if (!G[n].ask) while ((n = G[n].next())) { hist.push(n); const d = dur(n); if (t < s + d || G[n].ask) return jump(hist.length - 1, t - s); s += d; }
      jump(hist.length - 1, dur(hist[hist.length - 1]));
    }
    function skip(d) {
      if (!started || !hist.length) return;
      const p = pos();
      if (d > 0 && p >= limit() - 0.3) return;   // впереди вопрос без ответа
      seekTo(p + d);
      const el = $(d < 0 ? '.ep-skip-l' : '.ep-skip-r'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    }
    let marksKey = '';
    function paint() {
      const T = total(), lim = limit(), p = drag != null ? Math.min(drag * T, lim) : pos(), pc = (x) => Math.min(100, (x / T) * 100) + '%';
      doneEl.style.width = pc(p); knob.style.left = pc(p); reachEl.style.width = pc(Math.max(reached, lim));
      $('.ep-time').textContent = fmt(p) + ' / ' + fmt(T);
      prog.setAttribute('aria-valuemax', Math.round(T)); prog.setAttribute('aria-valuenow', Math.round(p)); prog.setAttribute('aria-valuetext', fmt(p) + ' из ' + fmt(T));
      // отметки вопросов на полосе
      const pa = path(), key = pa.join() + T.toFixed(1);
      if (key !== marksKey) {
        marksKey = key; let s = 0; marksEl.innerHTML = '';
        pa.forEach((n) => { s += dur(n); if (G[n].ask && s < T - 0.5) { const m = document.createElement('i'); m.style.left = pc(s); m.title = G[n].ask.q; marksEl.append(m); } });
      }
    }
    let saveT = 0;
    function tick() {
      if (dead || !started) return;
      if (drag == null) reached = Math.max(reached, pos());
      paint();
      wrap.classList.toggle('asking', waiting);
      const v = onScreen, n = curNode();
      // обращение по имени; если имя длиннее места в ролике — кадр ждёт, пока оно прозвучит
      // запуск чуть заранее по таймеру — тики раз в 150 мс, иначе начало записи срезалось бы
      if (voiceAt && voiceAt.n === n && v === vids[n] && !paused && !voiceOn && v.currentTime >= voiceAt.at - 0.3 && v.currentTime < voiceAt.at + 0.5) {
        voiceOn = true;
        const late = v.currentTime - voiceAt.at;
        const start = () => {
          if (paused || onScreen !== v) { voiceOn = false; return; }
          voiceEl.currentTime = Math.max(0, v.currentTime - voiceAt.at - 0.15); voiceEl.play().catch(() => {});
        };
        if (late < 0) setTimeout(start, (-late * 1000) / (v.playbackRate || 1)); else start();
      }
      if (voiceOn && voiceAt && voiceAt.room && v === vids[n] && !paused && !hold && !voiceEl.paused && !voiceEl.ended && v.currentTime >= voiceAt.at + voiceAt.room - 0.05) {
        hold = true; v.pause();
      }
      if (Date.now() - saveT > 3000) { saveT = Date.now(); saveProgress(); }
    }
    const ticker = setInterval(tick, 150);

    // полоса: нажать/потянуть — перемотка (не дальше досмотренного), наведение — подсказка времени
    const frac = (e) => { const r = prog.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
    function showTip(f) {
      const T = total(), t = f * T, w = prog.getBoundingClientRect().width, far = t > limit() + 0.5;
      tip.textContent = far ? fmt(t) + ' · сначала ответь на вопрос' : fmt(t);
      tip.classList.toggle('far', far);
      tip.style.left = Math.min(w - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, f * w)) + 'px';
    }
    prog.addEventListener('pointerdown', (e) => {
      if (!started || e.button > 0) return;
      e.preventDefault(); prog.setPointerCapture?.(e.pointerId);
      drag = frac(e); prog.classList.add('drag'); showTip(drag); paint(); poke();
    });
    prog.addEventListener('pointermove', (e) => { const f = frac(e); showTip(f); if (drag != null) { drag = f; paint(); poke(); } });
    const dragEnd = (apply) => { if (drag == null) return; const f = drag; drag = null; prog.classList.remove('drag'); if (apply) seekTo(f * total()); };
    prog.addEventListener('pointerup', () => dragEnd(true));
    prog.addEventListener('pointercancel', () => dragEnd(false));

    // ---------- Панель управления: видна при движении мыши/касании, на паузе и во время вопроса ----------
    let uiT = null;
    function poke() {
      wrap.classList.add('ui'); clearTimeout(uiT);
      uiT = setTimeout(() => { if (!paused && drag == null && !wrap.contains(document.activeElement && document.activeElement.closest('.ep-ctrl'))) wrap.classList.remove('ui'); }, 2800);
    }
    let ptr = 'mouse', lastTap = 0, tapT = null;
    wrap.addEventListener('pointerdown', (e) => { ptr = e.pointerType || 'mouse'; wrap.classList.toggle('touch', ptr === 'touch'); });
    wrap.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && started) poke(); });
    wrap.addEventListener('mouseleave', () => { if (!paused && drag == null) wrap.classList.remove('ui'); });

    // ---------- Распознавание речи; без него — кнопки и поле ввода ----------
    function listen({ continuous = false, onText, onFinal, onEnd }) {
      if (!micOk) return null;
      const r = new SR(); r.lang = 'ru-RU'; r.interimResults = true; r.continuous = continuous; r.maxAlternatives = 1;
      r.onresult = (e) => {
        netErr = 0;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const txt = e.results[i][0].transcript.trim();
          if (e.results[i].isFinal) onFinal && onFinal(txt); else onText && onText(txt);
        }
      };
      // нет разрешения — сразу на кнопки; сбой связи с сервисом распознавания — пробуем снова, на кнопки только после трёх сбоев подряд
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || (e.error === 'network' && ++netErr >= 3)) { micOk = false; micState(false); }
      };
      r.onend = () => onEnd && onEnd();
      try { r.start(); } catch (e) {}
      return r;
    }
    // «включить снова»: микрофон снова слушает текущий вопрос
    $('.ep-say').addEventListener('click', () => { if (micOk || !SR) return; micOk = true; netErr = 0; micState(true); relisten && relisten(); });
    function micState(on) {
      askEl.classList.toggle('no-mic', !on);
      $('.ep-say').innerHTML = on ? '<b>Скажи ответ вслух</b> — я слушаю' : SR ? 'Микрофон недоступен — ответь кнопкой или напиши (<u>включить снова</u>)' : 'Микрофон недоступен — ответь кнопкой или напиши';
      $('.ep-or').textContent = on ? 'или' : '';
    }
    // слушаем по кругу, пока вопрос открыт; на паузе — ждём продолжения
    const loopListen = (isDone, o) => { const loop = () => { if (isDone() || dead) return; if (paused) { resumeQ.push(loop); return; } rec = listen({ ...o, onEnd: () => setTimeout(loop, 200) }); }; relisten = loop; loop(); };
    // текстовые места на доске и отметки проверки (✓ — да, ? — пока нет)
    function paintSlots() {
      for (const k of ['problem', 'idea', 'good', 'fix']) slot[k].textContent = S[k] || '';
      slot.checks.innerHTML = (S.checks || []).map((v) => `<i class="${v ? 'yes' : 'no'}">${v ? '✓' : '?'}</i>`).join('');
    }
    function ideaEl(s) { const d = document.createElement('div'); d.className = 'ep-idea'; d.textContent = s.slice(0, 60); slot.ideas.append(d); }

    function askQ(a) {
      return new Promise((resolve) => {
        let done = false, timer = null;
        const stop = () => { done = true; clearInterval(timer); try { rec && rec.abort(); } catch (e) {} askEl.hidden = true; cancelAsk = null; };
        const end = (val, info = {}) => { if (done) return; stop(); resolve({ val, ...info }); };
        cancelAsk = stop;   // перемотка во время вопроса — вопрос закрывается без ответа
        const isDone = () => done;
        $('.ep-q').textContent = a.q; heard.textContent = ''; opts.innerHTML = ''; micState(micOk);
        $('.ep-timer').hidden = a.kind !== 'ideas';
        askEl.hidden = false;
        const btn = (label, val, main, info) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = 'btn' + (main ? ' primary' : ''); b.onclick = () => end(val, typeof info === 'function' ? info() : info || { answer: label, via: 'button' }); opts.append(b); return b; };
        const input = (ph, onEnter) => {
          const i = document.createElement('input'); i.placeholder = ph; i.maxLength = 60; i.enterKeyHint = 'send';
          const send = () => { if (i.value.trim()) { onEnter(i.value.trim()); i.value = ''; } };
          i.onkeydown = (e) => { if (e.key === 'Enter') send(); };
          const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn ep-send'; ok.textContent = '➜'; ok.setAttribute('aria-label', 'Отправить'); ok.onclick = send;
          const box = document.createElement('div'); box.className = 'ep-input'; box.append(i, ok); opts.append(box); return i;
        };
        const onText = (t) => { heard.textContent = t + '…'; askEl.classList.add('hear'); };

        if (a.kind === 'choice' || a.kind === 'any') {
          a.opts.forEach(([val, label]) => btn(label, val, true));
          const pick = (txt) => { const t = txt.toLowerCase(); heard.textContent = '«' + txt + '»';
            const o = a.opts.find(([, , w]) => has(t, ...w)) || (a.kind === 'any' ? a.opts[0] : null);
            if (o) setTimeout(() => end(o[0], { answer: o[1], via: 'voice', heard: txt }), 500); };
          loopListen(isDone, { onText, onFinal: pick });
        } else if (a.kind === 'name' || a.kind === 'free') {
          const sl = slot[a.slot || 'problem'];
          if (a.save) { S[a.save] = ''; sl.textContent = ''; }
          const save = (txt, via) => {
            const v = a.kind === 'name' ? cap(txt.replace(/^(меня зовут|я|зовут)\s+/i, '').split(/\s+/).slice(0, 2).join(' ')) : cap(txt);
            if (a.kind === 'name') { S.name = v.slice(0, 24); slot.name.textContent = S.name; }
            else { S[a.save] = v.slice(0, 80); sl.textContent = S[a.save]; }
            heard.textContent = '«' + v + '»'; setTimeout(() => end(v, { answer: v, via, heard: via === 'voice' ? txt : null }), 700);
          };
          input(a.input, (t) => save(t, 'text')); btn('Пропустить', '', false, { answer: '', via: 'skip' });
          loopListen(isDone, { onText, onFinal: (t) => t && save(t, 'voice') });
        } else if (a.kind === 'pick') {
          // своя идея из мозгового штурма; нет идей — пример из реакции на проблему; одна — она и есть (via: skip — выбирать не пришлось)
          const list = S.ideas.length ? S.ideas : [E.examples[S.react] || E.examples.pNone];
          const choose = (i, via, txt) => {
            S.idea = list[i]; slot.idea.textContent = S.idea;
            slot.ideas.querySelectorAll('.ep-idea').forEach((x, k) => x.classList.toggle('ep-pick', k === i));
            heard.textContent = '«' + S.idea + '»'; setTimeout(() => end(S.idea, { answer: S.idea, via, heard: txt || null }), 900);
          };
          if (list.length === 1) { $('.ep-q').textContent = 'Твоя идея'; choose(0, 'skip'); return; }
          list.forEach((s, i) => { const b = btn(s, i, i === 0); b.onclick = () => choose(i, 'button'); });
          // голосом: «первая», «последняя» или слова из идеи
          const ORD = [['перв', 0], ['втор', 1], ['трет', 2], ['четв', 3], ['пят', 4], ['последн', list.length - 1]];
          const stems = (x) => norm(x).split(/[^a-zа-я0-9]+/).filter((w) => w.length > 2).map((w) => w.slice(0, 5));
          loopListen(isDone, { onText, onFinal: (txt) => {
            const t = norm(txt), o = ORD.find(([w, i]) => t.includes(w) && i < list.length);
            if (o) return choose(o[1], 'voice', txt);
            const said = stems(txt), sc = list.map((s) => stems(s).filter((w) => said.includes(w)).length), best = Math.max(...sc);
            if (best > 0) choose(sc.indexOf(best), 'voice', txt); else heard.textContent = '«' + txt + '» — нажми на свою идею';
          } });
        } else if (a.kind === 'checks') {
          // вопросы по очереди: «да» / «пока нет» голосом или кнопками
          S.checks = []; paintSlots(); slot.checks.classList.add('on');
          const said = [], vias = new Set();
          const next = (yes, via, txt) => {
            if (S.checks.length >= a.q.length) return;
            S.checks.push(yes); vias.add(via); if (txt) said.push(txt); paintSlots();
            if (S.checks.length < a.q.length) { setTimeout(() => { if (!done) { $('.ep-q').textContent = a.q[S.checks.length]; heard.textContent = ''; } }, 500); return; }
            const val = S.checks.every(Boolean) ? 'good' : 'work';
            setTimeout(() => end(val, { answer: a.q.map((q, i) => q + ' — ' + (S.checks[i] ? 'да' : 'пока нет')).join('; '), via: vias.size > 1 ? 'mixed' : [...vias][0], heard: said.length ? said.join(' | ') : null }), 700);
          };
          $('.ep-q').textContent = a.q[0];
          const yes = btn('Да', '', true), no = btn('Пока нет', '', false);
          yes.onclick = () => next(true, 'button'); no.onclick = () => next(false, 'button');
          const NO = ['нет', 'не', 'пока', 'неа', 'нельзя', 'вряд'], YES = ['да', 'конечно', 'ага', 'угу', 'можно', 'решает', 'удобно', 'наверное', 'точно'];
          loopListen(isDone, { onText, onFinal: (txt) => {
            const w = norm(txt).split(/[^a-zа-я]+/);
            if (w.some((x) => NO.includes(x))) next(false, 'voice', txt); else if (w.some((x) => YES.includes(x))) next(true, 'voice', txt);
            else heard.textContent = '«' + txt + '» — скажи «да» или «пока нет»';
          } });
        } else if (a.kind === 'ideas') {
          slot.ideas.innerHTML = ''; S.ideas = []; slot.ideas.classList.add('on');
          const vias = new Set(), said = [];
          const add = (txt, via) => txt.split(/\s*(?:,|\bи ещё\b|\bещё\b|\bили\b)\s*/i).map((s) => s.trim()).filter((s) => s.length > 2).forEach((s) => {
            if (S.ideas.length >= 12) return;
            S.ideas.push(cap(s)); vias.add(via); ideaEl(cap(s));
          });
          const result = () => ({ answer: S.ideas.join('; '), via: vias.size > 1 ? 'mixed' : [...vias][0] || 'timeout', heard: said.length ? said.join(' | ') : null });
          input(a.input, (t) => add(t, 'text')); btn('Готово', 'done', true, result);
          const t0 = clock(), bar = $('.ep-timer b');
          timer = setInterval(() => { if (paused) return; const p = 1 - (clock() - t0) / (a.secs * 1000); bar.style.width = Math.max(0, p * 100) + '%'; if (p <= 0) end('done', result()); }, 100);
          loopListen(isDone, { continuous: true, onText, onFinal: (t) => { heard.textContent = ''; if (t) { said.push(t); add(t, 'voice'); } } });
        }
      });
    }

    // ---------- Место просмотра: запоминается на устройстве, при следующем открытии — «Продолжить» ----------
    function saveProgress() {
      if (!started || !hist.length || !$('.ep-end').hidden) return;
      const n = curNode();
      store.set(KEY, { hist, cur, t: waiting ? dur(n) : (vids[n] ? vids[n].currentTime : 0), reached, S: { ...S }, run, ts: Date.now() });
    }
    function savedProgress() {
      const p = store.get(KEY);
      if (!p || !Array.isArray(p.hist) || !p.hist.length || !p.hist.every((n) => G[n]) || Date.now() - p.ts > 60 * 864e5) return null;
      p.cur = Math.min(p.cur | 0, p.hist.length - 1);
      return p;
    }

    // ---------- Финал, кнопки, пауза ----------
    function finish() {
      overlays([]); waiting = false; store.del(KEY);
      $('.ep-end-title').textContent = S.name ? `До встречи, ${S.name}!` : 'До встречи в клубе!';
      $('.ep-end').hidden = false;
    }
    function reset() {
      if (cancelAsk) cancelAsk();
      $('.ep-end').hidden = true; Object.assign(S, blank()); run = newRun(); reached = 0;
      for (const k in slot) slot[k].innerHTML = '';
      delete voiceUrls.hi; delete voiceUrls.bye;
      Object.values(E.voice).forEach((x) => { voiceUrls[x.slot] = voiceUrls['_' + x.slot]; });
      hist = [E.start]; cur = 0;
    }
    function restart() { reset(); store.del(KEY); play(E.start); }
    function setPaused(on) {
      wrap.classList.toggle('paused', on);
      const b = $('.ep-btns [data-a=toggle]'); b.innerHTML = on ? ICON.play : ICON.pause;
      b.title = on ? 'Смотреть (K)' : 'Пауза (K)'; b.setAttribute('aria-label', on ? 'Смотреть' : 'Пауза');
      big.innerHTML = on ? ICON.play : ICON.pause; big.setAttribute('aria-label', on ? 'Смотреть' : 'Пауза');
    }
    function pause() {
      if (paused) return; paused = true; pausedAt = Date.now(); setPaused(true); spin(false);
      if (onScreen && !onScreen.paused) onScreen.pause();
      voiceEl.pause();
      try { rec && rec.abort(); } catch (e) {}
      saveProgress();
    }
    function resume() {
      if (!paused) return; paused = false; pausedTotal += Date.now() - pausedAt; setPaused(false);
      if (onScreen && $('.ep-end').hidden && !hold) playOrTap(onScreen);
      if (voiceOn && !voiceEl.ended && voiceEl.currentTime > 0) voiceEl.play().catch(() => {});
      resumeQ.splice(0).forEach((f) => f());
      poke();
    }
    const toggle = () => { if (started) paused ? resume() : pause(); };
    function begin(saved) {
      started = true; wrap.classList.add('started'); $('.ep-start').remove(); $('.ep-ctrl').hidden = false;
      // разблокировать звук обращения по имени (iOS разрешает только из нажатия)
      if (voiceUrls._hi) { voiceEl.src = voiceUrls._hi; voiceEl.muted = true; voiceEl.play().then(() => { voiceEl.pause(); voiceEl.muted = muted; }).catch(() => { voiceEl.muted = muted; }); }
      // спросить разрешение на микрофон сразу, чтобы окно браузера не появилось посреди вопроса
      if (micOk && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => { micOk = false; });
      applyVol(); setPaused(false); wrap.focus({ preventScroll: true });
      reset();
      if (!saved && knownName && !S.name) { S.name = knownName; slot.name.textContent = S.name; loadNameVoice(); }
      if (!saved) { store.del(KEY); play(E.start); return; }
      // продолжить: восстановить ответы и путь, начать за пару секунд до места остановки
      Object.assign(S, saved.S || {}); run = saved.run || run; hist = saved.hist; cur = saved.cur;
      slot.name.textContent = S.name; paintSlots(); (S.ideas || []).forEach(ideaEl);
      reached = Math.max(+saved.reached || 0, before(cur) + (+saved.t || 0));
      Promise.resolve(S.name ? loadNameVoice() : null).finally(() => play(hist[cur], Math.max(0, (+saved.t || 0) - 2)));
    }

    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'), a = b?.dataset.a;
      if (b && ptr === 'mouse' && b.closest('.ep-ctrl')) wrap.focus({ preventScroll: true });   // чтобы пробел не «нажимал» кнопку ещё раз
      if (a === 'fs') toggleFs();
      else if (a === 'start') begin(savedProgress());
      else if (a === 'fresh') begin(null);
      else if (a === 'again') restart();
      else if (a === 'toggle') toggle();
      else if (a === 'back') skip(-10);
      else if (a === 'fwd') skip(10);
      else if (a === 'mute') toggleMute();
      else if (a === 'meet') { pause(); exitFs(); onMeet(); }
      else if (!a && started && e.target.closest('.ep-stage') && !e.target.closest('button,input,.ep-end,.ep-tap,.ep-ctrl')) {
        if (ptr !== 'touch') { toggle(); poke(); return; }
        // касание: одно — показать/спрятать панель; двойное по краю кадра — ±10 с
        const r = stage.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, side = fx < 0.35 ? -1 : fx > 0.65 ? 1 : 0, now = Date.now();
        if (side && now - lastTap < 320) { clearTimeout(tapT); lastTap = now; skip(side * 10); return; }
        lastTap = now; clearTimeout(tapT);
        tapT = setTimeout(() => { if (wrap.classList.contains('ui') && !paused) { wrap.classList.remove('ui'); clearTimeout(uiT); } else poke(); }, side ? 320 : 0);
      }
    });
    wrap.addEventListener('dblclick', (e) => { if (ptr === 'mouse' && started && e.target.closest('.ep-stage') && !e.target.closest('button,input,.ep-ctrl,.ep-end')) toggleFs(); });
    // клавиши как в обычном видеоплеере (по коду клавиши — работают и в русской раскладке)
    wrap.addEventListener('keydown', (e) => {
      if (!started || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target, c = e.code;
      if (t.closest('.ep-ask input') || (t.type === 'range' && /Arrow/.test(c))) return;
      if (t.tagName === 'BUTTON' && (c === 'Space' || c === 'Enter')) return;
      const acts = { Space: toggle, KeyK: toggle, ArrowLeft: () => skip(-5), ArrowRight: () => skip(5), KeyJ: () => skip(-10), KeyL: () => skip(10), KeyM: toggleMute, KeyF: toggleFs, Home: () => seekTo(0) };
      if (!acts[c]) return;
      e.preventDefault(); acts[c](); poke();
    });

    // ---------- Подготовка: временные ссылки на все ролики серии и запасные обращения ----------
    (async () => {
      const names = Object.keys(G).flatMap((n) => (G[n].ask ? [n, n + '-wait'] : [n]));
      const fallbacks = Object.values(E.voice).map((x) => `${E.names || id}/names/_-${x.slot}.mp3`);
      // имя ребёнка из прошлой серии (nameFrom) — чтобы герои обращались к нему по имени
      if (E.nameFrom) sb.auth.getUser().then(({ data: u }) => u && u.user && sb.from('episode_answers').select('answer').eq('user_id', u.user.id).eq('episode', E.nameFrom).eq('node', 'n01').neq('answer', '')
        .order('created_at', { ascending: false }).limit(1)).then((r) => { const a = r && r.data && r.data[0]; if (a) knownName = a.answer.trim().split(/\s+/)[0].slice(0, 24); }).catch(() => {});
      const { data, error } = await sb.storage.from('episodes').createSignedUrls([...names.map((n) => `${id}/${n}.mp4`), ...fallbacks], 4 * 3600);
      if (dead) return;
      const b = $('.ep-start .btn');
      if (error || !data) { b.textContent = 'Не удалось загрузить серию'; $('.ep-start-mic span').textContent = 'Обновите страницу и попробуйте ещё раз.'; return; }
      data.forEach((d, i) => { if (!d.signedUrl) return; if (i < names.length) urls[names[i]] = d.signedUrl; else voiceUrls['_' + Object.values(E.voice)[i - names.length].slot] = d.signedUrl; });
      Object.values(E.voice).forEach((x) => { voiceUrls[x.slot] = voiceUrls['_' + x.slot]; });
      const saved = savedProgress();
      if (saved) {
        let at = 0; for (let k = 0; k < saved.cur; k++) at += dur(saved.hist[k]);
        at += +saved.t || 0;
        vid(saved.hist[saved.cur]);
        b.textContent = '▶ Продолжить с ' + fmt(at); $('[data-a=fresh]').hidden = false;
      } else { vid(E.start); preload(E.start); b.textContent = '▶ Начать'; }
      b.disabled = false;
    })();

    return {
      pause, resume,
      destroy() {
        saveProgress(); dead = true; clearInterval(ticker); clearTimeout(uiT); pause(); exitFs();
        document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs);
        voiceEl.removeAttribute('src'); Object.values(vids).forEach((v) => { v.removeAttribute('src'); v.load(); }); root.replaceChildren();
      },
    };
  }

  // Episode.define(id, серия) — из файлов episodes/*.js; util — общие помощники для их графов
  const define = (id, e) => { EPISODES[id] = e; };
  window.Episode = { mount, define, util: { has, norm, cap }, titles: { ...TITLES, ...Object.fromEntries(Object.entries(EPISODES).map(([k, v]) => [k, v.title])) } };
})();
