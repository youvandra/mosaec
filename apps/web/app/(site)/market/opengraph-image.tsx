import { OG_SIZE, ogImage } from '../../../lib/og';

export const alt = 'Mosaec market: open pawns on NEAR';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Market',
    title: 'Every open pawn,',
    accent: 'on one page.',
  });
}
