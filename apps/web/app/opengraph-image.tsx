import { OG_SIZE, ogImage } from '../lib/og';

export const alt = 'Mosaec: pawn your coins, keep the upside';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Pawn on NEAR',
    title: 'Pawn your coins.',
    accent: 'Keep the upside.',
  });
}
