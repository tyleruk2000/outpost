# Installing and running Outpost

This page covers running Outpost with Docker Compose, running it without Docker, the
notes that matter on each platform, and every environment variable the server reads.

Outpost is one server process plus, for reference collections such as Wikipedia, one
helper process (kiwix-serve). See [architecture.md](architecture.md) for how the parts
fit together.

## What has been tried, and what has not

Read this before relying on any step below. Outpost is developed and used every day on
a Mac with Apple Silicon, from source, as the packaged app, and as the full Docker
Compose stack. The test suites are run by hand on that Mac.

**One Raspberry Pi has been set up, once**, on 17 November 2026: a Raspberry Pi 5 with 8 GB, Raspberry Pi OS (Debian 12), with Docker 27.5 already installed.
`deploy/pi/install.sh --lan --https --sudo` built and started Outpost there in about
three minutes, it was opened from a Mac on the same network, and
`deploy/pi/nas-share.sh` connected a folder on a Synology NAS over SMB, which came back
by itself after being unmounted and after the containers were restarted. What that run
did **not** cover: a Pi 4, a board with 4 GB, putting the system on the card (steps 1
and 2 below), `--install-docker`, `hotspot.sh`, HTTPS from a phone, restoring a backup
on the Pi, NFS, a collection read from the share, and how the Pi does under a real
library. Nothing was timed beyond the build. Added to the install script since, and not
yet run on a Pi: the name `outpost.local`, the service that sets the clock, and
`--metrics` with a real Prometheus scrape (see [device.md](device.md)). They were
written from Avahi's, systemd's and Prometheus's documentation and tried with `--dry-run`
and stand-ins on the Mac.

**Nothing else has been tried**: not Linux on a PC, not an Intel Mac, not Windows, not
Outpost running on a NAS. The steps for those were written from their makers'
documentation and from what the same steps do on the Mac, and each section says so. If a
step does not do what this page says, [troubleshooting.md](troubleshooting.md) has the
messages Outpost and the scripts print, and what to do about each.

## From a Mac to a Raspberry Pi, step by step

