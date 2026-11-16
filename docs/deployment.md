# Installing and running Outpost

This page covers running Outpost with Docker Compose, running it without Docker, the
notes that matter on each platform, and every environment variable the server reads.

Outpost is one server process plus, for reference collections such as Wikipedia, one
helper process (kiwix-serve). See [architecture.md](architecture.md) for how the parts
fit together.

## Docker Compose quick start

You need Docker with the Compose plugin (`docker compose version` should print a
version).

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
cp .env.example .env
docker compose up -d --build
```

Then open <http://localhost:8080>.

- `--build` builds the image from the checkout before starting it. The build needs an
  internet connection: it installs dependencies and fetches the map fonts and icons.
- No image is published anywhere, so there is nothing to pull. `compose.yaml` names the
  image it builds `outpost:local` (change the name with `OUTPOST_IMAGE`).
- Every line in `.env` is optional. The defaults keep Outpost private to the computer it
  runs on.

Check that it is running:

```bash
docker compose ps
curl http://localhost:8080/api/health
```

The second command prints `{"status":"ok","version":"…"}`.

### What the stack contains

| Service | What it does | Reachable from |
| --- | --- | --- |
| `outpost` | The web app and API, on port 8080 inside the container. | The host, on `127.0.0.1:8080` by default. |
| `kiwix` | `ghcr.io/kiwix/kiwix-serve:3.8.2`. Reads installed ZIM archives. | Only the `outpost` service. It is never published to the host. |

The `outpost` container runs as the unprivileged `node` user (uid 1000, gid 1000).

### What each volume holds

| Volume | Mounted at | Holds |
| --- | --- | --- |
| `outpost-data` | `/data` | The database (`outpost.db`), note attachments, text extracted from documents, cached runtimes for portable drives, and anything else Outpost itself owns. Keep it on a local disk. |
| `outpost-library` | `/storage/internal` | The default storage location: documents, collections and maps you have not put somewhere else. |
| `kiwix-library` | `/kiwix` | `library.xml`, the list of installed archives that Outpost writes and kiwix-serve reads. |

External drives and network shares are extra mounts under `/storage`. Each one must be
added to **both** services (read-only for `kiwix`). [storage.md](storage.md) has
examples.

## Letting other devices use it (LAN access)

By default the port is published on `127.0.0.1` only, and the server refuses requests
addressed to any name other than `localhost`, `127.0.0.1`, `::1` or one you list in
`OUTPOST_ALLOWED_HOSTS`. Only the computer Outpost runs on can open it.

To use Outpost from phones and other computers on your network, set both of these in
`.env` and restart:

```ini
OUTPOST_LAN_ACCESS=true
OUTPOST_BIND=0.0.0.0
```

```bash
docker compose up -d
```

Other devices then open `http://<address of this computer>:8080`.

