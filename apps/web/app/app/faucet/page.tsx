import { PageHeader } from '../_components/PageHeader';

import { FaucetPanel } from './FaucetPanel';

export const metadata = { title: 'Test Tokens' };

export default function FaucetPage() {
  return (
    <>
      <PageHeader title="Test tokens" lead="Free testnet ZEC, BTC, SOL and USDC, once a day." />
      <FaucetPanel />
    </>
  );
}
