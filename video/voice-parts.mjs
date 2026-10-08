// Блоки озвучки ролика (общие для voice-scripts.mjs и voice-build.mjs): что читается в каждом блоке.
// Порядок слов здесь совпадает с тем, что показывает ролик (заголовок рубрики, текст, пункты списка).
export function voiceParts(card, cards) {
  const by = Object.fromEntries(cards.map((c) => [c.slug, c.title]));
  return [
    ['0-nachalo', `${card.title}.`, card.hook],
    ...card.sections.map((s, i) => [`${i + 1}-${s.key}`, `${s.title}${s.note ? ` (${s.note})` : ''}.`, [s.text, ...s.list].join('\n')]),
    ['8-svyaz', 'Ищи связь.', card.links.length ? 'Эта карточка связана с другими: ' + card.links.map((s) => by[s]).join(', ') + '.' : card.linksText],
    ['9-final', 'Найди пару — узнай историю.', 'Инженерный клуб.'],
  ].map(([file, head, body]) => ({ file, head, body }));
}
export const cardId = (c) => `${String(c.n).padStart(2, '0')}-${c.slug}`;
