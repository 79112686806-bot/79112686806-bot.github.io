// Ролик-история одной карточки мемо: без озвучки, весь текст на экране.
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { loadFont as loadCormorant } from '@remotion/google-fonts/CormorantGaramond';
import { loadFont as loadPTSerif } from '@remotion/google-fonts/PTSerif';
import { loadFont as loadMarck } from '@remotion/google-fonts/MarckScript';
import { CARDS, FPS, INTRO, TITLE_FROM, timeline, type Card, type Chunk, type Part } from './timeline';

const { fontFamily: HEAD } = loadCormorant('normal', { weights: ['600', '700'], subsets: ['cyrillic', 'latin'] });
const { fontFamily: BODY } = loadPTSerif('normal', { weights: ['400', '700'], subsets: ['cyrillic', 'latin'] });
const { fontFamily: BODY_I } = loadPTSerif('italic', { weights: ['400'], subsets: ['cyrillic', 'latin'] });
const { fontFamily: HAND } = loadMarck('normal', { weights: ['400'], subsets: ['cyrillic', 'latin'] });

const INK = '#3a2313', INK_SOFT = '#6e4b2c', RED = '#9a3a1b', PAPER = '#f2e4c4';
const SITE = 'engineeringclub.ru/igra';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const img = (slug: string) => staticFile(`cards/${slug}.jpg`);

// Появление и исчезновение содержимого сцены
const useFade = (dur: number, inF = 12, outF = 10) => {
  const f = useCurrentFrame();
  return interpolate(f, [0, inF, dur - outF, dur], [0, 1, 1, 0], clamp);
};

// ---------- Фон: пергамент с сеткой чертежа ----------
const Paper: React.FC = () => (
  <AbsoluteFill style={{
    background: `radial-gradient(ellipse at 55% 40%, #f8ecd0 0%, #ead5a8 55%, #cfae78 100%)`,
  }}>
    <AbsoluteFill style={{
      opacity: 0.18,
      backgroundImage: 'linear-gradient(rgba(74,44,20,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(74,44,20,.6) 1px, transparent 1px)',
      backgroundSize: '60px 60px',
    }} />
    <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px rgba(110,58,16,.55), inset 0 0 40px rgba(85,38,8,.5)' }} />
  </AbsoluteFill>
);

