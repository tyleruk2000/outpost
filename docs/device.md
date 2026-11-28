# The server: its status, its clock and its name

## Server status

**Settings → Server status** says how each thing stands, and what to do when it needs
something. Each line is **Fine**, **Needs attention**, **Problem**, **Not reported**
where the system does not say (not a fault), or **Not checked yet** where it can be checked
and has not been. **Check again** reads everything afresh; nothing here changes anything
except **Check now** on the database line, which runs the quick check.

| Line | What it tells you |
| --- | --- |
| Each storage location | Connected or not (a NAS: answering or not), and free space. Outpost stops writing at 268 MB left. |
| Database | Its size and the last check's result; **Not checked yet**, with **Check now**, until one has run. The full check is under Storage. |
| Last backup | Its age and place; with automatic backups, how many are kept and whether one was missed because the location was away. Old means over two days with nightly backups, eight with weekly, a week with none. |
| Restore tested | When a backup was last opened with **Test a restore**. Needs attention if never or over 90 days ago; a problem if it failed. |
| SD card | SD cards do not report wear, so it says so; eMMC does. |
| Memory | What Outpost uses and the computer has free; in Docker with a limit, against it. On a Mac it is **Not reported**: macOS counts the files it keeps in memory as used, so a Mac that is doing well looks nearly full. |
| Temperature | The processor's. A Raspberry Pi slows itself between 80 and 85 °C. |
| Power supply | Raspberry Pi only: whether the power has dipped too low. |
| Clock | Whether the server agrees with your device (below). |
| Background work | Jobs running, waiting, paused, and failed in the last day. |
| Anything slow lately | Hold-ups in the last hour; **The hold-ups, minute by minute** for detail. Measured only while there is work. A hold-up of a second or more usually means a large write to an SD card. |

## The server's clock

A Raspberry Pi keeps no time while off (unless a Pi 5 has its battery), so with no
internet it starts at the wrong time, and check-ins, the barometer, backup ages, sun
times and the grey line go wrong with it.

When the server and your device differ by more than a minute, a line across the top
says by how much, with **Set the server's clock from this phone** (or tablet, or
computer). Set your own device right first; times before 2024 are refused. A browser on
the server's computer may always press it; other devices only when Outpost was started
with `OUTPOST_ALLOW_REMOTE_CLOCK=true` (in `.env` for Docker, then `docker compose up
-d`). Otherwise the line says why. In Docker no browser counts as the server's computer,
not even one on it: on a Pi, open Outpost through `deploy/pi/on-this-pi.sh`
([deployment.md](deployment.md#10-things-kept-to-the-pi-itself)), or set the clock there
with `sudo date -s "YYYY-MM-DD HH:MM"`, today's date and the time now in place of the
letters.

- **Docker on a Raspberry Pi**: `deploy/pi/install.sh` adds a small service
  (`outpost-clock.path`) that sets the clock when Outpost asks. `--clock-from-network`
  lets phones and laptops on the network set it; `--no-clock` leaves it out.
- **Docker elsewhere, macOS, Windows**: set the clock on the computer itself.
- **Linux without Docker**: Outpost sets it if run as root or with `CAP_SYS_TIME`.

Outpost does not give the time to other devices. A USB GPS receiver as a time source is
not supported.

## Reaching it as outpost.local

`deploy/pi/install.sh --lan` announces the Pi as `outpost.local`, so devices reach it at
`http://outpost.local:8080` whatever the router calls it. It installs `avahi-utils` if
needed, adds `outpost-name.service` to keep the name on the Pi's current address,
advertises the web server, and adds the name to `OUTPOST_ALLOWED_HOSTS` so Outpost and
its HTTPS certificate carry it. `--name=kitchen-pi` announces `kitchen-pi.local`;
`--no-name` leaves it out. Devices that cannot find `.local` names use the address the
script prints.

## Prometheus and Grafana

Start Outpost with `OUTPOST_METRICS=true` (or `install.sh --metrics`) and it answers
Prometheus at `/metrics`, to this computer and private networks only: request times by
route, hold-ups, jobs by state, download speed, each location's state and free space,
database size, last backup's age, memory and temperature. `deploy/pi/monitoring.md` has
the Prometheus lines and `deploy/pi/grafana-outpost.json` a Grafana dashboard.
