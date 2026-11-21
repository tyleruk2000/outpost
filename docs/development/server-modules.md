# Writing a server module

The server is a small core plus feature modules. This page is the contract a module
works to; the code is the authority.

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

The server runs TypeScript directly on Node 26 (type stripping): import with the `.ts`
extension; erasable syntax only (no `enum`, `namespace` or parameter properties);
`import type` for types (`verbatimModuleSyntax`).

## A module

`modules/<name>/index.ts` exports `register<Name>(app, ctx)`, which creates the service,
assigns it to `ctx.services.<name>` and adds routes. Services are typed by declaration
merging:

```ts
declare module "../../core/context.ts" {
  interface Services { documents: DocumentsService }
}
```

Registration order is in `modules/index.ts`; a module may use services registered before
it. Clean up with `ctx.onClose.push(fn)`.

## What the core gives you

| Need | Use |
| --- | --- |
| Configuration | `ctx.config` |
| Database | `ctx.db` (Drizzle), `ctx.sqlite` (better-sqlite3) for raw SQL and transactions |
| Ids and time | `newId()` (`core/ids.ts`); `Date.now()` milliseconds |
| Errors | throw `AppError` (or `notFound`, `badRequest`, `conflict`) from `core/errors.ts` |
| Settings | `ctx.services.settings.get("indexing.chunkSize")` |
| Files in a location | `ctx.services.storage.resolve(locationId, relPath)`, `getDefault()`, `assertSpace()` |
| Safe paths and names | `resolveInside`, `safeFileName` (`core/fs-safe.ts`) |
| Hashing | `sha256File` (`core/hashing.ts`) |
| Long work | `ctx.jobs.register(type, { queue, run })`, `ctx.jobs.enqueue(type, payload, { title })` |
| Your own jobs | `ctx.jobs.list({ states, types: [MY_JOB] })`, always with `types`, or newer jobs of other kinds hide yours |
| A fetcher for the download manager | `downloads.registerFetcher`; report what you write through `context.written` (`core/written.ts`: `append`, `cutTo`, `run().place`) so damaged parts are fetched again |
| Yielding in long work | `await yieldToEventLoop()` (`core/event-loop.ts`) between batches |
| Uploads | `await registerMultipart(app)` (`core/multipart.ts`) and your own `limits` on every `request.parts(...)` |
| Telling the browser | `ctx.events.publish({ type: "documents.changed", id })` |
| Outbound HTTP | `createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads })` (`core/http.ts`) |
| Search | `ctx.services.search.upsert({...})`, `.remove(kind, entityId)` |
| Downloads | `ctx.services.downloads.start({...})` (`modules/downloads/types.ts`) |
| Is this request local? | `isLocalRequest(request, ctx.config)` (`core/local.ts`) |
| Ending a long response on shutdown | `ctx.stopping` (an `AbortSignal`) |

### Jobs

Queues: `download`, `index` (extraction, embeddings), `ocr` (one at a time), `transfer`
(moving and verifying), `import`, `manage`, `backup`, `webpage`, `reference-files`,
`database` (holds every other queue with `ctx.jobs.holdFor` while reclaiming),
`engine-build`, `update`, `export`; `ocr` and every queue from `manage` on run one at a time (`reference-files` one collection at a time). Handlers
get an `AbortSignal` and must stop promptly. Report progress with
`run.progress({ current, total, message })`. Throw `PermanentJobError` for what
retrying cannot fix, and `StoppedWithResult` when cancelled part-way through work that
cannot be undone, with an account of what was done.

The runner does not poll: it starts work on queue, resume, release, a free slot or a
concurrency change, and sets one timer for the earliest retry. A handler that throws
fails its job (or queues a retry) and the queue goes on.

### At rest

Outpost runs for months on a Pi, maybe on a battery. No `setInterval` on a fixed tick:
schedule a timer for the next due thing, or react to an event, and `unref()` it. A
repeating check of something outside Outpost runs no more often than its result matters,
stops when unused, and publishes only when something visible changed.

### Worker threads

A worker is `<name>.worker.ts` beside its module, found with `workerUrl`
(`core/paths.ts`), bundled to `workers/<name>.mjs`. A worker's heap limit is a last line,
not a guarantee: running out during one large allocation ends the process. So bound what
a worker reads by counting (as the GPX reader does), or use a child process (as
`imports/convert-host.ts` does) ([security.md](../security.md#files-people-upload)). Run
from source, a worker compiles WebAssembly as it starts; see `core/v8-flags.ts`.

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

A module with tens of thousands of small things (repeaters) registers its own source with
`ctx.services.search.addSource({ layer: "local", kind, … })` instead.

## Rules

1. **Paths** are stored relative to a location (`locationId` + `relPath`) or the data
   directory. Never accept absolute paths; every path from input goes through
   `resolveInside`.
2. **Never move, overwrite or delete a person's files as a side effect.** Deleting is only
   the direct result of a request that says so. Bulk removal (`modules/manage`) goes
   through the owning services one item at a time.
3. **Validate input with zod** at the route; a `ZodError` becomes a 400.
4. **Streams, not buffers,** for anything large.
5. **Files served back** get `Content-Security-Policy: sandbox; default-src 'none'` unless
   known-safe.
6. **No outbound requests** except through the HTTP client, as the direct result of a
   person's action.
7. **No accounts, no roles.** `core/guard.ts` holds every request to the Host check, and
   every non-`GET`/`HEAD`/`OPTIONS` request under `/api/` to the header and same-origin
   rule. So a `GET` must never change anything, and a route outside `/api/` (`/dav/`,
   `/metrics`) must change nothing by any method. The routes that ask where a request came
   from (erasing, restoring and deleting backups, keeping fewer, reclaiming the database,
   replacing or deleting HTTPS certificates, uploading a key, setting the clock) use
   `isLocalRequest`; that is not a permission, and nothing else should lean on it
   without as strong a reason.
8. **Messages are for people**: what happened and what to do next.

## Schema changes

`db/schema.ts` is the source of truth. After changing it:

```bash
pnpm --filter @outpost/server db:generate --name describe_the_change
```

Virtual tables and triggers go in a custom migration (`drizzle-kit generate --custom
--name …`). Never edit a migration that has shipped.

## Tests

`createTestApp()` in `test/helpers.ts` returns a real server on a temporary directory:

```ts
const app = await createTestApp();
const { status, body } = await app.api("POST", "/api/notes", { title: "Hello" });
await app.close();
```

`app.ctx` exposes services; `app.ctx.jobs.whenIdle()` waits for background work. Tests
must not reach the internet: use a local `http.createServer` fixture (private addresses
are allowed in tests).
