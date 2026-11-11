/** Gas in gas units. 1 Tgas = 10^12 gas. */
export const TGAS = 1_000_000_000_000n;

/** The most gas one transaction may carry. */
export const MAX_TX_GAS = 300n * TGAS;

/**
 * Gas each builder attaches. Sandbox measurements (fill 38, exercise 24, withdraw 11, expire 7
 * Tgas) sit well under these; chains that wait on the verifier get the full 300 Tgas so a
 * congested callback never starves.
 */
export const GAS = {
  mint: 100n * TGAS,
  offer: 150n * TGAS,
  cancel: 50n * TGAS,
  fill: MAX_TX_GAS,
  exercise: MAX_TX_GAS,
  deposit: 50n * TGAS,
  withdraw: 150n * TGAS,
  expire: 150n * TGAS,
  recordDisruption: 50n * TGAS,
  claim: 100n * TGAS,
  claimPayout: 100n * TGAS,
  nftTransfer: 30n * TGAS,
  verifierDeposit: 100n * TGAS,
  verifierWithdraw: 100n * TGAS,
  storageDeposit: 30n * TGAS,
} as const;

/**
 * Floors from `contracts/shared/src/constants.rs`: below these the contract refuses with `E_GAS`.
 * A builder refuses to produce a call under its floor.
 */
export const GAS_FLOOR = {
  mint: 35n * TGAS,
  command: 75n * TGAS,
  recordDisruption: 20n * TGAS,
  claim: 30n * TGAS,
} as const;
