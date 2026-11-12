// Лаборатория «Машинка» — в личном кабинете, курс «Колесо» (index.html → openLab). Два режима:
//  • «Наша машинка» — 3D-модель тележки из курса и 11 глав: от подшипника до опытов на наклонной доске и горке;
//  • «Настоящий автомобиль» — упрощённая модель машины и 6 глав: двигатель, передачи, руль, подвеска, тормоза.
// На модели светятся точки-детали: нажал — карточка «что это» и деталь подсвечивается. Под сценой — кнопки опыта,
// плеер главы и короткий текст с раскрывающимися подробностями. Модели строятся кодом (без файлов деталей).
// start(root) — запускает; когда root убирают со страницы, лаборатория сама останавливается и освобождает видеокарту.
// three.js — из /vendor/ через import map (index.html).
import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';

const $ = (s, el = document) => el.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));          // доля этапа [a, b] с плавным началом и концом
const nf = (v, d = 2) => v.toFixed(d).replace('.', ',');
const lerp = (a, b, k) => a + (b - a) * k;
// Координаты модели как в нашем чертеже: x — вперёд, y — влево, z — вверх, ось колёс на z = 0, мм.
const W = (x, y, z) => new THREE.Vector3(x, z, -y);

// ---------- Материалы: пластик, сталь; изнанка разрезанных деталей темнее — так читается разрез ----------
const COL = { plate: '#dd9d4c', block: '#8db0c4', wheel: '#c8643a', cap: '#8e2b1a', steel: '#d4dae0', dark: '#46464b', brass: '#d6b25a', pin: '#3f62b5',
  ladder: '#e3c47e', board: '#c99a60', book: ['#9a3a1b', '#4f6b2e', '#2f5d7c', '#8a6d1f', '#6e4b2c'], tape: '#e8eef2', etape: '#202024', band: '#8a3b2a', ink: '#3a2313' };
const clipMats = [];
const clipPlanes = [];
function M(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, metalness: o.m ?? 0, side: THREE.DoubleSide, clippingPlanes: clipPlanes, transparent: o.t != null, opacity: o.t ?? 1 });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nif(!gl_FrontFacing) diffuseColor.rgb *= .42;'); };
  clipMats.push(m); return m;
}
const MAT = {
  plate: M(COL.plate), block: M(COL.block), wheel: M(COL.wheel), cap: M(COL.cap), steel: M(COL.steel, { m: 0.25, r: 0.3 }), dark: M(COL.dark, { r: 0.45, m: 0.2 }),
  brass: M(COL.brass, { m: 0.45, r: 0.35 }), pin: M(COL.pin), ladder: M(COL.ladder), board: M(COL.board, { r: 0.8 }), hole: M('#2a1c12', { r: 1 }),
  tape: M(COL.tape, { r: 0.18, t: 0.82 }), etape: M(COL.etape, { r: 0.75 }), band: M(COL.band, { r: 0.9 }), ghost: M('#9a3a1b', { t: 0.35 }),
};
const LINE = new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.5, clippingPlanes: clipPlanes });
function mesh(geo, mat, edge = 28) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  if (edge) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, edge), LINE));
  return m;
}
// тело вращения вокруг оси y по профилю [r, y]; углы профиля остаются острыми
function lathe(pts, n = 64) {
  const v = [];
  pts.forEach((p, i) => { v.push(new THREE.Vector2(p[0], p[1])); if (i > 0 && i < pts.length - 1) v.push(new THREE.Vector2(p[0], p[1])); });
  return new THREE.LatheGeometry(v, n);
}
const cylZ = (r, h, n = 32) => new THREE.CylinderGeometry(r, r, h, n).rotateX(Math.PI / 2);   // ось вдоль z
const cylX = (r, h, n = 32) => new THREE.CylinderGeometry(r, r, h, n).rotateZ(Math.PI / 2);   // ось вдоль x
const disc = (r, face) => { const g = new THREE.CircleGeometry(r, 24); if (face === 'y') g.rotateX(-Math.PI / 2); if (face === '-y') g.rotateX(Math.PI / 2); return g; };
const circle = (r) => { const p = new THREE.Path(); p.absarc(0, 0, r, 0, Math.PI * 2, false); return p; };
function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5); return s;
}
const extrude = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28 });

// ---------- Детали ----------
// Подшипник 684ZZ: 4 × 9 × 4 мм. Локально — от y = 0 (внутренняя сторона) до y = 4 (наружная).
function bearing() {
  const g = new THREE.Group();
  g.add(mesh(lathe([[3.7, 0], [4.5, 0], [4.5, 4], [3.7, 4], [3.7, 0]]), MAT.steel));
  const inner = mesh(lathe([[2, 0], [2.7, 0], [2.7, 4], [2, 4], [2, 0]]), MAT.steel); g.add(inner);
  const balls = new THREE.Group();
  for (let i = 0; i < 7; i++) { const b = mesh(new THREE.SphereGeometry(0.62, 16, 12), MAT.steel, 0); const a = (i / 7) * Math.PI * 2; b.position.set(3.2 * Math.cos(a), 2, 3.2 * Math.sin(a)); balls.add(b); }
  g.add(balls);
  const sh = (y) => { const m = mesh(new THREE.RingGeometry(2.75, 3.72, 48).rotateX(-Math.PI / 2), MAT.dark, 0); m.position.y = y; return m; };
  const shIn = sh(0.25), shOut = sh(3.75); g.add(shIn, shOut);
  Object.assign(g.userData, { inner, balls, shIn, shOut, part: 'brg' });
  return g;
}
// Корпус подшипника (сторона +y; левая — зеркально). Гнездо Ø9,2 на глубину 4, за ним упор и проход Ø6,4.
function blockShape(holeR) {
  const s = new THREE.Shape();
  s.moveTo(-12, 15); s.lineTo(12, 15); s.lineTo(12, 11); s.lineTo(7, 11); s.lineTo(7, 0); s.absarc(0, 0, 7, 0, -Math.PI, true); s.lineTo(-7, 11); s.lineTo(-12, 11); s.lineTo(-12, 15);
  s.holes.push(circle(holeR)); return s;
}
function block() {
  const g = new THREE.Group();
  const front = mesh(extrude(blockShape(4.6), 4).rotateX(Math.PI / 2), MAT.block); front.position.y = 39.5;
  const back = mesh(extrude(blockShape(3.2), 3).rotateX(Math.PI / 2), MAT.block); back.position.y = 35.5;
  const ear = mesh(new THREE.BoxGeometry(7, 3, 10), MAT.block); ear.position.set(10.5, 38, 0);
  const lockHole = mesh(disc(1.7, 'y'), MAT.hole, 0); lockHole.position.set(10, 39.56, 0);
  g.add(front, back, ear, lockHole);
  for (const s of [-1, 1]) { const p = mesh(cylZ(2, 3.6, 20), MAT.block); p.position.set(s * 7, 36, 16.8); g.add(p); }
  g.userData.part = 'block';
  return g;
}
// Колесо Ø50: от упора бобышки (y = 0) до наружной грани (y = 17,5). Бобышка Ø5,4 → ступица Ø14 → диск с канавкой.
function wheel() {
  const g = new THREE.Group();
  const body = mesh(lathe([[2.225, 0], [2.7, 0], [2.7, 1.5], [7, 1.5], [7, 9.5], [25, 9.5], [25, 12.5], [23.8, 12.5], [23.8, 15.5], [25, 15.5], [25, 17.5], [2.225, 17.5], [2.225, 0]], 72), MAT.wheel);
  g.add(body);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    for (const [y, f] of [[17.56, 'y'], [9.44, '-y']]) { const h = mesh(disc(1.8, f), MAT.hole, 0); h.position.set(10 * Math.cos(a), y, 10 * Math.sin(a)); g.add(h); }
  }
  // закладная гайка M3 и установочный винт: поперёк ступицы, на её середине (y = 5,5).
  // В ступице — радиальное отверстие Ø3,2 под винт (выходит на поверхность ступицы) и шестигранный паз под гайку (открыт к корпусу).
  const hole = mesh(cylX(1.6, 4.9, 20), MAT.hole, 0); hole.position.set(4.75, 5.5, 0);
  const mouth = mesh(new THREE.RingGeometry(1.6, 2.2, 24).rotateY(Math.PI / 2), MAT.dark, 0); mouth.position.set(7.03, 5.5, 0);
  const mouthIn = mesh(new THREE.CircleGeometry(1.6, 24).rotateY(Math.PI / 2), MAT.hole, 0); mouthIn.position.set(7.02, 5.5, 0);
  const slot = mesh(new THREE.BoxGeometry(2.6, 0.02, 5.6), MAT.hole, 0); slot.position.set(4.1, 1.48, 0);
  const slotWalls = mesh(new THREE.BoxGeometry(2.6, 7.2, 5.6), MAT.hole, 0); slotWalls.position.set(4.1, 5.13, 0);
  g.add(hole, mouth, mouthIn, slot, slotWalls);
  body.userData.part = 'wheel'; hole.userData.part = mouth.userData.part = mouthIn.userData.part = 'hole'; slot.userData.part = slotWalls.userData.part = 'nut';
  const nut = mesh(new THREE.CylinderGeometry(3.1, 3.1, 2.4, 6).rotateZ(Math.PI / 2), MAT.dark); nut.position.set(4.1, 5.5, 0); nut.userData.part = 'nut';
  const screw = new THREE.Group();
  const sh = mesh(cylX(1.5, 6, 16), MAT.dark); sh.position.x = 3;
  const hd = mesh(cylX(2.75, 3, 6), MAT.dark); hd.position.x = 7.5;
  // шлиц под шестигранник в головке
  const key = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 6).rotateZ(Math.PI / 2), MAT.hole, 0); key.position.x = 9.05;
  screw.add(sh, hd, key); screw.position.set(2, 5.5, 0); screw.userData.part = 'screw';
  // «шины»: скотч, изолента, резинка
  const tape = mesh(lathe([[25.02, 9.5], [25.25, 9.5], [25.25, 17.5], [25.02, 17.5]], 72), MAT.tape, 0);
  const etape = mesh(lathe([[25.02, 9.4], [25.45, 9.4], [25.45, 17.6], [25.02, 17.6]], 72), MAT.etape);
  const band = mesh(new THREE.TorusGeometry(24.5, 1.25, 10, 72).rotateX(Math.PI / 2), MAT.band, 0); band.position.y = 14;
  const pin = new THREE.Group();
  const pShaft = mesh(new THREE.CylinderGeometry(1.6, 1.6, 22, 14), MAT.pin); pShaft.position.y = 8;
  const pHead = mesh(new THREE.CylinderGeometry(4, 4, 1.6, 20), MAT.pin); pHead.position.y = 19.8;
  pin.add(pShaft, pHead); pin.userData.part = 'pin';
  tape.userData.part = etape.userData.part = band.userData.part = 'tire';
  tape.visible = etape.visible = band.visible = pin.visible = false;
  g.add(nut, screw, tape, etape, band, pin);
  Object.assign(g.userData, { body, nut, screw, tape, etape, band, pin });
  return g;
}
function setTire(w, kind) { const u = w.userData; u.tape.visible = kind === 'tape'; u.etape.visible = kind === 'etape'; u.band.visible = kind === 'band'; }
const cap = () => { const m = mesh(lathe([[2.1, 0], [5.5, 0], [5.5, 16.5], [4, 18.5], [0.01, 18.5]], 40), MAT.cap); m.userData.part = 'cap'; return m; };
function axleUnit(ax) {
  const g = new THREE.Group(); g.position.x = ax;
  const shaft = mesh(new THREE.CylinderGeometry(2, 2, 150, 28), MAT.steel); shaft.userData.part = 'shaft'; g.add(shaft);
  const sides = {};
  for (const s of [1, -1]) {
    const bl = block(); bl.scale.y = s;
    const br = bearing(); br.position.y = s * 35.5; br.scale.y = s;
    const wh = wheel(); wh.position.y = s * 39.5; wh.scale.y = s;
    const cp = cap(); cp.position.y = s * 57; cp.scale.y = s;
    g.add(bl, br, wh, cp); sides[s] = { bl, br, wh, cp };
  }
  Object.assign(g.userData, { shaft, sides });
  return g;
}
// Плита-шасси: 150 × 80 × 4 мм, низ — на высоте 15 мм над осью колёс. Гнёзда для монет, штырьки носа, ушко.
const WELLS = [[-30, 14], [-30, -14], [10, 0]];
function plate() {
  const g = new THREE.Group();
  const s = rrect(150, 80, 6);
  for (const ax of [-50, 50]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const h = circle(2.15); h.curves.forEach((c) => { c.aX += ax + sx * 7; c.aY += sy * 36; }); s.holes.push(h); }
  const p = mesh(extrude(s, 4), MAT.plate); p.position.z = 15; g.add(p);
  for (const [x, y] of WELLS) {
    const r = new THREE.Shape(); r.absarc(0, 0, 13, 0, Math.PI * 2, false); r.holes.push(circle(11.6));
    const w = mesh(extrude(r, 12), MAT.plate); w.position.set(x, y, 19); g.add(w);
    const f = mesh(new THREE.CircleGeometry(11.6, 40), MAT.plate, 0); f.position.set(x, y, 19.02); g.add(f);
  }
  for (const s2 of [-1, 1]) { const n = mesh(cylZ(2, 8, 18), MAT.plate); n.position.set(67, s2 * 20, 23); g.add(n); }
  const eye = mesh(new THREE.BoxGeometry(9, 10, 4), MAT.plate); eye.position.set(78.5, 0, 17); g.add(eye);
  const eh = mesh(new THREE.CircleGeometry(2.1, 20), MAT.hole, 0); eh.position.set(79, 0, 19.03); g.add(eh);
  // надпись на плите
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 96;
  const cx = cv.getContext('2d'); cx.fillStyle = '#5a3414'; cx.font = 'bold 74px "PT Serif", Georgia, serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('ИНЖЕНЕРНЫЙ КЛУБ', 512, 52);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(62, 5.8), new THREE.MeshBasicMaterial({ map: tx, transparent: true, clippingPlanes: clipPlanes }));
  lbl.position.set(-62, 0, 19.05); lbl.rotation.z = Math.PI / 2; g.add(lbl);
  g.userData.part = 'plate';
  return g;
}
const coinGeo = cylZ(11, 2.2, 40);
// Линейка посадок: три ряда отверстий и отдельная плашка со штырьком
const LADDER = {
  shaft: { row: 16, sizes: [4.2, 4.25, 4.3, 4.35, 4.4, 4.45, 4.5], x0: -27, dx: 9 },
  brg: { row: 1, sizes: [8.9, 8.95, 9.0, 9.05, 9.1, 9.2], x0: -27.5, dx: 11 },
  peg: { row: -15, sizes: [4.1, 4.2, 4.3, 4.4], x0: -18, dx: 12 },
};
function ladder() {
  const g = new THREE.Group();
  const s = rrect(72, 48, 4), holes = [];
  for (const [k, L] of Object.entries(LADDER)) L.sizes.forEach((d, i) => { const x = L.x0 + i * L.dx, h = circle(d / 2); h.curves.forEach((c) => { c.aX += x; c.aY += L.row; }); s.holes.push(h); holes.push([k, i, x, L.row]); });
  const p = mesh(extrude(s, 5), MAT.ladder, 0); g.add(p);   // без контуров: триангуляция пластины с отверстиями даёт лишние линии
  const small = mesh(extrude(rrect(14, 14, 3), 3), MAT.ladder); small.position.set(48, -15, 0); g.add(small);
  const peg = mesh(cylZ(2, 9, 20), MAT.ladder); peg.position.set(48, -15, 7.5); g.add(peg);
  Object.assign(g.userData, { holes, peg, part: 'ladder' });
  return g;
}

// ---------- Что это за деталь (точка или нажатие на модель): название, одна-две фразы, глава с разбором, [режим], [у нашей машинки] ----------
const PARTS = {
  plate: ['Плита-шасси', 'Соединяет две оси в одну машину и держит груз.', 8],
  block: ['Корпус подшипника', 'Держит подшипник и стоит на плите на двух штырьках.', 4],
  brg: ['Подшипник', 'Внутри стальные шарики: они катятся, а не трутся. Поэтому колесо крутится легко и долго.', 2],
  ring_o: ['Наружное кольцо', 'Сидит в корпусе и стоит на месте.', 2],
  ring_i: ['Внутреннее кольцо', 'Надето на вал и крутится вместе с ним.', 2],
  balls: ['Шарики', 'Катятся между кольцами — это трение качения. Оно в десятки раз меньше, чем скольжение.', 2],
  shield: ['Защитная шайба', 'Закрывает шарики от пыли и держит смазку.', 2],
  shaft: ['Вал', 'Стальной пруток Ø4 мм. Крутится вместе с колёсами — поэтому вал, а не ось.', 7],
  wheel: ['Колесо Ø50', 'Надевается на вал. По краю — канавка, куда надевают «шину».', 5],
  hole: ['Отверстие под винт', 'Идёт сквозь ступицу к валу. Через него винт достаёт до вала.', 5],
  nut: ['Закладная гайка M3', 'Спрятана в шестигранном пазу: не проворачивается, резьба не стирается.', 5],
  screw: ['Установочный винт', 'Упирается в вал — колесо не провернётся и не съедет.', 5],
  cap: ['Колпачок', 'Закрывает острый конец вала. Сидит плотно, снимается рукой.', 7],
  coin: ['Монета-груз', '10 ₽, около 6 г. Прижимает колёса к дороге.', 1],
  ladder: ['Пробная плашка', 'Отверстия разного размера: подбираем, что подойдёт для своего принтера.', 3],
  tire: ['«Шина»', 'Скотч, изолента или резинка на колесе — меняет сцепление с дорогой.', 9],
  pin: ['Стопор', 'Не даёт колесу крутиться: машинка может только скользить.', 9],
  board: ['Доска 60 см', 'Наклонная дорога для опытов.', 10],
  book: ['Книги', 'Высота горки: каждая книга — 3 см.', 10],
  bush: ['Втулка', 'Просто отверстие в пластике: вал трётся всей поверхностью.', 2],
  // настоящий автомобиль
  rbody: ['Кузов', 'Корпус машины: держит всё вместе и защищает людей.', 0, 'real', 'Её «кузов» — плита-шасси.'],
  engine: ['Двигатель', 'Сжигает бензин и крутит вал. Это «сердце» машины.', 1, 'real', 'Её двигатель — горка: машинку тянет вниз сила тяжести.'],
  piston: ['Поршень', 'Вспышка бензина толкает его вниз — так рождается сила.', 1, 'real'],
  crank: ['Коленчатый вал', 'Превращает движение поршней вверх-вниз во вращение.', 1, 'real'],
  radiator: ['Радиатор', 'Охлаждает двигатель: встречный воздух остужает горячую жидкость.', 1, 'real'],
  battery: ['Аккумулятор', 'Хранит электричество: чтобы завести мотор, включить фары и музыку.', 0, 'real'],
  gearbox: ['Коробка передач', 'Выбирает: ехать медленно, но сильно — или быстро.', 2, 'real'],
  cardan: ['Карданный вал', 'Длинный вал под полом: несёт вращение от коробки к задним колёсам.', 2, 'real', 'У неё тоже есть вал — стальной, Ø4 мм.'],
  diff: ['Дифференциал', 'Делит вращение между колёсами. В повороте наружное колесо крутится быстрее.', 2, 'real'],
  half: ['Полуось', 'Вал от дифференциала к колесу.', 2, 'real'],
  rwheel: ['Колесо и шина', 'Резиновая шина держит дорогу — это сцепление.', 0, 'real', '«Шина» — скотч, изолента или резинка.'],
  brake: ['Тормоз', 'Колодки сжимают диск. Трение останавливает колесо, а диск нагревается.', 5, 'real', 'Тормоз — стопор.'],
  spring: ['Подвеска', 'Пружина и амортизатор: колесо прыгает на кочке, а кузов едет ровно.', 4, 'real', 'Подвески нет — корпуса стоят прямо на плите.'],
  steer: ['Руль', 'Поворачиваешь руль — рейка двигает передние колёса.', 3, 'real', 'Руля нет — она едет только прямо.'],
  rack: ['Рулевая рейка', 'Двигается влево-вправо и поворачивает колёса.', 3, 'real'],
  tank: ['Бензобак', 'Запас топлива — около 50 литров.', 0, 'real'],
  exhaust: ['Выхлопная труба', 'Уводит газы от двигателя назад. Глушитель делает звук тише.', 1, 'real'],
  seat: ['Сиденья', 'Водитель сидит слева — и руль тоже слева.', 0, 'real'],
};

