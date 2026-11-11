import { CardsIcon, StampIcon, TicketIcon } from '@phosphor-icons/react/dist/ssr';

import { NftCard, Reveal, Section, Tag, WordReveal, cx } from '@mosaec/ui';

import { EXAMPLE_PAWN as E } from '../_content/facts';

import styles from './TwoRights.module.css';

const RIGHTS = [
  {
    kind: 'title',
    className: styles.titleCard,
    value: `${E.collateral} ZEC`,
    meta: 'Owns the pack',
    icon: <StampIcon size={22} weight="fill" />,
    name: 'Title',
    body: 'Owns the pack and everything in it. Sell it to borrow; hold it to lend.',
  },
  {
    kind: 'ticket',
    className: styles.ticketCard,
    value: `${E.repayment} USDC`,
    meta: `Within ${E.termDays.toString()} days`,
    icon: <TicketIcon size={22} weight="fill" />,
    name: 'Ticket',
    body: 'Takes the contents for a fixed payment before a fixed date. Hold it to redeem; sell it to step out early.',
  },
] as const;

export function TwoRights() {
  return (
    <Section id="rights" label="Two rights">
      <div className={styles.panel}>
        <Reveal>
          <Tag badge="5" shape={<CardsIcon weight="fill" size={16} color="var(--ill-lime)" />}>
            Title and Ticket
          </Tag>
        </Reveal>
        <WordReveal className="t-h1" lines={['One pack, two rights.']} />
        <Reveal as="p" className={cx('t-body-lg', styles.lead)}>
          Both are standard NEAR NFTs. They trade on any marketplace, sit in any wallet and settle
          against the same sealed pack, so a loan changes hands as easily as a token.
        </Reveal>
        <div className={styles.stage}>
          {RIGHTS.map((right) => (
            <Reveal key={right.kind} className={styles.right}>
              <div className={styles.cardWrap}>
                <NftCard
                  kind={right.kind}
                  tokenLabel="Pack #0"
                  value={right.value}
                  meta={right.meta}
                  icon={right.icon}
                  notch="var(--bg-secondary)"
                  className={right.className}
                />
              </div>
              <h3 className="t-h4">{right.name}</h3>
              <p className="t-body">{right.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
