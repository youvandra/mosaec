import { PageHeader } from '../_components/PageHeader';

import { PositionsDesk } from './PositionsDesk';

export const metadata = { title: 'Positions' };

export default function PositionsPage() {
  return (
    <>
      <PageHeader
        title="Your"
        accent="positions."
        lead="Your pawns, their dates, and what comes next."
      />
      <PositionsDesk />
    </>
  );
}
