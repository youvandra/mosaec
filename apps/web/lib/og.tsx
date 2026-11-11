import { ImageResponse } from 'next/og';

// The CSS-free subpath: importing the package index from an image route pulled the UI stylesheet
// into the main entry, and production served it as a <script>.
import { MARK_PATH, MARK_VIEWBOX } from '@mosaec/ui/mark';

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The mark as inline SVG in `color`, at `width` px wide. */
export function MarkSvg({ width, color }: { readonly width: number; readonly color: string }) {
  return (
    <svg width={width} height={Math.round((width * 1152) / 1660)} viewBox={MARK_VIEWBOX}>
      <path fill={color} transform="translate(0 1303) scale(0.1 -0.1)" d={MARK_PATH} />
    </svg>
  );
}

/** The round badge: ink disc, white mark at 60% of its width. */
export function Badge({
  size,
  inverse = false,
}: {
  readonly size: number;
  readonly inverse?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size,
        background: inverse ? '#ffffff' : '#141414',
      }}
    >
      <MarkSvg width={Math.round(size * 0.6)} color={inverse ? '#141414' : '#ffffff'} />
    </div>
  );
}

/**
 * The share card for one page: ink background, the white mark and wordmark, an eyebrow, a two-line
 * headline with the second line in the accent blue, and the domain at the foot.
 */
export function ogImage({
  eyebrow,
  title,
  accent,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly accent: string;
}): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#141414',
        color: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <Badge size={64} inverse />
        <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em' }}>Mosaec</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '8px 18px',
            borderRadius: 100,
            background: '#262626',
            color: '#ccff00',
            fontSize: 24,
          }}
        >
          {eyebrow}
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 76,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            fontWeight: 600,
          }}
        >
          <span>{title}</span>
          <span style={{ color: '#4d94ff' }}>{accent}</span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 26,
        }}
      >
        <span>mosaec.finance</span>
        <span>Built on NEAR</span>
      </div>
    </div>,
    OG_SIZE,
  );
}