For a person who has Outpost running on a Mac, a Raspberry Pi 5 (or 4) still in its box,
and has not used Docker before. Each step says what to type, what you should see, and
what to do if you do not see it. Steps 3 to 5 and the NAS part of step 6 have been done
on one real Pi; the rest has not: see [above](#what-has-been-tried-and-what-has-not). The Pi does the same as any Linux
computer would from step 4 on, using the script described under
[Raspberry Pi 4 and 5](#raspberry-pi-4-and-5).

### What you need

- The Pi, its power supply, and a microSD card of 32 GB or more. For a large library,
  an SSD that connects over USB 3 as well (see [Raspberry Pi 4 and 5](#raspberry-pi-4-and-5)
  for why).
- The Mac, on the same home network as the Pi will be.
- The internet, for steps 1 to 4 only: they download Raspberry Pi OS, Docker, Outpost
  and the map fonts and search model it is built with. After that the Pi needs none.
- About an hour. The first build on the Pi is the slow part.

### 1. Put Raspberry Pi OS on the card

On the Mac, install **Raspberry Pi Imager** from
<https://www.raspberrypi.com/documentation/computers/os.html>, put the card in, and
write **Raspberry Pi OS (64-bit)** to it. A 64-bit system is required: Outpost has no
32-bit build, and the install script stops on a 32-bit one. When Imager offers to
change the settings before writing, set:

- a host name (this page uses `outpost`),
- a user name and password of your own,
- your Wi-Fi network and your country (or plug the Pi into the router with a cable),
- and turn on SSH, so that the Mac can type commands on the Pi.

Put the card in the Pi and switch it on. The first start takes a few minutes.

### 2. Reach the Pi from the Mac

On the Mac, open **Terminal** (in Applications → Utilities) and type, with the user name
you chose:

```bash
ssh yourname@outpost.local
```

The first time, it asks whether to trust the Pi: type `yes`, then the Pi's password.
You should then see a prompt that ends with `outpost:~ $`. Everything typed from now on
runs on the Pi.

If it says the name could not be resolved, find the Pi's address in your router's list
of devices and use that instead (`ssh yourname@192.168.1.30`, with your own address).

Check that the system is the 64-bit one:

```bash
uname -m
```

It should print `aarch64`. Anything else means the card has a 32-bit system: write it
again with the 64-bit one.

### 3. Get Outpost onto the Pi

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
```

The clone should end with a line about resolving deltas and `done`. Use the same version
of Outpost here as on the Mac (on the Mac, `git pull` in its folder first), or a backup
from the Mac may be refused as made by a newer Outpost.

### 4. Run the install script

First see what it would do; nothing is changed:

```bash
./deploy/pi/install.sh --dry-run --install-docker --lan --https
```

Then run it for real:

```bash
./deploy/pi/install.sh --install-docker --lan --https
```

It asks for your password where it needs `sudo`. What each option does is under
[Raspberry Pi 4 and 5](#raspberry-pi-4-and-5): in short, `--install-docker` installs
Docker, `--lan` lets phones on your network use Outpost, and `--https` gets the Pi ready
for an `https` address later. You should see, one after another:

- `Installing Docker Engine and the Compose plugin from Docker's apt repository.` (only
  if Docker is not there yet)
- `Creating .env from .env.example.`
- `Letting other devices on the network reach Outpost …`
- `Publishing the HTTPS port (compose.override.yaml).`
- `Note: this system has memory limits switched off …` on Raspberry Pi OS as it comes.
  Nothing is wrong: see [Raspberry Pi 4 and 5](#raspberry-pi-4-and-5).
- `Building and starting Outpost. The first build downloads map fonts and the search model and can take a long time on a Pi.`
  This is the slow part. Docker prints a great deal while it builds: about three minutes
  on a Pi 5 with a good connection. Among it, twice, `Your kernel does not support
  memory limit capabilities or the cgroup is not mounted. Limitation discarded.`, which
  is the same note in Docker's words, and appears again every time the containers start.
- `Waiting for Outpost to answer.`
- `Fetching VOACAP's coefficients for the HF propagation planner (15 files, 559 kB).`
- `Outpost is running.`, then the addresses to open it at, one of them
  `On your network: http://192.168.1.30:8080` with the Pi's own address (one line for
  each network the Pi is on, and `Over Tailscale:` if it has that).

**If the Pi already has Docker, check which one `docker` means.** Some Pis have two: the
system's, which needs `sudo` or membership of the `docker` group, and a rootless one
belonging to your user. `docker context ls` shows a line `rootless *` when plain
`docker` means the second. The script then says so and carries on into the rootless
one, where `sudo docker ps` will not show Outpost, where it stops when you sign out
unless lingering is on, and where a NAS share cannot be connected with the script in
step 6. To use the system's Docker, add `--sudo`:

```bash
./deploy/pi/install.sh --lan --https --sudo
```

and from then on put `sudo` before every `docker` command on this page. (The first real
run went into a rootless Docker unnoticed, which is why the option exists.)

If it stops with a message instead, [troubleshooting.md](troubleshooting.md#the-raspberry-pi-scripts)
lists each one. Then check from the Pi itself:

```bash
docker compose ps
curl http://localhost:8080/api/health
```

The first should list `outpost` and `kiwix` as running; the second prints
`{"status":"ok","version":"…"}`. If `docker` says permission denied, sign out of the Pi
(`exit`) and `ssh` in again: the script adds you to the `docker` group, which counts from
your next sign-in. Until then, put `sudo` before `docker`.

### 5. Open it from a phone

On a phone or the Mac, on the same network, open the address the script printed under
"On your network", for example `http://192.168.1.30:8080`. You should see Outpost's
Home, empty. `http://outpost.local:8080` also works on a device that can look up
`.local` names.

Write the address down, or add it to the phone's Home Screen. To have location on the
map and things kept on the phone, turn on [HTTPS on your network](#https-on-your-network)
once everything else works.

### 6. Bring your library across

What you have on the Mac is in two parts, and each moves its own way
([storage.md](storage.md#backing-up) says which is which):

- **Outpost's own records**: notes, contacts, settings, saved places, the search index
  and the list of what is in the library. These travel in a **backup**.
- **The files themselves**: documents, collections and maps, on their storage locations.
  A backup does not carry them; it records where they were.

**The records.** On the Mac, open **Settings → Backup** and press **Download backup**.
Restoring replaces everything at once, so Outpost allows it only at the computer it
runs on, and in Docker no request counts as coming from that computer. So, on the Pi,
allow it for the occasion:

```bash
echo "OUTPOST_ALLOW_REMOTE_ERASE=true" >> .env
docker compose up -d
```

Then, from the Mac's browser at the Pi's address, open **Settings → Backup**, choose
**Restore from a backup**, pick the file, and confirm with **Restore after restart**.
Press **Restart now** when it is offered. When Outpost is back, take the permission
away again: delete that line from `.env` (`nano .env`, then Ctrl-O, Enter, Ctrl-X) and
run `docker compose up -d`. A backup protected by a passphrase can only be restored from
another device over `https`; restore an unprotected one, or turn HTTPS on first.

**The files**, depending on where they are now. Open **Storage** on the Mac to see the
folder of each location.

- **On a NAS (an SMB share).** On the Pi, in the `outpost` folder, with the NAS's
  address, the share, the folder Outpost's library is in, and the user you sign in to
  the NAS as:

  ```bash
  ./deploy/pi/nas-share.sh --dry-run --server 192.168.1.20 --share docs --folder Outpost --user me
  ./deploy/pi/nas-share.sh --server 192.168.1.20 --share docs --folder Outpost --user me
  ```

  (add `--sudo` if you installed with it). It asks for the NAS password without showing
  it and keeps it in a file only root can read; mounts that one folder at
  `/mnt/outpost-nas/docs`, now and after every restart; gives it to both containers as
  `/storage/nas/docs`; and restarts Outpost. Run it in a terminal of your own: the
  password is asked for at the keyboard. Then in Outpost open **Storage → Add location**,
  choose the folder `/storage/nas/docs` and the kind **Network share**. Outpost finds its
  marker file and the documents and collections in it are available again. The
  **Network shares** part of the Storage screen will still say that Docker has to
  connect a share and offer to write out the lines: that is the same job done by hand,
  and it does not list what the script connected. What counts is the location under
  **Storage locations**. [storage.md](storage.md#a-share-mounted-by-the-host-then-bind-mounted)
  has what the script writes, and NFS, which it does not do.
- **On the Mac's own disk or a drive plugged into it.** Copy each location's folder,
  whole, onto the SSD for the Pi (Finder's copy keeps the hidden marker file
  `.outpost-location.json`). Plug the SSD into the Pi, mount it at a fixed place and
  add it to both services (see [Linux](#linux-x86-64-and-arm64)), then **Storage → Add
  location** as above.

Until a location is added again, Storage shows it as disconnected; nothing is lost.

A [portable drive](portable.md) is a different thing: a complete copy of Outpost that
runs from a USB drive on another computer, the Pi included, without installing it. It is
for taking a library away and bringing back what was written there, not for moving an
installation.

### 7. If you take the Pi away from home: its own Wi-Fi network

With no router, phones can still reach the Pi over a Wi-Fi network the Pi makes itself.
`deploy/pi/hotspot.sh` sets that up; it is explained, with what to know before relying
on it, under
[A box you can carry](#a-box-you-can-carry-the-install-script-and-a-wi-fi-network-of-the-pis-own).
In short, with a screen and keyboard on the Pi or a network cable (turning the hotspot
on cuts off an SSH session that runs over Wi-Fi):

```bash
sudo ./deploy/pi/hotspot.sh on --ssid "Outpost"
```

It asks for a password of 8 to 63 characters, twice, says what it is about to do and
asks `Go ahead? [y/N]` (type `y`), and then says
`The "Outpost" network is on.` with the addresses to open from a phone that has joined
it: `http://10.42.0.1:8080`. `sudo ./deploy/pi/hotspot.sh off` puts the Pi back on your
home Wi-Fi.

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

One more step, while there is internet, makes the HF propagation planner work offline
from the start: it fetches VOACAP's ionospheric and noise coefficients (15 files,
559 kB), which Outpost does not ship (see
[hf-propagation.md](hf-propagation.md#data)), into the data volume, each checked
against its recorded checksum:

```bash
docker compose exec outpost node /app/scripts/fetch-voacap-data.mjs --data-dir /data
```

Skip it and the planner shows a **Download** button instead, which fetches the same
files. Outpost never fetches them by itself.

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
- Traffic on the LAN is plain HTTP unless you turn on
  [HTTPS on your network](#https-on-your-network) or put a reverse proxy in front.

[security.md](security.md) explains what this does and does not protect.

## HTTPS on your network

Browsers let a page use a device's location, keep its screen awake, run a service
worker or be added to the Home Screen only at a secure address: one that begins
`https`, or the computer itself (`localhost`). A phone that opens
`http://192.168.1.20:8080` gets none of those. Outpost can give your network an `https`
address without a domain name and without the internet.

It is off by default and optional. Plain HTTP on the usual port keeps working whether
it is on or off, nothing is redirected, and no `Strict-Transport-Security` header is
sent, so a device that does not trust the certificate can always use the `http` address.

### What each way of running Outpost needs

HTTPS is always switched on in Settings. What differs is whether anything has to be
done first so that its port can be reached, and how a
[certificate of your own](#using-a-certificate-of-your-own) gets to Outpost if you
have one. Most people do not, and need only the middle column.

| How Outpost runs | Before turning it on in Settings | If you bring a certificate of your own |
| --- | --- | --- |
| From source (`pnpm start`) or the packaged app | Nothing. The listener opens on port 8443 (`OUTPOST_HTTPS_PORT`) beside the HTTP one. If a firewall is on, allow that port as you allowed 8080. | Choose the two files in Settings, in a browser on that computer. Or put them in `tls/own` of the data directory and press **Use them** from any device. |
| Docker Compose | Publish the port: uncomment the HTTPS line under `ports:` in `compose.yaml`, or put it in a `compose.override.yaml`, then `docker compose up -d`. Then name the address in Settings, because a container cannot see the computer's addresses. See [Docker](#docker) below. | Put the two files in `/data/tls/own` of the `outpost-data` volume ([how](#docker)) and press **Use them**. Choosing files in Settings is offered only at an `https` address, because no request looks local to a container. |
| A Raspberry Pi set up with `deploy/pi/install.sh` | Run the script with `--https` (with `--lan`): it writes a `compose.override.yaml` that publishes the port. Then as for Docker. | As for Docker. |
| The Pi's own Wi-Fi network (`deploy/pi/hotspot.sh`) | As above, and add `10.42.0.1` and `outpost.home.arpa` under **Other names and addresses** in Settings, so the certificate covers the addresses phones on that network use: `https://10.42.0.1:8443`. | It must cover `10.42.0.1` or `outpost.home.arpa`, which no public authority will sign. Only one from an authority of your own can. |
| Behind a reverse proxy with its own certificate | Leave Outpost's HTTPS off; the proxy provides it. See [Behind a reverse proxy](#behind-a-reverse-proxy). | Give it to the proxy, not to Outpost. |
| A portable drive | Not offered: a drive moves between computers, and each would need its own authority trusted by each device. | Not offered. |

With Outpost's own certificate, each phone and computer then has to be told once to
trust it ([steps below](#trusting-the-certificate-on-a-device)). With a certificate of
your own from a public authority, devices need nothing; from an authority of your own,
they need that authority's root, by the same steps.

### Turning it on

1. Share Outpost with your network first (see [above](#letting-other-devices-use-it-lan-access)).
   Without LAN access only this computer can reach Outpost, and a browser on this
   computer already treats `localhost` as secure.
2. Open **Settings → HTTPS on your network** and turn on **Use HTTPS**.
3. The section then lists the addresses to use, such as `https://192.168.1.20:8443` and
   `https://kitchen-pi.local:8443`.
4. On each phone and computer, download the certificate from that section and tell the
   device to trust it (steps below). Until then the browser warns that the connection is
   not private.

What happens when you turn it on:

- Outpost makes a **certificate authority** of its own: an RSA 3072-bit key and a
  certificate valid for ten years, named `Outpost on <host name> (<date>)`. It is made
  once and kept.
- It signs a **server certificate** (ECDSA P-256, valid from the day before it is made
  until 397 days after: 398 days in all) listing every way this
  server is reached: its addresses on private networks, `<host name>.local`, the host
  name, anything in `OUTPOST_ALLOWED_HOSTS` or in **Other names and addresses** that the
  authority may sign for, and `localhost`.
- A second listener answers on port 8443 (`OUTPOST_HTTPS_PORT`), on the same address as
  the HTTP one, and serves the same app and API under the same rules.
- Every five minutes (every 30 seconds while something stands in the way, such as the
  port being taken) Outpost looks at the computer's addresses and the certificate's age.
  If an address has changed (a router handing out a new one, a different network) or
  the certificate has under 30 days left, a new server certificate is issued and used at
  once. Devices trust the authority, not the server certificate, so they have nothing to
  do.

Everything is in the `tls` folder of the data directory: `ca.crt`, `ca.key`,
`server.crt`, `server.key`. The folder and the two keys are readable only by the account
that runs Outpost.

### What the certificate authority may sign

The authority carries limits inside its own certificate (critical name constraints, a
path length of 0, and server authentication as its only purpose):

- addresses in `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`,
  `100.64.0.0/10`, `127.0.0.0/8`, `fc00::/7`, `fe80::/10` and `::1`;
- names ending in `.local`, `.lan`, `.home`, `.internal`, `.home.arpa` or `.localhost`;
- the one-word host name this computer had when the authority was made, and any
  one-word names listed at that moment.

A public address or a name such as `outpost.example.net` cannot go on the certificate;
Settings says so next to the name. For a public name, give Outpost
[a certificate of your own](#using-a-certificate-of-your-own) from a public authority,
or put one on a [reverse proxy](#behind-a-reverse-proxy). A one-word name that
appears later (a renamed computer) needs either its `.local` form or a new authority.

Which devices hold the authority to those limits is in
[security.md](security.md#https-on-the-home-network). In short: Apple devices and desktop
browsers do, Android does not.

### Trusting the certificate on a device

A device accepts the `https` address once it trusts the certificate authority. That is
done once per device, on the device. Settings has the steps for each kind of device
straight after the list of addresses, opens the ones for the device in hand, and gives
the address at which a phone can open that same page.

The authority's public certificate comes in two forms, and each set of steps links the
one that kind of device wants:

| File | Form | Address | For |
| --- | --- | --- | --- |
| `outpost-authority.crt` | DER (binary) | `GET /api/https/outpost-authority.crt` | iPhone, iPad, Android, Mac, Windows, Firefox |
| `outpost-authority.pem` | PEM (text) | `GET /api/https/outpost-authority.pem` | Linux, and commands such as `curl --cacert` |

Settings shows the authority's name and SHA-256 fingerprint. Compare the fingerprint
with what the device shows where it shows one, because the download itself travels over
plain HTTP.

**No configuration profile (`.mobileconfig`) is offered for Apple devices**, because it
would not shorten anything. Apple: "If you manually install a profile that contains a
certificate payload in iOS, iPadOS, and visionOS, that certificate isn't automatically
trusted for SSL"
([102390](https://support.apple.com/en-us/102390)), and "On a Mac with macOS 13 or
later, by default, macOS doesn't mark root certificates that you manually install with
a configuration profile as trusted for TLS"
([Apple Platform Deployment](https://support.apple.com/guide/deployment/depb5eff8914/web)).
The trust step is the same either way, and an unsigned profile adds a warning of its
own.

**What was tried, and what was not.** Every menu name and command below was read in
November 2026 from the source given beside it; nothing was written from memory. Where
a label comes from the words in a program's source and not from a help page, that is
said. On a Mac (macOS 15.6.1) both downloads were added to a keychain made for the
purpose with `security add-certificates`, found there under the name and fingerprint
Settings shows, and deleted again by name and by fingerprint; `security verify-cert`,
`curl --cacert` and `openssl s_client -CAfile` were run against a running Outpost.
**Not tried:** marking the certificate as trusted in a real keychain (`security
add-trusted-cert`, or Keychain Access), since that changes the settings of the Mac it is
run on; and anything at all on an iPhone, an iPad, an Android phone, a Windows computer
or a Linux computer. Menus move between versions.

The same steps serve a [certificate of your own](#using-a-certificate-of-your-own)
from a private authority: there the file is your authority's root, not Outpost's.

#### iPhone and iPad

1. Open the Settings page in Safari on the device and tap **Download the certificate**
   (`outpost-authority.crt`). Allow the download.
2. Open the Settings app and tap **Profile Downloaded**.
3. Tap **Install** in the upper-right corner and follow the instructions.
4. Go to **Settings › General › About › Certificate Trust Settings** and, under **Enable
   full trust for root certificates**, turn on trust for the certificate.

- **Check:** open the `https` address in Safari. The page opens with no warning, and
  the section in Settings says "This browser is using the HTTPS address, and trusts the
  certificate."
- **Remove:** **Settings › General › VPN & Device Management**, select the profile, tap
  **Delete Profile**.
- A downloaded profile that is not installed within 8 minutes is discarded. With Stolen
  Device Protection on, away from a familiar place, iOS will not install a profile until
  that protection is turned off.
- Sources: Apple, [Install a configuration profile](https://support.apple.com/en-us/102400)
  (published April 2026), [Trust manually installed certificate profiles](https://support.apple.com/en-us/102390),
  [Review and delete configuration profiles](https://support.apple.com/guide/personal-safety/ips327569a75/web).
  Not confirmed from Apple's pages: that the download has to be made in Safari (Apple
  says only "from a website or an email message"), and the wording of Safari's prompt.

#### Android (names as on a Pixel with Android 14 or later)

1. Tap **Download the certificate** (`outpost-authority.crt`). Opening the downloaded
   file does not install it: since Android 11 a CA certificate can only be installed
   from Settings.
2. Open Settings and tap **Security & privacy › More security settings › Encryption &
   credentials**. (Android's source also has **More security & privacy** for the middle
   one; which a given phone shows is not settled by the sources.)
3. Tap **Install a certificate**, then **CA certificate**. Android warns "Your data
   won't be private"; tap **Install anyway**.
4. Choose the file. If the phone has no PIN, pattern or password, Android asks for one
   to be set first.

- **Check:** open the `https` address in Chrome; no warning.
- **Remove:** on the same screen, **Trusted credentials › User**, tap the certificate,
  **Uninstall**.
- Chrome uses the certificate once it is installed. Firefox for Android uses it only
  when **Use third party CA certificates** is on in its **Secret Settings** (Mozilla's
  help page says user certificates are used by default on Android; the switch in
  Firefox's source says otherwise, and no Mozilla page explains how to reach it). Other
  apps do not use certificates a person installs.
- Sources: Google, [Add & remove certificates](https://support.google.com/pixelphone/answer/2844832)
  ("Android 14 and up"; it gives the path to the screen and describes only the **Wi-Fi
  certificate** choice); [Android 11 for enterprise](https://developer.android.com/work/versions/android-11)
  ("users must manually install CA certificates in Settings"). The labels **CA
  certificate**, **Install anyway**, **Trusted credentials**, **User** and **Uninstall**
  are from the
  [Android Settings source](https://android.googlesource.com/platform/packages/apps/Settings/+/refs/heads/main/res/values/strings.xml),
  the same from Android 14 to 16; no help page gives them, and the order of taps for
  removing is not written anywhere. Other makers' phones name these screens differently.

#### Mac

1. Click **Download the certificate** (`outpost-authority.crt`).
2. Open Keychain Access: search for it in Spotlight, then press Return. Select the
   **login** keychain, for you alone, or **System**, for everyone on the Mac, and drag
   the file onto the Keychain Access window.
3. Double-click the certificate. Next to **Trust**, click the arrow, and for **Secure
   Sockets Layer (SSL)** choose **Always Trust**. macOS may ask for your password.

With a command instead (macOS asks for your password; `-p ssl` trusts it for web sites
and nothing else):

```bash
# for you alone
security add-trusted-cert -r trustRoot -p ssl -k ~/Library/Keychains/login.keychain-db ~/Downloads/outpost-authority.crt
# for everyone who uses this Mac
sudo security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain ~/Downloads/outpost-authority.crt
```

- **Check:** open the `https` address in Safari or Chrome; no warning. Or
  `security verify-cert https://192.168.1.20:8443`, which prints
  `...certificate verification successful.` when the Mac trusts the server, and
  `Cert Verify Result: CSSMERR_TP_NOT_TRUSTED` when it does not. Its lines about
  Certificate Transparency concern public authorities and can be ignored.
- **Remove:** in Keychain Access, set the trust back to **Use System Defaults**, or
  delete the certificate. Or `security remove-trusted-cert ~/Downloads/outpost-authority.crt`
  (with `sudo` and `-d` if it was trusted for everyone), then
  `security delete-certificate -c "<the name Settings shows>"`.
- Safari and Chrome use this setting (Chrome: "Any certificate where the 'Secure
  Sockets Layer (SSL)' flag is set to 'Always Trust'"). Firefox 120 and later imports
  "roots found in the macOS system keychain": if you chose **login** and Firefox still
  warns, use **System** or the steps for Firefox.
- Sources: Apple, Keychain Access User Guide:
  [Add certificates to a keychain](https://support.apple.com/guide/keychain-access/add-certificates-to-a-keychain-kyca2431/mac),
  [Change the trust settings of a certificate](https://support.apple.com/guide/keychain-access/change-the-trust-settings-of-a-certificate-kyca11871/mac),
  [trust policies](https://support.apple.com/guide/keychain-access/change-certificate-trust-policies-on-mac-mchlp2824/mac);
  the commands are from the `security` tool's own usage text on macOS 15.6.1
  (`security help add-trusted-cert`); Chrome's behaviour from the
  [Chrome Root Store FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md).
  Apple's guide has no page on deleting a certificate and does not mention the password
  prompt. The success line of `verify-cert` was seen with the root named on the command
  line (`-r`), not with the root trusted in a keychain.

#### Windows computers (Windows 10 and 11)

1. Click **Download the certificate**, open the file, and choose **Install
   Certificate…**
2. Leave the store location as **Current User** (or choose **Local Machine**, for
   everyone who uses the computer) and select **Next**.
3. Choose **Place all certificates in the following store**, select **Trusted Root
   Certification Authorities**, and finish the wizard.
4. On the security warning, select **Yes**.

With a command instead:

```bat
:: for your account
certutil -user -addstore Root "%USERPROFILE%\Downloads\outpost-authority.crt"
:: for everyone, in a Command Prompt opened as administrator
certutil -addstore Root "%USERPROFILE%\Downloads\outpost-authority.crt"
```

```powershell
Import-Certificate -FilePath "$HOME\Downloads\outpost-authority.crt" -CertStoreLocation Cert:\CurrentUser\Root
```

- **Check:** open the `https` address in Edge or Chrome; no warning. Or list it:
  `certutil -user -store Root "<the name Settings shows>"`.
- **Remove:** run `certmgr.msc` and delete the certificate under **Certificates - Current
  User › Trusted Root Certification Authorities › Certificates**, or
  `certutil -user -delstore Root "<the name Settings shows>"`.
- Chrome uses these stores, the current user's and the computer's (its FAQ names both);
  Edge is built on the same code. Firefox's documentation names only the computer's
  store: if Firefox still warns, install it for everyone or use the steps for Firefox.
- Sources: Microsoft, [certutil](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil)
  (`certutil [options] -addstore CertificateStoreName InFile`; "`-user`: Use the
  HKEY_CURRENT_USER keys or certificate store"; store names "My, CA (default), Root");
  [Import-Certificate](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate)
  (its first example imports "into the root store of the current user");
  [Manage certificate stores](https://learn.microsoft.com/en-us/windows-server/identity/ad-cs/inspect-certificates-manage-certificate-stores)
  (`certmgr.msc`). The wizard's steps are pieced together from
  [Installing the trusted root certificate](https://learn.microsoft.com/en-us/skype-sdk/sdn/articles/installing-the-trusted-root-certificate)
  (2018, the only Microsoft page found with **Install Certificate…**) and
  [a Visual Studio troubleshooting page](https://learn.microsoft.com/en-us/troubleshoot/developer/visualstudio/installation/warnings-untrusted-certificate)
  (the warning and **Yes**). Not confirmed from Microsoft's pages: the label **Current
  User** in the wizard, the exact command lines above (they follow from the documented
  syntax and options, and are not printed whole anywhere), which file forms `certutil`
  accepts, and whether adding to the user's root store asks for confirmation.

#### Linux

Linux wants the text form. Download `outpost-authority.pem`, then add it to the
system's list:

```bash
# Debian, Ubuntu: the copy must be PEM and have a name ending in .crt
sudo cp ~/Downloads/outpost-authority.pem /usr/local/share/ca-certificates/outpost-authority.crt
sudo update-ca-certificates

# Fedora, RHEL, CentOS
sudo cp ~/Downloads/outpost-authority.pem /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust

# Arch
sudo trust anchor ~/Downloads/outpost-authority.pem
sudo update-ca-trust

# openSUSE
sudo cp ~/Downloads/outpost-authority.pem /etc/pki/trust/anchors/
sudo update-ca-certificates
```

That covers command-line tools and most programs. **Browsers may keep a list of their
own.** In Chrome and browsers built on it (version 134 and later), open
`chrome://certificate-manager`, choose **Local certificates**, and under **Custom**
open **Installed by you** and **Import** the file as one of the **Trusted
Certificates**. Or from a terminal, with `certutil` from `libnss3-tools` (Debian),
`nss-tools` (Fedora) or `mozilla-nss-tools` (openSUSE):

```bash
certutil -d sql:$HOME/.local/share/pki/nssdb -A -t "C,," -n outpost-authority -i ~/Downloads/outpost-authority.pem
```

(Before Chromium 146, or if the folder already exists, the database is
`sql:$HOME/.pki/nssdb`.) Firefox has its own steps, below. A browser installed as a snap
may not see the system's list at all.

- **Check:** `curl https://192.168.1.20:8443/api/health` answers without complaint. Before
  installing anything, the file alone can be tried:
  `curl --cacert ~/Downloads/outpost-authority.pem https://192.168.1.20:8443/api/health`,
  or `openssl s_client -connect 192.168.1.20:8443 -CAfile ~/Downloads/outpost-authority.pem -verify_return_error -verify_ip 192.168.1.20 </dev/null`,
  which prints `Verify return code: 0 (ok)`.
- **Remove:** delete the file you copied and run the update command again; on Debian
  and Ubuntu `sudo update-ca-certificates --fresh`. On Arch,
  `sudo trust anchor --remove ~/Downloads/outpost-authority.pem`. In Chromium,
  `certutil -d sql:$HOME/.local/share/pki/nssdb -D -n outpost-authority`.
- Sources: Ubuntu, [Install a root CA certificate in the trust store](https://documentation.ubuntu.com/server/how-to/security/install-a-root-ca-certificate-in-the-trust-store/)
  ("it must be in PEM format"; "It is important that the certificate file has the .crt
  extension"; removal with `--fresh`; the note on snaps), and Debian's
  [update-ca-certificates(8)](https://manpages.debian.org/trixie/ca-certificates/update-ca-certificates.8.en.html);
  Fedora, [Using Shared System Certificates](https://docs.fedoraproject.org/en-US/quick-docs/using-shared-system-certificates/)
  (read from an archived copy of 30 December 2025: "in the PEM or DER file format to the
  /etc/pki/ca-trust/source/anchors/ directory") and
  [update-ca-trust(8)](https://src.fedoraproject.org/rpms/ca-certificates/raw/rawhide/f/update-ca-trust.8.txt);
  Arch, [Transport Layer Security](https://wiki.archlinux.org/title/Transport_Layer_Security)
  and [trust(1)](https://man.archlinux.org/man/trust.1.en); SUSE,
  [TLS certificates](https://documentation.suse.com/smart/security/html/tls-certificates/index.html)
  (for SUSE Linux Enterprise 15 SP6) and openSUSE's
  [update-ca-certificates(8)](https://manpages.opensuse.org/Tumbleweed/ca-certificates/update-ca-certificates.8.en.html);
  Chromium, [Linux cert management](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md)
  (the `certutil` lines and the move of the database in 146) and the
  [Chrome Root Store FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md)
  (the certificate manager, "on Chrome 134 and up"); curl,
  [SSL certificate verification](https://curl.se/docs/sslcerts.html); OpenSSL,
  [s_client](https://docs.openssl.org/master/man1/openssl-s_client/). The labels in
  Chrome's certificate manager are from
  [its source](https://chromium.googlesource.com/chromium/src/+/main/chrome/app/certificate_manager.grdp);
  no help page gives the order of clicks. Not confirmed: explicit removal steps for
  Fedora and openSUSE, whether openSUSE accepts DER, and whether Chrome on Linux sees
  the system's list through any route (its source consults its own database).
  `Verify return code: 0 (ok)` is not in OpenSSL's documentation; it is what OpenSSL 3.6
  printed here.

#### Firefox, on any computer

On Windows and macOS, Firefox 120 and later uses certificates trusted in the system
(**Settings › Privacy and security › Certificates › Allow Firefox to automatically trust
third-party root certificates you install**), so the steps above are usually enough. On
Linux, or when Firefox still warns:

1. Download the certificate.
2. Open **Settings**, choose **Privacy and security**, and under **Certificates** click
   **Manage certificates**. (Before Firefox 149, and in ESR 140, the button reads **View
   Certificates…**, and before 151 the pane is **Privacy & Security**.)
3. On the **Authorities** tab click **Import…**, choose the file, tick **Trust this CA
   to identify websites.** and confirm.

- **Check:** open the `https` address in Firefox; no warning.
- **Remove:** the same tab, select the certificate, **Delete or Distrust…**
- Sources: Mozilla, [Set up Certificate Authorities in Firefox](https://support.mozilla.org/en-US/kb/setting-certificate-authorities-firefox)
  and [Automatically trust third-party root certificates](https://support.mozilla.org/en-US/kb/automatically-trust-third-party-certificates)
  (both read from archived copies, of December 2025 and April 2026; Mozilla's site
  refused a direct read), and the
  [Firefox 120 release notes](https://www.mozilla.org/en-US/firefox/120.0/releasenotes/).
  No Mozilla help page walks through importing by hand: the labels are from Firefox
  160's own interface text (`preferences.ftl`, `certManager.ftl`, `pippki.ftl`).

### Using a certificate of your own

Some people already have a certificate for the server: from a public authority for a
name they own (often by a DNS challenge, for a name that points at a private address),
from an authority they or their organisation run, or from a tool such as
[mkcert](https://github.com/FiloSottile/mkcert). Outpost's HTTPS listener can present
that certificate in place of the one from its own authority. It is a separate choice,
under **Use a certificate of your own instead** in the same section of Settings, and
nobody who is content with Outpost's own certificate needs to read this.

#### What to give Outpost

The server's certificate, the certificates of the authorities between it and the root
(the chain), and the private key it was made with.

- **PEM files**, as most tools write them: `fullchain.pem` and `privkey.pem`
  (Certbot's names for "all certificates, including server certificate" and the
  "private key for the certificate"), or `something.crt` and `something.key`, with the
  chain in the certificate file or in a file of its own. DER files are read too.
- **One PKCS#12 file** (`.pfx`, `.p12`) and its password, as Windows and many
  appliances export.

Outpost does not mind which file holds what, or in what order: it finds the server's
certificate by its key and puts the chain in order.

#### Two ways to hand it over

**In Settings.** Open **Use a certificate of your own instead**, choose the
certificate file and the key file (and the chain, if it is separate; or the one `.pfx`
file and its password), and press **Use this certificate**. Outpost checks it, keeps it,
and turns HTTPS on with it.

A private key is a secret, Outpost has no accounts, and most people reach it over plain
HTTP, where anyone on the network could read an upload. So:

- **At the computer Outpost runs on**, or over an address that already begins `https`,
  the files are simply taken. The computer counts whether its browser opens Outpost at
  `localhost` or at the computer's own network address (`http://192.168.1.20:8080`):
  a connection to its own address never leaves the computer. (Settings says which, with the address; if
  something on the computer forwards connections, see `OUTPOST_OWN_ADDRESS_IS_LOCAL`).
- **From another device over plain http**, Settings first says what that gives away:
  the key (and the password of a `.pfx` file) crosses your network unencrypted, anyone
  able to listen on it could copy the key, and with it later pass off another server as
  this Outpost to every device that trusts the certificate. It offers the two ways that
  keep the key private: **Turn on HTTPS** (or **Open this page over HTTPS** once it is
  on) and give the files there, or put them in the folder below. If you still want to
  send them from here, tick **I accept that my private key … will cross my network
  unencrypted**; only then is **Use this certificate** offered. Outpost writes a line to
  its log saying a key was accepted over plain http, and from which address (not the
  key).

The option `OUTPOST_ALLOW_REMOTE_ERASE` does not change any of this: it is about who
may destroy something, not about a secret crossing the network in the clear.

**In a folder on the server.** Put the two files, in PEM form, in the `tls/own` folder
of the data directory, under exactly these names:

```
<data directory>/tls/own/fullchain.pem    the server's certificate, then its chain
<data directory>/tls/own/privkey.pem      the private key, without a passphrase
```

Make the folder if it is not there (`mkdir -p <data directory>/tls/own`), then press
**Use them** in Settings; Settings shows the full path and whether each file is there.
Nothing crosses the network this way, so the button works from any device. It is the
way for Docker, for a Raspberry Pi, and for a script that renews the certificate. The
files may be links to files kept elsewhere; Outpost reads through them and never writes
through them.

A certificate chosen in Settings is written to the same two files, so there is one
place to look whichever way it arrived. `privkey.pem` is written with permissions `600`
in a folder with `700`, beside Outpost's own keys. Files you put there yourself keep
the permissions you gave them; if other accounts on the computer can read the key,
Settings says so and gives the `chmod` to run. The key is not encrypted on disk (the
server has to start HTTPS unattended), no route serves it, it is not written to the
log, and it is not in a backup or on a portable drive.

#### What Outpost checks first

It refuses, with a sentence saying why, what cannot work:

- a key that is not the certificate's own;
- a key protected by a passphrase (see below);
- a certificate that has expired, or is not valid yet;
- a certificate with no names in its subject alternative name (browsers have not read
  the common name for years);
- an RSA key shorter than 2048 bits, or a key that is neither RSA nor ECDSA P-256, P-384
  or P-521; a certificate signed with SHA-1 or MD5; one issued for a purpose other than
  identifying a web server;
- a file that is something else: a certificate request, an SSH key, a public key, a
  PKCS#7 bundle (with the command that converts it).

It warns, and goes on, about what will work only for some people:

- **addresses it does not cover.** The names on the certificate are set against the
  addresses this server is actually reached by, and Settings says plainly which of
  those it does not cover. A certificate for `outpost.example.net` does nothing for
  `https://192.168.1.20:8443`: at the address, browsers will warn that the certificate
  is for another site;
- **names Outpost does not answer to.** Outpost refuses a request addressed to a name it
  was not told is its own (that is what stops a hostile web page pointing its own name
  at your server). A public name has to be listed where Outpost is started:
  `OUTPOST_ALLOWED_HOSTS=outpost.example.net`, then restart. Settings says so when it
  applies. The name also has to resolve, on your network, to this server's address,
  which Outpost cannot check;
- a chain that is probably incomplete (the certificate alone, `cert.pem`, where
  `fullchain.pem` was wanted);
- a lifetime over 825 days on a certificate that is not from a public authority, which
  iPhone, iPad and Mac refuse ([Apple, 103769](https://support.apple.com/en-us/103769));
- an ECDSA P-521 key, which Chrome does not accept (its
  [list of signature algorithms](https://chromium.googlesource.com/chromium/src/+/main/net/socket/ssl_client_socket_impl.cc)
  has P-256 and P-384 only; Firefox's has P-521; nothing was found for Safari);
- a key file other accounts on the computer can read.

A chain given out of order is put in order and said to have been, and a certificate in
the file that is not part of the chain is left out and named.

**A key with a passphrase cannot be used.** Outpost starts HTTPS with nobody there to
type it, and it does not store passphrases. Take the passphrase off with your own
tools, then give Outpost the new file and keep it private:

```bash
openssl pkey -in privkey.pem -out privkey-open.pem   # asks for the passphrase once
```

(Run here with OpenSSL 3.6 and with the LibreSSL 3.3 that macOS ships, the passphrase
supplied by `-passin`.) A PKCS#12 file is different: its password is used once, to open
the file, and is not kept; what Outpost keeps is the key itself.

**PKCS#12, exactly.** Node can load such a file into a listener but will not hand the
key back, so Outpost reads the container itself (`modules/https/pkcs12.ts`), decrypting
with Node's own PBKDF2, AES and triple DES. It reads files as OpenSSL 3 writes them by
default (AES with PBKDF2) and the older triple-DES form. The file's integrity code is
not checked; a wrong password shows as contents that do not decrypt, and the key is
checked against the certificate afterwards. It does not read files whose
certificates are encrypted with RC2 (the default of old tools) or files written in BER
rather than DER; it says so and gives the command that converts them
(`openssl pkcs12 -in file.pfx -nodes -out pair.pem`, with `-legacy` for the old kind).
Tested with files made by OpenSSL 3.6. **Not tested with a file exported by Windows, by
macOS's Keychain Access, by Firefox or by any appliance.**

#### Whether devices will trust it

Settings says which of three cases it is, **as far as Outpost can tell**. It judges by
the list of public authorities that comes inside Node (Mozilla's, as it stood when that
version of Node was made), with no request to anywhere. It cannot see what any phone or
computer trusts, and says so.

| It finds | It says | Devices need |
| --- | --- | --- |
| The chain ends at an authority on that list | Issued by a public authority | Nothing. No steps are shown. |
| The chain ends anywhere else | A private authority: yours, or your organisation's | To trust **your authority's root**, not Outpost's, by the [steps above](#trusting-the-certificate-on-a-device). If the root was in the files you gave, Settings offers it for download (`GET /api/https/own-root.crt` and `.pem`) with its fingerprint. If not, it has to come from whoever runs the authority; for mkcert it is "the `rootCA.pem` file in the folder printed by `mkcert -CAROOT`". |
| The certificate signed itself | A self-signed certificate | To trust that very certificate, by the same steps. |

#### Renewal

A certificate from a public authority lasts 90 days or less (Let's Encrypt: 90 days
today, 45 days by 2028, and six days for those who ask) and is replaced by a script.
**The script only has to replace the two files in `tls/own`.** Every five minutes (every
30 seconds while a file there is missing or cannot be used) Outpost looks at the folder,
and takes up a new certificate and key without a restart and without closing the port. For example, after each renewal:

```bash
install -m 644 /etc/letsencrypt/live/outpost.example.net/fullchain.pem /srv/outpost/data/tls/own/fullchain.pem
install -m 600 /etc/letsencrypt/live/outpost.example.net/privkey.pem   /srv/outpost/data/tls/own/privkey.pem
```

(An example, not run here. The files must end up readable by the account Outpost runs
as; in Docker that is uid 1000.) A renewal by hand is the same, or give the new files
in Settings.

- Files that changed less than three seconds ago are left for the next look, so a pair
  caught half replaced is not judged.
- If the new files cannot be used (a key that does not match, a damaged file, a
  certificate already out of date), Outpost **goes on serving the certificate it read
  before** and Settings says what is wrong with the new ones.
- Settings shows the date the certificate runs out and the days left, and warns when
  under 14 days remain (or under a fifth of its life, for a certificate that lives only
  days).

#### If it expires, or the files become unusable

**Outpost keeps serving the expired certificate, and Settings says so.** It does not
fall back to its own authority. The reasons:

- The browser's own warning, "this certificate has expired", is the true one, and it
  tells the person exactly what to fix. Swapping in Outpost's certificate would replace
  it with "unknown authority" and, for a public name, "wrong site" as well, since
  Outpost's authority cannot sign for a public name at all.
- Devices were told to trust your authority, or a public one. Outpost's is one they
  were never asked about, and quietly making a certificate authority nobody asked for is
  not something a server should do by itself.
- Nothing is locked: the `http` address is never redirected and no
  `Strict-Transport-Security` header is sent, so Outpost stays usable while the
  certificate is renewed.

After a restart with files that cannot be used at all (a key that does not match, a
file missing), there is nothing good to serve, so **HTTPS does not start**; Settings
says why and what is missing, the `http` address works, and the half-minute check
starts HTTPS as soon as the files are put right.

#### Going back, and deleting

**Go back to Outpost's own certificate** is one press, from any device, and loses
nothing: your two files stay in the folder, Outpost's authority is exactly as it was,
and devices that trusted it have nothing to do. (If Outpost never had an authority, it
makes one then, and Settings says so before you press.) **Use them** goes the other
way again.

**Delete your certificate from this server** removes the two files. If HTTPS was using
them it is turned off; Outpost does not switch certificates by itself. Since HTTPS
cannot then be put back from another device over plain HTTP, deleting is offered only
at the computer Outpost runs on, or everywhere with `OUTPOST_ALLOW_REMOTE_ERASE=true`.
Deleting Outpost's own authority does not touch your files, and the other way about.

### Docker

Inside a container Outpost cannot see the addresses of the computer it runs on, and its
own host name is the container's. Two things are needed besides the switch:

1. **Publish the port.** Uncomment the HTTPS line under `ports:` in `compose.yaml` and run
   `docker compose up -d`. The port number is the same inside and outside the container
   (`OUTPOST_HTTPS_PORT`, 8443), so the addresses in Settings are the ones to use.
2. **Name the address.** Open Settings from another device at
   `http://<address of this computer>:8080/settings#https`. The section says that address
   is not on the certificate and offers a button to add it. Or type addresses and names
   into **Other names and addresses** yourself.

With LAN access on, no request looks local to a container, so **Make a new certificate
authority** and **Turn HTTPS off and delete it** are not offered. Either start Outpost
with `OUTPOST_ALLOW_REMOTE_ERASE=true` for the occasion, or stop it and delete `ca.crt`,
`ca.key`, `server.crt` and `server.key` from the `tls` folder of the data volume by hand.

**A certificate of your own in Docker** goes in `/data/tls/own` of the `outpost-data`
volume, as `fullchain.pem` and `privkey.pem`. For the same reason as above, choosing
the files in Settings is offered only once the page is open at an `https` address, so
the folder is the usual way. One way to put the files there as the user the server
runs as, so that it can read them (not run here; the port and volume are as in
`compose.yaml`):

```bash
docker compose exec -T outpost sh -c 'mkdir -p /data/tls/own && chmod 700 /data/tls /data/tls/own'
docker compose exec -T outpost sh -c 'cat > /data/tls/own/fullchain.pem' < fullchain.pem
docker compose exec -T outpost sh -c 'umask 077 && cat > /data/tls/own/privkey.pem' < privkey.pem
```

Then press **Use them** in Settings. A renewal runs the last two lines again; Outpost
takes the new files up within half a minute. A bind mount of a folder a renewal tool
writes to works as well, as long as uid 1000 can read both files. The path Settings
shows is the one inside the container.

### Mesh radio in a container

For the mesh radio link ([mesh-radio.md](mesh-radio.md)); not tried with a real radio.

- **The broker's port.** With "Outpost is the broker", publish its port as the web port
  is, in `compose.yaml` under `ports:` (`- "1883:1883"`, or the port chosen in Settings
  on both sides). Publish it on the home network only; do not forward it on the router.
- **A USB radio** must be passed through to the container, under the `outpost` service:

  ```yaml
      devices:
        - /dev/ttyACM0:/dev/ttyACM0   # the radio as the host names it; ttyUSB0 for some radios
      group_add:
        - dialout                     # or the device's group number: stat -c %g /dev/ttyACM0
  ```

  Outpost lists only devices it can see inside the container. Docker Desktop on a Mac
  cannot pass a USB device through; run Outpost without Docker there, or use the radio's
  network port.
- **Setting it up.** In a container no request looks local, so Settings → Mesh radio can
  be changed only if Outpost was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`, for the
  occasion.

### Backups, moving house, and starting again

- **The `tls` folder is not in a backup download**, and a portable drive does not carry
  it: neither Outpost's own keys nor a certificate and key of your own in `tls/own`. A
  key that devices trust should exist in one place. The setting itself (on or off,
  and the names you listed) is in the database, so it is in the backup.
- Restoring a backup onto the same data directory leaves `tls` alone. Restoring onto a
  new machine with HTTPS switched on in the backup makes a **new** authority there, which
  every device must be told to trust. To keep the old one, copy the `tls` folder across
  yourself, with Outpost stopped, and keep its permissions. If the backup was set to
  use a certificate of your own, HTTPS does not start on the new machine until its two
  files are in `tls/own` there; Settings says so, and Outpost makes no authority in the
  meantime.
- **Erase everything** resets settings, so HTTPS goes off and is set back to Outpost's
  own certificate; the authority is kept, and turning HTTPS on again asks nothing of any
  device. A certificate of your own stays in its folder, unused until you press **Use
  them** again.
- **Make a new certificate authority** deletes the old key and certificate and makes new
  ones. Every device that trusted the old one must trust the new one. It and **Turn
  HTTPS off and delete it** are offered only at the computer Outpost runs on, or
  everywhere when Outpost was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`.
- HTTPS is not offered from a portable drive, which opens on `localhost`.

### If it does not work

- **"Port 8443 is already in use"**: set `OUTPOST_HTTPS_PORT` to a free port and restart.
- **"This computer's clock reads …"**: certificates are dated, and a computer with no
  clock battery that started without a network may believe it is years ago. Outpost
  will not make or renew a certificate by such a clock; one it already has goes on
  being served. Set the clock, and within half a minute Outpost carries on.
- **The browser warns even after trusting the certificate**: check that the address in
  the address bar is one of those listed in Settings; a certificate only covers the
  names on it. On a phone, check the last step (full trust on iOS; **CA certificate**,
  not **Wi-Fi certificate**, on Android).
- **A server whose clock is wrong** issues certificates other devices see as not yet
  valid or expired. Server certificates start a day early and last 397 days to allow for
  a clock that is a little off, not for one that is far off.
- **With a certificate of your own, "This address is not one Outpost answers to"**: the
  certificate is fine, but Outpost was not told the name is its own. Start it with
  `OUTPOST_ALLOWED_HOSTS=<the name>`.
- **With a certificate of your own, the browser says the certificate is for another
  site**: the address in the address bar is not a name on the certificate. Use the name
  it was issued for; Settings lists which addresses it covers and which it does not.
- **"Outpost is not allowed to read …/tls/own/privkey.pem"**: the file belongs to another
  account. Make it readable by the account Outpost runs as (uid 1000 in Docker), and by
  no other.
- **"… is a link to somewhere else, and Outpost does not write through links"**: the
  folder holds links to files a renewal tool keeps. Replace the files where they are
  kept; Outpost takes them up from there.

### What was tested

On macOS 15.6 with Node 24 and OpenSSL 3.6, by the test suite
(`apps/server/test/https.test.ts`, `e2e/tests/https.spec.ts`):

- the chain verifies with Node, with `openssl verify -x509_strict`, with
  `curl --cacert`, and with macOS's own trust evaluation (`security verify-cert`), for
  DNS names and for IPv4 and IPv6 addresses;
- Node, OpenSSL and macOS each refuse a certificate for a public name or address signed
  with the authority's own key;
- the app, the API, live events and the Kiwix proxy over HTTPS, the request guard, and
  the absence of HSTS;
- re-issue on a changed address, a changed list and nearing expiry; the keys'
  permissions; that no address serves a key and no backup contains one.

For a certificate of your own (`apps/server/test/https-own.test.ts`, with certificates
the tests make themselves, and `e2e/tests/https.spec.ts` for the flow in Settings):

- the checks: matching and mismatched keys; RSA and ECDSA; a chain out of order, with a
  stray certificate, incomplete; expired, not yet valid, an expired intermediate; names
  set against the server's addresses, wildcards included; no subject alternative name;
  a key with a passphrase (and that the command given removes it); short RSA, Ed25519,
  P-521, SHA-1, the wrong purpose; public, private and self-signed; PKCS#12 with AES,
  with triple DES, without a password, with the wrong password, and with RC2;
- the listener serving the imported certificate with a chain Node verifies against the
  person's root and nothing else; that an upload is refused from another device over
  plain HTTP unless it carries the person's acceptance (and logged when it does), and
  accepted at the computer and over HTTPS; the folder route; a renewal
  taken up without a restart; a pair caught half written; expiry (still served, said
  so, no authority made); unusable files at start-up; going back with the authority and
  the files as they were; deleting; that no address serves the key, no backup holds it,
  and neither it nor a password reaches the log.

The packaged app was also run once by hand in the Linux Docker image, which has no
`openssl` program, with the port published: the keys were made and `curl --cacert`
accepted the address.

Tried by hand on the same Mac: the Settings section in Chromium at desktop and phone
widths; both downloads added to, found in and deleted from a keychain made for the
purpose; `security verify-cert`, `curl --cacert` and `openssl s_client` against a
running Outpost with Outpost's own certificate and with a certificate from a test
authority given in Settings.

Not tested: installing and trusting the certificate on any real iPhone, iPad, Android
phone, Windows or Linux computer, or in Safari, Chrome, Edge or Firefox with the
certificate actually trusted; marking it trusted in a real macOS keychain; a
certificate from a real public authority (the tests stand one in by telling the checker
that a test root is public); a PKCS#12 file made by anything but OpenSSL; a certificate
of your own in Docker; a real renewal by Certbot or any other tool. Playwright cannot add a certificate authority to its browser, so the
end-to-end test tells Chromium to accept the exact key the server presents, and leaves
verifying the chain to Node. Whether iOS accepts the certificate when installed as a
profile rests on Apple's documentation, not on a device.

## Updating

Back up first (**Settings → Backup**, or see [storage.md](storage.md)).

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically when the server starts. Your volumes are not
touched by an update.

An image built before 16 November 2026 carried VOACAP's coefficients inside it; the new
one does not, and the old image is gone by the time the new one starts. Run the line in
the [quick start](#docker-compose-quick-start) once after updating (or press Download on
the HF planner) to put them in the data volume, where they then stay.

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

Stopping takes a moment, not Docker's ten-second wait. Asked to stop (`docker stop`,
Ctrl-C, or SIGTERM to the process), the server stops accepting connections, ends the
live-update stream of every open browser tab, gives requests still being answered three
seconds to finish, stops background jobs where they can be picked up again (a download
keeps its partial file and continues on the next start), closes the database and exits
with status 0. If that has not finished after eight seconds it exits with status 1 and
says so in the log. A second signal while it is stopping ends it at once. An upload or a
backup download still running after the three seconds is cut off, as it would be by the
kill that followed.

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
  search, reading, notes and maps. **On Raspberry Pi OS as it comes, those limits are
  not applied**: the system starts with `cgroup_disable=memory` (see `cat /proc/cmdline`),
  Docker says `Your kernel does not support memory limit capabilities or the cgroup is
  not mounted. Limitation discarded.` for each container, `docker stats` shows `0B / 0B`
  for memory, and the containers run without a ceiling. Outpost works the same; what is
  missing is the guard that stops it taking memory from whatever else the Pi runs.
  Guides for the Pi give the remedy as adding `cgroup_enable=memory cgroup_memory=1` to
  the end of the one line in `/boot/firmware/cmdline.txt` and restarting; that was not
  tried here. The built-in model for semantic search takes about
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

`install.sh` has been run once on a real Pi (see
[What has been tried](#what-has-been-tried-and-what-has-not)), without
`--install-docker`, and was changed by what that showed. **`hotspot.sh` has not been run
on a Raspberry Pi**: it was written from NetworkManager's documentation and source on
16 November 2026 and checked only for syntax and with `--dry-run` on a Mac. Read both
before you run them, run each with `--dry-run` first, and expect to adjust them. Reports
of what happened on real hardware are welcome.

```bash
git clone https://github.com/tyleruk2000/outpost.git
cd outpost
./deploy/pi/install.sh --dry-run                 # see what it would do
./deploy/pi/install.sh --install-docker --lan --https   # needs the internet this once
sudo ./deploy/pi/hotspot.sh on --ssid "Outpost"         # asks for a password
```

- `install.sh` checks for a 64-bit Raspberry Pi OS, installs Docker Engine and the
  Compose plugin from Docker's apt repository if you pass `--install-docker` (the steps
  on <https://docs.docker.com/engine/install/debian/>, which lists Debian 12 and 13 on
  arm64), makes `.env` from `.env.example` if there is none, and with `--lan` sets
  `OUTPOST_LAN_ACCESS=true` and `OUTPOST_BIND=0.0.0.0` in it, keeping the file as it
  was beside it. With `--https` it writes a `compose.override.yaml` that publishes port
  8443, which HTTPS uses once you turn it on in Settings (`compose.yaml` itself is not
  edited, and an override file already there is left alone). With `--sudo` it uses the
  system's Docker through `sudo` even where plain `docker` works, for a Pi that also has
  a rootless Docker. Then it builds and starts the stack and waits for it to answer. The
  build fetches map fonts and the search model, so the Pi needs the internet for it.
  Last, it fetches VOACAP's coefficients for the HF propagation planner (15 files,
  559 kB) into the data volume, so that the Pi predicts with no internet from then on;
  `--no-voacap-data` skips that, and the planner then offers a Download button. If the
  fetch fails the script says so and carries on. With `--lan` it also announces the Pi
  as `outpost.local`, and it adds a service that lets Outpost set the Pi's clock; those and
  `--metrics` are described in [device.md](device.md).
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
  `https` address. Install with `--https`, then from a phone on the Pi's network open
  `http://10.42.0.1:8080/settings#https`, turn HTTPS on, press the button that adds the
  address you came by (a container cannot see it for itself), add `outpost.home.arpa`
  under **Other names and addresses** if you use that name, and trust the certificate on
  each device. The address is then `https://10.42.0.1:8443`. See
  [HTTPS on your network](#https-on-your-network).

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
node scripts/fetch-voacap-data.mjs --data-dir apps/server/data   # HF planner data (559 kB); optional, once
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
  the built-in option of search by meaning, which says that its model is missing. If
  you skip `fetch-voacap-data.mjs`, the HF propagation planner says its data is missing
  and offers a Download button. Give it the same data directory the server uses.
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

The packaged app does not contain VOACAP's coefficients for the HF propagation planner.
To prepare a data directory with them while there is internet (15 files, 559 kB, each
checked against `engines/voacap/coefficients.json`), run, once:

```bash
node dist/app/scripts/fetch-voacap-data.mjs --data-dir /srv/outpost/data
```

Without it the planner offers a Download button for the same files. `--from <folder>`
copies them from a folder instead (an older app folder's `engines/voacap/data/itshfbc`,
or a checkout's `engines/voacap/.cache`), with no network.

**Updating an installation from before 16 November 2026**, when the coefficients were
inside the app folder: start the new version once with the old app folder still in
place and it copies them into the data directory by itself. If the deploy replaces the
folder first (`rsync --delete`, say), run the line above beforehand, with
`--from <old app folder>/engines/voacap/data/itshfbc`, or press Download afterwards.

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
  people who arrive through the proxy. Without the header every visitor looks local. If the
  proxy (or a port forwarder, a tunnel) cannot be made to send it and connects to
  Outpost at the computer's network address, start Outpost with
  `OUTPOST_OWN_ADDRESS_IS_LOCAL=false` as well.
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
| `OUTPOST_HTTPS_PORT` | `8443` | `8443` | Port of the HTTPS listener, which opens only once HTTPS is turned on in Settings. Unlike `OUTPOST_PORT`, with Compose the same number is used on the host and in the container. See [HTTPS on your network](#https-on-your-network). |
| `OUTPOST_DATA_DIR` | `./data` | `/data` | Database, attachments and other state Outpost owns. |
| `OUTPOST_STORAGE_ROOTS` | see [above](#from-source) | `/storage` | Comma-separated folders in which storage locations may be created. |
| `OUTPOST_STORAGE_PROBE_TIMEOUT_MS` | `5000` | `5000` | How long a storage location has to answer its regular check before it is marked not connected ("not answering"). See [storage.md](storage.md#a-network-share-whose-server-is-switched-off). |
| `UV_THREADPOOL_SIZE` | `16` | `16` | Threads Node keeps for file work. Outpost sets 16 when it is not set, so that reads stuck on a share that has stopped answering do not hold up the rest. |
| `OUTPOST_LAN_ACCESS` | `false` | | Share Outpost with every device on the network: accept requests addressed to LAN names and addresses, and allow the server to listen on (or be published on) an address other devices can reach. There are no accounts, so everyone who can reach it can change it. |
| `OUTPOST_OWN_ADDRESS_IS_LOCAL` | `true` | | Whether a browser connecting from one of this computer's own network addresses counts as the computer itself, for the few things kept for it (erasing everything, restoring a backup, reclaiming database space, uploading a private key). Set it to `false` wherever something on this computer forwards connections from other devices without adding a forwarding header (a port forwarder such as `socat` or `rinetd`, an SSH tunnel, a relaying VPN client, a proxy you cannot make send `X-Forwarded-For`): otherwise every device it forwards would count as this computer. Inside a container the rule is never used, whatever this says. |
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
| `OUTPOST_SOLAR_TABLE_URL` | NOAA's `predicted-solar-cycle.json` | | Where a newer solar cycle table for HF propagation is fetched from, when a person asks for one. See [hf-propagation.md](hf-propagation.md#where-the-sunspot-number-comes-from). |
| `OUTPOST_P533_BUILD_MANIFEST` | | | For testing only: a JSON file saying what **Build the P.533 engine** fetches and what it must give, in place of the built-in list (`BuildManifest` in `modules/propagation/p533/build.ts`). The tests use it with a stand-in for the compiler. Leave unset. |
| `OUTPOST_P533_MAPS_MANIFEST` | | | For testing only: a JSON file listing map files to fetch and use for the second HF model in place of the ITU's (same shape as `maps` in `modules/propagation/p533/manifest.json`). The end-to-end suite uses it for small stand-ins. Leave unset. |
| `OUTPOST_VOACAP_DATA_MANIFEST` | | | For testing only: a JSON file in the shape of `engines/voacap/coefficients.json` listing VOACAP's coefficient files to fetch, check and use in its place. The end-to-end suite uses it to fetch the real files from its own file server. Leave unset. |
| `OUTPOST_ALLOW_REMOTE_ERASE` | `false` | | Let **Erase everything** (Storage → Manage and clean up) be started from any device that can reach Outpost, and likewise restoring a backup, deleting a stored backup, keeping fewer of them, setting or removing the passphrase backups are protected with, and replacing or deleting the HTTPS certificate authority. Without it, only the computer Outpost runs on may. A passphrase for backups is still never accepted from another device over plain http: open Outpost at its https address for that. See [security.md](security.md#erasing-everything). |
| `OUTPOST_ALLOW_REMOTE_CLOCK` | `false` | | Let any device set the server's clock when it is wrong. Without it, only a browser on the computer Outpost runs on may. See [device.md](device.md#the-servers-clock). |
| `OUTPOST_METRICS` | `false` | | Answer Prometheus at `/metrics`, for this computer and private networks only. See [device.md](device.md#prometheus-and-grafana). |
| `OUTPOST_NETWORK_SCAN_LOCAL_ONLY` | `false` | | Let only the computer Outpost runs on start a scan in **Tools → Devices on this network**. Off, any device that can reach Outpost may, as with every other action. `OUTPOST_ALLOW_REMOTE_ERASE` does not lift it. See [security.md](security.md#devices-on-this-network). |
| `OUTPOST_ALLOW_REMOTE_MODEL_SERVER` | `false` | | Let **Answers from your library**, and a local embedding server for search by meaning, be on the public internet. Without it, such a server must be on this computer or a private network, so that nobody who can open Outpost can have passages from the library sent elsewhere. See [ai.md](ai.md). |
| `OUTPOST_OLLAMA_ADDRESSES` | empty | | Where **Look for Ollama on this computer** looks after the address in Settings, as a comma-separated list of addresses. Empty means the two places Ollama listens by default (`http://127.0.0.1:11434/v1` and `http://host.docker.internal:11434/v1`). Set it when your Ollama listens on another port. The test suites set it so that they never ask a real Ollama on the machine they run on. |
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
`OUTPOST_LAN_ACCESS`, `OUTPOST_ALLOWED_HOSTS`, `OUTPOST_HTTPS_PORT`, `OUTPOST_MAX_UPLOAD_MB`,
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
