# Installing and running Outpost

Outpost is one server process plus kiwix-serve for reference collections such as
Wikipedia. Run it with Docker Compose, from source, or as the packaged app. Only a Mac
with Apple Silicon and one Raspberry Pi 5 have been used
([testing-status.md](testing-status.md)); if a step goes wrong, see
[troubleshooting.md](troubleshooting.md).

## On a Raspberry Pi, step by step

From a new card to the household's phones, with only the Pi and a laptop (Windows, macOS
or Linux) on the same home network. No Docker experience is needed: the scripts do that
part. Times and sizes below were measured on one Raspberry Pi 5 with 8 GB; where nothing
has been measured yet, this says so.

### What you need

- **A Raspberry Pi 5 or 4** with 4 GB of memory or more (8 GB to build walking and
  cycling for a large country, or to run a model server beside Outpost), and its
  official power supply: Outpost warns when the power dips.
- **A microSD card of 64 GB or more; 128 GB for the United Kingdom with walking and
  cycling.** On the Pi measured, the United Kingdom's map, hills, place names, routes,
  nearby places and walking and cycling came to 9.2 GB with its 2.3 GB source file;
  building walking and cycling needs about 8 GB more free while it runs; Outpost's
  images take about 1.2 GB; all on top of the system and Docker. A build also writes
  about 53 GB to the disk it works on, and a larger card spreads that wear over more of
  itself. A reference library is better kept on a NAS or a USB 3 SSD.
- **A NAS** (any that shares folders over SMB, such as Synology or QNAP), with a user
  for Outpost and a folder made for it already, such as `Outpost` in the share `docs`.
- The internet, for the installation (steps 1 to 4) and for each download you press.

### 1. Write the card

On the laptop, install **Raspberry Pi Imager** from
<https://www.raspberrypi.com/software/>. Choose your Pi, then **Raspberry Pi OS (64-bit)**
(the Lite version, without a desktop, is enough), then the card. When Imager offers to
customise the settings, set:

- the host name `outpost` (the rest of this page uses it),
- your own user name and password,
- your Wi-Fi and country (or plug in a network cable, which is steadier),
- **SSH** on, with password authentication.

Write the card, put it in the Pi and switch it on. The first start takes a minute or two.

### 2. Sign in to the Pi

On the laptop, open **PowerShell** (Windows) or **Terminal** (macOS, Linux) and type, with
your user name:

```bash
ssh yourname@outpost.local
```

Answer `yes`, then the Pi's password. Everything typed from now on runs on the Pi. If the
name is not found, use the Pi's address from your router's list of devices
(`ssh yourname@192.168.1.30`). `uname -m` must print `aarch64`; if not, write the card
again with the 64-bit system.

