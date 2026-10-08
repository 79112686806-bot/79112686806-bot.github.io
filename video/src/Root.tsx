import { Composition } from 'remotion';
import { Story } from './Story';
import { CARDS, FPS, timeline } from './timeline';

// По композиции на карточку: id = номер и адрес, например «05-parovaya-mashina»
export const RemotionRoot: React.FC = () => (
  <>
    {CARDS.map((card) => (
      <Composition
        key={card.slug}
        id={`${String(card.n).padStart(2, '0')}-${card.slug}`}
        component={Story}
        durationInFrames={timeline(card).total}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ slug: card.slug }}
      />
    ))}
  </>
);
