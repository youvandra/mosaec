import { createServer } from 'node:http';

// The SDK publishes this subpath through a wildcard export the import resolver cannot follow.
// eslint-disable-next-line import-x/no-unresolved
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import {
  MCP_REQUESTS_PER_MINUTE,
  OFFERS_CACHE_MS,
  cached,
  deskMcp,
  holdsToken,
  mcpLimiter,
} from './mcp';

import type { DeskService, OfferReview } from './desk-service';
import type { InstantDesk } from './instant';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

/** Largest request body the server reads; calls here are a few hundred bytes. */
export const MAX_BODY_BYTES = 64 * 1024;

class BodyTooLarge extends Error {}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw === '' ? undefined : (JSON.parse(raw) as unknown);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const text = JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
  res.writeHead(status, { 'content-type': 'application/json' }).end(text);
}

const units = z
  .string()
  .regex(/^\d{1,39}$/, 'a base-10 integer string')
  .transform(BigInt);
const asset = z.enum(['ZEC', 'BTC', 'SOL']);
const account = z.string().min(2).max(64);

const quoteQuery = z.object({
  asset,
  amount: units,
  term: units,
  principal: units.optional(),
  borrower: account.optional(),
});

const fillBody = z.object({
  pack: account,
  quoteId: z.string().regex(/^[0-9a-f]{64}$/),
  network: z.string(),
  asset,
  amount: units,
  principal: units,
  repayment: units,
  termNs: units,
  expiresAtMs: z.number().int().positive(),
  cardId: z.string().regex(/^\d{1,20}$/),
});

/**
 * Instant routes are for the Mosaec API on the same host only. Caddy adds `x-forwarded-for` to
 * everything it proxies, so a request carrying it came from outside and is answered as unknown.
 */
async function instantRoute(
  req: IncomingMessage,
  res: ServerResponse,
  instant: InstantDesk,
): Promise<void> {
  if (req.headers['x-forwarded-for'] !== undefined) {
    res.writeHead(404).end();
    return;
  }
  const url = new URL(req.url ?? '/', 'http://desk.local');
  if (url.pathname === '/instant/quote' && req.method === 'GET') {
    const query = quoteQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) {
      json(res, 400, { code: 'VALIDATION', issues: query.error.issues });
      return;
    }
    const { term, ...rest } = query.data;
    json(res, 200, await instant.quote({ ...rest, termNs: term }));
    return;
  }
  if (url.pathname === '/instant/fill' && req.method === 'POST') {
    const parsed = fillBody.safeParse(await body(req));
    if (!parsed.success) {
      json(res, 400, { code: 'VALIDATION', issues: parsed.error.issues });
      return;
    }
    json(res, 200, await instant.fill(parsed.data));
    return;
  }
  res.writeHead(404).end();
}

async function mcpRoute(
  req: IncomingMessage,
  res: ServerResponse,
  service: DeskService,
  canSpend: boolean,
  listOffers: () => Promise<readonly OfferReview[]>,
): Promise<void> {
  const server = deskMcp(service, canSpend, listOffers);
  const transport = new StreamableHTTPServerTransport({});
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, await body(req));
}

/**
 * The desk's HTTP server on loopback: `/health`, the stateless MCP endpoint at `/mcp` (proxied
 * publicly) and the instant loan routes (local only).
 */
export function serveDesk(
  service: DeskService,
  instant: InstantDesk,
  port: number,
  deskToken: string | undefined,
): Server {
  const allow = mcpLimiter(MCP_REQUESTS_PER_MINUTE);
  const listOffers = cached(() => service.reviewOffers(), OFFERS_CACHE_MS);
  const http = createServer((req, res) => {
    void (async () => {
      try {
        if (req.url === '/health') {
          json(res, 200, { ok: true });
          return;
        }
        if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
          res.writeHead(413).end();
          return;
        }
        if (req.url?.startsWith('/instant/')) {
          await instantRoute(req, res, instant);
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
        const forwarded = req.headers['x-forwarded-for'];
        const address =
          (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
          req.socket.remoteAddress ??
          'direct';
        if (!allow(address)) {
          res.writeHead(429, { 'retry-after': '60' }).end();
          return;
        }
        const canSpend = holdsToken(req.headers.authorization, deskToken);
        await mcpRoute(req, res, service, canSpend, listOffers);
      } catch (cause) {
        if (!res.headersSent) {
          if (cause instanceof BodyTooLarge) res.writeHead(413).end();
          else if (cause instanceof SyntaxError) res.writeHead(400).end();
          else json(res, 500, { code: 'INTERNAL' });
        }
        console.error(
          JSON.stringify({ level: 'error', message: 'desk request failed', cause: String(cause) }),
        );
      }
    })();
  });
  http.listen(port, '127.0.0.1');
  return http;
}
