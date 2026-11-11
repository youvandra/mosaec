import { Skeleton } from '@mosaec/ui';

export default function Loading() {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton width="40%" height={36} />
      <Skeleton width="70%" />
      <Skeleton height={240} />
    </div>
  );
}
