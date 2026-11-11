import { QuestionIcon } from '@phosphor-icons/react/dist/ssr';

import { ButtonLink, FaqItem, Reveal, Section, Tag, WordReveal } from '@mosaec/ui';

import { SITE } from '../../../lib/site';

import styles from './Faq.module.css';

const QUESTIONS = [
  {
    q: 'What happens when the ZEC price falls?',
    a: 'Nothing happens on chain. The pack reads only the date and the payment.',
  },
  {
    q: 'What if I miss the date?',
    a: 'The Ticket expires and the Title holder owns the coins in the pack. The USDC you received stays yours, and you owe nothing further: the pack is the whole of the debt.',
  },
  {
    q: 'Why would a lender fill a pawn?',
    a: 'A lender gets a fixed repayment on a fixed date, backed by coins worth about twice the loan, with no oracle to manipulate and no liquidation race to win. The Title can be sold before the date.',
  },
  {
    q: 'What does it cost?',
    a: 'The protocol fee is zero in this release. You pay NEAR gas, which is a fraction of a cent, plus the bridge fee when you withdraw coins to their home chain.',
  },
  {
    q: 'Is Mosaec live and audited?',
    a: 'Mosaec runs on NEAR testnet with test ZEC and USDC, so every step is free to try. The contracts have had an internal review only, and the full source is public under the MIT licence.',
  },
] as const;

export function Faq() {
  return (
    <Section id="faq" label="Questions">
      <div className={styles.grid}>
        <div className={styles.left}>
          <Reveal>
            <Tag
              badge="6"
              shape={<QuestionIcon weight="bold" size={16} color="var(--ill-orange)" />}
            >
              FAQ
            </Tag>
          </Reveal>
          <WordReveal className="t-h1" lines={['Questions,', 'answered.']} />
          <Reveal as="p" className="t-body-lg">
            How a pawn behaves when prices move, dates pass or rights change hands.
          </Reveal>
          <Reveal className={styles.help}>
            <span className="t-h5">Still curious?</span>
            <span className="t-body-sm">
              Write to the team and get an answer from the people who built it.
            </span>
            <ButtonLink href={`mailto:${SITE.supportEmail}`} size="sm" showIcon>
              Email Support
            </ButtonLink>
          </Reveal>
        </div>
        <div className={styles.items}>
          {QUESTIONS.map((item) => (
            <FaqItem key={item.q} question={item.q}>
              {item.a}
            </FaqItem>
          ))}
        </div>
      </div>
    </Section>
  );
}
