# Troubleshooting

The messages Outpost shows, quoted as on screen, and what to do. Start with the log:

```bash
docker compose logs --tail 200 outpost     # Docker
docker compose logs --tail 200 kiwix
```

Without Docker, the log is what the server prints in its terminal.

## Starting and reaching Outpost

### The server refuses to start, naming OUTPOST_LAN_ACCESS

The port would be reachable from your network, where everyone can change and delete
everything. To keep it to this computer, set `OUTPOST_BIND=127.0.0.1` in `.env`
(`OUTPOST_HOST=127.0.0.1` without Docker). To share it, also set
`OUTPOST_LAN_ACCESS=true`, after reading
[deployment.md](deployment.md#letting-other-devices-use-it-lan-access). With plain
`docker run -p 127.0.0.1:8080:8080`, add `-e OUTPOST_PUBLISHED_ADDRESS=127.0.0.1`.

### The port is already in use

`EADDRINUSE`, or "port is already allocated": something else has port 8080. Set
`OUTPOST_PORT=8090` (in `.env` with Compose), restart, and open `http://localhost:8090`.

### "This address is not one Outpost answers to. Add it to OUTPOST_ALLOWED_HOSTS to use it."

- From another device, turn LAN access on (`OUTPOST_LAN_ACCESS=true`, and with Docker
  `OUTPOST_BIND=0.0.0.0`).
- With it on, IP addresses, single-word names and names ending `.local`, `.lan`, `.home`,
  `.internal` or `.home.arpa` are accepted. List any other name:
  `OUTPOST_ALLOWED_HOSTS=outpost.example.net`.
- Behind a reverse proxy, pass the original `Host` header on.

Restart after changing either.

### The browser says the HTTPS address is not private

The device does not trust Outpost's certificate, or the address is not one it covers.
Open **Settings → HTTPS on your network** at the `http` address: it lists the covered
addresses and the steps for each device. After **Make a new certificate authority**,
every device must trust the new one ([deployment.md](deployment.md#https-on-your-network)).

### "Port 8443 is already in use on this computer, so HTTPS could not start."

Set `OUTPOST_HTTPS_PORT` to a free port. Plain HTTP still works.

### "This request did not come from the Outpost app."

A script called the API without `-H "X-Outpost-Request: 1"`
([api.md](api.md#the-x-outpost-request-header)).

### "The server is not responding"

Wait a few seconds after a start. Otherwise check the container or service is running
(`docker compose ps`) and read the log. Behind a reverse proxy, make sure `/api/events`
is not buffered.

### "The server is out of reach. Showing what is kept on this phone, for reading only."

Expected away from home. At home, check the phone is on the same network and the server
is running; press **Try again** or wait
([offline.md](offline.md#a-phone-out-of-reach-of-the-server)).

### "Nothing can be kept on this phone over plain HTTP"

Give Outpost an HTTPS address (**Settings → HTTPS on your network**) and open it there.

### Something kept on the phone has gone

The browser removed it. Keep things from the Home Screen app and press **Ask the browser
to keep this data** ([offline.md](offline.md#what-the-browser-may-do-with-kept-copies)).

### "The Outpost server is running, but the web app has not been built."

From source, run `pnpm build`, or `pnpm dev` for development.

### The packaged app stops at start-up mentioning "pino-pretty"

Set `NODE_ENV=production` when running `dist/app/server/outpost.mjs`
([deployment.md](deployment.md#the-packaged-app)).

## Storage

### A storage location shows as disconnected

- **"The folder is not reachable…"** Plug the drive in or mount the share, then **Check
  drives** (or wait 30 seconds). With Docker, a drive mounted after start may need
  `docker compose restart`.
- **"The folder is there but is not this Outpost location…"** The wrong drive is mounted,
  or its `.outpost-location.json` is missing. A drive that moved within a storage root is
  found within ten minutes, or at once with **Check drives**.

Nothing is lost meanwhile ([storage.md](storage.md#what-happens-when-a-drive-is-unplugged)).

### "…is not connected. Reconnect it and try again."

Reconnect the drive. For an item whose drive is gone for good, remove only Outpost's
record.

### "That folder is outside the storage roots this server allows."

Mount the drive under a storage root (with Docker, under `/storage` in `compose.yaml`),
or add its path to `OUTPOST_STORAGE_ROOTS`. The Storage screen lists the roots.

### "Outpost cannot write to that folder. Check its permissions."

In Docker the server runs as user 1000: `sudo chown -R 1000:1000 /mnt/usb-ssd/outpost`.
Mount exFAT, FAT32, NTFS and SMB with `uid=1000,gid=1000`; on NFS set permissions on the
NAS and export read-write. Only the `kiwix` service's mounts should be `:ro`.

### "…does not have enough free space for this."

Outpost leaves 256 MB free on every location. Free space, choose another location, or use
**Storage → Manage and clean up**.

### "Erasing everything can only be started on the computer Outpost runs on."

Open Outpost on that computer, or start it with `OUTPOST_ALLOW_REMOTE_ERASE=true` (the
only way in Docker with LAN access or behind a proxy)
([security.md](security.md#erasing-everything)).

### "Restarting Outpost can only be done on the computer Outpost runs on."

Press **Restart now** at that computer, restart by hand (`docker compose restart`), or
start with `OUTPOST_ALLOW_REMOTE_ERASE=true`.

### The database file did not get smaller after removing things

**Storage → Manage and clean up → Clean up → Compact the database**.

### "…still holds N items. Move or remove them first."

Move or remove what is on the location ([storage.md](storage.md)), then remove it.

### A collection shows as "missing" or "damaged"

**Missing:** put the file back at its path, or download it again. **Damaged:** it no
longer matches its checksum; download it again or restore it, then **Check files**.

## Downloads

### A download says "No connection" and does not move

"…will resume when the network is back" means it is retrying by itself. "…has stopped
trying for now" means it used its attempts (**Settings → Downloads → Attempts before
giving up**, 8 by default): press **Retry** once online; it continues where it stopped.
Check the server's own connection, not only your browser's.

### "The downloaded file did not match its published checksum, twice…"

A file that fails its checksum (or, for a source file, Geofabrik's MD5) is deleted and
downloaded once more from the start; this message means the second copy failed too.
Nothing was installed or kept. Press **Retry** later. If it fails again, **Refresh** on
Explore and start afresh, or download to the device's own storage.

### "… is not keeping what is written to it"

The storage read back differently from what was written, three times in one download.
Nothing was installed. Download to the device's own storage instead, and see
[storage.md](storage.md#what-is-written-is-read-back).

### "… is not a download source listed in any catalogue manifest."

For a mirror of your own, add its host to `OUTPOST_DOWNLOAD_HOSTS`, passed into the
container with Compose ([deployment.md](deployment.md#read-by-composeyaml-only)).

### "Downloads from … are blocked because it is not a public address."

For a mirror on your own network, start the server with
`OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.

### "…was disconnected during this download." or "…is full…"

Reconnect the drive (the download continues by itself), or free space and **Retry**. The
part downloaded is kept.

### The catalogue will not refresh

"…there is no connection" is normal offline; Explore uses the last known details. Any
other message names the source that failed.

### "No readable text was found on this page."

The page is drawn by a script or asks you to sign in, and Outpost runs no scripts. Look
for a printable version, or print it to PDF from your browser and add that
([notes-and-imports.md](notes-and-imports.md#what-cannot-be-saved-and-what-outpost-says)).

### A saved web page is missing a part, or some of its pictures

An unusual layout can lose a part. Pictures over the limit, not PNG, JPEG, GIF or WebP,
or refused by their host are left out; the report after saving lists each.

## Reference collections

### "Reading reference collections needs the kiwix-serve program, which this installation does not have."

With Docker, use the `kiwix` service in `compose.yaml`. Without, see
[deployment.md](deployment.md#reference-collections-without-docker).

### "The Kiwix server at … is not answering. Check that its container is running."

```bash
docker compose ps
docker compose logs --tail 100 kiwix
docker compose up -d kiwix
```

It starts only after `outpost` is healthy.

### "The kiwix-serve program was not found at …" or "kiwix-serve stopped (code …)"

`OUTPOST_KIWIX_BIN` points at a missing file or a build for the wrong processor. The
message ends with the program's last line.

### A collection is installed but cannot be read

- Every `/storage/...` mount of `outpost` must be repeated, read-only at the same path,
  under `kiwix` in `compose.yaml`; then `docker compose up -d`.
- "…which is not connected": reconnect the drive.
- "This collection is not ready to read yet": wait a few seconds and reload.

### A collection opens as a list of documents

Some collections are a set of files (PDFs, recordings, films) rather than a web site, such
as the Post Disaster Resource Library. Outpost shows their list itself, with a search box
(each word must start a word: "pur" finds "purification"), **Add to library** on each PDF
or e-book and **Add all to library** above. Recordings and films play where the browser
can; otherwise **Open the file**. **Show the collection's own page** is usually empty.

The list is not read if the collection was made before October 2022, is over 4 MB (about
25,000 documents), or is more than a plain list. Only the first 20,000 documents, and 50
files each, are read.

### Adding a collection's documents to the library

**Add to library** copies a document out of the collection, with no download, to the
default storage location, so it is on disk twice. **Add all to library** (or **Add
these**, for what the search shows) says how many, how much space and where first, and
will not start without room. It runs on the server (see **Downloads and tasks → Tasks**), goes on after a restart, and **Stop** keeps what was added. It ends with
what was added, already there and failed, with **Try again**. Removing the collection
later keeps the documents.

If it stops: free space or change the default location; reconnect the location or the
collection's drive; "stopped arriving" means nothing came for thirty seconds; one
document may be at most `OUTPOST_MAX_UPLOAD_MB` (2 GB).

### A link in a reference page shows a notice instead of opening

- A PDF or e-book **inside the collection** opens with **Add to library**. The bar under
  the reader lists every such file on the page.
- "This file is not in the collection. It is on the internet at …": with a connection,
  **Save to library** fetches it.
- "That link leaves your library and needs the internet: …": a web page outside the
  collection.

### A file from a reference page cannot be added to the library

The file was never packed into the collection; or the link is not to a PDF, EPUB,
Markdown, text or image; or it points at your own network; or "…is named like a PDF, but
its contents are not one" (often a log-in page). Nothing is kept.

### Search results have no reference articles

kiwix-serve is not running, or **Settings → Search → Search inside reference
collections** is off.

### Reference articles arrive late, or a note says a collection was not searched in time

On a slow drive the first search of an archive can take seconds. A collection that takes
too long is named in a note; search again and it is quick. Each search asks the
collections likeliest to hold the answer first: **Search all reference collections**
under the results asks every one
([search.md](search.md#reference-collections-in-results)).

## Maps

### The map has no labels

The map fonts and icons were missing when Outpost was built. With a connection, run
`node scripts/fetch-map-assets.mjs`, then rebuild: `pnpm build`,
`node scripts/build-app.mjs`, or `docker compose build`. `--force` fetches again.

### "Outpost could not reach the map source."

Adding a place under **Offline maps** needs a connection; what is already added does not.

### "The map source is no longer available at its address."

Check `maps.tileSource` if you set it; otherwise try again in a few minutes, or cancel the
download and add the place again.

### "Find a route" says the server is busy, or did not answer

The servers are volunteers'. Wait a minute, or **Ask another server**. An administrator
can declare another in `<data directory>/catalog/routes/route-sources.json`
([maps.md](map-routes.md#what-is-sent-and-to-whom)).

### "Find a route" finds nothing for a path I know exists

Try part of the name. A path not mapped as a route is found only with **This map view**
over it. A regional server knows only its region. Otherwise draw it or import a GPX file.

### "France has no roads yet", or "The roads kept do not join these points"

A drive needs **Routes** for every country it passes through, added under
**Maps → Offline maps**. **Plan a route** names the countries missing before you plan, with
one button to add them. Across the sea, both sides need routes, joined by a car ferry or
the Channel Tunnel ([road-routes.md](road-routes.md#adding-routes-for-a-place)).

### "That area is too large to download at this detail in one go"

Choose less detail under **More choices** in **Add a place**, or split the area. One map is
at most 60 GB.

### The map is empty somewhere

Only the places added under **Offline maps** are drawn in detail, and not while their drive
is disconnected.

## Documents and search

### A PDF has no searchable text

Its pages are scans. Choose **Read text from the scanned pages**
([search.md](search.md#scanned-pages-and-images-ocr)). Text is not read from PDFs over
512 MB.

### An EPUB book will not open, or looks different from the printed book

- "This book is copy-protected": Outpost keeps it but neither reads it nor removes DRM.
- "This book could not be opened": usually a damaged copy; add a fresh one.
- "This chapter cannot be shown": that chapter is over 2 MB; **Download original**.
- Plain look: on purpose. Fixed layout, audio, video and maths are not supported
  ([epub.md](epub.md)).
- A result opens at the start: **Read text again** in its details.

### OCR found no text, or the wrong words

The page may be blank, sideways, handwritten, or in a language not set. Wrong words are
normal on poor scans. "…is not part of this installation": run `pnpm install` from
source, or rebuild the packaged app.

### An upload is refused

Raise `OUTPOST_MAX_UPLOAD_MB` (and a proxy's limit) for large files. Only the listed types
are accepted; a file must be what its extension says; text must be UTF-8.

### Semantic search: "The embedding server at … is not reachable."

Check it is running and the address is right from where Outpost runs. In Docker,
`127.0.0.1` is the container ([search.md](search.md#a-local-embedding-server-local-server)).

### Semantic search: "The built-in model has not been fetched yet" or "…is not part of this installation"

From source, run `node scripts/fetch-embedding-model.mjs` once. Otherwise rebuild after
that step, or use a local embedding server. "…does not match its checksum": reinstall, or
run the script with `--force`.

### Answers and chat

| Message | What to do |
| --- | --- |
| No **Answer from my library** button | Switch on **Settings → Answers from your library** and choose a model ([ai.md](ai.md#setting-it-up)). |
| "No model server answered at …" | Start it (`ollama serve` or the Ollama app) and press **Test**. In Docker, `127.0.0.1` is the container ([ai.md](ai.md#in-docker-or-with-the-model-on-another-machine)). llama.cpp's server now defaults to port 9931. |
| "The model server … has no model called …" | Use the exact name with its tag (`llama3.2:3b`), or `ollama pull` it. |
| "… cannot write text. It is probably an embedding model…" | Choose a chat model. |
| "The passages and the question were too long for the model." | Outpost has already tried once with fewer passages. Lower **Context budget**, or with Ollama raise it so Outpost asks for a larger context ([ai.md](ai.md#with-ollama)); with llama-server, a larger `-c`. |
| "The model had not started writing after 3 minutes…" | Use a smaller model or budget. The first answer after a start is slowest. |
| "Outpost is already writing an answer…" | One answer at a time for the household; wait, or stop the other. |
| An answer cites nothing, or a struck-through number | The model ignored its instructions: treat the answer as unsupported, read the passages, try a larger model. |

## Notes

### "This page was changed somewhere else after you opened it…"

Your changes were not saved over the newer version. Reload.

## Backup and restore

### "A restore is waiting for a restart"

Restart: `docker compose restart outpost`, or stop and start the server. "Outpost cannot
restart itself here" means nothing supervises it (from source, or the packaged app run by
hand). Cancel in **Settings → Backup** to change your mind. The replaced data is kept in
`before-restore-<time>` in the data directory; delete it when sure.

### "Restoring is not offered on this device"

Restoring is only at the computer Outpost runs on. Moving to a Pi in Docker:
[deployment.md](deployment.md#6-bring-your-library-across).

### "Restoring a backup can only be done on the computer Outpost runs on."

Also deleting backups and keeping fewer. Open Outpost there, or start with
`OUTPOST_ALLOW_REMOTE_ERASE=true` ([security.md](security.md#backup-and-restore)).

### "The backup due … has not been made"

Its location was not connected. Connect it; one backup covers all missed. Or choose
another in **Settings → Automatic backups**.

### A backup is shown as "Not verified"

It did not read back correctly, or the check was interrupted. It does not count towards
those kept. If it keeps happening, suspect the disk or network. Failing backups are tried
less often, and only the newest two failures are kept.

### A file in `outpost-backups` is not in the list, or is never removed

Outpost manages only files it named (`outpost-backup-<time>-scheduled.zip`,
`-manual.zip`, or `.zip.enc`). Restore any other with **Choose backup**.

### "That passphrase does not open this backup."

Use the passphrase set **when the backup was made**; **Settings → Automatic backups**
marks older ones. Check for a trailing space and the keyboard layout. A lost passphrase
cannot be recovered by anyone: set a new one and make a new backup now.

### Other restore messages

- "That backup cannot be restored. … damaged, altered or cut short.": copy it again, or
  use another.
- "A passphrase sent from this device would cross your network unencrypted": do it at the
  computer Outpost runs on, or over HTTPS with `OUTPOST_ALLOW_REMOTE_ERASE=true`.
- "That backup was made by a newer Outpost": update Outpost first.
- Documents and collections unavailable after a restore: a backup holds the database, not
  the files. Add the same storage locations again.

## Portable drives

### "This drive does not include Outpost for this kind of computer"

Update the drive from the Outpost that made it, ticking this kind of computer.

### "…is too large for this drive's format. Reformat the drive as exFAT and try again."

FAT32 cannot hold a file of 4 GB or more.

### Reference collections do not open from a drive on Windows

There is no Windows build of the reader; everything else works
([portable.md](portable.md#which-computers-it-runs-on)).

## The Raspberry Pi scripts

What `deploy/pi/install.sh`, `nas-share.sh` and `hotspot.sh` print when they stop. For a
message not here, read the lines above it.

| Message | What to do |
| --- | --- |
| "Your kernel does not support memory limit capabilities…" | Nothing: Raspberry Pi OS turns memory limits off ([deployment.md](deployment.md#raspberry-pi-4-and-5)). |
| Outpost answers, but `sudo docker ps` does not list it | It is in the other Docker (the system's or your rootless one; `docker context ls` says which). To move it: `docker compose down` in the `outpost` folder (`-v` deletes its data), then `./deploy/pi/install.sh --lan --https --sudo`. |
| "`docker` here is rootless Docker…" (`nas-share.sh`) | Run it again with `--sudo`, moving Outpost to the system's Docker first if needed. |
| "… could not be mounted." (`nas-share.sh`) | The line below says why. Wrong password: `--new-password`. The share folder must exist, spelled exactly. Another SMB version: change `vers=3.0` in `/etc/fstab` to `2.1` or `3.1.1`, `sudo systemctl daemon-reload`, run again. |
| "The password is asked for at the keyboard…" | Run it in a terminal (`ssh -t`). |
| "A 64-bit system is needed…" or "…programs are armhf" | Write the card again with **Raspberry Pi OS (64-bit)**. |
| "Run this as your own user, not with sudo…" | Leave `sudo` off. |
| "Docker with the Compose plugin is not installed." | Run again with `--install-docker` (needs the internet once). |
| "compose.yaml was not found in …" | Run it from the `outpost` folder `git clone` made. |
| "Outpost did not answer within five minutes…" | Read the log's last lines. A first start can be slow; try `curl http://localhost:8080/api/health` in a few minutes. |
| `permission denied while trying to connect to the Docker daemon socket` | Sign out and in again, or use `sudo docker`. |
| "They could not be fetched now. The planner will offer a Download button…" | Press **Download** on HF propagation once online. |
| "The Wi-Fi country is not set…" | Run the command it gives with your country code, then `hotspot.sh on`. |
| "nmcli was not found." or "NetworkManager is not running." | `hotspot.sh` needs Raspberry Pi OS Bookworm or later. |
| "wlan0 is not a Wi-Fi interface…" | `nmcli device` lists names; pass yours with `--interface`. |
| "The password must be 8 to 63 characters." | Nothing changed; run it again. |
| Phones join the Pi's network but Outpost does not open | Share it with `./deploy/pi/install.sh --lan`; `sudo ./deploy/pi/hotspot.sh status` says whether the network is on. Stay on a network that "has no internet". |

## Still stuck

Open an issue on GitHub with the version (**Settings → This installation**), how you run
it, the operating system and the relevant log lines, with anything private removed.
Security problems: [SECURITY.md](../SECURITY.md).
