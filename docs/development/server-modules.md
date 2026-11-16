# Writing a server module

The server is a small core plus feature modules. This page is the contract a module
works to. Read it together with the code it points at; the code is the authority.

## Layout

```
apps/server/src/
  config.ts            deployment configuration (environment variables)
  app.ts               builds the Fastify app; used by index.ts and by tests
  core/                context, request guard, errors, jobs, events, safe paths, HTTP client, hashing
  db/schema.ts         every table (Drizzle); db/migrations/ is generated from it
  modules/<name>/      one folder per feature: index.ts registers routes and services
apps/server/test/      Vitest suites; helpers.ts gives a full server on a temp directory
packages/shared/src/   API types shared with the web app, one file per module
```

The server runs as TypeScript directly on Node 24 (type stripping). That means:

- Import with the `.ts` extension: `import { x } from "./file.ts"`.
- Only erasable syntax: no `enum`, no `namespace`, no constructor parameter properties.
- `import type` for types (`verbatimModuleSyntax` is on).

## A module

`modules/<name>/index.ts` exports `register<Name>(app, ctx)`. It creates the module's
service, assigns it to `ctx.services.<name>` and adds routes. Services are typed by
declaration merging:

```ts
declare module "../../core/context.ts" {
  interface Services { documents: DocumentsService }
}
```

Registration order is in `modules/index.ts`. A module may use services registered
before it. Use `ctx.onClose.push(fn)` for cleanup.

## What the core gives you

| Need | Use |
| --- | --- |
| Configuration | `ctx.config` (`dataDir`, `storageRoots`, `maxUploadBytes`, …) |
| Database | `ctx.db` (Drizzle) and `ctx.sqlite` (better-sqlite3) for raw SQL and transactions |
| Ids and time | `newId()` from `core/ids.ts`; timestamps are `Date.now()` milliseconds |
| Errors | throw `AppError` (or `notFound`, `badRequest`, `conflict`) from `core/errors.ts` |
| Settings | `ctx.services.settings.get("indexing.chunkSize")` |
| Files in a storage location | `ctx.services.storage.resolve(locationId, relPath)`, `getDefault()`, `assertSpace()` |
| Safe paths and names | `resolveInside`, `safeFileName` from `core/fs-safe.ts` |
| Hashing large files | `sha256File` from `core/hashing.ts` |
| Long-running work | `ctx.jobs.register(type, { queue, run })` and `ctx.jobs.enqueue(type, payload, { title })` |
| Telling the browser something changed | `ctx.events.publish({ type: "documents.changed", id })` |
| Outbound HTTP | `createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads })` from `core/http.ts` |
| Search | `ctx.services.search.upsert({...})` and `.remove(kind, entityId)` |
| Network transfers | `ctx.services.downloads.start({...})`; see `modules/downloads/types.ts` |
| Whether a request comes from this computer | `isLocalRequest(request, ctx.config)` from `core/local.ts` |

### Jobs

Queues in use: `download` (network transfers), `index` (text extraction, embeddings),
`ocr` (reading scanned pages, always one at a time), `transfer` (moving and verifying
files), `import`, `manage` (bulk removal and clean-ups, one at a time), `backup`
(scheduled and hand-started backups, one at a time). Handlers
receive an `AbortSignal`
and must stop promptly when it fires (pause, cancel, shutdown). Report progress with
`run.progress({ current, total, message })`. Throw `PermanentJobError` for failures
that retrying cannot fix. A handler that is cancelled part of the way through work
that cannot be undone throws `StoppedWithResult` with an account of what it had done;
the job is still cancelled, and keeps that account as its result.

### Search

Describe an entity with its natural sections; the index chunks them:

```ts
ctx.services.search.upsert({
  kind: "document",
  entityId: doc.id,
  title: doc.title,
  url: `/library/documents/${doc.id}`,   // in-app route; ?page=N is appended for PDFs
  collection: doc.category,
  tags: ["water"],
  sections: [{ page: 1, heading: "Boiling", text: "…" }],
});
```

## Rules

1. **Paths.** Store paths relative to a storage location (`locationId` + `relPath`) or
   to the data directory. Never store or accept absolute paths from a request. Every
   path built from request input goes through `resolveInside`.
2. **Never move, overwrite or delete a person's files as a side effect.** Deleting is
   only ever the direct result of a request that says so. Removing in bulk
   (`modules/manage`) goes through the owning services, one item at a time; nothing
   deletes a folder of a storage location wholesale.
3. **Validate input with zod** at the route. A `ZodError` becomes a 400 automatically.
4. **Streams, not buffers,** for anything that can be large: uploads, downloads,
   hashing, archive extraction.
5. **Files served back to the browser** get `Content-Security-Policy: sandbox;
   default-src 'none'` unless they are known-safe types, so uploaded HTML or SVG can
   never run script in Outpost's origin.
6. **No outbound requests** except through the HTTP client, and only as the direct
   result of a person's action.
7. **There are no accounts and no roles.** Every route is open to whoever can reach
   the server, so a route has no permission check to make. `core/guard.ts` holds every
   request to the Host check, and every request that is not a `GET`, `HEAD` or
   `OPTIONS` to the `X-Outpost-Request` header and the same origin. That protection
   covers only those methods: a `GET` must never change anything.
   The routes that ask where a request came from are "erase everything", the ones
   that restore a backup, delete a stored one or keep fewer (`modules/backup/right.ts`),
   and replacing or deleting the HTTPS certificate authority (`modules/https`). They
   use `isLocalRequest` from `core/local.ts`; that is not a permission, and nothing
   else should lean on it without a reason as strong.
8. **Messages are for people.** Say what happened and what to do next, in plain words.

## Schema changes

`db/schema.ts` is the source of truth. After changing it:

```bash
pnpm --filter @outpost/server db:generate --name describe_the_change
```

Virtual tables and triggers go in a custom migration
(`drizzle-kit generate --custom --name …`). Never edit a migration that has shipped.

## Tests

`createTestApp()` in `test/helpers.ts` returns a real server on a temporary directory:

```ts
const app = await createTestApp();
const { status, body } = await app.api("POST", "/api/notes", { title: "Hello" });
await app.close();
```

`app.ctx` exposes services for direct calls, and `app.ctx.jobs.whenIdle()` waits for
background work. Tests must not reach the internet: start a local `http.createServer`
fixture instead (private addresses are allowed in tests).
