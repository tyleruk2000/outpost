# Security

This page describes what Outpost protects against, what it does not, each protective
measure and where it lives in the code, and how to harden an installation.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## The threat model in plain words

Outpost is built for one person, a household or a classroom, on a computer or network
they control. It has not been audited for exposure to the public internet.

### What Outpost defends against

- **Web pages on other sites.** A page open in your browser cannot read from or change
  your Outpost, even though your browser can reach it.
- **Other devices on the network, when you have not opted in.** By default nothing
  outside the computer can connect.
- **People on your network without an account,** once LAN access and sign-in are on.
- **Hostile files.** An uploaded HTML page or SVG, a crafted archive, a renamed
  executable, a malicious GPX file or imported page cannot run script in Outpost,
  write outside its folders, or fill the disk without limit.
- **Hostile reference content.** A ZIM archive is a copy of someone else's web site,
  scripts included. Its pages cannot act as you or reach the internet.
- **Misuse of the download feature.** Outpost cannot be made to fetch from addresses
  inside your network, and a tampered or corrupted download is not installed.
- **Mistakes.** Nothing is overwritten, and files are deleted only when a request says
  so explicitly.

### What Outpost does not defend against

- **A malicious administrator.** An administrator can read and delete everything,
  restore a different database, and point downloads at other sources.
- **Members reading each other's work.** Every signed-in person can read all
  documents, notes and collections. There are no per-page or per-person permissions.
- **Physical access to an unencrypted drive.** The database, attachments, documents
  and portable drives are stored unencrypted. Anyone holding the disk can read them,
  including user names and password hashes.
- **An untrusted network without HTTPS.** On its own Outpost speaks plain HTTP. On a
  network you do not trust, passwords, session cookies and content can be observed and
  altered unless you put an HTTPS reverse proxy in front.
- **Other programs or people on the same computer, when sign-in is off.** With the
  default settings anything that can connect to `127.0.0.1:8080` is the administrator.
  The cross-site protections stop browsers, not local programs.
- **A compromised helper.** Outpost trusts the kiwix-serve program and the embedding
  server you point it at.
- **Denial of service.** Apart from slowing repeated sign-in attempts, there is no
  rate limiting.

There is no two-factor authentication and no audit log.

## The controls and where they live

### Network exposure

| Control | Detail | Code |
| --- | --- | --- |
| Local by default | The server listens on `127.0.0.1`. In Docker the port is published on `127.0.0.1` unless `OUTPOST_BIND` says otherwise. | `apps/server/src/config.ts`, `compose.yaml` |
| LAN access is a start-up decision | `OUTPOST_LAN_ACCESS` cannot be changed from the browser, and turns sign-in on. LAN access with sign-in off stops the server at start-up unless `OUTPOST_ALLOW_UNAUTHENTICATED_LAN=true`. | `apps/server/src/config.ts` |
| Host allow-list | Requests whose `Host` header is not a name this server answers to are refused. This defeats DNS rebinding, where a hostile site points its own name at your machine. | `isAllowedHost` in `apps/server/src/modules/auth/index.ts` |
| kiwix-serve is never exposed | The browser reaches it only through Outpost's proxy. In Compose it has no published port. | `apps/server/src/modules/kiwix/`, `compose.yaml` |

### Sign-in and sessions

| Control | Detail | Code |
| --- | --- | --- |
| Password hashing | scrypt (N = 32768, r = 8, p = 1) with a random 16-byte salt. Parameters are stored with the hash. Passwords must be at least 10 characters. | `apps/server/src/modules/auth/passwords.ts` |
| Sessions | A random token in an `HttpOnly`, `SameSite=Lax` cookie, valid for 30 days. Only its SHA-256 hash is stored. Changing a password ends that person's sessions on every device. | `apps/server/src/modules/auth/index.ts` |
| First-run setup token | With LAN access on, creating the first administrator needs a random token printed in the server log, so a stranger on the network cannot claim a fresh installation. | same |
| Slowing guesses | After five failed sign-ins from one address, further attempts are refused for a period that doubles each time, from 5 seconds up to 15 minutes. Timing does not reveal whether a user name exists. | same |
| Roles | Administrators and members. Changing storage, starting or removing downloads, changing settings, deleting documents and collections, backup, restore and portable drives need an administrator. | `requireAdmin` in each module |
| Safeguards | The last administrator cannot be deleted, and nobody can delete their own account. | `apps/server/src/modules/auth/index.ts` |