// ---------- Главы ----------
// pose(t, S) — расставляет всё для момента t ∈ [0, 1]; live(dt, S) — опыты, которые идут в реальном времени.
// spots — детали, на которых светятся точки (или функция S → список). tags: true — обычные подписи видны сразу.
const CH_TOY = [], CH_REAL = [];
const ch = (o) => CH_TOY.push(o);
const rch = (o) => CH_REAL.push(o);
const MODES = { toy: CH_TOY, real: CH_REAL };

const CSS = `
.lab2{position:relative;border:1.5px solid var(--line,rgba(74,44,20,.26));border-bottom-width:4px;border-radius:14px;overflow:hidden;background:rgba(255,250,238,.55);font-family:"PT Serif",Georgia,serif;color:var(--ink,#3a2313)}
.lab-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px 0}
.lab-modes{display:inline-flex;padding:3px;border-radius:22px;background:rgba(74,44,20,.1)}
.lab-modes button{padding:7px 14px;border:0;border-radius:18px;background:none;font:700 14.5px "PT Serif",Georgia,serif;color:var(--ink-soft,#6e4b2c);cursor:pointer;white-space:nowrap}
.lab-modes button.on{background:#fffaf0;color:var(--sanguine,#9a3a1b);box-shadow:0 2px 0 rgba(74,44,20,.18)}
.lab-chaps{display:flex;gap:6px;overflow-x:auto;padding:10px 12px;scrollbar-width:thin}
.lab-chaps button{flex:none;display:flex;align-items:center;gap:6px;padding:6px 12px 6px 6px;border-radius:18px;border:1.5px solid var(--line,rgba(74,44,20,.26));background:#fffaf0;font:700 13.5px "PT Serif",Georgia,serif;color:var(--ink-soft,#6e4b2c);cursor:pointer;white-space:nowrap}
.lab-chaps button i{font-style:normal;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:rgba(74,44,20,.08);font-size:14px}
.lab-chaps button.on{border-color:var(--sanguine,#9a3a1b);color:#fff6e6;background:var(--sanguine,#9a3a1b)}.lab-chaps button.on i{background:rgba(255,255,255,.2)}
.lab-chaps button.seen:not(.on){color:#3f6a32;border-color:rgba(63,106,50,.45)}
.lab-stage{position:relative;height:min(62vh,560px);min-height:340px;touch-action:none;background:radial-gradient(ellipse at 50% 38%,rgba(255,250,236,.95),rgba(242,228,196,.6) 70%),var(--parchment,#f2e4c4);border-top:1px solid var(--line,rgba(74,44,20,.2));border-bottom:1px solid var(--line,rgba(74,44,20,.2))}
.lab-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;cursor:grab}.lab-stage canvas.grab{cursor:grabbing}
.lab-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lab-lb{position:absolute;left:0;top:0;transition:opacity .25s;will-change:transform}
.lab-lb i{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:var(--sanguine,#9a3a1b);box-shadow:0 0 0 2px #fff8ea}
.lab-leads{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.lab-leads path{fill:none;stroke:#9a3a1b;stroke-width:1.2;stroke-dasharray:3 2;opacity:.75}
.lab-lb span{position:absolute;left:8px;top:-30px;white-space:nowrap;padding:3px 9px;border-radius:12px;background:rgba(255,250,238,.95);border:1px solid rgba(74,44,20,.35);font-size:13px;line-height:1.3;color:var(--ink,#3a2313);box-shadow:0 2px 0 rgba(74,44,20,.15)}
.lab-lb.hot span{background:var(--sanguine,#9a3a1b);border-color:var(--sanguine,#9a3a1b);color:#fff6e6}
.lab-lb.dim i{display:none}.lab-lb.dim span{left:0;top:0;transform:translate(-50%,-50%);background:#fff3cf;border-color:#c9a227;font-weight:700}
.lab-lb.cg i{width:14px;height:14px;left:-7px;top:-7px;background:conic-gradient(#3a2313 0 25%,#fff8ea 0 50%,#3a2313 0 75%,#fff8ea 0);border:1.5px solid #3a2313;box-shadow:none}
.lab-lb.n i{display:none}.lab-lb.n span{left:0;top:0;transform:translate(-50%,-50%);width:26px;height:26px;padding:0;display:grid;place-items:center;border-radius:50%;background:var(--sanguine,#9a3a1b);border:2px solid #fff8ea;color:#fff6e6;font-weight:700}
.lab-lb.tiny i{display:none}.lab-lb.tiny span{left:0;top:0;transform:translate(-50%,-50%);padding:0 4px;font-size:11px;border-radius:6px;background:rgba(255,250,238,.85)}
.lab-lb.tiny.sel span{background:var(--sanguine,#9a3a1b);color:#fff6e6;border-color:var(--sanguine,#9a3a1b)}
.lab-lb.row i{display:none}.lab-lb.row span{left:auto;right:0;top:0;transform:translateY(-50%);background:none;border:0;box-shadow:none;font-style:italic;color:var(--ink-soft,#6e4b2c);font-size:12.5px}
.lab-spots{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lab-spot{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;transition:opacity .25s}
.lab-spot:before{content:"";position:absolute;inset:7px;border-radius:50%;background:#e0661b;border:2.5px solid #fff8ea;box-shadow:0 2px 6px rgba(58,35,19,.45)}
.lab-spot:after{content:"";position:absolute;inset:3px;border-radius:50%;border:2px solid #e0661b;animation:lsPulse 1.8s ease-out infinite}
.lab-spot.seen:before{background:#5d8a48}.lab-spot.seen:after{border-color:#5d8a48;animation-duration:3.2s;opacity:.5}
.lab-spot.on:before{background:var(--sanguine,#9a3a1b);transform:scale(1.2)}
.lab-spot b{position:absolute;left:50%;bottom:100%;transform:translate(-50%,4px);padding:2px 8px;border-radius:10px;background:rgba(58,35,19,.88);color:#fff6e6;font:700 12px "PT Serif",Georgia,serif;white-space:nowrap;opacity:0;transition:opacity .15s,transform .15s;pointer-events:none}
.lab-spot:hover b,.lab-spot:focus-visible b{opacity:1;transform:translate(-50%,-2px)}
@keyframes lsPulse{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.5);opacity:0}}
.lab-cap{position:absolute;left:12px;top:12px;max-width:calc(100% - 70px);padding:7px 14px;border-radius:18px;background:rgba(58,35,19,.88);color:#fff6e6;font-size:14.5px;line-height:1.35;pointer-events:none;z-index:2}
.lab-prog{position:absolute;right:62px;top:12px;padding:5px 12px;border-radius:16px;background:rgba(255,250,238,.95);border:1.5px solid #e0a35b;font-size:13px;font-weight:700;color:#8a4a1b;pointer-events:none;z-index:2}
.lab-prog.done{background:#e9f4e2;border-color:#3f6a32;color:#2f5f2a}.lab-prog.pop{animation:lfPop .5s}@keyframes lfPop{40%{transform:scale(1.12)}}
.lab-hint{position:absolute;left:12px;right:70px;bottom:12px;margin:auto;max-width:max-content;display:flex;align-items:center;gap:8px;padding:6px 14px 6px 8px;border-radius:16px;background:rgba(58,35,19,.86);font-size:13px;line-height:1.3;color:#fff6e6;pointer-events:none;transition:opacity .5s;z-index:2}.lab-hint.off{opacity:0}
.lab-hint b{color:#ffd98a}.lh-hand{font-size:20px;display:inline-block;animation:lhDrag 2.2s ease-in-out infinite}@keyframes lhDrag{0%,100%{transform:translateX(-6px) rotate(-8deg)}50%{transform:translateX(8px) rotate(8deg)}}
.lh-t{display:none}@media(hover:none) and (pointer:coarse){.lh-m{display:none}.lh-t{display:inline}}
.lab-nav{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:grid;gap:6px;z-index:3}
.lab-nav button{width:40px;height:40px;border-radius:50%;border:1.5px solid rgba(74,44,20,.35);background:rgba(255,250,238,.95);font:700 18px/1 Georgia,serif;color:var(--ink,#3a2313);cursor:pointer;box-shadow:0 2px 0 rgba(74,44,20,.22);touch-action:manipulation}
.lab-nav button:hover{border-color:var(--sanguine,#9a3a1b);color:var(--sanguine,#9a3a1b)}.lab-nav button:active{transform:translateY(2px);box-shadow:none}
.lab-nav button.on{background:var(--sanguine,#9a3a1b);border-color:var(--sanguine,#9a3a1b);color:#fff6e6}
.lab-info{position:absolute;left:0;top:0;z-index:4;width:min(270px,calc(100% - 70px));padding:12px 32px 12px 14px;border-radius:12px;background:#fffaf0;border:2px solid var(--sanguine,#9a3a1b);box-shadow:0 10px 24px rgba(58,35,19,.3);font-size:14.5px;line-height:1.4}
.lab-info.pop{animation:liPop .35s cubic-bezier(.2,.9,.3,1.3)}@keyframes liPop{0%{opacity:0;scale:.6}100%{opacity:1;scale:1}}
.lab-info b{display:block;font:700 21px/1.15 "Cormorant Garamond",Georgia,serif;color:var(--sanguine,#9a3a1b)}.lab-info p{margin:5px 0 0}
.lab-info .li-toy{margin-top:8px;padding:6px 9px;border-radius:8px;background:#fff3cf;font-size:13.5px}
.lab-info .li-x{position:absolute;right:4px;top:3px;width:28px;height:28px;border:0;background:none;font-size:22px;color:var(--ink-soft,#6e4b2c);cursor:pointer}
.lab-info .li-go{margin-top:9px;padding:6px 13px;border-radius:15px;border:1.5px solid var(--sanguine,#9a3a1b);background:var(--sanguine,#9a3a1b);color:#fff6e6;font:700 13px "PT Serif",Georgia,serif;cursor:pointer}
.lab-coach{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:20px;background:rgba(36,22,12,.55);color:#fff6e6;text-align:center;cursor:pointer;animation:lcIn .4s}
.lab-coach div{max-width:420px;display:grid;gap:12px;justify-items:center}
.lab-coach .big{font-size:56px;line-height:1;animation:lcTap 1.3s ease-in-out infinite}
.lab-coach p{margin:0;font-size:19px;line-height:1.4}.lab-coach p.s{font-size:15px;color:#f2dcb4}
.lab-coach .dot{display:inline-block;width:18px;height:18px;border-radius:50%;background:#e0661b;border:2.5px solid #fff8ea;vertical-align:-3px;box-shadow:0 0 0 4px rgba(224,102,27,.35)}
.lab-coach button{padding:10px 26px;border-radius:22px;border:0;background:#e0661b;color:#fff;font:700 16px "PT Serif",Georgia,serif;cursor:pointer;box-shadow:0 4px 0 #9a3a1b}
@keyframes lcIn{from{opacity:0}}@keyframes lcTap{0%,100%{transform:translateY(0)}50%{transform:translateY(10px) scale(.92)}}
.lab-load{display:grid;place-items:center;height:100%;color:var(--ink-soft,#6e4b2c)}
/* ---------- кнопки опыта ---------- */
.lab-deck{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:flex-start;padding:12px 14px;background:linear-gradient(#fff6e2,#fbefd6);border-bottom:1px solid var(--line,rgba(74,44,20,.2))}
.lab-deck[hidden]{display:none}
.dk-g{display:grid;gap:6px;min-width:0}.dk-l{font-size:13px;font-weight:700;color:var(--ink-soft,#6e4b2c)}
.dk-o{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.dk-b{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:12px;border:1.5px solid rgba(74,44,20,.3);border-bottom-width:3px;background:#fffaf0;font:700 14px "PT Serif",Georgia,serif;color:var(--ink,#3a2313);cursor:pointer;touch-action:manipulation}
.dk-b:hover{border-color:var(--sanguine,#9a3a1b)}.dk-b.on{background:var(--sanguine,#9a3a1b);border-color:#6e2a12;color:#fff6e6}
.dk-b svg{flex:none}
.dk-step{display:inline-flex;align-items:center;gap:8px}.dk-step button{width:36px;height:36px;border-radius:50%;border:1.5px solid rgba(74,44,20,.3);border-bottom-width:3px;background:#fffaf0;font:700 20px/1 Georgia,serif;color:var(--ink,#3a2313);cursor:pointer;touch-action:manipulation}
.dk-step span{display:inline-flex;align-items:flex-end;gap:2px;min-width:44px;justify-content:center;font-weight:700;font-size:15px}
.dk-go{padding:11px 22px;border-radius:24px;border:0;background:linear-gradient(#7cc35a,#3f8a3a);color:#fff;font:700 17px "PT Serif",Georgia,serif;cursor:pointer;box-shadow:0 4px 0 #285a24;text-shadow:0 1px 0 rgba(0,0,0,.25);touch-action:manipulation;user-select:none;-webkit-user-select:none}
.dk-go:active,.dk-go.hold{transform:translateY(3px);box-shadow:0 1px 0 #285a24}
.dk-go.red{background:linear-gradient(#e2593b,#a83218);box-shadow:0 4px 0 #6e1f0e}.dk-go.red:active,.dk-go.red.hold{box-shadow:0 1px 0 #6e1f0e}
.dk-go[disabled]{opacity:.6;cursor:wait}
.dk-out{flex:1 1 100%;margin:0;font-size:15px;line-height:1.45}.dk-out small{color:var(--ink-soft,#6e4b2c)}
.dk-out .big{font-size:19px}
.dk-bars{flex:1 1 100%;display:grid;gap:4px;margin:0;padding:0;list-style:none;font-size:13.5px}
.dk-bars li{display:grid;grid-template-columns:minmax(90px,auto) 1fr auto;gap:8px;align-items:center}
.dk-bars li i{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,#e3b341,#e0661b);transition:width .6s cubic-bezier(.2,.8,.2,1)}
.dk-range{display:flex;align-items:center;gap:8px;min-width:200px}.dk-range input{flex:1;accent-color:var(--sanguine,#9a3a1b)}
.v-no,.v-loose,.v-hard{color:#a63a1b;font-weight:700}.v-free,.v-snug,.v-tight{color:#3f6a32;font-weight:700}.v-gap{color:#8a6d1f;font-weight:700}
/* ---------- плеер и текст ---------- */
.lab-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line,rgba(74,44,20,.2))}
.lb-btn{flex:none;width:40px;height:40px;border-radius:50%;border:1.5px solid rgba(74,44,20,.35);background:#fffaf0;font:700 20px/1 Georgia,serif;color:var(--ink,#3a2313);cursor:pointer;box-shadow:0 2px 0 rgba(74,44,20,.2)}
.lb-play{background:var(--sanguine,#9a3a1b);border-color:var(--sanguine,#9a3a1b);color:#fff6e6;font-size:14px}
.lab-seek{flex:1;min-width:60px;accent-color:var(--sanguine,#9a3a1b)}
.lb-num{flex:none;font-size:13px;color:var(--ink-soft,#6e4b2c);min-width:44px;text-align:right}
.lab-text{padding:12px 18px 16px;font-size:16px;line-height:1.6}
.lab-text h3{font:700 26px/1.15 "Cormorant Garamond",Georgia,serif;margin:0 0 6px}
.lab-lead{font-size:17px;margin:0 0 10px;max-width:820px}
.lab-acc{border-top:1px solid var(--line,rgba(74,44,20,.2));max-width:820px}
.lab-acc summary{list-style:none;display:flex;align-items:center;gap:8px;padding:9px 0;font-weight:700;font-size:15.5px;color:var(--ink,#3a2313);cursor:pointer}
.lab-acc summary::-webkit-details-marker{display:none}
.lab-acc summary:after{content:"＋";margin-left:auto;color:var(--sanguine,#9a3a1b);font-weight:700}.lab-acc[open] summary:after{content:"−"}
.lab-acc div{padding:0 0 10px;font-size:15.5px}.lab-acc ol{margin:0;padding-left:22px}
.lab-next{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}
.lab-next button{padding:9px 18px;border-radius:20px;border:1.5px solid var(--sanguine,#9a3a1b);background:var(--sanguine,#9a3a1b);color:#fff6e6;font:700 15px "PT Serif",Georgia,serif;cursor:pointer}
@media(max-width:700px){.lab-stage{height:58vh;min-height:300px}.lab-cap{font-size:13px;max-width:calc(100% - 64px)}.lab-prog{top:auto;bottom:12px;right:auto;left:12px}
  .lab-nav{top:auto;bottom:10px;transform:none;grid-template-columns:1fr 1fr}.lab-nav button{width:36px;height:36px;font-size:16px}.lab-hint{display:none}
  .lab-modes{width:100%}.lab-modes button{flex:1;padding:7px 8px;font-size:13.5px}.lab-text{padding:10px 14px 14px}.lab-text h3{font-size:23px}.lab-deck{padding:10px 12px;gap:10px 14px}.dk-go{flex:1}}
@media(prefers-reduced-motion:reduce){.lab-spot:after,.lh-hand,.lab-coach .big{animation:none}}
`;
const icoTire = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="${k === 'etape' ? '#202024' : k === 'band' ? '#8a3b2a' : k === 'tape' ? '#dfe8ee' : '#c8643a'}" stroke="#3a2313" stroke-width="1.4"/><circle cx="12" cy="12" r="${k === 'band' ? 8 : 7}" fill="#c8643a" stroke="#3a2313" stroke-width="1"/><circle cx="12" cy="12" r="2" fill="#3a2313"/></svg>`;
const seenKey = (k) => { try { return !!localStorage.getItem(k); } catch (e) { return true; } };
const markKey = (k) => { try { localStorage.setItem(k, '1'); } catch (e) {} };

export function start(root) {
  if (!document.getElementById('lab-css')) { const s = document.createElement('style'); s.id = 'lab-css'; s.textContent = CSS; document.head.append(s); }
  let mode = 'toy', CH = CH_TOY;
  try { const m = localStorage.getItem('labMode'); if (m === 'real') { mode = 'real'; CH = CH_REAL; } } catch (e) {}
  root.innerHTML = `<div class="lab2" tabindex="-1">
  <div class="lab-top"><div class="lab-modes" role="tablist"><button type="button" role="tab" data-m="toy">🛠 Наша машинка</button><button type="button" role="tab" data-m="real">🚗 Настоящий автомобиль</button></div></div>
  <div class="lab-chaps" id="labChaps" role="tablist"></div>
  <div class="lab-stage" id="labView"><canvas id="labCanvas"></canvas><div class="lab-labels" id="labLabels"><svg class="lab-leads" id="labLeads"><path d=""/></svg></div><div class="lab-spots" id="labSpots"></div>
    <div class="lab-cap" id="labCap" hidden></div><div class="lab-prog" id="labProg" hidden></div><div class="lab-info" id="labInfo" hidden></div>
    <div class="lab-nav" role="group" aria-label="Управление видом"><button type="button" data-v="l" aria-label="Повернуть влево" title="Повернуть влево">⟲</button><button type="button" data-v="r" aria-label="Повернуть вправо" title="Повернуть вправо">⟳</button><button type="button" data-v="+" aria-label="Ближе" title="Ближе">+</button><button type="button" data-v="-" aria-label="Дальше" title="Дальше">−</button><button type="button" data-v="t" aria-label="Подписи деталей" title="Подписи деталей" style="font-size:14px">Aa</button><button type="button" data-v="h" aria-label="Весь вид" title="Весь вид">⌂</button></div>
    <div class="lab-hint" id="labHint"><span class="lh-hand" aria-hidden="true">👆</span><span class="lh-m">Тяни — повернуть · колёсико — ближе · <b>нажми на точку</b></span><span class="lh-t">Палец — повернуть · два пальца — ближе · <b>нажми на точку</b></span></div></div>
  <div class="lab-deck" id="labCtl" hidden></div>
  <div class="lab-bar"><button type="button" class="lb-btn" id="labPrev" aria-label="Предыдущая глава">‹</button><button type="button" class="lb-btn lb-play" id="labPlay" aria-label="Пауза">❚❚</button><button type="button" class="lb-btn" id="labNext" aria-label="Следующая глава">›</button>
    <input type="range" class="lab-seek" id="labSeek" min="0" max="1000" value="0" aria-label="Перемотка"><span class="lb-num" id="labNum"></span></div>
  <article class="lab-text" id="labText" aria-live="polite"></article></div>`;
  const view = $('#labView', root), canvas = $('#labCanvas', root), labelsEl = $('#labLabels', root), spotsEl = $('#labSpots', root);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 25; controls.maxDistance = 4000;
  scene.add(new THREE.HemisphereLight('#fff6e4', '#8a6a48', 1.5));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  const sc = sun.shadow.camera; sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260; sc.near = 10; sc.far = 2000;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.position.y = -25; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(3000, 60, '#b89a6a', '#d8c39a'); grid.position.y = -24.9; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);

  // мир в координатах чертежа (z — вверх)
  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);
  const car = new THREE.Group(); world.add(car);
  const axles = [axleUnit(50), axleUnit(-50)]; car.add(...axles);
  const pl = plate(); car.add(pl);
  const coins = []; for (let i = 0; i < 30; i++) { const c = mesh(coinGeo, MAT.brass); c.visible = false; c.userData.part = 'coin'; car.add(c); coins.push(c); }
  // отдельные экспонаты глав
  const bigBrg = new THREE.Group(); const bb = bearing(); bigBrg.add(bb); bb.position.y = -2; bigBrg.scale.setScalar(9);
  bb.children[0].userData.part = 'ring_o'; bb.userData.inner.userData.part = 'ring_i'; bb.userData.balls.userData.part = 'balls'; bb.userData.shIn.userData.part = bb.userData.shOut.userData.part = 'shield';
  const bush = mesh(lathe([[2, -2], [4.5, -2], [4.5, 2], [2, 2], [2, -2]]), MAT.wheel); bush.visible = false; bush.userData.part = 'bush'; bigBrg.add(bush);
  const bigShaft = mesh(new THREE.CylinderGeometry(2, 2, 16, 24), MAT.steel); bigShaft.userData.part = 'shaft'; bigBrg.add(bigShaft);
  world.add(bigBrg);
  const lad = ladder(); lad.position.z = -25; world.add(lad);
  const probe = { shaft: Object.assign(mesh(cylZ(2, 34, 24), MAT.steel), { userData: { part: 'shaft' } }), brg: (() => { const b = bearing(); b.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(b); return g; })(), peg: new THREE.Group() };
  { const pp = mesh(extrude(rrect(14, 14, 3), 3), MAT.ladder); const pg = mesh(cylZ(2, 9, 20), MAT.ladder); pg.position.z = -4.5; pp.position.z = 0; probe.peg.add(pp, pg); }
  Object.values(probe).forEach((p) => world.add(p));
  // доска, книги, линейка для опытов
  const tilt = new THREE.Group(); world.add(tilt);
  const boardM = mesh(new THREE.BoxGeometry(600, 170, 8), MAT.board); boardM.position.set(300, 0, -4); boardM.userData.part = 'board'; tilt.add(boardM);
  const books = new THREE.Group(); books.userData.part = 'book'; world.add(books);
  for (let i = 0; i < 12; i++) { const b = mesh(new THREE.BoxGeometry(210, 150, 30), M(COL.book[i % 5], { r: 0.85 })); b.visible = false; b.rotation.z = Math.PI / 2 + (((i * 37) % 11) - 5) * 0.012; books.add(b); }
  const ruler = new THREE.Group(); world.add(ruler);
  { const strip = mesh(new THREE.BoxGeometry(3000, 40, 1), M('#efe0b8', { r: 0.9 })); strip.position.set(1500, -110, -24.5); ruler.add(strip);
    for (let x = 0; x <= 3000; x += 100) { const t = mesh(new THREE.BoxGeometry(x % 500 ? 2 : 4, x % 500 ? 14 : 26, 1.2), MAT.dark, 0); t.position.set(x, -110 + (x % 500 ? 13 : 7), -23.9); ruler.add(t); } }
  const flags = new THREE.Group(); world.add(flags);
  const dimLines = new THREE.Group(); world.add(dimLines);

  const S = { car, axles, pl, coins, bigBrg, bb, bush, bigShaft, lad, probe, tilt, books, ruler, flags, dimLines, world, labels: [], cap: '', ctl: null, follow: null, R: null };
  S.real = () => (S.R ||= buildReal(world));
  S.respot = () => buildSpots();

  // ---------- Исходное положение: машинка собрана, всё лишнее спрятано ----------
  function reset() {
    clipPlanes.length = 0; world.add(car);
    car.visible = true; car.position.set(0, 0, 0); car.rotation.set(0, 0, 0); world.position.set(0, 0, 0);
    car.children.forEach((c) => (c.visible = true));
    for (const a of axles) {
      a.visible = true; a.userData.shaft.visible = true; a.userData.shaft.position.y = 0; a.userData.shaft.rotation.y = 0;
      for (const s of [1, -1]) {
        const { bl, br, wh, cp } = a.userData.sides[s];
        bl.position.set(0, 0, 0); bl.visible = br.visible = wh.visible = cp.visible = true;
        br.position.set(0, s * 35.5, 0); br.userData.inner.rotation.y = 0; br.userData.balls.rotation.y = 0; br.userData.shOut.visible = br.userData.shIn.visible = true;
        wh.position.set(0, s * 39.5, 0); wh.rotation.set(0, 0, 0); cp.position.set(0, s * 57, 0); cp.rotation.set(0, 0, 0);
        const u = wh.userData; u.nut.position.set(4.1, 5.5, 0); u.nut.visible = true; u.screw.position.set(2, 5.5, 0); u.screw.rotation.x = 0; u.screw.visible = true; u.pin.visible = false; setTire(wh, '');
      }
    }
    pl.position.set(0, 0, 0); pl.visible = true;
    setCoins([1, 1, 1]);
    bigBrg.visible = false; lad.visible = false; Object.values(probe).forEach((p) => (p.visible = false));
    tilt.visible = false; books.visible = false; ruler.visible = false; flags.visible = false; dimLines.visible = false; dimLines.clear();
    grid.visible = true; S.labels = []; S.follow = null;
    if (S.R) S.R.reset();
  }
  function setCoins(n) { let k = 0; WELLS.forEach(([x, y], w) => { for (let i = 0; i < (n[w] || 0) && k < coins.length; i++, k++) { coins[k].visible = true; coins[k].position.set(x, y, 20.2 + i * 2.2); } }); for (; k < coins.length; k++) coins[k].visible = false; }
  S.setCoins = setCoins; S.reset = reset; S.setTire = (k) => axles.forEach((a) => [1, -1].forEach((s) => setTire(a.userData.sides[s].wh, k)));
  // вращение колёс (угол в радианах; знак — для движения вперёд по x)
  S.roll = (a) => axles.forEach((ax) => { ax.userData.shaft.rotation.y = a; [1, -1].forEach((s) => { const { wh, cp, br } = ax.userData.sides[s]; wh.rotation.y = a; cp.rotation.y = a; br.userData.inner.rotation.y = a; br.userData.balls.rotation.y = a * 0.4; }); });
  S.dim = (a, b, text, off = [0, 0, 0]) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#9a3a1b' })); dimLines.add(l);
    for (const p of [a, b]) { const d = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: '#9a3a1b' })); d.position.set(...p); dimLines.add(d); }
    return { p: [(a[0] + b[0]) / 2 + off[0], (a[1] + b[1]) / 2 + off[1], (a[2] + b[2]) / 2 + off[2]], text, cls: 'dim' };
  };

  // ---------- Подписи поверх картинки ----------
  // Обычные подписи (без класса) показываются только по кнопке «Aa» — по умолчанию детали узнают по точкам.
  // Подписи ставятся так, чтобы не налезать друг на друга: для каждой пробуем места вокруг точки и берём первое свободное.
  const tmpV = new THREE.Vector3(), leadsEl = $('#labLeads', root), leadPath = leadsEl.firstChild;
  let labelKey = '', lbEls = [], sizes = [], showTags = false, labs = [];
  const slotOf = new Map();
  const CENTER = /\b(dim|n|tiny|row)\b/;
  const uiEls = ['#labCap', '#labProg', '.lab-nav', '#labHint'].map((q) => $(q, root));
  function drawLabels() {
    labs = S.labels.filter((l) => l.cls || showTags);
    const key = labs.map((l) => l.text + (l.cls || '')).join('|');
    if (key !== labelKey) {
      labelKey = key; lbEls.forEach((e) => e.remove());
      lbEls = labs.map((l) => { const d = document.createElement('div'); d.className = 'lab-lb ' + (l.cls || ''); d.innerHTML = `<i></i><span>${l.text}</span>`; labelsEl.append(d); return d; });
      sizes = lbEls.map((d) => { const sp = d.lastChild; return [sp.offsetWidth, sp.offsetHeight]; });
    }
    const W0 = view.clientWidth, H0 = view.clientHeight, placed = [], pad = 3; let lead = '';
    for (const e of uiEls) if (!e.hidden && !e.classList.contains('off') && e.offsetWidth) placed.push([e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight]);
    const hit = (x, y, w, h) => placed.some((q) => x < q[0] + q[2] + pad && x + w + pad > q[0] && y < q[1] + q[3] + pad && y + h + pad > q[1]);
    const pts = labs.map((l) => {
      if (l.obj) { l.obj.updateWorldMatrix(true, false); tmpV.set(...l.p); l.obj.localToWorld(tmpV); } else { world.updateWorldMatrix(true, false); tmpV.set(...l.p); world.localToWorld(tmpV); }
      tmpV.project(camera);
      return { x: ((tmpV.x + 1) / 2) * W0, y: ((1 - tmpV.y) / 2) * H0, on: tmpV.z < 1 && l.show !== false };
    });
    labs.forEach((l, i) => { const p = pts[i], [w, h] = sizes[i] || [0, 0]; if (!p.on) return; if (/\b(dim|n)\b/.test(l.cls || '') && (p.x < -w || p.x > W0 + w)) { p.on = false; return; } if (/\b(dim|n)\b/.test(l.cls || '')) p.x = clamp(p.x, w / 2 + 4, Math.max(w / 2 + 4, W0 - w / 2 - 4)); if (CENTER.test(l.cls || '')) placed.push(/\brow\b/.test(l.cls) ? [p.x - w, p.y - h / 2, w, h] : [p.x - w / 2, p.y - h / 2, w, h]); else placed.push([p.x - 5, p.y - 5, 10, 10]); });
    labs.forEach((l, i) => {
      const el = lbEls[i], p = pts[i]; if (!el) return;
      el.style.opacity = p.on ? 1 : 0;
      el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
      if (!p.on || CENTER.test(l.cls || '')) return;
      const [w, h] = sizes[i];
      const cand = [[8, -6 - h], [-8 - w, -6 - h], [8, 6], [-8 - w, 6]];
      for (let k = 1; k <= 7; k++) for (const sy of [-1, 1]) for (const sx of [1, -1]) cand.push([sx > 0 ? 12 : -12 - w, sy < 0 ? -6 - h - 26 * k : 6 + 26 * k]);
      cand.forEach((c) => { c[0] = clamp(p.x + c[0], 4, Math.max(4, W0 - 4 - w)) - p.x; });
      const inside = ([dx, dy]) => p.y + dy >= 4 && p.y + dy + h <= H0 - 4;
      const prev = slotOf.get(l.text); let k = -1;
      if (prev != null && inside(cand[prev]) && !hit(p.x + cand[prev][0], p.y + cand[prev][1], w, h)) k = prev;
      if (k < 0) k = cand.findIndex((c) => inside(c) && !hit(p.x + c[0], p.y + c[1], w, h));
      if (k < 0) { if (!/\bhot\b/.test(l.cls || '')) { el.style.opacity = 0; return; } k = Math.max(0, cand.findIndex(inside)); }
      slotOf.set(l.text, k);
      const [dx, dy] = cand[k], sp = el.lastChild; sp.style.left = dx + 'px'; sp.style.top = dy + 'px';
      placed.push([p.x + dx, p.y + dy, w, h]);
      if (k >= 4 || Math.abs(dx + w / 2) > w / 2 + 14) { const ex = dx > 0 ? p.x + dx : p.x + dx + w, ey = dy < 0 ? p.y + dy + h : p.y + dy; lead += `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`; }
    });
    leadPath.setAttribute('d', lead);
  }

  // ---------- Точки-детали: светятся на модели, нажал — карточка «что это» ----------
  let spots = [], seenParts = new Set();
  const box3 = new THREE.Box3(), ctr = new THREE.Vector3();
  function buildSpots() {
    const c = CH[cur], list = (typeof c.spots === 'function' ? c.spots(S) : c.spots) || [];
    spots.forEach((s) => s.el.remove());
    spots = list.filter((k) => PARTS[k]).map((k) => {
      const objs = []; world.traverse((o) => { if (o.userData && o.userData.part === k) objs.push(o); });
      const el = document.createElement('button'); el.type = 'button'; el.className = 'lab-spot'; el.dataset.k = k; el.setAttribute('aria-label', PARTS[k][0]);
      el.innerHTML = `<b>${PARTS[k][0]}</b>`; spotsEl.append(el);
      return { k, objs, el, obj: null, pt: new THREE.Vector3() };
    });
    seenParts = new Set(); drawProg();
  }
  const visibleUp = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  function drawSpots() {
    const W0 = view.clientWidth, H0 = view.clientHeight, taken = [];
    for (const s of spots) {
      let best = null, bd = Infinity;
      for (const o of s.objs) {
        if (!visibleUp(o)) continue;
        box3.setFromObject(o); if (box3.isEmpty()) continue; box3.getCenter(ctr);
        const d = ctr.distanceTo(camera.position) * (o === s.obj ? 0.85 : 1);   // держим прежнюю деталь, пока другая не ближе заметно
        if (d < bd) { bd = d; best = o; s.pt.copy(ctr); }
      }
      s.obj = best;
      let on = !!best;
      if (on) { tmpV.copy(s.pt).project(camera); on = tmpV.z < 1 && Math.abs(tmpV.x) < 1.02 && Math.abs(tmpV.y) < 1.02; }
      const x = ((tmpV.x + 1) / 2) * W0, y = ((1 - tmpV.y) / 2) * H0;
      if (on && taken.some(([a, b]) => Math.hypot(a - x, b - y) < 26)) on = false;   // две точки рядом — показываем одну
      if (on) taken.push([x, y]);
      s.el.style.opacity = on ? 1 : 0; s.el.style.pointerEvents = on ? '' : 'none';
      if (on) s.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      s.el.classList.toggle('seen', seenParts.has(s.k)); s.el.classList.toggle('on', !!infoAt && infoAt.k === s.k);
    }
  }
  const progEl = $('#labProg', root);
  function drawProg(pop) {
    const n = spots.length, k = spots.filter((s) => seenParts.has(s.k)).length;
    progEl.hidden = !n; if (!n) return;
    progEl.textContent = k >= n ? `🏆 Все детали изучены!` : `Изучено ${k} из ${n}`;
    progEl.classList.toggle('done', k >= n);
    if (pop) { progEl.classList.remove('pop'); void progEl.offsetWidth; progEl.classList.add('pop'); }
    if (k >= n && pop) markChap();
  }
  spotsEl.addEventListener('click', (e) => { const b = e.target.closest('.lab-spot'); if (!b) return; const s = spots.find((q) => q.k === b.dataset.k); if (s && s.obj) { hintOff(); coachOff(); showInfo({ k: s.k, obj: s.obj, point: s.pt.clone() }); } });

  // ---------- Камера: плавный перелёт ----------
  let fly = null;
  function camTo(pos, target, ms = 1100) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: W(...pos), t1: W(...target), start: performance.now(), ms }; }
  function stepFly(now) {
    if (!fly) return;
    const k = ease(clamp((now - fly.start) / fly.ms));
    camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k);
    if (k >= 1) fly = null;
  }

  // ---------- Плеер глав ----------
  let cur = -1, t = 0, playing = true, last = performance.now(), first = true;
  const seek = $('#labSeek', root), playBtn = $('#labPlay', root), capEl = $('#labCap', root);
  let ctlEl = $('#labCtl', root);
  const doneKey = () => 'labSeen:' + mode;
  let doneSet = new Set(); const loadDone = () => { try { doneSet = new Set(JSON.parse(localStorage.getItem(doneKey()) || '[]')); } catch (e) { doneSet = new Set(); } };
  function markChap() { doneSet.add(cur); try { localStorage.setItem(doneKey(), JSON.stringify([...doneSet])); } catch (e) {} drawChips(); }
  function drawChips() {
    const cs = $('#labChaps', root);
    cs.innerHTML = CH.map((c, i) => `<button type="button" role="tab" data-i="${i}" class="${i === cur ? 'on' : ''}${doneSet.has(i) ? ' seen' : ''}" aria-selected="${i === cur}"><i>${c.ico}</i>${c.short}</button>`).join('');
    const b = cs.children[cur]; if (b) cs.scrollTo({ left: b.offsetLeft - cs.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' });   // только по горизонтали: страница не прыгает
    root.querySelectorAll('.lab-modes button').forEach((q) => { const on = q.dataset.m === mode; q.classList.toggle('on', on); q.setAttribute('aria-selected', on); });
  }
  function setPlay(p) { playing = p; playBtn.textContent = p ? '❚❚' : '▶'; playBtn.setAttribute('aria-label', p ? 'Пауза' : 'Смотреть'); }
  const acc = (items) => items.filter((x) => x[1]).map(([h, b]) => `<details class="lab-acc"><summary>${h}</summary><div>${b}</div></details>`).join('');
  function go(i, keepCam) {
    i = (i + CH.length) % CH.length; if (i === cur) return;
    if (cur >= 0 && CH[cur].leave) CH[cur].leave(S);
    cur = i; t = 0; const c = CH[i];
    reset(); c.setup && c.setup(S);
    closeInfo(); if (!keepCam) { moved = false; home(first ? 1 : 1100); } first = false;
    drawChips(); buildSpots();
    showTags = !!c.tags; $('[data-v="t"]', root).classList.toggle('on', showTags);
    $('#labNum', root).textContent = `${i + 1} / ${CH.length}`;
    const nextC = CH[i + 1];
    $('#labText', root).innerHTML = `<h3>${c.title}</h3><p class="lab-lead">${c.lead}</p>${acc(c.more || [])}`
      + `<div class="lab-next">${nextC ? `<button type="button" data-next="1">Дальше: ${nextC.ico} ${nextC.short} →</button>` : mode === 'toy' ? '<button type="button" data-mode="real">Теперь — настоящий автомобиль 🚗 →</button>' : '<button type="button" data-mode="toy">К нашей машинке 🛠 →</button>'}</div>`;
    // новая панель — без обработчиков прошлой главы
    const fresh = ctlEl.cloneNode(false); ctlEl.replaceWith(fresh); ctlEl = fresh;
    S._gripUi = S._runOut = null;
    ctlEl.hidden = !c.ui; ctlEl.innerHTML = c.ui ? c.ui() : ''; if (c.bind) c.bind(ctlEl, S);
    setPlay(true);
    try { localStorage.setItem('labChap:' + mode, i); } catch (e) {}
  }
  function setMode(m, i) {
    if (m === mode) return i != null && go(i);
    if (cur >= 0 && CH[cur].leave) CH[cur].leave(S);
    mode = m; CH = MODES[m]; cur = -1; loadDone(); try { localStorage.setItem('labMode', m); } catch (e) {}
    go(i ?? savedChap());
  }
  const savedChap = () => { let k = 0; try { k = +localStorage.getItem('labChap:' + mode) || 0; } catch (e) {} return clamp(k, 0, CH.length - 1); };
  $('#labPrev', root).onclick = () => go(cur - 1);
  $('#labNext', root).onclick = () => go(cur + 1);
  playBtn.onclick = () => { if (!playing && t >= 1) t = 0; setPlay(!playing); };
  seek.oninput = () => { t = seek.value / 1000; setPlay(false); };
  $('#labChaps', root).onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) go(+b.dataset.i); };
  root.querySelector('.lab-modes').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('#labText', root).addEventListener('click', (e) => { if (e.target.closest('[data-next]')) { go(cur + 1); view.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } const m = e.target.closest('[data-mode]'); if (m) { setMode(m.dataset.mode); view.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
  root.addEventListener('keydown', (e) => { if (e.target.closest('input,select,button')) return; if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1); else if (e.key === ' ') { e.preventDefault(); playBtn.click(); } });
  controls.addEventListener('start', () => { fly = null; moved = true; hintOff(); coachOff(); });
  S.camTo = camTo; S.camera = camera; S.controls = controls;
  // вид главы: направление взгляда — из cam, расстояние — чтобы рамка box целиком помещалась в окне (на любом экране)
  const tmpCam = new THREE.PerspectiveCamera();
  function fitView(c) {
    const [P0, T0] = c.cam; if (!c.box) return [W(...P0), W(...T0)];
    const [a, b] = c.box, cc = W((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), dir = W(...P0).sub(W(...T0)).normalize();
    const pts = []; for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) pts.push(W(x, y, z));
    tmpCam.fov = camera.fov; tmpCam.aspect = camera.aspect; tmpCam.near = 1; tmpCam.far = 50000; tmpCam.updateProjectionMatrix();
    const ok = (d) => { tmpCam.position.copy(cc).addScaledVector(dir, d); tmpCam.lookAt(cc); tmpCam.updateMatrixWorld(); return pts.every((q) => { const v = q.clone().project(tmpCam); return v.z < 1 && Math.abs(v.x) < 0.86 && Math.abs(v.y) < 0.8; }); };
    let lo = 10, hi = 20000; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
    return [cc.clone().addScaledVector(dir, hi), cc];
  }
  let moved = false;   // зритель сам двигал камеру — после поворота экрана вид главы не сбрасываем
  function home(ms = 900) { const [p, tg] = fitView(CH[cur]); fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: tg, start: performance.now(), ms }; }
  S.home = home;
  function orbit(dAz, dPol, k = 1) {
    const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += dAz; sph.phi = clamp(sph.phi + dPol, 0.08, controls.maxPolarAngle); sph.radius = clamp(sph.radius * k, controls.minDistance, controls.maxDistance);
    const p = controls.target.clone().add(new THREE.Vector3().setFromSpherical(sph));
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: controls.target.clone(), start: performance.now(), ms: 450 };
    moved = true; hintOff();
  }
  const hintEl = $('#labHint', root), hintOff = () => hintEl.classList.add('off');
  setTimeout(hintOff, 12000);
  $('.lab-nav', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return; const v = b.dataset.v;
    if (v === 'l') orbit(-Math.PI / 6, 0); if (v === 'r') orbit(Math.PI / 6, 0);
    if (v === '+') orbit(0, 0, 0.75); if (v === '-') orbit(0, 0, 1.33); if (v === 'h') { moved = false; home(); }
    if (v === 't') { showTags = !showTags; b.classList.toggle('on', showTags); }
  });
  canvas.addEventListener('pointerdown', () => canvas.classList.add('grab')); window.addEventListener('pointerup', () => canvas.classList.remove('grab'));

  // ---------- Первое знакомство: затемнение с подсказкой, пропадает от любого касания ----------
  let coachEl = null;
  function coachOff() { if (!coachEl) return; coachEl.remove(); coachEl = null; markKey('labCoach'); }
  if (!seenKey('labCoach')) {
    coachEl = document.createElement('div'); coachEl.className = 'lab-coach';
    coachEl.innerHTML = `<div><span class="big" aria-hidden="true">👆</span><p><span class="dot"></span> Светящиеся точки — это детали.<br><b>Нажми на любую</b> — узнаешь, что это.</p><p class="s">Модель можно крутить пальцем или мышкой. Внизу — кнопки опытов и рассказ по главам.</p><button type="button">Понятно, начнём!</button></div>`;
    coachEl.addEventListener('click', coachOff); view.append(coachEl);
  }

  // ---------- Нажатие на деталь: карточка «что это», деталь подсвечивается и «дышит» ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), infoEl = $('#labInfo', root);
  let box = null, infoAt = null, hl = null;
  const partOf = (o) => { for (let q = o; q; q = q.parent) if (q.userData && q.userData.part) return [q.userData.part, q]; return [null, null]; };
  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObject(scene, true)) {
      if (!h.object.isMesh || !visibleUp(h.object)) continue;
      if (h.object.userData.skipPick) continue;
      if (clipPlanes.some((p) => p.distanceToPoint(h.point) < 0)) continue;   // отрезанная часть разреза
      const [k, obj] = partOf(h.object); if (k && PARTS[k]) return { k, obj, point: h.point };
    }
    return null;
  }
  function closeInfo() { infoEl.hidden = true; infoAt = null; if (box) { scene.remove(box); box.dispose(); box = null; } if (hl) { hl.obj.scale.copy(hl.s0); hl = null; } }
  function showInfo(hit) {
    closeInfo();
    const [title, text, chap, pm, toy] = PARTS[hit.k], pmode = pm || 'toy';
    const other = pmode !== mode || chap !== cur;
    infoEl.innerHTML = `<button type="button" class="li-x" aria-label="Закрыть">×</button><b>${title}</b><p>${text}</p>${toy && mode === 'real' ? `<p class="li-toy">🛠 У нашей машинки: ${toy}</p>` : ''}${other ? `<button type="button" class="li-go" data-ch="${chap}" data-pm="${pmode}">Подробнее: ${MODES[pmode][chap].ico} ${MODES[pmode][chap].short} →</button>` : ''}`;
    infoEl.hidden = false; infoEl.classList.remove('pop'); void infoEl.offsetWidth; infoEl.classList.add('pop'); infoAt = hit;
    box = new THREE.BoxHelper(hit.obj, '#e0661b'); box.material.depthTest = false; box.material.transparent = true; box.renderOrder = 9; scene.add(box);
    hl = { obj: hit.obj, s0: hit.obj.scale.clone(), t0: performance.now() };
    if (spots.some((s) => s.k === hit.k) && !seenParts.has(hit.k)) { seenParts.add(hit.k); drawProg(true); }
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; } down = null;
    const h = pickAt(e.clientX, e.clientY); if (h) { coachOff(); showInfo(h); } else closeInfo();
  });
  infoEl.addEventListener('click', (e) => { if (e.target.closest('.li-x')) return closeInfo(); const g = e.target.closest('[data-ch]'); if (g) { closeInfo(); setMode(g.dataset.pm, +g.dataset.ch); } });
  function placeInfo() {
    if (!infoAt) return;
    tmpV.copy(infoAt.point).project(camera);
    const W0 = view.clientWidth, H0 = view.clientHeight, w = infoEl.offsetWidth, h = infoEl.offsetHeight;
    let x = ((tmpV.x + 1) / 2) * W0 + 22, y = ((1 - tmpV.y) / 2) * H0 - h / 2;
    if (x + w > W0 - 56) x = ((tmpV.x + 1) / 2) * W0 - w - 22;
    infoEl.style.transform = `translate(${clamp(x, 8, Math.max(8, W0 - w - 56)).toFixed(0)}px,${clamp(y, 8, Math.max(8, H0 - h - 8)).toFixed(0)}px)`;
    if (box) { box.update(); box.material.opacity = 0.55 + 0.45 * Math.sin(performance.now() * 0.008); }
  }

  function resize() {
    const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1.3 ? 32 * Math.min(1.6, 1.3 / camera.aspect) : 32; camera.updateProjectionMatrix();
    if (cur >= 0 && !moved && !S.follow) home(1);
  }
  const ro = new ResizeObserver(resize); ro.observe(view); resize();
  let visible = true;
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(view);

  let stopped = false;
  function stop() {
    if (stopped) return; stopped = true; ro.disconnect(); io.disconnect(); controls.dispose();
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    renderer.dispose(); renderer.forceContextLoss();
  }
  function frame(now) {
    if (stopped) return;
    if (!root.isConnected) return stop();   // кабинет перешёл в другой раздел — освобождаем видеокарту
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || document.hidden) return;
    const c = CH[cur];
    if (hl) hl.obj.scale.copy(hl.s0);
    if (playing && t < 1) { t = Math.min(1, t + dt / c.dur); if (t >= 1 && !c.loop) setPlay(false); if (t >= 1 && c.loop) t = 0; }
    seek.value = Math.round(t * 1000);
    S.labels = []; S.cap = '';
    c.pose(t, S, dt);
    if (c.live) c.live(dt, S);
    if (hl) { hl.s0.copy(hl.obj.scale); const k = 1 + 0.06 * Math.sin((now - hl.t0) * 0.01) * Math.exp(-(now - hl.t0) / 2500); hl.obj.scale.multiplyScalar(k); }
    stepFly(now);
    if (S.follow && !fly) { const f = W(...S.follow); const d = f.clone().sub(controls.target); controls.target.add(d.multiplyScalar(0.08)); camera.position.add(d); }
    controls.update();
    sun.position.copy(controls.target).add(new THREE.Vector3(-260, 520, 300)); sun.target.position.copy(controls.target);
    capEl.hidden = !S.cap; if (S.cap && capEl.innerHTML !== S.cap) capEl.innerHTML = S.cap;
    renderer.render(scene, camera);
    drawLabels(); drawSpots(); placeInfo();
  }
  camera.position.copy(W(240, -260, 170)); controls.target.copy(W(0, 0, 5));
  loadDone(); resize(); go(savedChap());
  requestAnimationFrame(frame);
  return { go, stop };
}

// ======================= Тексты и сценарии глав: наша машинка =======================
const L = (p, text, cls, obj) => ({ p, text, cls, obj });
const A = (what, why, how, real, fact) => [['🔍 Что это', what], ['🎯 Зачем', why], ['💡 Почему так', how], ['🚗 В настоящей машине', real], ['✨ Интересно', fact]];

// 1. Обзор
ch({
  ico: '🚗', short: 'Целиком', title: 'Машинка-испытатель целиком', dur: 14, cam: [[260, -300, 190], [0, 0, 0]], box: [[-80, -76, -25], [82, 76, 32]],
  spots: ['plate', 'block', 'brg', 'shaft', 'wheel', 'screw', 'cap', 'coin'],
  lead: 'Это машинка из курса «Колесо». Мотора у неё нет — её разгоняет горка из книг. <b>Нажимай на светящиеся точки</b> — узнаешь, что есть что.',
  more: A('Плита, четыре корпуса с подшипниками, два стальных вала, четыре колеса, винты, колпачки и монеты-груз.',
    'Это не игрушка, а <b>испытательный стенд</b>: три заезда с одной горки должны получиться почти одинаковыми. Тогда видно, какое колесо лучше, а не кому повезло.',
    'Всё сделано так, чтобы убрать случайности: настоящие подшипники, стальные валы, зазоры подобраны заранее.',
    'Новые машины тоже сначала испытывают на моделях и стендах: в аэродинамической трубе, на вибростенде, в краш-тесте.'),
  pose(t, S) {
    S.car.rotation.z = t * Math.PI * 2 * 0.5;
    const a = S.axles[0], sd = a.userData.sides[1];
    const list = [
      L([-20, -30, 19.5], 'Плита — шасси', '', S.car), L([50, 39.5, 14], 'Корпус подшипника', '', S.car), L([0, 37.5, 4.5], 'Подшипник 684ZZ', '', sd.wh.parent),
      L([0, 0, 2], 'Вал Ø4 × 150 мм', '', a), L([25, 13, 0], 'Колесо Ø50', '', sd.wh), L([10, 5.5, 0], 'Установочный винт M3', '', sd.wh),
      L([0, 18.5, 0], 'Колпачок', '', sd.cp), L([-30, 14, 31], 'Гнёзда для груза', '', S.car),
    ];
    S.labels = list.filter((_, i) => t > 0.05 + i * 0.07);
  },
});

// 2. Шасси: база, колея, клиренс, центр тяжести
const CG = { rear: 1, front: 1 };
function cgOf() { const m0 = 175, mc = 6.2, nR = CG.rear * 2, nF = CG.front; const m = m0 + mc * (nR + nF); const x = (m0 * 2 + mc * (nR * -30 + nF * 10)) / m; return { m, x, rear: (50 - x) / 100 }; }
const coinsIco = (n) => n ? Array.from({ length: n }, () => '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#d6b25a" stroke="#8a6d1f"/></svg>').join('') : '0';
ch({
  ico: '📐', short: 'Шасси', title: 'Шасси и центр тяжести', dur: 7, cam: [[150, -360, 260], [10, 0, -10]], box: [[-82, -90, -25], [100, 76, 34]],
  spots: ['plate', 'coin'],
  lead: 'Плита — это <b>шасси</b>: она соединяет оси и держит груз. Добавляй монеты кнопками — смотри, куда сдвинется <b>центр тяжести</b> (чёрно-белый значок).',
  more: A('<b>Колёсная база</b> — расстояние между осями, 100 мм. <b>Колея</b> — между левым и правым колесом, 106 мм. <b>Клиренс</b> — от днища до дороги, 18 мм.',
    'Монеты прижимают колёса к дороге и сдвигают центр тяжести — точку, где как будто собран весь вес.',
    'Корпуса стоят на двух штырьках: на одном могли бы повернуться. Монеты по 10 ₽ весят одинаково и есть у всех — удобный груз.',
    'У легковой машины база 2,5–2,8 м, колея около 1,5 м. Длинная база — ровнее едет по прямой, широкая колея — устойчивее в повороте.'),
  ui: () => `<div class="dk-g"><span class="dk-l">Монеты сзади</span><div class="dk-step" data-k="rear"><button type="button" data-d="-1" aria-label="Меньше">−</button><span></span><button type="button" data-d="1" aria-label="Больше">+</button></div></div>
    <div class="dk-g"><span class="dk-l">Монеты спереди</span><div class="dk-step" data-k="front"><button type="button" data-d="-1" aria-label="Меньше">−</button><span></span><button type="button" data-d="1" aria-label="Больше">+</button></div></div><p class="dk-out" id="cgOut"></p>`,
  bind(el) {
    const upd = () => { el.querySelectorAll('.dk-step').forEach((s) => (s.querySelector('span').innerHTML = coinsIco(CG[s.dataset.k]))); const c = cgOf(); el.querySelector('#cgOut').innerHTML = `Центр тяжести ${Math.abs(c.x) < 0.5 ? '<b>посередине</b>' : `<b>ближе к ${c.x < 0 ? 'задней' : 'передней'} оси</b> на ${nf(Math.abs(c.x), 0)} мм`} · на задние колёса — <b>${Math.round(c.rear * 100)} %</b> веса <small>· масса ≈ ${Math.round(c.m)} г</small>`; };
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; const k = b.closest('[data-k]').dataset.k; CG[k] = clamp(CG[k] + +b.dataset.d, 0, 4); upd(); });
    upd();
  },
  pose(t, S) {
    S.setCoins([CG.rear, CG.rear, CG.front]);
    S.dimLines.visible = true;
    if (!S.dimLines.children.length) {
      S._dims = [S.dim([-50, -75, -25], [50, -75, -25], 'база 100 мм', [0, -8, 0]), S.dim([90, -53, -25], [90, 53, -25], 'колея 106 мм', [8, 0, 0]), S.dim([-50, -80, -7], [-50, -80, -25], 'клиренс 18 мм', [0, -6, 0])];
    }
    const c = cgOf();
    S.labels = S._dims.filter((_, i) => t > 0.15 + i * 0.25).concat([L([c.x, 0, 21 + 10], `центр тяжести`, 'cg')]);
  },
});

// 3. Подшипник
const BR = { bush: false };
ch({
  ico: '⚙️', short: 'Подшипник', title: 'Подшипник: катится, а не трётся', dur: 12, cam: [[150, 250, 160], [0, 0, 0]], box: [[-42, -60, -42], [42, 75, 42]],
  spots: (S) => (BR.bush ? ['bush', 'shaft'] : ['ring_o', 'ring_i', 'balls', 'shield', 'shaft']),
  lead: 'Подшипник — то, на чём крутится колесо. Внутри стальные <b>шарики</b>: они катятся, а не трутся. Переключи на «втулку» и сравни.',
  more: A('Два кольца и семь шариков между ними. Наружное кольцо стоит в корпусе, внутреннее крутится вместе с валом. По бокам — защитные шайбы.',
    'Шарики <b>катятся</b> — это трение качения, оно в десятки раз меньше, чем трение скольжения. Во втулке вал трётся о пластик всей поверхностью.',
    'Готовый стальной подшипник каждый раз крутится одинаково, а пластик по стали — каждый раз по-разному.',
    'В колесе автомобиля стоит <b>ступичный подшипник</b>: больше нашего, но устроен так же. Всего в машине больше сотни подшипников.',
    '684ZZ значит: внутри 4 мм, снаружи 9 мм, ZZ — две металлические шайбы. Шариковые подшипники рисовал ещё Леонардо да Винчи.'),
  ui: () => `<div class="dk-g"><span class="dk-l">Что внутри</span><div class="dk-o"><button type="button" class="dk-b" data-v="0">⚙️ Подшипник</button><button type="button" class="dk-b" data-v="1">🟫 Втулка</button></div></div><p class="dk-out" id="brOut"></p>`,
  bind(el, S) {
    const upd = () => { el.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', +b.dataset.v === +BR.bush)); el.querySelector('#brOut').innerHTML = BR.bush ? 'Вал трётся о пластик: <b>скольжение</b>. Колесо крутится недолго.' : 'Шарики катятся: <b>качение</b>. Толкни колесо — крутится долго.'; };
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; BR.bush = b.dataset.v === '1'; upd(); S.respot && S.respot(); }); upd();
  },
  setup(S) { S.car.visible = false; S.bigBrg.visible = true; S._spin = 0; },
  pose(t, S, dt) {
    const u = S.bb.userData; S.bb.visible = !BR.bush; S.bush.visible = BR.bush;
    S._spin += dt * (BR.bush ? 1.2 : 4.5);
    u.inner.rotation.y = S._spin; S.bigShaft.rotation.y = S._spin; u.balls.rotation.y = S._spin * 0.4;
    u.balls.children.forEach((b) => (b.rotation.y = -S._spin * 2.6));
    const open = seg(t, 0.25, 0.45); u.shOut.position.y = 3.75 + open * 6; u.shOut.visible = open < 0.99;
    S.labels = BR.bush ? [L([0, 0, 4.6], 'Втулка: вал трётся', 'hot', S.bigBrg)] : [
      L([-4.5, -1, 0], 'Наружное кольцо', '', S.bigBrg), L([0, 2.1, -2.4], 'Внутреннее кольцо', '', S.bigBrg),
      ...(t > 0.45 ? [L([3.2, 0.2, 0], 'Шарики катятся', 'hot', S.bigBrg)] : []), L([0, 8.2, 0], 'Вал Ø4', '', S.bigBrg),
    ];
    S.cap = t < 0.25 ? 'Подшипник 684ZZ' : t < 0.45 ? 'Снимаем защитную шайбу…' : 'Шарики катятся между кольцами';
  },
});

// 4. Линейка посадок
const FIT = { part: 'shaft', i: 5, anim: 0 };
const FIT_PRINT = 0.2;   // наш принтер печатает отверстия на ~0,2 мм меньше
function fitVerdict(part, d) {
  const real = d - FIT_PRINT;
  if (part === 'shaft') { const g = real - 4; return g < -0.01 ? ['no', 'не входит'] : g < 0.05 ? ['snug', 'плотно — так сидят колпачки'] : g < 0.2 ? ['gap', 'с небольшим зазором'] : g < 0.29 ? ['free', 'свободно — так сидит колесо'] : ['loose', 'болтается']; }
  if (part === 'brg') return d < 9.04 ? ['no', 'не входит'] : d < 9.15 ? ['hard', 'только с силой — корпус может треснуть'] : ['tight', 'вдавливается пальцем и держится сам — так и надо'];
  return d < 4.15 ? ['no', 'не входит'] : d < 4.25 ? ['hard', 'очень туго'] : d < 4.35 ? ['snug', 'плотно — так корпуса держатся в плите'] : ['free', 'снимается легко'];
}
ch({
  ico: '📏', short: 'Плашка', title: 'Пробная плашка: что куда войдёт', dur: 3, cam: [[30, -110, 120], [5, 0, -25]], box: [[-38, -26, -25], [58, 26, 0]],
  spots: ['ladder'],
  lead: 'Перед тем как печатать машинку, печатаем маленькую плашку с отверстиями разного размера. Выбери деталь и отверстие — посмотри, войдёт ли.',
  more: A('Три ряда отверстий с шагом 0,05 мм: под вал, под подшипник и под штырёк.',
    'Каждый принтер печатает чуть по-своему: отверстия выходят меньше, чем нарисованы. Для машинки это решает всё — подшипник или не влезет, или выпадет.',
    'Между «болтается» и «не входит» всего 0,2–0,3 мм. Поэтому шаг такой мелкий.',
    'На заводе отверстия проверяют <b>калибром-пробкой</b>: один конец должен войти, другой — нет.',
    'У нас подшипник 9 мм подошёл в гнездо 9,20. Значит, наш принтер делает отверстия примерно на 0,2 мм меньше.'),
  ui: () => `<div class="dk-g"><span class="dk-l">Что примеряем</span><div class="dk-o"><button type="button" class="dk-b" data-p="shaft">Вал Ø4</button><button type="button" class="dk-b" data-p="brg">Подшипник Ø9</button><button type="button" class="dk-b" data-p="peg">Штырёк Ø4</button></div></div><div class="dk-g"><span class="dk-l">Отверстие, мм</span><div class="dk-o" id="fitSizes"></div></div><p class="dk-out" id="fitOut"></p>`,
  bind(el) {
    const upd = () => {
      el.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === FIT.part));
      const L2 = LADDER[FIT.part]; FIT.i = Math.min(FIT.i, L2.sizes.length - 1);
      el.querySelector('#fitSizes').innerHTML = L2.sizes.map((d, i) => `<button type="button" class="dk-b${i === FIT.i ? ' on' : ''}" data-i="${i}">${nf(d)}</button>`).join('');
      const d = L2.sizes[FIT.i], [k, txt] = fitVerdict(FIT.part, d);
      el.querySelector('#fitOut').innerHTML = `<span class="big v-${k}">${txt[0].toUpperCase() + txt.slice(1)}.</span> <small>Нарисовано ${nf(d)} мм → принтер напечатает ≈ ${nf(d - FIT_PRINT)} мм.</small>`;
      FIT.anim = 0;
    };
    el.addEventListener('click', (e) => { const p = e.target.closest('[data-p]'), b = e.target.closest('[data-i]'); if (p) { FIT.part = p.dataset.p; FIT.i = FIT.part === 'brg' ? 5 : FIT.part === 'peg' ? 2 : 5; } else if (b) FIT.i = +b.dataset.i; else return; upd(); });
    upd();
  },
  setup(S) { S.car.visible = false; S.lad.visible = true; FIT.anim = 0; },
  pose(t, S, dt) {
    FIT.anim += dt;
    const L2 = LADDER[FIT.part], x = L2.x0 + FIT.i * L2.dx, y = L2.row, d = L2.sizes[FIT.i], [k] = fitVerdict(FIT.part, d);
    Object.entries(S.probe).forEach(([n, p]) => (p.visible = n === FIT.part));
    const p = S.probe[FIT.part], a = FIT.anim;
    const over = seg(a, 0, 0.6), down = k === 'no' ? 0 : seg(a, 0.7, k === 'hard' || k === 'tight' ? 2.2 : 1.3) * (k === 'hard' ? 0.55 : 1);
    const [zTop, zIn] = { shaft: [22, 17], brg: [5.05, 1], peg: [14.05, 9] }[FIT.part], z0 = zTop + 30;
    let z = lerp(z0, zTop, over); if (a > 0.7) z = lerp(zTop, zIn, down);
    p.position.set(lerp(x + 20, x, over), lerp(y - 20, y, over), z - 25);
    const shake = k === 'no' && a > 0.7 && a < 1.3 ? Math.sin(a * 60) * 0.6 : 0;
    p.position.x += shake;
    p.rotation.set(k === 'loose' && a > 1.3 ? Math.sin(a * 7) * 0.05 : 0, k === 'loose' && a > 1.3 ? Math.cos(a * 5) * 0.05 : 0, 0);
    S.labels = [];
    for (const [kk, L3] of Object.entries(LADDER)) L3.sizes.forEach((dd, i) => S.labels.push(L([L3.x0 + i * L3.dx, L3.row + (kk === 'brg' ? 7.2 : 4.8), -19.9], kk === 'brg' ? nf(dd) : String(Math.round((dd - 4) * 100)), 'tiny' + (kk === FIT.part && i === FIT.i ? ' sel' : ''))));
    S.cap = 'Дальний ряд — вал · средний — подшипник · ближний — штырёк';
  },
});

// 5. Корпус подшипника
ch({
  ico: '🧱', short: 'Корпус', title: 'Корпус подшипника', dur: 11, cam: [[38, 74, 40], [0, 36, 2]], box: [[-12, 32, -10], [14, 44, 18]], tags: true,
  spots: ['block', 'brg'],
  lead: 'Корпус держит подшипник. Подшипник вдавливается в гнездо <b>туго</b> — и держится сам. Такая посадка называется «с натягом».',
  more: A('Снаружи — гнездо под подшипник, за ним ступенька-<b>упор</b>. Сверху два штырька для плиты, сбоку — ушко для стопора.',
    'Наружное кольцо подшипника должно стоять намертво: если оно болтается, колесо «гуляет».',
    'Вал проходит сквозь корпус и <b>нигде не касается пластика</b>: всё вращение — только в подшипнике.',
    'Ступичный подшипник автомобиля тоже запрессован — его вдавливают прессом с силой в несколько тонн.'),
  ui: () => `<div class="dk-g"><span class="dk-l">Разрез</span><div class="dk-o"><button type="button" class="dk-b on" data-cut="1">🔪 Показать внутри</button><button type="button" class="dk-b" data-cut="0">Целиком</button></div></div>`,
  bind(el, S) { S._cut = true; el.addEventListener('click', (e) => { const b = e.target.closest('[data-cut]'); if (!b) return; S._cut = b.dataset.cut === '1'; el.querySelectorAll('[data-cut]').forEach((q) => q.classList.toggle('on', q === b)); }); },
  setup(S) {
    S.pl.visible = false; S.coins.forEach((c) => (c.visible = false)); S.axles[1].visible = false;
    const a = S.axles[0]; a.userData.shaft.visible = false; const sd = a.userData.sides;
    [sd[-1].bl, sd[-1].br, sd[-1].wh, sd[-1].cp, sd[1].wh, sd[1].cp].forEach((o) => (o.visible = false));
    S.car.position.x = -50;
  },
  pose(t, S) {
    const sd = S.axles[0].userData.sides[1];
    const press = seg(t, 0.1, 0.42), lastMm = seg(t, 0.42, 0.55);
    sd.br.position.y = 35.5 + 30 * (1 - press) + 1.2 * (1 - lastMm);
    clipPlanes.length = 0; if (S._cut && t > 0.58) clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0));
    const o = S.axles[0];
    const cut = S._cut && t > 0.58;
    S.labels = t < 0.58 ? [L([0, 39.5, 9], t < 0.42 ? 'Подшипник входит в гнездо…' : 'Последний миллиметр — с усилием', 'hot', o)] : [
      L([4.6, 37.5, 0], '1 · гнездо — натяг', '', o), L([-3.9, 35.4, 0], '2 · упор', '', o), L([-3.2, 33.5, 0], '3 · вал не касается', '', o),
      ...(cut ? [] : [L([7, 36, 18.6], 'два штырька', '', o)]),
    ];
    S.cap = t < 0.1 ? 'Корпус подшипника' : t < 0.55 ? 'Вдавливаем подшипник пальцем до упора' : 'Корпус в разрезе';
  },
  leave() { clipPlanes.length = 0; },
});

// 6. Колесо
ch({
  ico: '🛞', short: 'Колесо', title: 'Колесо, гайка и винт', dur: 13, cam: [[100, 40, 90], [0, 45, 0]], box: [[-26, 22, -26], [26, 60, 26]],
  spots: ['wheel', 'hole', 'nut', 'screw'],
  lead: 'Колесо надевается на вал. Чтобы оно не проворачивалось, сбоку в ступицу вкручивается <b>винт</b> — он упирается в вал.',
  more: A('Середина колеса — <b>ступица</b>. В её паз вставляется гайка, а в гайку вкручивается установочный винт.',
    'Отверстие колеса чуть больше вала — колёса легко менять. Винт убирает этот зазор.',
    'Резьба в пластике быстро стирается, а металлическая гайка — нет. Паз шестигранный, поэтому гайка не крутится. Винт сначала вкручиваем всего на 2–3 оборота, иначе колесо не наденется.',
    'Колесо автомобиля держат 4–5 болтов. Их затягивают <b>крест-накрест</b>, чтобы колесо село ровно.'),
  setup(S) {
    S.pl.visible = false; S.coins.forEach((c) => (c.visible = false)); S.axles[1].visible = false;
    const sd = S.axles[0].userData.sides; [sd[-1].bl, sd[-1].br, sd[-1].wh, sd[-1].cp, sd[1].bl, sd[1].br, sd[1].cp].forEach((o) => (o.visible = false));
    S.car.position.x = -50;
  },
  pose(t, S) {
    const a = S.axles[0], wh = a.userData.sides[1].wh, u = wh.userData;
    u.nut.position.y = 5.5 - 22 * (1 - seg(t, 0.05, 0.3));
    const turn = seg(t, 0.35, 0.55), tight = seg(t, 0.82, 0.95);
    u.screw.position.x = lerp(lerp(16, 4.5, turn), 2, tight); u.screw.rotation.x = -(turn * 2.5 + tight * 1) * Math.PI * 2;
    a.userData.shaft.position.y = lerp(142, 30, seg(t, 0.58, 0.8));
    a.userData.shaft.visible = t > 0.56;
    S.labels = [
      L([0, 9.5, 7.3], 'ступица', '', wh), L([25, 14, 0], 'канавка под «шину»', '', wh),
      ...(t > 0.08 && t < 0.33 ? [L([4.1, 3, 2], 'гайка — в паз', 'hot', wh)] : []),
      ...(t > 0.35 && t < 0.56 ? [L([10, 5.5, 2.6], 'винт — на 2–3 оборота', 'hot', wh)] : []),
      ...(t > 0.82 ? [L([10, 5.5, 2.6], 'винт упёрся в вал', 'hot', wh)] : []),
    ];
    S.cap = t < 0.33 ? '1. Гайка — в паз ступицы' : t < 0.56 ? '2. Винт — сбоку, не до конца' : t < 0.82 ? '3. Колесо — на вал' : '4. Затягиваем винт';
  },
});

// 7. Разрез узла
const HEART = { loose: false };
ch({
  ico: '🔬', short: 'Разрез', title: 'Заглянем внутрь: разрез узла', dur: 12, cam: [[60, 46, 118], [50, 46, 0]], box: [[26, 30, -26], [76, 60, 6]],
  spots: ['brg', 'block', 'wheel', 'screw', 'shaft'],
  lead: 'Разрежем угол машинки вдоль вала. Цифры — места, где детали сидят туго или с зазором. Ослабь винт — увидишь <b>люфт</b>.',
  more: [['📋 Что значат цифры', '<ol><li><b>Натяг:</b> подшипник туго сидит в гнезде.</li><li><b>Упор:</b> ступенька, дальше подшипник не уйдёт.</li><li><b>Зазор:</b> вал не касается корпуса.</li><li><b>Бобышка</b> давит только на внутреннее кольцо.</li><li><b>Зазор</b> колесо — вал: колёса легко менять.</li><li><b>Винт</b> убирает этот зазор.</li></ol>'],
    ['🎯 Почему подшипник не выпадает', 'Его держат сразу три вещи: натяг в гнезде, упор изнутри и колесо снаружи.'],
    ['🚗 В настоящей машине', 'Механик качает колесо руками: если шевелится — изношен подшипник. А у руля небольшой люфт разрешён — до 10°.'],
    ['✨ Интересно', 'Внутри самого подшипника тоже есть крошечный зазор — тысячные доли миллиметра. Без него шарики заклинило бы от нагрева.']],
  ui: () => `<div class="dk-g"><span class="dk-l">Винт</span><div class="dk-o"><button type="button" class="dk-b on" data-l="0">🔩 Затянут</button><button type="button" class="dk-b" data-l="1">🪛 Ослаблен</button></div></div><p class="dk-out" id="looseOut"></p>`,
  bind(el) {
    HEART.loose = false;
    const upd = () => { el.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('on', +b.dataset.l === +HEART.loose)); el.querySelector('#looseOut').innerHTML = HEART.loose ? '<span class="v-loose">Люфт!</span> Колесо ездит вдоль вала — машинку уводит вбок.' : 'Колесо прижато к подшипнику — люфта нет.'; };
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (!b) return; HEART.loose = b.dataset.l === '1'; upd(); }); upd();
  },
  setup(S) { S.axles[1].visible = false; S.pl.visible = false; S.coins.forEach((c) => (c.visible = false)); S._a = 0; },
  pose(t, S, dt) {
    clipPlanes.length = 0; clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.01));
    const a = S.axles[0], sd = a.userData.sides[1];
    S._a += dt * 1.6; S.roll(S._a);
    const shift = HEART.loose ? Math.sin(S._a * 2.2) * 1.4 + 1.4 : 0;
    sd.wh.position.y = 39.5 + shift; sd.cp.position.y = 57 + shift;
    sd.wh.userData.screw.position.x = HEART.loose ? 4 : 2;
    const n = [L([4.6, 37.5, 0], '1', 'n'), L([-3.9, 35.4, 0], '2', 'n'), L([-2.7, 33.6, 0], '3', 'n'), L([-2.5, 40.4 + (HEART.loose ? 1.4 : 0), 0], '4', 'n'), L([-2.15, 49, 0], '5', 'n'), L([5, 45 + (HEART.loose ? 1.4 : 0), 0], '6', 'n')];
    S.labels = n.filter((_, i) => t > 0.1 + i * 0.12).map((l) => ({ ...l, obj: a }));
    S.cap = HEART.loose ? 'Винт ослаблен — колесо ездит вдоль вала' : '1 натяг · 2 упор · 3 зазор · 4 бобышка · 5 зазор · 6 винт';
  },
  leave() { clipPlanes.length = 0; },
});

// 8. Сборка оси
ch({
  ico: '🔧', short: 'Сборка', title: 'Собираем ось по шагам', dur: 16, cam: [[150, -170, 120], [50, 0, 0]], box: [[24, -80, -26], [76, 80, 26]],
  spots: ['brg', 'shaft', 'wheel', 'cap'],
  lead: 'Собираем ось: подшипники → вал → колёса → винты → колпачки. Каждый шаг не мешает следующему.',
  more: [['📋 По шагам', '<ol><li><b>Подшипники — в корпуса.</b> Вдавливаем пальцем до упора.</li><li><b>Вал — через корпуса.</b> Крутится от лёгкого касания.</li><li><b>Колёса — ступицей к корпусу.</b></li><li><b>Затягиваем винты.</b> Плотно, но без силы.</li><li><b>Колпачки</b> — на концы вала.</li><li><b>Проверка:</b> крутится долго и вдоль не болтается.</li></ol>'],
    ['💡 Почему вал стальной', 'Пластиковый пруток гнётся и не бывает идеально круглым — колесо «восьмерило» бы.'],
    ['🚗 На заводе', 'Каждый узел проверяют сразу после сборки: ошибку проще найти на одной оси, чем на готовой машине.'],
    ['✨ Ось или вал?', 'Ось только держит колёса и сама не крутится — как у телеги. Вал крутится вместе с колёсами. Наш пруток — вал.']],
  setup(S) { S.axles[1].visible = false; S.pl.visible = false; S.coins.forEach((c) => (c.visible = false)); },
  pose(t, S) {
    const a = S.axles[0], P = [seg(t, 0.02, 0.18), seg(t, 0.22, 0.42), seg(t, 0.46, 0.66), seg(t, 0.68, 0.76), seg(t, 0.78, 0.9)];
    for (const s of [1, -1]) {
      const { bl, br, wh, cp } = a.userData.sides[s];
      bl.position.y = s * 0; br.position.y = s * (35.5 + 30 * (1 - P[0]));
      wh.position.y = s * (39.5 + 60 * (1 - P[2])); wh.visible = t > 0.44;
      wh.userData.screw.position.x = lerp(4.5, 2, P[3]); wh.userData.screw.rotation.x = -P[3] * Math.PI * 2;
      cp.position.y = s * (57 + 40 * (1 - P[4])); cp.visible = t > 0.77;
    }
    a.userData.shaft.position.y = -200 * (1 - P[1]); a.userData.shaft.visible = t > 0.2;
    if (t > 0.92) S.roll((t - 0.92) * 60);
    S.cap = t < 0.2 ? '1. Подшипники — в корпуса' : t < 0.44 ? '2. Вал — через оба корпуса' : t < 0.67 ? '3. Колёса — ступицей к корпусу' : t < 0.77 ? '4. Затягиваем винты' : t < 0.91 ? '5. Колпачки' : '6. Проверка: крутится долго';
  },
});

// 9. Плита и груз
ch({
  ico: '🪙', short: 'Плита', title: 'Плита и груз', dur: 10, cam: [[200, -230, 190], [0, 0, 10]], box: [[-80, -76, -25], [82, 76, 60]],
  spots: ['plate', 'coin', 'block'],
  lead: 'Кладём плиту на две готовые оси, а в гнёзда — монеты-груз. Машинка готова к испытаниям!',
  more: A('Штырьки корпусов входят в отверстия снизу плиты плотно: машинку можно поднять, и ничего не выпадет.',
    'Груз прижимает колёса к дороге. Обе оси одинаковые — любую можно поставить спереди или сзади.',
    '<b>Проверка:</b> с горки из трёх книг машинка проезжает больше 1,5 м и уходит вбок меньше чем на 20 см.',
    'Если машину уводит вбок, в автосервисе выставляют колёса на стенде <b>развала-схождения</b>. А ещё у настоящей машины есть подвеска — пружины между колёсами и кузовом.'),
  pose(t, S) {
    S.pl.position.z = 70 * (1 - seg(t, 0.05, 0.38));
    const n = Math.floor(clamp((t - 0.45) / 0.45) * 6.999);
    const per = [Math.min(n, 2), Math.min(Math.max(n - 2, 0), 2), Math.min(Math.max(n - 4, 0), 2)];
    S.setCoins(per);
    S.labels = t < 0.42 ? [L([57, 36, 18.6], 'штырёк входит плотно', 'hot', S.car)] : [L([-30, 14, 31], 'монеты-груз', '', S.car)];
    S.cap = t < 0.42 ? 'Плита ложится на штырьки корпусов' : 'Монеты — в гнёзда';
  },
});

// 10. Сцепление: наклонная доска
const TIRES = { '': ['Гладкое', 0.26, 'Твёрдый скользкий пластик.'], tape: ['Скотч', 0.33, 'Плёнка чуть мягче, но снаружи гладкая.'], etape: ['Изолента', 0.58, 'Мягкая и чуть липкая — почти шина.'], band: ['Резинка', 0.74, 'Настоящая резина.'] };
const GRIP = { tire: '', ang: 8, auto: false, slide: 0, v: 0, res: {} };
ch({
  ico: '🧲', short: 'Сцепление', title: 'Опыт: какое колесо лучше держит дорогу', dur: 1, cam: [[60, -1250, 420], [0, 0, 140]], box: [[-320, -100, -25], [380, 100, 260]],
  spots: ['pin', 'tire', 'board', 'book'],
  lead: 'Выбери «шину» и нажми «Поднимать». Доска наклоняется, пока машинка не поедет. <b>Чем круче доска, тем лучше колесо держит дорогу.</b>',
  more: A('Колёса заблокированы <b>стопором</b>: не крутятся, машинка может только скользить. Поднимаем край доски, пока она не поехала.',
    'Чем выше поднялась доска — тем лучше <b>сцепление</b>. Для старших: h ÷ d — это коэффициент трения.',
    '«Хорошо катится» и «хорошо держит дорогу» — разные вещи. Сцепление нужно, чтобы тронуться, затормозить и повернуть.',
    'Колесо, которое катится, держит дорогу лучше скользящего — поэтому у машин есть <b>АБС</b>. Зимние шины мягче летних, чтобы не дубеть на морозе.',
    'У «Формулы-1» в сухую погоду шины совсем без рисунка — <b>слики</b>. Держит их очень мягкая горячая резина.'),
  ui: () => `<div class="dk-g"><span class="dk-l">1. Выбери колёса</span><div class="dk-o" id="gripT">${Object.entries(TIRES).map(([k, v]) => `<button type="button" class="dk-b" data-t="${k}">${icoTire(k)}${v[0]}</button>`).join('')}</div></div>
    <div class="dk-g"><span class="dk-l">2. Поднимай доску</span><div class="dk-o"><button type="button" class="dk-go" id="gripGo">⬆ Поднимать</button><button type="button" class="dk-b" id="gripReset">↺ Опустить</button></div></div>
    <div class="dk-g"><span class="dk-l">или сам: угол <b id="gripA"></b></span><div class="dk-range"><input type="range" id="gripR" min="0" max="45" step="0.5" aria-label="Угол доски"></div></div>
    <p class="dk-out" id="gripOut"></p><ul class="dk-bars" id="gripTbl"></ul>`,
  bind(el, S) {
    GRIP.slide = 0; GRIP.v = 0; GRIP.auto = false; GRIP.ang = 8;
    const R = el.querySelector('#gripR');
    S._gripUi = () => {
      el.querySelectorAll('#gripT button').forEach((b) => b.classList.toggle('on', b.dataset.t === GRIP.tire));
      R.value = GRIP.ang; el.querySelector('#gripA').textContent = nf(GRIP.ang, 1) + '°';
      const h = 600 * Math.sin((GRIP.ang * Math.PI) / 180);
      el.querySelector('#gripOut').innerHTML = GRIP.slide > 0 ? `<span class="big v-loose">Поехала!</span> Край доски поднят на <b>${nf(h / 10, 1)} см</b>.` : GRIP.auto ? `Поднимаем… <b>${nf(h / 10, 1)} см</b>` : `${TIRES[GRIP.tire][2]} Нажми «Поднимать».`;
      const rs = Object.entries(TIRES).filter(([k]) => GRIP.res[k]);
      el.querySelector('#gripTbl').innerHTML = rs.map(([k, v]) => { const r = GRIP.res[k], m = r.reduce((a, b) => a + b, 0) / r.length, hh = 60 * Math.sin((m * Math.PI) / 180); return `<li><span>${icoTire(k)} ${v[0]}</span><i style="width:${Math.min(100, (hh / 36) * 100).toFixed(0)}%"></i><b>${nf(hh, 1)} см</b></li>`; }).join('');
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (b) { GRIP.tire = b.dataset.t; S.setTire(GRIP.tire); GRIP.slide = 0; GRIP.v = 0; GRIP.ang = 8; GRIP.auto = false; }
      if (e.target.closest('#gripGo')) { GRIP.slide = 0; GRIP.v = 0; GRIP.ang = Math.min(GRIP.ang, 8); GRIP.auto = true; }
      if (e.target.closest('#gripReset')) { GRIP.slide = 0; GRIP.v = 0; GRIP.ang = 8; GRIP.auto = false; }
      S._gripUi();
    });
    R.oninput = () => { GRIP.ang = +R.value; GRIP.auto = false; if (GRIP.slide > 0 && GRIP.ang < 3) { GRIP.slide = 0; GRIP.v = 0; } S._gripUi(); };
    S.setTire(GRIP.tire); S._gripUi();
  },
  setup(S) {
    S.tilt.visible = true; S.books.visible = true; S.tilt.add(S.car); S.tilt.position.set(-300, 0, -17);
    for (const ax of S.axles) for (const s of [1, -1]) { const w = ax.userData.sides[s].wh; w.rotation.y = Math.PI / 4; w.userData.pin.visible = ax.position.x < 0; w.userData.pin.position.set(10 * Math.cos(Math.PI / 4), 0, 10 * Math.sin(Math.PI / 4)); }
    S.setCoins([2, 2, 2]);
  },
  leave(S) { S.world.add(S.car); S.setTire(''); },
  pose(t, S, dt) {
    const mu = TIRES[GRIP.tire][1] * (1 + 0.04 * Math.sin(GRIP.tire.length * 7 + (GRIP.res[GRIP.tire] || []).length * 2.3));
    if (GRIP.auto && GRIP.slide === 0) { GRIP.ang = Math.min(45, GRIP.ang + dt * 3); }
    const th = (GRIP.ang * Math.PI) / 180;
    if (GRIP.slide === 0 && Math.tan(th) > mu) {
      GRIP.slide = 0.001; GRIP.v = 0;
      if (GRIP.auto) { (GRIP.res[GRIP.tire] ??= []).push(GRIP.ang); if (GRIP.res[GRIP.tire].length > 3) GRIP.res[GRIP.tire].shift(); }
      GRIP.auto = false; S._gripUi && S._gripUi();
    }
    if (GRIP.slide > 0 && GRIP.slide < 470) { const a = 9810 * (Math.sin(th) - mu * 0.85 * Math.cos(th)) * 0.35; GRIP.v = Math.max(0, GRIP.v + a * dt); GRIP.slide = Math.min(470, GRIP.slide + GRIP.v * dt); }
    if (GRIP.auto && S._gripUi && Math.random() < 0.2) S._gripUi();
    S.tilt.rotation.y = -th;
    S.car.position.set(490 - GRIP.slide, 0, 25);
    const H = 600 * Math.sin(th), Hb = H + 8 - 8 * Math.cos(th), X = -300 + 600 * Math.cos(th) + 8 * Math.sin(th) + 75 - 6;
    S.books.children.forEach((b, i) => { const h = clamp(Hb - i * 30, 0, 30); b.visible = h > 0.5; b.scale.z = Math.max(h, 0.5) / 30; b.position.set(X, 0, -25 + i * 30 + h / 2); });
    S.labels = [L([-300 + 600 * Math.cos(th) + 30, -90, -25 + H / 2], `${nf(H / 10, 1)} см`, 'dim')];
    S.cap = `${TIRES[GRIP.tire][0]} колесо · угол ${nf(GRIP.ang, 1)}°`;
  },
});

// 11. Горка
const RUN = { books: 3, tire: '', brg: true, coins: 3, s: -1, v: 0, marks: [] };
const RAMP = 600;
function crr() { return (RUN.tire === 'etape' ? 0.038 : RUN.tire === 'band' ? 0.043 : RUN.tire === 'tape' ? 0.03 : 0.027) + (RUN.brg ? 0.012 * (175 / (175 + 6.2 * RUN.coins)) : 0.085); }
const booksIco = (n) => Array.from({ length: n }, (_, i) => `<svg viewBox="0 0 10 22" width="8" height="${12 + i * 3}" aria-hidden="true"><rect x="1" y="1" width="8" height="20" rx="1" fill="${COL.book[i % 5]}" stroke="#3a2313"/></svg>`).join('');
const FLAGC = ['#9a3a1b', '#4f6b2e', '#2f5d7c', '#8a6d1f', '#6e4b2c'];
ch({
  ico: '⛰️', short: 'Горка', title: 'Опыт: как далеко уедет машинка', dur: 1, cam: [[250, -1000, 420], [150, 0, 0]], box: [[-760, -140, -25], [160, 90, 150]],
  spots: ['book', 'board', 'coin'],
  lead: 'Настрой машинку и нажми <b>«Пустить с горки»</b>. Флажок покажет, где она остановилась. Меняй что-то одно — и сравнивай!',
  more: A('Доска 60 см лежит на книгах. Машинку пускают сверху без толчка и меряют, сколько она проехала по полу.',
    'Чем выше горка, тем больше запас энергии — и тем дальше уедет машинка. Без подшипников вал трётся о пластик — она быстро остановится.',
    '<b>Главное правило испытателя:</b> меняем только одну вещь за раз — иначе не поймём, что помогло.',
    'Поезд — сталь по стальному рельсу — катится очень легко, поэтому он такой экономичный. Шины с низким сопротивлением качению экономят топливо.'),
  ui: () => `<div class="dk-g"><span class="dk-l">Высота горки</span><div class="dk-step" data-k="books"><button type="button" data-d="-1" aria-label="Меньше книг">−</button><span id="runB"></span><button type="button" data-d="1" aria-label="Больше книг">+</button></div></div>
    <div class="dk-g"><span class="dk-l">Колёса</span><div class="dk-o" data-k="tire">${Object.entries(TIRES).map(([k, v]) => `<button type="button" class="dk-b" data-v="${k}">${icoTire(k)}${v[0]}</button>`).join('')}</div></div>
    <div class="dk-g"><span class="dk-l">Подшипники</span><div class="dk-o" data-k="brg"><button type="button" class="dk-b" data-v="1">✓ есть</button><button type="button" class="dk-b" data-v="0">✗ нет</button></div></div>
    <div class="dk-g"><span class="dk-l">Груз</span><div class="dk-step" data-k="coins"><button type="button" data-d="-1" aria-label="Меньше монет">−</button><span id="runC"></span><button type="button" data-d="1" aria-label="Больше монет">+</button></div></div>
    <div class="dk-g" style="align-self:end"><button type="button" class="dk-go" id="runGo">▶ Пустить с горки!</button></div>
    <p class="dk-out" id="runOut"></p><ul class="dk-bars" id="runList"></ul>`,
  bind(el, S) {
    const upd = () => {
      el.querySelectorAll('.dk-o[data-k]').forEach((s) => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(s.dataset.k === 'brg' ? +RUN.brg : RUN[s.dataset.k]) === b.dataset.v)));
      el.querySelector('#runB').innerHTML = `${booksIco(RUN.books)}&nbsp;${RUN.books * 3} см`; el.querySelector('#runC').innerHTML = `${RUN.coins} 🪙`;
      S.setCoins([Math.ceil(RUN.coins / 3), Math.ceil((RUN.coins - 1) / 3), Math.ceil((RUN.coins - 2) / 3)].map((x) => Math.max(0, x)));
      S.setTire(RUN.tire);
    };
    const list = () => { el.querySelector('#runList').innerHTML = RUN.marks.map((m, i) => `<li><span><b style="color:${FLAGC[(i + 1) % 5]}">⚑</b> ${m.desc}</span><i style="width:${Math.min(100, (m.d / 2500) * 100).toFixed(0)}%;background:${FLAGC[(i + 1) % 5]}"></i><b>${nf(m.d / 1000, 2)} м</b></li>`).join(''); };
    S._runOut = (html) => { el.querySelector('#runOut').innerHTML = html; list(); el.querySelector('#runGo').disabled = RUN.s >= 0 && !RUN.done; };
    el.addEventListener('click', (e) => {
      const st = e.target.closest('[data-d]');
      if (st) { const k = st.closest('[data-k]').dataset.k; RUN[k] = clamp(RUN[k] + +st.dataset.d, k === 'books' ? 1 : 0, k === 'books' ? 5 : 10); RUN.s = -1; upd(); S._runOut('Нажми «Пустить с горки!»'); return; }
      const b = e.target.closest('.dk-o[data-k] [data-v]');
      if (b) { const k = b.closest('[data-k]').dataset.k; RUN[k] = k === 'brg' ? b.dataset.v === '1' : b.dataset.v; RUN.s = -1; upd(); S._runOut('Нажми «Пустить с горки!»'); }
      if (e.target.closest('#runGo')) { RUN.s = 0; RUN.v = 0; RUN.done = false; S._runOut('Едет…'); }
    });
    upd(); S._runOut(RUN.marks.length ? 'Флажки — прошлые заезды.' : 'Нажми «Пустить с горки!»');
  },
  setup(S) { S.books.visible = true; S.tilt.visible = true; S.ruler.visible = true; S.flags.visible = true; S.tilt.add(S.car); RUN.s = -1; },
  leave(S) { S.world.add(S.car); S.setTire(''); },
  pose(t, S, dt) {
    const H = RUN.books * 30, a = Math.asin(H / RAMP), Lx = RAMP * Math.cos(a);
    S.tilt.position.set(-Lx, 0, -25 + H + 8 * Math.cos(a)); S.tilt.rotation.y = a;
    S.books.children.forEach((b, i) => { b.visible = i < RUN.books; b.scale.z = 1; b.position.set(-Lx - 75 + 6, 0, -25 + 15 + i * 30); });
    const S0 = 70, SB = RAMP - S0;
    if (RUN.s < 0) { S.car.position.set(70, 0, 25); S.tilt.add(S.car); }
    else {
      const g = 9810, c = crr();
      const drop = (Math.min(RUN.s, SB) / RAMP) * H, v2 = 2 * g * (drop - c * RUN.s);
      const v = RUN.s < 25 ? Math.max(Math.sqrt(Math.max(v2, 0)), 120) : Math.sqrt(Math.max(v2, 0));
      if (v <= 0.5 && RUN.s > 30) {
        if (!RUN.done) {
          RUN.done = true; const dist = Math.max(0, RUN.s - SB);
          RUN.marks.push({ d: dist, desc: `${RUN.books * 3} см · ${TIRES[RUN.tire][0].toLowerCase()} · ${RUN.brg ? 'подшипники' : 'без подшипников'} · ${RUN.coins} 🪙` });
          const f = new THREE.Group(); const pole = mesh(cylZ(1.5, 60, 8), MAT.dark, 0); pole.position.z = 5; const fl = mesh(new THREE.BoxGeometry(24, 1, 14), M(FLAGC[RUN.marks.length % 5]), 0); fl.position.set(12, 0, 28); f.add(pole, fl); f.position.set(dist, -60, -25); S.flags.add(f);
          S._runOut(`<span class="big">Проехала <b>${nf(dist / 1000, 2)} м</b>!</span>${dist / 1000 >= 1.5 && RUN.books === 3 ? ' <small>Проверка пройдена — больше 1,5 м.</small>' : ''}`);
        }
      } else { RUN.done = false; RUN.s += v * dt * 0.8; }
      const s = RUN.s + 70;
      if (s < RAMP) { S.tilt.add(S.car); S.car.position.set(s, 0, 25); }
      else { S.world.add(S.car); S.car.rotation.set(0, 0, 0); S.car.position.set(s - RAMP, 0, 0); }
      S.roll(RUN.s / 25);
      S.follow = s < RAMP ? null : [s - RAMP + 150, 0, 0];
    }
    if (RUN.s < 0) S.roll(0);
    S.labels = [L([-Lx - 75, -80, -25 + H / 2], `${RUN.books * 3} см`, 'dim'), ...[500, 1000, 1500, 2000, 2500].map((x) => L([x, -130, -24], `${x / 10} см`, 'tiny'))];
    S.cap = RUN.s < 0 ? 'Машинка наверху горки' : RUN.done ? 'Приехали!' : 'Едет…';
  },
});

// ======================= Настоящий автомобиль =======================
// Масштаб 1 : 20 (единица модели = 2 см). Земля z = −25, колёса R 16 (0,32 м), база 130 (2,6 м), колея 74 (1,48 м).
// Классическая схема: двигатель спереди, ведущие задние колёса (как у «Жигулей»): двигатель → коробка → карданный вал →
// дифференциал → полуоси. Всё, что на пружинах (кузов, двигатель…), — в группе ch; колёса — отдельно, чтобы прыгать на кочках.
function buildReal(world) {
  const R = { wheels: [], pistons: [], flames: [] };
  const g = new THREE.Group(); g.visible = false; world.add(g); R.g = g;
  const ch = new THREE.Group(); g.add(ch); R.ch = ch;
  const paint = M('#b8322a', { r: 0.35, m: 0.25, t: 1 }), glass = M('#9cc3d4', { r: 0.1, t: 0.35 }), metal = M('#a3acb4', { r: 0.4, m: 0.5 });
  const dark = M('#2c2c31', { r: 0.7 }), rubber = M('#1d1d21', { r: 0.9 }), engM = M('#6f8796', { r: 0.45, m: 0.35 }), red = M('#c23b22', { r: 0.5 });
  const tubeM = M('#d9edf3', { r: 0.1, t: 0.3 }), fabric = M('#5a4636', { r: 0.95 }), tankM = M('#5d6f52', { r: 0.6 }), alu = M('#c9ced3', { r: 0.3, m: 0.6 });
  R.paint = paint; R.glass = glass;
  const discM = new THREE.MeshStandardMaterial({ color: '#8d959c', metalness: 0.5, roughness: 0.35, emissive: '#ff3a00', emissiveIntensity: 0 }); R.discM = discM;
  const tag = (o, k) => ((o.userData.part = k), o);
  const at = (o, x, y, z) => (o.position.set(x, y, z), o);
  const along = (o, a, b) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A); o.position.copy(A.add(B).multiplyScalar(0.5)); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); o.scale.y = d.length(); return o; };
  const rod = (r, mat) => mesh(new THREE.CylinderGeometry(r, r, 1, 12), mat, 0);   // цилиндр длиной 1 вдоль y — растягиваем along()
  // кузов: профиль сбоку с арками колёс, выдавлен на ширину машины
  const p = new THREE.Shape();
  p.moveTo(-102, -13); p.lineTo(-87, -13); p.lineTo(-87, -9); p.absarc(-68, -9, 19, Math.PI, 0, true); p.lineTo(-49, -13); p.lineTo(43, -13); p.lineTo(43, -9);
  p.absarc(62, -9, 19, Math.PI, 0, true); p.lineTo(81, -13); p.lineTo(100, -13); p.lineTo(105, -6); p.lineTo(105, 2); p.lineTo(103, 6); p.lineTo(85, 11); p.lineTo(32, 14);
  p.lineTo(-58, 14); p.lineTo(-82, 12); p.lineTo(-103, 9); p.lineTo(-105, 0); p.lineTo(-102, -13);
  const bg = new THREE.ExtrudeGeometry(p, { depth: 80, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.5, bevelSegments: 3, curveSegments: 24 }); bg.rotateX(Math.PI / 2); bg.translate(0, 40, 0);
  const body = tag(mesh(bg, paint, 35), 'rbody'); ch.add(body);
  const gh = new THREE.Shape(); gh.moveTo(-56, 14); gh.lineTo(-42, 31); gh.lineTo(6, 32); gh.lineTo(30, 14); gh.lineTo(-56, 14);
  const gg = new THREE.ExtrudeGeometry(gh, { depth: 72, bevelEnabled: true, bevelThickness: 2, bevelSize: 1.5, bevelSegments: 2 }); gg.rotateX(Math.PI / 2); gg.translate(0, 36, 0);
  const cabin = tag(mesh(gg, glass, 30), 'rbody'); ch.add(cabin);
  const roof = tag(at(mesh(new THREE.BoxGeometry(50, 78, 1.8), paint, 30), -18, 0, 32.6), 'rbody'); ch.add(roof);
  for (const s of [1, -1]) {
    ch.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.5, 10, 3), new THREE.MeshBasicMaterial({ color: '#fff4c4', clippingPlanes: clipPlanes })), 104.6, s * 28, 2));
    ch.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.5, 10, 3), new THREE.MeshBasicMaterial({ color: '#ff3b2b', clippingPlanes: clipPlanes })), -104.6, s * 30, 5));
  }
  R.shell = [body, cabin, roof];
  R.shell.forEach((m) => m.children.forEach((l) => (l.material = l.material.clone())));   // свои контуры: их гасим вместе с кузовом
  // двигатель: блок, четыре прозрачных цилиндра с поршнями, коленчатый вал, крышка
  const eng = tag(at(new THREE.Group(), 66, 0, -5), 'engine'); ch.add(eng); R.eng = eng;
  eng.add(at(mesh(new THREE.BoxGeometry(30, 20, 11), engM), 0, 0, -3.5));
  R.cover = at(mesh(new THREE.BoxGeometry(28, 9, 1.6), red), 0, 0, 14.6); eng.add(R.cover);
  const crank = tag(at(new THREE.Group(), 0, 0, -6), 'crank'); eng.add(crank); R.crank = crank;
  crank.add(mesh(cylX(1.1, 34, 16), metal, 0));
  for (let i = 0; i < 4; i++) {
    const cx = -9 + i * 6, ph = [0, Math.PI, 3 * Math.PI, 2 * Math.PI][i];
    eng.add(at(mesh(cylZ(2.7, 11, 20), tubeM, 0), cx, 0, 8.5));
    const pis = tag(mesh(cylZ(2.35, 3, 20), alu), 'piston'); eng.add(pis);
    const cr = rod(0.45, metal); eng.add(cr);
    const thr = at(mesh(new THREE.BoxGeometry(1.4, 1.4, 3), metal, 0), cx, 0, 0); crank.add(thr);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffb030', transparent: true, opacity: 0, depthWrite: false, clippingPlanes: clipPlanes }));
    fl.userData.skipPick = true; at(fl, cx, 0, 12.2); eng.add(fl);
    R.pistons.push({ pis, cr, thr, cx, ph }); R.flames.push(fl);
  }
  // радиатор с вентилятором, аккумулятор
  const rad = tag(at(mesh(new THREE.BoxGeometry(2, 52, 13), M('#7f8c95', { r: 0.5, m: 0.4 })), 95, 0, -3), 'radiator'); ch.add(rad);
  const fan = at(new THREE.Group(), 90, 0, -3); ch.add(fan); R.fan = fan; tag(fan, 'radiator');
  for (let k = 0; k < 5; k++) { const b = mesh(new THREE.BoxGeometry(0.5, 2, 5), dark, 0); b.geometry.translate(0, 0, 2.6); b.rotation.x = (k / 5) * Math.PI * 2; fan.add(b); }
  const bat = tag(at(new THREE.Group(), 80, -24, 0), 'battery'); ch.add(bat);
  bat.add(mesh(new THREE.BoxGeometry(8, 10, 7), M('#2f3036', { r: 0.6 })));
  bat.add(at(mesh(cylZ(0.9, 1.6, 10), red, 0), 2, -3, 4.2), at(mesh(cylZ(0.9, 1.6, 10), M('#2f5d9c'), 0), 2, 3, 4.2));
  // трансмиссия: коробка с рычагом, карданный вал, дифференциал, полуоси
  const gb = tag(at(mesh(new THREE.CylinderGeometry(8.5, 5.5, 22, 24).rotateZ(-Math.PI / 2), engM), 40, 0, -6), 'gearbox'); ch.add(gb);
  const lever = tag(new THREE.Group(), 'gearbox'); ch.add(lever); lever.add(along(rod(0.5, dark), [33, 0, -2], [22, 0, 8])); lever.add(at(mesh(new THREE.SphereGeometry(1.4, 12, 10), dark, 0), 22, 0, 8.6));
  const cardan = tag(new THREE.Group(), 'cardan'); ch.add(cardan); R.cardan = cardan;
  { const A = new THREE.Vector3(29, 0, -7), B = new THREE.Vector3(-61, 0, -9), d = B.clone().sub(A); cardan.position.copy(A.clone().add(B).multiplyScalar(0.5)); cardan.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
    const inner = new THREE.Group(); cardan.add(inner); R.cardanIn = inner;
    inner.add(mesh(cylX(1.3, d.length(), 14), metal, 0));
    for (const x of [-30, 0, 30]) inner.add(at(mesh(new THREE.BoxGeometry(2, 3.4, 1.2), red, 0), x, 0, 0));
    for (const x of [-d.length() / 2, d.length() / 2]) inner.add(at(mesh(new THREE.SphereGeometry(2, 12, 10), metal, 0), x, 0, 0)); }
  const diff = tag(at(new THREE.Group(), -68, 0, -9), 'diff'); ch.add(diff);
  diff.add(mesh(new THREE.SphereGeometry(6, 20, 16), engM));
  const ring = at(mesh(new THREE.TorusGeometry(4.6, 0.9, 8, 24), M('#d6b25a', { m: 0.5, r: 0.35 })), 0, 0, 0); diff.add(ring); R.ring = ring;
  const half = tag(at(new THREE.Group(), -68, 0, -9), 'half'); ch.add(half); R.half = half;
  half.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 62, 14), metal, 0));
  for (const y of [-20, 20]) half.add(at(mesh(new THREE.BoxGeometry(1.6, 1, 3.2), red, 0), 0, y, 0));
  // руль: колонка, рулевое колесо, рейка с тягами
  const rack = tag(at(new THREE.Group(), 56, 0, -7), 'rack'); ch.add(rack); R.rack = rack;
  rack.add(mesh(new THREE.CylinderGeometry(1.3, 1.3, 46, 14), metal, 0));
  rack.add(at(mesh(new THREE.BoxGeometry(4, 8, 4), engM), 0, 18, 0));
  R.ties = [1, -1].map((s) => { const r = rod(0.6, dark); ch.add(tag(r, 'rack')); return r; });
  const column = tag(new THREE.Group(), 'steer'); ch.add(column); column.add(along(rod(0.7, dark), [56, 18, -5], [14, 18, 9]));
  const sw = tag(at(new THREE.Group(), 13, 18, 9.4), 'steer'); ch.add(sw); R.sw = sw;
  sw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-42, 0, 14).normalize().negate());
  const swIn = new THREE.Group(); sw.add(swIn); R.swIn = swIn;
  swIn.add(mesh(new THREE.TorusGeometry(6, 0.8, 8, 32), dark, 0));
  for (let k = 0; k < 3; k++) { const b = mesh(new THREE.BoxGeometry(0.8, 5.6, 0.6), dark, 0); b.geometry.translate(0, -2.8, 0); b.rotation.z = (k / 3) * Math.PI * 2 + Math.PI; swIn.add(b); }
  swIn.add(mesh(cylZ(1.8, 1.2, 14), red, 0));
  // бак, выхлопная труба, сиденья
  ch.add(tag(at(mesh(new THREE.BoxGeometry(16, 48, 6), tankM), -50, 0, -10.5), 'tank'));
  const exh = tag(new THREE.Group(), 'exhaust'); ch.add(exh);
  exh.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[62, -12, -9], [52, -14, -12], [30, -16, -13.5], [-40, -18, -13.5], [-84, -18, -13]].map((q) => new THREE.Vector3(...q))), 64, 0.9, 8), metal, 0));
  exh.add(at(mesh(cylX(3.4, 16, 18), metal), -92, -18, -12.5), at(mesh(cylX(1, 10, 10), metal, 0), -104, -18, -12.5));
  const seats = tag(new THREE.Group(), 'seat'); ch.add(seats);
  for (const s of [1, -1]) { seats.add(at(mesh(new THREE.BoxGeometry(15, 15, 4), fabric), -4, s * 18, -7)); const b = at(mesh(new THREE.BoxGeometry(3.5, 15, 17), fabric), -13, s * 18, 3); b.rotation.y = -0.18; seats.add(b); }
  seats.add(at(mesh(new THREE.BoxGeometry(14, 52, 4), fabric), -40, 0, -7)); { const b = at(mesh(new THREE.BoxGeometry(3.5, 52, 16), fabric), -49, 0, 3); b.rotation.y = -0.2; seats.add(b); }
  // колёса: крепление (прыгает на кочке) → поворот (руль) → вращение; тормоз — на повороте, пружина — на креплении
  class Helix extends THREE.Curve { getPoint(u, v = new THREE.Vector3()) { const a = u * Math.PI * 2 * 6; return v.set(2.6 * Math.cos(a), 2.6 * Math.sin(a), u * 15); } }
  const springGeo = new THREE.TubeGeometry(new Helix(), 160, 0.42, 6);
  for (const [x, front] of [[62, true], [-68, false]]) for (const s of [1, -1]) {
    const mount = at(new THREE.Group(), x, s * 37, -9); mount.scale.y = s; g.add(mount);
    const steer = new THREE.Group(); mount.add(steer);
    const spin = tag(new THREE.Group(), 'rwheel'); steer.add(spin);
    spin.add(mesh(lathe([[10.4, -5], [14.5, -5], [16, -3.4], [16, 3.4], [14.5, 5], [10.4, 5], [10.4, -5]], 48), rubber, 40));
    spin.add(mesh(lathe([[9.2, -4], [10.5, -4], [10.5, 4], [9.2, 4], [9.2, -4]], 40), alu, 0));
    for (let k = 0; k < 5; k++) { const b = mesh(new THREE.BoxGeometry(1.8, 1.2, 9.4), alu, 0); b.geometry.translate(0, 3.4, 4.6); b.rotation.y = (k / 5) * Math.PI * 2; spin.add(b); }
    spin.add(at(mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.8, 16), alu, 0), 0, 3.6, 0));
    const disc = tag(at(mesh(new THREE.CylinderGeometry(8, 8, 1.2, 32), discM, 0), 0, -1.2, 0), 'brake'); spin.add(disc);
    const cal = tag(at(mesh(new THREE.BoxGeometry(5, 4.2, 4.2), red), -5.4, -1.2, 5.4), 'brake'); cal.rotation.y = 0.78; steer.add(cal);
    const sp = tag(at(new THREE.Group(), 0, -8, 3), 'spring'); mount.add(sp);
    sp.add(mesh(springGeo, M('#3f6a9a', { r: 0.4, m: 0.3 }), 0)); sp.add(at(mesh(cylZ(0.9, 15, 12), M('#e3b341', { r: 0.4 }), 0), 0, 0, 7.5));
    mount.add(at(mesh(new THREE.BoxGeometry(3, 14, 1.4), dark, 0), 0, -12, -1.5));
    R.wheels.push({ x, s, front, mount, steer, spin, disc, cal, sp });
  }
  // «поток силы»: огоньки бегут от двигателя к задним колёсам
  const flow = new THREE.Group(); g.add(flow); R.flow = flow;
  const fm = new THREE.MeshBasicMaterial({ color: '#ffb030', transparent: true, opacity: 0.95, depthTest: false });
  for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), fm); b.renderOrder = 10; b.userData.skipPick = true; flow.add(b); }
  const P = [[66, 0, -5], [44, 0, -6], [29, 0, -7], [-61, 0, -9], [-68, 0, -9]], PL = [...P, [-68, 30, -9]], PR = [...P, [-68, -30, -9]];
  const pathAt = (pts, u) => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(...pts[i].map((v, k) => v - pts[i - 1][k]))); const d = u * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++; const k = (d - L[i - 1]) / (L[i] - L[i - 1] || 1); return pts[i - 1].map((v, j) => v + (pts[i][j] - v) * k); };
  R.flowAt = (time) => flow.children.forEach((b, i) => { const u = (time * 0.35 + i / flow.children.length) % 1; b.position.set(...pathAt(i % 2 ? PL : PR, u)); b.scale.setScalar(0.8 + 0.4 * Math.sin(u * Math.PI)); });

  // ---------- состояния ----------
  R.xray = (k) => { paint.opacity = 1 - 0.85 * k; glass.opacity = 0.35 - 0.23 * k; paint.depthWrite = k < 0.5; glass.depthWrite = false; R.shell.forEach((m) => m.children.forEach((l) => (l.material.opacity = 0.5 * (1 - 0.7 * k)))); };
  R.engineAt = (th) => {
    R.crank.rotation.x = -th; R.fan.rotation.x = -th;
    R.pistons.forEach((q, i) => {
      const a = th + q.ph, z = 7.5 + 2.2 * Math.cos(a);
      q.pis.position.set(q.cx, 0, z);
      const pin = new THREE.Vector3(q.cx, 2 * Math.sin(a), -6 + 2 * Math.cos(a));
      q.thr.position.set(q.cx, 2 * Math.sin(q.ph), 2 * Math.cos(q.ph));   // колено вала смещено по фазе цилиндра
      const top = new THREE.Vector3(q.cx, 0, z - 1.5), d = top.clone().sub(pin);
      q.cr.position.copy(pin.clone().add(top).multiplyScalar(0.5)); q.cr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); q.cr.scale.y = d.length();
      const ph = ((a % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
      R.flames[i].material.opacity = ph < 1.1 ? 0.9 * (1 - ph / 1.1) : 0;   // вспышка — в начале рабочего хода
    });
  };
  R.spin = (a) => { R.wheels.forEach((w) => (w.spin.rotation.y = a)); R.half.rotation.y = a; R.ring.rotation.y = a * 0.3; R.cardanIn.rotation.x = a * 3.9; };
  R.steer = (k) => {   // k ∈ [−1, 1]: руль на ±1,5 оборота, колёса на ±32°
    R.swIn.rotation.z = -k * Math.PI * 3; R.rack.position.y = -k * 5;
    R.wheels.forEach((w) => { if (w.front) w.steer.rotation.z = k * 0.56 * w.s; });
    R.ties.forEach((r, i) => { const s = i ? -1 : 1; const a = [56, s * 23 - k * 5, -7], b = [60, s * 30, -7]; const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A); r.position.copy(A.add(B).multiplyScalar(0.5)); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); r.scale.y = d.length(); });
  };
  R.susp = (lift, bodyDz, pitch = 0) => {   // lift — подъём каждого колеса, bodyDz — подъём кузова
    ch.position.z = bodyDz; ch.rotation.y = pitch;
    R.wheels.forEach((w, i) => { const l = lift[i] || 0; w.mount.position.z = -9 + l; const top = 9 + bodyDz - w.x * pitch; w.sp.scale.z = (top - (-9 + l + 3)) / 15; });
  };
  R.brake = (k, heat) => { R.wheels.forEach((w) => (w.cal.scale.y = 1 - 0.18 * k)); discM.emissiveIntensity = heat * 1.6; discM.color.setRGB(0.55 + 0.4 * heat, 0.58 - 0.2 * heat, 0.61 - 0.35 * heat); };
  R.reset = () => { g.visible = false; g.rotation.set(0, 0, 0); R.xray(0); R.engineAt(0); R.spin(0); R.steer(0); R.susp([0, 0, 0, 0], 0); R.brake(0, 0); flow.visible = false; R.eng.visible = true; R.cover.visible = true; };
  R.reset();
  return R;
}

const realOn = (S) => { const R = S.real(); S.car.visible = false; R.g.visible = true; return R; };
const RA = (items) => items;

// R1. Целиком
rch({
  ico: '🚙', short: 'Целиком', title: 'Настоящий автомобиль: что внутри', dur: 16, cam: [[220, -260, 170], [0, 0, 0]], box: [[-108, -46, -25], [108, 46, 36]],
  spots: ['engine', 'radiator', 'battery', 'gearbox', 'cardan', 'diff', 'rwheel', 'spring', 'steer', 'tank', 'exhaust'],
  lead: 'Под кузовом спрятано больше десятка систем. Кузов стал прозрачным — <b>нажимай на светящиеся точки</b> и узнавай, что есть что.',
  more: RA([['🧩 Главные системы', 'Двигатель даёт силу. Трансмиссия — коробка, карданный вал и дифференциал — несёт её к колёсам. Руль поворачивает, подвеска смягчает кочки, тормоза останавливают.'],
    ['🛠 А у нашей машинки?', 'Почти то же, только проще: вместо двигателя — горка, вместо подвески — жёсткие корпуса, вместо тормозов — стопор. Зато подшипники, вал и колёса — как настоящие.'],
    ['✨ Интересно', 'В обычном автомобиле около 30 000 деталей, если считать каждый винтик.']]),
  ui: () => `<div class="dk-g"><span class="dk-l">Кузов</span><div class="dk-o"><button type="button" class="dk-b on" data-x="1">👁 Прозрачный</button><button type="button" class="dk-b" data-x="0">🚗 Обычный</button></div></div>`,
  bind(el, S) { S._xr = 1; el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; S._xr = +b.dataset.x; el.querySelectorAll('[data-x]').forEach((q) => q.classList.toggle('on', q === b)); }); },
  setup(S) { realOn(S); S._xk = 0; },
  pose(t, S, dt) {
    const R = S.R; R.g.rotation.z = Math.sin(t * Math.PI * 2) * 0.5;
    S._xk = clamp(S._xk + (S._xr && t > 0.08 ? 1 : -1) * dt * 1.5); R.xray(ease(S._xk));
    S.cap = S._xr ? 'Кузов прозрачный — видно, что внутри' : 'Обычный автомобиль';
  },
});

// R2. Двигатель
const ENG = { fast: false, th: 0 };
const STROKES = ['3. Вспышка! Газы толкают поршень вниз', '4. Выпуск: поршень выталкивает газы', '1. Впуск: поршень втягивает воздух с бензином', '2. Сжатие: поршень сжимает смесь'];
rch({
  ico: '🔥', short: 'Двигатель', title: 'Двигатель: как рождается сила', dur: 1, loop: true, cam: [[160, -120, 120], [66, 0, 0]], box: [[44, -32, -16], [100, 32, 12]],
  spots: ['piston', 'crank', 'radiator', 'battery', 'exhaust'],
  lead: 'В цилиндрах вспыхивает бензин и толкает <b>поршни</b> вниз. Поршни крутят <b>коленчатый вал</b> — так рождается вращение. Следи за первым цилиндром.',
  more: RA([['🔄 Четыре такта', '<ol><li><b>Впуск:</b> поршень идёт вниз и втягивает воздух с бензином.</li><li><b>Сжатие:</b> идёт вверх и сжимает смесь.</li><li><b>Рабочий ход:</b> искра — вспышка толкает поршень вниз.</li><li><b>Выпуск:</b> поршень выталкивает газы в выхлопную трубу.</li></ol>'],
    ['🌡 Зачем радиатор', 'От вспышек двигатель сильно греется. Жидкость уносит тепло в радиатор, а встречный воздух и вентилятор его остужают.'],
    ['🛠 У нашей машинки', 'Двигатель — горка: машинку тянет вниз сила тяжести. Поэтому у всех он одинаковый, и сравнивать колёса честно.'],
    ['✨ Интересно', 'На трассе коленвал делает около 3000 оборотов в минуту — каждый поршень пролетает вверх-вниз 50 раз за секунду!']]),
  ui: () => `<div class="dk-g"><span class="dk-l">Педаль газа</span><div class="dk-o"><button type="button" class="dk-b on" data-f="0">🐢 Медленно</button><button type="button" class="dk-b" data-f="1">🚀 Газ!</button></div></div>`,
  bind(el) { ENG.fast = false; el.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; ENG.fast = b.dataset.f === '1'; el.querySelectorAll('[data-f]').forEach((q) => q.classList.toggle('on', q === b)); }); },
  setup(S) { const R = realOn(S); R.xray(1); R.cover.visible = false; },
  pose(t, S, dt) {
    const R = S.R; R.xray(1);
    ENG.th += dt * (ENG.fast ? 28 : 2.2); R.engineAt(ENG.th);
    const ph = ((ENG.th % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
    S.cap = ENG.fast ? 'Газ! Вспышки так часто, что их не различить' : STROKES[Math.floor(ph / Math.PI)];
    S.labels = ENG.fast ? [] : [L([-9, 0, 15], 'цилиндр 1', 'hot', R.eng)];
  },
});

// R3. Трансмиссия
const GEARS = [3.6, 2.1, 1.4, 1.0, 0.8];
const TR = { g: 0, a: 0, e: 0 };
rch({
  ico: '⚙️', short: 'Передачи', title: 'Как сила доходит до колёс', dur: 1, loop: true, cam: [[60, -260, 180], [-10, 0, -8]], box: [[-95, -45, -25], [85, 45, 0]],
  spots: ['gearbox', 'cardan', 'diff', 'half'],
  lead: 'Двигатель спереди, а едут задние колёса. Сила бежит по цепочке: <b>коробка → карданный вал → дифференциал → колёса</b>. Переключай передачи!',
  more: RA([['⚙ Зачем передачи', 'На 1-й колёса крутятся медленно, но с большой силой — чтобы тронуться и заехать в горку. На 5-й — быстро, но сила меньше. Двигатель при этом крутится одинаково.'],
    ['↔ Дифференциал', 'В повороте наружное колесо проезжает больше, чем внутреннее. Дифференциал позволяет им крутиться с разной скоростью.'],
    ['🛠 У нашей машинки', 'Тоже есть вал — стальной пруток Ø4 мм. Он крутится вместе с колёсами, как полуоси у настоящей машины.']]),
  ui: () => `<div class="dk-g"><span class="dk-l">Передача</span><div class="dk-o">${GEARS.map((_, i) => `<button type="button" class="dk-b${i === 0 ? ' on' : ''}" data-g="${i}">${i + 1}</button>`).join('')}</div></div><p class="dk-out" id="trOut"></p>`,
  bind(el, S) {
    TR.g = 0;
    const upd = () => { el.querySelectorAll('[data-g]').forEach((b) => b.classList.toggle('on', +b.dataset.g === TR.g)); const r = GEARS[TR.g], kmh = Math.round(((3000 / (r * 3.9)) * 2 * Math.PI * 0.32 * 60) / 1000);
      el.querySelector('#trOut').innerHTML = `Двигатель — 3000 оборотов в минуту → скорость <b class="big">${kmh} км/ч</b>. <small>${TR.g === 0 ? 'Медленно, но сильно — чтобы тронуться.' : TR.g === 4 ? 'Быстро, но сила меньше — для трассы.' : ''}</small>`; };
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; TR.g = +b.dataset.g; upd(); }); upd();
  },
  setup(S) { const R = realOn(S); R.xray(1); R.flow.visible = true; },
  pose(t, S, dt) {
    const R = S.R; R.xray(1);
    TR.e += dt * 9; TR.a += (dt * 9) / (GEARS[TR.g] * 3.9) * 4;
    R.engineAt(TR.e); R.spin(TR.a); R.flowAt(performance.now() / 1000);
    S.cap = `${TR.g + 1}-я передача: колёса крутятся ${['очень медленно', 'медленно', 'средне', 'быстро', 'очень быстро'][TR.g]}`;
  },
});

// R4. Руль
const STR = { k: 0, auto: true };
rch({
  ico: '🎯', short: 'Руль', title: 'Руль: как поворачивают колёса', dur: 1, loop: true, cam: [[150, -90, 170], [40, 0, 0]], box: [[0, -50, -25], [95, 50, 14]],
  spots: ['steer', 'rack', 'rwheel'],
  lead: 'Двигай ползунок — это руль. <b>Рулевая рейка</b> сдвинется вбок и повернёт передние колёса.',
  more: RA([['🔍 Как устроено', 'Руль на длинном валу — рулевой колонке. Внизу шестерёнка двигает рейку влево-вправо, а тяги поворачивают колёса.'],
    ['✨ Интересно', 'Руль поворачивается почти на полтора оборота в каждую сторону, а колёса — всего примерно на 30°. Так рулить легче и точнее.'],
    ['🛠 У нашей машинки', 'Руля нет — она едет только прямо. Поэтому колёса должны стоять ровно, иначе её «уводит» вбок.'],
    ['📏 Люфт', 'Небольшой свободный ход руля разрешён — до 10°. Больше — ездить нельзя.']]),
  ui: () => `<div class="dk-g" style="flex:1 1 260px"><span class="dk-l">Поверни руль</span><div class="dk-range">↺<input type="range" id="strR" min="-100" max="100" value="0" aria-label="Руль">↻</div></div><div class="dk-g"><span class="dk-l">&nbsp;</span><button type="button" class="dk-b" id="strC">⬆ Прямо</button></div>`,
  bind(el) {
    STR.auto = true; STR.k = 0; const R = el.querySelector('#strR');
    R.oninput = () => { STR.auto = false; STR.k = R.value / 100; };
    el.querySelector('#strC').onclick = () => { STR.auto = false; STR.k = 0; R.value = 0; };
    STR.ui = () => { if (STR.auto) R.value = Math.round(STR.k * 100); };
  },
  setup(S) { const R = realOn(S); R.xray(1); STR.time = 0; },
  pose(t, S, dt) {
    const R = S.R; R.xray(1); STR.time += dt;
    if (STR.auto) { STR.k = Math.sin(STR.time * 0.9) * 0.9; STR.ui && STR.ui(); }
    R.steer(-STR.k);   // ползунок вправо — поворот вправо
    const deg = Math.round(Math.abs(STR.k) * 32);
    S.cap = Math.abs(STR.k) < 0.05 ? 'Колёса прямо' : `Руль — на ${Math.round(Math.abs(STR.k) * 540)}°, колёса — на ${deg}° ${STR.k > 0 ? 'вправо' : 'влево'}`;
  },
});

// R5. Подвеска
const SUS = { shock: true, x: 160, v: 0, dz: 0, vz: 0 };
rch({
  ico: '🌊', short: 'Подвеска', title: 'Подвеска: кочка под колесом', dur: 1, loop: true, cam: [[90, 220, 60], [0, 37, -6]], box: [[-95, 15, -25], [100, 50, 18]],
  spots: ['spring', 'rwheel', 'rbody'],
  lead: 'Колесо наезжает на кочку и подпрыгивает, а кузов едет почти ровно — удар «съедают» <b>пружина</b> и <b>амортизатор</b>. Выключи амортизатор и посмотри, что будет!',
  more: RA([['🔍 Пружина и амортизатор', 'Пружина сжимается и смягчает удар. Амортизатор (жёлтый стержень внутри) гасит раскачку — без него машина прыгала бы как мячик.'],
    ['🛠 У нашей машинки', 'Подвески нет: корпуса стоят прямо на плите. На ровном столе она и не нужна.'],
    ['✨ Интересно', 'У внедорожников ход подвески бывает больше 30 см — колесо может подняться выше колена взрослого.']]),
  ui: () => `<div class="dk-g"><span class="dk-l">Амортизаторы</span><div class="dk-o"><button type="button" class="dk-b on" data-s="1">✓ Есть</button><button type="button" class="dk-b" data-s="0">✗ Сломались</button></div></div>`,
  bind(el) { SUS.shock = true; el.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; SUS.shock = b.dataset.s === '1'; el.querySelectorAll('[data-s]').forEach((q) => q.classList.toggle('on', q === b)); }); },
  setup(S) {
    const R = realOn(S); R.xray(1); SUS.x = 160; SUS.dz = 0; SUS.vz = 0;
    if (!S._bump) { S._bump = mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M('#8a6d4a', { r: 0.9 }), 0); S._bump.scale.set(14, 12, 6); S._bump.userData.skipPick = true; S.world.add(S._bump); }
    S._bump.visible = true;
  },
  leave(S) { if (S._bump) S._bump.visible = false; },
  pose(t, S, dt) {
    const R = S.R; R.xray(1);
    SUS.x -= dt * 110; if (SUS.x < -170) SUS.x = 170;
    S._bump.position.set(SUS.x, 37, -25);
    const lift = R.wheels.map((w) => (w.s > 0 ? 6 * Math.max(0, 1 - ((w.x - SUS.x) / 22) ** 2) : 0));
    // кузов: пружина тянет к среднему подъёму колёс, амортизатор гасит скорость
    const target = (lift[0] + lift[2]) * 0.18, kS = 60, cD = SUS.shock ? 14 : 0.6;
    SUS.vz += (kS * (target - SUS.dz) - cD * SUS.vz) * dt; SUS.dz += SUS.vz * dt;
    R.susp(lift, SUS.dz, -(lift[0] - lift[2]) * 0.0016);
    R.spin(-SUS.x / 16);
    S.cap = SUS.shock ? 'Колесо прыгает — кузов почти не качается' : 'Без амортизатора кузов долго раскачивается!';
  },
});

// R6. Тормоза
const BRK = { on: false, v: 1, heat: 0, a: 0 };
rch({
  ico: '🛑', short: 'Тормоза', title: 'Тормоза: куда девается скорость', dur: 1, loop: true, cam: [[100, 150, 26], [62, 37, -9]], box: [[40, 30, -25], [84, 46, 8]],
  spots: ['brake', 'spring'],
  lead: 'Нажми и держи <b>«Тормоз»</b>: колодки сожмут диск, колесо остановится, а диск раскалится от трения.',
  more: RA([['🔥 Куда девается скорость', 'Тормоз — это трение. Энергия движения превращается в тепло: диск может нагреться до 300–500 °C.'],
    ['🛑 АБС', 'Если колесо заблокировать, машина скользит и плохо слушается руля. АБС быстро-быстро отпускает и снова сжимает тормоз — колесо продолжает катиться.'],
    ['🛠 У нашей машинки', 'Тормоз — стопор: он не даёт колесу крутиться, и машинка скользит. Так мы и измеряем сцепление.']]),
  ui: () => `<div class="dk-g"><span class="dk-l">Педаль тормоза</span><button type="button" class="dk-go red" id="brkB">🛑 Тормоз (держи)</button></div><p class="dk-out" id="brkOut"></p>`,
  bind(el) {
    const b = el.querySelector('#brkB'), on = (v) => (e) => { e.preventDefault(); BRK.on = v; b.classList.toggle('hold', v); };
    b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false)); b.addEventListener('pointercancel', on(false));
    b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') on(true)(e); }); b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') on(false)(e); });
    BRK.out = el.querySelector('#brkOut');
  },
  setup(S) { const R = realOn(S); R.xray(1); BRK.v = 1; BRK.heat = 0; BRK.on = false; R.eng.visible = false; },
  pose(t, S, dt) {
    const R = S.R; R.xray(1);
    BRK.v = clamp(BRK.v + (BRK.on ? -dt * 0.9 : dt * 0.35)); BRK.heat = clamp(BRK.heat + (BRK.on && BRK.v > 0.01 ? dt * 0.5 : -dt * 0.12));
    BRK.a += dt * 14 * BRK.v; R.spin(BRK.a); R.brake(BRK.on ? 1 : 0, BRK.heat);
    const kmh = Math.round(BRK.v * 60);
    S.cap = `Скорость ${kmh} км/ч${BRK.heat > 0.3 ? ' · диск горячий 🔥' : ''}`;
    if (BRK.out) BRK.out.innerHTML = BRK.on ? (kmh ? 'Тормозим… колодки трут диск' : '<b>Стоим!</b> Отпусти — поедем снова') : BRK.heat > 0.3 ? 'Диск остывает — тепло уходит в воздух' : 'Держи кнопку, чтобы тормозить';
  },
});
