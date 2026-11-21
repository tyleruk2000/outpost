# Installing and running Outpost

Outpost is one server process plus, for reference collections such as Wikipedia, one
helper (kiwix-serve). Run it with Docker Compose, from source, or as the packaged app.
Only a Mac with Apple Silicon and one Raspberry Pi 5 have been used; what has not been
tried on each platform is in [testing-status.md](testing-status.md). If a step does not
do what this page says, [troubleshooting.md](troubleshooting.md) lists the messages and
what to do.

## From a Mac to a Raspberry Pi, step by step

For someone with Outpost on a Mac, a Raspberry Pi 5 (or 4) in its box, and no Docker
experience.

### What you need

- The Pi, its power supply, and a microSD card of 32 GB or more. For a large library,
  also an SSD on USB 3 (see [Raspberry Pi 4 and 5](#raspberry-pi-4-and-5)).
- The Mac, on the same home network.
- The internet for steps 1 to 4 only. After that the Pi needs none.
- About an hour. The first build on the Pi is the slow part.

### 1. Put Raspberry Pi OS on the card

On the Mac, install **Raspberry Pi Imager** from
<https://www.raspberrypi.com/documentation/computers/os.html> and write **Raspberry Pi
OS (64-bit)** to the card. Outpost has no 32-bit build. When Imager offers to change
the settings, set a host name (this page uses `outpost`), your own user name and
password, your Wi-Fi and country (or use a network cable), and turn on SSH.

Put the card in the Pi and switch it on. The first start takes a few minutes.

### 2. Reach the Pi from the Mac

Open **Terminal** on the Mac and type, with your user name:

```bash
ssh yourname@outpost.local
```

Answer `yes`, then give the Pi's password. The prompt ends `outpost:~ $`; everything
typed from now on runs on the Pi. If the name is not found, use the Pi's address from
your router's list of devices (`ssh yourname@192.168.1.30`).

Check the system is 64-bit: `uname -m` must print `aarch64`. If not, write the card
again.

### 3. Get Outpost onto the Pi

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
```

Use the same version as on the Mac (`git pull` there first), or the Mac's backup may be
refused as made by a newer Outpost.

### 4. Run the install script

See what it would do, then do it:

```bash
./deploy/pi/install.sh --dry-run --install-docker --lan --https
./deploy/pi/install.sh --install-docker --lan --https
```

It asks for your password where it needs `sudo`. Among what it prints:

- `Note: this system has memory limits switched off …` on Raspberry Pi OS as it comes,
  and from Docker, `Your kernel does not support memory limit capabilities …`. Nothing
  is wrong: see [Raspberry Pi 4 and 5](#raspberry-pi-4-and-5).
- `Building and starting Outpost.` This takes about three minutes on a Pi 5 with a good
  connection.
- `Fetching VOACAP's coefficients for the HF propagation planner (15 files, 559 kB).`
- `Outpost is running.`, with the addresses to open, such as
  `On your network: http://192.168.1.30:8080`.

**If the Pi already had Docker**, it may have two: the system's, and a rootless one of
your user's (`docker context ls` shows `rootless *`). Outpost in a rootless Docker stops
when you sign out and cannot use a NAS share. Use the system's with `--sudo`, and put
`sudo` before every `docker` command on this page:

```bash
./deploy/pi/install.sh --lan --https --sudo
```

If the script stops with a message, see
[troubleshooting.md](troubleshooting.md#the-raspberry-pi-scripts). To check:

```bash
docker compose ps
curl http://localhost:8080/api/health
```

The first lists `outpost` and `kiwix` as running; the second prints
`{"status":"ok","version":"…"}`. If `docker` says permission denied, sign out (`exit`)
and back in: the script adds you to the `docker` group from your next sign-in.

### 5. Open it from a phone

On any device on the same network, open the address printed under "On your network".
`http://outpost.local:8080` works on devices that look up `.local` names. Add it to the
phone's Home Screen. For location on the map and things kept on the phone, turn on
[HTTPS on your network](#https-on-your-network) once everything else works.

### 6. Bring your library across

Outpost's own records (notes, contacts, settings, places, the search index, the list of
what is in the library) travel in a **backup**. The files themselves (documents,
collections, maps) stay on their storage locations and move separately
([storage.md](storage.md#backing-up)).

**The records.** On the Mac, **Settings → Backup → Download backup**. Restoring is
allowed only at the computer Outpost runs on, and in Docker nothing counts as that, so
on the Pi allow it for the occasion:

```bash
echo "OUTPOST_ALLOW_REMOTE_ERASE=true" >> .env
docker compose up -d
```

From the Mac's browser at the Pi's address, **Settings → Backup → Restore from a
backup**, pick the file, **Restore after restart**, then **Restart now**. Afterwards
delete that line from `.env` (`nano .env`) and run `docker compose up -d` again. A
backup protected by a passphrase can be restored from another device only over `https`.

**The files.** **Storage** on the Mac shows each location's folder.

- **On a NAS (SMB).** On the Pi, in the `outpost` folder, with your NAS's address,
  share, folder and user:

  ```bash
  ./deploy/pi/nas-share.sh --dry-run --server 192.168.1.20 --share docs --folder Outpost --user me
  ./deploy/pi/nas-share.sh --server 192.168.1.20 --share docs --folder Outpost --user me
  ```

  (add `--sudo` if you installed with it). It asks for the NAS password, keeps it where
  only root can read it, mounts the folder now and at every start, gives it to both
  containers as `/storage/nas/docs`, and restarts Outpost. Then **Storage → Add
  location**, folder `/storage/nas/docs`, kind **Network share**. The **Network shares**
  part of Storage will still offer to write out Docker lines; ignore it, the location
  is what counts. NFS is not handled by the script: see
  [storage.md](storage.md#a-share-mounted-by-the-host-then-bind-mounted).
- **On the Mac's disk or a drive.** Copy each location's folder whole onto the SSD for
  the Pi (Finder keeps the hidden `.outpost-location.json`). Mount the SSD on the Pi at
  a fixed place, add it to both services (see [Linux](#linux-x86-64-and-arm64)), then
  **Storage → Add location**.

Until a location is added again it shows as disconnected; nothing is lost. A
[portable drive](portable.md) is for taking a library away, not for moving an
installation.

### 7. Away from home: the Pi's own Wi-Fi network

With no router, the Pi can make a Wi-Fi network of its own. Do this with a screen and
keyboard or a network cable: it cuts off SSH over Wi-Fi.

```bash
sudo ./deploy/pi/hotspot.sh on --ssid "Outpost"
```

Give a password of 8 to 63 characters twice and answer `y`. Phones that join open
`http://10.42.0.1:8080`. `sudo ./deploy/pi/hotspot.sh off` goes back to your home Wi-Fi.
See [A box you can carry](#a-box-you-can-carry-the-install-script-and-a-wi-fi-network-of-the-pis-own).

## Docker Compose quick start

You need Docker with the Compose plugin (`docker compose version` prints a version).

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
cp .env.example .env
docker compose up -d --build
```

Open <http://localhost:8080>. The build needs the internet (dependencies, map fonts and
icons). No image is published; Compose builds `outpost:local` (`OUTPOST_IMAGE`). Every
line in `.env` is optional, and the defaults keep Outpost private to this computer.
Check with `docker compose ps` and `curl http://localhost:8080/api/health`.

While you have internet, fetch the HF propagation planner's coefficients (15 files,
559 kB, each checked against its checksum) so it works offline from the start:

```bash
docker compose exec outpost node /app/scripts/fetch-voacap-data.mjs --data-dir /data
```

Otherwise the planner offers a **Download** button. Outpost never fetches them itself.

### What the stack contains

| Service | What it does | Reachable from |
| --- | --- | --- |
| `outpost` | The web app and API, port 8080, as user `node` (uid 1000). | The host, on `127.0.0.1:8080` by default. |
| `kiwix` | `ghcr.io/kiwix/kiwix-serve:3.8.2`, reads ZIM archives. | Only the `outpost` service. |

| Volume | Mounted at | Holds |
| --- | --- | --- |
| `outpost-data` | `/data` | The database, attachments, extracted text and everything Outpost owns. Keep it on a local disk. |
| `outpost-library` | `/storage/internal` | The default storage location. |
| `kiwix-library` | `/kiwix` | `library.xml`, the list of archives kiwix-serve reads. |

Drives and shares are extra mounts under `/storage`, added to **both** services
(read-only for `kiwix`). [storage.md](storage.md) has examples.

## Letting other devices use it (LAN access)

By default only the computer Outpost runs on can open it. To let phones and other
computers on your network in, set both in `.env` and run `docker compose up -d`:

```ini
OUTPOST_LAN_ACCESS=true
OUTPOST_BIND=0.0.0.0
```

Other devices open `http://<this computer's address>:8080`.

**Outpost has no accounts.** With LAN access on, everyone on the network can read,
change and delete everything. Use it only on a network where you trust everyone. Never
forward the port to the internet, and put it behind a public reverse proxy only if the
proxy asks people to authenticate.

- Outpost then answers to `localhost`, IP addresses, one-word host names, names ending
  `.local`, `.lan`, `.home`, `.internal` or `.home.arpa`, and anything in
  `OUTPOST_ALLOWED_HOSTS`. Other names get "This address is not one Outpost answers to".
- The two settings go together. `OUTPOST_BIND=0.0.0.0` alone stops the server at start,
  saying why; `OUTPOST_LAN_ACCESS=true` alone still publishes only to this computer.
- Both are set where the server starts, never from the browser. **Settings → Who can use
  this library** shows which is in force.
- Traffic is plain HTTP unless you turn on HTTPS (below) or use a proxy.
  [security.md](security.md) says what this does and does not protect.

## HTTPS on your network

Browsers allow location, keeping the screen awake, offline use and adding to the Home
Screen only at an `https` address or at `localhost`. Outpost can give your network an
`https` address with no domain name and no internet. It is optional; the `http`
address always keeps working, nothing is redirected, and no `Strict-Transport-Security`
header is sent.

| How Outpost runs | Before turning it on | With a certificate of your own |
| --- | --- | --- |
| From source or the packaged app | Nothing. It listens on 8443 (`OUTPOST_HTTPS_PORT`) beside 8080; allow that port through any firewall. | Choose the files in Settings at that computer, or put them in `tls/own` and press **Use them**. |
| Docker Compose | Publish the port (uncomment the HTTPS line under `ports:` in `compose.yaml`, or use `compose.override.yaml`), then name the address in Settings. See [Docker](#docker). | Put the files in `/data/tls/own` and press **Use them**. |
| A Pi set up with `install.sh --https` | The script already publishes the port. Then as for Docker. | As for Docker. |
| The Pi's own Wi-Fi network | As above, and add `10.42.0.1` and `outpost.home.arpa` under **Other names and addresses**. Phones use `https://10.42.0.1:8443`. | Only a certificate from an authority of your own can cover those addresses. |
| Behind a reverse proxy | Leave Outpost's HTTPS off; the proxy provides it. | Give it to the proxy. |
| A portable drive | Not offered. | Not offered. |

### Turning it on

1. Turn on [LAN access](#letting-other-devices-use-it-lan-access) first.
2. Open **Settings → HTTPS on your network** and turn on **Use HTTPS**.
3. The section lists the addresses to use, such as `https://192.168.1.20:8443`.
4. On each phone and computer, download the certificate there and trust it (below).
   Until then browsers warn that the connection is not private.

Outpost makes a certificate authority of its own once (valid ten years, named
`Outpost on <host name> (<date>)`) and from it a server certificate (398 days) for every
address and name it is reached by. Every five minutes it checks; when an address changes
or under 30 days remain, it issues a new server certificate. Devices trust the authority,
so they have nothing more to do. The keys are in the `tls` folder of the data directory,
readable only by Outpost's account.

The authority can sign only private addresses (`10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`, `169.254.0.0/16`, `100.64.0.0/10`, loopback, `fc00::/7`, `fe80::/10`),
names ending `.local`, `.lan`, `.home`, `.internal`, `.home.arpa` or `.localhost`, and
the one-word host names it was made with. A public name needs
[a certificate of your own](#using-a-certificate-of-your-own) or a
[reverse proxy](#behind-a-reverse-proxy). Apple devices and desktop browsers enforce
that limit; Android does not ([security.md](security.md#https-on-the-home-network)).

### Trusting the certificate on a device

Once per device. Settings shows the steps for the device in hand (iPhone and iPad,
Android, Mac, Windows, Linux, Firefox), how to check it worked and how to remove it, and
the address at which a phone can open the same page. It offers two downloads,
`outpost-authority.crt` (most devices) and `outpost-authority.pem` (Linux and
`curl --cacert`), with the authority's SHA-256 fingerprint: compare it where the device
shows one, since the download travels over plain HTTP. The same steps trust the root of
a private authority of your own. Menus move between versions.

The steps people miss:

- **iPhone and iPad**: after installing the profile, turn on full trust under
  **Settings › General › About › Certificate Trust Settings**. Install within 8 minutes
  of downloading. No `.mobileconfig` is offered: iOS would need the same step anyway.
- **Android**: install it from **Settings › Security & privacy › More security settings
  › Encryption & credentials › Install a certificate › CA certificate** (not **Wi-Fi
  certificate**); opening the file does nothing. Chrome uses it; Firefox only with **Use
  third party CA certificates** on; other apps do not.
- **Mac**: in Keychain Access set **Secure Sockets Layer (SSL)** to **Always Trust**.
  Firefox reads the **System** keychain, not **login**.
- **Linux**: browsers may keep their own list (Chrome: `chrome://certificate-manager`);
  snap browsers may not see the system's.

### Using a certificate of your own

If you already have a certificate (from a public authority for a name you own, your own
authority, or mkcert), Outpost can serve it instead, under **Use a certificate of your
own instead**. Give it the certificate, its chain and the private key: PEM files
(`fullchain.pem` and `privkey.pem`, or `.crt` and `.key`), DER, or one PKCS#12 file
(`.pfx`, `.p12`) with its password. File order does not matter.

**In Settings**, choose the files and press **Use this certificate**. At the computer
Outpost runs on, or over `https`, they are simply taken. From another device over plain
`http`, Settings warns that the key would cross your network readable by anyone, offers
to turn HTTPS on first, and accepts the upload only if you tick **I accept that my
private key … will cross my network unencrypted** (it logs that it did, not the key).

**In a folder**, put the two PEM files, key without a passphrase, at
`<data directory>/tls/own/fullchain.pem` and `privkey.pem`, then press **Use them**. This
works from any device and is the way for Docker, a Pi, and renewal scripts. Links to
files elsewhere are read through, never written through.

The key is stored unencrypted (HTTPS starts unattended), `600` in a `700` folder, never
served, logged, backed up or put on a portable drive. If other accounts can read a key
you put there, Settings gives the `chmod` to run.

Outpost checks the files first and refuses, saying why, what cannot work: a key that
is not the certificate's, a key with a passphrase (remove it with
`openssl pkey -in privkey.pem -out privkey-open.pem`), an expired certificate, no
subject alternative names, weak keys or signatures, and files of another kind. It warns
about what works only for some: addresses not covered, a public name Outpost was not
told is its own (add it to `OUTPOST_ALLOWED_HOSTS` and make it resolve to this server),
an incomplete chain, a private certificate over 825 days (Apple devices refuse it),
P-521 (Chrome refuses it), and a key other accounts can read.

Settings says, as far as it can tell from Node's built-in list of public authorities,
whether the certificate is from a public authority (devices need nothing), a private one
(devices trust **your** root by the steps above; Settings offers it if you included it)
or self-signed (devices trust that certificate).

**Renewal.** A script only has to replace the two files in `tls/own`. Outpost looks
every five minutes (every 30 seconds while something is wrong) and takes new files up
without a restart, ignoring files changed in the last three seconds. For example:

```bash
install -m 644 /etc/letsencrypt/live/outpost.example.net/fullchain.pem /srv/outpost/data/tls/own/fullchain.pem
install -m 600 /etc/letsencrypt/live/outpost.example.net/privkey.pem   /srv/outpost/data/tls/own/privkey.pem
```

The files must be readable by Outpost's account (uid 1000 in Docker). If new files
cannot be used, Outpost keeps serving the old certificate and says why. Settings shows
the expiry date and warns under 14 days left. **An expired certificate goes on being
served**, with a warning in Settings: Outpost does not swap in its own authority behind
your back, and the `http` address keeps working while you renew. After a restart with
unusable files, HTTPS does not start until they are put right.

**Go back to Outpost's own certificate** is one press and loses nothing. **Delete your
certificate from this server** removes the files and turns HTTPS off if it used them;
it is offered only at the computer Outpost runs on, or with
`OUTPOST_ALLOW_REMOTE_ERASE=true`.

### Docker

A container cannot see the computer's addresses, so as well as turning HTTPS on:

1. **Publish the port**: uncomment the HTTPS line under `ports:` in `compose.yaml`, then
   `docker compose up -d`. The port is the same inside and out (8443).
2. **Name the address**: open `http://<this computer's address>:8080/settings#https`
   from another device and press the button that adds it, or type it under **Other names
   and addresses**.

No request looks local to a container, so **Make a new certificate authority** and
**Turn HTTPS off and delete it** need `OUTPOST_ALLOW_REMOTE_ERASE=true` for the
occasion, or delete `ca.crt`, `ca.key`, `server.crt` and `server.key` from the volume's
`tls` folder with Outpost stopped. A certificate of your own goes in by the folder:

```bash
docker compose exec -T outpost sh -c 'mkdir -p /data/tls/own && chmod 700 /data/tls /data/tls/own'
docker compose exec -T outpost sh -c 'cat > /data/tls/own/fullchain.pem' < fullchain.pem
docker compose exec -T outpost sh -c 'umask 077 && cat > /data/tls/own/privkey.pem' < privkey.pem
```

Then **Use them**. A renewal runs the last two lines again.

### Mesh radio in a container

For the [mesh radio link](mesh-radio.md):

- **Outpost as the broker**: publish its port under `ports:` (`- "1883:1883"`), on the
  home network only.
- **A USB radio** must be passed through, under the `outpost` service:

  ```yaml
      devices:
        - /dev/ttyACM0:/dev/ttyACM0   # ttyUSB0 for some radios
      group_add:
        - dialout                     # or: stat -c %g /dev/ttyACM0
  ```

  Docker Desktop on a Mac cannot pass USB through; run Outpost without Docker there, or
  use the radio's network port.
- **Settings → Mesh radio** can be changed in a container only with
  `OUTPOST_ALLOW_REMOTE_SETTINGS=true` in `.env`.
- **A Mosquitto on the same computer** is not at `127.0.0.1` inside the container; use
  the host's network address or the container's gateway (`172.17.0.1` and so on), which
  **Find a broker** tries. Do not publish Outpost's own broker on the same port.

### Backups and moving

- The `tls` folder is never in a backup or on a portable drive; the HTTPS setting is.
  Restoring onto a new machine with HTTPS on makes a **new** authority there, which every
  device must trust again; to keep the old one, copy `tls` across yourself with Outpost
  stopped. A certificate of your own must be put in `tls/own` on the new machine.
- **Erase everything** turns HTTPS off but keeps the authority.
- **Make a new certificate authority** means every device must trust the new one.

### If it does not work

- **"Port 8443 is already in use"**: set `OUTPOST_HTTPS_PORT` to a free port.
- **"This computer's clock reads …"**: Outpost will not make certificates by a clock that
  is years out. Set the clock ([device.md](device.md#the-servers-clock)).
- **The browser still warns**: use one of the addresses Settings lists. On iOS, check
  full trust; on Android, **CA certificate**, not **Wi-Fi certificate**.
- **"This address is not one Outpost answers to"** with your own certificate: add the
  name to `OUTPOST_ALLOWED_HOSTS`.
- **"Outpost is not allowed to read …/privkey.pem"**: make it readable by Outpost's
  account only.
- **"… is a link to somewhere else"**: replace the files where the link points.

## Updating

Back up first (**Settings → Backup**), then:

```bash
git pull
docker compose up -d --build
```

Migrations run when the server starts; volumes are untouched. An image built before
16 November 2026 held the HF planner's coefficients inside it; after updating from one,
run the fetch line in the [quick start](#docker-compose-quick-start) once. Updating from
inside the app is in [updating.md](updating.md).

## Logs

```bash
docker compose logs -f outpost
docker compose logs -f kiwix
```

One JSON object per line. To set `OUTPOST_LOG_LEVEL`, add it to the `environment:`
block of `compose.yaml`.

## Stopping and removing

```bash
docker compose stop        # stop, keep everything
docker compose down        # remove the containers, keep the volumes
```

`docker compose down -v` also deletes the volumes: the database and the default library.

Stopping takes a moment. Requests in progress get three seconds, background jobs stop
where they can resume (a download keeps its partial file), and the server exits within
eight seconds. A second signal ends it at once.

## Platform notes

Images build for `linux/amd64` and `linux/arm64`; there is no 32-bit build.

### macOS (Apple Silicon and Intel)

Install Docker Desktop. Drives appear under `/Volumes`; mount one into both services,
allowed under Docker Desktop's file sharing, with the drive plugged in before starting:

```yaml
services:
  outpost:
    volumes:
      - /Volumes/FieldSSD:/storage/field-ssd
  kiwix:
    volumes:
      - /Volumes/FieldSSD:/storage/field-ssd:ro
```

Keep `outpost-data` as a named volume; never put the database on an external or network
drive.

### Windows 10 and 11

Use Docker Desktop with WSL 2. Keep the Outpost folder inside WSL (`~/outpost`) and run
`docker compose` from a WSL shell. Mount a Windows drive for content as
`/mnt/d/outpost:/storage/drive-d` (and `:ro` for `kiwix`). From PowerShell, use the long
form instead:

```yaml
      - type: bind
        source: D:/outpost
        target: /storage/drive-d
```

Never put the database on a Windows drive: SQLite needs file locking that shared files
lack. Running without Docker on Windows has not been tried.

### Linux (x86-64 and ARM64)

Install Docker Engine and the Compose plugin. Folders mounted under `/storage` must be
writable by uid 1000 (`sudo chown -R 1000:1000 /mnt/usb-ssd/outpost`); exFAT, FAT32 and
NTFS need the mount options `uid=1000,gid=1000`. Mount drives at a fixed place
(`/etc/fstab` with `nofail`) so the path exists at boot.

### Raspberry Pi 4 and 5

- A 64-bit system is required.
- **Memory.** Compose limits the containers to 1 GB and 512 MB (`OUTPOST_MEMORY_LIMIT`,
  `KIWIX_MEMORY_LIMIT`), enough on a 4 GB board for keyword search, reading, notes and
  maps. **Raspberry Pi OS as it comes does not apply these limits** (it starts with
  `cgroup_disable=memory`), so Docker warns and the containers run without a ceiling.
  Outpost works the same; what is lost is the guard against it crowding out other
  programs. Guides for the Pi add `cgroup_enable=memory cgroup_memory=1` to
  `/boot/firmware/cmdline.txt`. Choose 8 GB to run an embedding server on the board too,
  or to index very large PDFs.
- Leave **Documents processed at once** at 1 and downloads at 1 or 2 at a time.
- **Storage.** The SD card can hold the system and the database; large collections
  belong on a USB 3 SSD. Keep the database on storage always attached to the Pi, never on
  a share or a drive you unplug.
- Building a semantic index on a Pi is slow; build it on a faster computer and
  [move the vectors](search.md#moving-vectors-between-installations).

#### A box you can carry: the install script and a Wi-Fi network of the Pi's own

Read both scripts in `deploy/pi/` and run each with `--dry-run` first.

`install.sh` checks for 64-bit Raspberry Pi OS and then, as asked:
`--install-docker` installs Docker Engine and Compose from Docker's apt repository;
`--lan` sets LAN access in `.env` (keeping a copy of the old file), announces the Pi as
`outpost.local` and adds the clock service ([device.md](device.md)); `--https` writes a
`compose.override.yaml` publishing 8443; `--sudo` uses the system's Docker;
`--metrics` turns on Prometheus. It builds and starts the stack, then fetches the HF
planner's coefficients (`--no-voacap-data` skips that).

`hotspot.sh on` makes a WPA2 access point on `wlan0` (`outpost-hotspot`), with the Pi at
`10.42.0.1`, started at boot. Phones open `http://10.42.0.1:8080` or
`http://outpost.home.arpa:8080`. `hotspot.sh off` removes it; `hotspot.sh status` says
which it is.

- The Pi's one Wi-Fi radio cannot be a hotspot and on your home Wi-Fi at once.
- The Wi-Fi password is all that stands between that network and Outpost. NetworkManager
  keeps it readable by root only.
- If the Pi has internet over Ethernet, it is shared with whoever joins.
- **Erase everything** and restoring are not available from a phone on the hotspot
  without `OUTPOST_ALLOW_REMOTE_ERASE=true`.
- For location and offline use, install with `--https`, open
  `http://10.42.0.1:8080/settings#https`, turn HTTPS on, add the address (and
  `outpost.home.arpa`), and trust the certificate. Then use `https://10.42.0.1:8443`.

### NAS and home servers that run containers

A NAS with Docker Compose and a 64-bit CPU should run the stack. Keep `outpost-data` on
the NAS's own disk, bind-mount shared folders under `/storage` in both services, writable
by uid 1000. If the NAS cannot build images, build on another machine and load it.

## Running without Docker

### From source

Node.js 26 and pnpm 9. Nothing is compiled during installation.

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
pnpm install
node scripts/fetch-map-assets.mjs        # map fonts and icons, once
node scripts/fetch-embedding-model.mjs   # model for search by meaning (24 MB), once
pnpm build
node scripts/fetch-voacap-data.mjs --data-dir apps/server/data   # HF planner data, optional
pnpm start
```

Open <http://localhost:8080>.

- `pnpm start` does **not** read `.env`; set variables in the shell:
  `OUTPOST_DATA_DIR=/srv/outpost/data OUTPOST_STORAGE_ROOTS=/srv/outpost/library pnpm start`.
- Without `OUTPOST_DATA_DIR`, data goes to `apps/server/data`. Set it for anything you
  keep.
- Without `OUTPOST_STORAGE_ROOTS`, content may go in `<data directory>/library` and where
  removable drives appear: `/Volumes` on macOS; `/media/<user>`, `/run/media/<user>` and
  `/mnt` on Linux. On Windows only the library folder.
- Skipping a fetch costs only its part: map labels and icons, the built-in search by
  meaning, or the HF planner's data (which then offers **Download**).
- For LAN access set `OUTPOST_HOST=0.0.0.0` with `OUTPOST_LAN_ACCESS=true`, after reading
  [what that means](#letting-other-devices-use-it-lan-access).

### The packaged app

A folder that needs only a Node 26 binary; it is what the Docker image and portable
drives contain, with SQLite for macOS, Linux and Windows on x64 and arm64.

```bash
pnpm install
node scripts/fetch-map-assets.mjs
node scripts/fetch-embedding-model.mjs
node scripts/build-app.mjs            # writes dist/app; --skip-web, --out <dir>
NODE_ENV=production OUTPOST_DATA_DIR=/srv/outpost/data OUTPOST_STORAGE_ROOTS=/srv/outpost/library \
  node dist/app/server/outpost.mjs
```

`NODE_ENV=production` is required, or it stops at start-up. The HF planner's
coefficients are not included; fetch them once with
`node dist/app/scripts/fetch-voacap-data.mjs --data-dir /srv/outpost/data` (or
`--from <folder>` to copy them with no network). Updating from an app built before
16 November 2026: start the new version once with the old folder still in place and it
copies them across, or use `--from <old app>/engines/voacap/data/itshfbc`.

### Reference collections without Docker

ZIM archives need kiwix-serve 3.8.2 from the Kiwix project
(<https://download.kiwix.org/release/kiwix-tools/>; a portable drive's copy is cached in
`<data directory>/runtimes/`). Either:

- **Let Outpost run it**: `OUTPOST_KIWIX_BIN=/usr/local/bin/kiwix-serve pnpm start`.
  Outpost runs it on a private port and restarts it if it stops.
- **Run it yourself** and set `OUTPOST_KIWIX_URL`, with the library file Outpost writes:

  ```bash
  kiwix-serve --port 8081 --address 127.0.0.1 --library --monitorLibrary --nodatealiases /srv/outpost/data/kiwix/library.xml
  ```

  It must see archives at the same paths as Outpost and must not be reachable from the
  network: Outpost sandboxes what it serves.

Without either, everything else works and the reader says collections cannot be read.

## Behind a reverse proxy

Not tried; check your own set-up.

- **Authentication.** Outpost has none; a proxy reachable from the internet must ask
  for it. Check that collection pages (a sandboxed frame without cookies) still load.
- **Host names.** Pass the original `Host` header and list the name in
  `OUTPOST_ALLOWED_HOSTS`.
- **Keep Outpost private.** With the proxy on the same machine, leave `OUTPOST_BIND` at
  `127.0.0.1` and LAN access off.
- **`X-Forwarded-For`.** Send it (nginx:
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). A request carrying it
  is not treated as local, so **Erase everything** is not offered through the proxy. If
  something forwards connections without it, start Outpost with
  `OUTPOST_OWN_ADDRESS_IS_LOCAL=false`.
- **Live updates.** Do not buffer `/api/events` (Outpost sends `X-Accel-Buffering: no`
  for nginx).
- **Upload size.** Allow at least `OUTPOST_MAX_UPLOAD_MB` (2048 MB); a backup restore is
  one request.

```nginx
server {
    listen 443 ssl;
    server_name outpost.example.net;
    # ssl_certificate, ssl_certificate_key, and authentication go here
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

with `OUTPOST_ALLOWED_HOSTS=outpost.example.net` in `.env`.

## Environment variables

### Read by the server

"Docker" shows the image's value where it differs. Booleans accept `1`, `true`, `yes` or
`on`.

| Variable | Default | Docker | Meaning |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | The packaged app needs `production`. |
| `OUTPOST_HOST` | `127.0.0.1` | `0.0.0.0` | Listening address. Outside a container, a non-loopback address needs `OUTPOST_LAN_ACCESS`. |
| `OUTPOST_PORT` | `8080` | | Port; with Compose, the host's port. |
| `OUTPOST_HTTPS_PORT` | `8443` | | HTTPS port, the same inside and outside a container. |
| `OUTPOST_DATA_DIR` | `./data` | `/data` | The database and everything Outpost owns. |
| `OUTPOST_STORAGE_ROOTS` | see [From source](#from-source) | `/storage` | Folders where storage locations may be made, comma separated. |
| `OUTPOST_STORAGE_PROBE_TIMEOUT_MS` | `5000` | | How long a location may take to answer its check before it is marked not answering. |
| `UV_THREADPOOL_SIZE` | `16` | | Threads for file work, so a share that stops answering does not hold up the rest. |
| `OUTPOST_LAN_ACCESS` | `false` | | Let every device on the network use Outpost. |
| `OUTPOST_OWN_ADDRESS_IS_LOCAL` | `true` | | Whether a browser at one of this computer's own addresses counts as the computer. Set `false` if something here forwards other devices' connections without `X-Forwarded-For`. |
| `OUTPOST_IN_CONTAINER` | `false` | `true` | Tells the server it is in a container. |
| `OUTPOST_PUBLISHED_ADDRESS` | | from `OUTPOST_BIND` | The host address the port is published on; non-loopback needs LAN access. |
| `OUTPOST_ALLOWED_HOSTS` | | | Extra host names to answer to, comma separated. |
| `OUTPOST_KIWIX_URL` | | `http://kiwix:8080` | A kiwix-serve someone else runs. |
| `OUTPOST_KIWIX_BIN` | | | A kiwix-serve for Outpost to run. |
| `OUTPOST_KIWIX_LIBRARY_PATH` | `<data>/kiwix/library.xml` | `/kiwix/library.xml` | The library file kiwix-serve reads. |
| `OUTPOST_CATALOG_DIR` | the shipped `catalog` | | Folder with `manifests/` and `map-regions.json`. |
| `OUTPOST_WEB_DIR` | the shipped web app | | Folder the web app is served from. |
| `OUTPOST_MAX_UPLOAD_MB` | `2048` | | Largest upload. |
| `OUTPOST_DOWNLOAD_HOSTS` | | | Extra hosts catalogue downloads may use. |
| `OUTPOST_ALLOW_PRIVATE_DOWNLOADS` | `false` | | Let downloads reach private addresses, for a mirror at home. |
| `OUTPOST_SOLAR_TABLE_URL` | NOAA's table | | Where a newer solar cycle table is fetched from, when asked ([hf-propagation.md](hf-propagation.md#where-the-sunspot-number-comes-from)). |
| `OUTPOST_ALLOW_REMOTE_ERASE` | `false` | | Let any device erase everything, restore or delete backups, keep fewer, set the backup passphrase (only over `https`), install updates, and replace the HTTPS authority. Otherwise only this computer ([security.md](security.md#erasing-everything)). |
| `OUTPOST_ALLOW_REMOTE_CLOCK` | `false` | | Let any device set the server's clock ([device.md](device.md#the-servers-clock)). |
| `OUTPOST_METRICS` | `false` | | Answer Prometheus at `/metrics` ([device.md](device.md#prometheus-and-grafana)). |
| `OUTPOST_FORGET_PIN` | `false` | | Start with no household PIN; remove it again afterwards ([security.md](security.md#the-household-pin)). |
| `OUTPOST_ALLOW_REMOTE_SETTINGS` | `false` | | Let any device change Settings → Mesh radio and the switch letting other programs use Outpost's tools. In a container, nothing can without it. |
| `OUTPOST_NETWORK_SCAN_LOCAL_ONLY` | `false` | | Only this computer may scan **Devices on this network** ([security.md](security.md#devices-on-this-network)). |
| `OUTPOST_ALLOW_REMOTE_MODEL_SERVER` | `false` | | Allow a model or embedding server on the public internet ([ai.md](ai.md)). |
| `OUTPOST_OLLAMA_ADDRESSES` | Ollama's two defaults | | Where **Look for Ollama on this computer** looks, comma separated. |
| `OUTPOST_PORTABLE` | `false` | | Set by a portable drive's launchers. |
| `OUTPOST_APP_DIR` | the running app | | Packaged app copied onto portable drives. |
| `OUTPOST_NODE_DIST_URL` | `https://nodejs.org/dist` | | Mirror for Node runtimes on portable drives. |
| `OUTPOST_KIWIX_DIST_URL` | `https://download.kiwix.org/release/kiwix-tools` | | Mirror for kiwix-serve on portable drives. |
| `OUTPOST_LOG_LEVEL` | `info` | | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `OUTPOST_OPEN_BROWSER` | | | Open the browser once ready (portable launchers). |
| `OUTPOST_SUPERVISED` | | `true` | Outpost may exit after a restore for its supervisor to restart it. With plain `docker run`, add `--restart unless-stopped` or set it `false`. |

Variables used only by the test suites are in
[development/storage-and-https.md](development/storage-and-https.md).

### Read by `compose.yaml` only

| Variable | Default | Meaning |
| --- | --- | --- |
| `OUTPOST_BIND` | `127.0.0.1` | Host address the port is published on; `0.0.0.0` shares it. |
| `OUTPOST_IMAGE` | `outpost:local` | The image Compose builds and runs. |
| `OUTPOST_MEMORY_LIMIT` | `1g` | Memory ceiling for `outpost`. |
| `KIWIX_MEMORY_LIMIT` | `512m` | Memory ceiling for `kiwix`. |

`compose.yaml` passes only `OUTPOST_LAN_ACCESS`, `OUTPOST_ALLOWED_HOSTS`,
`OUTPOST_HTTPS_PORT`, `OUTPOST_MAX_UPLOAD_MB`, `OUTPOST_DOWNLOAD_HOSTS`,
`OUTPOST_ALLOW_PRIVATE_DOWNLOADS` and `OUTPOST_ALLOW_REMOTE_ERASE` from `.env`. Add any
other to the `environment:` block of the `outpost` service. Settings changed while
Outpost runs are kept in the database, not here.

`OUTPOST_AUTH`, `OUTPOST_ALLOW_UNAUTHENTICATED_LAN` and `OUTPOST_SECURE_COOKIES` from
older builds are ignored; delete them.