### Requests from other sites

Every request under `/api/` that changes something (anything other than `GET`, `HEAD`
or `OPTIONS`) must:

1. carry the header `X-Outpost-Request: 1`;
2. not be marked by the browser as coming from another site (`Sec-Fetch-Site`);
3. have an `Origin`, if present, whose host matches the `Host` header.

A page on another site cannot add a custom header without the browser first asking
Outpost's permission (a CORS preflight), and Outpost never grants it: it sends no CORS
headers at all. This applies whether sign-in is on or off, and is what protects the
default, sign-in-free installation from pages you visit.
Code: the `onRequest` hook in `apps/server/src/modules/auth/index.ts`.

Every response also carries `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin` and
`X-Frame-Options: SAMEORIGIN`. API responses are sent with `Cache-Control: no-store`.

### Content Security Policy

The app's pages are served with:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;
frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

The browser itself then refuses to load code from, or send data to, anywhere else.
Code: `APP_CSP` in `apps/server/src/app.ts`.

### Files people upload

| Control | Detail | Code |
| --- | --- | --- |
| Type checked by content | A file is accepted only if its extension is on the list **and** its first bytes look like that type. The stored MIME type comes from Outpost's table, never from the uploader. | `apps/server/src/modules/documents/file-types.ts`, `apps/server/src/modules/notes/attachments.ts` |
| Served in a sandbox | Original documents are sent with `Content-Security-Policy: sandbox; default-src 'none'; …`, which gives the response an origin of its own. Note attachments and GPX exports likewise. | `apps/server/src/modules/documents/index.ts`, `notes/index.ts`, `maps/index.ts` |
| Risky types are downloads | Only PDFs, raster images and plain text are shown in place. HTML, SVG and EPUB documents are offered as downloads; Markdown, CSV and JSON are shown as plain text. | `servedAs` in `documents/file-types.ts` |
| Size limits | `OUTPOST_MAX_UPLOAD_MB` per document (2048 MB by default), 50 MB per note attachment, 20 MB per GPX file. Files are streamed to disk, not held in memory. | `documents/upload.ts`, `notes/attachments.ts`, `maps/gpx.ts` |
| GPX is checked before parsing | Files with a DOCTYPE or entity declarations are refused. | `apps/server/src/modules/maps/gpx.ts` |

### Reference (ZIM) content

Pages from ZIM archives are served through `/kiwix/<token>/…` with a policy that
contains `sandbox` **without** `allow-same-origin`, and a `default-src` limited to
Outpost's own address. The page runs its own scripts in an origin of its own: it
cannot read Outpost's cookies or storage, call the API as you, or load anything from
the internet.

Because cookies are not sent from a sandboxed page, access is carried by a token in
the address. With sign-in on, it is signed with a secret kept in the data directory
(`secret.key`, HMAC-SHA-256) and expires after 12 hours. Only a book's pages and its
icon can be reached through the proxy; kiwix-serve's own search and catalogue cannot.
Code: `apps/server/src/modules/kiwix/index.ts`, `contentToken` in `auth/index.ts`.

### Downloads (the SSRF guard)

Server-side request forgery means tricking a server into fetching an address inside
your own network. Outpost's download client refuses that in two ways:

1. The first request for a catalogue download may only go to a host named in a
   catalogue manifest (plus `OUTPOST_DOWNLOAD_HOSTS`).
2. Every connection, including each redirect, must land on a public address. The check
   is made on the addresses actually connected to, so a name cannot pass a check and
   then resolve to something internal. Loopback, private, link-local and other
   reserved ranges are blocked, for IPv4 and IPv6.

Only `http` and `https` are allowed, addresses with embedded credentials are refused,
and at most eight redirects are followed. `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`
turns rule 2 off for people who run a mirror on their own network.
Code: `apps/server/src/core/http.ts`.

Integrity comes from the publisher's checksum, not from the mirror that served the
bytes. A Kiwix download without a published SHA-256 is refused; a file that does not
match is deleted and nothing is installed. Files are written as `<name>.part` and
renamed only when complete and verified, and an existing file is never overwritten.
Code: `apps/server/src/modules/downloads/service.ts`.

Two outbound paths do not use this client, because their address is set by an
administrator: the embedding server for semantic search, and kiwix-serve.

### Paths

