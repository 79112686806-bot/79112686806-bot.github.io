// Разминка ума: три короткие задачки в день (3–5 минут) — шестерёнки, рычаг, «что дальше?», «что лишнее?», вопрос инженера.
// Оформление — тетрадь изобретателя: пергамент, рисунки тушью с акварелью (латунные шестерёнки, деревянный рычаг, гири),
// печать «Верно!», подсказка — записка от руки.
// Задачки выбирает и проверяет сервер (brain_today, brain_answer — ответы в браузер не попадают), он же начисляет шестерёнки
// и очки героя (событие quiz — засчитывается в серию дней и задания дня). Две попытки: после первой ошибки — подсказка.
// После трёх задачек дня — «Ещё задачки» без ограничений (brain_more / brain_extra_answer, миграция 20261029000036_gears_games.sql):
// 2 ⚙ за задачку, которую ребёнок ещё не решал; в серию дней не идут.
// Brain.open(el, { sb, onChange, onCity, onMemo }) — onChange() после ответа (обновить панель наград), onCity() — «В мой город»,
// onMemo() — «Сыграть в Мемо».
(function () {
  const H = () => window.Hero;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
  const f1 = (n) => Math.round(n * 10) / 10;
  const INK = '#4a2c14', INK2 = '#6e4b2c', RED = '#9a3a1b';
  const st = (w = 1.6) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const KIND = { gears: 'Шестерёнки', lever: 'Рычаг', seq: 'Что дальше?', odd: 'Что лишнее?', quiz: 'Вопрос инженера' };
  const LET = ['А', 'Б', 'В', 'Г'];

  // ---------- Шестерёнка тушью: зубцы-трапеции, обод, спицы, втулка, блик ----------
  function gearShape(r, n, fill, opt = {}) {
    const d = r * 0.2, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n, w1 = (Math.PI / n) * 0.7, w2 = (Math.PI / n) * 0.42;
      for (const [ang, rad] of [[a - w1, r - d], [a - w2, r], [a + w2, r], [a + w1, r - d]]) pts.push([rad * Math.cos(ang), rad * Math.sin(ang)]);
    }
    const path = 'M' + pts.map(([x, y]) => f1(x) + ' ' + f1(y)).join('L') + 'z';
    const hole = (k) => { const a = (k * Math.PI) / 2 + Math.PI / 4, rr = r * 0.5; return `<circle cx="${f1(rr * Math.cos(a))}" cy="${f1(rr * Math.sin(a))}" r="${f1(r * 0.17)}" fill="#f3e6c8" ${st(1.2)}/>`; };
    return `<path d="${path}" transform="translate(2.5 3)" fill="rgba(74,44,20,.18)"/><path d="${path}" fill="${fill}" ${st()}/>`
      + `<circle r="${f1(r - d - r * 0.1)}" fill="none" stroke="${INK}" stroke-width=".9" opacity=".55"/>`
      + (opt.plain ? `<circle r="${f1(r * 0.55)}" fill="#fff8ea" opacity=".75"/>` : (opt.pulley ? `<circle r="${f1(r * 0.42)}" fill="#a06a33" ${st(1.3)}/>` : [0, 1, 2, 3].map(hole).join(''))
      + `<circle r="${f1(r * 0.2)}" fill="#8a6d1f" ${st(1.3)}/><circle r="${f1(r * 0.07)}" fill="${INK}"/>`)
      + `<path d="M${f1(-r * 0.55)} ${f1(-r * 0.35)}a${f1(r * 0.65)} ${f1(r * 0.65)} 0 0 1 ${f1(r * 0.5)} ${f1(-r * 0.32)}" fill="none" stroke="#fff6d8" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>`;
  }
  const GEAR_FILL = { first: '#e3b341', mid: '#d9b98a', last: '#e7a58c' };
  function gearsDirs(d) { const out = [d.dir === 'cw' ? 1 : -1]; for (const l of d.links) out.push(l === 's' ? out[out.length - 1] : -out[out.length - 1]); return out; }
  function gearsSvg(d, solved) {
    const R = 26, N = 12, D = 2 * R - R * 0.2 + 1, pos = [[0, 0]], rot = [0];
    d.links.forEach((l, i) => {
      const [x, y] = pos[i];
      if (l === 'g') { const up = i % 2 ? -1 : 1, a = (26 * Math.PI) / 180; pos.push([x + D * Math.cos(a), y + up * D * Math.sin(a)]); rot.push(rot[i] + 180 / N + (up * 26 * 2)); }
      else { pos.push([x + 118, y]); rot.push(0); }
    });
    const dirs = gearsDirs(d), n = pos.length, xs = pos.map((p) => p[0]), ys = pos.map((p) => p[1]);
    const minX = Math.min(...xs) - 44, maxX = Math.max(...xs) + 44, minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 44;
    let belts = '';
    d.links.forEach((l, i) => {
      if (l === 'g') return; const [a, ay] = pos[i], [b, by] = pos[i + 1], r = R * 0.42 + 2.5;
      const lines = l === 's' ? [[a, ay - r, b, by - r], [a, ay + r, b, by + r]] : [[a, ay - r, b, by + r], [a, ay + r, b, by - r]];
      belts += lines.map(([x1, y1, x2, y2]) => `<path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" stroke="#a8703c" stroke-width="4.6" stroke-linecap="round"/><path d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}" stroke="#f0d7a8" stroke-width=".9" stroke-dasharray="3 3"/>`).join('');
      if (l === 'x') belts += `<text x="${f1((a + b) / 2)}" y="${f1(ay + R + 26)}" text-anchor="middle" class="bz-note">ремень крест-накрест</text>`;
    });
    // стрелка от руки над первой шестерёнкой
    const [x0, y0] = pos[0], cw = dirs[0] > 0;
    const arrow = `<g transform="translate(${x0} ${y0})${cw ? '' : ' scale(-1 1)'}"><path d="M-22 -${R + 14}c10-14 34-14 44 0" fill="none" stroke="${RED}" stroke-width="3.2" stroke-linecap="round"/><path d="M26 -${R + 20}l-3 9-9-2" fill="none" stroke="${RED}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    return `<svg viewBox="${f1(minX)} ${f1(minY)} ${f1(maxX - minX)} ${f1(maxY - minY)}" class="bz-pic" role="img" aria-label="Цепочка из ${n} шестерёнок">${belts}`
      + pos.map(([x, y], i) => `<g transform="translate(${f1(x)} ${f1(y)})"><g transform="rotate(${f1(rot[i])})"><g class="${solved ? (dirs[i] > 0 ? 'bz-cw' : 'bz-ccw') : ''}">${gearShape(R, N, i === 0 ? GEAR_FILL.first : i === n - 1 ? GEAR_FILL.last : GEAR_FILL.mid, { pulley: d.links[i - 1] && d.links[i - 1] !== 'g' || d.links[i] && d.links[i] !== 'g' })}</g></g>`
        + (i === n - 1 && !solved ? `<circle r="13" fill="#fff8ea" ${st(1.4)}/><text y="8" text-anchor="middle" font-size="22" font-weight="700" fill="${RED}" font-family="'Cormorant Garamond',Georgia,serif">?</text>` : '') + '</g>').join('')
      + arrow + '</svg>';
  }
  const turnIco = (cw) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"${cw ? ' style="transform:scaleX(-1)"' : ''}><path d="M5 14a7 7 0 1 0 2.5-7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // ---------- Рычаг: доска на камне, гири с весом, разметка расстояний ----------
  const torque = (arr) => arr.reduce((a, [p, w]) => a + p * w, 0);
  const kettle = (w, side) => {
    const s = 0.78 + w * 0.1, c = side < 0 ? '#7c6f66' : '#6a7580';
    return `<g transform="scale(${f1(s * 100) / 100})"><path d="M-7-27a7 7 0 0 1 14 0" fill="none" stroke="${INK}" stroke-width="3.4"/><path d="M-7-27a7 7 0 0 1 14 0" fill="none" stroke="${c}" stroke-width="1.8"/>`
      + `<path d="M-13-2c-3-9 0-20 13-21 13 1 16 12 13 21z" fill="${c}" ${st(1.5)}/><path d="M-8-18c3-3 7-3 9-2" fill="none" stroke="#e6e1da" stroke-width="2" stroke-linecap="round" opacity=".7"/>`
      + `<text y="-6" text-anchor="middle" font-size="13" font-weight="700" fill="#fff8ea" font-family="'PT Serif',Georgia,serif">${w}</text></g>`;
  };
  function leverSvg(d, solved) {
    const U = 36, tl = torque(d.L), tr = torque(d.R), ang = solved ? (tl > tr ? -7 : tl < tr ? 7 : 0) : 0;
    const grain = [-130, -70, -20, 40, 95].map((x) => `<path d="M${x} -2c12 -1 24 1 36 0" fill="none" stroke="#7a4a24" stroke-width=".8" opacity=".6"/>`).join('');
    const ticks = [-4, -3, -2, -1, 1, 2, 3, 4].map((p) => `<path d="M${p * U} 4v5" stroke="${INK}" stroke-width="1.3"/><text x="${p * U}" y="22" text-anchor="middle" class="bz-tick">${Math.abs(p)}</text>`).join('');
    const weights = (arr, side) => arr.map(([p, w]) => `<g transform="translate(${side * p * U} -5)">${kettle(w, side)}</g>`).join('');
    return `<svg viewBox="-175 -72 350 136" class="bz-pic" role="img" aria-label="Рычаг с гирями">`
      + `<path d="M-170 54h340" stroke="${INK}" stroke-width="1.4"/>${[-150, -110, -70, 60, 100, 140].map((x) => `<path d="M${x} 54l-6 7M${x + 8} 54l-6 7" stroke="${INK2}" stroke-width=".9"/>`).join('')}`
      + `<path d="M0 8l-24 46h48z" fill="#cbb999" ${st(1.6)}/><path d="M-10 30l6-4M-4 44l9-6M6 36l6-4" stroke="${INK2}" stroke-width="1"/><path d="M0 8l24 46h-12z" fill="#b5a385"/><path d="M0 8l-24 46h48z" fill="none" ${st(1.6)}/>`
      + `<g class="bz-beam" style="transform:rotate(${ang}deg)"><path d="M-158 -5h316v10h-316z" fill="#c49560" ${st(1.6)}/>${grain}<path d="M-158 -5h316" stroke="#e2b98a" stroke-width="1.4" opacity=".8"/>${ticks}${weights(d.L, -1)}${weights(d.R, 1)}<circle r="3.4" fill="${INK}"/></g></svg>`;
  }
  const tiltIco = (k) => `<svg viewBox="0 0 30 22" width="30" height="22" aria-hidden="true"><path d="M15 12l-5 8h10z" fill="currentColor" opacity=".35"/><path d="M2 ${k < 0 ? 16 : k > 0 ? 6 : 11}L28 ${k < 0 ? 6 : k > 0 ? 16 : 11}" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;

  // ---------- Ряды: числа или фигуры акварелью («фигура:цвет» — c круг, s квадрат, t треугольник, r ромб, h сердце) ----------
  const COL = { r: '#c0704a', b: '#6f8fa6', g: '#7f9a6a', y: '#e3b341', d: '#8a6040' };
  const SH = { c: 'M20 6a14 14 0 1 1 0 28a14 14 0 1 1 0-28z', s: 'M7 7h26v26H7z', t: 'M20 5l16 28H4z', r: 'M20 4l15 16-15 16L5 20z', h: 'M20 34C4 22 6 8 14 8c3 0 5 2 6 4 1-2 3-4 6-4 8 0 10 14-6 26z' };
  function figure(code, size = 42) {
    if (!/^[cstrh]:[rbgyd]$/.test(code)) return `<span class="bz-num">${esc(code)}</span>`;
    const [f, c] = code.split(':');
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><path d="${SH[f]}" fill="${COL[c]}" opacity=".85" transform="translate(1.6 1.4)"/><path d="${SH[f]}" fill="${COL[c]}" opacity=".35" transform="translate(-1 -.6) scale(1.02)"/><path d="${SH[f]}" fill="none" ${st(1.7)}/></svg>`;
  }
  const NAMES = { c: 'круг', s: 'квадрат', t: 'треугольник', r: 'ромб', h: 'сердце' }, CNAMES = { r: 'красный', b: 'синий', g: 'зелёный', y: 'жёлтый', d: 'коричневый' };
  const label = (code) => (/^[cstrh]:[rbgyd]$/.test(code) ? CNAMES[code[2]] + ' ' + NAMES[code[0]] : code);

  // рисунки-заставки к вопросам: лампочка (вопрос инженера) и карточки (что лишнее)
  const SKETCH = {
    quiz: `<svg viewBox="0 0 120 90" class="bz-sketch" aria-hidden="true"><path d="M60 12c-17 0-28 12-28 26 0 10 6 16 11 22 3 4 4 7 4 11h26c0-4 1-7 4-11 5-6 11-12 11-22 0-14-11-26-28-26z" fill="#fbeeb0" ${st(1.8)}/><path d="M48 76h24M50 82h20" ${st(1.8)}/><path d="M52 56c2-8 6-12 8-20 2 8 6 12 8 20" fill="none" stroke="${RED}" stroke-width="1.6"/><path d="M22 20l-8-6M98 20l8-6M18 42H8M102 42h10M28 64l-7 5M92 64l7 5" stroke="#c9a227" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    odd: `<svg viewBox="0 0 120 90" class="bz-sketch" aria-hidden="true">${[[18, -6, '#e3b341'], [42, 0, '#8fb2c4'], [66, 6, '#a3b47f'], [90, 12, '#e7a58c']].map(([x, r, c], i) => `<g transform="translate(${x} 46) rotate(${r})"><rect x="-13" y="-20" width="26" height="36" rx="3" fill="${i === 3 ? '#fff8ea' : c}" ${st(1.6)}/>${i === 3 ? `<text y="8" text-anchor="middle" font-size="22" font-weight="700" fill="${RED}" font-family="'Cormorant Garamond',Georgia,serif">?</text>` : `<circle cy="-2" r="6" fill="#fff8ea" opacity=".7"/>`}</g>`).join('')}</svg>`,
  };

  function question(p) {
    const d = p.data;
    if (p.kind === 'gears') return { q: d.q || 'Жёлтую шестерёнку крутят по стрелке. Куда повернётся последняя?', pic: (s) => gearsSvg(d, s), opts: [['cw', turnIco(true) + 'По часовой'], ['ccw', turnIco(false) + 'Против часовой']] };
    if (p.kind === 'lever') return { q: d.q || 'Куда наклонится рычаг?', note: 'Цифра на гире — её вес, внизу — расстояние до опоры', pic: (s) => leverSvg(d, s), opts: [['L', tiltIco(-1) + 'Влево'], ['E', tiltIco(0) + 'Равновесие'], ['R', tiltIco(1) + 'Вправо']] };
    if (p.kind === 'seq') return { q: d.q || 'Что должно стоять вместо знака вопроса?', pic: () => `<div class="bz-row">${d.items.map((x) => `<span class="bz-cell">${figure(x)}</span>`).join('')}<span class="bz-cell bz-qm">?</span></div>`, opts: d.opts.map((o, i) => [String(i), figure(o, 36), label(o)]), grid: true };
    return { q: d.q, pic: () => SKETCH[p.kind] || '', opts: d.opts.map((o, i) => [String(i), `<span class="bz-let">${LET[i]}</span><span class="bz-ot">${esc(o)}</span>`]), list: true };
  }

  const CSS = `
.bz{font-family:"PT Serif",Georgia,serif;color:var(--ink,#3a2313);max-width:780px}
.bz-head{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 18px;margin:0 0 14px}
.bz-head h2{margin:0;flex:1 1 240px;font:700 34px/1.05 "Cormorant Garamond",Georgia,serif}
.bz-head h2 em{display:block;font:400 20px/1.2 "Marck Script",cursive;color:var(--sanguine,#9a3a1b);margin-bottom:2px}
.bz-head h2 small{display:block;font:400 14px/1.45 "PT Serif",Georgia,serif;color:var(--ink-soft,#6e4b2c);margin-top:5px}
.bz-medals{display:flex;gap:6px}
.bz-medal{position:relative;width:46px;height:46px}
.bz-medal svg{width:46px;height:46px;display:block}
.bz-medal b{position:absolute;inset:0;display:grid;place-items:center;font:700 15px "PT Serif",Georgia,serif;color:${INK}}
.bz-medal.now svg{animation:bzTurn 6s linear infinite;filter:drop-shadow(0 0 4px rgba(154,58,27,.45))}
.bz-medal.ok b{color:#3a2313}
@keyframes bzTurn{to{transform:rotate(360deg)}}
.bz-card{position:relative;padding:22px 24px 22px;border-radius:4px;background:linear-gradient(170deg,#fbf3e0,#f3e4c2 70%,#ecd9b0);box-shadow:0 1px 0 rgba(255,255,255,.6) inset,0 10px 26px rgba(74,44,20,.16),0 2px 0 rgba(74,44,20,.12);animation:bzIn .4s ease-out}
.bz-card::before{content:"";position:absolute;inset:8px;border:1.5px solid rgba(74,44,20,.45);outline:1px solid rgba(74,44,20,.25);outline-offset:3px;pointer-events:none;border-radius:2px}
.bz-card::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:4px;background:radial-gradient(circle at 12% 8%,rgba(255,255,255,.35),transparent 40%),radial-gradient(circle at 90% 95%,rgba(160,106,51,.12),transparent 45%)}
@keyframes bzIn{from{opacity:0;transform:translateY(12px) rotate(-.4deg)}}
.bz-top{display:flex;align-items:center;gap:10px;position:relative;z-index:1}
.bz-kind{font:400 22px/1 "Marck Script",cursive;color:var(--sanguine,#9a3a1b)}
.bz-lvl{margin-left:auto;display:flex;gap:2px;color:#c9a227;font-size:15px;letter-spacing:1px}.bz-lvl i{font-style:normal;color:rgba(74,44,20,.25)}
.bz-q{position:relative;z-index:1;margin:8px 0 4px;font:700 25px/1.2 "Cormorant Garamond",Georgia,serif}
.bz-note{font:400 17px "Marck Script",cursive;fill:var(--sanguine,#9a3a1b)}
.bz-hand{position:relative;z-index:1;margin:0 0 6px;font:400 18px/1.3 "Marck Script",cursive;color:var(--ink-soft,#6e4b2c)}
.bz-tick{font:700 12px "PT Serif",Georgia,serif;fill:#6e4b2c}
.bz-stage{position:relative;z-index:1;margin:6px 0 14px}
.bz-pic{display:block;width:100%;max-height:230px;margin:0 auto}
.bz-sketch{display:block;width:130px;margin:0 auto 4px}
.bz-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:14px 10px;border-radius:3px;background-color:#fbf6ea;background-image:linear-gradient(rgba(111,143,166,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(111,143,166,.18) 1px,transparent 1px);background-size:14px 14px;border:1px solid rgba(74,44,20,.2)}
.bz-cell{display:grid;place-items:center;min-width:58px;height:58px;padding:0 8px}
.bz-qm{border:2px dashed var(--sanguine,#9a3a1b);border-radius:8px;font:700 32px "Cormorant Garamond",Georgia,serif;color:var(--sanguine,#9a3a1b);background:rgba(255,248,230,.8)}
.bz-num{font:700 30px "PT Serif",Georgia,serif;color:${INK}}
.bz-opts{position:relative;z-index:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.bz-opts.list{grid-template-columns:1fr}
.bz-opt{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:10px 16px;border:1.5px solid rgba(74,44,20,.55);border-radius:4px;background:#fffaf0;box-shadow:2px 3px 0 rgba(74,44,20,.22);font:700 16.5px "PT Serif",Georgia,serif;color:var(--ink,#3a2313);cursor:pointer;transition:transform .12s,box-shadow .12s}
.bz-opts.list .bz-opt{justify-content:flex-start;text-align:left}
.bz-opt:hover{transform:translate(-1px,-2px);box-shadow:3px 5px 0 rgba(74,44,20,.22);border-color:var(--sanguine,#9a3a1b)}
.bz-opt:active{transform:translate(1px,1px);box-shadow:1px 1px 0 rgba(74,44,20,.22)}
.bz-opt[disabled]{cursor:default;transform:none}
.bz-let{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1.5px solid ${INK};font:700 17px "Cormorant Garamond",Georgia,serif;background:#f3e4c2}
.bz-ot{font-weight:400}
.bz-opt.ok{background:#eaf4e0;border-color:#3f6a32;color:#2f5f2a;box-shadow:2px 3px 0 rgba(63,106,50,.35)}.bz-opt.ok .bz-let{background:#5d8a48;color:#fff;border-color:#3f6a32}
.bz-opt.bad{background:#f6e0d6;border-color:#a65435;animation:bzShake .42s}.bz-opt.bad .bz-let{background:#b45f3d;color:#fff}
.bz-opt.dim{opacity:.5}
@keyframes bzShake{20%{transform:translateX(-7px) rotate(-1deg)}60%{transform:translateX(6px) rotate(1deg)}}
.bz-stamp{position:absolute;z-index:3;right:26px;top:var(--st,18px);padding:6px 14px;border:3px double ${RED};border-radius:6px;color:${RED};font:700 26px/1 "Cormorant Garamond",Georgia,serif;letter-spacing:.06em;text-transform:uppercase;transform:rotate(-12deg);background:rgba(255,248,230,.55);animation:bzStamp .45s cubic-bezier(.3,1.7,.5,1)}
@keyframes bzStamp{from{opacity:0;transform:rotate(-12deg) scale(2.2)}}
.bz-memo{position:relative;z-index:1;margin:14px 0 0;padding:12px 16px 12px 18px;background:#fbeeb0;box-shadow:2px 4px 10px rgba(74,44,20,.18);transform:rotate(-.8deg);font:400 20px/1.35 "Marck Script",cursive;color:#4a2c14;animation:bzIn .3s}
.bz-memo::before{content:"";position:absolute;top:-9px;left:50%;width:64px;height:18px;margin-left:-32px;background:rgba(201,162,39,.35);transform:rotate(2deg)}
.bz-why{position:relative;z-index:1;margin:14px 0 0;padding:4px 0 4px 16px;border-left:3px solid var(--sanguine,#9a3a1b);font-size:15.5px;line-height:1.55;animation:bzIn .3s}
.bz-why b{display:block;font:700 19px "Cormorant Garamond",Georgia,serif;margin-bottom:2px}
.bz-next{position:relative;z-index:1;margin-top:14px;display:flex;justify-content:flex-end}
.bz-gain{position:absolute;z-index:4;right:40px;top:76px;display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:18px;background:#e3b341;border:1.5px solid #8a6d1f;color:#3a2313;font-weight:700;box-shadow:0 3px 0 #8a6d1f;animation:bzGain 1.8s ease-out forwards}
@keyframes bzGain{0%{opacity:0;transform:translateY(14px) scale(.7)}15%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-22px)}}
.bz-cw,.bz-ccw{transform-box:fill-box;transform-origin:center;animation:bzTurn 3s linear infinite}.bz-ccw{animation-direction:reverse}
.bz-beam{transition:transform 1.1s cubic-bezier(.4,1.7,.5,1);transform-origin:0 0}
.bz-done{text-align:center;padding:30px 24px}
.bz-done .laurel{width:150px;display:block;margin:0 auto}
.bz-done h3{position:relative;z-index:1;margin:6px 0;font:700 32px/1.1 "Cormorant Garamond",Georgia,serif}
.bz-done p{position:relative;z-index:1;color:var(--ink-soft,#6e4b2c);margin:0 0 16px}
.bz-done .hero-btns{position:relative;z-index:1}
@media(max-width:600px){.bz-head h2{font-size:28px}.bz-q{font-size:21px}.bz-card{padding:20px 16px}.bz-opts{grid-template-columns:1fr 1fr}.bz-opts.list{grid-template-columns:1fr}.bz-cell{min-width:44px;height:48px;padding:0 3px}.bz-cell svg{width:34px;height:34px}.bz-num{font-size:26px}.bz-stamp{font-size:20px;right:12px}.bz-medal,.bz-medal svg{width:38px;height:38px}}
@media(prefers-reduced-motion:reduce){.bz-card,.bz-cw,.bz-ccw,.bz-gain,.bz-opt.bad,.bz-stamp,.bz-medal.now svg,.bz-memo,.bz-why{animation:none}.bz-beam{transition:none}}
`;
  function style() { if (window.Path) Path.style(); else if (H()) H().style(); if (document.getElementById('brain-css')) return; const s = document.createElement('style'); s.id = 'brain-css'; s.textContent = CSS; document.head.append(s); }

  const medal = (i, p, now) => {
    const ok = p.state === 'ok', fail = p.state === 'fail';
    return `<span class="bz-medal${ok ? ' ok' : ''}${now ? ' now' : ''}" title="Задачка ${i + 1}"><svg viewBox="-24 -24 48 48">${gearShape(19, 10, ok ? '#e3b341' : fail ? '#cfc6b8' : now ? '#f1d9b0' : '#efe4cc', { plain: true })}</svg><b>${ok ? '✓' : fail ? '–' : i + 1}</b></span>`;
  };
  const laurel = `<svg class="laurel" viewBox="0 0 160 110" aria-hidden="true">${[-1, 1].map((s) => `<g transform="translate(80 0) scale(${s} 1)">${[0, 1, 2, 3, 4, 5].map((k) => { const a = 200 - k * 22, r = 46, x = r * Math.cos((a * Math.PI) / 180) * -1, y = 60 - r * Math.sin((a * Math.PI) / 180); return `<path d="M${f1(x)} ${f1(y)}c-10-4-14-12-12-20 9 3 14 10 12 20z" fill="#a3b47f" ${st(1.3)}/>`; }).join('')}<path d="M-6 100c-30-10-44-40-40-74" fill="none" ${st(1.6)}/></g>`).join('')}<g transform="translate(80 54)">${gearShape(24, 12, '#e3b341')}</g></svg>`;

  async function open(el, { sb, onChange, onCity, onMemo }) {
    style();
    const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message || 'Ошибка'); return data; };
    el.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Готовим задачки…</p>';
    let T;
    try { T = await rpc('brain_today'); } catch (e) { el.innerHTML = `<p class="note">Разминка пока не открылась: ${esc(e.message)}</p>`; return; }
    let list = T.puzzles || [], extra = null;   // extra — режим «Ещё задачки»: { left } — сколько нерешённых в банке
    const left = () => list.findIndex((p) => p.state === 'new' || p.state === 'retry');
    let cur = left();

    function head() {
      if (extra) return `<div class="bz-head"><h2><em>Тетрадь изобретателя</em>Ещё задачки<small>Сколько хочешь · за верный ответ 2 ⚙ · в банке осталось ${extra.left} ${plural(extra.left, 'новая', 'новые', 'новых')}</small></h2></div>`;
      return `<div class="bz-head"><h2><em>Тетрадь изобретателя</em>Разминка ума<small>${list.length} ${plural(list.length, 'задачка', 'задачки', 'задачек')} на сегодня · за верный ответ до 5 ⚙ и очки героя</small></h2>`
        + `<div class="bz-medals">${list.map((p, i) => medal(i, p, i === cur)).join('')}</div></div>`;
    }
    function done() {
      const ok = list.filter((p) => p.state === 'ok').length, g = list.reduce((a, p) => a + (p.gears || 0), 0);
      el.innerHTML = `<div class="bz">${head()}<div class="bz-card bz-done">${laurel}<h3>${ok === list.length ? 'Всё верно — ты молодец!' : 'Разминка пройдена!'}</h3><p>Верно: ${ok} из ${list.length}${g ? ` · заработано <b>${g} ⚙</b>` : ''}. Завтра — новые задачки. Не пропусти, чтобы не прервать серию 🔥</p>`
        + `<div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main" data-more>Ещё задачки · 2 ⚙</button>${onMemo ? '<button type="button" class="hero-b" data-memo>🃏 Мемо · до 14 ⚙</button>' : ''}${onCity ? '<button type="button" class="hero-b" data-city>В мой город</button>' : ''}</div></div></div>`;
      bind();
    }
    function bind() {
      const c = el.querySelector('[data-city]'); if (c) c.onclick = onCity;
      const m = el.querySelector('[data-memo]'); if (m) m.onclick = onMemo;
      const x = el.querySelector('[data-more]'); if (x) x.onclick = more;
    }
    // «Ещё задачки»: следующая из банка (решённые раньше не повторяются)
    async function more() {
      el.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Ищем задачку…</p>';
      let r; try { r = await rpc('brain_more'); } catch (e) { el.innerHTML = `<p class="note">Задачки не открылись: ${esc(e.message)}</p>`; return; }
      extra = { left: r.left || 0 };
      if (!r.puzzle) {
        el.innerHTML = `<div class="bz">${head()}<div class="bz-card bz-done">${laurel}<h3>Ты решил все задачки!</h3><p>Новые появятся позже, а шестерёнки можно заработать в Мемо.</p>`
          + `<div class="hero-btns" style="justify-content:center">${onMemo ? '<button type="button" class="hero-b main" data-memo>🃏 Сыграть в Мемо</button>' : ''}${onCity ? '<button type="button" class="hero-b" data-city>В мой город</button>' : ''}</div></div></div>`;
        return bind();
      }
      list = [r.puzzle]; cur = 0; show(); el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function show() {
      if (cur < 0) return done();
      const p = list[cur], Q = question(p), lv = p.level || 1;
      el.innerHTML = `<div class="bz">${head()}<div class="bz-card"><div class="bz-top"><span class="bz-kind">${KIND[p.kind] || 'Задачка'}</span><span class="bz-lvl" title="Сложность">${'★'.repeat(lv)}<i>${'★'.repeat(3 - lv)}</i></span></div>`
        + `<p class="bz-q">${esc(Q.q)}</p>${Q.note ? `<p class="bz-hand">${esc(Q.note)}</p>` : ''}<div class="bz-stage">${Q.pic(false)}</div>`
        + `<div class="bz-opts${Q.list ? ' list' : ''}">${Q.opts.map(([v, t, lab]) => `<button type="button" class="bz-opt" data-v="${esc(v)}"${lab ? ` aria-label="${esc(lab)}"` : ''}>${t}</button>`).join('')}</div>`
        + (p.state === 'retry' ? `<div class="bz-memo">Подсказка: ${esc(p.hint || 'подумай ещё раз.')}</div>` : '') + '<div class="bz-out"></div></div></div>';
      el.querySelectorAll('.bz-opt').forEach((b) => (b.onclick = () => answer(p, Q, b)));
    }
    async function answer(p, Q, btn) {
      const all = [...el.querySelectorAll('.bz-opt')]; all.forEach((b) => (b.disabled = true));
      let r;
      try { r = await rpc(extra ? 'brain_extra_answer' : 'brain_answer', { p_id: p.id, p_answer: btn.dataset.v }); }
      catch (e) { all.forEach((b) => (b.disabled = false)); el.querySelector('.bz-out').innerHTML = `<div class="bz-why"><b>Не получилось отправить</b>${esc(e.message)}</div>`; return; }
      const out = el.querySelector('.bz-out'), card = el.querySelector('.bz-card'), memo = card.querySelector('.bz-memo');
      const next = () => `<div class="bz-next">${extra && onCity ? '<button type="button" class="btn" data-city style="margin-right:auto">В мой город</button>' : ''}<button type="button" class="btn primary" data-go>${extra || left() >= 0 ? 'Следующая задачка →' : 'Готово'}</button></div>`;
      if (r.ok) {
        p.state = 'ok'; p.gears = r.gears || 0; btn.classList.add('ok'); all.forEach((b) => b !== btn && b.classList.add('dim')); H() && H().ding(true);
        if (memo) memo.remove();
        el.querySelector('.bz-stage').innerHTML = Q.pic(true);
        card.style.setProperty('--st', el.querySelector('.bz-stage').offsetTop + 'px');
        card.insertAdjacentHTML('beforeend', `<div class="bz-stamp">Верно!</div>${r.gears ? `<span class="bz-gain">+${r.gears} ⚙</span>` : ''}`);
        out.innerHTML = `<div class="bz-why"><b>Почему так</b>${esc(r.explain || '')}</div>${next()}`;
      } else if (r.retry) {
        p.state = 'retry'; p.hint = r.hint; btn.classList.add('bad'); H() && H().ding(false);
        all.forEach((b) => { if (b !== btn) b.disabled = false; });
        if (!memo) out.innerHTML = `<div class="bz-memo">Не совсем! ${esc(r.hint || 'Подумай ещё раз.')} Попробуй ещё раз.</div>`;
        return;
      } else {
        p.state = 'fail'; btn.classList.add('bad'); if (memo) memo.remove();
        const right = all.find((b) => b.dataset.v === String(r.answer)); if (right) right.classList.add('ok');
        all.forEach((b) => b !== btn && b !== right && b.classList.add('dim'));
        el.querySelector('.bz-stage').innerHTML = Q.pic(true);
        out.innerHTML = `<div class="bz-why"><b>Ничего страшного — разберёмся</b>${esc(r.explain || '')}</div>${next()}`;
      }
      if (extra) extra.left = Math.max(0, extra.left - 1);
      else el.querySelector('.bz-medals').outerHTML = `<div class="bz-medals">${list.map((q, i) => medal(i, q, false)).join('')}</div>`;
      onChange && onChange();
      bind();
      out.querySelector('[data-go]').onclick = () => { if (extra) return more(); cur = left(); show(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    }
    show();
  }

  window.Brain = { open, style, figure };
})();
