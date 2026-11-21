# The server: its status, its clock and its name

Outpost runs on one computer, often a Raspberry Pi on a shelf. This page covers looking
after that computer from a browser: the **Server status** screen, putting its clock right
when it is wrong, reaching it as `outpost.local`, and sending its figures to Prometheus.

## Server status

Open **Settings → Server status**. Each line says how one thing stands, in words, and
what to do when something needs it:

| Line | What it tells you |
| --- | --- |
| Each storage location | Connected or not (for a network share, whether the NAS is answering), and the free space. Outpost stops writing to a location when it has 268 MB left. |
| Database | Its size, and what the last check found. Run a check from the Storage screen. |
| Last backup | How long ago, and where it went. A week without one gets a word. |
| SD card | SD cards never report their wear, so this says so. An eMMC card does, and its own estimate is shown. |
| Memory | What Outpost uses, and what the computer has free. In Docker with a limit, what the container uses against it. |
| Temperature | The processor's. A Raspberry Pi slows itself down between 80 and 85 °C. |
| Power supply | Raspberry Pi only: whether the power has dipped too low now or since it started. |
| Clock | Whether the server's clock agrees with the device you are using (see below). |
| Background work | Jobs running, waiting and paused, and any that failed in the last day. |
| Anything slow lately | Whether the server was held up in the last hour, and for how long. Open **The hold-ups, minute by minute** for each minute. |

**Check again** reads everything afresh. Nothing on the screen changes anything.

Each state is a word: **Fine**, **Needs attention**, **Problem**, or **Not reported**
where the system does not say (a Mac has no temperature reading Outpost can use, for
example). Not reported is not a fault.

The hold-ups are measured only while Outpost has work: from a request until two minutes
after the last one, and while a job runs. With nobody using it, nothing is measured and
the line says so. A hold-up of a second or more usually means a large file is being
written to an SD card; it passes when the work ends.

## The server's clock

A Raspberry Pi has no clock that keeps time while it is switched off, unless a Pi 5 is
given its battery. With no internet it starts at the wrong time, and then check-ins, the
barometer log, backups' ages, sun times and the grey line are all wrong with it.

Each time you open Outpost, it compares the server's clock with your device's. When they
differ by more than a minute, a line across the top says by how much, with **Set the
server's clock from this phone** (or tablet, or computer). Pressing it moves the
server's clock to your device's time. Set your own device's clock first if you doubt it:
Outpost refuses a time before 2024.

Who may press it:

- A browser on the computer Outpost runs on, always.
- Any device, if Outpost was started with `OUTPOST_ALLOW_REMOTE_CLOCK=true` (in the
  `.env` file for Docker, then `docker compose up -d`). Moving the clock changes the time
  for everyone, so it is off by default.

When it may not be pressed from where you are, the line says why and what to set, in
place of the button.

How the clock is set depends on where Outpost runs:

- **Docker on a Raspberry Pi.** A container cannot set the clock of the computer it runs
  on. `deploy/pi/install.sh` adds a small service on the Pi (`outpost-clock.path`) that
  sets the clock when Outpost asks and does nothing else. Add `--clock-from-network` to
  let phones set it. `--no-clock` leaves the service out.
- **Docker anywhere else.** It cannot be set from Outpost. Set the clock on the computer
  itself; the line says so.
- **Linux without Docker.** Outpost sets it itself when it runs with the right to
  (as root, or given `CAP_SYS_TIME`). Otherwise the line says so.
- **macOS and Windows.** Set it in the system's own settings.

Outpost does not give the time to other devices. A USB GPS receiver as a source of time
is not supported yet.

## Reaching it as outpost.local

`deploy/pi/install.sh --lan` announces the Pi on your network as `outpost.local`, so
phones and laptops reach it at `http://outpost.local:8080` whatever your router calls
it. It installs `avahi-utils` if it is missing, adds a service that keeps the name
announced for the Pi's current address (`outpost-name.service`), tells apps that look
for web servers that Outpost is there, and adds `outpost.local` to
`OUTPOST_ALLOWED_HOSTS` so that Outpost answers to the name and HTTPS certificates carry
it. With HTTPS on, Outpost makes its certificate again with the name by itself.

- `--name=kitchen-pi` announces `kitchen-pi.local` instead.
- `--no-name` leaves it out.

A device that does not find `.local` names reaches Outpost at the address the install
script prints, as before.

The name and clock services have not yet been run on a Pi: see
[What has been tried](deployment.md#what-has-been-tried-and-what-has-not).

## Prometheus and Grafana

Start Outpost with `OUTPOST_METRICS=true` (or `install.sh --metrics`) and it answers
Prometheus at `/metrics`: request times by route, the hold-ups above, jobs by state,
download speed, each storage location up or down with its free space, the database's
size, the last backup's age, memory and temperature. Only this computer and private
networks are answered; anything else is refused. It is off by default.

`deploy/pi/monitoring.md` has the lines to add to Prometheus, and
`deploy/pi/grafana-outpost.json` is a dashboard for Grafana.
