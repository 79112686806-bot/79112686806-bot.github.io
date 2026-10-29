// Мой город: градостроитель в духе эскизов (чернила + акварель на пергаменте). Город один у ученика и растёт вместе с курсом:
// эпоха = сколько блоков курса пройдено (стоянка древних людей → деревня у реки → долина мельниц → мастерская Леонардо →
// город первых автомобилей → город будущего). С новой эпохой поле становится больше, а дома и «сердце города» перерисовываются.
// Постройки открываются эпохой или темой курса (первая постройка за тему — подарок), строятся за шестерёнки и раз в день
// приносят доход (монетки над постройками). Реки, дороги и леса ставятся подряд, мост — только на реку, водяная мельница — у реки;
// землю можно докупить. Управление как в градостроителях: карту тянуть и приближать (колёсико, два пальца), постройка-«призрак»
// с ✓ / ✕, перетаскивание. Всё решает сервер: city_state, city_place, city_move, city_sell, city_collect, city_expand.
// City.open(el, { sb, onChange }) — onChange() после трат и сбора (обновить панель наград). Нужны hero.js (окна, звук) и path.js.
(function () {
  const H = () => window.Hero;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
  const gear = (s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke-width="3.4" stroke-dasharray="2.6 2.9"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="2"/></svg>`;
  const rnd = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f1 = (n) => Math.round(n * 10) / 10;
  const INK = '#4a2c14', INK2 = '#6e4b2c';
  const st = `stroke="${INK}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"`;
  const TW = 64, TH = 32;                                   // клетка в изометрии
  const scr = (x, y) => [(x - y) * TW / 2, (x + y) * TH / 2];

  // эпохи: название, цвет земли, размер поля (радиус от центра)
  const ERAS = [
    { name: 'Стоянка древних людей', ground: ['#dcc493', '#d4ba84'], wild: '#c7ad7a', r: 2 },
    { name: 'Деревня у реки', ground: ['#e0cc8a', '#d8c27c'], wild: '#cdb873', r: 3 },
    { name: 'Долина мельниц', ground: ['#c3d197', '#b9c88b'], wild: '#a9bb7f', r: 3 },
    { name: 'Мастерская Леонардо', ground: ['#d9c4a0', '#d0b993'], wild: '#bfae8a', r: 4 },
    { name: 'Город первых автомобилей', ground: ['#d2c6b0', '#c8bba3'], wild: '#b6aa92', r: 4 },
    { name: 'Город будущего', ground: ['#c9dadd', '#bccfd3'], wild: '#a9c0c4', r: 5 },
  ];

  // ---------- Рисование в изометрии: всё строится вокруг центра клетки (0,0) ----------
  const P = (p) => f1(p[0]) + ' ' + f1(p[1]);
  const poly = (pts, fill, extra = '') => `<path d="M${pts.map(P).join('L')}z" fill="${fill}" ${st}${extra}/>`;
  const up = (p, h) => [p[0], p[1] - h];
  const corners = (s, lift = 0, ox = 0, oy = 0) => { const a = 32 * s, b = 16 * s; return { L: [ox - a, oy - lift], B: [ox, oy + b - lift], R: [ox + a, oy - lift], T: [ox, oy - b - lift] }; };
  // коробка: левая стена, правая стена, крыша-площадка
  function box(s, h, l, r, t, lift = 0, ox = 0, oy = 0) {
    const c = corners(s, lift, ox, oy);
    return poly([c.L, c.B, up(c.B, h), up(c.L, h)], l) + poly([c.B, c.R, up(c.R, h), up(c.B, h)], r) + poly([up(c.T, h), up(c.R, h), up(c.B, h), up(c.L, h)], t);
  }
  // четырёхскатная крыша-пирамида над стенами высотой h
  function pyramid(s, h, rh, l, r, lift = 0) {
    const c = corners(s, lift), A = [0, -lift - h - rh];
    return poly([up(c.T, h), up(c.R, h), A], r) + poly([up(c.L, h), up(c.T, h), A], l) + poly([up(c.L, h), up(c.B, h), A], l) + poly([up(c.B, h), up(c.R, h), A], r);
  }
  // двускатная крыша: конёк вдоль левой стены
  function gable(s, h, rh, l, r, back, lift = 0) {
    const c = corners(s, lift), mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const P1 = up(mid(c.L, c.T), h + rh), P2 = up(mid(c.B, c.R), h + rh);
    return poly([P1, P2, up(c.R, h), up(c.T, h)], back) + poly([up(c.L, h), up(c.B, h), P2, P1], l) + poly([up(c.B, h), up(c.R, h), P2], r);
  }
  // прямоугольник на стене: u — доля вдоль стены, v — высота (окна, двери)
  function onWall(side, s, u0, u1, v0, v1, fill, lift = 0) {
    const c = corners(s, lift), [p, q] = side === 'l' ? [c.L, c.B] : [c.B, c.R];
    const at = (u, v) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u - v];
    return poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], fill, ' stroke-width="1"');
  }
  function cyl(rx, h, body, top, lift = 0, ox = 0) {
    const ry = rx / 2;
    return `<path d="M${f1(ox - rx)} ${f1(-lift - h)}L${f1(ox - rx)} ${f1(-lift)}A${rx} ${ry} 0 0 0 ${f1(ox + rx)} ${f1(-lift)}L${f1(ox + rx)} ${f1(-lift - h)}z" fill="${body}" ${st}/>`
      + `<ellipse cx="${f1(ox)}" cy="${f1(-lift - h)}" rx="${rx}" ry="${ry}" fill="${top}" ${st}/>`;
  }
  const flat = (s, fill, extra = '') => { const c = corners(s); return poly([c.L, c.B, c.R, c.T], fill, extra); };
  // колесо со спицами (крутится, если spin)
  const wheel = (cx, cy, r, spokes = 8, fill = '#c9955a', spin = '') => `<g transform="translate(${cx} ${cy})"><g class="${spin}"><circle r="${r}" fill="none" stroke="${INK}" stroke-width="${f1(r * 0.22)}"/><circle r="${f1(r * 0.82)}" fill="none" stroke="${fill}" stroke-width="${f1(r * 0.12)}"/>`
    + Array.from({ length: spokes }, (_, i) => { const a = (i * 2 * Math.PI) / spokes; return `<path d="M0 0L${f1(r * Math.cos(a))} ${f1(r * Math.sin(a))}" stroke="${INK}" stroke-width="1.1"/>`; }).join('')
    + `<circle r="${f1(Math.max(2, r * 0.18))}" fill="${INK}"/></g></g>`;
  const smoke = (x, y, c = '#b8ab95') => `<g class="ct-smoke" transform="translate(${x} ${y})"><circle cx="0" cy="0" r="4" fill="${c}"/><circle cx="3" cy="-8" r="5" fill="${c}"/><circle cx="0" cy="-18" r="6" fill="${c}"/></g>`;
  const flame = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="ct-flame"><path d="M0 0c-7-3-7-11-2-16 0 4 2 5 3 5 0-4 2-7 5-9-1 6 5 8 0 20z" fill="#e0661b" ${st}/><path d="M1 0c-3-2-3-5 0-8 0 2 1 3 2 3 1 2 1 3-2 5z" fill="#ffd36b"/></g></g>`;
  const person = (x, y, c = '#9a3a1b') => `<g transform="translate(${x} ${y})"><path d="M-3 0l1-8h4l1 8" fill="${c}" ${st}/><circle cy="-11" r="3" fill="#e9c9a0" ${st}/></g>`;

  // ---------- Постройки: (эпоха, случайность) → рисунок; у дома и «сердца города» — свой вид в каждой эпохе ----------
  const HOUSE = [
    () => pyramid(0.5, 0, 34, '#c9a25a', '#b08a45') + `<path d="M-6-30l6-6 6 6M0-36v-6" fill="none" stroke="${INK}" stroke-width="1.4"/>` + poly([[-10, 2], [-3, 5], [-6, -9]], '#4a2c14'),
    () => box(0.55, 14, '#dcbf8e', '#c9a877', '#e6cc9c') + pyramid(0.66, 14, 16, '#d4b062', '#bf9a4c') + onWall('l', 0.55, 0.55, 0.8, 0, 9, '#5c3a1c'),
    (r) => box(0.58, 18, '#efe2c4', '#dccaa3', '#f3e8d0') + gable(0.68, 18, 14, r > 0.5 ? '#b45f3d' : '#c0704a', '#a65435', '#9a4f33') + onWall('l', 0.58, 0.2, 0.42, 7, 14, '#8fb2c4') + onWall('r', 0.58, 0.3, 0.55, 0, 11, '#7a4a24'),
    () => box(0.62, 24, '#e0cba2', '#ccb48a', '#ead8b2') + pyramid(0.7, 24, 11, '#c0704a', '#a65d3c') + [0.15, 0.55].map((u) => onWall('l', 0.62, u, u + 0.2, 8, 18, '#8fb2c4')).join('') + onWall('r', 0.62, 0.35, 0.6, 0, 13, '#7a4a24'),
    () => box(0.58, 32, '#c98a66', '#b37552', '#d79a76') + gable(0.64, 32, 9, '#6e5a4e', '#5e4c42', '#57463d') + [6, 18].map((v) => [0.12, 0.55].map((u) => onWall('l', 0.58, u, u + 0.2, v, v + 8, '#f3d27a')).join('')).join('') + box(0.12, 12, '#a8664a', '#8e5038', '#b97a5e', 38, 8, -6) + smoke(8, -62),
    () => box(0.6, 34, '#eef3f4', '#d5e0e4', '#f6fafb') + onWall('l', 0.6, 0.05, 0.95, 10, 26, '#8fc3d6') + onWall('r', 0.6, 0.05, 0.95, 14, 26, '#7ab3c8') + `<path d="M-12-44l10-5 14 7-10 5z" fill="#6f8fa6" ${st}/><path d="M-8-46l14 7" stroke="#cfe0ea" stroke-width=".8"/><circle cx="12" cy="-45" r="5" fill="#a3b47f" ${st}/>`,
  ];
  const HALL = [
    () => [[-20, 6], [18, 6], [0, 16], [0, -6], [-14, -4], [14, -4]].map(([x, y]) => `<path d="M${x - 5} ${y}l2-5 6-1 3 6z" fill="#cbb999" ${st}/>`).join('') + `<path d="M-10 4l20-6M-10-2l20 6" stroke="#6b4420" stroke-width="3.5" stroke-linecap="round"/>` + flame(0, 0, 1.4) + smoke(2, -40) + `<path d="M24-2v-40" stroke="${INK}" stroke-width="3"/><path d="M18-40h12l-2 8h-8z" fill="#b45f3d" ${st}/><circle cx="24" cy="-46" r="4" fill="#e3b341" ${st}/>`,
    () => box(0.78, 18, '#dcbf8e', '#c9a877', '#e6cc9c') + pyramid(0.9, 18, 24, '#d4b062', '#bf9a4c') + onWall('l', 0.78, 0.4, 0.62, 0, 12, '#5c3a1c') + `<path d="M0-42v-16" stroke="${INK}" stroke-width="1.6"/><path d="M0-58h12l-3 4 3 4H0z" fill="#9a3a1b" ${st}/>`,
    () => box(0.8, 22, '#efe2c4', '#dccaa3', '#f3e8d0') + gable(0.9, 22, 14, '#b45f3d', '#a65435', '#9a4f33') + box(0.3, 46, '#e2cfa6', '#cfb88c', '#ead8b2', 0, 0, -2) + pyramid(0.36, 46, 16, '#b45f3d', '#9a4f33') + `<circle cx="-4" cy="-38" r="4.5" fill="#fff8ea" ${st}/><path d="M-4-38v-3M-4-38l2 1" stroke="${INK}" stroke-width=".9"/>`,
    () => box(0.86, 28, '#e0cba2', '#ccb48a', '#ead8b2') + `<path d="M-18-30a18 17 0 0 1 36 0z" fill="#c0704a" ${st}/><path d="M-6-44a8 6 0 0 1 12 0" fill="none" stroke="#e7a37e" stroke-width="2"/><path d="M0-47v-10" stroke="${INK}" stroke-width="1.4"/><circle cx="0" cy="-58" r="2.5" fill="#e3b341" ${st}/>` + [0.1, 0.4, 0.7].map((u) => onWall('l', 0.86, u, u + 0.16, 6, 20, '#8fb2c4')).join('') + onWall('r', 0.86, 0.4, 0.6, 0, 16, '#7a4a24'),
    () => box(0.86, 30, '#c98a66', '#b37552', '#d79a76') + gable(0.92, 30, 10, '#6e5a4e', '#5e4c42', '#57463d') + box(0.3, 64, '#c98a66', '#b37552', '#d79a76', 0, 0, -2) + pyramid(0.36, 64, 14, '#6e5a4e', '#57463d') + `<circle cx="-4" cy="-54" r="6" fill="#fff8ea" ${st}/><path d="M-4-54v-4M-4-54l3 1" stroke="${INK}" stroke-width="1"/>` + [0.1, 0.65].map((u) => onWall('l', 0.86, u, u + 0.2, 8, 20, '#f3d27a')).join(''),
    () => cyl(16, 70, '#dfe9ec', '#f6fafb') + `<path d="M-16-20h32M-16-40h32M-16-60h32" stroke="#7ab3c8" stroke-width="5"/><ellipse cx="0" cy="-48" rx="26" ry="9" fill="none" stroke="#6f8fa6" stroke-width="3"/><path d="M0-78v-16" stroke="${INK}" stroke-width="1.6"/><circle class="ct-blink" cx="0" cy="-96" r="3.5" fill="#e0661b"/>`,
  ];
  const ART = {
    hall: (e) => HALL[e](),
    tree: (e, r) => r > 0.5
      ? `<path d="M0 4v-12" stroke="${INK}" stroke-width="2.2"/><path d="M0-40l-10 14h5l-9 12h28l-9-12h5z" fill="#7f9a6a" ${st}/><path d="M-1-34l-5 9" stroke="#b8c99f" stroke-width="1.2"/>`
      : `<path d="M0 4v-14" stroke="${INK}" stroke-width="2.2"/><path d="M-13-14c-5-10 4-20 13-18 7-7 19 1 15 11 6 6-1 15-9 13-5 6-15 4-16-2-6 0-7-2-3-4z" fill="${r > 0.25 ? '#a9b984' : '#93aa78'}" ${st}/><path d="M-7-24c4-5 9-6 13-4" fill="none" stroke="#e8efd2" stroke-width="2" opacity=".7"/>`,
  };
  const FLOWERBED = () => flat(0.5, '#a3b47f') + [[-8, 0, '#d4804f'], [0, -4, '#e3b341'], [6, 1, '#b85c8a'], [-2, 4, '#e3b341'], [9, -3, '#d4804f']].map(([x, y, c]) => `<path d="M${x} ${y}v-5" stroke="${INK2}" stroke-width=".9"/><circle cx="${x}" cy="${y - 6}" r="2.6" fill="${c}" ${st} stroke-width=".7"/>`).join('');
  Object.assign(ART, {
    fire: () => [[-12, 2], [12, 2], [0, 8], [0, -5]].map(([x, y]) => `<path d="M${x - 5} ${y}l2-5 6-1 3 6z" fill="#cbb999" ${st}/>`).join('') + `<path d="M-8 3l16-5M-8-2l16 5" stroke="#6b4420" stroke-width="3" stroke-linecap="round"/>` + flame(0, 0, 1) + smoke(1, -30),
    well: () => cyl(13, 12, '#c9b79a', '#5f7f8f') + `<ellipse cx="0" cy="-12" rx="9" ry="4" fill="#8fb2c4"/><path d="M-12-12v-26M12-12v-26" stroke="${INK}" stroke-width="2.2"/><path d="M-18-36L0-48l18 12z" fill="#b45f3d" ${st}/><path d="M-12-30h24" stroke="${INK}" stroke-width="1.6"/><path d="M2-30v10" stroke="${INK2}" stroke-width="1"/><rect x="-1" y="-22" width="6" height="5" fill="#a06a33" ${st}/>`,
    stall: () => box(0.55, 12, '#d9b98a', '#c9a877', '#e6cc9c') + `<path d="M-22-14l22 11 22-11-4-12-18 8-18-8z" fill="#fff8ea" ${st}/><path d="M-14-10l-4-11M-4-5l-4-12M6-6l2-13M16-11l2-11" stroke="#9a3a1b" stroke-width="4"/>` + `<circle cx="-8" cy="-3" r="2.5" fill="#e0661b" ${st}/><circle cx="-2" cy="-1" r="2.5" fill="#a3b47f" ${st}/><circle cx="5" cy="-2" r="2.5" fill="#e3b341" ${st}/>`,
    wheelshop: () => box(0.6, 18, '#dcbf8e', '#c9a877', '#e6cc9c') + gable(0.7, 18, 12, '#9b7b4c', '#86683e', '#7a5f38') + onWall('l', 0.6, 0.45, 0.7, 0, 12, '#5c3a1c') + wheel(20, -12, 11, 8) + wheel(-14, 6, 6, 6) + `<path d="M-20 8l-3-14M-8 8l-3-14" stroke="#8a5a2b" stroke-width="2.4"/>`,
    watermill: () => `<path d="M-30 0l30 15 30-15-30-15z" fill="#8fb2c4" stroke="#5f7f8f" stroke-width="1"/><path class="ct-water" d="M-24 2l10 5M-6 10l10 5M8 0l10 5" stroke="#e5f1f6" stroke-width="1.6"/>` + box(0.5, 22, '#ead6ad', '#d9c196', '#f2e2bf', 0, -6, -4) + gable(0.6, 22, 12, '#b45f3d', '#a65435', '#9a4f33', 0) + wheel(18, -12, 15, 10, '#a06a33', 'ct-spin'),
    windmill: () => box(0.4, 34, '#e2cfa6', '#cfb88c', '#ead8b2') + pyramid(0.48, 34, 12, '#b45f3d', '#9a4f33') + onWall('l', 0.4, 0.4, 0.7, 0, 9, '#7a4a24') + `<g transform="translate(-6 -38)"><g class="ct-spin slow">${[0, 90, 180, 270].map((a) => `<g transform="rotate(${a})"><path d="M0 0v-28" stroke="${INK}" stroke-width="1.5"/><path d="M1-6h7v-22H1z" fill="#fff8ea" ${st}/></g>`).join('')}<circle r="2.6" fill="${INK}"/></g></g>`,
    ferris: () => `<path d="M-16 4l16-50 16 50" fill="none" stroke="${INK}" stroke-width="2.6"/><path d="M-10-12h20" stroke="${INK}" stroke-width="1.6"/>` + `<g transform="translate(0 -46)"><g class="ct-spin slow"><circle r="30" fill="none" stroke="${INK}" stroke-width="2"/><circle r="24" fill="none" stroke="#9a3a1b" stroke-width="1.2"/>${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, x = f1(30 * Math.cos(a)), y = f1(30 * Math.sin(a)); return `<path d="M0 0L${x} ${y}" stroke="${INK2}" stroke-width="1"/><rect x="${f1(x - 4)}" y="${f1(y - 1)}" width="8" height="7" rx="2" fill="${['#e3b341', '#9a3a1b', '#8fb2c4', '#a3b47f'][i % 4]}" ${st} stroke-width=".9"/>`; }).join('')}<circle r="3" fill="${INK}"/></g></g>`,
    lab: () => cyl(18, 26, '#e2cfa6', '#ead8b2') + `<path d="M-18-26a18 16 0 0 1 36 0z" fill="#8fb2c4" ${st}/><path d="M-2-40l20-14 3 4-19 12z" fill="#6e4b2c" ${st}/><path d="M-12-14h6v-8h-6z" fill="#7a4a24" ${st}/>` + `<circle class="ct-blink" cx="21" cy="-55" r="2" fill="#f3d27a"/>`,
    leonardo: () => box(0.66, 22, '#e8d2a6', '#d6be93', '#f0dcb4') + gable(0.76, 22, 12, '#b45f3d', '#a65435', '#9a4f33') + onWall('l', 0.66, 0.15, 0.4, 0, 14, '#7a4a24') + onWall('l', 0.66, 0.6, 0.85, 8, 16, '#8fb2c4') + `<g class="ct-float"><path d="M4-50c-10-9-22-10-32-5 9 0 16 3 21 9M4-50c10-9 22-10 32-5-9 0-16 3-21 9" fill="#fff8ea" ${st}/><path d="M1-48h6l-3 7z" fill="#a06a33" ${st}/></g>` + wheel(22, -14, 8, 10, '#d9b25a', 'ct-spin'),
    fountain: () => `<ellipse cx="0" cy="0" rx="24" ry="12" fill="#c9b79a" ${st}/><ellipse cx="0" cy="-2" rx="19" ry="9" fill="#8fb2c4" ${st}/>` + cyl(4, 16, '#e2cfa6', '#ead8b2', 2) + `<g class="ct-jet"><path d="M0-20c-6-6-12-4-14 4M0-20c6-6 12-4 14 4M0-20v-10" fill="none" stroke="#bfe0ee" stroke-width="2.2"/></g>`,
    lamp: () => `<circle cx="0" cy="-34" r="9" fill="#f6dc8a" opacity=".45"/><path d="M0 2v-32" stroke="${INK}" stroke-width="2"/><path d="M-5-30h10l-2-7h-6z" fill="#f3d27a" ${st}/>`,
    garage: () => box(0.8, 22, '#c9a98a', '#b39377', '#d6b899') + `<path d="M-24-24l8-10v10l8-10v10l8-10v10l8-10v10" fill="none" stroke="${INK}" stroke-width="1.2"/>` + onWall('l', 0.8, 0.1, 0.45, 0, 14, '#6e5a4e') + [0.6, 0.8].map((u) => onWall('l', 0.8, u, u + 0.12, 8, 15, '#f3d27a')).join('') + box(0.14, 46, '#a8664a', '#8e5038', '#b97a5e', 0, 18, -6) + smoke(18, -62) + `<g transform="translate(-28 12)"><path d="M-10 0h20l-2-6h-4l-3-4h-6l-3 4h-2z" fill="#9a3a1b" ${st}/><circle cx="-5" cy="1" r="2.6" fill="${INK}"/><circle cx="6" cy="1" r="2.6" fill="${INK}"/></g>`,
    solar: () => [[-10, -2], [10, 4]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 0v-8" stroke="${INK}" stroke-width="1.6"/><path d="M-12-6l6-12h20l-6 12z" fill="#6f8fa6" ${st}/><path d="M-6-6l6-12M2-6l6-12M-9-12h20" stroke="#cfe0ea" stroke-width=".7"/></g>`).join(''),
    monument: () => box(0.42, 14, '#e2cfa6', '#cfb88c', '#ead8b2') + box(0.3, 8, '#cbb999', '#b5a385', '#d8c8aa', 14) + `<g transform="translate(0 -40)"><g class="ct-spin slow"><circle r="13" fill="#e3b341" stroke="${INK}" stroke-width="5.4" stroke-dasharray="3.4 3.4"/><circle r="10" fill="#e3b341" ${st}/><circle r="3.5" fill="${INK}"/></g></g><path d="M-6-60l6-10 6 10-6-3z" fill="#fff3c4" ${st}/>`,
  });
  // ---------- Земля: дороги, реки, мосты и леса — рисуются с учётом соседей (nb(dx, dy) → код соседней клетки) ----------
  // середины сторон клетки: сосед (x+1) — справа внизу, (x-1) — слева вверху, (y+1) — слева внизу, (y-1) — справа вверху
  const SIDES = [[1, 0, [16, 8], [[0, 16], [32, 0]]], [-1, 0, [-16, -8], [[-32, 0], [0, -16]]], [0, 1, [-16, 8], [[-32, 0], [0, 16]]], [0, -1, [16, -8], [[0, -16], [32, 0]]]];
  const wet = (c) => c === 'water' || c === 'bridge';
  ART.road = (e, r, nb = () => null) => {
    const link = SIDES.filter(([dx, dy]) => ['road', 'bridge'].includes(nb(dx, dy)));
    const col = e >= 4 ? '#8e8478' : '#cdb68c', line = e >= 4 ? '#f3e9d2' : '#b59c70';
    return flat(0.42, col, ' stroke-width=".8"') + link.map(([, , m]) => `<path d="M0 0L${m[0]} ${m[1]}" stroke="${INK}" stroke-width="15" stroke-linecap="round" opacity=".55"/><path d="M0 0L${m[0]} ${m[1]}" stroke="${col}" stroke-width="13" stroke-linecap="round"/>`).join('')
      + link.map(([, , m]) => `<path d="M0 0L${m[0]} ${m[1]}" stroke="${line}" stroke-width="1.2" stroke-dasharray="3 4"/>`).join('')
      + (link.length ? '' : `<path d="M-14-1l28 0" stroke="${line}" stroke-width="1.2" stroke-dasharray="3 4"/>`);
  };
  const waterBase = (nb) => flat(1, '#8fb2c4', ' stroke="#6f93a6" stroke-width=".6"')
    + SIDES.filter(([dx, dy]) => !wet(nb(dx, dy))).map(([, , , [a, b]]) => `<path d="M${P(a)}L${P(b)}" stroke="#d9c08a" stroke-width="5" stroke-linecap="round"/><path d="M${P(a)}L${P(b)}" stroke="${INK2}" stroke-width="1" opacity=".7"/>`).join('')
    + `<g class="ct-ripple"><path d="M-14-2q4-3 8 0t8 0M2 6q4-3 8 0t8 0M-8 8q3-2 6 0" fill="none" stroke="#e5f1f6" stroke-width="1.4" stroke-linecap="round"/></g>`;
  ART.water = (e, r, nb = () => null) => waterBase(nb);
  ART.bridge = (e, r, nb = () => null) => {
    // река течёт вдоль x — мост идёт поперёк, вдоль y (и наоборот)
    const alongX = wet(nb(1, 0)) || wet(nb(-1, 0)), s = alongX ? [24, -12] : [24, 12], w = alongX ? [8, 4] : [-8, 4], L = 6;
    const q = (k, m, lift) => [k * s[0] + m * w[0], k * s[1] + m * w[1] - lift];
    const posts = [-1, -0.5, 0, 0.5, 1].map((k) => [-1, 1].map((m) => { const p = q(k, m, L); return `<path d="M${P(p)}v-7" stroke="${INK}" stroke-width="1.6"/>`; }).join('')).join('');
    return waterBase(nb) + poly([q(-1, -1, 0), q(-1, 1, 0), q(-1, 1, L), q(-1, -1, L)], '#7a5530') + poly([q(-1, 1, 0), q(1, 1, 0), q(1, 1, L), q(-1, 1, L)], '#8a6038')
      + poly([q(-1, -1, L), q(1, -1, L), q(1, 1, L), q(-1, 1, L)], '#c49560')
      + [-0.6, -0.2, 0.2, 0.6].map((k) => `<path d="M${P(q(k, -1, L))}L${P(q(k, 1, L))}" stroke="#8a6038" stroke-width="1"/>`).join('')
      + posts + [-1, 1].map((m) => `<path d="M${P(q(-1, m, L + 7))}L${P(q(1, m, L + 7))}" stroke="${INK}" stroke-width="1.8"/>`).join('');
  };
  // ---------- Объединения: поля, леса, клумбы и дома рядом срастаются (g — группа: n клеток, front — передняя клетка, на ней украшения) ----------
  const GROUP = { field: 'Большое поле', forest: 'Чаща', flowers: 'Парк', house: 'Квартал' };
  const diamond = (fill, k = 1, extra = '') => { const c = corners(k); return `<path d="M${[c.L, c.B, c.R, c.T].map(P).join('L')}z" fill="${fill}"${extra}/>`; };
  const along = (a, b, u, k = 0.93) => [(a[0] + (b[0] - a[0]) * u) * k, (a[1] + (b[1] - a[1]) * u) * k];
  // забор по краям группы (стороны без соседа того же вида)
  const fence = (sides, col = '#8a5a2b') => sides.map(([, , , [a, b]]) => [0, 0.25, 0.5, 0.75, 1].map((u) => `<path d="M${P(along(a, b, u))}v-6" stroke="${INK}" stroke-width="1.5"/>`).join('')
    + `<path d="M${P(up(along(a, b, 0), 4))}L${P(up(along(a, b, 1), 4))}" stroke="${col}" stroke-width="1.6"/>`).join('');
  const hay = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-9 0c-1-9 3-14 9-14s10 5 9 14z" fill="#e3b341" ${st}/><path d="M-5-5c2-4 6-6 9-5M-7-1h14" fill="none" stroke="#b08a2e" stroke-width="1"/></g>`;
  const scarecrow = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 2v-24M-9-16h18" stroke="${INK}" stroke-width="1.8"/><path d="M-5-16l2 8h6l2-8z" fill="#9a3a1b" ${st}/><circle cy="-25" r="4" fill="#e9c9a0" ${st}/><path d="M-7-28h14l-7-6z" fill="#a06a33" ${st}/></g>`;
  const bench = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-8 0v-5M8 0v-5M-10-5h20" stroke="${INK}" stroke-width="1.6"/><path d="M-10-5l2-5h16l2 5" fill="#a06a33" ${st}/></g>`;
  const gazebo = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-10 2v-16M10 2v-16M-4 4v-16M4 0v-16" stroke="${INK}" stroke-width="1.5"/><path d="M-14-14l14-12 14 12z" fill="#fff8ea" ${st}/><path d="M0-26v-5" stroke="${INK}" stroke-width="1.4"/></g>`;
  ART.field = (e, r, nb = () => null, g) => {
    const big = SIDES.some(([dx, dy]) => nb(dx, dy) === 'field'), c = corners(big ? 1 : 0.82), lerp = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    const rows = big ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0.2, 0.4, 0.6, 0.8];
    return (big ? diamond('#e9cf7a') : flat(0.82, '#e9cf7a')) + rows.map((u) => { const a = lerp(c.L, c.T, u), b = lerp(c.B, c.R, u); return `<path d="M${P(a)}L${P(b)}" stroke="#b08a2e" stroke-width="1.3"/><path d="M${P(lerp(a, b, 0.3))}l1-6M${P(lerp(a, b, 0.7))}l1-6" stroke="#8a6d1f" stroke-width="1.2"/>`; }).join('')
      + (big ? fence(SIDES.filter(([dx, dy]) => nb(dx, dy) !== 'field')) : '')
      + (g && g.front ? (g.n >= 3 ? hay(-9, 3) : '') + (g.n >= 5 ? scarecrow(13, -1) : '') + (g.n >= 8 ? hay(2, 10) : '') : '');
  };
  ART.forest = (e, r, nb = () => null, g) => {
    const link = SIDES.filter(([dx, dy]) => nb(dx, dy) === 'forest');
    return (link.length ? diamond('#93aa78', 1, ' opacity=".55"') : '')
      + [...link.map(([, , m], i) => [m[0] * 0.72, m[1] * 0.72 - 2, 0.15 + i * 0.2]), [-14, -4, 0.8], [12, -6, 0.3], [0, 2, 0.6], [-4, -10, 0.1], [16, 6, 0.9]]
        .sort((a, b) => a[1] - b[1]).map(([x, y, k]) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(.72)">${ART.tree(e, (k + r) % 1)}</g>`).join('')
      + (g && g.front && g.n >= 4 ? `<g transform="translate(-20 10)"><path d="M-3 0v-4M3 0v-4" stroke="${INK}" stroke-width="1.4"/><path d="M-7-4c0-6 14-6 14 0z" fill="#c0704a" ${st}/><circle cx="-2" cy="-6" r="1.2" fill="#fff8ea"/><circle cx="3" cy="-5" r="1" fill="#fff8ea"/></g>` : '');
  };
  ART.flowers = (e, r, nb = () => null, g) => {
    const link = SIDES.filter(([dx, dy]) => nb(dx, dy) === 'flowers');
    if (!link.length) return FLOWERBED();
    return diamond('#a3b47f') + SIDES.filter(([dx, dy]) => nb(dx, dy) !== 'flowers').map(([, , , [a, b]]) => `<path d="M${P(along(a, b, 0.05, 0.9))}L${P(along(a, b, 0.95, 0.9))}" stroke="#5f7a4a" stroke-width="5" stroke-linecap="round"/><path d="M${P(up(along(a, b, 0.05, 0.9), 1.5))}L${P(up(along(a, b, 0.95, 0.9), 1.5))}" stroke="#7f9a6a" stroke-width="2.4" stroke-linecap="round"/>`).join('')
      + link.map(([, , m]) => `<path d="M0 0L${m[0]} ${m[1]}" stroke="#e8dcc0" stroke-width="7" stroke-linecap="round"/>`).join('') + `<circle r="5" fill="#e8dcc0"/>`
      + [[-12, -2, '#d4804f'], [12, -3, '#e3b341'], [-4, 7, '#b85c8a'], [6, 7, '#d4804f'], [2, -8, '#b85c8a']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${c}" ${st} stroke-width=".6"/>`).join('')
      + (g && g.front ? (g.n >= 3 ? bench(-12, 4) : '') + (g.n >= 5 ? gazebo(10, -2) : '') : '');
  };
  // дома рядом — квартал: мощёный двор между домами
  const yard = (nb) => SIDES.filter(([dx, dy]) => nb(dx, dy) === 'house').map(([, , m]) => `<path d="M0 2L${m[0]} ${m[1] + 2}" stroke="#a89878" stroke-width="16" stroke-linecap="round"/><path d="M0 2L${m[0]} ${m[1] + 2}" stroke="#d8c9a6" stroke-width="13" stroke-linecap="round" stroke-dasharray="4 2"/>`).join('');
  ART.house = (e, r, nb = () => null) => yard(nb) + HOUSE[e](r);

  // жители бродят у домов (оживляет город)
  const walkers = (n, r) => Array.from({ length: n }, (_, i) => `<g class="ct-walk" style="--d:${(r() * 6).toFixed(1)}s;--x:${Math.round(r() * 24 - 12)}px">${person(Math.round(r() * 20 - 10), Math.round(r() * 8 + 6), ['#9a3a1b', '#5f7f8f', '#7f9a6a', '#a06a33'][i % 4])}</g>`).join('');
  const FLAT = new Set(['road', 'water', 'bridge', 'field', 'flowers']);           // лежат на земле — рисуются первыми
  const PAINT = new Set(['road', 'water', 'forest', 'tree', 'flowers', 'lamp', 'field']);  // ставятся подряд: нажал — построил
  const CATS = [['home', 'Дома', ['house', 'well', 'fire']], ['work', 'Работа', ['field', 'stall', 'wheelshop', 'watermill', 'windmill', 'lab', 'leonardo', 'garage', 'solar']],
    ['nature', 'Природа', ['tree', 'forest', 'water', 'flowers']], ['road', 'Дороги', ['road', 'bridge', 'lamp']], ['wonder', 'Чудеса', ['ferris', 'fountain', 'monument']]];
  const NEED = { on_water: 'Ставится только на реку', water_adj: 'Строится у реки' };

  const CSS = `
.city{font-family:"PT Serif",Georgia,serif;color:var(--ink,#3a2313)}
.city-next{display:flex;gap:10px;align-items:center;margin:0 0 10px;padding:9px 14px;border:1.5px dashed var(--sanguine,#9a3a1b);border-radius:6px;font-size:14.5px;background:rgba(255,248,230,.4)}
.city-next b{color:var(--sanguine,#9a3a1b)}
.city-next .bar{flex:0 0 120px;height:8px;border-radius:4px;background:rgba(74,44,20,.14);overflow:hidden}.city-next .bar i{display:block;height:100%;background:linear-gradient(90deg,#c9a227,#e0661b);width:var(--p)}
.city-wrap{position:relative;height:min(64vh,620px);min-height:360px;border:1.5px solid var(--line,rgba(74,44,20,.3));border-bottom-width:4px;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,#fbf1dc 0,#ead8b0 75%);touch-action:none;user-select:none;-webkit-user-select:none}
.city-wrap>svg{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
.city-wrap.panning>svg{cursor:grabbing}
.cw-fly svg,.cw-chip svg{display:block}
.cw-hud{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none;z-index:3}
.cw-chip{display:flex;align-items:center;gap:7px;padding:6px 12px 6px 7px;border-radius:22px;background:rgba(255,250,238,.94);border:1.5px solid rgba(74,44,20,.3);box-shadow:0 3px 0 rgba(74,44,20,.18);font-size:13px;pointer-events:auto}
.cw-chip b{font:700 20px/1 "Cormorant Garamond",Georgia,serif}
.cw-chip .i{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#fff3cf;border:1.5px solid #c9a227;font-size:15px;color:#8a6d1f}
.cw-era small{display:block;color:var(--ink-soft,#6e4b2c);font-size:11.5px;line-height:1.1}.cw-era b{font-size:17px}
.cw-left{display:grid;gap:6px;justify-items:start}
.cw-gears.bump{animation:cwBump .45s}@keyframes cwBump{40%{transform:scale(1.18)}}
.cw-side{position:absolute;right:10px;bottom:12px;display:grid;gap:8px;z-index:3}
.cw-side button{width:44px;height:44px;border-radius:50%;border:1.5px solid rgba(74,44,20,.35);background:#fffaf0;font:700 22px/1 Georgia,serif;color:var(--ink,#3a2313);cursor:pointer;box-shadow:0 3px 0 rgba(74,44,20,.25)}
.cw-side button:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(74,44,20,.25)}
.cw-land{pointer-events:auto;display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:20px;border:1.5px solid #5d8a48;background:#eef6e6;color:#2f5f2a;font:700 13px "PT Serif",Georgia,serif;cursor:pointer;box-shadow:0 3px 0 rgba(47,95,42,.25)}
.cw-tip{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);max-width:calc(100% - 90px);padding:8px 14px;border-radius:18px;background:rgba(58,35,19,.9);color:#fff6e6;font-size:13.5px;line-height:1.35;text-align:center;z-index:3;pointer-events:none}
.cw-act{position:absolute;z-index:4;display:flex;gap:8px;transform:translate(-50%,-100%);pointer-events:auto;animation:cwPop .18s ease-out}
@keyframes cwPop{from{opacity:0;transform:translate(-50%,-80%) scale(.8)}}
.cw-done{left:50%;top:10px;transform:translateX(-50%);z-index:5}
.cw-act button{display:flex;align-items:center;gap:5px;height:44px;min-width:44px;justify-content:center;padding:0 12px;border-radius:22px;border:2px solid rgba(74,44,20,.4);background:#fffaf0;font:700 14px "PT Serif",Georgia,serif;color:var(--ink,#3a2313);cursor:pointer;box-shadow:0 3px 0 rgba(74,44,20,.3);white-space:nowrap}
.cw-act .ok{background:#5d8a48;border-color:#3f6a32;color:#fff;font-size:20px}.cw-act .ok[disabled]{background:#b9b0a2;border-color:#9c9384;cursor:not-allowed}
.cw-act .no{background:#b45f3d;border-color:#8a4429;color:#fff;font-size:18px}
.cw-act .name{pointer-events:none;background:rgba(58,35,19,.9);color:#fff6e6;border-color:transparent;box-shadow:none;font-weight:400;font-size:13px;height:auto;padding:6px 10px}
.ct-ghost{opacity:.82;pointer-events:none}
.ct-ghost .ct-mark{fill:rgba(93,138,72,.45);stroke:#3f6a32;stroke-width:2;stroke-dasharray:5 3}
.ct-ghost.bad .ct-mark{fill:rgba(180,95,61,.45);stroke:#8a4429}
.ct-ghost.bad .ct-art{filter:grayscale(.6)}
.ct-ghost .ct-art{animation:ctHover 1.1s ease-in-out infinite}@keyframes ctHover{50%{transform:translateY(-4px)}}
.ct-ok{fill:rgba(126,170,98,.22);stroke:rgba(63,106,50,.5);stroke-width:1;pointer-events:none}
.ct-b.sel .ct-in{animation:ctHover 1.1s ease-in-out infinite;filter:drop-shadow(0 0 4px #fff3c4) drop-shadow(0 0 2px #c9a227)}
.ct-b.hide{opacity:.25}
.ct-b.new .ct-in{animation:ctDrop .55s cubic-bezier(.3,1.6,.5,1)}
@keyframes ctDrop{from{transform:translateY(-46px);opacity:0}}
.ct-puff circle{fill:#efe2c4;animation:ctPuff .7s ease-out forwards}@keyframes ctPuff{to{transform:translate(var(--x),var(--y)) scale(1.8);opacity:0}}
.ct-bub{cursor:pointer}.ct-bub>g{animation:ctBob 1.4s ease-in-out infinite}@keyframes ctBob{50%{transform:translateY(-5px)}}
.ct-sign{cursor:pointer}
.ct-spin{transform-box:fill-box;transform-origin:center;animation:ctSpin 5s linear infinite}.ct-spin.slow{animation-duration:12s}
@keyframes ctSpin{to{transform:rotate(360deg)}}
.ct-smoke circle{animation:ctSmoke 3.2s ease-out infinite;opacity:0}.ct-smoke circle:nth-child(2){animation-delay:1s}.ct-smoke circle:nth-child(3){animation-delay:2s}
@keyframes ctSmoke{0%{opacity:.8;transform:translateY(8px) scale(.6)}100%{opacity:0;transform:translateY(-14px) scale(1.4)}}
.ct-flame{transform-box:fill-box;transform-origin:50% 100%;animation:ctFlame .6s ease-in-out infinite alternate}@keyframes ctFlame{to{transform:scaleY(.82) skewX(4deg)}}
.ct-float{animation:ctFloat 3s ease-in-out infinite}@keyframes ctFloat{50%{transform:translateY(-4px)}}
.ct-blink{animation:ctBlink 1.4s steps(2) infinite}@keyframes ctBlink{50%{opacity:.2}}
.ct-jet{animation:ctJet 1.2s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}@keyframes ctJet{to{transform:scaleY(.85)}}
.ct-water,.ct-ripple{animation:ctWater 2.4s ease-in-out infinite alternate}@keyframes ctWater{to{transform:translate(4px,2px)}}
.ct-walk{animation:ctWalk 7s ease-in-out infinite var(--d)}@keyframes ctWalk{50%{transform:translateX(var(--x))}}
.cw-fly{position:absolute;z-index:6;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;display:grid;place-items:center;background:#e3b341;border:2px solid #8a6d1f;color:#3a2313;transition:transform .8s cubic-bezier(.5,-.3,.6,1),opacity .8s;pointer-events:none}
.city-tools{margin-top:12px}
.city-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.city-tabs button{flex:none;padding:7px 14px;border-radius:18px;border:1.5px solid var(--line,rgba(74,44,20,.3));background:#fffaf0;font:700 14px "PT Serif",Georgia,serif;color:var(--ink-soft,#6e4b2c);cursor:pointer}
.city-tabs button.on{background:var(--sanguine,#9a3a1b);border-color:var(--sanguine,#9a3a1b);color:#fff6e6}
.city-cards{display:flex;gap:10px;overflow-x:auto;padding:8px 2px 10px;scroll-snap-type:x proximity}
.city-card{position:relative;flex:0 0 128px;scroll-snap-align:start;display:grid;justify-items:center;gap:3px;padding:8px 8px 10px;border:1.5px solid var(--line,rgba(74,44,20,.26));border-bottom-width:4px;border-radius:8px;background:rgba(255,252,242,.85);cursor:pointer;font:inherit;color:inherit;text-align:center;transition:transform .12s}
.city-card:hover{transform:translateY(-3px)}
.city-card .ct-th{width:96px;height:80px}
.city-card b{font:700 15.5px/1.15 "Cormorant Garamond",Georgia,serif}
.city-card small{font-size:12px;color:var(--ink-soft,#6e4b2c);line-height:1.3}
.city-card .pr{display:flex;align-items:center;gap:4px;font-weight:700;color:#8a6d1f;font-size:14px}
.city-card .gift{color:#3f7d4a}
.city-card .nd{position:absolute;top:6px;left:6px;font-size:11px;padding:1px 6px;border-radius:8px;background:#dbe9f0;color:#3f6a80}
.city-card .one{position:absolute;top:6px;right:6px;font-size:11px;padding:1px 6px;border-radius:8px;background:#fff3cf;color:#8a6d1f;border:1px solid #e3c46a}
.city-card.has{background:rgba(233,244,226,.75)}.city-card .pr.ok{color:#3f7d4a}
.city-card.on{border-color:#c9a227;background:#fff3cf;box-shadow:0 0 0 3px rgba(201,162,39,.35)}
.city-card.poor .pr{color:#a65435}
.city-card.lock{cursor:default;opacity:.75;background:rgba(74,44,20,.05)}.city-card.lock .ct-th{filter:grayscale(1) opacity(.45)}
.city-card .lk{font-size:12px;color:var(--sanguine,#9a3a1b);line-height:1.25}
.city-sheet{text-align:center}
.city-sheet .ct-th{width:160px;height:140px}
.city-sheet h3{margin:4px 0 4px;font:700 26px/1.1 "Cormorant Garamond",Georgia,serif}
.city-sheet p{margin:0 0 12px;color:var(--ink-soft,#6e4b2c)}
.city-era{text-align:center}.city-era h3{font:700 30px/1.1 "Cormorant Garamond",Georgia,serif;margin:6px 0}
.city-era .pair{display:flex;justify-content:center;align-items:center;gap:8px}.city-era .pair .ct-th{width:130px;height:120px}
@media(max-width:600px){.city-wrap{height:60vh;min-height:330px}.city-next{flex-wrap:wrap}.city-next .bar{flex-basis:100%}.city-card{flex-basis:112px}.city-card .ct-th{width:84px;height:70px}.cw-era{display:none}}
@media(prefers-reduced-motion:reduce){.ct-spin,.ct-smoke circle,.ct-flame,.ct-float,.ct-blink,.ct-jet,.ct-water,.ct-ripple,.ct-walk,.ct-bub>g,.ct-ghost .ct-art,.ct-b.sel .ct-in{animation:none}}
`;
  function style() { if (window.Path) Path.style(); else if (H()) H().style(); if (document.getElementById('city-css')) return; const s = document.createElement('style'); s.id = 'city-css'; s.textContent = CSS; document.head.append(s); }

  // маленькая картинка постройки (карточки, окна)
  const thumb = (code, era) => `<svg class="ct-th" viewBox="-38 -70 76 90" aria-hidden="true">${flat(0.9, ERAS[era].ground[0], ' opacity=".8"')}${ART[code] ? ART[code](era, 0.3, () => (code === 'bridge' ? 'water' : code === 'road' ? 'road' : null)) : ''}</svg>`;
  const coin = `<circle r="11" fill="#e3b341" stroke="${INK}" stroke-width="1.6"/><circle r="7" fill="none" stroke="#8a6d1f" stroke-width="3" stroke-dasharray="2.2 2.2"/><circle r="2.4" fill="#8a6d1f"/>`;

  async function open(el, { sb, onChange }) {
    style();
    let S = null, mode = null, cat = 'home', fresh = null, cam = null, busy = false, touched = false;
    const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message || 'Ошибка'); return data; };
    const load = async () => { S = await rpc('city_state'); S.radius = S.radius ?? ERAS[S.era].r; };
    el.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Строим город…</p>';
    try { await load(); } catch (e) { el.innerHTML = `<p class="note">Город пока не открылся: ${esc(e.message)}</p>`; return; }
    const key = (x, y) => x + ':' + y;
    let occ = {};
    const index = () => { occ = Object.fromEntries((S.tiles || []).map((t) => [key(t.x, t.y), t])); groups(); };
    const codeAt = (x, y) => (x === 0 && y === 0 ? 'hall' : occ[key(x, y)] ? occ[key(x, y)].c : null);
    const item = (c) => (S.items || []).find((i) => i.code === c) || { code: c, title: c, income: 0 };
    const inside = (x, y) => Math.abs(x) <= S.radius && Math.abs(y) <= S.radius;
    // группы одинаковых соседей (поле, лес, парк, квартал): клетка → { id, n, front }
    let grp = {};
    const groups = () => {
      grp = {}; let id = 0;
      for (const t of S.tiles || []) {
        const k0 = key(t.x, t.y); if (!GROUP[t.c] || grp[k0]) continue;
        const list = [t], g = { id: ++id, n: 0, code: t.c }; grp[k0] = g;
        for (let i = 0; i < list.length; i++) for (const [dx, dy] of SIDES) {
          const q = occ[key(list[i].x + dx, list[i].y + dy)]; if (q && q.c === t.c && !grp[key(q.x, q.y)]) { grp[key(q.x, q.y)] = g; list.push(q); }
        }
        g.n = list.length; const f = list.reduce((a, q) => (q.x + q.y > a.x + a.y || (q.x + q.y === a.x + a.y && q.x > a.x) ? q : a)); g.front = key(f.x, f.y);
      }
    };
    const near = (t) => SIDES.some(([dx, dy]) => codeAt(t.x + dx, t.y + dy) === t.c);
    const income = (t) => { const it = item(t.c); return (it.income || 0) + (it.merge && near(t) ? it.merge : 0); };
    const built = (c) => (S.tiles || []).some((t) => t.c === c);
    // можно ли поставить постройку на клетку (сервер проверит ещё раз)
    function canPlace(code, x, y, from) {
      if (!inside(x, y) || (x === 0 && y === 0)) return [false, 'Это за границей города'];
      const it = item(code), here = from && from.x === x && from.y === y ? null : codeAt(x, y);
      if (it.once && !from && built(code)) return [false, 'Особое здание уже стоит в городе'];
      if (it.need === 'on_water') { if (here !== 'water') return [false, 'Мост ставится только на реку']; }
      else if (here) return [false, 'Клетка занята'];
      if (it.need === 'water_adj' && !SIDES.some(([dx, dy]) => wet(codeAt(x + dx, y + dy)))) return [false, 'Нужна река рядом'];
      return [true, ''];
    }

    // ---------- разметка: шапка, поле, панель построек ----------
    el.innerHTML = `<div class="city"><div class="city-next" id="cwNext"></div><div class="city-wrap" id="cwWrap"><svg id="cwSvg" xmlns="http://www.w3.org/2000/svg"><g id="cwWorld"></g><g id="cwGhost"></g></svg>`
      + `<div class="cw-hud"><div class="cw-left"><div class="cw-chip cw-era"><span class="i">🏛</span><span><small>Эпоха</small><b id="cwEra"></b></span></div><div class="cw-chip"><span class="i">👥</span><b id="cwPop"></b></div><button type="button" class="cw-land" id="cwLand" hidden></button></div><div class="cw-chip cw-gears" id="cwGearsBox"><span class="i">${gear(17)}</span><b id="cwGears"></b></div></div>`
      + `<div class="cw-side"><button type="button" data-z="1" aria-label="Приблизить">+</button><button type="button" data-z="-1" aria-label="Отдалить">−</button><button type="button" data-z="0" aria-label="Показать весь город" style="font-size:17px">⌂</button></div><div id="cwAct"></div><div class="cw-tip" id="cwTip" hidden></div></div>`
      + `<div class="city-tools"><div class="city-tabs" id="cwTabs">${CATS.map(([k, t]) => `<button type="button" data-cat="${k}">${t}</button>`).join('')}</div><div class="city-cards" id="cwCards"></div></div></div>`;
    const $ = (id) => el.querySelector('#' + id);
    const wrap = $('cwWrap'), svg = $('cwSvg'), world = $('cwWorld'), ghost = $('cwGhost');

    // ---------- камера: перетаскивание, колёсико, два пальца ----------
    const bounds = () => { const R = S.radius + 1; return { w: (R + 0.5) * TW, top: -R * TH - 90, bot: (R + 0.5) * TH }; };
    function fit() {
      const b = bounds(), W = wrap.clientWidth || 600, Hh = wrap.clientHeight || 400;
      const s = Math.min(W / (2 * b.w), Hh / (b.bot - b.top)) * (W < 600 ? 1.5 : 1.05);
      cam = { x: 0, y: (b.top + b.bot) / 2 + 10, s };
    }
    function applyCam() {
      const W = wrap.clientWidth, Hh = wrap.clientHeight, b = bounds(), minS = Math.min(W / (2 * b.w), Hh / (b.bot - b.top)) * 0.8;
      cam.s = Math.max(minS, Math.min(3.2, cam.s));
      cam.x = Math.max(-b.w, Math.min(b.w, cam.x)); cam.y = Math.max(b.top, Math.min(b.bot, cam.y));
      svg.setAttribute('viewBox', `${f1(cam.x - W / 2 / cam.s)} ${f1(cam.y - Hh / 2 / cam.s)} ${f1(W / cam.s)} ${f1(Hh / cam.s)}`);
      placeAct();
    }
    const toWorld = (cx, cy) => { const r = wrap.getBoundingClientRect(); return [cam.x + (cx - r.left - r.width / 2) / cam.s, cam.y + (cy - r.top - r.height / 2) / cam.s]; };
    const toScreen = (wx, wy) => [wrap.clientWidth / 2 + (wx - cam.x) * cam.s, wrap.clientHeight / 2 + (wy - cam.y) * cam.s];
    const cellAt = (cx, cy) => { const [wx, wy] = toWorld(cx, cy), a = wx / (TW / 2), b = wy / (TH / 2); return [Math.round((a + b) / 2), Math.round((b - a) / 2)]; };
    function zoomAt(k, cx, cy) {
      touched = true;
      const r = wrap.getBoundingClientRect(); cx = cx ?? r.left + r.width / 2; cy = cy ?? r.top + r.height / 2;
      const [wx, wy] = toWorld(cx, cy); cam.s *= k; applyCam();
      const [nx, ny] = toWorld(cx, cy); cam.x += wx - nx; cam.y += wy - ny; applyCam();
    }

    // ---------- отрисовка города ----------
    function drawWorld() {
      index();
      const era = S.era, E = ERAS[era], R = S.radius, cells = [];
      for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) cells.push([x, y]);
      cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
      let ground = '', things = '', fog = '', bubbles = '';
      const okMark = mode && (mode.kind === 'build' || mode.kind === 'move') ? mode.code : null;
      for (const [x, y] of cells) {
        const [sx, sy] = scr(x, y), rr = rnd(x * 73856093 ^ y * 19349663);
        if (!inside(x, y)) {
          ground += `<g transform="translate(${sx} ${sy})">${flat(1, E.wild, ' stroke-width=".5" opacity=".85"')}</g>`;
          if (rr() > 0.45) things += `<g transform="translate(${sx + Math.round(rr() * 10 - 5)} ${sy})" opacity=".85">${ART.tree(era, rr())}</g>`;
          fog += `<ellipse cx="${sx}" cy="${sy - 6}" rx="40" ry="20" fill="#f5ead2" opacity=".55"/>`;
          continue;
        }
        const code = codeAt(x, y), nb = (dx, dy) => codeAt(x + dx, y + dy);
        ground += `<g transform="translate(${sx} ${sy})">${flat(1, (x + y) & 1 ? E.ground[0] : E.ground[1], ' stroke-width=".5" stroke-opacity=".3"')}`
          + (!code && rr() > 0.7 ? `<path d="M${Math.round(rr() * 20 - 10)} 2c0-4-2-6-3-7M${Math.round(rr() * 20 - 10)} 4c0-5 1-8 2-9" fill="none" stroke="${INK2}" stroke-width=".9" opacity=".55"/>` : '')
          + (okMark && canPlace(okMark, x, y, mode.from)[0] ? '<path class="ct-ok" d="M-30 0L0 15L30 0L0-15z"/>' : '') + '</g>';
        if (!code || !ART[code]) continue;
        const k = key(x, y), sel = mode && mode.kind === 'sel' && mode.x === x && mode.y === y, hide = mode && mode.kind === 'move' && mode.from.x === x && mode.from.y === y;
        const g = `<g class="ct-b${fresh === k ? ' new' : ''}${sel ? ' sel' : ''}${hide ? ' hide' : ''}" data-x="${x}" data-y="${y}" transform="translate(${sx} ${sy})"><g class="ct-in">${ART[code](era, rr(), nb, grp[k] && { n: grp[k].n, front: grp[k].front === k })}</g>${code === 'house' || code === 'hall' ? walkers(code === 'hall' ? 2 : 1, rr) : ''}${fresh === k ? `<g class="ct-puff">${[[-20, -4], [20, -4], [-12, 8], [14, 8]].map(([dx, dy]) => `<circle r="5" style="--x:${dx}px;--y:${dy}px"/>`).join('')}</g>` : ''}</g>`;
        if (FLAT.has(code)) ground += g; else things += g;
        if (S.ready > 0 && occ[k] && income(occ[k])) bubbles += `<g class="ct-bub" data-bub="1" transform="translate(${sx} ${sy - 62})"><g>${coin}<path d="M0 11l-4 6h8z" fill="#e3b341" stroke="${INK}" stroke-width="1.2"/></g></g>`;
      }
      // табличка на краю тумана: здесь можно расширить город
      const sign = S.expand_price ? (() => { const [sx, sy] = scr(R + 1, R + 1); return `<g class="ct-sign" data-sign="1" transform="translate(${sx} ${sy - 4})"><path d="M0 0v-30" stroke="${INK}" stroke-width="2.4"/><path d="M-30-52h60v22h-60z" fill="#eef6e6" stroke="#3f6a32" stroke-width="1.6"/><text y="-37" text-anchor="middle" font-family="PT Serif,Georgia,serif" font-weight="700" font-size="11" fill="#2f5f2a">+ земля</text></g>`; })() : '';
      world.innerHTML = ground + things + `<g pointer-events="none">${fog}</g>` + sign + bubbles;
      fresh = null;
    }
    function drawGhost() {
      if (!mode || (mode.kind !== 'build' && mode.kind !== 'move') || mode.x == null) { ghost.innerHTML = ''; return; }
      const [sx, sy] = scr(mode.x, mode.y), [ok] = canPlace(mode.code, mode.x, mode.y, mode.from);
      const nb = (dx, dy) => codeAt(mode.x + dx, mode.y + dy);
      ghost.innerHTML = `<g class="ct-ghost${ok ? '' : ' bad'}" transform="translate(${sx} ${sy})"><path class="ct-mark" d="M-32 0L0 16L32 0L0-16z"/><g class="ct-art">${ART[mode.code](S.era, 0.3, nb)}</g></g>`;
    }
    function drawHud() {
      const E = ERAS[S.era], nx = ERAS[S.era + 1];
      const pop = (S.tiles || []).reduce((a, t) => a + (item(t.c).pop || 0) + (t.c === 'house' && near(t) ? 1 : 0), 0) + 4;
      $('cwEra').textContent = E.name; $('cwPop').textContent = pop; $('cwGears').textContent = S.gears;
      const land = $('cwLand'); land.hidden = !S.expand_price; land.innerHTML = `＋ Земля · ${S.expand_price} ⚙`;
      $('cwNext').innerHTML = nx ? `⏳<span>Новая эпоха — <b>${esc(nx.name)}</b>: ${S.next_hint ? 'пройди ' + esc(S.next_hint) : 'пройди следующий блок курса'}. Город вырастет и перестроится.</span>${S.next_total ? `<span class="bar" style="--p:${Math.round((100 * S.next_done) / S.next_total)}%"><i></i></span>` : ''}` : '🏆<span>Ты построил <b>город будущего</b>! Украшай его дальше.</span>';
    }
    function drawCards() {
      el.querySelectorAll('#cwTabs button').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
      const codes = CATS.find((c) => c[0] === cat)[2];
      $('cwCards').innerHTML = codes.map(item).filter((i) => i.title).map((i) => {
        const lock = !i.unlocked, gift = i.unlocked && i.free, has = i.once && built(i.code), poor = !gift && !has && i.price > S.gears;
        const gain = i.code === 'house' ? `+${i.pop} ${plural(i.pop, 'житель', 'жителя', 'жителей')} · рядом с домом +1` : i.merge ? (i.income ? `+${i.income} ⚙ в день · рядом +${i.merge}` : `+${i.merge} ⚙ в день, если рядом такой же`)
          : i.income ? `+${i.income} ⚙ в день` : i.pop ? `+${i.pop} ${plural(i.pop, 'житель', 'жителя', 'жителей')}` : 'для красоты';
        return `<button type="button" class="city-card${lock ? ' lock' : ''}${poor ? ' poor' : ''}${has ? ' has' : ''}${mode && mode.kind === 'build' && mode.code === i.code ? ' on' : ''}" data-code="${esc(i.code)}">${i.need && !lock ? `<span class="nd">${i.need === 'on_water' ? 'на реку' : 'у реки'}</span>` : ''}${i.once ? '<span class="one" title="Особое здание: в городе только одно">★ одно</span>' : ''}${thumb(i.code, S.era)}<b>${esc(i.title)}</b>`
          + (lock ? `<span class="lk">🔒 ${i.lesson ? 'Откроется после темы «' + esc(i.lesson) + '»' : 'Откроется в эпохе «' + esc(ERAS[i.era].name) + '»'}</span>`
            : has ? '<span class="pr ok">✓ Уже в городе</span><small>нажми — покажем</small>'
            : `<span class="pr">${gift ? '<span class="gift">🎁 Подарок за тему</span>' : gear(15) + ' ' + i.price}</span><small>${gain}</small>`)
          + '</button>';
      }).join('');
    }
    const tip = (t) => { const e = $('cwTip'); e.hidden = !t; e.textContent = t || ''; };
    // кнопки над постройкой: ✓ / ✕ при строительстве, «Переставить / Убрать» у выбранной
    function placeAct() {
      const box = $('cwAct'); if (!box) return;
      if (mode && mode.paint) { if (box.dataset.m !== 'paint') { box.dataset.m = 'paint'; box.innerHTML = '<div class="cw-act cw-done"><button type="button" class="ok" data-a="cancel" style="font-size:15px">✓ Готово</button></div>'; } return; }
      if (!mode || mode.x == null) { box.innerHTML = ''; box.dataset.m = ''; return; }
      const [sx, sy] = scr(mode.x, mode.y), [px, py] = toScreen(sx, sy - (FLAT.has(mode.code) ? 24 : 70));
      if (!box.firstChild || box.dataset.m !== mode.kind + mode.code) {
        box.dataset.m = mode.kind + mode.code;
        if (mode.kind === 'sel') {
          const it = item(mode.code), t = occ[key(mode.x, mode.y)] || {}, g = grp[key(mode.x, mode.y)];
          const gi = g && g.n > 1 ? (S.tiles || []).filter((q) => grp[key(q.x, q.y)] === g).reduce((a, q) => a + income(q), 0) : income(t);
          const name = g && g.n > 1 ? `${GROUP[mode.code]} · ${g.n} ${plural(g.n, 'клетка', 'клетки', 'клеток')}` : it.title;
          box.innerHTML = `<div class="cw-act"><button type="button" class="name" tabindex="-1">${esc(name)}${gi ? ' · +' + gi + ' ⚙/день' : ''}</button>${['water', 'bridge'].includes(mode.code) ? '' : '<button type="button" data-a="move">✥ Переставить</button>'}<button type="button" data-a="sell">Убрать${it.refund && !t.g ? ' +' + it.refund + ' ⚙' : ''}</button><button type="button" class="no" data-a="cancel" aria-label="Закрыть">✕</button></div>`;
        } else box.innerHTML = `<div class="cw-act"><button type="button" class="no" data-a="cancel" aria-label="Отмена">✕</button><button type="button" class="ok" data-a="ok" aria-label="Построить здесь">✓</button></div>`;
      }
      const a = box.firstChild; a.style.left = f1(px) + 'px'; a.style.top = f1(Math.max(56, py)) + 'px';
      const ok = a.querySelector('.ok'); if (ok) ok.disabled = !canPlace(mode.code, mode.x, mode.y, mode.from)[0];
    }
    function redraw() { drawWorld(); drawGhost(); drawHud(); placeAct(); }

    const toast = (html) => { const o = H().overlay(`<div class="city-sheet">${html}<div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main">Хорошо</button></div></div>`); o.box.querySelector('.hero-b').onclick = o.close; };
    // действие на сервере: сразу показываем результат, при ошибке — возвращаем как было
    async function act(fn, args, local) {
      const keep = JSON.parse(JSON.stringify(S));
      if (local) { local(); redraw(); drawCards(); }
      try { await rpc(fn, args); await load(); redraw(); drawCards(); onChange && onChange(); return true; }
      catch (e) { S = keep; redraw(); drawCards(); toast(`<h3>Не получилось</h3><p>${esc(e.message)}</p>`); return false; }
    }
    // ближайшая к центру экрана клетка, куда можно поставить
    function bestCell(code) {
      const r = wrap.getBoundingClientRect(), [cx, cy] = cellAt(r.left + r.width / 2, r.top + r.height / 2); let best = null;
      for (let d = 0; d <= 2 * S.radius && !best; d++) for (let x = cx - d; x <= cx + d && !best; x++) for (let y = cy - d; y <= cy + d && !best; y++)
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === d && canPlace(code, x, y)[0]) best = [x, y];
      return best || [cx, cy];
    }
    function startBuild(code) {
      const it = item(code);
      if (!it.unlocked) return;
      if (it.once && built(code)) { const t = S.tiles.find((q) => q.c === code); mode = { kind: 'sel', x: t.x, y: t.y, code }; tip('Особое здание — в городе может быть только одно. Его можно переставить.'); redraw(); drawCards(); return; }
      if (!it.free && it.price > S.gears) return toast(`${thumb(code, S.era)}<h3>${esc(it.title)}</h3><p>Нужно ${it.price} ⚙, а у тебя ${S.gears}. Шестерёнки дают за разминку ума, задания дня и доход города.</p>`);
      if (mode && mode.kind === 'build' && mode.code === code) return cancel();
      if (PAINT.has(code)) { mode = { kind: 'build', code, paint: true }; tip(it.merge || code === 'house' ? `Нажимай на клетки рядом друг с другом — «${it.title}» срастётся и даст больше` : `Нажимай на зелёные клетки — «${it.title}» строится сразу`); }
      else { const [x, y] = bestCell(code); mode = { kind: 'build', code, x, y }; tip(NEED[it.need] ? NEED[it.need] + '. Перетащи постройку или нажми на клетку, потом ✓' : 'Перетащи постройку или нажми на клетку, потом ✓'); }
      redraw(); drawCards();
      if (matchMedia('(max-width:900px)').matches) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function cancel() { mode = null; tip(''); redraw(); drawCards(); }
    async function confirm() {
      if (busy || !mode || mode.x == null) return;
      const m = mode, [ok, why] = canPlace(m.code, m.x, m.y, m.from); if (!ok) return tip(why);
      busy = true; mode = null; tip(''); fresh = key(m.x, m.y);
      if (m.kind === 'move') await act('city_move', { p_x: m.from.x, p_y: m.from.y, p_to_x: m.x, p_to_y: m.y }, () => { const t = S.tiles.find((t) => t.x === m.from.x && t.y === m.from.y); t.x = m.x; t.y = m.y; });
      else await place(m.code, m.x, m.y);
      busy = false;
    }
    async function place(code, x, y) {
      const it = item(code);
      const ok = await act('city_place', { p_code: code, p_x: x, p_y: y }, () => {
        if (!it.free) S.gears -= it.price; else it.free = false;
        if (it.need === 'on_water') occ[key(x, y)].c = code; else S.tiles.push({ x, y, c: code });
        H().ding(true);
      });
      const g = ok && grp[key(x, y)];
      if (g && [2, 3, 5, 8].includes(g.n)) {
        const more = { field: { 3: 'на поле появился стог сена', 5: 'пришло пугало', 8: 'второй стог' }, forest: { 4: 'в чаще выросли грибы' }, flowers: { 3: 'в парке поставили скамейку', 5: 'и беседку' } }[code] || {};
        tip(g.n === 2 ? `${GROUP[code]}! Рядом такие же дают больше${code === 'house' ? ' жителей' : ' ⚙'}` : `${GROUP[code]} растёт: ${g.n} ${plural(g.n, 'клетка', 'клетки', 'клеток')}${more[g.n] ? ' — ' + more[g.n] : ''}!`);
      }
      return ok;
    }
    async function collect() {
      if (busy || !(S.ready > 0)) return; busy = true;
      const r = wrap.getBoundingClientRect(), to = $('cwGearsBox').getBoundingClientRect();
      [...world.querySelectorAll('.ct-bub')].forEach((b, i) => {
        const br = b.getBoundingClientRect(), f = document.createElement('div'); f.className = 'cw-fly'; f.innerHTML = gear(16);
        f.style.left = br.left + br.width / 2 - r.left + 'px'; f.style.top = br.top + br.height / 2 - r.top + 'px'; wrap.append(f);
        requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transitionDelay = i * 60 + 'ms'; f.style.transform = `translate(${to.left + 20 - br.left - br.width / 2}px,${to.top + 16 - br.top - br.height / 2}px) scale(.6)`; f.style.opacity = '.3'; }));
        setTimeout(() => f.remove(), 1000 + i * 60);
      });
      try {
        const g = await rpc('city_collect'); H().ding(true);
        setTimeout(() => { $('cwGearsBox').classList.remove('bump'); void $('cwGearsBox').offsetWidth; $('cwGearsBox').classList.add('bump'); }, 800);
        await load(); redraw(); drawCards(); onChange && onChange(); tip(`+${g.gears} ⚙ — жители собрали доход. Загляни завтра!`); setTimeout(() => tip(mode ? $('cwTip').textContent : ''), 2600);
      } catch (e) { toast(`<h3>Не получилось</h3><p>${esc(e.message)}</p>`); }
      busy = false;
    }
    function expand() {
      if (!S.expand_price) return;
      const o = H().overlay(`<div class="city-sheet"><h3>Больше земли</h3><p>Город станет шире на один ряд клеток со всех сторон. Стоит <b>${S.expand_price} ⚙</b>, у тебя ${S.gears} ⚙.</p><div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main" data-a="y"${S.gears < S.expand_price ? ' disabled' : ''}>Расширить</button><button type="button" class="hero-b" data-a="n">Не сейчас</button></div></div>`);
      o.box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return; o.close();
        if (b.dataset.a === 'y' && await act('city_expand', {})) { H().ding(true); fit(); applyCam(); tip('Город стал больше! Новые клетки — у края.'); setTimeout(() => tip(''), 2600); }
      });
    }

    // ---------- касания и мышь ----------
    const pts = new Map(); let gest = null;
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; gest = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), s: cam.s, moved: true }; return; }
      const [x, y] = cellAt(e.clientX, e.clientY);
      const onGhost = mode && mode.x != null && (mode.kind === 'build' || mode.kind === 'move') && Math.abs(x - mode.x) + Math.abs(y - mode.y) <= 1;
      gest = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, drag: onGhost && !mode.paint };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !gest) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && gest.pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((gest.s * d) / gest.pinch / cam.s, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
      const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
      if (!gest.moved && Math.hypot(dx, dy) < 7) return;
      gest.moved = true;
      if (gest.drag) { const [x, y] = cellAt(e.clientX, e.clientY - 20); if (x !== mode.x || y !== mode.y) { mode.x = x; mode.y = y; drawGhost(); placeAct(); } return; }
      touched = true; wrap.classList.add('panning'); cam.x = gest.cx - dx / cam.s; cam.y = gest.cy - dy / cam.s; applyCam();
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); wrap.classList.remove('panning');
      if (pts.size || !gest) { if (!pts.size) gest = null; return; }
      const g = gest; gest = null; if (g.moved) return;
      tap(e.clientX, e.clientY);
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); gest = null; });
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });

    function tap(cx, cy) {
      const hit = document.elementFromPoint(cx, cy), [x, y] = cellAt(cx, cy);
      if (hit && hit.closest('[data-bub]')) return collect();
      if (hit && hit.closest('[data-sign]') && !mode) return expand();
      if (mode && mode.kind === 'build' && mode.paint) {
        if (!canPlace(mode.code, x, y)[0]) return tip(canPlace(mode.code, x, y)[1] + '. Выбери зелёную клетку.');
        const it = item(mode.code); if (!it.free && it.price > S.gears) { cancel(); return toast(`<h3>Шестерёнки закончились</h3><p>Нужно ${it.price} ⚙. Их дают за разминку ума и доход города.</p>`); }
        fresh = key(x, y); return place(mode.code, x, y);
      }
      if (mode && (mode.kind === 'build' || mode.kind === 'move')) { mode.x = x; mode.y = y; drawGhost(); placeAct(); return; }
      const b = hit && hit.closest('.ct-b'), bx = b ? +b.dataset.x : x, by = b ? +b.dataset.y : y, code = codeAt(bx, by);
      if (code === 'hall') { mode = null; redraw(); return toast(`${thumb('hall', S.era)}<h3>Сердце города</h3><p>Оно меняется с каждой новой эпохой. Пройди следующий блок курса — и увидишь!</p>`); }
      if (code) { mode = { kind: 'sel', x: bx, y: by, code }; tip(''); redraw(); return; }
      if (mode) { mode = null; redraw(); }
    }
    wrap.addEventListener('click', (e) => {
      const z = e.target.closest('[data-z]');
      if (z) { if (z.dataset.z === '0') fit(), applyCam(); else zoomAt(z.dataset.z === '1' ? 1.3 : 1 / 1.3); return; }
      if (e.target.closest('#cwLand')) return expand();
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'ok') return confirm();
      if (a.dataset.a === 'cancel') return cancel();
      if (a.dataset.a === 'move') { const m = mode; mode = { kind: 'move', code: m.code, from: { x: m.x, y: m.y }, x: m.x, y: m.y }; tip('Перетащи постройку на новое место и нажми ✓'); redraw(); return; }
      if (a.dataset.a === 'sell') {
        const m = mode, it = item(m.code), t = occ[key(m.x, m.y)] || {}; mode = null; tip('');
        act('city_sell', { p_x: m.x, p_y: m.y }, () => { if (m.code === 'bridge') t.c = 'water'; else S.tiles = S.tiles.filter((q) => q !== t); if (it.refund && !t.g) S.gears += it.refund; });
      }
    });
    el.querySelector('.city-tools').addEventListener('click', (e) => {
      const t = e.target.closest('[data-cat]'); if (t) { cat = t.dataset.cat; drawCards(); return; }
      const c = e.target.closest('.city-card'); if (c) startBuild(c.dataset.code);
    });
    document.addEventListener('keydown', function onKey(e) { if (!el.isConnected) return document.removeEventListener('keydown', onKey); if (e.key === 'Escape' && mode) cancel(); });
    // пока ребёнок сам не двигал карту — город целиком по размеру окна (и после поворота телефона)
    new ResizeObserver(() => { if (!wrap.clientWidth) return; if (!touched) fit(); applyCam(); }).observe(wrap);

    fit(); applyCam(); redraw(); drawCards();
    if (S.ready > 0) tip('Над постройками — доход. Нажми на монетку, чтобы собрать!');
    // новая эпоха: праздник «было → стало» (видно один раз)
    let seen = -1; try { seen = +(localStorage.getItem('cityEra') ?? -1); } catch (e) {}
    if (S.era > seen && seen >= 0) {
      const o = H().overlay(`<div class="city-era"><div class="hero-bits">${H().bits()}</div><small>Новая эпоха!</small><h3>${esc(ERAS[S.era].name)}</h3><div class="pair">${thumb('house', S.era - 1)}<span style="font-size:28px">→</span>${thumb('house', S.era)}</div><p>Город стал больше, а дома перестроились. Открылись новые постройки!</p><div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main">Строить!</button></div></div>`);
      o.box.querySelector('.hero-b').onclick = o.close; H().ding(true);
    }
    try { localStorage.setItem('cityEra', S.era); } catch (e) {}
  }

  window.City = { open, ERAS, thumb, style };
})();
