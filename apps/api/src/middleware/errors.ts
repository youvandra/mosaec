import { ZodError } from 'zod';

import { ERROR_CATALOG, MosaecError } from '@mosaec/domain';

import type { ErrorCode } from '@mosaec/domain';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ErrorBody {
  readonly error: { readonly code: ErrorCode; readonly message: string; readonly issues?: unknown };
}

function respond(c: Context, code: ErrorCode, issues?: unknown): Response {
  const entry = ERROR_CATALOG[code];
  const body: ErrorBody = {
    error: { code, message: entry.message, ...(issues === undefined ? {} : { issues }) },
  };
  return c.json(body, entry.httpStatus as ContentfulStatusCode);
}

/** The one place a failure becomes an HTTP response, always with a catalog code. */
export function errorHandler(log: (fields: Record<string, unknown>) => void) {
  return (err: Error, c: Context): Response => {
    if (err instanceof MosaecError) {
      if (err.entry.httpStatus >= 500) {
        log({ code: err.code, cause: String(err.cause) });
      }
      return respond(c, err.code);
    }
    if (err instanceof ZodError) {
      return respond(
        c,
        'VALIDATION',
        err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    log({ code: 'INTERNAL', error: String(err), stack: err.stack });
    return respond(c, 'INTERNAL');
  };
}

export function notFound(c: Context): Response {
  return respond(c, 'NOT_FOUND');
}
