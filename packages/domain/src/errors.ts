/**
 * The Mosaec error catalog: the single source for every code a contract, the API or the lending
 * desk returns. Contract codes mirror `MosaecError` in `contracts/shared/src/error.rs`; a test
 * fails when either side has a code the other lacks.
 */

export type ErrorSource = 'contract' | 'api' | 'desk';

export interface CatalogEntry {
  readonly source: ErrorSource;
  /** HTTP status the API answers with when this error reaches a client. */
  readonly httpStatus: number;
  /** Plain words for the person using the app. */
  readonly message: string;
  /** True when the same request may succeed on a later try without any change. */
  readonly retryable: boolean;
}

const contract = (httpStatus: number, message: string, retryable = false): CatalogEntry => ({
  source: 'contract',
  httpStatus,
  message,
  retryable,
});

const api = (httpStatus: number, message: string, retryable = false): CatalogEntry => ({
  source: 'api',
  httpStatus,
  message,
  retryable,
});

const desk = (message: string): CatalogEntry => ({
  source: 'desk',
  httpStatus: 422,
  message,
  retryable: false,
});

export const ERROR_CATALOG = {
  E_KEYS: contract(409, 'This pack holds a signing key, so it is unsafe to use.'),
  E_PRED_AUTH_OFF: contract(409, 'This pack has direct account access turned off.'),
  E_VERIFIER_LOCKED: contract(423, 'NEAR Intents has locked this pack.', true),
  E_CONTENTS: contract(409, 'The pack contents changed since the offer was made.'),
  E_TERMS: contract(422, 'The terms differ from the offer or sit outside the allowed range.'),
  E_PENDING: contract(409, 'Another transfer on this pawn is still settling.', true),
  E_EXPIRED: contract(410, 'The offer or the term has ended.'),
  E_HOLDER: contract(403, 'Only the holder of the required Title or Ticket can do this.'),
  E_STATE: contract(409, 'The pawn is in a stage that refuses this action.'),
  E_CAP: contract(422, 'The amount is above the per-pack limit.'),
  E_NOT_VERIFIER: contract(403, 'Only NEAR Intents can send this transfer.'),
  E_NOT_PACK: contract(403, 'Only a Mosaec pack can make this call.'),
  E_NOT_REGISTRY: contract(403, 'Only the Mosaec registry can make this call.'),
  E_TOKEN: contract(422, 'This token is outside the supported list.'),
  E_AMOUNT: contract(422, 'The amount is zero or differs from the required value.'),
  E_MSG: contract(400, 'The transfer message is unreadable.'),
  E_STORAGE: contract(402, 'The attached NEAR is too little to cover storage.'),
  E_MIN_WITHDRAW: contract(422, 'The withdrawal is below the bridge minimum.'),
  E_BATCH: contract(422, 'Too many tokens, or one token listed twice.'),
  E_SELF_FILL: contract(422, 'The lender and the borrower are the same account.'),
  E_GAS: contract(422, 'The transaction carries too little gas for every step.'),
  E_GRACE: contract(409, 'The grace window is open, so the pawn stays live until it ends.'),
  E_PAUSED: contract(503, 'New pawns are paused.', true),
  E_NOT_GUARDIAN: contract(403, 'Only the guardian can do this.'),

  AUTH_NONCE: api(401, 'The sign-in request has expired. Sign in again.'),
  AUTH_SIGNATURE: api(401, 'The signature does not match this account.'),
  AUTH_KEY: api(401, 'The signing key is not a full-access key of this account.'),
  AUTH_SESSION: api(401, 'Your session has ended. Sign in again.'),
  CSRF: api(403, 'The request is missing its security token. Reload the page.'),
  RATE_LIMITED: api(429, 'Too many requests. Try again in a minute.', true),
  FAUCET_ACCOUNT_USED: api(429, 'This account already received test tokens today.'),
  FAUCET_IP_USED: api(429, 'Test tokens already went to this network today. Try again tomorrow.'),
  FAUCET_DAILY_CAP: api(429, 'The faucet gave out its daily amount. Try again tomorrow.'),
  FAUCET_NO_ACCOUNT: api(404, 'No NEAR testnet account has this name. Check the spelling.'),
  FAUCET_LOW: api(503, 'The faucet is being refilled. Try again later.', true),
  NOT_FOUND: api(404, 'Nothing exists at this address.'),
  VALIDATION: api(400, 'Some fields are invalid.'),
  UPSTREAM_RPC: api(502, 'The NEAR node is unreachable right now.', true),
  PRICE_UNAVAILABLE: api(503, 'Price unavailable.', true),
  INTERNAL: api(500, 'Something failed on our side. Try again.', true),

  DESK_POLICY: desk('The lending desk policy declines this pawn.'),
  DESK_BUDGET: desk('The lending desk budget is spent for now.'),
  DESK_EXPOSURE: desk('The lending desk holds its limit for this asset.'),
  DESK_PAUSED: desk('The lending desk is paused.'),
  DESK_AGENT: desk('The lending desk agent did not answer; nothing was signed.'),
} as const satisfies Record<string, CatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export const ERROR_CODES = Object.keys(ERROR_CATALOG) as ErrorCode[];

/** Codes a Mosaec contract can return, in catalog order. */
export const CONTRACT_ERROR_CODES = ERROR_CODES.filter(
  (code) => ERROR_CATALOG[code].source === 'contract',
);

export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CATALOG, value);
}

/** Pulls a contract code out of a failure message such as `Smart contract panicked: E_CAP: ...`. */
export function contractCodeIn(message: string): ErrorCode | undefined {
  const match = /\b(E_[A-Z_]+):/.exec(message);
  const code = match?.[1];
  return code !== undefined && isErrorCode(code) ? code : undefined;
}

/** A catalogued failure that services throw and the API error middleware renders. */
export class MosaecError extends Error {
  override readonly name = 'MosaecError';
  readonly code: ErrorCode;
  readonly entry: CatalogEntry;

  constructor(code: ErrorCode, options?: ErrorOptions) {
    super(`${code}: ${ERROR_CATALOG[code].message}`, options);
    this.code = code;
    this.entry = ERROR_CATALOG[code];
  }
}
