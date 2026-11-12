import { ImageResponse } from 'next/og';

import { MarkSvg } from '../lib/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon: the brand-blue badge filling the tile; iOS rounds the corners. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: '#0066FF',
      }}
    >
      <MarkSvg width={108} color="#ffffff" />
    </div>,
    size,
  );
}
