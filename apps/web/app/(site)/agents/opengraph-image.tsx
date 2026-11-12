import { OG_SIZE, ogImage } from '../../../lib/og';

export const alt = 'Mosaec House Desk: USDC against sealed coins in a minute';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'House Desk',
    title: 'Seal your coins.',
    accent: 'Get USDC in a minute.',
  });
}
