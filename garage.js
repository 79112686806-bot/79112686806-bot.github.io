// Гараж: своя машина за шестерёнки. Кузов, колёса, ось, двигатель, цвет и украшение — у каждой детали свои характеристики
// (мощность, сцепление, обтекаемость, трение, масса) и короткое объяснение из курса «Колесо». Машина участвует в гонках
// по дорогам своего города (city.js → race_start). Всё решает сервер: car_state, car_buy, car_equip, car_rename.
// Garage.open(el, { sb, onChange, onEarn, onRace }) — onChange() после покупки; onEarn {memo, brain} — где заработать;
// onRace() — кнопка «На гонку». Garage.side(parts) — машина сбоку (SVG), Garage.iso(color) — маленькая для города.
// Вид — как в гоночных играх: витрина под лампой, класс машины (D…S), полоски-сегменты; после покупки — анимация улучшения.
// Нужен hero.js (окна, звук).
(function () {
  const H = () => window.Hero;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const gear = (s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke-width="3.4" stroke-dasharray="2.6 2.9"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="2"/></svg>`;
  const INK = '#2a1a10';
  const st = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
  const SLOTS = [['body', 'Кузов', '🚙'], ['wheels', 'Колёса', '🛞'], ['axle', 'Ось', '⚙️'], ['engine', 'Двигатель', '🔥'], ['paint', 'Цвет', '🎨'], ['extra', 'Украшение', '⭐']];
  const STATS = [['pw', 'Мощность', 'двигатель: чем больше, тем быстрее разгон и скорость на прямой'], ['gr', 'Сцепление', 'колёса: в поворотах машина не скользит'],
    ['ar', 'Обтекаемость', 'форма кузова: меньше сопротивление воздуха'], ['fr', 'Трение', 'ось и колёса: чем меньше, тем легче катится'], ['ms', 'Масса', 'тяжёлую машину труднее разогнать']];
  const LOW = { fr: 1, ms: 1 };   // здесь меньше — лучше
  const NAMES = { adj: ['Быстрая', 'Рыжая', 'Смелая', 'Хитрая', 'Громкая', 'Ловкая', 'Звёздная', 'Огненная', 'Ледяная', 'Весёлая', 'Синяя', 'Гордая'],
    noun: ['Молния', 'Комета', 'Ракета', 'Стрела', 'Пчела', 'Черепаха', 'Ласточка', 'Искра', 'Буря', 'Капля', 'Шестерёнка', 'Пружина'] };

  // ---------- Машина сбоку: 200 × 110, перед — справа, земля — y = 96 ----------
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join(''); };
  // кузов: [контур, блик, стёкла]
  const BODY = {
    cart: ['M26 66h148v10H26z M68 66V46h62v20z', 'M30 69h140', 'M74 50h22v12H74zM102 50h22v12h-22z'],
    box: ['M24 78V44q0-8 8-8h104l30 22q8 6 8 14v6z', 'M34 40h100l24 18', 'M138 42l24 18h-24zM40 46h40v14H40zM88 46h40v14H88z'],
    wedge: ['M24 78V50l40-8 112 26v10z', 'M30 51l34-6 100 23', 'M72 46l34 8-34 4z'],
    drop: ['M24 78q-2-38 52-42 70-4 102 34v8z', 'M32 64q4-24 44-26 50-2 84 24', 'M70 44q30-4 52 6l-6 10H72z'],
    racer: ['M14 80v-8l40-6 26-12h34l10 10 62 8v8z', 'M20 73l34-5 26-11h32', 'M86 56h22l6 9H82z'],
  };
  const spokes = (x, y, r, n, w = 1.6, col = '#5b6168') => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return `<path d="M${x} ${y}l${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`; }).join('');
  const WHEEL = {
    wood: (x, r, u) => { const y = 96 - r; return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gWd${u})" ${st}/><circle cx="${x}" cy="${y}" r="${r - 3.5}" fill="none" stroke="#7a4a20" stroke-width="2"/>${spokes(x, y, r - 4, 6, 2.6, '#6b3f1c')}`; },
    spoke: (x, r, u) => { const y = 96 - r; return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#1d1d21" stroke-width="3.4"/><circle cx="${x}" cy="${y}" r="${r - 2.4}" fill="none" stroke="url(#gRim${u})" stroke-width="2"/>${spokes(x, y, r - 3, 16, 0.9, '#8d959c')}`; },
    rubber: (x, r, u) => { const y = 96 - r; return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gT${u})" ${st}/><circle cx="${x}" cy="${y}" r="${r - 5.5}" fill="url(#gRim${u})" stroke="#3a3f45" stroke-width="1"/>${spokes(x, y, r - 7, 5, 2.4, '#6c737a')}`; },
    wide: (x, r, u) => { const y = 96 - r; return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gT${u})" ${st}/>${Array.from({ length: 14 }, (_, i) => { const a = (i * Math.PI) / 7; return `<path d="M${(x + (r - 0.8) * Math.cos(a)).toFixed(1)} ${(y + (r - 0.8) * Math.sin(a)).toFixed(1)}l${(-3.2 * Math.cos(a)).toFixed(1)} ${(-3.2 * Math.sin(a)).toFixed(1)}" stroke="#55555c" stroke-width="2.2"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="${r - 7}" fill="url(#gGold${u})" stroke="#6b5212" stroke-width="1"/>${spokes(x, y, r - 8, 6, 1.8, '#8a6d1f')}`; },
    slick: (x, r, u) => { const y = 96 - r; return `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gT${u})" ${st}/><circle cx="${x}" cy="${y}" r="${r - 4.5}" fill="none" stroke="#e23b2b" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="${r - 6.5}" fill="url(#gRim${u})" stroke="#3a3f45" stroke-width="1"/>${spokes(x, y, r - 7.5, 10, 1.3, '#59606a')}`; },
  };
  const HUB = { axle: (x, r) => `<circle cx="${x}" cy="${96 - r}" r="3.4" fill="#8a5a2b" ${st}/>`, bearing: (x, r) => `<circle cx="${x}" cy="${96 - r}" r="4.6" fill="#e4e8ec" ${st}/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="${(x + 2.7 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(96 - r + 2.7 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r=".9" fill="${INK}"/>`).join('')}` };
  const ENGINE = {
    slope: () => '',
    rubber_m: () => `<path d="M30 62C60 54 140 54 170 62" fill="none" stroke="#a0522d" stroke-width="3" stroke-dasharray="7 3"/><circle cx="30" cy="62" r="3" fill="${INK}"/><circle cx="170" cy="62" r="3" fill="${INK}"/>`,
    balloon: () => `<path d="M30 56l-6-4" stroke="${INK}" stroke-width="3"/><g class="gr-wob"><ellipse cx="24" cy="34" rx="15" ry="18" fill="#e0662b" ${st}/><path d="M18 26q4-6 10-6" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/></g>`,
    spring: () => `<path d="M14 58${Array.from({ length: 6 }, () => 'l4 -8l4 8').join('')}" fill="none" stroke="#6e6e72" stroke-width="3"/><path d="M14 58h-4" stroke="${INK}" stroke-width="3"/>`,
    steam: () => `<path d="M20 40h30v24H20z" fill="#6e5a4e" ${st}/><path d="M28 40V24h8v16" fill="#4a3c33" ${st}/><g class="gr-smoke"><circle cx="32" cy="16" r="5" fill="#b8ab95"/><circle cx="36" cy="6" r="6" fill="#cfc4b0"/></g><circle cx="35" cy="52" r="5" fill="#e0661b" ${st}/>`,
    electric: () => `<path d="M22 44h34v18H22z" fill="#3f6a32" ${st}/><path d="M56 49h4v8h-4" fill="${INK}"/><path d="M40 46l-6 8h6l-4 7 9-10h-6l4-5z" fill="#ffd36b" stroke="${INK}" stroke-width="1"/>`,
  };
  const EXTRA = {
    none: () => '',
    flag: () => `<path d="M34 66V20" stroke="${INK}" stroke-width="2.5"/><path class="gr-flag" d="M34 20h26l-6 7 6 7H34z" fill="#c0392b" ${st}/>`,
    lights: () => `<circle cx="174" cy="66" r="5" fill="#ffd36b" ${st}/><path d="M182 62l14-4M182 66h16M182 70l14 4" stroke="#e3b341" stroke-width="2" class="gr-blink"/>`,
    spoiler: () => `<path d="M30 60V44M44 60V44" stroke="${INK}" stroke-width="3"/><path d="M18 38h36l-4 8H22z" fill="#2a2a2e" ${st}/>`,
    number: () => `<circle cx="104" cy="70" r="9" fill="#fff8ea" ${st}/><text x="104" y="74.5" font-family="Georgia,serif" font-weight="700" font-size="12" text-anchor="middle" fill="${INK}">7</text>`,
  };
  const COLORS = { red: '#c0392b', blue: '#2f6fb0', green: '#4f8a3a', yellow: '#e3b341', black: '#3a3a40', white: '#f1ece2', purple: '#7b4aa0', orange: '#e0661b' };
  let uidN = 0;
  function defs(c, u) {
    return `<defs><linearGradient id="gB${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c, 1.45)}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 0.55)}"/></linearGradient>`
      + `<linearGradient id="gG${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4fbff"/><stop offset=".55" stop-color="#9cc3d4"/><stop offset="1" stop-color="#4f7d92"/></linearGradient>`
      + `<radialGradient id="gT${u}"><stop offset=".55" stop-color="#3b3b42"/><stop offset="1" stop-color="#121215"/></radialGradient>`
      + `<radialGradient id="gRim${u}" cx=".35" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#c2c9cf"/><stop offset="1" stop-color="#7d868e"/></radialGradient>`
      + `<radialGradient id="gGold${u}" cx=".35" cy=".35"><stop offset="0" stop-color="#fff2c0"/><stop offset=".6" stop-color="#e3b341"/><stop offset="1" stop-color="#8a6d1f"/></radialGradient>`
      + `<radialGradient id="gWd${u}" cx=".4" cy=".4"><stop offset="0" stop-color="#e2b07a"/><stop offset="1" stop-color="#a26a35"/></radialGradient>`
      + `<radialGradient id="gSh${u}"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
  }
  // сама машина без рамки svg — чтобы нарисовать её ещё раз отражением на полу
  function carG(p, u) {
    const c = COLORS[(p.paint || 'paint_red').replace('paint_', '')] || COLORS.red;
    const [body, hi, glass] = BODY[p.body] || BODY.cart, w = WHEEL[p.wheels] || WHEEL.wood, hub = HUB[p.axle] || HUB.axle;
    const r = p.wheels === 'wide' ? 18 : p.wheels === 'slick' ? 16 : 17, e = ENGINE[p.engine] || ENGINE.slope, x = EXTRA[p.extra] || EXTRA.none;
    return `${e()}<path d="${body}" fill="url(#gB${u})" ${st}/><path d="${glass}" fill="url(#gG${u})" ${st}/><path d="${hi}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>${x()}`
      + `<g class="gr-w">${w(52, r, u)}${hub(52, r)}</g><g class="gr-w">${w(150, r, u)}${hub(150, r)}</g>`;
  }
  function side(p = {}, cls = '', mirror = false) {
    const u = ++uidN, c = COLORS[(p.paint || 'paint_red').replace('paint_', '')] || COLORS.red, g = carG(p, u);
    return `<svg class="gr-car ${cls}" viewBox="0 ${mirror ? '0 200 140' : '0 200 110'}" aria-hidden="true">${defs(c, u)}<ellipse cx="100" cy="96" rx="90" ry="7" fill="url(#gSh${u})"/>${g}`
      + (mirror ? `<g transform="matrix(1 0 0 -1 0 193)" opacity=".16" class="gr-refl">${g}</g>` : '') + '</svg>';
  }
  // маленькая машинка для изометрического города: смотрит вправо-вниз (dir 1) или влево-вниз (dir -1)
  function iso(color = '#c0392b', dir = 1) {
    const d = shade(color, 0.72);
    return `<g transform="scale(${dir} 1)"><ellipse cx="0" cy="3" rx="13" ry="5" fill="#000" opacity=".18"/><path d="M-11-2l11 5.5 11-5.5-11-5.5z" fill="${shade(color, 1.15)}" stroke="${INK}" stroke-width="1"/><path d="M-11-2v-5l11 5.5v5z" fill="${d}" stroke="${INK}" stroke-width="1"/><path d="M11-2v-5L0-1.5v5z" fill="${color}" stroke="${INK}" stroke-width="1"/><path d="M-11-7l11 5.5 11-5.5-11-5.5z" fill="${shade(color, 1.15)}" stroke="${INK}" stroke-width="1"/><path d="M-3-6.5l6 3 5-2.5-6-3z" fill="#cfe3ea" stroke="${INK}" stroke-width=".8"/><circle cx="-6" cy="2" r="2.4" fill="${INK}"/><circle cx="6" cy="2.2" r="2.4" fill="${INK}"/></g>`;
  }
  const colorOf = (p) => COLORS[((p && p.paint) || 'paint_red').replace('paint_', '')] || COLORS.red;

  // характеристики машины: сумма по деталям, каждая — от 0 до 10
  function stats(parts, cat) {
    const s = { pw: 0, gr: 0, ar: 0, fr: 0, ms: 0 };
    for (const code of Object.values(parts || {})) { const it = cat.find((i) => i.code === code); if (it && it.stats) for (const k in s) s[k] += it.stats[k] || 0; }
    for (const k in s) s[k] = Math.max(0, Math.min(10, s[k]));
    return s;
  }
  // сила машины 0…100 и класс, как в гоночных играх
  function power(s) { return Math.round(((s.pw * 1.4 + s.gr + s.ar + (10 - s.fr) * 0.8 + (10 - s.ms) * 0.6) / 48) * 100); }
  const CLASSES = [[0, 'D', '#8a7a68'], [30, 'C', '#4f8a3a'], [45, 'B', '#2f6fb0'], [60, 'A', '#7b4aa0'], [75, 'S', '#e0661b']];
  const klass = (pt) => CLASSES.filter((c) => pt >= c[0]).pop();
  const nextK = (pt) => CLASSES.find((c) => c[0] > pt);
  const better = (k, d) => (LOW[k] ? d < 0 : d > 0);
  // полоска из 10 делений: старое значение → новое (новые деления вспыхивают, потерянные гаснут)
  function segs(k, v, v0 = v, anim = false) {
    let h = '';
    for (let i = 0; i < 10; i++) {
      const on = i < v, was = i < v0;
      const c = on && !was ? ' new' : !on && was ? ' lost' : on ? ' on' : '';
      h += `<i class="${c.trim()}"${anim && c !== ' on' && c ? ` style="animation-delay:${0.35 + Math.abs(i - Math.min(v, v0)) * 0.09}s"` : ''}></i>`;
    }
    return `<span class="gr-seg${LOW[k] ? ' low' : ''}">${h}</span>`;
  }
  const deltas = (a, b) => STATS.map(([k, t]) => { const d = b[k] - a[k]; return d ? `<span class="${better(k, d) ? 'up' : 'dn'}">${t} ${d > 0 ? '+' : '−'}${Math.abs(d)}</span>` : ''; }).filter(Boolean).join(' · ');

  const CSS = `
.gr{font-family:"PT Serif",Georgia,serif;color:var(--ink,#3a2313)}
.gr-show{position:relative;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:4px 18px;align-items:center;padding:16px 18px 18px;border-radius:14px;overflow:hidden;color:#f6ead2;
  background:radial-gradient(ellipse 60% 70% at 32% 18%,rgba(255,214,140,.38),transparent 70%),linear-gradient(180deg,#3b2618 0,#24170e 62%,#1a100a 62.2%,#2a1c12 100%);box-shadow:inset 0 0 0 1.5px rgba(255,220,160,.12),0 6px 18px rgba(36,22,12,.35)}
.gr-show:before{content:"";position:absolute;left:0;right:0;top:62%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,220,160,.35),transparent)}
.gr-stage{position:relative;z-index:1}.gr-stage .gr-car{width:100%;height:auto;display:block;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
.gr-spot{position:absolute;left:8%;right:8%;top:-30%;height:80%;background:radial-gradient(ellipse at 50% 0,rgba(255,236,190,.28),transparent 70%);pointer-events:none}
.gr-panel{position:relative;z-index:1;min-width:0}
.gr-name{display:flex;align-items:center;gap:10px;margin:0 0 10px}
.gr-cls{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:10px;background:var(--k);color:#fff;font:700 28px/1 Georgia,serif;box-shadow:inset 0 -4px 0 rgba(0,0,0,.25),0 0 0 2px rgba(255,255,255,.18)}
.gr-cls.pop{animation:grCls 1s cubic-bezier(.2,.9,.3,1.4)}@keyframes grCls{0%{transform:scale(.4) rotate(-30deg)}60%{transform:scale(1.35)}100%{transform:none}}
.gr-nm{min-width:0}.gr-nm b{display:block;font:700 24px/1.05 "Cormorant Garamond",Georgia,serif;color:#fff3dc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gr-nm small{display:block;font-size:12.5px;color:#d8c39a}
.gr-nm button{margin-left:4px;padding:0 6px;border:0;background:none;color:#ffd98a;font:12.5px "PT Serif",Georgia,serif;text-decoration:underline;cursor:pointer}
.gr-pt{height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin:2px 0 10px}.gr-pt i{display:block;height:100%;background:linear-gradient(90deg,#e3b341,#ff7a2b);border-radius:3px;transition:width .9s cubic-bezier(.2,.8,.2,1)}
.gr-stats{display:grid;gap:5px}
.gr-stat{display:grid;grid-template-columns:106px 1fr 34px;align-items:center;gap:8px;font-size:13px;color:#ecdcbc;cursor:help}
.gr-seg{display:grid;grid-template-columns:repeat(10,1fr);gap:2px}.gr-seg i{height:10px;border-radius:2px;background:rgba(255,255,255,.1)}
.gr-seg i.on{background:linear-gradient(#ffd36b,#e0661b)}.gr-seg.low i.on{background:linear-gradient(#a8e08a,#3f8a3a)}
.gr-seg i.new{background:#7dff8c;animation:grNew .9s both}.gr-seg.low i.new{background:#7dff8c}
@keyframes grNew{0%{transform:scaleY(.2);background:#fff;box-shadow:0 0 0 rgba(125,255,140,0)}40%{transform:scaleY(1.6);box-shadow:0 0 10px #7dff8c}100%{transform:none;box-shadow:0 0 4px rgba(125,255,140,.6)}}
.gr-seg i.lost{animation:grLost .8s both}@keyframes grLost{0%{background:#ff6b4a}100%{background:rgba(255,255,255,.1)}}
.gr-stat em{font-style:normal;font-weight:700;text-align:right;color:#fff3dc}
.gr-stat em .d{display:block;font-size:11px;line-height:1}.gr-stat em .up{color:#8dff9a}.gr-stat em .dn{color:#ff8a6b}
.gr-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.gr-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:16px;background:rgba(255,211,107,.15);border:1.5px solid rgba(255,211,107,.5);font-weight:700;font-size:14px;color:#ffd98a}
.gr-race{margin-left:auto;padding:10px 20px;border-radius:22px;border:0;background:linear-gradient(#7cc35a,#3f8a3a);color:#fff;font:700 16px "PT Serif",Georgia,serif;cursor:pointer;box-shadow:0 4px 0 #285a24,0 0 18px rgba(124,195,90,.35);text-shadow:0 1px 0 rgba(0,0,0,.3)}
.gr-race:active{transform:translateY(3px);box-shadow:0 1px 0 #285a24}
.gr-banner{position:absolute;left:50%;top:10px;z-index:3;transform:translateX(-50%);display:grid;justify-items:center;gap:2px;padding:8px 18px;border-radius:12px;background:linear-gradient(#3f8a3a,#2b6a28);color:#fff;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,.4);animation:grBan 3.2s both;pointer-events:none;white-space:nowrap}
.gr-banner b{font:700 20px/1.1 "PT Serif",Georgia,serif;letter-spacing:.04em}.gr-banner span{font-size:13px}.gr-banner small{font-size:12.5px;color:#d9ffd0}
@keyframes grBan{0%{opacity:0;transform:translate(-50%,-20px) scale(.7)}12%{opacity:1;transform:translate(-50%,0) scale(1.08)}20%{transform:translate(-50%,0) scale(1)}82%{opacity:1}100%{opacity:0;transform:translate(-50%,-10px)}}
.gr-stage.upg .gr-car{animation:grBounce .8s cubic-bezier(.2,.9,.3,1.4)}@keyframes grBounce{0%{transform:translateY(0)}30%{transform:translateY(-10px) scale(1.04)}60%{transform:translateY(2px) scale(.99)}100%{transform:none}}
.gr-flash{position:absolute;inset:-10%;background:radial-gradient(circle,rgba(255,255,230,.9),rgba(255,230,150,0) 60%);animation:grFlash .7s both;pointer-events:none}@keyframes grFlash{0%{opacity:0}25%{opacity:1}100%{opacity:0}}
.gr-sp{position:absolute;left:50%;top:55%;width:7px;height:7px;border-radius:50%;background:#ffd36b;box-shadow:0 0 6px #ffd36b;animation:grSp .9s ease-out both;pointer-events:none}
@keyframes grSp{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--x),var(--y)) scale(.2);opacity:0}}
.gr-tip{display:grid;grid-template-columns:auto 1fr auto;gap:10px 14px;align-items:center;margin:0 0 12px;padding:12px 16px;border:1.5px solid #c9a227;border-radius:10px;background:#fff3cf}
.gr-tip ol{margin:0;padding-left:20px;font-size:14.5px;line-height:1.45}.gr-tip b.h{font-size:26px}
.gr-tip button{padding:7px 16px;border-radius:16px;border:1.5px solid var(--sanguine,#9a3a1b);background:var(--sanguine,#9a3a1b);color:#fff6e6;font:700 14px "PT Serif",Georgia,serif;cursor:pointer}
.gr-tabs{display:flex;gap:6px;overflow-x:auto;margin:14px 0 4px;padding-bottom:4px;scrollbar-width:thin}
.gr-tabs button{flex:none;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;border:1.5px solid var(--line,rgba(74,44,20,.3));background:#fffaf0;font:700 14px "PT Serif",Georgia,serif;color:var(--ink-soft,#6e4b2c);cursor:pointer}
.gr-tabs button.on{background:#2a1c12;border-color:#2a1c12;color:#ffd98a}
.gr-hint{margin:2px 0 6px;font-size:14px;color:var(--ink-soft,#6e4b2c)}
.gr-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;padding:6px 0}
.gr-card{position:relative;display:grid;gap:4px;padding:0 0 10px;border:1.5px solid var(--line,rgba(74,44,20,.26));border-bottom-width:4px;border-radius:10px;background:rgba(255,252,242,.92);text-align:left;font:inherit;color:inherit;cursor:pointer;overflow:hidden;transition:transform .12s,box-shadow .12s}
.gr-card:hover{transform:translateY(-3px);box-shadow:0 6px 14px rgba(58,35,19,.18)}
.gr-card .pic{display:block;padding:4px 8px 0;background:linear-gradient(180deg,#3b2618,#24170e 70%,#2a1c12)}.gr-card .gr-car{width:100%;height:auto;display:block}
.gr-card b,.gr-card small,.gr-card .gr-d,.gr-card .pr{margin:0 10px}
.gr-card b{font:700 17px/1.15 "Cormorant Garamond",Georgia,serif}
.gr-card small{font-size:12.5px;color:var(--ink-soft,#6e4b2c);line-height:1.35}
.gr-card .gr-d{font-size:12.5px;font-weight:700}.gr-d .up{color:#2f7a3a}.gr-d .dn{color:#a65435}
.gr-card .pr{display:flex;align-items:center;gap:4px;margin-top:2px;padding:5px 10px;border-radius:14px;justify-self:start;font-weight:700;color:#fff;background:#8a6d1f;font-size:14px}
.gr-card.on{border-color:#3f6a32;background:rgba(233,244,226,.95)}.gr-card.on .pr{background:#3f6a32}
.gr-card.own .pr{background:#2f6fb0}
.gr-card.lock{cursor:default;background:rgba(74,44,20,.05)}.gr-card.lock .pic{filter:grayscale(1) brightness(.7)}.gr-card.lock .pr{background:#8a7a68}
.gr-card.poor .pr{background:#a65435}
.gr-card .badge{position:absolute;right:8px;top:8px;padding:1px 8px;border-radius:10px;background:#7dff8c;color:#1d4a1d;font-size:12px;font-weight:700}
.gr-sw{display:block;height:58px;margin:8px 10px 0;border-radius:8px;border:2px solid ${INK}}
.gr-names{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}.gr-names select{font:16px "PT Serif",Georgia,serif;padding:8px;border-radius:6px;border:1.5px solid rgba(74,44,20,.3);background:#fffaf0}
.gr-cmp{display:grid;gap:5px;margin:10px auto;max-width:360px;padding:10px 12px;border-radius:10px;background:#24170e;color:#ecdcbc;text-align:left}
.gr-cmp .gr-stat{grid-template-columns:96px 1fr 30px}
.gr-w{transform-box:fill-box;transform-origin:50% 50%}.gr-stage .gr-w{animation:grSpin 2.4s linear infinite}@keyframes grSpin{to{transform:rotate(360deg)}}
.gr-wob{animation:grWob 1.6s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:80% 100%}@keyframes grWob{to{transform:rotate(-6deg) scale(1.04)}}
.gr-smoke circle{animation:grSmoke 2.4s ease-out infinite;opacity:0}.gr-smoke circle:nth-child(2){animation-delay:1.2s}@keyframes grSmoke{0%{opacity:.8;transform:translateY(6px)}100%{opacity:0;transform:translateY(-10px) scale(1.4)}}
.gr-flag{animation:grFlag .8s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:0 50%}@keyframes grFlag{to{transform:skewY(4deg) scaleX(.92)}}
.gr-blink{animation:grBlink 1.2s steps(2) infinite}@keyframes grBlink{50%{opacity:.2}}
.gr-card .gr-car *,.gr-refl *{animation:none!important}
.city-sheet{text-align:center}.city-sheet h3{margin:4px 0;font:700 26px/1.1 "Cormorant Garamond",Georgia,serif}.city-sheet .gr-car{width:min(240px,100%);height:auto}
@media(max-width:640px){.gr-show{grid-template-columns:1fr;padding:12px}.gr-stage .gr-car{max-width:340px;margin:0 auto}.gr-stat{grid-template-columns:92px 1fr 30px}.gr-cards{grid-template-columns:1fr 1fr;gap:8px}.gr-card b{font-size:15.5px}.gr-card small{font-size:12px}.gr-tip{grid-template-columns:1fr}.gr-tip b.h{display:none}.gr-race{margin-left:0;flex:1}}
@media(prefers-reduced-motion:reduce){.gr-w,.gr-wob,.gr-smoke circle,.gr-flag,.gr-blink,.gr-seg i,.gr-banner,.gr-stage.upg .gr-car,.gr-cls.pop{animation:none!important}}
`;
  function style() { if (H()) H().style(); if (document.getElementById('garage-css')) return; const s = document.createElement('style'); s.id = 'garage-css'; s.textContent = CSS; document.head.append(s); }
  const statRows = (s, s0, anim) => STATS.map(([k, t, hint]) => { const d = s[k] - s0[k]; return `<div class="gr-stat" title="${esc(t + ' — ' + hint)}"><span>${t}</span>${segs(k, s[k], s0[k], anim)}<em>${s[k]}${d ? `<span class="d ${better(k, d) ? 'up' : 'dn'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>` : ''}</em></div>`; }).join('');
  const seen = (k) => { try { return !!localStorage.getItem(k); } catch (e) { return true; } };
  const mark = (k) => { try { localStorage.setItem(k, '1'); } catch (e) {} };

  async function open(el, { sb, onChange, onEarn, onRace } = {}) {
    style();
    const host = el; el = document.createElement('div'); host.replaceChildren(el); // свежий узел — обработчики не копятся при повторном открытии
    let S = null, slot = 'body', busy = false;
    const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message || 'Ошибка'); return data; };
    el.innerHTML = '<p class="note" style="text-align:center;padding:40px 0">Открываем гараж…</p>';
    try { S = await rpc('car_state'); } catch (e) { el.innerHTML = `<p class="note">Гараж пока не открылся: ${esc(e.message)}</p>`; return; }
    const item = (c) => S.parts.find((i) => i.code === c);
    const toast = (h) => { const o = H().overlay(`<div class="city-sheet" style="text-align:center">${h}<div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main">Хорошо</button></div></div>`); o.box.querySelector('.hero-b').onclick = o.close; };
    function draw(up) {
      const p = S.car.parts, s = stats(p, S.parts), s0 = up ? up.s0 : s, pt = power(s), K = klass(pt), nx = nextK(pt), K0 = up ? klass(power(s0)) : K;
      const tip = seen('grTip') ? '' : `<div class="gr-tip"><b class="h">🏎️</b><ol><li>Выбери, что улучшить: <b>кузов, колёса, двигатель…</b></li><li>Нажми на карточку — купи деталь за ⚙. Зелёные цифры — что станет лучше.</li><li>Жми <b>«🏁 На гонку»</b> — машина поедет по дорогам твоего города.</li></ol><button type="button" data-a="tip">Понятно</button></div>`;
      el.innerHTML = `<div class="gr">${tip}<div class="gr-show"><div class="gr-stage${up ? ' upg' : ''}"><div class="gr-spot"></div>${side(p, '', true)}${up ? '<div class="gr-flash"></div>' + Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return `<span class="gr-sp" style="--x:${Math.round(Math.cos(a) * 110)}px;--y:${Math.round(Math.sin(a) * 70)}px;animation-delay:${0.1 + (i % 3) * 0.06}s"></span>`; }).join('') : ''}</div>
        ${up ? `<div class="gr-banner"><b>⚡ УЛУЧШЕНО!</b><span>${esc(up.title)}</span>${up.d ? `<small>${up.d.replace(/<[^>]+>/g, '')}</small>` : ''}${K0[1] !== K[1] ? `<small>Класс ${K0[1]} → ${K[1]}</small>` : ''}</div>` : ''}
        <div class="gr-panel"><div class="gr-name"><span class="gr-cls${up && K0[1] !== K[1] ? ' pop' : ''}" style="--k:${K[2]}" title="Класс машины">${K[1]}</span><span class="gr-nm"><b>«${esc(S.car.name)}»</b><small>Сила ${pt} из 100${nx ? ` · до класса ${nx[1]} — ${nx[0] - pt}` : ' · высший класс!'}<button type="button" data-a="name">✎ имя</button></small></span></div>
        <div class="gr-pt"><i style="width:${up ? power(s0) : pt}%"></i></div>
        <div class="gr-stats">${statRows(s, s0, !!up)}</div>
        <div class="gr-row"><span class="gr-chip">${gear(16)} ${S.gears}</span>${S.car.races ? `<span class="gr-chip" title="Гонок / побед">🏁 ${S.car.races} · 🏆 ${S.car.wins}</span>` : ''}${onRace ? '<button type="button" class="gr-race" data-a="race">🏁 На гонку</button>' : ''}</div></div></div>
      <div class="gr-tabs" role="tablist">${SLOTS.map(([k, t, i]) => `<button type="button" role="tab" data-slot="${k}" class="${k === slot ? 'on' : ''}" aria-selected="${k === slot}"><span aria-hidden="true">${i}</span>${t}</button>`).join('')}</div>
      <p class="gr-hint">${HINT[slot]}</p>
      <div class="gr-cards">${cards()}</div></div>`;
      if (up) requestAnimationFrame(() => { const b = el.querySelector('.gr-pt i'); if (b) b.style.width = pt + '%'; });
    }
    const HINT = { body: 'Кузов — форма машины. Обтекаемый кузов меньше «упирается» в воздух.', wheels: 'Колёса держат дорогу: мягкие и широкие лучше в поворотах, твёрдые легче катятся.', axle: 'Ось с подшипниками крутится легче — меньше трения.', engine: 'Двигатель — сила, которая толкает машину вперёд.', paint: 'Цвет на скорость не влияет — просто красиво.', extra: 'Украшения — для красоты и характера.' };
    function cards() {
      const p = S.car.parts, base = stats(p, S.parts);
      return S.parts.filter((i) => i.slot === slot).map((i) => {
        const on = p[slot] === i.code, lock = !i.unlocked, poor = !i.owned && i.price > S.gears;
        const after = stats({ ...p, [slot]: i.code }, S.parts), diff = deltas(base, after), gain = power(after) - power(base);
        const pic = slot === 'paint' ? `<span class="gr-sw" style="background:linear-gradient(${shade(COLORS[i.code.replace('paint_', '')] || '#ccc', 1.4)},${COLORS[i.code.replace('paint_', '')] || '#ccc'})"></span>` : `<span class="pic">${side({ ...p, [slot]: i.code })}</span>`;
        return `<button type="button" class="gr-card${on ? ' on' : ''}${lock ? ' lock' : ''}${i.owned && !on ? ' own' : ''}${poor && !lock ? ' poor' : ''}" data-code="${esc(i.code)}">${pic}${gain > 0 && !on && !lock ? `<span class="badge">+${gain} сила</span>` : ''}<b>${esc(i.title)}</b>`
          + (diff && !on ? `<span class="gr-d">${diff}</span>` : '') + (i.note ? `<small>${esc(i.note)}</small>` : '')
          + `<span class="pr">${on ? '✓ Стоит на машине' : lock ? `🔒 Эпоха «${esc(i.era_name || '')}»` : i.owned ? 'Поставить' : i.price ? gear(15) + ' ' + i.price : 'Бесплатно'}</span></button>`;
      }).join('');
    }
    async function act(fn, args, title) {
      if (busy) return; busy = true;
      const s0 = stats(S.car.parts, S.parts);
      try {
        S = await rpc(fn, args); const s1 = stats(S.car.parts, S.parts);
        draw(fn === 'car_rename' ? null : { s0, title: title || '', d: deltas(s0, s1) });
        H().ding(true); onChange && onChange();
      } catch (e) { toast(`<h3>Не получилось</h3><p>${esc(e.message)}</p>`); }
      busy = false;
    }
    function nameForm() {
      const [a0, n0] = S.car.name.split(' ');
      const o = H().overlay(`<div class="city-sheet"><h3>Имя машины</h3><p>Его увидят соперники на гонке.</p><div class="gr-names"><select id="grA">${NAMES.adj.map((a, i) => `<option value="${i}"${a === a0 ? ' selected' : ''}>${a}</option>`).join('')}</select><select id="grN">${NAMES.noun.map((n, i) => `<option value="${i}"${n === n0 ? ' selected' : ''}>${n}</option>`).join('')}</select></div><div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main" data-a="ok">Сохранить</button><button type="button" class="hero-b" data-a="no">Отмена</button></div></div>`);
      o.box.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'ok') act('car_rename', { p_adj: +o.box.querySelector('#grA').value, p_noun: +o.box.querySelector('#grN').value }); o.close(); });
    }
    // окно покупки: как изменится машина — до и после
    const compare = (it) => { const a = stats(S.car.parts, S.parts), b = stats({ ...S.car.parts, [slot]: it.code }, S.parts); return `<div class="gr-cmp">${statRows(b, a, false)}</div>`; };
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-slot]'); if (t) { slot = t.dataset.slot; draw(); return; }
      const a = e.target.closest('[data-a]');
      if (a && a.dataset.a === 'tip') { mark('grTip'); a.closest('.gr-tip').remove(); return; }
      if (a && a.dataset.a === 'name') return nameForm();
      if (a && a.dataset.a === 'race') return onRace && onRace();
      const c = e.target.closest('.gr-card'); if (!c) return;
      const it = item(c.dataset.code); if (!it || S.car.parts[slot] === it.code) return;
      if (!it.unlocked) return toast(`<h3>${esc(it.title)}</h3><p>Эта деталь откроется в эпоху «${esc(it.era_name || '')}». Эпохи растут, когда ты проходишь блоки курса.</p>`);
      if (it.owned || !it.price) return act('car_equip', { p_code: it.code }, it.title);
      if (it.price > S.gears) {
        const o = H().overlay(`<div class="city-sheet" style="text-align:center">${side({ ...S.car.parts, [slot]: it.code })}<h3>${esc(it.title)}</h3>${compare(it)}<p>Нужно ${it.price} ⚙, а у тебя ${S.gears}. Заработай шестерёнки: победа в Мемо — до 14 ⚙, задачка — 2 ⚙, гонка — до 6 ⚙.</p><div class="hero-btns" style="justify-content:center">${onEarn ? '<button type="button" class="hero-b main" data-e="memo">🃏 Мемо</button><button type="button" class="hero-b" data-e="brain">🧠 Задачки</button>' : ''}<button type="button" class="hero-b" data-e="">Позже</button></div></div>`);
        o.box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-e]'); if (!b) return; o.close(); if (b.dataset.e && onEarn) onEarn[b.dataset.e](); });
        return;
      }
      const o = H().overlay(`<div class="city-sheet" style="text-align:center">${side({ ...S.car.parts, [slot]: it.code })}<h3>${esc(it.title)}</h3><p>${esc(it.note || '')}</p>${compare(it)}<p>Купить за <b>${it.price} ⚙</b>? У тебя ${S.gears} ⚙.</p><div class="hero-btns" style="justify-content:center"><button type="button" class="hero-b main" data-b="y">Купить и поставить</button><button type="button" class="hero-b" data-b="n">Не сейчас</button></div></div>`);
      o.box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-b]'); if (!b) return; o.close(); if (b.dataset.b === 'y') act('car_buy', { p_code: it.code }, it.title); });
    });
    draw();
  }

  window.Garage = { open, side, iso, colorOf, stats, style, power, NAMES, COLORS };
})();
