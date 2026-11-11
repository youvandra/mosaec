import { StatusPill } from '@mosaec/ui';

import { DEAL_STATUS } from '../../../lib/deal-status';
import { formatDateNs } from '../../../lib/format';
import { amountText, cashText, termText } from '../../../lib/pack-view';

import { CoinTile } from './CoinTile';
import { ListCard, ListRow, SoftPill } from './ListCard';
import { packPath } from './routes';

import type { Deal } from '../../../lib/deal';

export interface ActivityItem {
  readonly packId: string;
  readonly index: string;
  readonly deal: Deal;
}

function when(deal: Deal): string {
  const ns = deal.settledAtNs ?? deal.filledAtNs ?? deal.listedAtNs;
  return ns === null ? '' : formatDateNs(ns);
}

/** Pawns as the source's batch list: coins, how it ended, and the money that moved. */
export function Activity({ items }: { readonly items: readonly ActivityItem[] }) {
  const settled = items.filter(
    (item) => item.deal.outcome === 'redeemed' || item.deal.outcome === 'forfeited',
  );
  const repaid = settled.filter((item) => item.deal.outcome === 'redeemed').length;
  return (
    <ListCard
      title={`${items.length.toString()} pawns`}
      pill={
        settled.length > 0 ? (
          <SoftPill>{`${repaid.toString()} of ${settled.length.toString()} repaid`}</SoftPill>
        ) : undefined
      }
    >
      {items.map(({ packId, index, deal }) => {
        const lead = deal.collateral[0];
        const outcome = DEAL_STATUS[deal.outcome];
        return (
          <ListRow
            key={packId}
            href={packPath(packId)}
            icon={<CoinTile symbol={lead?.symbol ?? null} />}
            title={`Pack #${index} · ${lead === undefined ? 'empty' : amountText(lead)}`}
            meta={[deal.termNs === null ? null : termText(deal.termNs), when(deal)]
              .filter((part) => part !== null && part !== '')
              .join(' · ')}
            value={deal.principal === null ? '–' : cashText(deal.principal)}
            valueNote={deal.repayment === null ? undefined : `Repays ${cashText(deal.repayment)}`}
            trailing={
              <StatusPill tone={outcome.tone} icon={outcome.icon}>
                {outcome.label}
              </StatusPill>
            }
          />
        );
      })}
    </ListCard>
  );
}
