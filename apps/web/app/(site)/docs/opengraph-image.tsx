import { OG_SIZE, ogImage } from '../../../lib/og';

export const alt = 'Mosaec docs: rules, contracts and errors';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    eyebrow: 'Docs',
    title: 'The rules,',
    accent: 'in one place.',
  });
}
