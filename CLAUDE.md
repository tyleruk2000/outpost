# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

Node 24 and pnpm 9. The server runs TypeScript directly (type stripping); there is no
server build step in development.

```bash
pnpm install
pnpm dev                                   # API on :8080, web app on :5173 (proxying /api)
pnpm typecheck                             # all packages
pnpm lint                                  # Biome; `pnpm format` to fix
pnpm --filter @outpost/server test         # Vitest, real server on temp dirs, no network
pnpm --filter @outpost/web test            # Vitest + Testing Library
pnpm catalog:validate                      # catalogue manifests (add --online to resolve them)
node scripts/fetch-map-assets.mjs          # map fonts and sprites (once; needs network)
node scripts/build-app.mjs                 # packaged app in dist/app (web build + server bundle)
pnpm e2e                                   # Playwright against dist/app, internet blocked
docker compose build && docker compose up -d
```

Run one server test file: `cd apps/server && pnpm exec vitest run test/search.test.ts`.

## Architecture Overview

One Node process (Fastify) serves the web app and API from SQLite plus folders; an
optional kiwix-serve process reads ZIM archives behind a sandboxing proxy. Read
`docs/architecture.md` first. Feature code lives in `apps/server/src/modules/<name>/`
and `apps/web/src/features/<name>/`; API types shared by both are in
`packages/shared/src/`.

## Conventions & Patterns

- **Server modules**: follow `docs/development/server-modules.md`. Imports use the
  `.ts` extension; erasable TypeScript only (no enums, no parameter properties).
  Validate input with zod at the route; throw `AppError` for anything a person should
  see; long work is a job; paths from requests go through `resolveInside`.
- **Web screens**: follow `docs/development/web-screens.md`, `PRODUCT.md` and
  `DESIGN.md`. Colours and type come from tokens only; lists before cards; sentence
  case; every screen has loading, empty and error states. Query keys start with the
  feature name so live events can refresh them.
- **Never** move, overwrite or delete a person's files as a side effect; never make an
  outbound request except as the direct result of a person's action; never add a CDN,
  remote font or analytics call (the end-to-end suite fails if the app reaches out).
- **Tests** use `createTestApp()` (`apps/server/test/helpers.ts`): a real server on a
  temporary directory. Tests must not touch the internet; use a local HTTP fixture.
- **Schema changes**: edit `apps/server/src/db/schema.ts`, then
  `pnpm --filter @outpost/server db:generate -- --name what_changed`. Never edit a
  shipped migration.
- British spelling in user-facing text ("catalogue", "colour", "licence" as a noun).
