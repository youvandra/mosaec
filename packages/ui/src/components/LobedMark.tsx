import { useId } from 'react';

import { MARK_PATH, MARK_VIEWBOX } from './Mark';

import type { CSSProperties, SVGProps } from 'react';

/**
 * Each lobe's slice of the mark, smallest first. The cuts run through the notches where two lobes
 * meet (path vertices), extended to the box edges; each slice reaches 8 units into the next so
 * no hairline shows where they join.
 */
const LOBE_SLICES = [
  '0,0 541.5,0 306.5,1303 0,1303',
  '533.5,0 887.4,0 648.3,1303 298.5,1303',
  '879.4,0 1325.2,0 1047,1303 640.3,1303',
  '1317.2,0 1800,0 1800,1303 1039,1303',
] as const;

/** Where each lobe sits along the mark's width, so it grows from its own foot. */
const LOBE_FOOT_X = ['10%', '30%', '54%', '84%'] as const;

/**
 * The Mosaec mark drawn as its four lobes, each a group carrying `data-lobe` and a `--lobe` index
 * (0 smallest to 3), so a surface can animate them one by one in its own CSS. At rest it looks exactly like `Mark`. Image routes keep using `Mark`.
 */
export function LobedMark(props: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox={MARK_VIEWBOX} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <defs>
        {LOBE_SLICES.map((points, index) => (
          <clipPath key={points} id={`${id}-lobe-${index.toString()}`}>
            <polygon points={points} />
          </clipPath>
        ))}
      </defs>
      {LOBE_SLICES.map((points, index) => (
        <g
          key={points}
          data-lobe=""
          clipPath={`url(#${id}-lobe-${index.toString()})`}
          style={{ '--lobe': index, '--lobe-x': LOBE_FOOT_X[index] } as CSSProperties}
        >
          <path transform="translate(0 1303) scale(0.1 -0.1)" d={MARK_PATH} />
        </g>
      ))}
    </svg>
  );
}
