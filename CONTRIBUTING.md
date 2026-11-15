# Contributing to Outpost

Thank you for wanting to help. This page covers setting up, finding your way around,
running the tests, and what a change needs before it can be merged.

Outpost is MIT-licensed. By contributing you agree that your contribution is licensed
under the same terms (see [LICENSE](LICENSE)). Please also read the
[code of conduct](CODE_OF_CONDUCT.md).

## Setting up

You need **Node.js 24 or newer** and **pnpm 9**. Nothing is compiled during
installation: SQLite arrives as a prebuilt binary.

```bash
git clone https://github.com/<your-username>/outpost.git   # your fork
cd outpost
pnpm install
pnpm dev
```

`pnpm dev` starts two things:

| What | Address | Notes |
| --- | --- | --- |
| The API server | <http://localhost:8080> | Runs the TypeScript source directly and restarts when a file changes. Reads `.env` in the repository root if there is one. |
| The web app (Vite) | <http://localhost:5173> | Open this one. It proxies `/api` and `/kiwix` to the server. |

Data goes to `apps/server/data`, which git ignores. To use other ports or a scratch
data directory, see "Checking your work" in
[docs/development/web-screens.md](docs/development/web-screens.md).

Two optional extras:

```bash
node scripts/fetch-map-assets.mjs     # map fonts and icons; without them maps have no labels
```

and, for reference collections, a `kiwix-serve` program with `OUTPOST_KIWIX_BIN` set
to its path (see [docs/deployment.md](docs/deployment.md#reference-collections-without-docker)).

## Project layout

```
apps/server/     the API server: Node 24, TypeScript, Fastify, SQLite
apps/web/        the web app: React, Vite, Tailwind
packages/shared/ API types and pure helpers used by both
catalog/         catalogue manifests, their schema, map region presets
scripts/         packaged-app build, map asset fetch
e2e/             browser tests (Playwright)
docs/            documentation
```

Read these before changing code:

- [docs/architecture.md](docs/architecture.md): how the system fits together, the
  decisions behind it, and its limits.
- [docs/development/server-modules.md](docs/development/server-modules.md): the
  contract a server module works to. **Adding a module or a route starts here.**
- [docs/development/web-screens.md](docs/development/web-screens.md): how screens are
  built. **Adding a screen starts here.**
- [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md): who Outpost is for and why it
  looks the way it does. The design rules are not optional.

## Running the tests

| What | Command | Notes |
| --- | --- | --- |
| Server tests | `pnpm --filter @outpost/server test` | Vitest. Each test gets a real server on a temporary directory. No network. |
| Web tests | `pnpm --filter @outpost/web test` | Vitest with Testing Library. |
| Everything above | `pnpm test` | Runs each package's tests in turn. |
| Type checking | `pnpm typecheck` | All packages. |
| Catalogue | `pnpm catalog:validate` | Format, ids, hosts and the schema file. |
| Browser tests | `pnpm e2e` | Playwright, against the packaged app. See below. |

Run one server test file:

```bash
cd apps/server && pnpm exec vitest run test/search.test.ts
```

### Browser tests

The browser tests run a real browser against the **packaged app**, with the internet
blocked: any request to another host fails the test.

```bash
node scripts/fetch-map-assets.mjs
node scripts/build-app.mjs                                   # writes dist/app
pnpm --filter @outpost/e2e exec playwright install chromium  # once
pnpm e2e
```

They start their own servers on ports 8471 and 8472, on throwaway data directories.
To run against the source instead of the packaged app, build the web app
(`pnpm build`) and set `OUTPOST_E2E_SOURCE=1`.

### Rules for tests

- Tests must not reach the internet. Use a local `http.createServer` fixture.
- Use `createTestApp()` from `apps/server/test/helpers.ts` for a server on a temporary
  directory.
- Please add a test with any change in behaviour.

## Lint and format

Outpost uses [Biome](https://biomejs.dev) for both.

```bash
pnpm lint      # check
pnpm format    # fix what can be fixed
```

## Conventions that matter

- **Server code** is TypeScript run directly by Node: import with the `.ts` extension,
  and use only syntax that can be erased (no `enum`, no parameter properties).
- **Validate input with zod at the route.** Throw `AppError` for anything a person
  should see. Long work is a job. Paths from requests go through `resolveInside`.
- **Never** move, overwrite or delete a person's files as a side effect.
- **Never** add an outbound request that is not the direct result of a person's
  action, and never add a CDN, remote font or analytics call. The browser tests fail if
  the app reaches out.
- **Schema changes:** edit `apps/server/src/db/schema.ts`, then run
  `pnpm --filter @outpost/server db:generate -- --name what_changed`. Never edit a
  migration that has shipped.
- **Words:** messages are for people. Say what happened and what to do next. Use
  British spelling in user-facing text ("catalogue", "colour", "licence" as a noun),
  sentence case, and no marketing language.
- **Do not claim more than is true.** If something is partial, the interface and the
  documentation say so.

## Commits and pull requests

- Write commit subjects as a short imperative sentence in sentence case: "Add offline
  place search", "Fix resume after a dropped connection". Explain the why in the body
  when it is not obvious.
- Keep a pull request to one subject. Say what it changes, why, and how you tested it.
  Screenshots (light, dark and phone width) help for anything visible.
- Before opening it, run `pnpm lint`, `pnpm typecheck`, the server and web tests, and
  `pnpm catalog:validate`. CI runs these, the browser tests, the server tests on Linux
  ARM64, macOS and Windows, an image build for amd64 and arm64, a dependency audit and
  CodeQL.
- Update the documentation in `docs/` and the [changelog](CHANGELOG.md) when behaviour
  changes.
- New dependencies must be MIT, ISC, BSD or Apache-2.0 licensed. See "Dependency
  licences" in [docs/architecture.md](docs/architecture.md#dependency-licences).

## Contributing catalogue entries

The catalogue is the list of freely available content that Explore offers to download.
Entries live in `catalog/manifests/`. The format and the full rules are in
[catalog/README.md](catalog/README.md). In short:

1. **Official endpoints only.** Point at the publisher's own distribution service, or
   one the publisher endorses. No re-uploads, link shorteners or personal mirrors.
2. **State the licence honestly.** Write the licence you have checked at the source.
   If you could not check it, write `"license": "See source"` with a `licenseNote`.
   Do not guess.
3. **No bundled content.** A manifest holds descriptions and sources, never content.
4. **Describe plainly** what a person gets. Each edition of a book is its own entry.
5. **https only**, and every host must be listed in the manifest's `downloadHosts`.
6. **Never write the address of a `.zim` file.** Name the Kiwix book and flavour;
   Outpost looks up the current address, size and checksum.

Before sending a change:

```bash
pnpm catalog:validate
node apps/server/src/cli/validate-catalog.ts --online   # also asks each source
```

Set `lastVerified` to the day you confirmed each entry resolves.

## Issues

Use the repository's GitHub issues for bugs and ideas. Maintainers also track work
with `bd` (beads), described in [AGENTS.md](AGENTS.md); contributors do not need it.

For a bug, include the Outpost version, how you run it (Docker, source, packaged app
or portable drive), your operating system, what you did, what you expected and what
happened, with the relevant lines of the log.
[docs/troubleshooting.md](docs/troubleshooting.md) may already have the answer.

**Security problems are not reported in public issues.** See
[SECURITY.md](SECURITY.md).
