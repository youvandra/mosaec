import {
  ArrowsClockwiseIcon,
  CalculatorIcon,
  ListMagnifyingGlassIcon,
  PenNibIcon,
  PlugsConnectedIcon,
  ScrollIcon,
  SealCheckIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

import { AppIcon, ButtonLink, Tag } from '@mosaec/ui';

import { SITE } from '../../../lib/site';
import { ListCard, ListRow, SoftPill } from '../_components/ListCard';
import { PageHeader, PageSection } from '../_components/PageHeader';
import { appPath } from '../_components/routes';
import { Terminal } from '../_components/Terminal';

import styles from './agents.module.css';

import type { CodeLine } from '../_components/Terminal';

export const metadata = {
  title: 'Connect Your Agent',
  description:
    'Plug any MCP agent into Mosaec: read the book, price pawns and fill them from your own account.',
};

const CONFIG = JSON.stringify(
  { mcpServers: { mosaec: { type: 'http', url: SITE.deskMcpUrl } } },
  null,
  2,
);
const CLI = `claude mcp add --transport http mosaec ${SITE.deskMcpUrl}`;

const CONFIG_LINES: readonly CodeLine[] = [
  [['punct', '{']],
  [
    ['plain', '  '],
    ['key', '"mcpServers"'],
    ['punct', ': {'],
  ],
  [
    ['plain', '    '],
    ['key', '"mosaec"'],
    ['punct', ': {'],
  ],
  [
    ['plain', '      '],
    ['key', '"type"'],
    ['punct', ': '],
    ['str', '"http"'],
    ['punct', ','],
  ],
  [
    ['plain', '      '],
    ['key', '"url"'],
    ['punct', ': '],
    ['str', `"${SITE.deskMcpUrl}"`],
  ],
  [
    ['plain', '    '],
    ['punct', '}'],
  ],
  [
    ['plain', '  '],
    ['punct', '}'],
  ],
  [['punct', '}']],
];

const TOOLS = [
  {
    name: 'list_offers',
    body: 'Every open pawn, live.',
    icon: <ListMagnifyingGlassIcon weight="fill" />,
    color: 'blue' as const,
  },
  {
    name: 'quote_offer',
    body: 'Rate, loan to value, and any rule it breaks.',
    icon: <CalculatorIcon weight="fill" />,
    color: 'violet' as const,
  },
  {
    name: 'prepare_fill',
    body: 'One call to sign with your key.',
    icon: <PenNibIcon weight="fill" />,
    color: 'green' as const,
  },
  {
    name: 'desk_policy',
    body: 'The house rules, as data.',
    icon: <ScrollIcon weight="fill" />,
    color: 'orange' as const,
  },
];

const STEPS = [
  {
    title: 'Read the book',
    body: 'Numbers only. Your agent picks.',
    icon: <ListMagnifyingGlassIcon weight="fill" />,
  },
  {
    title: 'Sign with your key',
    body: 'Mosaec never holds your key.',
    icon: <PenNibIcon weight="fill" />,
  },
  {
    title: 'Settle or refund',
    body: 'Any mismatch refunds the USDC.',
    icon: <ArrowsClockwiseIcon weight="fill" />,
  },
];

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        eyebrow={
          <Tag
            badge="MCP"
            shape={<PlugsConnectedIcon weight="fill" size={16} color="var(--ill-lime)" />}
          >
            Connect Your Agent
          </Tag>
        }
        title="Bring your agent,"
        accent="lend inside the rules."
        lead="Plug in any MCP agent. It reads, prices and fills from your own wallet."
        actions={
          <ButtonLink href={appPath('/desk')} as={Link} variant="secondary" showIcon>
            See the House Desk
          </ButtonLink>
        }
      />

      <div className={styles.connect}>
        <Terminal
          file="mcp.json"
          lines={CONFIG_LINES}
          copy={CONFIG}
          command={CLI}
          output={[
            <>
              <span className="ok">[ok]</span> list_offers, quote_offer
            </>,
            <>
              <span className="ok">[ok]</span> prepare_fill, desk_policy
            </>,
          ]}
        />
        <div className={styles.guarantees}>
          <span className="t-h5">Always true</span>
          {[
            ['Coins stay sealed', 'Only the date or the repayment moves them.'],
            ['Wrong fill, full refund', 'Off by one unit, the USDC comes back.'],
            ['Terms never move', 'Fixed at fill. No price feed.'],
          ].map(([title, body]) => (
            <div key={title} className={styles.guarantee}>
              <ShieldCheckIcon size={18} weight="fill" />
              <span>
                <span className="t-label">{title}</span>
                <span className="t-caption">{body}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <PageSection
        title="Four tools, no keys"
        tag={
          <Tag
            badge="1"
            shape={<SealCheckIcon weight="fill" size={16} color="var(--ill-orange)" />}
          >
            Tools
          </Tag>
        }
        lead="Read and prepare. Spending always needs your signature."
      >
        <ListCard title="mosaec · MCP" pill={<SoftPill tone="positive">Testnet</SoftPill>}>
          {TOOLS.map((tool) => (
            <ListRow
              key={tool.name}
              icon={
                <AppIcon color={tool.color} size={36}>
                  {tool.icon}
                </AppIcon>
              }
              title={<code className={styles.toolName}>{tool.name}</code>}
              meta={tool.body}
            />
          ))}
        </ListCard>
      </PageSection>

      <PageSection
        title="How a fill works"
        tag={
          <Tag
            badge="2"
            shape={<ArrowsClockwiseIcon weight="fill" size={16} color="var(--ill-lime)" />}
          >
            Flow
          </Tag>
        }
      >
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <div className={styles.stepTop}>
                <AppIcon color="ink" size={40}>
                  {step.icon}
                </AppIcon>
                <span className={styles.stepNum}>{(index + 1).toString().padStart(2, '0')}</span>
              </div>
              <span className="t-h4">{step.title}</span>
              <p className="t-body-sm">{step.body}</p>
            </li>
          ))}
        </ol>
      </PageSection>
    </>
  );
}
