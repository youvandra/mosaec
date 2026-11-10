Mosaec is a pawn ticket for native assets.

Each position is a keyless NEAR account that holds native assets inside NEAR Intents, split into two NFTs. The Title owns the account. The Ticket is the right to take the account's contents by paying a fixed amount before a fixed date. Selling the Title while keeping the Ticket is a loan against the assets with no price oracle and no liquidation: the only event that matters is whether the Ticket holder pays by the date.

Status: in development. Nothing in this repository is deployed yet.

## Repository layout

| Path              | Contents                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `contracts/`      | Cargo workspace: `shared`, `pack`, `registry` contracts and the `tests` integration crate   |
| `contracts/res/`  | Pinned contract bytes used by integration tests, each with a sha256 file                    |
| `apps/web`        | Next.js 15 App Router web app, root layout and not-found page only                          |
| `apps/api`        | Hono HTTP API on Node 22, no routes yet                                                     |
| `apps/indexer`    | Chain indexer, entry point only                                                             |
| `packages/config` | Environment schema (`env.ts`), shared TypeScript, ESLint, Prettier and Vitest configuration |
| `packages/domain` | Domain types and the error catalog, empty so far                                            |
| `packages/sdk`    | TypeScript client for the contracts, empty so far                                           |
| `packages/ui`     | React component library, empty so far                                                       |
| `vendor/intents`  | NEAR Intents verifier source, a git submodule pinned at tag `defuse/v0.4.5`                 |
| `scripts/`        | Repository checks                                                                           |

## Development

Prerequisites: Node 22 (see `.nvmrc`), pnpm 10 (`corepack enable`), rustup (the toolchain in `contracts/rust-toolchain.toml` installs on first use), [cargo-near](https://github.com/near/cargo-near) 0.23 and [gitleaks](https://github.com/gitleaks/gitleaks) for the pre-push hook.

```sh
git clone --recurse-submodules https://github.com/youvandra/mosaec.git
cd mosaec
pnpm install        # also points git at .githooks
cp .env.example .env

pnpm lint           # ESLint and Prettier
pnpm typecheck
pnpm test
pnpm build

cd contracts
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
(cd pack && cargo near build non-reproducible-wasm)
```

`scripts/check-private.test.sh` tests the pre-push check in a temporary repository.

## License

MIT, see [LICENSE](LICENSE).
