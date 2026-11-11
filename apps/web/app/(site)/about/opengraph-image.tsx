import { OG_SIZE, ogImage } from '../../../lib/og';

export const alt = 'About Mosaec';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'About',
    title: 'Credit for coins,',
    accent: 'without a price trigger.',
  });
}