### 3. Get Outpost onto the Pi

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
```

### 4. Install it

See what it would do, then do it:

```bash
./deploy/pi/install.sh --dry-run --install-docker --lan
./deploy/pi/install.sh --install-docker --lan
```

It asks for your password where it needs `sudo`. In order, it:

1. installs Docker from Docker's own apt repository (`--install-docker`),
2. lets other devices on your network open Outpost, and announces the Pi as
   `outpost.local` (`--lan`),
3. builds Outpost's image on the Pi and starts it. The build downloads Node, the programs
   Outpost uses, map fonts and the search model; it has not yet been timed on a fresh Pi,
   so leave it running however long it is quiet,
4. adds two small services: one that lets Outpost set the Pi's clock, and one that
   installs updates from the app (skipped, saying so, while releases are not signed),
5. fetches the HF propagation planner's data (559 kB).

It ends with `Outpost is running.` and the addresses to open, such as
`On your network: http://192.168.1.30:8080`. A warning that memory limits are off is
expected (see [Raspberry Pi 4 and 5](#raspberry-pi-4-and-5)). If it stops with a
message, see [troubleshooting.md](troubleshooting.md#the-raspberry-pi-scripts). If
`docker` then says permission denied, sign out (`exit`) and back in.

**If the Pi already had Docker** and `docker context ls` shows `rootless *`, add
`--sudo` to every script on this page and put `sudo` before every `docker` command:
Outpost in a rootless Docker stops when you sign out and cannot use a NAS share.

### 5. Open it, and give the phones the address

On the laptop or a phone on the same network, open `http://outpost.local:8080`, or the
address printed under "On your network" if the name does not open (some networks do not
pass `.local` names on; `hostname -I` on the Pi prints its address again). That address
is the one to give the family: on each phone, open it and add it to the Home Screen.

**HTTPS stays off.** Over plain `http` everything opens and works, except what browsers
keep to secure pages: the phone's location on the map, recording a track, keeping maps
and pages on the phone itself, and keeping the screen awake. Outpost says so at each of
those, with the way to turn it on. When you want them, run the installer again with
`--https` and follow [HTTPS on your network](#https-on-your-network); each phone then
trusts Outpost's certificate once.

### 6. Connect your NAS

In the `outpost` folder on the Pi, with your NAS's address, share, folder and user:

```bash
./deploy/pi/nas-share.sh --dry-run --server 192.168.1.20 --share docs --folder Outpost --user me
./deploy/pi/nas-share.sh --server 192.168.1.20 --share docs --folder Outpost --user me
```

The folder must be on the NAS already. The script asks for the NAS password and keeps it
where only root can read it, mounts the folder at every start (the Pi still starts when
the NAS is off), gives it to Outpost as `/storage/nas/docs`, and restarts Outpost. Then,
in Outpost: **Storage → Add location**, open `nas` → `docs`, give it a name, kind
**Network share**. To keep downloads there, tick **Use for new downloads**; maps are
better left on the Pi, so that they work while the NAS is off. For NFS, see
[storage.md](storage.md#a-share-mounted-by-the-host-then-bind-mounted).

### 7. Nightly backups to the NAS

**Settings → Automatic backups**, choose the NAS: the next one is at 3:00 am, daily or
weekly, with how many are kept. Press **Back up now** (seconds), then **Test a restore**
in that backup's menu: it opens the backup and says what is in it. **Settings → Server
status** then shows the last backup. A backup holds Outpost's records (notes, contacts,
settings, the list of what is in the library), not the library's files
([storage.md](storage.md#backing-up)). Giving backups a passphrase is kept to the Pi
itself: see [step 10](#10-things-kept-to-the-pi-itself).

### 8. Maps, routes, and walking and cycling

**Home → Download a map → Add a place**, choose the country, tick **Map**, **Routes** and
**Nearby places**, and choose whether to keep the country's source file (the United
Kingdom's is 2.3 GB, and walking and cycling is built from it) ([maps.md](maps.md)).

Walking, cycling and door-to-door routes come from an optional add-on
([Street routes](#street-routes)). Add it on the Pi:

```bash
./deploy/pi/install.sh --street-routes
```

It downloads Valhalla's image (about 700 MB) once and builds the streets image on the Pi.
Then **Add a place** again with **Walking and cycling** ticked, and under **Where it
works** choose the NAS to spare the card. On the Pi 5 measured, the build took **91
minutes for the United Kingdom** (56 for Great Britain); routes keep working on what is
in use meanwhile.

### 9. A reference library

**Home → Download a reference collection** opens Explore, with each collection's size and
licence. **Wikipedia 100** is a small first one to try. In the download dialog, **Where
to keep it** offers the NAS. Nothing is fetched until you press **Download**.

### 10. Things kept to the Pi itself

Outpost has no accounts, so a few things are kept to "the computer Outpost runs on":
restoring a backup, deleting stored ones, a backup passphrase, erasing everything,
setting the clock, and some settings. In Docker no browser counts as that computer, not
even one on the Pi, and opening them to the whole network would not be safe. Instead,
open Outpost through the Pi for as long as you need it. From the laptop, sign in with a
tunnel, then start it:

```bash
ssh -L 8090:localhost:8090 yourname@outpost.local
cd outpost && ./deploy/pi/on-this-pi.sh
```

Open `http://localhost:8090` on the laptop: there, those things are allowed. **Ctrl-C**
closes it again; it changes no setting. With a screen and keyboard on the Pi, run the
second line there and open the same address in the Pi's browser (the desktop version of
the system has one). The clock can also be
set on the Pi itself with `sudo date -s "2026-11-24 09:30"` (your time now).

### 11. Updating, and going back

Back up first (**Settings → Automatic backups → Back up now**), then on the Pi:

```bash
cd ~/outpost
git pull
./deploy/pi/install.sh
```

The installer keeps what is in `.env` (network access, walking and cycling) and the HTTPS
port, then rebuilds and restarts Outpost; the library and the backups are not touched. If
walking and cycling then says it cannot write to the NAS, run `nas-share.sh` again with
the options you first gave it (it keeps the password).

To go back: `git log --oneline -5` lists the last versions; `git checkout <the one
before>`, then `./deploy/pi/install.sh` again. The newer version may have changed the
database: if something is wrong, restore the backup made before updating (as in step 10,
then **Settings → Backup → Restore from a backup**). `git checkout main` returns to the
newest. Updating from inside the app: [updating.md](updating.md).

### Moving from a Mac

Optional, for someone who already has Outpost on a Mac. Update both to the same version
first (`git pull` on each), or the Mac's backup may be refused.

**The records.** On the Mac, **Settings → Backup → Download backup**. Open Outpost on the
Pi as in [step 10](#10-things-kept-to-the-pi-itself), then **Settings → Backup → Restore
from a backup**, pick the file, **Restore after restart**, then **Restart now**.

**The files.** **Storage** on the Mac shows each location's folder.

- **On a NAS (SMB).** Connect the same folder as in [step 6](#6-connect-your-nas).
- **On the Mac's disk or a drive.** Copy each location's folder whole onto the Pi's SSD
  (with its hidden `.outpost-location.json`), mount it at a fixed place in both services
  (see [Linux](#linux-x86-64-and-arm64)), then **Storage → Add location**.

Until then a location shows as disconnected; nothing is lost. A
[portable drive](portable.md) is for taking a library away, not for moving an
installation.

### Away from home: the Pi's own Wi-Fi network

With no router, the Pi can make a Wi-Fi network of its own: see
[A box you can carry](#a-box-you-can-carry-the-install-script-and-a-wi-fi-network-of-the-pis-own).

## Docker Compose quick start

You need Docker with the Compose plugin.

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
cp .env.example .env
docker compose up -d --build
```

Open <http://localhost:8080>. The build needs the internet. Every line in `.env` is
optional; the defaults keep Outpost private to this computer. While you have internet, fetch the HF propagation planner's data (559 kB) so
it works offline:

```bash
docker compose exec outpost node /app/scripts/fetch-voacap-data.mjs --data-dir /data
```

Otherwise the planner offers a **Download** button.

### What the stack contains

Two services: `outpost` (the web app and API, as uid 1000, published to
`127.0.0.1:8080` by default) and `kiwix` (kiwix-serve 3.8.2, reachable only from
`outpost`). Three volumes: `outpost-data` at `/data` (the database and everything
Outpost owns; keep it on a local disk), `outpost-library` at `/storage/internal` (the
default storage location) and `kiwix-library` at `/kiwix`. Drives and shares are extra
mounts under `/storage`, added to **both** services (read-only for `kiwix`;
[storage.md](storage.md) has examples).

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

Outpost then answers to IP addresses, one-word host names, names ending `.local`,
`.lan`, `.home`, `.internal` or `.home.arpa`, and anything in `OUTPOST_ALLOWED_HOSTS`.
`OUTPOST_BIND=0.0.0.0` alone stops the server at start, saying why. **Settings → Who can
use this library** shows what is in force. Traffic is plain HTTP unless you turn on
HTTPS ([security.md](security.md) says what is and is not protected).

## HTTPS on your network

Browsers allow location, keeping the screen awake, offline use and adding to the Home
Screen only at an `https` address or at `localhost`. Outpost can give your network one
with no domain name and no internet. The `http` address keeps working. Not offered on a
portable drive; behind a reverse proxy, the proxy provides it.

### Turning it on

1. Turn on [LAN access](#letting-other-devices-use-it-lan-access). In Docker, also see
   [Docker](#docker) below.
2. **Settings → HTTPS on your network → Use HTTPS**. Outpost listens on 8443
   (`OUTPOST_HTTPS_PORT`); allow it through any firewall.
3. Use the addresses the section lists, such as `https://192.168.1.20:8443`. On the Pi's
   own Wi-Fi network, add `10.42.0.1` and `outpost.home.arpa` under **Other names and
   addresses**.
4. Trust the certificate on each device (below); until then browsers warn.

Each device trusts Outpost's own certificate authority once
([security.md](security.md#https-on-the-home-network)). It signs only private
addresses, names ending `.local`, `.lan`, `.home`, `.internal`, `.home.arpa` or
`.localhost`, and one-word host names. A public name needs
[a certificate of your own](#using-a-certificate-of-your-own) or a
[reverse proxy](#behind-a-reverse-proxy).

### Trusting the certificate on a device

Settings shows the steps for the device in hand, the files to download, and the
authority's SHA-256 fingerprint: compare it where the device shows one, since the
download travels over plain HTTP. The steps people miss:

- **iPhone and iPad**: install the profile within 8 minutes of downloading, then turn on
  full trust under **Settings › General › About › Certificate Trust Settings**.
- **Android**: **Settings › Security & privacy › More security settings › Encryption &
  credentials › Install a certificate › CA certificate** (not **Wi-Fi certificate**);
  opening the file does nothing. Chrome uses it; Firefox only with **Use third party CA
  certificates** on; other apps do not.
- **Mac**: in Keychain Access set **Secure Sockets Layer (SSL)** to **Always Trust**.
  Firefox reads the **System** keychain, not **login**.
- **Linux**: browsers may keep their own list (Chrome: `chrome://certificate-manager`);
  snap browsers may not see the system's.

### Using a certificate of your own

**Use a certificate of your own instead** serves one you have (from a public authority,
your own authority, or mkcert): PEM, DER, or a PKCS#12 file with its password.

- **In Settings**, choose the files and press **Use this certificate**. From another
  device over plain `http`, you must first tick that the key will cross your network
  unencrypted.
- **In a folder**, put `fullchain.pem` and `privkey.pem` in `<data directory>/tls/own/`
  and press **Use them** (for Docker, a Pi and renewal scripts). The key must have no
  passphrase (`openssl pkey -in privkey.pem -out privkey-open.pem` removes one).

Outpost refuses files that cannot work, saying why, and warns about what only some
devices accept (such as an incomplete chain, or a public name not in
`OUTPOST_ALLOWED_HOSTS`). The key is kept unencrypted, readable only by Outpost's
account, and never served, logged, backed up or put on a portable drive.

**Renewal.** Replace the two files, readable by Outpost's account (uid 1000 in Docker);
Outpost takes them up within five minutes without a restart:

```bash
install -m 644 /etc/letsencrypt/live/outpost.example.net/fullchain.pem /srv/outpost/data/tls/own/fullchain.pem
install -m 600 /etc/letsencrypt/live/outpost.example.net/privkey.pem   /srv/outpost/data/tls/own/privkey.pem
```

Unusable new files leave the old certificate in use, with the reason in Settings.
**An expired certificate goes on being served** (Settings warns 14 days before).
**Go back to Outpost's own certificate** loses nothing; **Delete your certificate from
this server** needs the computer itself or `OUTPOST_ALLOW_REMOTE_ERASE=true`.

### Docker

As well as turning HTTPS on:

1. **Publish the port**: uncomment the HTTPS line under `ports:` in `compose.yaml` (or
   use `compose.override.yaml`; `install.sh --https` does this), then
   `docker compose up -d`.
2. **Name the address**: open `http://<this computer's address>:8080/settings#https`
   from another device and press the button that adds it.

**Make a new certificate authority** and **Turn HTTPS off and delete it** need
`OUTPOST_ALLOW_REMOTE_ERASE=true` for the occasion (on a Pi, open Outpost through
[`on-this-pi.sh`](#10-things-kept-to-the-pi-itself) instead), or delete `ca.crt`, `ca.key`,
`server.crt` and `server.key` from the volume's `tls` folder with Outpost stopped. A
certificate of your own goes in by the folder, then **Use them** (a renewal repeats the
last two lines):

```bash
docker compose exec -T outpost sh -c 'mkdir -p /data/tls/own && chmod 700 /data/tls /data/tls/own'
docker compose exec -T outpost sh -c 'cat > /data/tls/own/fullchain.pem' < fullchain.pem
docker compose exec -T outpost sh -c 'umask 077 && cat > /data/tls/own/privkey.pem' < privkey.pem
```

### Mesh radio in a container

For the [mesh radio link](mesh-radio.md):

- **Outpost as the broker**: publish `- "1883:1883"` under `ports:`, on the home network
  only. A Mosquitto on the same computer is at the host's address or the container's
  gateway (`172.17.0.1`), not `127.0.0.1`; **Find a broker** tries them.
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
  `OUTPOST_ALLOW_REMOTE_SETTINGS=true` in `.env`, or on a Pi through
  [`on-this-pi.sh`](#10-things-kept-to-the-pi-itself).

### Backups and moving

The `tls` folder is never backed up, so restoring onto a new machine with HTTPS on makes
a **new** authority that every device must trust again, unless you copy `tls` across
with Outpost stopped. **Erase everything** turns
HTTPS off but keeps the authority.

### If it does not work

- **"This computer's clock reads …"**: [set the clock](device.md#the-servers-clock).
- **"Outpost is not allowed to read …/privkey.pem"**: make it readable by Outpost's
  account only.
- **"… is a link to somewhere else"**: Outpost never writes through links in `tls/own`;
  replace the files where the link points.
- Other messages: [troubleshooting.md](troubleshooting.md#the-browser-says-the-https-address-is-not-private).

## Updating

Back up first (**Settings → Backup**), then:

```bash
git pull
docker compose up -d --build
```

Volumes are untouched. If the HF planner then asks for its data, run the fetch line in
the [quick start](#docker-compose-quick-start). Updating from inside the app:
[updating.md](updating.md).

## Logs

```bash
docker compose logs -f outpost
docker compose logs -f kiwix
```

One JSON object per line; set `OUTPOST_LOG_LEVEL` in the `environment:` block of
`compose.yaml`.

## Stopping and removing

```bash
docker compose stop        # stop, keep everything
docker compose down        # remove the containers, keep the volumes
```

`docker compose down -v` also deletes the volumes: the database and the default library.
On stopping, jobs stop where they can resume and the server exits within eight seconds;
a second signal ends it at once.

## Platform notes

Images build for `linux/amd64` and `linux/arm64`; there is no 32-bit build. Never put
the database (`outpost-data`) on an external, network or Windows drive: SQLite needs a
local disk with proper file locking.

### macOS (Apple Silicon and Intel)

Use Docker Desktop. Mount a drive from `/Volumes` into both services (allowed under
Docker Desktop's file sharing, plugged in before starting):

```yaml
services:
  outpost:
    volumes:
      - /Volumes/FieldSSD:/storage/field-ssd
  kiwix:
    volumes:
      - /Volumes/FieldSSD:/storage/field-ssd:ro
```

### Windows 10 and 11

Use Docker Desktop with WSL 2. Keep the Outpost folder inside WSL (`~/outpost`), run
`docker compose` from a WSL shell, and mount a Windows drive as
`/mnt/d/outpost:/storage/drive-d` (`:ro` for `kiwix`). Running without Docker on Windows
has not been tried.

### Linux (x86-64 and ARM64)

Install Docker Engine and the Compose plugin. Folders mounted under `/storage` must be
writable by uid 1000 (`sudo chown -R 1000:1000 /mnt/usb-ssd/outpost`); exFAT, FAT32 and
NTFS need the mount options `uid=1000,gid=1000`. Mount drives at a fixed place
(`/etc/fstab` with `nofail`) so the path exists at boot.

### Raspberry Pi 4 and 5

- 64-bit only. The SD card can hold the system and the database; large collections
  belong on a USB 3 SSD.
- **Memory.** Compose limits the containers to 1 GB and 512 MB, enough on a 4 GB board
  for keyword search, reading, notes and maps. Raspberry Pi OS as it comes does not apply
  these limits, so Docker warns ("Your kernel does not support memory limit
  capabilities") and the containers run without a ceiling: Outpost works the same, but
  could crowd out other programs. To apply them, add `cgroup_enable=memory
  cgroup_memory=1` to `/boot/firmware/cmdline.txt`. Choose 8 GB to run an embedding
  server on the board too, or to index very large PDFs.
- Leave **Documents processed at once** at 1 and downloads at 1 or 2 at a time.
- Search by meaning reads about a thousand passages every four minutes on a Pi 5, so
  60,000 passages take about four hours the first time; the Pi does it on its own, in the
  background, and carries on after a restart. A laptop can [do the reading
  instead](search.md#reading-the-library-on-a-faster-computer) if you have one, but it
  is never needed.

#### Street routes

Door-to-door, walking and cycling routes and street-level reachable areas come from the
optional **Walking and cycling** add-on: a streets service (Valhalla) in a container of its
own beside Outpost, on a private network with no port open. It is off unless you ask for it:

```bash
./deploy/pi/install.sh --street-routes
```

That sets `COMPOSE_PROFILES=routes` in `.env` and builds the streets image on the Pi (it
downloads Valhalla's image, about 700 MB, once). Elsewhere, put `COMPOSE_PROFILES=routes`
in `.env` and run `docker compose up -d --build`.

Then add **Walking and cycling** for a place under **Maps → Offline maps**, in **Add a
place** ([maps.md](maps.md#walking-and-cycling)). On a Pi 5 with 8 GB, Great Britain took
56 minutes and the United Kingdom 91; each needed about 8 GB free while building, takes
2.7 to 2.9 GB after, and wrote about 53 GB to the disk it worked on. Choose a NAS or USB
disk as the place it works to spare the SD card. That location must be mounted read-write
in the `valhalla` service: a NAS connected with `deploy/pi/nas-share.sh` is (if it was
connected by an older copy of the script, run it again with the same options); for a USB
disk, add the mount to the `valhalla` service in `compose.override.yaml`. Drives keep
planning on Outpost's own routes whether or not the add-on is there.

Outpost's own updates do not touch the streets service. When a release changes it (its notes
say so), rebuild and restart it from the checkout; the streets already built are kept:

```bash
git pull && docker compose --profile routes up -d --build valhalla
```

Until then, a reachable area over 2 hours says the service is older than Outpost. To take it away, remove
walking and cycling on Offline maps, set `COMPOSE_PROFILES` back, and delete the `valhalla-tiles`
volume.

#### A box you can carry: the install script and a Wi-Fi network of the Pi's own

`install.sh` checks for 64-bit Raspberry Pi OS, then: `--install-docker` installs
Docker from Docker's apt repository; `--lan` turns on LAN access (keeping a copy of the
old `.env`), announces the Pi as `outpost.local` and adds the clock service
([device.md](device.md)); `--https` publishes 8443; `--sudo` uses the system's Docker;
`--metrics` turns on Prometheus. It builds and starts the stack and fetches the HF
planner's data (`--no-voacap-data` skips that).

With a screen and keyboard or a network cable (it cuts off SSH over Wi-Fi), run
`sudo ./deploy/pi/hotspot.sh on --ssid "Outpost"` and give a password of 8 to 63
characters. Phones that join open `http://10.42.0.1:8080`. `hotspot.sh off` goes back to
your home Wi-Fi; `hotspot.sh status` says which it is.

- The Pi's one Wi-Fi radio cannot be a hotspot and on your home Wi-Fi at once.
- The Wi-Fi password is all that stands between that network and Outpost.
- If the Pi has internet over Ethernet, it is shared with whoever joins.
- **Erase everything** and restoring need a laptop through
  [`on-this-pi.sh`](#10-things-kept-to-the-pi-itself), or `OUTPOST_ALLOW_REMOTE_ERASE=true`
  from a phone.
- For location and offline use, [turn on HTTPS](#turning-it-on) and use
  `https://10.42.0.1:8443`.

### NAS and home servers that run containers

A NAS with Docker Compose and a 64-bit CPU should run the stack: `outpost-data` on its
own disk, shared folders bind-mounted under `/storage` in both services, writable by
uid 1000. If it cannot build images, build on another machine and load the image.

## Running without Docker

### From source

Node.js 26 and pnpm 9.

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
  Without `OUTPOST_DATA_DIR`, data goes to `apps/server/data`.
- Without `OUTPOST_STORAGE_ROOTS`, content may go in `<data directory>/library` and where
  removable drives appear (`/Volumes` on macOS; `/media/<user>`, `/run/media/<user>` and
  `/mnt` on Linux; on Windows only the library folder).
- Each fetch is optional: skipping one costs only map labels, search by meaning, or the
  HF planner.
- For [LAN access](#letting-other-devices-use-it-lan-access) set `OUTPOST_HOST=0.0.0.0`
  with `OUTPOST_LAN_ACCESS=true`.

### The packaged app

A folder that needs only a Node 26 binary, with SQLite for macOS, Linux and Windows on
x64 and arm64; the Docker image and portable drives contain it.

```bash
pnpm install
node scripts/fetch-map-assets.mjs
node scripts/fetch-embedding-model.mjs
node scripts/build-app.mjs            # writes dist/app; --skip-web, --out <dir>
NODE_ENV=production OUTPOST_DATA_DIR=/srv/outpost/data OUTPOST_STORAGE_ROOTS=/srv/outpost/library \
  node dist/app/server/outpost.mjs
```

`NODE_ENV=production` is required. Fetch the HF planner's data once with
`node dist/app/scripts/fetch-voacap-data.mjs --data-dir /srv/outpost/data`, or copy it
with no network using `--from <folder>` (from an older app that held it,
`--from <old app>/engines/voacap/data/itshfbc`).

### Reference collections without Docker

ZIM archives need kiwix-serve 3.8.2
(<https://download.kiwix.org/release/kiwix-tools/>). Either:

- **Let Outpost run it** on a private port, restarting it if it stops:
  `OUTPOST_KIWIX_BIN=/usr/local/bin/kiwix-serve pnpm start`.
- **Run it yourself**, on the library file Outpost writes, and set `OUTPOST_KIWIX_URL`.
  It must see archives at Outpost's paths and must not be reachable from the network:

  ```bash
  kiwix-serve --port 8081 --address 127.0.0.1 --library --monitorLibrary --nodatealiases /srv/outpost/data/kiwix/library.xml
  ```

Without either, everything else works and the reader says collections cannot be read.

## Behind a reverse proxy

Not tried; check your own set-up.

- **Authentication.** A proxy reachable from the internet must ask for it. Check that
  collection pages (a sandboxed frame without cookies) still load.
- **Host names.** Pass the original `Host` header and list the name in
  `OUTPOST_ALLOWED_HOSTS`. Leave LAN access off if the proxy is on the same machine.
- **`X-Forwarded-For`.** Send it: a request carrying it is not treated as local, so
  **Erase everything** is not offered through the proxy. If something forwards
  connections without it, set `OUTPOST_OWN_ADDRESS_IS_LOCAL=false`.
- Do not buffer `/api/events`, and allow uploads of `OUTPOST_MAX_UPLOAD_MB` (a backup
  restore is one request).

```nginx
server {
    listen 443 ssl;
    server_name outpost.example.net;
    # ssl_certificate, ssl_certificate_key, and authentication go here
    client_max_body_size 2048m;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    location / {
        proxy_pass http://127.0.0.1:8080;
    }

    location /api/events {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

## Environment variables

### Read by the server

Booleans accept `1`, `true`, `yes` or `on`. Described above:
`OUTPOST_LAN_ACCESS` and `OUTPOST_ALLOWED_HOSTS` ([LAN access](#letting-other-devices-use-it-lan-access)),
`OUTPOST_HTTPS_PORT`, `OUTPOST_DATA_DIR`, `OUTPOST_STORAGE_ROOTS` and `OUTPOST_HOST`
([From source](#from-source); in Docker `/data`, `/storage` and `0.0.0.0`), `NODE_ENV`,
`OUTPOST_KIWIX_BIN` and `OUTPOST_KIWIX_URL`, `OUTPOST_OWN_ADDRESS_IS_LOCAL` and
`OUTPOST_MAX_UPLOAD_MB` ([reverse proxy](#behind-a-reverse-proxy)). The others:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OUTPOST_PORT` | `8080` | Port; with Compose, the host's. |
| `OUTPOST_DOWNLOAD_HOSTS` | | Extra hosts catalogue downloads may use. |
| `OUTPOST_ALLOW_PRIVATE_DOWNLOADS` | `false` | Let downloads reach private addresses, for a mirror at home. |
| `OUTPOST_ALLOW_REMOTE_ERASE` | `false` | Let any device erase everything, restore or delete backups, keep fewer, set the backup passphrase (over `https`), install updates, and replace the HTTPS authority ([security.md](security.md#erasing-everything)). |
| `OUTPOST_ALLOW_REMOTE_SETTINGS` | `false` | Let any device change Settings → Mesh radio and whether other programs may use Outpost's tools. |
| `OUTPOST_ALLOW_REMOTE_CLOCK`, `OUTPOST_METRICS` | `false` | See [device.md](device.md#the-servers-clock). |
| `OUTPOST_FORGET_PIN`, `OUTPOST_NETWORK_SCAN_LOCAL_ONLY` | `false` | See [security.md](security.md#the-household-pin). |
| `OUTPOST_ALLOW_REMOTE_MODEL_SERVER` | `false` | See [ai.md](ai.md). |
| `OUTPOST_LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `OUTPOST_SUPERVISED` | `true` in Docker | Outpost may exit after a restore for its supervisor to restart it. With plain `docker run`, add `--restart unless-stopped` or set it `false`. |

`OUTPOST_SOLAR_TABLE_URL` is in
[hf-propagation.md](hf-propagation.md#where-the-sunspot-number-comes-from) and the runtime
mirrors in [portable.md](portable.md). Paths, tuning, and those set by the image or the
launchers are in [development/storage-and-https.md](development/storage-and-https.md).

### Read by `compose.yaml` only

| Variable | Default | Meaning |
| --- | --- | --- |
| `OUTPOST_BIND` | `127.0.0.1` | Host address the port is published on; `0.0.0.0` shares it. |
| `OUTPOST_IMAGE` | `outpost:local` | The image Compose builds and runs. |
| `OUTPOST_MEMORY_LIMIT`, `KIWIX_MEMORY_LIMIT` | `1g`, `512m` | Memory ceilings. |

From `.env`, `compose.yaml` passes the server only the `OUTPOST_ALLOW_…` switches,
`OUTPOST_LAN_ACCESS`, `OUTPOST_ALLOWED_HOSTS`, `OUTPOST_HTTPS_PORT`,
`OUTPOST_MAX_UPLOAD_MB`, `OUTPOST_DOWNLOAD_HOSTS`, `OUTPOST_FORGET_PIN` and
`OUTPOST_METRICS`; add any other to the `outpost` service's `environment:` block.
`OUTPOST_AUTH`, `OUTPOST_ALLOW_UNAUTHENTICATED_LAN` and `OUTPOST_SECURE_COOKIES` from
older builds are ignored.
