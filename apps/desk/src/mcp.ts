import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

// The SDK publishes these subpaths through a wildcard export the import resolver cannot follow.
// eslint-disable-next-line import-x/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import-x/no-unresolved
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import type { DeskService, OfferReview } from './desk-service';
import type { IncomingMessage, Server } from 'node:http';

const PACK = z.string().min(3).max(64).describe('Pack account id, such as 3.v0.mosaec.testnet');

/** Tool output as JSON with every integer amount and time as a string, so no client loses digits. */
function text(value: unknown) {
  const json = JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
  return { content: [{ type: 'text' as const, text: json }] };
}

function review(item: OfferReview) {
  return {
    pack: item.offer.pack,
    maker: item.offer.makerId,
    principal: item.offer.price,
    repayment: item.offer.kAmount,
    term_ns: item.offer.termNs,
    open_until_ns: item.offer.openUntilNs,
    contents: item.offer.contents,
    desk_verdict: item.verdict.ok
      ? { ok: true }
      : { ok: false, code: item.verdict.code, reason: item.verdict.reason },
    quote: item.verdict.quote,
  };
}

/**
 * Builds the desk's MCP server. Every caller gets the read tools and `prepare_fill`, which returns
 * the exact call to sign with the caller's own key. `fill_offer`, which spends the desk budget,
 * is registered only for a caller holding the desk token.
 */
export function deskMcp(service: DeskService, canSpend: boolean): McpServer {
  const server = new McpServer({ name: 'mosaec-desk', version: '0.1.0' });

  server.registerTool(
    'desk_policy',
    {
      description:
        'The rules every desk fill passes: assets, loan-to-value, rate, term and budget.',
    },
    () => text(service.policy),
  );

  server.registerTool(
    'list_offers',
    {
      description:
        'Every open pawn, read live from the registry, with the price, repayment, term and the desk policy verdict.',
    },
    async () => text((await service.reviewOffers()).map(review)),
  );

  server.registerTool(
    'quote_offer',
    {
      description:
        'Prices one pawn: APR, loan-to-value against a reference price, and the policy verdict.',
      inputSchema: { pack: PACK },
    },
    async ({ pack }) => {
      const item = await service.quote(pack);
      return text(item === null ? { error: 'The pack is not offered.' } : review(item));
    },
  );

  server.registerTool(
    'prepare_fill',
    {
      description:
        'The exact function call that fills a pawn from your own NEAR account: receiver, method, JSON args, gas and the 1 yoctoNEAR deposit. Sign it with your key; a mismatch refunds the USDC.',
      inputSchema: { pack: PACK },
    },
    async ({ pack }) => {
      const call = await service.prepareFill(pack);
      return text(call ?? { error: 'The pack is not offered.' });
    },
  );

  if (canSpend) {
    server.registerTool(
      'fill_offer',
      {
        description:
          'Fills a pawn from the desk account. The server re-checks the policy on live chain data before it signs and refuses with DESK_POLICY, DESK_BUDGET, DESK_EXPOSURE or DESK_PAUSED.',
        inputSchema: { pack: PACK, reason: z.string().max(280) },
      },
      async ({ pack, reason }) => text(await service.fill(pack, randomUUID(), 'mcp', reason)),
    );
  }
  return server;
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw === '' ? undefined : (JSON.parse(raw) as unknown);
}

/** Stateless Streamable HTTP endpoint at `/mcp`; one server per request. */
export function serveMcp(
  service: DeskService,
  port: number,
  deskToken: string | undefined,
): Server {
  const http = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
        return;
      }
      if (!req.url?.startsWith('/mcp')) {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' }).end();
        return;
      }
      const canSpend =
        deskToken !== undefined && req.headers.authorization === `Bearer ${deskToken}`;
      const server = deskMcp(service, canSpend);
      const transport = new StreamableHTTPServerTransport({});
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, await body(req));
      } catch {
        if (!res.headersSent) res.writeHead(400).end();
      }
    })();
  });
  http.listen(port, '127.0.0.1');
  return http;
}
