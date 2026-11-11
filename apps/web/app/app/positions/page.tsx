import { PageHeader } from '../_components/PageHeader';

import { PositionsDesk } from './PositionsDesk';

export const metadata = { title: 'Positions' };

export default function PositionsPage() {
  return (
    <>
      <PageHeader
        title="Your positions"
        lead="Every pack where you hold the Title or the Ticket, with what each one needs next."
      />
      <PositionsDesk />
    </>
  );
}
