import { OG_SIZE, ogImage } from '../../../../lib/og';

export const alt = 'Mosaec agents: lend inside your rules';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Your Agent',
    title: 'Bring your agent.',
    accent: 'It lends inside your rules.',
  });
}
