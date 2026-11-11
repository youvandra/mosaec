import { OG_SIZE, ogImage } from '../../../lib/og';

export const alt = 'Borrow on Mosaec with no liquidation';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Borrow',
    title: 'USDC for your coins,',
    accent: 'no liquidation.',
  });
}
