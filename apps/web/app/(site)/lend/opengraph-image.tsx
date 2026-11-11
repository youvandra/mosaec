import { OG_SIZE, ogImage } from '../../../lib/og';

export const alt = 'Lend on Mosaec for a fixed repayment';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Lend',
    title: 'A fixed repayment,',
    accent: 'coins as backstop.',
  });
}
