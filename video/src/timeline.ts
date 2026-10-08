// Раскладка ролика по времени: вступление → крючок → рубрики (текст порциями, как субтитры) → «Ищи связь» → финал.
// Без озвучки скорость рассчитана на чтение детьми 9–14 лет (~2,3 слова в секунду плюс запас).
// С озвучкой (src/voice.json, собирается voice-build.mjs) сцены длятся столько, сколько звучит голос,
// а каждая порция текста появляется в момент, когда её начинают читать.
import memo from '../../content/memo.json';
import voiceData from './voice.json';

export type Section = { key: string; title: string; note: string | null; text: string; list: string[] };
export type Card = { n: number; slug: string; title: string; years: string | null; hook: string; sections: Section[]; links: string[]; linksText: string };
export const CARDS = memo as Card[];
type VoiceSeg = { src: string; dur: number; words: number[] };
const voiceOf = (slug: string) => (voiceData as Record<string, { segments: Record<string, VoiceSeg> }>)[slug]?.segments;

export const FPS = 30;
export const INTRO = 5.5 * FPS; // рубашка → переворот → название
export const TITLE_FROM = 95;   // кадр, когда появляется название карточки
const LINKS = 7 * FPS, OUTRO = 6 * FPS;
const LEAD = 12;                       // голос начинается чуть позже появления сцены
const TAIL = Math.round(0.7 * FPS);    // пауза после голоса до смены сцены

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const readFrames = (w: number, min = 3.5) => Math.round(Math.max(min, w / 2.3 + 1.6) * FPS);
const sec = (s: number) => Math.round(s * FPS);

// reveal — за сколько кадров проявляются слова порции (с голосом — пока она звучит)
export type Chunk = { text?: string; items?: string[]; from: number; dur: number; reveal?: number };
export type Part = { section: Section; index: number; from: number; dur: number; chunks: Chunk[] };
export type AudioCue = { src: string; from: number };

// Абзац → порции по целым предложениям, не длиннее ~30 слов
function chunkText(text: string): string[] {
  const sentences = text.replace(/\n/g, ' ').split(/(?<=[.!?…»])\s+(?=[А-ЯЁA-Z«"(0-9—-])/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && words(cur) + words(s) > 30) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

export function timeline(card: Card) {
  const V = voiceOf(card.slug);
  const audio: AudioCue[] = [];
  const HEAD = Math.round(1.2 * FPS); // заголовок рубрики появляется до текста

  // Название и крючок: голос читает «Колесо. <крючок>»
  let hookDur = readFrames(words(card.hook), 4), hookAt = 30;
  const vh = V?.['0-nachalo'];
  if (vh) {
    const start = TITLE_FROM + 8;
    audio.push({ src: vh.src, from: start });
    hookDur = Math.max(start + sec(vh.dur) + TAIL - INTRO, 2 * FPS);
    hookAt = 8 + sec(vh.words[words(card.title + '.')] ?? 1);
  }
  let t = INTRO + hookDur;

  const parts: Part[] = card.sections.map((section, index) => {
    const raw: { text?: string; items?: string[]; n: number }[] = [
      ...chunkText(section.text).map((text) => ({ text, n: words(text) })),
    ];
    for (let i = 0; i < section.list.length; i += 3) { const items = section.list.slice(i, i + 3); raw.push({ items, n: words(items.join(' ')) }); }
    const v = V?.[`${index + 1}-${section.key}`];
    const chunks: Chunk[] = [];
    let dur: number;
    if (v) {
      // момент начала каждой порции = момент её первого слова в озвучке
      audio.push({ src: v.src, from: t + LEAD });
      dur = LEAD + sec(v.dur) + TAIL;
      let w = words(`${section.title}${section.note ? ` (${section.note})` : ''}.`);
      const starts = raw.map((c) => { const at = v.words[w] ?? 0; const endAt = v.words[w + c.n - 1] ?? at; w += c.n; return { at, endAt }; });
      raw.forEach((c, k) => {
        const from = Math.max(k === 0 ? HEAD : chunks[k - 1].from + FPS, LEAD + sec(starts[k].at) - 4);
        chunks.push({ text: c.text, items: c.items, from, dur: 0, reveal: Math.max(10, sec(starts[k].endAt - starts[k].at)) });
      });
      chunks.forEach((c, k) => { c.dur = (k + 1 < chunks.length ? chunks[k + 1].from : dur) - c.from; });
    } else {
      let local = HEAD;
      for (const c of raw) {
        const d = c.items ? readFrames(c.n + 4, 5) : readFrames(c.n);
        chunks.push({ text: c.text, items: c.items, from: local, dur: d }); local += d;
      }
      dur = local;
    }
    const part = { section, index, from: t, dur, chunks };
    t += dur;
    return part;
  });

  const linksFrom = t;
  const hasLinks = card.links.length > 0 || !!card.linksText;
  let linksDur = LINKS;
  const vl = V?.['8-svyaz'];
  if (hasLinks) {
    if (vl) { audio.push({ src: vl.src, from: t + LEAD }); linksDur = Math.max(LINKS, LEAD + sec(vl.dur) + TAIL); }
    t += linksDur;
  }
  let outroDur = OUTRO;
  const vo = V?.['9-final'];
  if (vo) { audio.push({ src: vo.src, from: t + 30 }); outroDur = Math.max(OUTRO, 30 + sec(vo.dur) + FPS); }
  return { hookDur, hookAt, parts, linksFrom, linksDur, hasLinks, outroFrom: t, outroDur, total: t + outroDur, audio };
}
