// Карта-путешествие по курсу: рисованная местность в духе эскизов Леонардо (чернила + акварель на пергаменте).
// Каждый блок курса — своя земля (стоянка древних людей, деревня, долина мельниц, мастерская Леонардо, город первых автомобилей,
// город будущего), дорога вьётся через темы-станции с миниатюрами, после блока — сундук, в конце — кубок.
// По дороге едет транспорт ученика и улучшается от блока к блоку (для «Колеса»: каток → повозка → телега → тележка Леонардо →
// автомобиль Бенца → автомобиль будущего). Земли дальше текущего блока скрыты туманом.
// Украшения из лавки (status.owned): pennant — вымпел, trail — искры в пути, horn — гудок по нажатию.
// Скорость: неподвижная часть каждой земли — отдельная картинка (SVG через blob, грузится лениво и рисуется браузером один раз);
// двигаются только маленькие отдельные элементы (мельницы, дым, облака, транспорт) — через transform, без перерисовки карты;
// анимации земель вне экрана стоят на паузе. Картинки земель запоминаются и при возврате на карту не строятся заново.
// World.map(el, { sb, modules, courseId, slug, userId, status, onOpen }) — modules: [{ id, title, lessons: [{ id, title, state, steps, done }] }],
//   state: done | review | current | open | locked | buy. Нужны hero.js и path.js (сундуки, окна, звук).
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let W = 480;                         // ширина карты в условных единицах (на телефоне — 380); на экране — по ширине блока
  const INK = '#4a2c14', INK2 = '#6e4b2c', RED = '#9a3a1b';
  const rnd = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f1 = (n) => Math.round(n * 10) / 10;
  const st = `stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"`;
  const sw = (w) => st.replace('1.3', w);
  const G = (x, y, s, body) => `<g transform="translate(${f1(x)} ${f1(y)})${s !== 1 ? ` scale(${f1(s * 100) / 100})` : ''}">${body}</g>`;

  // ---------- Мелочи местности (x, y — точка «у земли», s — масштаб) ----------
  const D = {
    tree: (x, y, s, r) => G(x, y, s, `<path d="M0 0v-12" ${st}/><path d="M-11-14c-4-9 4-17 11-15 6-6 16 1 13 9 5 5-1 13-8 11-4 5-13 3-14-2-5 0-6-2-2-3z" fill="${r > 0.5 ? '#a9b984' : '#93aa78'}" ${st}/><path d="M-6-22c3-4 8-5 11-3" fill="none" stroke="#e8efd2" stroke-width="2" opacity=".7"/><path d="M-4-17c2 1 4 1 6-1M4-12c2 0 4-1 5-3" fill="none" stroke="${INK2}" stroke-width=".8"/>`),
    pine: (x, y, s) => G(x, y, s, `<path d="M0 0v-6" ${st}/><path d="M0-34l-8 12h4l-7 10h5l-6 8h24l-6-8h5l-7-10h4z" fill="#7f9a6a" ${st}/><path d="M0-30l-4 8M-1-20l-5 8M-1-10l-5 7" stroke="#b8c99f" stroke-width="1.2" opacity=".8"/>`),
    bush: (x, y, s) => G(x, y, s, `<path d="M-9 0c-4-6 2-11 6-9 2-5 9-4 10 1 5-1 7 5 3 8z" fill="#a3b47f" ${st}/>`),
    rock: (x, y, s) => G(x, y, s, `<path d="M-12 0l3-9 7-4 8 2 5 6 1 5z" fill="#cbb999" ${st}/><path d="M-9-8l6-4 5 1" fill="none" stroke="#efe4cc" stroke-width="1.6"/><path d="M-2-13l1 6 6 2M-9-9l4 3" fill="none" stroke="${INK2}" stroke-width=".8"/>`),
    grass: (x, y, s) => G(x, y, s, `<g fill="none" stroke="${INK2}" stroke-width="1"><path d="M-5 0c0-4-2-6-3-7M-1 0c0-5 1-8 2-9M3 0c1-3 3-5 5-5"/></g>`),
    flowers: (x, y, s) => G(x, y, s, `<path d="M-4 0v-5M3 0v-6M0 0v-4" stroke="${INK2}" stroke-width=".9"/><circle cx="-4" cy="-6" r="1.8" fill="#d4804f"/><circle cx="3" cy="-7" r="1.8" fill="#e3b341"/><circle cx="0" cy="-5" r="1.5" fill="#b85c8a"/>`),
    hill: (x, y, s) => G(x, y, s, `<path d="M-34 0c8-18 20-26 34-26S26-14 34 0z" fill="#cdc590" ${st}/><path d="M-20-6c4-5 7-9 12-11M-6-4c3-6 6-9 10-12M8-5c3-4 6-7 9-8" fill="none" stroke="${INK2}" stroke-width=".8"/>`),
    mount: (x, y, s) => G(x, y, s, `<path d="M-36 0l22-40 10 12 8-16L30 0z" fill="#c9b79a" ${st}/><path d="M4-44L30 0H12z" fill="#b19f80"/><path d="M-14-40l4 8 3-2 3 3 4-13 4 8-6-11-4 15-4-3-3 2z" fill="#fff8ea"/><path d="M-36 0l22-40 10 12 8-16L30 0" fill="none" ${st}/><path d="M-20-12l6-10M-8-8l5-12" fill="none" stroke="${INK2}" stroke-width=".8"/>`),
    hut: (x, y, s) => G(x, y, s, `<path d="M-12 0v-11h24V0z" fill="#d9b98a" ${st}/><path d="M-16-10L0-27l16 17z" fill="#c9a25a" ${st}/><path d="M-8-15l5-5M0-20v8M5-17l4 4" fill="none" stroke="${INK2}" stroke-width=".8"/><path d="M-3 0v-7h6v7" fill="#5c3a1c"/>`),
    house: (x, y, s, r) => G(x, y, s, `<path d="M-13 0v-16h26V0z" fill="#ead6ad" ${st}/><path d="M2 0v-16h11V0z" fill="#d9c196"/><path d="M-16-15L0-29l16 14z" fill="${r > 0.5 ? '#c0704a' : '#b45f3d'}" ${st}/><rect x="-8" y="-12" width="5" height="5" fill="#8fb2c4" ${st}/><path d="M3 0v-9h6v9" fill="#7a4a24" ${st}/><path d="M7-23v-6h4v9" fill="#ead6ad" ${st}/>`),
    tower: (x, y, s) => G(x, y, s, `<path d="M-9 0v-38h18V0z" fill="#e2cfa6" ${st}/><path d="M2 0v-38h7V0z" fill="#cfb88c"/><path d="M-12-37L0-54l12 17z" fill="#b45f3d" ${st}/><circle cx="0" cy="-28" r="4" fill="#fff8ea" ${st}/><path d="M0-28v-3M0-28l2 1" stroke="${INK}" stroke-width=".9"/><path d="M-3 0v-8a3 3 0 0 1 6 0v8" fill="#7a4a24"/>`),
    field: (x, y, s) => G(x, y, s, `<path d="M-22 0l8-14h30l-6 14z" fill="#e9cf7a" ${st}/><path d="M-17-3l6-9M-10-3l6-9M-3-3l6-9M4-3l6-9M11-3l4-7" stroke="#b08a2e" stroke-width=".9"/>`),
    palm: (x, y, s) => G(x, y, s, `<path d="M0 0c1-10 2-20 0-30" fill="none" ${sw(2)}/><path d="M0-30c-6-4-13-3-17 1 6-1 11 0 17-1zM0-30c6-4 13-3 17 1-6-1-11 0-17-1zM0-30c-3-6-9-8-13-6 5 1 9 3 13 6zM0-30c3-6 9-8 13-6-5 1-9 3-13 6z" fill="#8faa6e" ${st}/>`),
    lamp: (x, y, s) => G(x, y, s, `<circle cx="0" cy="-29" r="7" fill="#f6dc8a" opacity=".45"/><path d="M0 0v-26" ${sw(1.6)}/><path d="M-4-26h8l-2-6h-4z" fill="#f3d27a" ${st}/>`),
    block: (x, y, s, r) => G(x, y, s, `<path d="M-9 0v-${30 + Math.round(r * 30)}h18V0z" fill="#c7d3d6" ${st}/>${Array.from({ length: 3 + Math.round(r * 3) }, (_, i) => `<path d="M-5-${8 + i * 8}h3M2-${8 + i * 8}h3" stroke="#5f7f8f" stroke-width="2"/>`).join('')}`),
    panel: (x, y, s) => G(x, y, s, `<path d="M-12-4l4-10h20l-4 10z" fill="#6f8fa6" ${st}/><path d="M-6-4l4-10M0-4l4-10M6-4l4-10M-10-9h20" stroke="#cfe0ea" stroke-width=".7"/><path d="M0-4v4" ${st}/>`),
  };

  // ---------- Ориентиры: неподвижная часть (s) + движущиеся детали (a: центр, размер, рисунок, вид движения) ----------
  const gearSvg = (r, teeth, fill) => `<circle r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${r * 0.42}" stroke-dasharray="${f1((2 * Math.PI * r) / teeth / 2)} ${f1((2 * Math.PI * r) / teeth / 2)}"/><circle r="${f1(r * 0.78)}" fill="${fill}" ${st}/><circle r="${f1(r * 0.25)}" fill="${INK}"/>`;
  const L = {
    cave: (x, y) => ({ s: G(x, y, 1, `<path d="M-46 0c4-26 20-42 46-42s40 18 44 42z" fill="#bfae8e" ${st}/><path d="M8-42c18 2 32 18 36 42H20z" fill="#a8977a"/><path d="M-16 0c0-14 7-22 16-22s16 8 16 22z" fill="#3a2414"/><path d="M-36-10l8-6M24-30l8 4M30-12l8-4M-24-28l6 2" stroke="${INK2}" stroke-width=".9"/><path d="M-6-14l3-4 3 4M2-10l2-3 2 3" fill="none" stroke="#e0b56a" stroke-width=".9"/>`) }),
    fire: (x, y) => ({ s: G(x, y, 1, `<path d="M-12 0l24-6M-12-6l24 6" stroke="#6b4420" stroke-width="3.5" stroke-linecap="round"/>${[-16, 15].map((dx) => `<path d="M${dx - 4} 1l4-5 4 5z" fill="#cbb999" ${st}/>`).join('')}`),
      a: [{ x, y: y - 14, z: 28, k: 'flame', svg: `<path d="M0 10c-8-4-7-12-2-18 0 5 3 6 4 6 0-4 2-8 5-10-1 6 6 9 1 22z" fill="#e0661b"/><path d="M1 10c-3-2-3-6 0-9 0 2 1 3 2 3 1 2 1 4-2 6z" fill="#ffd36b"/>` },
        { x: x + 3, y: y - 50, z: 36, k: 'smoke', fill: '#b8a98e' }] }),
    stones: (x, y) => ({ s: G(x, y, 1, [-30, -14, 2, 18, 34].map((dx, i) => `<path d="M${dx - 5} 0v-${18 + (i % 2) * 6}h10V0z" fill="#c9b79a" ${st}/><path d="M${dx + 1} 0v-${18 + (i % 2) * 6}h4V0z" fill="#b5a385"/>`).join('') + `<path d="M-35-26h26M3-26h26" stroke="${INK}" stroke-width="4"/>`) }),
    mill: (x, y) => ({ s: G(x, y, 1, `<path d="M-30 0v-30h34V0z" fill="#ead6ad" ${st}/><path d="M-8 0v-30H4V0z" fill="#d9c196"/><path d="M-34-29l19-17 23 17z" fill="#b45f3d" ${st}/><rect x="-22" y="-22" width="7" height="7" fill="#8fb2c4" ${st}/><path d="M2-14h16" stroke="${INK}" stroke-width="2.4"/>`),
      a: [{ x: x + 18, y: y - 14, z: 36, k: 'spin', svg: `<circle r="15" fill="none" stroke="${INK}" stroke-width="2.2"/>${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, cx = 15 * Math.cos(a), cy = 15 * Math.sin(a); return `<path d="M0 0L${f1(cx)} ${f1(cy)}" stroke="${INK}" stroke-width="1.6"/><rect x="${f1(cx - 3)}" y="${f1(cy - 3)}" width="6" height="6" fill="#a06a33" ${st}/>`; }).join('')}<circle r="3.2" fill="#6b4420"/>` }] }),
    windmill: (x, y) => ({ s: G(x, y, 1, `<path d="M-10 0l3-40h14l3 40z" fill="#e2cfa6" ${st}/><path d="M2 0l1-40h4l3 40z" fill="#cfb88c"/><path d="M-9-40l9-10 9 10z" fill="#b45f3d" ${st}/><path d="M-3 0v-9h6v9" fill="#7a4a24"/>`),
      a: [{ x, y: y - 42, z: 72, k: 'spin slow', svg: [0, 90, 180, 270].map((a) => `<g transform="rotate(${a})"><path d="M0 0v-32" stroke="${INK}" stroke-width="1.6"/><path d="M1-6h8v-26H1z" fill="#fff8ea" ${st}/><path d="M1-14h8M1-22h8M5-6v-26" stroke="${INK2}" stroke-width=".6"/></g>`).join('') + `<circle r="2.8" fill="${INK}"/>` }] }),
    workshop: (x, y) => ({ s: G(x, y, 1, `<path d="M-40 0v-34h56V0z" fill="#e8d2a6" ${st}/><path d="M-2 0v-34h18V0z" fill="#d6be93"/><path d="M-44-33l20-18h32l12 18z" fill="#b45f3d" ${st}/><path d="M-30 0v-18a6 6 0 0 1 12 0V0" fill="#7a4a24" ${st}/><rect x="-6" y="-26" width="14" height="10" fill="#8fb2c4" ${st}/><path d="M22-34l28-28M50-62v34" stroke="${INK}" stroke-width="1.4"/><path d="M50-28l-3 5h6z" fill="${INK}"/>`),
      a: [{ x: x + 34, y: y - 22, z: 34, k: 'spin slow', svg: gearSvg(12, 12, '#d9b25a') }] }),
    wings: (x, y) => ({ a: [{ x, y, z: 84, k: 'float', svg: `<path d="M0 0c-12-10-26-12-38-6 10 0 18 4 24 10M0 0c12-10 26-12 38-6-10 0-18 4-24 10" fill="#fff8ea" ${st}/><path d="M-30-5l6 6M-20-8l4 8M20-8l-4 8M30-5l-6 6" stroke="${INK2}" stroke-width=".8"/><path d="M-3 2h6l-3 8z" fill="#a06a33" ${st}/>` }] }),
    factory: (x, y) => ({ s: G(x, y, 1, `<path d="M-40 0v-26l14-10v10l14-10v10l14-10v36z" fill="#c9a98a" ${st}/><path d="M2 0v-58h10V0z" fill="#a8664a" ${st}/><path d="M8 0v-58h4V0z" fill="#8e5038"/><path d="M-34-12h8M-20-12h8M-6-12h8" stroke="#f3d27a" stroke-width="4"/>`),
      a: [{ x: x + 9, y: y - 80, z: 40, k: 'smoke', fill: '#a99c88' }] }),
    city: (x, y) => ({ s: G(x, y, 1, [[-44, 46], [-30, 70], [-14, 54], [2, 86], [18, 60], [34, 74]].map(([dx, h], i) => `<path d="M${dx} 0v-${h}h15V0z" fill="${i % 2 ? '#bccdd3' : '#cfdde0'}" ${st}/><path d="M${dx + 10} 0v-${h}h5V0z" fill="#a9bcc3"/>${Array.from({ length: Math.floor(h / 12) }, (_, k) => `<path d="M${dx + 3}-${8 + k * 11}h3M${dx + 8}-${8 + k * 11}h2" stroke="#5f7f8f" stroke-width="2.4"/>`).join('')}`).join('') + `<path d="M9-86v-12" stroke="${INK}" stroke-width="1.2"/><circle cx="9" cy="-99" r="2.2" fill="#e0661b"/>`) }),
    turbine: (x, y) => ({ s: G(x, y, 1, `<path d="M-2 0l1-52h2l1 52z" fill="#eef3f4" ${st}/>`),
      a: [{ x, y: y - 52, z: 60, k: 'spin', svg: [0, 120, 240].map((a) => `<path transform="rotate(${a})" d="M0 0c-2-8-1-20 0-26 1 6 2 18 0 26z" fill="#fff" ${st}/>`).join('') + `<circle r="2.6" fill="${INK}"/>` }] }),
    flag: (x, y) => ({ s: G(x, y, 1, `<path d="M0 0v-46" ${sw(2)}/><circle cy="-47" r="2" fill="#c9a227"/>`), a: [{ x: x + 11, y: y - 39, z: 26, k: 'wave', svg: `<path d="M-11-7h22l-5 7 5 7h-22z" fill="${RED}" ${st}/>` }] }),
    sign: (x, y) => ({ s: G(x, y, 1, `<path d="M0 0v-34" ${sw(2.4)}/><path d="M-26-36h40l8 7-8 7h-40z" fill="#e8d2a6" ${st}/><text x="-6" y="-25" font-family="Georgia,serif" font-weight="700" font-size="12" fill="${INK}" text-anchor="middle">СТАРТ</text>`) }),
    hut: (x, y) => ({ s: D.hut(x, y, 1.5) }), palm: (x, y) => ({ s: D.palm(x, y, 1.4) }), tower: (x, y) => ({ s: D.tower(x, y, 1.2) }),
  };
  // земли: заливка, ориентиры, что растёт вокруг
  const BIOMES = [
    { name: 'Стоянка древних людей', wash: '#d8b77a', marks: ['cave', 'fire', 'stones'], decor: ['rock', 'rock', 'pine', 'pine', 'grass', 'hill', 'mount', 'bush'] },
    { name: 'Древняя деревня у реки', wash: '#e2c66f', marks: ['hut', 'hut', 'palm'], decor: ['field', 'field', 'palm', 'hut', 'grass', 'bush', 'flowers', 'tree'], river: true },
    { name: 'Долина мельниц', wash: '#a9c27e', marks: ['mill', 'windmill'], decor: ['tree', 'tree', 'tree', 'bush', 'flowers', 'field', 'grass', 'house'], river: true },
    { name: 'Мастерская Леонардо', wash: '#d9a57a', marks: ['workshop', 'tower', 'wings'], decor: ['house', 'house', 'tree', 'bush', 'grass', 'flowers', 'tower'] },
    { name: 'Город первых автомобилей', wash: '#c9b29a', marks: ['factory', 'tower'], decor: ['house', 'house', 'lamp', 'tree', 'bush', 'grass', 'house'] },
    { name: 'Город будущего', wash: '#a9c4cf', marks: ['city', 'turbine', 'turbine'], decor: ['block', 'block', 'panel', 'tree', 'bush', 'grass'] },
  ];

  // ---------- Транспорт: подробные рисунки (низ колёс — y = 0, ширина ~120) ----------
  const RDEF = `<defs>
    <linearGradient id="rWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a066"/><stop offset=".55" stop-color="#b47a43"/><stop offset="1" stop-color="#8a5a2b"/></linearGradient>
    <linearGradient id="rWoodD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8703c"/><stop offset="1" stop-color="#6d4420"/></linearGradient>
    <radialGradient id="rStone" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6dcc6"/><stop offset=".6" stop-color="#bfb092"/><stop offset="1" stop-color="#8f8166"/></radialGradient>
    <linearGradient id="rBrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d77a"/><stop offset=".5" stop-color="#c9a227"/><stop offset="1" stop-color="#8a6d1f"/></linearGradient>
    <linearGradient id="rBlack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55606a"/><stop offset=".5" stop-color="#2c3338"/><stop offset="1" stop-color="#14181b"/></linearGradient>
    <linearGradient id="rRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3734f"/><stop offset=".45" stop-color="#b8432a"/><stop offset="1" stop-color="#7a2512"/></linearGradient>
    <linearGradient id="rGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9f6fb"/><stop offset=".5" stop-color="#9fcbe0"/><stop offset="1" stop-color="#5f93ad"/></linearGradient>
    <radialGradient id="rTyre" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="#2c2a28"/><stop offset=".92" stop-color="#4a4743"/><stop offset="1" stop-color="#1c1a18"/></radialGradient>
  </defs>`;
  const shadow = (w) => `<ellipse cx="0" cy="1" rx="${w}" ry="4" fill="rgba(50,25,5,.28)"/>`;
  // колесо: solid — сплошное из досок, spokes — со спицами, tyre — с шиной
  const WH = (cx, cy, r, o = {}) => {
    const sp = o.spokes || 0;
    let g = `<circle r="${r}" fill="${o.solid ? 'url(#rWood)' : o.tyre ? 'url(#rTyre)' : '#7a4a24'}" stroke="${INK}" stroke-width="1.4"/>`;
    if (o.solid) g += `<path d="M${f1(-r * 0.35)} ${f1(-r * 0.94)}V${f1(r * 0.94)}M${f1(r * 0.35)} ${f1(-r * 0.94)}V${f1(r * 0.94)}" stroke="#6d4420" stroke-width="1"/><rect x="${f1(-r * 0.85)}" y="${f1(-r * 0.12)}" width="${f1(r * 1.7)}" height="${f1(r * 0.24)}" fill="url(#rWoodD)" stroke="${INK}" stroke-width=".8"/>${[-0.6, 0.6].map((k) => `<circle cx="${f1(r * k)}" cy="0" r="1.3" fill="${INK}"/>`).join('')}<path d="M${f1(-r * 0.7)} ${f1(-r * 0.55)}a${r} ${r} 0 0 1 ${f1(r * 0.9)} ${f1(-r * 0.4)}" fill="none" stroke="#f0c48a" stroke-width="1.6" opacity=".8"/>`;
    else {
      const rim = o.tyre ? r * 0.7 : r * 0.84;
      g += `<circle r="${f1(rim)}" fill="${o.tyre ? (o.rim || '#cfd6da') : '#efd9b0'}" stroke="${INK}" stroke-width="1"/>`;
      g += Array.from({ length: sp }, (_, i) => { const a = (i * 2 * Math.PI) / sp; return `<path d="M0 0L${f1(rim * Math.cos(a))} ${f1(rim * Math.sin(a))}" stroke="${o.tyre ? '#6f7a80' : '#7a4a24'}" stroke-width="${o.thin ? 0.8 : 1.6}"/>`; }).join('');
      if (!o.tyre) g += `<circle r="${r}" fill="none" stroke="#5b5650" stroke-width="2.2"/>`;
      g += `<circle r="${f1(Math.max(2.4, r * 0.22))}" fill="${o.tyre ? '#9aa4a9' : '#8a5a2b'}" stroke="${INK}" stroke-width=".9"/>`;
    }
    return `<g transform="translate(${cx} ${cy})"><g class="wm-wh">${g}</g></g>`;
  };
  const kid = (x, y, cap = RED) => `<g transform="translate(${x} ${y})"><path d="M-6 0c0-8 3-12 6-12s6 4 6 12z" fill="#5f7f8f" ${st}/><circle cy="-17" r="6" fill="#f2c9a0" ${st}/><path d="M-6.5-18.5c0-5 3-7.5 6.5-7.5s6.5 2.5 6.5 7.5c-3-1.5-9-1.5-13 0z" fill="${cap}" ${st}/><path d="M6-19h5" stroke="${INK}" stroke-width="2.2"/><circle cx="2.5" cy="-16.5" r=".9" fill="${INK}"/></g>`;
  const RIDES = [
    { name: 'Каток', fact: 'Каток: тяжёлый камень катили на брёвнах — так перевозили грузы ещё до изобретения колеса.',
      svg: `${shadow(46)}<path d="M-40-14l6-26 30-6 34 4 10 26z" fill="url(#rStone)" ${sw(1.6)}/><path d="M-30-30l14-4M6-38l10 8M-6-24l8 3" stroke="${INK2}" stroke-width="1"/><path d="M-32-36l26-5 30 3" fill="none" stroke="#f4ecdc" stroke-width="2" opacity=".7"/><path d="M40-30c10-2 16 2 22 0" fill="none" stroke="#b08a5a" stroke-width="2"/>`
        + [-28, 0, 28].map((cx) => `<g transform="translate(${cx} -7)"><g class="wm-wh"><circle r="7" fill="url(#rWood)" ${st}/><circle r="4.4" fill="none" stroke="#6d4420" stroke-width=".9"/><circle r="2" fill="none" stroke="#6d4420" stroke-width=".9"/></g></g>`).join('') },
    { name: 'Повозка со сплошными колёсами', fact: 'Повозка со сплошными деревянными колёсами — Месопотамия, около 5500 лет назад.',
      svg: `${shadow(48)}<path d="M28-30l30-8" stroke="#8a5a2b" stroke-width="3.4" stroke-linecap="round"/><path d="M-40-46h68v20h-68z" fill="url(#rWood)" ${sw(1.6)}/><path d="M-40-39h68M-40-32h68" stroke="#7a4a24" stroke-width=".9"/><path d="M-30-46v20M-6-46v20M18-46v20" stroke="#6d4420" stroke-width="1.4"/><path d="M-38-45h64" stroke="#f0c48a" stroke-width="1.4" opacity=".8"/>${kid(-14, -46, '#b08a2e')}${WH(-24, -16, 16, { solid: true })}${WH(14, -16, 16, { solid: true })}` },
    { name: 'Телега с колёсами со спицами', fact: 'Колёса со спицами легче и быстрее сплошных — так появились телеги и колесницы.',
      svg: `${shadow(50)}<path d="M30-34l30-8" stroke="#8a5a2b" stroke-width="3.4" stroke-linecap="round"/><path d="M-44-44h74v14h-74z" fill="url(#rWood)" ${sw(1.6)}/><path d="M-44-58v14M-30-58v14M-16-58v14M-2-58v14M12-58v14M26-58v14M-46-58h76" ${sw(1.6)}/><path d="M-40-58c6-8 18-10 26-6 8-6 20-4 26 6" fill="#e9cf7a" ${st}/><path d="M-34-60l4-5M-20-63l2-5M-2-63l3-5" stroke="#b08a2e" stroke-width="1"/>${kid(16, -58)}${WH(-26, -18, 18, { spokes: 10 })}${WH(16, -18, 18, { spokes: 10 })}` },
    { name: 'Самоходная тележка Леонардо', fact: 'Тележку Леонардо да Винчи двигали заведённые пружины — это один из первых чертежей самоходной машины.',
      svg: `${shadow(50)}<path d="M-46-30h86l-6 10h-74z" fill="url(#rWood)" ${sw(1.6)}/><path d="M-40-25h74" stroke="#7a4a24" stroke-width=".9"/><path d="M-20-30v-14h40v14" fill="url(#rWoodD)" ${st}/><g transform="translate(-6 -50)"><g class="wm-wh">${gearSvg(10, 10, '#d9b25a')}</g></g><g transform="translate(14 -48)"><g class="wm-wh" style="animation-direction:reverse">${gearSvg(7, 8, '#c9a227')}</g></g><path d="M34-30v-22h10" ${sw(2)}/><circle cx="44" cy="-52" r="2.4" fill="url(#rBrass)" ${st}/>${kid(-30, -30, '#5f7f8f')}${WH(-30, -13, 13, { spokes: 6 })}${WH(26, -13, 13, { spokes: 6 })}${WH(-2, -10, 10, { spokes: 6 })}` },
    { name: 'Автомобиль Карла Бенца', fact: 'Первый автомобиль с бензиновым мотором — Карл Бенц, 1886 год. У него было всего три колеса!',
      svg: `${shadow(50)}<path d="M-36-36h50l10 10h-60z" fill="url(#rBlack)" ${st}/><path d="M-30-36v-14c0-4 4-6 8-6h20c4 0 6 3 6 6v14" fill="#7a2512" ${st}/><path d="M-28-52c4-2 22-2 30 0" stroke="#e3734f" stroke-width="1.4" opacity=".8"/><circle cx="-30" cy="-26" r="6" fill="url(#rBrass)" ${st}/><path d="M14-30l18-22" stroke="${INK}" stroke-width="2"/><circle cx="33" cy="-53" r="4" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M-36-30h50" stroke="#c9a227" stroke-width="1.2"/>${kid(-14, -50, '#2c3338')}${WH(-22, -20, 20, { spokes: 16, thin: true })}${WH(30, -11, 11, { spokes: 10, thin: true })}` },
    { name: 'Автомобиль будущего', fact: 'Автомобиль твоего собственного проекта — каким он будет? Придумай и нарисуй его!',
      svg: `${shadow(56)}<path d="M-58-16c0-12 6-18 18-20l18-14h34l20 14c12 1 22 6 24 20l-2 6h-112z" fill="url(#rRed)" ${sw(1.6)}/><path d="M-18-48h14v12h-28zM2-48h10l14 12H2z" fill="url(#rGlass)" ${st}/><path d="M-14-46l-6 8M6-46l-4 8" stroke="#fff" stroke-width="1.6" opacity=".8"/><path d="M-50-28c30-6 60-6 98 0" stroke="#f4a27d" stroke-width="1.6" fill="none" opacity=".8"/><path d="M52-24h6" stroke="#ffe08a" stroke-width="4" stroke-linecap="round"/><path d="M-58-20h5" stroke="#ff6b4a" stroke-width="3" stroke-linecap="round"/>${kid(-2, -36, '#2f6f8f')}${WH(-32, -11, 12, { tyre: true, spokes: 5, rim: '#e7ecef' })}${WH(32, -11, 12, { tyre: true, spokes: 5, rim: '#e7ecef' })}` },
  ];
  const BALLOON = { name: 'Воздушный шар', fact: 'Воздушный шар путешественника — летит туда, где ты сейчас учишься.',
    svg: `${shadow(20)}<g transform="translate(0 -14)"><path d="M0-84c-22 0-34 14-34 32 0 18 18 28 26 40h16c8-12 26-22 26-40 0-18-12-32-34-32z" fill="url(#rRed)" ${sw(1.6)}/><path d="M0-84c-9 6-12 20-9 34 2 14 5 26 5 38M0-84c9 6 12 20 9 34-2 14-5 26-5 38" fill="none" stroke="#f6d4c4" stroke-width="1.2"/><path d="M-6-12l-3 10M6-12l3 10" ${st}/><path d="M-10-2h20v10h-20z" fill="url(#rWood)" ${st}/></g>` };

  // ---------- Миниатюры тем (медальоны, 100×100, вписаны в круг) ----------
  const M = (body) => `<svg viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
  const skyG = (a, b) => `<rect width="100" height="100" fill="${a}"/><rect y="62" width="100" height="38" fill="${b}"/>`;
  const TOPIC = [
    [/вводн|знакомств/i, M(`${skyG('#f6ecd2', '#e4cf9f')}<path d="M18 26h64v50H18z" fill="#fbf3df" ${sw(1.6)}/><path d="M14 24c0-4 8-4 8 0v54c0-4-8-4-8 0zM78 24c0-4 8-4 8 0v54c0-4-8-4-8 0z" fill="#e4cf9f" ${sw(1.6)}/><path d="M28 64c8-6 10-20 22-18s12 14 22 6" fill="none" stroke="${RED}" stroke-width="2.4" stroke-dasharray="4 3"/><path d="M66 48l6 6M72 48l-6 6" stroke="${RED}" stroke-width="2.6"/><path d="M30 38h14M30 44h9" stroke="${INK2}" stroke-width="1.4"/><g transform="translate(64 36)"><circle r="7" fill="#fff8ea" ${st}/><path d="M0-6l2 6-2 6-2-6z" fill="${RED}"/></g><path d="M58 86l26-26 5 5-26 26-7 2z" fill="#e9b949" ${st}/><path d="M58 86l2-7 5 5z" fill="#f2c9a0"/>`)],
    [/истори/i, M(`<rect width="100" height="100" fill="#f3dfae"/><circle cx="76" cy="22" r="9" fill="#f6c453" opacity=".9"/><path d="M8 66l12-12h8l8-8h12l8 8h8l12 12z" fill="#d8b37a" ${st}/><path d="M28 54h40M36 46h24" stroke="${INK2}" stroke-width="1"/><rect y="66" width="100" height="34" fill="#e4c88e"/><g transform="translate(46 64)">${WH(0, 0, 24, { solid: true }).replace('class="wm-wh"', '')}</g><path d="M20 90h60" stroke="${INK2}" stroke-width="1"/>`)],
    [/трени|скольж|качен/i, M(`${skyG('#eef1e6', '#d9c99c')}<path d="M6 82L94 50v40H6z" fill="#c9b48a" ${st}/><path d="M6 82L94 50" stroke="${INK}" stroke-width="2"/><g transform="rotate(-20 30 68)"><rect x="18" y="56" width="24" height="16" fill="url(#rWood)" ${st}/><path d="M18 64h24" stroke="#6d4420"/></g><path d="M14 80l-6 2M20 78l-6 2" stroke="#e0661b" stroke-width="2.2"/><g transform="translate(68 46)">${WH(0, 0, 11, { spokes: 6 }).replace('class="wm-wh"', '')}</g><path d="M50 34c6-6 16-6 22-2M78 30l-4 2 2 4" fill="none" stroke="${RED}" stroke-width="2"/>`)],
    [/характерист|размер|ширин/i, M(`${skyG('#eef3f4', '#dcc89a')}<g transform="translate(34 56)">${WH(0, 0, 22, { tyre: true, spokes: 6 }).replace('class="wm-wh"', '')}</g><g transform="translate(76 66)">${WH(0, 0, 12, { tyre: true, spokes: 5 }).replace('class="wm-wh"', '')}</g><path d="M8 86h84" stroke="${RED}" stroke-width="2.4"/><path d="M8 82v8M92 82v8M50 83v6M29 84v4M71 84v4" stroke="${RED}" stroke-width="1.6"/><path d="M12 30v52M10 30h4M10 82h4" stroke="#2f6f8f" stroke-width="1.6"/>`)],
    [/перспектив|иде|будущ/i, M(`<rect width="100" height="100" fill="#2f4f6a"/><g stroke="#ffe7a3" stroke-width="2.4" stroke-linecap="round" opacity=".9"><path d="M50 8v8M20 20l6 6M80 20l-6 6M10 48h8M82 48h8"/></g><circle cx="50" cy="44" r="26" fill="#ffe7a3" opacity=".25"/><path d="M50 22a20 20 0 0 0-12 36c3 2 5 5 5 9v3h14v-3c0-4 2-7 5-9A20 20 0 0 0 50 22z" fill="#fff4c2" ${sw(1.6)}/><g transform="translate(50 44)">${gearSvg(8, 8, '#e9b949')}</g><path d="M43 74h14M44 79h12M46 84h8" stroke="#cfd6da" stroke-width="3" stroke-linecap="round"/>`)],
    [/исследов|измер|опыт/i, M(`<rect width="100" height="100" fill="#fbf6e9"/><g stroke="#bcd3dc" stroke-width=".8">${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 10} 0v100M0 ${i * 10}h100"/>`).join('')}</g><path d="M10 80c14-4 22-24 34-26s18 14 28 10 14-20 20-26" fill="none" stroke="${RED}" stroke-width="2.4"/>${[[24, 66], [44, 54], [62, 60], [80, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${RED}"/>`).join('')}<circle cx="60" cy="36" r="17" fill="rgba(207,231,241,.55)" stroke="${INK}" stroke-width="3"/><path d="M48 30a12 12 0 0 1 10-8" stroke="#fff" stroke-width="2.4" fill="none"/><path d="M72 48l16 16" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M72 48l16 16" stroke="#a06a33" stroke-width="3.4" stroke-linecap="round"/>`)],
    [/инженер|конструкт|чертёж|чертеж/i, M(`<rect width="100" height="100" fill="#2f5f86"/><g stroke="#5f8fb3" stroke-width=".7">${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 10} 0v100M0 ${i * 10}h100"/>`).join('')}</g><circle cx="50" cy="60" r="24" fill="none" stroke="#eaf3f8" stroke-width="1.6" stroke-dasharray="3 2"/><path d="M14 86l40-40v40z" fill="rgba(234,243,248,.25)" stroke="#eaf3f8" stroke-width="1.6"/><path d="M50 14l-14 50M50 14l16 48" stroke="url(#rBrass)" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="14" r="5" fill="url(#rBrass)" ${st}/><path d="M66 62l-2 8" stroke="${INK}" stroke-width="2"/>`)],
    [/автомоб|машин/i, M(`${skyG('#e4f0f4', '#cdbb93')}<path d="M0 74h100" stroke="${INK2}" stroke-width="1"/><path d="M8 80h18M40 80h18M72 80h18" stroke="#fff8ea" stroke-width="2"/><g transform="translate(50 72) scale(.7)">${RIDES[5].svg.replace(/class="wm-wh"/g, '')}</g>`)],
    [/проект|разработ|собствен/i, M(`<rect width="100" height="100" fill="#2f5f86"/><g stroke="#5f8fb3" stroke-width=".7">${Array.from({ length: 10 }, (_, i) => `<path d="M${i * 10} 0v100M0 ${i * 10}h100"/>`).join('')}</g><g transform="translate(46 66) scale(.62)" fill="none" stroke="#eaf3f8" stroke-width="2.2"><path d="M-58-16c0-12 6-18 18-20l18-14h34l20 14c12 1 22 6 24 20l-2 6h-112z"/><circle cx="-32" cy="-11" r="12"/><circle cx="32" cy="-11" r="12"/><path d="M-18-48h14v12h-28zM2-48h10l14 12H2z"/></g><path d="M18 22h30M18 28h18" stroke="#eaf3f8" stroke-width="1.6"/><path d="M70 92l22-22 5 5-22 22-7 2z" fill="#e9b949" ${st}/><path d="M80 14l2 5 5 1-4 3 1 5-4-3-5 3 1-5-4-3 5-1z" fill="#ffe7a3"/>`)],
  ];
  const DEF_T = M(`<rect width="100" height="100" fill="#f3e6c6"/><g transform="translate(50 50)">${gearSvg(26, 14, '#e9b949')}</g>`);
  const topicIcon = (title) => (TOPIC.find(([re]) => re.test(title)) || [0, DEF_T])[1];
  const BADGE = { done: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="3.2"/>', review: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>', locked: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>', buy: '<path d="M3 4h2.5l2.2 10.5h10l2-7.5H6.4"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>' };
  const badge = (k) => BADGE[k] ? `<i class="wm-badge b-${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${BADGE[k]}</svg></i>` : '';

  // ---------- Дорога: сплайн через станции и длины по ней ----------
  function spline(pts) {
    let d = `M${pts[0].x} ${pts[0].y}`; const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C${f1(c1.x)} ${f1(c1.y)} ${f1(c2.x)} ${f1(c2.y)} ${p2.x} ${p2.y}`; segs.push([p1, c1, c2, p2]);
    }
    const samples = [{ x: pts[0].x, y: pts[0].y, len: 0 }], knots = [0]; let len = 0;
    segs.forEach(([a, b, c, e]) => {
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, u = 1 - t, x = u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * e.x, y = u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * e.y;
        const p = samples[samples.length - 1]; len += Math.hypot(x - p.x, y - p.y); samples.push({ x, y, len });
      }
      knots.push(len);
    });
    return { d, samples, knots, len };
  }
  function at(road, l) {
    const s = road.samples; l = Math.max(0, Math.min(road.len, l));
    let lo = 0, hi = s.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].len < l) lo = m; else hi = m; }
    const a = s[lo], b = s[hi], t = b.len > a.len ? (l - a.len) / (b.len - a.len) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: b.x - a.x };
  }

  // ---------- Раскладка и украшения ----------
  const STEP = 165, TAIL = 160, PAD = 90; let HEAD = 180;
  const XS = [150, 330, 350, 190, 120, 300, 360, 200, 130, 280];
  function layout(modules) {
    let y = 64, k = 0; const regions = [], pts = [{ x: W / 2, y: 40, kind: 'start' }];
    modules.forEach((m, bi) => {
      const y0 = y, r = { m, bi, y0, stations: [], biome: BIOMES[bi % BIOMES.length] };
      y += HEAD;
      m.lessons.forEach((l) => { const p = { x: Math.round((XS[k++ % XS.length] * W) / 480), y, kind: 'st', l, bi }; r.stations.push(p); pts.push(p); y += STEP; });
      y += TAIL - STEP + 30;
      r.chest = { x: Math.round((XS[k++ % XS.length] * W) / 480), y: y - 50, kind: 'chest', bi }; pts.push(r.chest);
      r.y1 = y + 20; y = r.y1; regions.push(r);
    });
    return { regions, pts, H: y + 30 };
  }
  function decorate(lay, road, seed) {
    const R = rnd(seed), rivers = [];
    lay.regions.forEach((r) => {
      r.decor = []; r.marks = [];
      // для проверок — только точки дороги рядом с землёй (быстрее на телефоне)
      const near = road.samples.filter((p) => p.y > r.y0 - 120 && p.y < r.y1 + 120), pts = lay.pts.filter((p) => p.y > r.y0 - 120 && p.y < r.y1 + 120);
      const nearRoad = (x, y, d) => near.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < d * d);
      const nearPts = (x, y, d) => pts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < d * d);
      // река поперёк земли, где она есть; мост — где её пересекает дорога
      if (r.biome.river && r.stations.length) {
        const s0 = r.stations[0], s1 = r.stations[1] || r.chest, ry = (s0.y + s1.y) / 2, rp = [];
        for (let x = -20; x <= W + 20; x += 20) rp.push({ x, y: ry - 30 + x * 0.12 + Math.sin(x / 55 + r.bi) * 14 });
        const rv = { d: 'M' + rp.map((p) => `${f1(p.x)} ${f1(p.y)}`).join(' L'), pts: rp };
        let best = null; near.forEach((p) => { if (p.y <= s0.y || p.y >= s1.y) return; const q = rp.reduce((a, b) => (Math.abs(b.x - p.x) < Math.abs(a.x - p.x) ? b : a)); const dd = Math.abs(q.y - p.y); if (!best || dd < best.dd) best = { dd, x: p.x, y: p.y }; });
        rv.bridge = best; rivers.push(rv);
      }
      const riverNear = (x, y, d) => rivers.some((rv) => rv.pts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < d * d));
      const cand = [];
      for (let y = r.y0 + 70; y < r.y1 - 20; y += 18) for (let x = 50; x <= W - 50; x += 18) {
        if ((y < r.y0 + 125 && Math.abs(x - W / 2) < 155) || nearPts(x, y, 95) || nearRoad(x, y, 78) || riverNear(x, y, 30)) continue;
        cand.push({ x, y, s: R() });
      }
      cand.sort((a, b) => a.s - b.s);
      r.biome.marks.forEach((k) => {
        const c = cand.find((c) => !r.marks.some((m) => (m.x - c.x) ** 2 + (m.y - c.y) ** 2 < 110 * 110) && (k !== 'mill' || riverNear(c.x, c.y, 60)));
        if (c) r.marks.push({ k, x: c.x, y: c.y });
      });
      for (let y = r.y0 + 20; y < r.y1; y += 26) for (let x = 14; x <= W - 14; x += 26) {
        const jx = x + (R() - 0.5) * 18, jy = y + (R() - 0.5) * 16, skip = R() < 0.5, k = r.biome.decor[Math.floor(R() * r.biome.decor.length)], s = 0.75 + R() * 0.5, rr = R();
        if (skip || (jy < r.y0 + 118 && Math.abs(jx - W / 2) < 155) || r.marks.some((m) => (m.x - jx) ** 2 + (m.y - jy) ** 2 < 55 * 55) || nearPts(jx, jy, 60) || nearRoad(jx, jy, 34) || riverNear(jx, jy, 14)) continue;
        r.decor.push({ k, x: jx, y: jy, s, r: rr });
      }
    });
    return rivers;
  }

  // ---------- Картинка земли (неподвижная часть) ----------
  const LDEF = (bi, wash) => `<defs><radialGradient id="w${bi}" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${wash}" stop-opacity=".55"/><stop offset=".7" stop-color="${wash}" stop-opacity=".28"/><stop offset="1" stop-color="${wash}" stop-opacity="0"/></radialGradient>`
    + `<pattern id="h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v9" stroke="rgba(110,75,44,.16)" stroke-width="1"/></pattern>`
    + `<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe0bf" stop-opacity="0"/><stop offset=".14" stop-color="#efe0bf" stop-opacity=".9"/><stop offset="1" stop-color="#efe0bf" stop-opacity=".93"/></linearGradient></defs>`;
  function regionSvg(lay, road, rivers, r, doneLen, fog, first) {
    const y0 = r.y0 - PAD, h = r.y1 - r.y0 + PAD * 2;
    let g = LDEF(r.bi, r.biome.wash);
    g += `<rect x="0" y="${r.y0}" width="${W}" height="${r.y1 - r.y0}" fill="#f1e2c0"/>`;
    if (first) g += `<rect x="0" y="0" width="${W}" height="${r.y0}" fill="#f1e2c0"/>`;
    g += `<ellipse cx="${W / 2}" cy="${(r.y0 + r.y1) / 2}" rx="${W * 0.75}" ry="${(r.y1 - r.y0) * 0.6}" fill="url(#w${r.bi})"/>`;
    if (!first) g += `<path d="M0 ${r.y0} C${W * 0.3} ${r.y0 - 14} ${W * 0.6} ${r.y0 + 14} ${W} ${r.y0}" fill="none" stroke="rgba(110,75,44,.45)" stroke-width="1.2" stroke-dasharray="6 5"/>`;
    g += rivers.map((rv) => `<path d="${rv.d}" fill="none" stroke="#7fa6bf" stroke-opacity=".55" stroke-width="26" stroke-linecap="round"/><path d="${rv.d}" fill="none" stroke="#a9c8d8" stroke-width="16" stroke-linecap="round"/><path d="${rv.d}" fill="none" stroke="#e8f2f6" stroke-width="1.4" stroke-dasharray="8 20"/>`).join('');
    // дорога: тень, полотно, штриховка; пройденная часть — золотом; разметка
    g += `<path d="${road.d}" fill="none" stroke="rgba(74,44,20,.55)" stroke-width="30" stroke-linecap="round"/><path d="${road.d}" fill="none" stroke="#e6cf9c" stroke-width="25" stroke-linecap="round"/><path d="${road.d}" fill="none" stroke="url(#h)" stroke-width="25"/>`
      + (doneLen > 0 ? `<path d="${road.d}" fill="none" stroke="#d9b54a" stroke-opacity=".8" stroke-width="9" stroke-linecap="round" stroke-dasharray="${f1(doneLen)} ${Math.ceil(road.len) + 10}"/>` : '')
      + `<path d="${road.d}" fill="none" stroke="rgba(110,75,44,.55)" stroke-width="1.6" stroke-dasharray="7 9"/>`;
    g += rivers.filter((rv) => rv.bridge).map((rv) => { const b = rv.bridge; return G(b.x, b.y, 1, `<rect x="-22" y="-16" width="44" height="32" fill="#c28f58" ${st}/>${[-10, -2, 6].map((yy) => `<path d="M-22 ${yy}h44" stroke="${INK2}" stroke-width=".9"/>`).join('')}<path d="M-24-17h48M-24 17h48" stroke="${INK}" stroke-width="2.4"/>`); }).join('');
    const items = [...r.decor.map((d) => ({ y: d.y, s: D[d.k](d.x, d.y, d.s, d.r) })), ...r.marks.map((m) => ({ y: m.y, s: L[m.k](m.x, m.y).s || '' }))].sort((a, b) => a.y - b.y);
    g += items.map((i) => i.s).join('');
    if (first) g += L.sign(W / 2 - 44, 50).s + `<g transform="translate(${W - 46} 54)" opacity=".85"><circle r="26" fill="#f6ead0" ${st}/><path d="M0-30l5 26-5 4-5-4zM0 30l5-26-5-4-5 4z" fill="${INK}"/><path d="M-30 0l26 5 4-5-4-5zM30 0l-26 5-4-5 4-5z" fill="#c28f58" ${st}/><text y="-33" text-anchor="middle" font-size="10" font-family="Georgia,serif" font-weight="700" fill="${INK}">С</text></g>`;
    if (r.last) g += L.flag(r.chest.x + 58, r.chest.y + 26).s;
    if (fog) g += `<rect x="0" y="${r.y0 - 40}" width="${W}" height="${r.y1 - r.y0 + 40}" fill="url(#fog)"/><rect x="0" y="${r.y0}" width="${W}" height="${r.y1 - r.y0}" fill="url(#h)" opacity=".8"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${y0} ${W} ${h}" width="${W * 2}" height="${h * 2}">${g}</svg>`;
  }
  // движущиеся детали земли — маленькие отдельные элементы
  // дым — три отдельных клуба: каждый движется целиком (это делает видеокарта, без перерисовки картинки)
  const piece = (a, H) => a.k === 'smoke' ? [[0, 10, 5], [3, 0, 6], [1, -12, 7]].map(([dx, dy, r], i) => piece({ x: a.x + dx, y: a.y + dy, z: r * 2 + 2, k: 'smoke p' + (i + 1), svg: `<circle r="${r}" fill="${a.fill}"/>` }, H)).join('')
    : `<div class="wm-a ${a.k}" style="left:${f1(((a.x - a.z / 2) / W) * 100)}%;top:${f1(((a.y - a.z / 2) / H) * 1000) / 10}%;width:${f1((a.z / W) * 100)}%"><svg viewBox="${-a.z / 2} ${-a.z / 2} ${a.z} ${a.z}">${a.svg}</svg></div>`;
  const CLOUD = `<path d="M-40 10c-3-12 12-18 20-10 5-12 26-10 28 3 10-3 16 8 8 13h-52c-8 0-8-6-4-6z" fill="#fffaf0" stroke="rgba(110,75,44,.4)" stroke-width="1.2"/>`;
  const BIRDS = `<path d="M-20 4q4-5 8 0q4-5 8 0M6-4q3-4 6 0q3-4 6 0" fill="none" stroke="${INK}" stroke-width="1.4"/>`;

  // ---------- Стили ----------
  const CSS = `
.wm{position:relative;margin:0 auto;max-width:640px;font-family:"PT Serif",Georgia,serif;color:var(--ink,#3a2313);--u:1px;user-select:none;-webkit-tap-highlight-color:transparent;background:#f1e2c0;border-radius:6px;box-shadow:0 10px 26px rgba(60,30,10,.18);overflow:hidden;contain:layout paint}
.wm::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:6px;box-shadow:inset 0 0 0 2px rgba(74,44,20,.5),inset 0 0 0 7px rgba(242,228,196,.6),inset 0 0 0 8px rgba(74,44,20,.35);z-index:4}
.wm-img{position:absolute;left:0;width:100%;display:block;pointer-events:none}
.wm-r{position:absolute;left:0;width:100%;pointer-events:none}
.wm-a{position:absolute;aspect-ratio:1;pointer-events:none;will-change:transform}
.wm-a svg{display:block;width:100%;height:100%;overflow:visible}
.wm-a.spin{animation:wmSpin 7s linear infinite}.wm-a.slow{animation-duration:14s}
.wm-a.flame{transform-origin:50% 80%;animation:wmFlame .9s ease-in-out infinite alternate}
.wm-a.smoke{animation:wmSmoke 4s ease-out infinite;opacity:0}
.wm-a.smoke.p2{animation-delay:1.3s}.wm-a.smoke.p3{animation-delay:2.6s}
.wm-a.float{animation:wmFloat 5s ease-in-out infinite}
.wm-a.wave{transform-origin:0 50%;animation:wmWave 1.6s ease-in-out infinite alternate}
.wm-a.cloud{animation:wmCloud 80s linear infinite;opacity:.9}.wm-a.birds{animation:wmBird 24s linear infinite}
.wm-r:not(.live) .wm-a,.wm-r:not(.live) .wm-a *{animation-play-state:paused}
@keyframes wmSpin{to{transform:rotate(360deg)}}
@keyframes wmFlame{from{transform:scale(1,1)}to{transform:scale(.86,1.14)}}
@keyframes wmSmoke{0%{opacity:0;transform:translateY(60%) scale(.5)}30%{opacity:.55}100%{opacity:0;transform:translateY(-120%) scale(1.4)}}
@keyframes wmFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(14%,-8%)}}
@keyframes wmCloud{from{transform:translateX(-120%)}to{transform:translateX(900%)}}
@keyframes wmBird{from{transform:translate(-150%,0)}to{transform:translate(1100%,-60%)}}
@keyframes wmWave{from{transform:skewY(0)}to{transform:skewY(-10deg)}}
/* транспорт */
.wm-ride{position:absolute;left:0;top:0;width:calc(var(--u)*150);aspect-ratio:150/100;z-index:3;cursor:pointer;will-change:transform;-webkit-tap-highlight-color:transparent}
.wm-ride svg{display:block;width:100%;height:100%;overflow:visible}
.wm-ride .bob{width:100%;height:100%;animation:wmBob 2.6s ease-in-out infinite;will-change:transform}.wm-ride.go .bob{animation-duration:.32s}
.wm-ride .wm-wh{transform-box:fill-box;transform-origin:center}
.wm-ride.go .wm-wh{animation:wmSpin .7s linear infinite}
.wm-ride.flip svg{transform:scaleX(-1)}
.wm-trail{position:absolute;left:-14%;bottom:8%;width:34%;height:46%;opacity:0;transition:opacity .3s;pointer-events:none}
.wm-ride.go .wm-trail{opacity:1}.wm-ride.flip .wm-trail{left:auto;right:-14%;transform:scaleX(-1)}
.wm-trail i{position:absolute;right:0;top:50%;width:9px;height:9px;margin-top:-4px;background:radial-gradient(circle,#fff4c2 20%,#e9b949 45%,rgba(233,185,73,0) 70%);border-radius:50%;opacity:0}
.wm-ride.go .wm-trail i{animation:wmSpark .9s linear infinite;animation-delay:var(--d)}
@keyframes wmSpark{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(-90px,var(--y)) scale(.3)}}
@keyframes wmBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
/* заголовок земли */
.wm-land{position:absolute;left:50%;transform:translate(-50%,0);width:calc(var(--u)*290);text-align:center;padding:calc(var(--u)*8) calc(var(--u)*14);background:#f6ead0;border:1.5px solid ${INK};box-shadow:0 0 0 3px #f6ead0,0 0 0 4px rgba(74,44,20,.5),0 6px 14px rgba(60,30,10,.2);border-radius:3px;z-index:2}
.wm-land small{display:block;font-size:clamp(9.5px,calc(var(--u)*11),13px);letter-spacing:.12em;text-transform:uppercase;color:var(--sanguine,#9a3a1b)}
.wm-land b{display:block;font:700 clamp(15px,calc(var(--u)*20),24px)/1.1 "Cormorant Garamond",Georgia,serif}
.wm-land span{display:block;font-size:clamp(10.5px,calc(var(--u)*12),14px);color:var(--ink-soft,#6e4b2c);font-style:italic}
.wm-land.fog{opacity:.75}
/* станции */
.wm-st{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;border:0;background:none;padding:0;font:inherit;color:inherit;cursor:pointer;z-index:2}
.wm-med{position:relative;width:calc(var(--u)*82);height:calc(var(--u)*82);border-radius:50%;display:block;background:#f6ead0;
  border:calc(var(--u)*5) solid var(--sanguine,#9a3a1b);box-shadow:0 calc(var(--u)*6) 0 #6b2611,0 calc(var(--u)*9) calc(var(--u)*14) rgba(60,25,5,.3);transition:transform .15s}
.wm-med>svg:first-of-type{position:absolute;inset:0;width:100%;height:100%;border-radius:50%}
.wm-med::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 calc(var(--u)*3) calc(var(--u)*6) rgba(255,255,255,.55),inset 0 calc(var(--u)*-4) calc(var(--u)*8) rgba(60,30,10,.25);pointer-events:none}
@media(hover:hover){.wm-st:hover .wm-med{transform:translateY(-2px) scale(1.04)}}.wm-st:active .wm-med{transform:translateY(3px)}
.wm-st.s-done .wm-med{border-color:#c9a227;box-shadow:0 calc(var(--u)*6) 0 #8a6d1f,0 calc(var(--u)*9) calc(var(--u)*14) rgba(60,25,5,.25)}
.wm-st.s-review .wm-med{border-color:#d48a2c;box-shadow:0 calc(var(--u)*6) 0 #93591a,0 calc(var(--u)*9) calc(var(--u)*14) rgba(60,25,5,.25)}
.wm-st.s-locked .wm-med,.wm-st.s-buy .wm-med{border-color:#a89a83;box-shadow:0 calc(var(--u)*6) 0 #8a7c66}
.wm-st.s-locked .wm-med>svg:first-of-type,.wm-st.s-buy .wm-med>svg:first-of-type{opacity:.45;filter:grayscale(1)}
.wm-st.s-current .wm-med{width:calc(var(--u)*96);height:calc(var(--u)*96)}
.wm-pulse{position:absolute;inset:calc(var(--u)*-14);border-radius:50%;border:3px solid rgba(154,58,27,.45);animation:pmPulse 1.8s ease-out infinite;pointer-events:none;will-change:transform,opacity}
.wm-ring{position:absolute;inset:calc(var(--u)*-12);width:calc(100% + var(--u)*24);height:calc(100% + var(--u)*24);transform:rotate(-90deg);pointer-events:none}
.wm .wm-badge{position:absolute;right:-6%;bottom:-6%;width:calc(var(--u)*28);height:calc(var(--u)*28);border-radius:50%;display:grid;place-items:center;color:#fff;background:#c9a227;border:2px solid #fff6e6;z-index:1}
.wm .wm-badge svg{width:62%;height:62%;display:block}.wm .wm-badge.b-review{background:#d48a2c}.wm .wm-badge.b-locked,.wm .wm-badge.b-buy{background:#8a7c66}
.wm-lbl{margin-top:calc(var(--u)*12);max-width:calc(var(--u)*170);padding:3px 9px;border-radius:3px;background:rgba(246,234,208,.94);border:1px solid rgba(74,44,20,.35);font-size:clamp(11px,calc(var(--u)*13),15px);line-height:1.25;text-align:center}
.wm-lbl small{display:block;font-size:clamp(10.5px,calc(var(--u)*11),13px);color:var(--ink-soft,#6e4b2c)}
.wm-st.s-locked .wm-lbl,.wm-st.s-buy .wm-lbl{color:var(--ink-soft,#6e4b2c)}
.wm-tag{position:absolute;bottom:calc(100% + var(--u)*14);left:50%;transform:translateX(-50%);padding:6px 14px;border:2px solid var(--sanguine,#9a3a1b);border-radius:5px;background:#fff8e8;color:var(--sanguine,#9a3a1b);font-weight:700;font-size:clamp(13px,calc(var(--u)*15),17px);white-space:nowrap;animation:pmBob 1.6s ease-in-out infinite;pointer-events:none;z-index:3}
.wm-tag::after{content:"";position:absolute;top:100%;left:50%;margin-left:-7px;border:7px solid transparent;border-top-color:var(--sanguine,#9a3a1b)}
.wm-chest{position:absolute;transform:translate(-50%,-50%);display:grid;justify-items:center;border:0;background:none;padding:0;font:inherit;color:var(--ink-soft,#6e4b2c);cursor:default;z-index:2}
.wm-chest .pm-chest-svg{position:relative;width:calc(var(--u)*86);height:calc(var(--u)*76)}
.wm-chest.lock .pm-chest-svg{opacity:.55;filter:grayscale(.85)}
.wm-chest.ready{cursor:pointer;color:var(--sanguine,#9a3a1b)}
.wm-chest.ready::before{content:"";position:absolute;left:50%;top:38%;width:calc(var(--u)*120);height:calc(var(--u)*120);transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,214,107,.85),rgba(255,214,107,0) 65%);pointer-events:none}
.wm-chest.ready .pm-chest-svg{animation:pmWiggle 1.6s ease-in-out infinite}
.wm-chest.done .pm-chest-svg{opacity:.7}
.wm-chest .wm-lbl{margin-top:2px;position:relative}
.wm-say{position:absolute;z-index:5;transform:translate(-50%,calc(-100% - var(--u)*70));width:min(260px,70%);padding:10px 14px;background:#fff8e8;border:2px solid ${INK};border-radius:8px;font-size:14px;line-height:1.4;box-shadow:0 8px 18px rgba(60,30,10,.25);animation:heroPop .3s cubic-bezier(.2,.9,.3,1.4)}
.wm-say b{display:block;font:700 17px/1.15 "Cormorant Garamond",Georgia,serif;margin-bottom:3px}
.wm-say::after{content:"";position:absolute;top:100%;left:50%;margin-left:-8px;border:8px solid transparent;border-top-color:${INK}}
.wm-up{position:absolute;z-index:6;left:50%;transform:translate(-50%,-50%);padding:12px 18px;background:linear-gradient(135deg,#fff3cf,#f4dc9a);border:2px solid #b8892b;border-radius:6px;text-align:center;font-weight:700;box-shadow:0 10px 24px rgba(60,30,10,.3);animation:heroPop .45s cubic-bezier(.2,.9,.3,1.5);white-space:nowrap}
.wm-up small{display:block;font-weight:400;font-size:13px}
@media(prefers-reduced-motion:reduce){.wm *{animation:none!important}}
`;
  function style() { if (window.Path) Path.style(); if (document.getElementById('world-css')) return; const s = document.createElement('style'); s.id = 'world-css'; s.textContent = CSS; document.head.append(s); }

  // картинки земель запоминаются (ключ — курс, ширина, программа и прогресс)
  const cache = new Map();
  function build(modules, slug, fogFrom, doneKey, doneLenOf) {
    const key = [slug, W, fogFrom, doneKey, modules.map((m) => m.id + ':' + m.lessons.map((l) => l.id).join('.')).join('|')].join('/');
    if (cache.has(key)) return cache.get(key);
    const lay = layout(modules), road = spline(lay.pts.map((p) => ({ x: p.x, y: p.y })));
    if (lay.regions.length) lay.regions[lay.regions.length - 1].last = true;
    const seed = [...String(slug || 'x')].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const rivers = decorate(lay, road, seed), doneLen = doneLenOf(lay, road);
    const imgs = lay.regions.map((r, i) => URL.createObjectURL(new Blob([regionSvg(lay, road, rivers, r, doneLen, r.bi >= fogFrom, i === 0)], { type: 'image/svg+xml' })));
    const out = { lay, road, imgs };
    if (cache.size > 6) { const [k, v] = cache.entries().next().value; v.imgs.forEach((u) => URL.revokeObjectURL(u)); cache.delete(k); }
    cache.set(key, out);
    return out;
  }

  // гудок (украшение из лавки): два коротких «би-бип»
  let actx = null;
  function honk() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t = actx.currentTime;
      [[0, 392], [0.2, 330]].forEach(([d, f]) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.17);
        o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.2); });
    } catch (e) {}
  }

  // ---------- Карта ----------
  let io = null;
  function map(el, { sb, modules, courseId, slug, userId, status, onOpen }) {
    style();
    W = (el.clientWidth || 480) < 520 ? 380 : 480; HEAD = W < 480 ? 275 : 210;
    const chests = new Set((status && status.chests) || []);
    const all = modules.flatMap((m) => m.lessons), ti = all.findIndex((l) => l.state !== 'done');
    const curBlock = ti >= 0 ? modules.findIndex((m) => m.lessons.includes(all[ti])) : modules.length - 1, fogFrom = curBlock + 1;
    const { lay, road, imgs } = build(modules, slug, fogFrom, ti, (lay_, road_) => {
      const st_ = lay_.pts.filter((p) => p.kind === 'st'); return ti >= 0 ? road_.knots[lay_.pts.indexOf(st_[ti])] : road_.len;
    });
    const H = lay.H, stations = lay.pts.filter((p) => p.kind === 'st'), target = ti >= 0 ? stations[ti] : null;
    const knotOf = (p) => road.knots[lay.pts.indexOf(p)];
    const targetLen = target ? Math.max(0, knotOf(target) - 80) : road.len;
    const themed = slug === 'wheel', ride = themed ? RIDES[Math.min(curBlock, RIDES.length - 1)] : BALLOON;

    let html = '';
    lay.regions.forEach((r, i) => {
      const top = ((r.y0 - PAD) / H) * 100, hh = ((r.y1 - r.y0 + PAD * 2) / H) * 100;
      html += `<img class="wm-img" src="${imgs[i]}" alt="" style="top:${f1(top * 10) / 10}%;height:${f1(hh * 10) / 10}%" ${i > 1 ? 'loading="lazy"' : ''} decoding="async" draggable="false">`;
      // движущиеся детали земли — свой слой, который засыпает вне экрана
      const parts = r.bi >= fogFrom ? [] : r.marks.flatMap((m) => L[m.k](m.x, m.y).a || []);
      if (r.last && r.bi < fogFrom) parts.push(...L.flag(r.chest.x + 58, r.chest.y + 26).a);
      const cy = r.y0 + 60 + ((r.bi * 97) % Math.max(60, r.y1 - r.y0 - 200));
      parts.push({ x: 0, y: cy, z: 90, k: 'cloud', svg: CLOUD });
      if (r.bi % 2 === 0) parts.push({ x: 0, y: cy + 140, z: 44, k: 'birds', svg: BIRDS });
      html += `<div class="wm-r" data-r="${i}" style="top:0;height:100%">${parts.map((a) => piece(a, H)).join('')}</div>`;
    });
    lay.regions.forEach((r) => {
      const ls = r.m.lessons, done = ls.filter((l) => l.state === 'done').length;
      html += `<div class="wm-land${r.bi >= fogFrom ? ' fog' : ''}" style="top:${f1(((r.y0 + 22) / H) * 1000) / 10}%"><small>Земля ${r.bi + 1} · ${done} из ${ls.length}${done === ls.length && ls.length ? ' ✓' : ''}</small><b>${esc(r.m.title)}</b><span>${esc(r.biome.name)}</span></div>`;
      r.stations.forEach((p) => {
        const l = p.l, sub = l.state === 'current' ? (l.steps ? `шаги: ${l.done} из ${l.steps}` : '') : { done: 'пройдена', review: 'на проверке', open: 'открыта', locked: 'закрыта', buy: 'не оплачена' }[l.state];
        const pct = l.steps ? Math.round((l.done * 100) / l.steps) : 0;
        const ring = l.state === 'current' ? `<span class="wm-pulse"></span><svg class="wm-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(74,44,20,.18)" stroke-width="6"/><circle cx="50" cy="50" r="46" fill="none" stroke="#c9a227" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(289 * pct) / 100} 290"/></svg>` : '';
        html += `<button type="button" class="wm-st s-${l.state}" data-id="${l.id}" style="left:${f1((p.x / W) * 1000) / 10}%;top:${f1((p.y / H) * 1000) / 10}%" aria-label="${esc(l.title)}${sub ? ' — ' + esc(sub) : ''}">`
          + `${l.state === 'current' ? `<span class="wm-tag">${l.done ? 'Продолжить' : 'Начать'}</span>` : ''}<span class="wm-med">${topicIcon(l.title)}${ring}${badge(l.state)}</span>`
          + `<span class="wm-lbl">${esc(l.title)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
      });
      const kind = r.last && courseId ? 'course' : 'block', ref = kind === 'course' ? courseId : r.m.id;
      const allDone = ls.length && done === ls.length, cst = chests.has(kind + ':' + ref) ? 'done' : allDone ? 'ready' : 'lock';
      html += `<button type="button" class="wm-chest ${cst}" data-kind="${kind}" data-ref="${ref}" style="left:${f1((r.chest.x / W) * 1000) / 10}%;top:${f1((r.chest.y / H) * 1000) / 10}%" aria-label="${kind === 'course' ? 'Кубок за курс' : 'Сундук за блок'}">`
        + `${kind === 'course' ? Path.cupSvg : Path.chestSvg(cst === 'done')}<span class="wm-lbl"><b>${kind === 'course' ? 'Кубок курса' : 'Сундук'}</b><small>${cst === 'ready' ? 'Нажми — открой!' : cst === 'done' ? 'открыт' : kind === 'course' ? 'за весь курс' : 'за всю землю'}</small></span></button>`;
    });
    const owned = new Set((status && status.owned) || []);
    const pen = owned.has('pennant') ? `<path d="M-38-28V-84" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><circle cx="-38" cy="-85" r="2.4" fill="#c9a227" ${st}/><path d="M-37-83c8 2 16 0 26 4-9 3-17 3-26 8z" fill="${RED}" ${st}/>` : '';
    const trail = owned.has('trail') ? `<span class="wm-trail">${Array.from({ length: 6 }, (_, i) => `<i style="--d:${(i * 0.15).toFixed(2)}s;--y:${Math.round((i % 3 - 1) * 14)}px"></i>`).join('')}</span>` : '';
    html += `<div class="wm-ride" role="button" tabindex="0" aria-label="Мой транспорт: ${esc(ride.name)}"><div class="bob"><svg viewBox="-75 -92 150 100">${RDEF}${pen}${ride.svg}</svg></div>${trail}</div>`;
    el.innerHTML = `<div class="wm" style="aspect-ratio:${W}/${H}">${html}</div>`;
    const wm = el.firstChild, rideEl = wm.querySelector('.wm-ride');
    let u = 1; const fit = () => { u = wm.clientWidth / W; wm.style.setProperty('--u', u + 'px'); place(cur); };

    // слои движения работают, только пока земля на экране
    if (io) io.disconnect();
    if (window.IntersectionObserver) {
      io = new IntersectionObserver((es) => es.forEach((e) => wm.querySelector(`.wm-r[data-r="${e.target.dataset.i}"]`)?.classList.toggle('live', e.isIntersecting)), { rootMargin: '120px 0px' });
      wm.querySelectorAll('.wm-img').forEach((img, i) => { img.dataset.i = i; io.observe(img); });
    } else wm.querySelectorAll('.wm-r').forEach((r) => r.classList.add('live'));

    wm.querySelectorAll('.wm-st').forEach((b) => (b.onclick = () => onOpen(+b.dataset.id)));
    wm.querySelectorAll('.wm-chest').forEach((b) => (b.onclick = async () => {
      if (!b.classList.contains('ready')) return;
      const r = await Path.claim(sb, b.dataset.kind, +b.dataset.ref, { cup: b.dataset.kind === 'course' });
      if (r) { b.classList.replace('ready', 'done'); if (b.dataset.kind === 'block') b.querySelector('svg').outerHTML = Path.chestSvg(true); const s = b.querySelector('small'); if (s) s.textContent = 'открыт'; }
    }));

    // транспорт: едет от прошлого места до текущей темы (место — в этом браузере)
    const key = `wmPos:${userId}:${slug}`; let saved = null; try { saved = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    const from = saved && typeof saved.l === 'number' ? Math.min(saved.l, targetLen) : 0;
    let cur = from;
    function place(l, dir) {
      const p = at(road, l), w = u * 150;
      rideEl.style.transform = `translate3d(${f1(p.x * u - w / 2)}px,${f1(p.y * u + 8 * u - w * 0.92)}px,0)`;
      if (dir !== undefined) rideEl.classList.toggle('flip', dir < -0.3);
      return p;
    }
    fit(); if (window.ResizeObserver) new ResizeObserver(fit).observe(wm);
    const save = () => { try { localStorage.setItem(key, JSON.stringify({ l: targetLen, b: curBlock })); } catch (e) {} };
    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
    const say = (h, p, ms = 5200) => { wm.querySelectorAll('.wm-say').forEach((x) => x.remove()); const b = document.createElement('div'); b.className = 'wm-say'; b.style.left = (p.x / W) * 100 + '%'; b.style.top = (p.y / H) * 100 + '%'; b.innerHTML = h; wm.append(b); setTimeout(() => b.remove(), ms); };
    const talk = () => { if (owned.has('horn')) honk(); say(`<b>${esc(ride.name)}</b>${esc(ride.fact)}`, at(road, cur)); };
    rideEl.onclick = talk; rideEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); talk(); } };
    const upgraded = themed && saved && typeof saved.b === 'number' && saved.b < curBlock;
    const go = () => {
      if (reduce || Math.abs(targetLen - from) < 2) { cur = targetLen; place(targetLen, 1); save(); return; }
      const dur = Math.min(4500, 1200 + Math.abs(targetLen - from) * 1.6), t0 = performance.now();
      rideEl.classList.add('go');
      const step = (now) => {
        if (!rideEl.isConnected) return;
        const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        cur = from + (targetLen - from) * e; const p = place(cur, at(road, cur + 2).x - at(road, cur).x);
        if (t < 1) return requestAnimationFrame(step);
        rideEl.classList.remove('go'); save();
        if (upgraded) {
          const b = document.createElement('div'); b.className = 'wm-up'; b.style.top = (p.y / H) * 100 - 3 + '%';
          b.innerHTML = `✨ Транспорт улучшился!<small>${esc(ride.name)}</small>`; wm.append(b); setTimeout(() => b.remove(), 4200);
          if (window.Hero) Hero.ding(true);
        }
      };
      requestAnimationFrame(step);
    };
    place(from, 1);
    // показать место ученика, затем ехать
    requestAnimationFrame(() => {
      const p = at(road, targetLen), r = wm.getBoundingClientRect(), y = r.top + scrollY + (p.y / H) * r.height;
      if (y > scrollY + innerHeight * 0.85 || y < scrollY + 80) scrollTo({ top: y - innerHeight * 0.45, behavior: reduce ? 'auto' : 'smooth' });
      setTimeout(go, 350);
    });
  }

  window.World = { map, RIDES, BIOMES };
})();