Content is recorded as *(storage location, relative path)*, and storage locations can
only be created inside the storage roots set at start-up. Every path built from
request input goes through `resolveInside`, which refuses anything that escapes its
folder; `safeFileName` reduces any name to one safe path segment on every supported
file system. Code: `apps/server/src/core/fs-safe.ts`,
`apps/server/src/modules/storage/service.ts`.

### Archives

Archives are never trusted to say where their contents go or how large they are.

| Archive | Limits | Code |
| --- | --- | --- |
| Backup being restored | Only `manifest.json`, `outpost.db` and three known folders are unpacked; anything else is skipped. At most 500,000 entries and 64 GB. Existing files are never overwritten. | `apps/server/src/modules/backup/index.ts` |
| EPUB being read | Read into memory only, never unpacked to disk. At most 20,000 entries and 512 MB in total; names with `..` or absolute paths are skipped. | `apps/server/src/modules/documents/zip.ts` |
| ZIP being imported | A name that climbs out of the folder refuses the whole archive. Links and device files are never created. Entry count, total size, per-file size and compression ratio are capped, and declared sizes are checked against the bytes that arrive. | `apps/server/src/modules/imports/extract.ts` |
| Runtime downloads for portable drives | Checked against the publisher's checksum (SHA-256 for Node; the Kiwix project publishes only MD5 for its reader), then exactly one named file is extracted. | `apps/server/src/modules/portable/` |

### Notes, Markdown and HTML

Nothing is stored or served as raw HTML. Page content is a document made only of node
types, marks and attributes from a fixed list (`packages/shared/src/notes.ts`).
Anything arriving from the browser, an import or a template is sanitised into that
schema: unknown elements are reduced to their text, attributes are whitelisted, and
links may only use `http`, `https`, `mailto` or a relative address. `javascript:` and
`data:` links are removed; small inline raster images are the one `data:` exception.
Imported HTML is cleaned before conversion. A page is limited to 5 MB and 40 levels of
nesting. Code: `apps/server/src/modules/notes/content/`.

Search snippets and reference-collection snippets reach the browser as plain text
segments with "matched" flags, never as HTML.

### Backup and restore

Only administrators can save or restore a backup. A restore is uploaded, unpacked
under the limits above, and checked: the manifest must be an Outpost backup, the
database must pass SQLite's integrity check, and it must not come from a newer
Outpost. Only then is it marked ready. It is applied at the next start, before the
database is opened, and the data it replaces is kept in a dated folder. An upload that
was interrupted is discarded, never applied.
Code: `apps/server/src/modules/backup/index.ts`.

### No telemetry

Outpost sends no usage data and makes no outbound request unless a person starts a
download, a catalogue refresh or one of the other actions listed in
[offline.md](offline.md#what-needs-a-connection).

## NAS and share credentials

Outpost has no setting for a share's user name or password and never stores one. The
operating system or Docker mounts the share, and Outpost sees a folder. In the Compose
examples, `NAS_USER` and `NAS_PASSWORD` are read by Docker to mount the volume; they
are not passed into the Outpost container. Keep the `.env` file, or the credentials
file named in `/etc/fstab`, readable only by you. See
[storage.md](storage.md#nas-set-up-examples).

## Hardening advice

1. **Use HTTPS for anything beyond your own computer.** Put a reverse proxy with a
   certificate in front of Outpost, set `OUTPOST_SECURE_COOKIES=true`, and keep
   Outpost itself on `127.0.0.1`. See
   [deployment.md](deployment.md#behind-a-reverse-proxy).
2. **Keep sign-in on whenever other devices can connect.** Do not set
   `OUTPOST_ALLOW_UNAUTHENTICATED_LAN`.
3. **Do not expose Outpost to the internet.** Use a VPN to reach it from outside.
4. **Choose a long administrator password** and give other people member accounts.
5. **Back up** from Settings, and keep the backup somewhere other than the device.
   Back up storage locations as ordinary folders.
6. **Encrypt drives that leave the house**: laptops, external disks and portable
   drives (BitLocker, FileVault, LUKS, VeraCrypt). Outpost does not encrypt anything
   at rest.
7. **Protect the data directory.** It holds the database, the signing secret and the
   password hashes. On a shared computer, make it readable only by the account that
   runs Outpost.
8. **Keep Outpost updated**, and keep kiwix-serve at the version in `compose.yaml`.
9. **Add catalogue manifests only from people you trust.** A manifest decides which
   hosts downloads may start from.

The project's own checks: CodeQL analysis and a dependency audit run in CI
(`.github/workflows/`), and the browser test suite fails if the app tries to reach
any other host.