// ---------- Карточка: рубашка ↔ лицо, положение зависит от момента ролика ----------
const CardFlip: React.FC<{ card: Card; outroFrom: number; total: number }> = ({ card, outroFrom, total }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 14 } });
  const flipIn = interpolate(f, [30, 62], [0, 180], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const flipOut = interpolate(f, [outroFrom + 10, outroFrom + 42], [0, 180], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const toSide = interpolate(f, [66, 100], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const toCenter = interpolate(f, [outroFrom, outroFrom + 30], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const side = toSide * (1 - toCenter);
  const h = interpolate(side, [0, 1], [700, 900]);
  const cx = interpolate(side, [0, 1], [960, 440]);
  const cy = interpolate(toCenter, [0, 1], [540, 500]);
  const float = side > 0.99 ? Math.sin(f / 80) * 1.2 : 0;
  const bob = side > 0.99 ? Math.sin(f / 60) * 6 : 0;
  const leave = interpolate(f, [total - 12, total], [1, 0], clamp);
  return (
    <div style={{
      position: 'absolute', width: h * 2 / 3, height: h, left: cx - h / 3, top: cy - h / 2 + bob,
      perspective: 2400, transform: `scale(${(0.6 + 0.4 * enter) * (1 - 0.2 * toCenter)}) rotate(${float}deg)`, opacity: Math.min(enter * 1.5, 1) * leave,
    }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateY(${flipIn + flipOut}deg)` }}>
        {[['back', 0], [card.slug, 180]].map(([s, r]) => (
          <div key={s} style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: `rotateY(${r}deg)`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 60px rgba(40,20,5,.45), 0 6px 14px rgba(40,20,5,.35)' }}>
            <Img src={img(String(s))} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- Слова появляются по одному, как живые субтитры ----------
const Words: React.FC<{ text: string; delay?: number; reveal?: number; style?: React.CSSProperties }> = ({ text, delay = 0, reveal, style }) => {
  const n = text.split(/s+/).filter(Boolean).length;
  const step = reveal ? Math.min(reveal / Math.max(n, 1), 12) : 1.6;
  const f = useCurrentFrame();
  return (
    <span style={style}>
      {text.split(/(\s+)/).map((w, i) => {
        if (/^\s+$/.test(w)) return w;
        const at = delay + (i / 2) * step;
        const o = interpolate(f, [at, at + 8], [0, 1], clamp);
        return <span key={i} style={{ opacity: o, display: 'inline-block', transform: `translateY(${(1 - o) * 10}px)` }}>{w}</span>;
      })}
    </span>
  );
};

// ---------- Сцена: название карточки и «крючок» ----------
const TitleScene: React.FC<{ card: Card; dur: number; hookAt: number }> = ({ card, dur, hookAt }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(dur, 1);
  const s = spring({ frame: f, fps, config: { damping: 16 } });
  return (
    <div style={{ position: 'absolute', left: 860, top: 210, width: 940, opacity: fade }}>
      <div style={{ fontFamily: HAND, fontSize: 48, color: RED, opacity: s }}>Карточка {card.n} из {CARDS.length}</div>
      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: card.title.length > 22 ? 92 : 124, lineHeight: 1, color: INK, margin: '10px 0 14px', transform: `translateX(${(1 - s) * 60}px)`, opacity: s }}>{card.title}</div>
      {card.years && <div style={{ fontFamily: BODY, fontSize: 40, color: INK_SOFT, opacity: s }}>{card.years}</div>}
      <div style={{ width: interpolate(f, [10, 40], [0, 420], clamp), height: 3, background: RED, margin: '34px 0 30px' }} />
      <Words text={card.hook} delay={hookAt} style={{ fontFamily: BODY_I, fontStyle: 'italic', fontSize: 54, lineHeight: 1.4, color: INK }} />
    </div>
  );
};

// ---------- Сцена рубрики: номер, заголовок, текст порциями ----------
const ChunkView: React.FC<{ chunk: Chunk }> = ({ chunk }) => {
  const f = useCurrentFrame();
  const fade = useFade(chunk.dur, 8, 8);
  if (chunk.items) return (
    <div style={{ opacity: fade }}>
      {chunk.items.map((it, i) => {
        const o = interpolate(f, [i * 18, i * 18 + 12], [0, 1], clamp);
        return (
          <div key={i} style={{ display: 'flex', gap: 22, alignItems: 'flex-start', marginBottom: 26, opacity: o, transform: `translateX(${(1 - o) * 40}px)` }}>
            <div style={{ flex: 'none', width: 18, height: 18, marginTop: 22, borderRadius: '50%', background: RED }} />
            <div style={{ fontFamily: BODY, fontSize: 42, lineHeight: 1.42, color: INK }}>{it}</div>
          </div>
        );
      })}
    </div>
  );
  return <div style={{ opacity: fade }}><Words text={chunk.text!} reveal={chunk.reveal} style={{ fontFamily: BODY, fontSize: 46, lineHeight: 1.5, color: INK }} /></div>;
};

const PartScene: React.FC<{ card: Card; part: Part }> = ({ card, part }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(part.dur, 10, 10);
  const s = spring({ frame: f, fps, config: { damping: 15 } });
  const boxed = part.section.key === 'short' || part.section.key === 'fact';
  return (
    <div style={{ position: 'absolute', left: 860, top: 110, width: 960, height: 820, opacity: fade }}>
      <div style={{ fontFamily: HAND, fontSize: 40, color: RED }}>{card.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, margin: '8px 0 34px', transform: `translateY(${(1 - s) * 30}px)`, opacity: s }}>
        <div style={{ width: 78, height: 78, borderRadius: '50%', border: `3px solid ${RED}`, color: RED, display: 'grid', placeItems: 'center', fontFamily: HEAD, fontWeight: 700, fontSize: 46 }}>{part.index + 1}</div>
        <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 84, lineHeight: 1, color: INK }}>{part.section.title}</div>
        {part.section.note && (
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 30, color: RED, border: `3px solid ${RED}`, background: '#f6dcb4', borderRadius: 40, padding: '6px 22px', transform: `rotate(-3deg) scale(${spring({ frame: f - 20, fps, config: { damping: 9 } })})` }}>
            {part.section.note}
          </div>
        )}
      </div>
      <div style={{
        position: 'relative', ...(boxed ? { background: 'rgba(255,248,230,.55)', borderLeft: `8px solid ${RED}`, borderRadius: '0 20px 20px 0', padding: '28px 36px' } : {}),
      }}>
        {part.chunks.map((c, i) => (
          <Sequence key={i} from={c.from} durationInFrames={c.dur} layout="none"><ChunkView chunk={c} /></Sequence>
        ))}
      </div>
    </div>
  );
};

// ---------- «Ищи связь» ----------
const LinksScene: React.FC<{ card: Card; dur: number }> = ({ card, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(dur);
  const linked = card.links.map((s) => CARDS.find((c) => c.slug === s)!).filter(Boolean);
  const w = Math.min(260, Math.floor((960 - 34 * (linked.length - 1)) / Math.max(linked.length, 1)));
  return (
    <div style={{ position: 'absolute', left: 860, top: 140, width: 980, opacity: fade }}>
      <div style={{ fontFamily: HAND, fontSize: 40, color: RED }}>{card.title}</div>
      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 84, color: INK, margin: '8px 0 14px' }}>Ищи связь</div>
      <div style={{ fontFamily: BODY, fontSize: 40, color: INK_SOFT, marginBottom: 40 }}>{linked.length ? 'Эта карточка связана с другими:' : card.linksText}</div>
      <div style={{ display: 'flex', gap: 34 }}>
        {linked.map((c, i) => {
          const s = spring({ frame: f - 12 - i * 10, fps, config: { damping: 12 } });
          return (
            <div key={c.slug} style={{ width: w, textAlign: 'center', opacity: s, transform: `translateY(${(1 - s) * 60}px) rotate(${(i - 1) * 3}deg)` }}>
              <Img src={img(c.slug)} style={{ width: w, height: w * 1.5, objectFit: 'cover', borderRadius: 12, boxShadow: '0 16px 30px rgba(40,20,5,.4)' }} />
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: w < 230 ? 32 : 38, lineHeight: 1.1, color: INK, marginTop: 16 }}>{c.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Финал: ссылка на игру ----------
const Logo: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', border: `${size / 16}px solid ${RED}`, position: 'relative', display: 'grid', placeItems: 'center' }}>
    <div style={{ position: 'absolute', width: size / 16, height: size * 0.72, background: RED }} />
    <div style={{ position: 'absolute', height: size / 16, width: size * 0.72, background: RED }} />
    <div style={{ width: size / 4, height: size / 4, borderRadius: '50%', background: RED, zIndex: 1 }} />
  </div>
);
const OutroScene: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 30, fps, config: { damping: 14 } });
  const out = interpolate(f, [dur - 12, dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <div style={{ position: 'absolute', top: 70, width: '100%', textAlign: 'center', opacity: s, transform: `translateY(${(1 - s) * -30}px)` }}>
        <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 80, color: INK }}>Найди пару — узнай историю</div>
      </div>
      <div style={{ position: 'absolute', bottom: 60, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
        <Logo size={84} />
        <div>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 44, letterSpacing: 2, color: INK }}>ИНЖЕНЕРНЫЙ КЛУБ</div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 46, color: RED }}>{SITE}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Полоса прогресса по рубрикам ----------
const Progress: React.FC<{ parts: Part[]; from: number; to: number }> = ({ parts, from, to }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [from - 10, from + 10, to - 10, to], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', left: 860, right: 100, bottom: 54, display: 'flex', gap: 10, opacity: o }}>
      {parts.map((p) => {
        const fill = interpolate(f, [p.from, p.from + p.dur], [0, 1], clamp);
        const active = f >= p.from && f < p.from + p.dur;
        return (
          <div key={p.index} style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(74,44,20,.18)', overflow: 'hidden' }}>
              <div style={{ width: `${fill * 100}%`, height: '100%', background: RED }} />
            </div>
            <div style={{ fontFamily: BODY, fontSize: 20, marginTop: 8, color: active ? RED : INK_SOFT, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.section.title}</div>
          </div>
        );
      })}
    </div>
  );
};

export const Story: React.FC<{ slug: string }> = ({ slug }) => {
  const card = CARDS.find((c) => c.slug === slug)!;
  const tl = timeline(card);
  const titleFrom = TITLE_FROM;
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <Paper />
      <Sequence from={0} durationInFrames={INTRO} layout="none">
        <IntroBrand />
      </Sequence>
      <CardFlip card={card} outroFrom={tl.outroFrom} total={tl.total} />
      <Sequence from={titleFrom} durationInFrames={INTRO + tl.hookDur - titleFrom}>
        <TitleScene card={card} dur={INTRO + tl.hookDur - titleFrom} hookAt={tl.hookAt} />
      </Sequence>
      {tl.parts.map((p) => (
        <Sequence key={p.index} from={p.from} durationInFrames={p.dur}><PartScene card={card} part={p} /></Sequence>
      ))}
      <Progress parts={tl.parts} from={tl.parts[0]?.from ?? 0} to={tl.linksFrom} />
      {tl.hasLinks && <Sequence from={tl.linksFrom} durationInFrames={tl.linksDur}><LinksScene card={card} dur={tl.linksDur} /></Sequence>}
      <Sequence from={tl.outroFrom} durationInFrames={tl.outroDur}><OutroScene dur={tl.outroDur} /></Sequence>
      {tl.audio.map((a) => (
        <Sequence key={a.src} from={a.from} layout="none"><Audio src={staticFile(a.src)} /></Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Надпись над рубашкой в первые секунды
const IntroBrand: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 12, 50, 66], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', top: 40, width: '100%', textAlign: 'center', opacity: o }}>
      <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 46, letterSpacing: 6, color: INK }}>МЕМО «ИНЖЕНЕРИЯ»</span>
    </div>
  );
};

export { FPS };