**Outpost has no accounts and no sign-in.** With LAN access on, everyone on your
network can read, add, change and delete everything in it. Turn it on only for a network
where you trust everyone, such as your home. Never forward the port to the internet,
and do not put Outpost behind a reverse proxy that the public can reach unless the
proxy itself asks people to authenticate (see [below](#behind-a-reverse-proxy)).

What else to know:

- With LAN access on, Outpost answers to `localhost`, to IP addresses, to single-word
  host names, to names ending in `.local`, `.lan`, `.home`, `.internal` or `.home.arpa`,
  and to anything you list in `OUTPOST_ALLOWED_HOSTS`. Any other name gets "This
  address is not one Outpost answers to".
- The two settings go together. With `OUTPOST_BIND=0.0.0.0` alone the server refuses to
  start, and says why: its port would be reachable from the network without your having
  chosen that. With `OUTPOST_LAN_ACCESS=true` alone the port is still published only to
  this computer.
- Both can only be changed where the server is started, never from the browser.
  **Settings → Who can use this library** shows which is in force.
- Traffic on the LAN is plain HTTP unless you put a reverse proxy in front.

[security.md](security.md) explains what this does and does not protect.

## Updating

Back up first (**Settings → Backup**, or see [storage.md](storage.md)).

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically when the server starts. Your volumes are not
touched by an update.

## Logs

```bash
docker compose logs -f outpost
docker compose logs -f kiwix
```

The server writes one JSON object per line. `OUTPOST_LOG_LEVEL` sets the level; it is
not passed through by `compose.yaml`, so add it to the `environment:` block if you need
it.

## Stopping and removing

```bash
docker compose stop        # stop, keep everything
docker compose down        # remove the containers, keep the volumes
```

`docker compose down -v` also deletes the named volumes, which means the database and
the default library. Do not run it unless that is what you want.

## Platform notes

The image can be built for 64-bit x86 (`linux/amd64`) and 64-bit ARM (`linux/arm64`);
a local build produces the one for the machine it runs on. There is no 32-bit build.

What has been tried, so you know what you are relying on: Outpost is developed and run
by hand on macOS on Apple Silicon, from source, as the packaged app, and as the full
Compose stack with the `arm64` image. The test suites are run by hand on that machine.
Nothing builds or tests Outpost automatically, and nothing else has been tried: not
Linux on x86-64, not an Intel Mac, not Windows, not a Raspberry Pi, not a NAS.

### macOS (Apple Silicon and Intel)

- Install Docker Desktop. Apple Silicon Macs run the `arm64` image and Intel Macs the
  `amd64` image; a local `docker compose build` produces the right one.
- External drives appear under `/Volumes`. Mount one into both services:

  ```yaml
  services:
    outpost:
      volumes:
        - /Volumes/FieldSSD:/storage/field-ssd
    kiwix:
      volumes:
        - /Volumes/FieldSSD:/storage/field-ssd:ro
  ```

  The folder must be allowed under Docker Desktop's file-sharing settings. Plug the
  drive in before starting the stack.
- Leave `outpost-data` as the named volume it is. Do not move the database onto an
  external or network drive.

### Windows 10 and 11

- Install Docker Desktop and use its WSL 2 backend.
- Keep the Outpost folder (`compose.yaml` and `.env`) inside the WSL file system, for
  example `~/outpost` in your WSL distribution, and run `docker compose` from a WSL
  shell. The named volumes (`outpost-data`, `outpost-library`) live inside Docker's own
  Linux storage, which is where the database belongs.
- To use a Windows drive for content, mount a folder on it under `/storage`.

  From a WSL shell, Windows drives are under `/mnt/<letter>`:

  ```yaml
  services:
    outpost:
      volumes:
        - /mnt/d/outpost:/storage/drive-d
    kiwix:
      volumes:
        - /mnt/d/outpost:/storage/drive-d:ro
  ```

  If you run `docker compose` from PowerShell instead, use the Windows path. The long
  form avoids any confusion over the colon in the drive letter:

  ```yaml
  services:
    outpost:
      volumes:
        - type: bind
          source: D:/outpost
          target: /storage/drive-d
    kiwix:
      volumes:
        - type: bind
          source: D:/outpost
          target: /storage/drive-d
          read_only: true
  ```

  Use one style or the other, matching the shell you start Compose from.
- Do not put the database on a Windows drive (`/mnt/c/...` or `C:/...`). Files shared
  between Windows and Linux do not give SQLite the file locking it needs. Content
  (documents, collections, maps) is fine there.
- Running without Docker on Windows is untried: the packaged app includes the SQLite
  binary for Windows, but nobody has run it there. See
  [the limits table](architecture.md#limits-and-trade-offs).

### Linux (x86-64 and ARM64)

- Install Docker Engine and the Compose plugin from your distribution or from Docker.
- A folder you bind-mount under `/storage` must be writable by uid 1000:

  ```bash
  sudo mkdir -p /mnt/usb-ssd/outpost
  sudo chown -R 1000:1000 /mnt/usb-ssd/outpost
  ```

  File systems without Unix ownership (exFAT, FAT32, NTFS) take the owner from mount
  options instead: mount them with `uid=1000,gid=1000`.
- Mount external drives at a fixed place (an `/etc/fstab` entry with `nofail`, for
  example) so the path Compose refers to exists at boot.

### Raspberry Pi 4 and 5

- A 64-bit operating system is required (Raspberry Pi OS 64-bit, for example). There is
  no 32-bit image.
- Memory: the Compose file limits the two containers to 1 GB and 512 MB by default
  (`OUTPOST_MEMORY_LIMIT`, `KIWIX_MEMORY_LIMIT`), which fits a 4 GB board for keyword
  search, reading, notes and maps. The built-in model for semantic search takes about
  300 MB more while it is loaded (the container used 430 MiB during an index build on a
  laptop; a Pi has not been measured), which fits the default. Choose 8 GB if you plan
  to run an embedding server
  on the same board for semantic search, or to index very large PDFs (a PDF is held in
  memory while its text is read).
- Leave **Documents processed at once** at 1 (the default) and keep downloads at 1 or 2
  at a time.
- Storage: an SD card works and is where the system and the database can live, but
  large collections belong on an SSD connected over USB 3, with its own power if the
  drive needs it. Keep the database (`outpost-data`) on storage that is always
  attached to the Pi: the SD card or a permanently connected SSD. Never on a network
  share, and not on a drive you unplug.
- Building a semantic index on a Pi is slow. You can build it on a faster computer and
  load it on the Pi; see [search.md](search.md#moving-vectors-between-installations).

#### A box you can carry: the install script and a Wi-Fi network of the Pi's own

Two scripts in `deploy/pi/` set a Pi up to be carried somewhere with no router and no
internet, and reached from phones over a Wi-Fi network the Pi itself provides.

**Neither script has been run on a Raspberry Pi.** They were written from Docker's
installation page and from NetworkManager's documentation and source on 16 November
2026, and checked only for syntax and with `--dry-run` on a Mac. Read them before you
run them, run each with `--dry-run` first, and expect to adjust them. Reports of what
happened on real hardware are welcome.

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
./deploy/pi/install.sh --dry-run                 # see what it would do
./deploy/pi/install.sh --install-docker --lan    # needs the internet this once
sudo ./deploy/pi/hotspot.sh on --ssid "Outpost"  # asks for a password
```

- `install.sh` checks for a 64-bit Raspberry Pi OS, installs Docker Engine and the
  Compose plugin from Docker's apt repository if you pass `--install-docker` (the steps
  on <https://docs.docker.com/engine/install/debian/>, which lists Debian 12 and 13 on
  arm64), makes `.env` from `.env.example` if there is none, and with `--lan` sets
  `OUTPOST_LAN_ACCESS=true` and `OUTPOST_BIND=0.0.0.0` in it, keeping the file as it
  was beside it. Then it builds and starts the stack and waits for it to answer. The
  build fetches map fonts and the search model, so the Pi needs the internet for it.
- `hotspot.sh on` makes a NetworkManager connection called `outpost-hotspot`: a WPA2
  access point on `wlan0` with the Pi at `10.42.0.1`, started by itself at boot. Phones
  that join open `http://10.42.0.1:8080`, or `http://outpost.home.arpa:8080` (the
  script gives NetworkManager's own DHCP and DNS server that name to hand out).
  `hotspot.sh off` removes the connection and the name and nothing else;
  `hotspot.sh status` says which it is.

Things to know before relying on it:

- The Pi's one Wi-Fi radio cannot be a hotspot and be on your home Wi-Fi at once.
  Turning the hotspot on over an SSH session that runs over that Wi-Fi cuts you off;
  use a screen and keyboard or Ethernet.
- The Wi-Fi password is the only thing between that network and Outpost, which has no
  accounts. The script writes the password nowhere; NetworkManager keeps it in its own
  connection file, readable by root only.
- If the Pi has internet over Ethernet, NetworkManager shares it with whoever joins.
  With no internet, a phone will say so and may ask whether to stay on the network.
- "Erase everything" is accepted only from the computer Outpost runs on, and in Docker
  nothing looks local to the container, so it is not available from a phone on the
  hotspot unless you set `OUTPOST_ALLOW_REMOTE_ERASE=true`.
- Location on the map, recording a track and keeping things on the phone need an
  `https` address; see [HTTPS on your network](#https-on-your-network).

### NAS and home servers that run containers

Any NAS or home server that offers Docker Compose (or can import a Compose file) and
has a 64-bit x86 or ARM CPU should be able to run the stack. Outpost has not been tried
on any NAS product, so treat the following as guidance:

- Keep `outpost-data` on a volume that is local to the machine running the containers.
  A NAS's own disk is local to that NAS.
- Bind-mount the shared folders you want to use for content under `/storage`, in both
  services, and make them writable by uid 1000.
- The stack builds its image from the checkout (`build: .`). No image is published, so
  if the vendor's interface cannot build one, you have to build it on another machine
  and load it onto the NAS yourself.

## Running without Docker

### From source

You need Node.js 24 or newer and pnpm 9. Nothing is compiled during installation:
SQLite arrives as a prebuilt binary, and `package.json` allows only esbuild to run an
install script.

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
pnpm install
node scripts/fetch-map-assets.mjs   # map fonts and icons; needs a connection once
node scripts/fetch-embedding-model.mjs  # the model for search by meaning (24 MB); also once
pnpm build                          # builds the web app into apps/web/dist
pnpm start
```

Open <http://localhost:8080>.

Things to know:

- `pnpm start` runs the server from the `apps/server` folder and does **not** read
  `.env`. Set variables in the shell, for example:

  ```bash
  OUTPOST_DATA_DIR=/srv/outpost/data OUTPOST_STORAGE_ROOTS=/srv/outpost/library,/mnt/nas/outpost pnpm start
  ```

- Without `OUTPOST_DATA_DIR`, data goes to `./data` relative to the folder the server
  runs in, which for `pnpm start` is `apps/server/data`. Set it explicitly for anything
  you intend to keep.
- Without `OUTPOST_STORAGE_ROOTS`, content may be stored in `<data directory>/library`
  and in the places removable drives usually appear: `/Volumes` on macOS;
  `/media/<user>`, `/run/media/<user>` and `/mnt` on Linux. On Windows only the library
  folder is used.
- If you skip `fetch-map-assets.mjs`, everything works except that maps draw without
  labels and icons. If you skip `fetch-embedding-model.mjs`, everything works except
  the built-in option of search by meaning, which says that its model is missing.
- For LAN access, set `OUTPOST_HOST=0.0.0.0` together with `OUTPOST_LAN_ACCESS=true`,
  and read [what that means](#letting-other-devices-use-it-lan-access) first.

### The packaged app

The packaged app is a folder that runs with nothing but a Node 24 binary. It is what
the Docker image and portable drives contain.

```bash
pnpm install
node scripts/fetch-map-assets.mjs
node scripts/fetch-embedding-model.mjs
node scripts/build-app.mjs            # writes dist/app
```

`node scripts/build-app.mjs --skip-web` reuses an existing `apps/web/dist`, and
`--out <dir>` writes somewhere else. Copy `dist/app` wherever you like and run it:

```bash
NODE_ENV=production \
OUTPOST_DATA_DIR=/srv/outpost/data \
OUTPOST_STORAGE_ROOTS=/srv/outpost/library \
node dist/app/server/outpost.mjs
```

`NODE_ENV=production` is required: without it the server tries to load a development
log formatter that the packaged app does not include, and stops at start-up.

The folder contains prebuilt SQLite binaries for macOS, Linux (glibc and musl) and
Windows, on x64 and arm64.

### Reference collections without Docker

Reading ZIM archives needs kiwix-serve from the Kiwix project. Outpost is tested
against version 3.8.2. Two ways to provide it:

- **Let Outpost run it.** Set `OUTPOST_KIWIX_BIN` to the program's path. Outpost starts
  it on a private port on `127.0.0.1`, restarts it if it stops, and stops it on exit.

  ```bash
  OUTPOST_KIWIX_BIN=/usr/local/bin/kiwix-serve pnpm start
  ```

  The Kiwix project publishes `kiwix-tools` builds for macOS and Linux at
  <https://download.kiwix.org/release/kiwix-tools/>. If you have made a portable drive
  that includes reference collections, the same program is already cached at
  `<data directory>/runtimes/kiwix-tools-3.8.2/<platform>/kiwix-serve`.
- **Run it yourself.** Set `OUTPOST_KIWIX_URL` to its address. Start kiwix-serve with
  the library file Outpost writes (`<data directory>/kiwix/library.xml`, or
  `OUTPOST_KIWIX_LIBRARY_PATH`), the way `compose.yaml` does:

  ```bash
  kiwix-serve --port 8081 --address 127.0.0.1 --library --monitorLibrary --nodatealiases /srv/outpost/data/kiwix/library.xml
  ```

  It must see the archives at the same paths Outpost does, and should not be reachable
  from the network: Outpost is what adds sandboxing in front of it.

Without either, everything else works and the interface says that reference
collections cannot be read.

## Behind a reverse proxy

Nobody has run Outpost behind a reverse proxy, and no test does. The notes below follow
from the code; check your own set-up.

- **Authentication.** Outpost has none: whoever gets through the proxy can read and
  change everything. A proxy that can be reached from the internet must ask people to
  authenticate itself. Pages from reference collections are shown in a sandboxed frame
  whose requests carry no cookies, so check that the reader still works behind whatever
  the proxy uses.
- **Host names.** The proxy must pass the original `Host` header through. List the name
  people type in `OUTPOST_ALLOWED_HOSTS` (comma separated).
- **Keep Outpost itself private.** When the proxy runs on the same machine, leave
  `OUTPOST_BIND` at `127.0.0.1` and `OUTPOST_LAN_ACCESS` off. Only the proxy can then
  reach Outpost, and a name listed in `OUTPOST_ALLOWED_HOSTS` is answered either way.
- **Forwarding headers.** Have the proxy send `X-Forwarded-For` (nginx:
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`; Caddy and Traefik send
  it without being asked). Outpost uses it for one thing: a request that carries it is
  not treated as coming from this computer, so **Erase everything** is not offered to
  people who arrive through the proxy. Without the header every visitor looks local.
- **Live updates.** `/api/events` is a server-sent-events stream that stays open.
  Outpost sends `X-Accel-Buffering: no` with it, which nginx honours. Other proxies
  must not buffer that response, or progress will not appear until the page is
  reloaded. A comment line is sent every 25 seconds to keep the connection alive.
- **Upload size.** Raise the proxy's request-body limit to at least
  `OUTPOST_MAX_UPLOAD_MB` (2048 MB by default). Restoring a backup and loading a
  vectors file send the whole file as one request.

A minimal nginx server block:

```nginx
server {
    listen 443 ssl;
    server_name outpost.example.net;
    # ssl_certificate and ssl_certificate_key go here
    # authentication goes here if this name can be reached from the internet

    client_max_body_size 2048m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /api/events {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

with, in `.env`:

```ini
OUTPOST_ALLOWED_HOSTS=outpost.example.net
```

## Environment variables

### Read by the server

These are defined in `apps/server/src/config.ts`. The "Docker image" column shows the
value the image sets when it differs from the default.

| Variable | Default | Docker image | Meaning |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `development`, `production` or `test`. The packaged app needs `production`. |
| `OUTPOST_HOST` | `127.0.0.1` | `0.0.0.0` | Address the server listens on. Outside a container, anything but a loopback address stops the server at start-up unless `OUTPOST_LAN_ACCESS=true`. In Docker, exposure is controlled by `OUTPOST_BIND` instead. |
| `OUTPOST_PORT` | `8080` | `8080` | Port the server listens on. With Compose this sets the port on the host; the container always uses 8080. |
| `OUTPOST_DATA_DIR` | `./data` | `/data` | Database, attachments and other state Outpost owns. |
| `OUTPOST_STORAGE_ROOTS` | see [above](#from-source) | `/storage` | Comma-separated folders in which storage locations may be created. |
| `OUTPOST_LAN_ACCESS` | `false` | | Share Outpost with every device on the network: accept requests addressed to LAN names and addresses, and allow the server to listen on (or be published on) an address other devices can reach. There are no accounts, so everyone who can reach it can change it. |
| `OUTPOST_IN_CONTAINER` | `false` | `true` | Tells the server it is inside a container, where it always listens on every interface, so `OUTPOST_HOST` says nothing about who can reach it. |
| `OUTPOST_PUBLISHED_ADDRESS` | unset | set by Compose to the value of `OUTPOST_BIND` | Inside a container, the host address the port was published on. Unless this is a loopback address, the server refuses to start without `OUTPOST_LAN_ACCESS=true`. |
| `OUTPOST_ALLOWED_HOSTS` | empty | | Extra host names the server answers to, comma separated. |
| `OUTPOST_KIWIX_URL` | unset | set by Compose to `http://kiwix:8080` | Address of a kiwix-serve that someone else runs. |
| `OUTPOST_KIWIX_BIN` | unset | | Path of a kiwix-serve program for Outpost to run itself. Ignored when `OUTPOST_KIWIX_URL` is set. |
| `OUTPOST_KIWIX_LIBRARY_PATH` | `<data dir>/kiwix/library.xml` | `/kiwix/library.xml` | Where Outpost writes the library file kiwix-serve reads. |
| `OUTPOST_CATALOG_DIR` | the `catalog` folder shipped with Outpost | | Folder holding `manifests/` and `map-regions.json`. |
| `OUTPOST_WEB_DIR` | the built web app shipped with Outpost | | Folder the web app is served from. |
| `OUTPOST_MAX_UPLOAD_MB` | `2048` | | Largest single uploaded file, in megabytes. |
| `OUTPOST_DOWNLOAD_HOSTS` | empty | | Extra hosts a catalogue download may start from, comma separated. |
| `OUTPOST_ALLOW_PRIVATE_DOWNLOADS` | `false` | | Let downloads, including files saved from links, connect to private addresses, for a mirror on your own network. |
| `OUTPOST_ALLOW_REMOTE_ERASE` | `false` | | Let **Erase everything** (Storage → Manage and clean up) be started from any device that can reach Outpost. Without it, only the computer Outpost runs on may. See [security.md](security.md#erasing-everything). |
| `OUTPOST_ALLOW_REMOTE_MODEL_SERVER` | `false` | | Let **Answers from your library**, and a local embedding server for search by meaning, be on the public internet. Without it, such a server must be on this computer or a private network, so that nobody who can open Outpost can have passages from the library sent elsewhere. See [ai.md](ai.md). |
| `OUTPOST_PORTABLE` | `false` | | Set by the launchers on a portable drive. Quieter logging, no removable-media roots, and the port moves up if 8080 is taken. |
| `OUTPOST_APP_DIR` | the running packaged app, or `dist/app` from source | | Packaged app copied onto portable drives. |
| `OUTPOST_NODE_DIST_URL` | `https://nodejs.org/dist` | | Where Node runtimes for portable drives are fetched from; set for a mirror. |
| `OUTPOST_KIWIX_DIST_URL` | `https://download.kiwix.org/release/kiwix-tools` | | Where kiwix-serve for portable drives is fetched from; set for a mirror. |
| `OUTPOST_LOG_LEVEL` | `info` (`warn` on a portable drive, `silent` in tests) | | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |

Two more are read directly, outside `config.ts`:

| Variable | Meaning |
| --- | --- |
| `OUTPOST_OPEN_BROWSER` | When `true`, the server opens the default browser once it is ready. The portable launchers set it. |
| `OUTPOST_SUPERVISED` | When `true`, Outpost may stop itself after a restore so that whatever started it starts it again (exit code 75). The portable launchers and the Docker image set it; in Compose the `restart: unless-stopped` policy is what starts the container again. If you run the image with plain `docker run`, add `--restart unless-stopped` or set `OUTPOST_SUPERVISED=false`. |

Boolean variables accept `1`, `true`, `yes` or `on`.

### Read by `compose.yaml` only

| Variable | Default | Meaning |
| --- | --- | --- |
| `OUTPOST_BIND` | `127.0.0.1` | Host address the port is published on. `0.0.0.0` shares it on the network. |
| `OUTPOST_IMAGE` | `outpost:local` | Name of the image Compose builds and runs. |
| `OUTPOST_MEMORY_LIMIT` | `1g` | Memory ceiling for the `outpost` container. |
| `KIWIX_MEMORY_LIMIT` | `512m` | Memory ceiling for the `kiwix` container. |

`compose.yaml` passes these server variables from `.env` into the container:
`OUTPOST_LAN_ACCESS`, `OUTPOST_ALLOWED_HOSTS`, `OUTPOST_MAX_UPLOAD_MB`,
`OUTPOST_DOWNLOAD_HOSTS`, `OUTPOST_ALLOW_PRIVATE_DOWNLOADS` and
`OUTPOST_ALLOW_REMOTE_ERASE`. It sets
`OUTPOST_PUBLISHED_ADDRESS` from `OUTPOST_BIND` itself. Any other server variable has
no effect until you add it to the `environment:` block of the `outpost` service.

Settings that people change while Outpost runs (download concurrency, search options,
map sources) are not environment variables. They are stored in the database; see
`GET /api/settings` in [api.md](api.md#settings).

### Variables from older versions

An `.env` written for an earlier build may still set `OUTPOST_AUTH`,
`OUTPOST_ALLOW_UNAUTHENTICATED_LAN` or `OUTPOST_SECURE_COOKIES`. They belonged to
accounts, which Outpost does not have. They are ignored, not an error; delete the
lines. On its first start, this version also removes the `users` and `sessions` tables
from an existing database.

## If something goes wrong

See [troubleshooting.md](troubleshooting.md).
