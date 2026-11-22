# Contributing to Outpost

Outpost is MIT-licensed; by contributing you agree your contribution is licensed under
the same terms ([LICENSE](LICENSE)). See the [code of conduct](CODE_OF_CONDUCT.md).

## Setting up

You need **Node.js 26 or newer** and **pnpm 9**. Node 26 does not include Corepack;
install pnpm with `npm install --global pnpm@9`.

```bash
git clone https://github.com/<your-username>/outpost.git   # your fork
cd outpost
pnpm install
pnpm dev
```

`pnpm dev` runs the API server on <http://localhost:8080> (TypeScript run directly,
restarting on change, reading `.env` if present) and the web app on
<http://localhost:5173>, which proxies `/api` and `/kiwix`. Data goes to
`apps/server/data`, which git ignores.

Optional: `node scripts/fetch-map-assets.mjs` (map labels and icons) and
`node scripts/fetch-embedding-model.mjs` (search by meaning, 24 MB; without it the tests
that need it are skipped). Reference collections need `kiwix-serve`, with
`OUTPOST_KIWIX_BIN` set to its path.

## Where things are

`apps/server/` (Fastify, SQLite), `apps/web/` (React, Vite, Tailwind), `packages/shared/`
(API types used by both), `catalog/` (manifests), `scripts/`, `e2e/` (Playwright),
`docs/`. Before changing code read [architecture.md](docs/architecture.md),
[server-modules.md](docs/development/server-modules.md) (adding a module or route),
[web-screens.md](docs/development/web-screens.md) (adding a screen), and
[PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md), whose rules are not optional.

## Checks

There is no build service: run every check yourself, from the repository root, in this
order (`pnpm e2e` tests the app `build-app.mjs` has just written):

```bash
pnpm lint                              # Biome; `pnpm format` fixes
pnpm typecheck
pnpm --filter @outpost/server test     # a real server on temporary folders, no network
pnpm --filter @outpost/web test
pnpm catalog:validate
node scripts/build-app.mjs
pnpm --filter @outpost/e2e exec playwright install chromium   # once
pnpm e2e                               # the packaged app, internet blocked
```

One server test file: `cd apps/server && pnpm exec vitest run test/search.test.ts`. The
browser tests use ports 8471 and 8473 to 8478; `OUTPOST_E2E_SOURCE=1` runs them against the
source after `pnpm build`. To run two suites at once, give the second ports of its own
(`OUTPOST_E2E_PORT=8910 OUTPOST_E2E_FILES_PORT=8912`): it then writes its traces and
screenshots to `e2e/test-results-8910` rather than `e2e/test-results`, which each run
empties when it starts. `OUTPOST_E2E_OUTPUT` names another folder. If you could not run a check, say so in the pull request.

Tests must not reach the internet: use a local `http.createServer` fixture,
`createTestApp()` from `apps/server/test/helpers.ts`, and `tempDir()` from
`apps/server/test/temp.ts`. Add a test with any change in behaviour.

## Conventions

- Server code is TypeScript run by Node: `.ts` import extensions, erasable syntax only
  (no `enum`, no parameter properties). Validate input with zod at the route, throw
  `AppError` for anything a person should see, make long work a job, and pass request
  paths through `resolveInside`.
- Never move, overwrite or delete a person's files as a side effect. Never add an
  outbound request that is not the direct result of a person's action, a CDN, a remote
  font or analytics.
- Schema changes: edit `apps/server/src/db/schema.ts`, then
  `pnpm --filter @outpost/server db:generate --name what_changed`. Never edit a shipped
  migration.
- Words are for people: say what happened and what to do next, in British spelling and
  sentence case, with no marketing. Do not claim more than is true.
- New dependencies must be MIT, ISC, BSD or Apache-2.0
  ([dependency licences](docs/architecture.md#dependency-licences)).

## Pull requests

One subject each, with a short imperative commit subject ("Add offline place search").
Say what changes, why, how you tested it and on which system; screenshots in light, dark
and phone width help. Update `docs/` and [CHANGELOG.md](CHANGELOG.md) when behaviour
changes. Catalogue entries follow [catalog/README.md](catalog/README.md).

## Issues

Use GitHub issues. For a bug give the version, how you run Outpost, your operating
system, what you did, expected and got, and the relevant log lines; check
[troubleshooting.md](docs/troubleshooting.md) first. Maintainers track work with `bd`
([AGENTS.md](AGENTS.md)); contributors do not need it. Report security problems
privately, as [SECURITY.md](SECURITY.md) describes.
