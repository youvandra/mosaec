import { OG_SIZE, ogImage } from '../../../lib/og';

export const alt = 'Mosaec market: open pawns on NEAR';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Market',
    title: 'One book of pawns,',
    accent: 'two ways to fill it.',
  });
}
