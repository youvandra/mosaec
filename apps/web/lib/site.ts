/** Public URLs and identity of the site. Hosts come from the environment so staging can differ. */
export const SITE = {
  name: 'Mosaec',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mosaec.finance',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '/app',
  sourceUrl: 'https://github.com/youvandra/mosaec',
  supportEmail: 'support@mosaec.finance',
  securityEmail: 'security@mosaec.finance',
  description:
    'Mosaec is a pawn ticket for native assets on NEAR: a sealed account holds your coins, a Title NFT owns them and a Ticket NFT buys them back by a date.',
} as const;
