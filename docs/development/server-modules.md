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
| Finding your own jobs | `ctx.jobs.list({ states, types: [MY_JOB] })`. Always with `types`: the list is the newest jobs first up to a limit, and without it a few hundred newer jobs of another kind hide yours |
| Looking up from long work on the server's thread | `await yieldToEventLoop()` from `core/event-loop.ts`, between batches |
| Taking an uploaded file | `await registerMultipart(app)` from `core/multipart.ts`, and `limits: { fileSize, … }` of your own on every `request.parts(...)`. The parser's own limit is a megabyte whoever registers it first |
| Telling the browser something changed | `ctx.events.publish({ type: "documents.changed", id })` |
| Outbound HTTP | `createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads })` from `core/http.ts` |
| Search | `ctx.services.search.upsert({...})` and `.remove(kind, entityId)` |
| Network transfers | `ctx.services.downloads.start({...})`; see `modules/downloads/types.ts` |
| Whether a request comes from this computer | `isLocalRequest(request, ctx.config)` from `core/local.ts` |
| Ending a long-lived response when the server stops | `ctx.stopping` (an `AbortSignal`); see the live-events route in `modules/system` |

### Jobs

Queues in use: `download` (network transfers), `index` (text extraction, embeddings),
`ocr` (reading scanned pages, always one at a time), `transfer` (moving and verifying
files), `import`, `manage` (bulk removal and clean-ups, one at a time), `backup`
(scheduled and hand-started backups, one at a time), `webpage` (saving a web page, one
at a time), `reference-files` (copying the documents of a reference collection into
the library, one collection at a time), `database` (checking the database and reclaiming
unused space in it, one at a time; reclaiming holds every other queue with
`ctx.jobs.holdFor` while it runs), `engine-build` (building the P.533 engine, one at a
time). Handlers
receive an `AbortSignal`
and must stop promptly when it fires (pause, cancel, shutdown). Report progress with
`run.progress({ current, total, message })`. Throw `PermanentJobError` for failures
that retrying cannot fix. A handler that is cancelled part of the way through work
that cannot be undone throws `StoppedWithResult` with an account of what it had done;
the job is still cancelled, and keeps that account as its result.

The runner does not poll. It starts work when a job is queued, resumed or released,
when a slot frees and when a queue's concurrency changes, and sets one timer for the
earliest job told to wait (a retry). A handler that throws, whatever it throws, fails
its job (or queues it to retry) and the queue goes on.

### At rest

Outpost is meant to be left on for months on a Raspberry Pi, perhaps on a battery, so
a server with nobody using it should do nothing. No `setInterval` that wakes on a fixed
tick to find nothing to do: schedule a timer for the next time something is due, or
react to an event (`ctx.events`), and `unref()` it. A timer that has to repeat (a
check of something outside Outpost that sends no event) runs no more often than its
result can matter to a person, stops when what it watches is not in use, and does
nothing that publishes an event unless something a person would see has changed.

### Worker threads

A worker is a file named `<name>.worker.ts` beside the module that owns it, found with
`workerUrl` (`core/paths.ts`) and bundled to `workers/<name>.mjs` in the packaged app.
Two things about them were learned the hard way and are in
[security.md](../security.md#files-people-upload). A worker's heap limit
(`resourceLimits`) is a last line and not a guarantee: a worker that runs out of heap
during one large allocation ends the whole process, so what a worker reads must be
bounded by counting, as the GPX reader does, or the work belongs in a child process, as
converting imported files does (`imports/convert-host.ts`). And run from source, a
worker runs WebAssembly as it starts (Node's type stripping), which is what
`core/v8-flags.ts` is about.

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

A module with tens of thousands of small things of one kind (repeaters) does not put
them in the passage index. It registers a source of its own with
`ctx.services.search.addSource({ layer: "local", kind, … })` and answers from its own
table; see `modules/repeaters/index.ts`.

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
   covers only those methods: a `GET` must never change anything. It also covers only
   routes under `/api/`. The one module with routes elsewhere is contacts (`/dav/`, for
   contacts apps, which cannot send the header); nothing under it can change anything
   by any method, and a route outside `/api/` that could would need a defence of its own.
   The routes that ask where a request came from are "erase everything", the ones
   that restore a backup, delete a stored one or keep fewer (`modules/backup/right.ts`),
   reclaiming unused space in the database (`modules/database`),
   and, in `modules/https`, replacing or deleting the certificate authority, deleting a
   certificate the person brought, and uploading a private key (which is also accepted
   over a connection that is already HTTPS). They
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
