import { PageHeader } from '../_components/PageHeader';

import { BalancesDesk } from './BalancesDesk';

export const metadata = { title: 'Balances' };

export default function BalancesPage() {
  return (
    <>
      <PageHeader title="Balances" lead="Move coins between your wallet and Mosaec." />
      <BalancesDesk />
    </>
  );
}
