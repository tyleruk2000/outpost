#!/usr/bin/env bash
# Sets Outpost up on a Raspberry Pi 4 or 5 with Docker, from this checkout.
#
# First run on a real Raspberry Pi on 17 November 2026: a Pi 5 with 8 GB, Raspberry Pi OS
# (Debian 12), with Docker already installed, with --lan --https --sudo. The
# --install-docker part has still not been run on a Pi. Read it before running it, and
# run it with --dry-run first to see what it would do.
#
#   ./deploy/pi/install.sh --dry-run
#   ./deploy/pi/install.sh --install-docker --lan
#
#   --install-docker  Install Docker Engine and the Compose plugin from Docker's own apt
#                     repository if they are missing (needs the internet and sudo).
#                     Without this the script stops and tells you what is missing.
#   --lan             Let other devices reach Outpost: sets OUTPOST_LAN_ACCESS=true and
#                     OUTPOST_BIND=0.0.0.0 in .env. Outpost has no accounts, so everyone
#                     who can reach it can read, change and delete what is in it.
#   --https           Publish the port HTTPS uses (8443), so that it can be reached once
#                     you turn HTTPS on in Settings → HTTPS on your network. Phones need
#                     an https address for location, recording a track and keeping
#                     things on the phone. Writes compose.override.yaml; compose.yaml
#                     itself is not edited.
#   --no-voacap-data  Do not fetch VOACAP's coefficients (559 kB) for the HF propagation
#                     planner once Outpost is up. They are not shipped with Outpost (see
#                     engines/voacap/NOTICE.txt); fetched here, the Pi predicts offline at
#                     once. Without them the planner offers a Download button instead.
#   --sudo            Use the system's Docker through sudo even when `docker` works
#                     without it. For a computer that also has rootless Docker (a
#                     Docker of your own user's): without this the script would put
#                     Outpost there, where `sudo docker ps` does not show it, where it
#                     stops when you sign out unless lingering is on, and where
#                     deploy/pi/nas-share.sh cannot be used.
#   --name=NAME       Announce the Pi on the network as NAME.local (default: outpost), so
#                     phones reach it at http://outpost.local:8080 whatever the router
#                     calls it. Installs avahi-utils if it is missing (needs the internet),
#                     adds a service that keeps the name announced, and adds NAME.local to
#                     OUTPOST_ALLOWED_HOSTS so that Outpost answers to it and HTTPS
#                     certificates carry it. Only with --lan.
#   --no-name         Do not announce a name of Outpost's own.
#   --no-clock        Do not add the service that lets Outpost set the Pi's clock. A Pi has
#                     no clock that keeps time while it is off (unless a Pi 5 is given a
#                     battery), and without the internet it starts at the wrong time;
#                     Outpost notices and offers to set it from a phone's or laptop's
#                     clock. The service does that and nothing else (see set-clock.sh).
#   --clock-from-network  Let any device on the network set the clock (sets
#                     OUTPOST_ALLOW_REMOTE_CLOCK=true). Without it only a browser on the Pi
#                     itself may, which in Docker is the only one Outpost recognises.
#   --metrics         Give Outpost's figures to Prometheus at /metrics, to this computer
#                     and the local network only (sets OUTPOST_METRICS=true). See
#                     deploy/pi/monitoring.md.
#   --decoders        Install the radio decoders, switched off, for a radio or SDR plugged
#                     into this Pi: Dire Wolf (APRS) and readsb (aircraft), and a service
#                     that lets Outpost switch each on and off and nothing else (see
#                     decoders.sh). AIS-catcher (ships) is used if you install it yourself.
#                     Outpost reads them at host.docker.internal. Not yet tried on a Pi.
#   --aprs-frequency=F  The frequency Dire Wolf tunes an SDR to, such as 144.80M (Europe,
#                     the default) or 144.39M (North America). Only with --decoders.
#   --dry-run         Print the commands instead of running them.
#
# It never deletes anything, and it does not touch an existing .env except the lines
# named above (with --lan, the file as it was is kept beside it).
set -euo pipefail

INSTALL_DOCKER=false
LAN=false
HTTPS=false
VOACAP_DATA=true
USE_SUDO=false
DRY_RUN=false
NAME=outpost
CLOCK=true
CLOCK_FROM_NETWORK=false
METRICS=false
DECODERS=false
APRS_FREQUENCY=144.80M
for arg in "$@"; do
  case "$arg" in
    --install-docker) INSTALL_DOCKER=true ;;
    --lan) LAN=true ;;
    --https) HTTPS=true ;;
    --no-voacap-data) VOACAP_DATA=false ;;
    --sudo) USE_SUDO=true ;;
    --dry-run) DRY_RUN=true ;;
    --name=*) NAME="${arg#--name=}" ;;
    --no-name) NAME="" ;;
    --no-clock) CLOCK=false ;;
    --clock-from-network) CLOCK_FROM_NETWORK=true ;;
    --metrics) METRICS=true ;;
    --decoders) DECODERS=true ;;
    --aprs-frequency=*) APRS_FREQUENCY="${arg#--aprs-frequency=}" ;;
    -h | --help)
      sed -n '2,61p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$APRS_FREQUENCY" =~ ^[0-9]{3}\.[0-9]{1,4}M$ ]]; then
  echo "--aprs-frequency takes a frequency in megahertz with an M, such as 144.80M." >&2
  exit 2
fi

if [ -n "$NAME" ] && ! [[ "$NAME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "--name takes one word of letters, digits and hyphens, such as outpost or kitchen-pi." >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

say() { printf '\n%s\n' "$*"; }
stop() {
  printf '\n%s\n' "$*" >&2
  exit 1
}
run() {
  if $DRY_RUN; then
    printf '  would run: %s\n' "$*"
  else
    "$@"
  fi
}

# ── What this computer is ────────────────────────────────────────────────────
if ! $DRY_RUN; then
  [ "$(uname -s)" = "Linux" ] || stop "This script is for Raspberry Pi OS (Linux). On other systems see docs/deployment.md."
  [ "$(uname -m)" = "aarch64" ] || stop "A 64-bit system is needed: this one reports $(uname -m). Install Raspberry Pi OS (64-bit)."
  command -v dpkg >/dev/null || stop "This script expects a Debian-based system such as Raspberry Pi OS."
  [ "$(dpkg --print-architecture)" = "arm64" ] || stop "The kernel is 64-bit but the system's programs are $(dpkg --print-architecture). Install Raspberry Pi OS (64-bit)."
  [ "$(id -u)" -ne 0 ] || stop "Run this as your own user, not with sudo. It asks for sudo where it needs it."
fi
[ -f "$REPO/compose.yaml" ] || stop "compose.yaml was not found in $REPO. Run this from a checkout of Outpost."

# ── Docker ───────────────────────────────────────────────────────────────────
have_compose() { docker compose version >/dev/null 2>&1 || sudo -n docker compose version >/dev/null 2>&1; }

if ! have_compose; then
  if ! $INSTALL_DOCKER; then
    stop "Docker with the Compose plugin is not installed.
Run this again with --install-docker to install it from Docker's apt repository,
or install it yourself: https://docs.docker.com/engine/install/debian/"
  fi
  say "Installing Docker Engine and the Compose plugin from Docker's apt repository."
  # These are the steps from https://docs.docker.com/engine/install/debian/ as they
  # stood on 16 November 2026. Raspberry Pi OS (64-bit) is Debian with the same
  # release names; Docker's page lists Debian 12 (bookworm) and 13 (trixie) on arm64.
  codename="unknown"
  [ -r /etc/os-release ] && codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-unknown}")"
  if ! $DRY_RUN; then
    case "$codename" in
      bookworm | trixie) ;;
      *) stop "This system's release is \"$codename\". Docker's instructions cover bookworm and trixie; install Docker yourself and run this again." ;;
    esac
  fi
  run sudo apt-get update
  run sudo apt-get install -y ca-certificates curl
  run sudo install -m 0755 -d /etc/apt/keyrings
  run sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  run sudo chmod a+r /etc/apt/keyrings/docker.asc
  sources="Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $codename
Components: stable
Architectures: $(dpkg --print-architecture 2>/dev/null || echo arm64)
Signed-By: /etc/apt/keyrings/docker.asc"
  if $DRY_RUN; then
    printf '  would write /etc/apt/sources.list.d/docker.sources:\n%s\n' "$sources" | sed 's/^/    /'
  else
    printf '%s\n' "$sources" | sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
  fi
  run sudo apt-get update
  run sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  # So that docker works without sudo after the next sign-in.
  run sudo usermod -aG docker "$USER"
fi

# This sign-in may not be in the docker group yet.
DOCKER=(docker)
if $USE_SUDO; then
  DOCKER=(sudo docker)
elif ! $DRY_RUN && ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
elif ! $DRY_RUN && docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless; then
  say "Note: \`docker\` here is rootless Docker, your own user's, not the system's. Outpost will run there:
\`sudo docker ps\` will not show it, and it stops when you sign out unless lingering is on
(sudo loginctl enable-linger $USER). To use the system's Docker instead, stop this (Ctrl-C) and
run it again with --sudo."
fi

# Raspberry Pi OS starts with memory limits switched off in the kernel. Docker then says
# "Your kernel does not support memory limit capabilities" and runs the containers
# without the limits compose.yaml asks for. Nothing breaks; the limits are a guard only.
if ! $DRY_RUN && grep -qw 'cgroup_disable=memory' /proc/cmdline 2>/dev/null; then
  say "Note: this system has memory limits switched off (cgroup_disable=memory), as Raspberry Pi OS
does by default, so Docker will not hold the containers to the memory limits in compose.yaml.
Outpost runs the same. See \"Raspberry Pi 4 and 5\" in docs/deployment.md."
fi

# ── Settings ─────────────────────────────────────────────────────────────────
cd "$REPO"
if [ ! -f .env ]; then
  say "Creating .env from .env.example."
  run cp .env.example .env
fi

set_env() { # set_env KEY VALUE: changes or adds one line of .env
  local key="$1" value="$2"
  if $DRY_RUN; then
    printf '  would set %s=%s in .env\n' "$key" "$value"
    return
  fi
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >>.env
  fi
}

if $LAN; then
  say "Letting other devices on the network reach Outpost (it has no accounts: anyone who can reach it can use all of it)."
  if ! $DRY_RUN && [ -f .env ]; then cp -n .env .env.before-pi-install || true; fi
  set_env OUTPOST_LAN_ACCESS true
  set_env OUTPOST_BIND 0.0.0.0
fi

add_allowed_host() { # add_allowed_host NAME: adds one name to OUTPOST_ALLOWED_HOSTS in .env, keeping the others
  local name="$1" current
  current="$(grep '^OUTPOST_ALLOWED_HOSTS=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
  case ",${current}," in *",${name},"*) return ;; esac
  set_env OUTPOST_ALLOWED_HOSTS "${current:+${current},}${name}"
}

$CLOCK_FROM_NETWORK && set_env OUTPOST_ALLOW_REMOTE_CLOCK true
$METRICS && set_env OUTPOST_METRICS true

# ── A name on the network: outpost.local ─────────────────────────────────────
# Avahi (mDNS) answers for NAME.local on the local network. Raspberry Pi OS runs
# avahi-daemon already, which announces the Pi's own name (raspberrypi.local); this adds a
# second name for the same address, and says on the network that a web server is there.
if [ -n "$NAME" ] && $LAN && [ "$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')" = "$NAME" ]; then
  # The Pi's own name is NAME already, which Avahi announces as NAME.local by itself.
  say "This Pi is called $NAME already, so it is ${NAME}.local on the network as it is."
  add_allowed_host "${NAME}.local"
elif [ -n "$NAME" ] && $LAN; then
  say "Announcing Outpost on the network as ${NAME}.local."
  if ! command -v avahi-publish >/dev/null 2>&1; then
    run sudo apt-get install -y avahi-daemon avahi-utils
  fi
  run sudo install -d -m 0755 /usr/local/lib/outpost
  run sudo install -m 0755 "$HERE/announce-name.sh" /usr/local/lib/outpost/announce-name.sh
  name_unit="[Unit]
Description=Outpost: announce this computer as ${NAME}.local
Wants=network-online.target avahi-daemon.service
After=network-online.target avahi-daemon.service

[Service]
ExecStart=/usr/local/lib/outpost/announce-name.sh ${NAME}.local
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target"
  http_port="$(grep '^OUTPOST_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
  service_file="<?xml version=\"1.0\" standalone=\"no\"?>
<!DOCTYPE service-group SYSTEM \"avahi-service.dtd\">
<!-- Written by deploy/pi/install.sh: Outpost's web address, for apps that look for one. -->
<service-group>
  <name>Outpost</name>
  <service>
    <type>_http._tcp</type>
    <port>${http_port:-8080}</port>
    <host-name>${NAME}.local</host-name>
  </service>
</service-group>"
  if $DRY_RUN; then
    printf '  would write /etc/systemd/system/outpost-name.service:\n%s\n' "$name_unit" | sed 's/^/    /'
    printf '  would write /etc/avahi/services/outpost.service:\n%s\n' "$service_file" | sed 's/^/    /'
  else
    printf '%s\n' "$name_unit" | sudo tee /etc/systemd/system/outpost-name.service >/dev/null
    sudo install -d -m 0755 /etc/avahi/services
    printf '%s\n' "$service_file" | sudo tee /etc/avahi/services/outpost.service >/dev/null
  fi
  run sudo systemctl daemon-reload
  run sudo systemctl enable --now outpost-name.service
  # avahi-daemon reads its service files again when told to (avahi-daemon(8), --reload).
  run sudo systemctl reload avahi-daemon
  add_allowed_host "${NAME}.local"
fi

# ── HTTPS ────────────────────────────────────────────────────────────────────
# Docker only lets a port in when it is published. compose.yaml leaves the HTTPS one
# commented out; a file called compose.override.yaml is read after it by itself.
if $HTTPS; then
  override="services:
  outpost:
    ports:
      - \"\${OUTPOST_BIND:-127.0.0.1}:\${OUTPOST_HTTPS_PORT:-8443}:\${OUTPOST_HTTPS_PORT:-8443}\""
  if [ -f compose.override.yaml ]; then
    say "compose.override.yaml is already here and was left as it is. Make sure it publishes the HTTPS port (see docs/deployment.md, \"HTTPS on your network\")."
  elif $DRY_RUN; then
    printf '  would write compose.override.yaml:\n%s\n' "$override" | sed 's/^/    /'
  else
    say "Publishing the HTTPS port (compose.override.yaml)."
    printf '# Written by deploy/pi/install.sh --https. Publishes the port HTTPS uses.\n%s\n' "$override" >compose.override.yaml
  fi
  $LAN || say "Note: without --lan only this Pi can reach Outpost, and it already counts as secure here. HTTPS matters for other devices."
fi

# ── Build and start ──────────────────────────────────────────────────────────
say "Building and starting Outpost. The first build downloads map fonts and the search model and can take a long time on a Pi."
run "${DOCKER[@]}" compose up -d --build

port="$(grep '^OUTPOST_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
port="${port:-8080}"
if ! $DRY_RUN; then
  say "Waiting for Outpost to answer."
  ok=false
  for _ in $(seq 1 60); do
    if curl -fsS -m 3 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      ok=true
      break
    fi
    sleep 5
  done
  $ok || stop "Outpost did not answer within five minutes. Look at: ${DOCKER[*]} compose logs outpost"
fi

# ── Setting the clock ────────────────────────────────────────────────────────
# Outpost runs in a container, which cannot set the Pi's clock. A path unit watches one
# folder in Outpost's data volume; when Outpost leaves a request there, set-clock.sh moves
# the clock by the amount asked and writes back what happened. The script is root's, in
# /usr/local/lib, out of the container's reach; the folder is Outpost's, and the script
# trusts nothing in it (see the script).
if $CLOCK; then
  say "Adding the service that lets Outpost set this Pi's clock (and nothing else)."
  volume="outpost_outpost-data"
  data=""
  if ! $DRY_RUN; then
    data="$("${DOCKER[@]}" volume inspect "$volume" --format '{{ .Mountpoint }}' 2>/dev/null || true)"
  fi
  if [ -z "$data" ] && ! $DRY_RUN; then
    say "Outpost's data volume ($volume) was not found, so the clock service was not added. Run this again once Outpost is running."
  else
    clock_dir="${data:-/var/lib/docker/volumes/$volume/_data}/clock"
    run sudo install -d -m 0755 /usr/local/lib/outpost
    run sudo install -m 0755 "$HERE/set-clock.sh" /usr/local/lib/outpost/set-clock.sh
    # The folder belongs to the user the container runs as (node, uid 1000); the file
    # "helper" tells Outpost the service is there.
    run sudo install -d -m 0755 -o 1000 -g 1000 "$clock_dir"
    if $DRY_RUN; then
      printf '  would write %s/helper\n' "$clock_dir"
    else
      printf 'Written by deploy/pi/install.sh: outpost-clock.path sets the clock from requests here.\n' | sudo tee "$clock_dir/helper" >/dev/null
      sudo chown 1000:1000 "$clock_dir/helper"
    fi
    path_unit="[Unit]
Description=Outpost: watch for a request to set the clock

[Path]
PathExists=${clock_dir}/request

[Install]
WantedBy=multi-user.target"
    service_unit="[Unit]
Description=Outpost: set the clock as asked

[Service]
Type=oneshot
ExecStart=/usr/local/lib/outpost/set-clock.sh ${clock_dir}"
    if $DRY_RUN; then
      printf '  would write /etc/systemd/system/outpost-clock.path:\n%s\n' "$path_unit" | sed 's/^/    /'
      printf '  would write /etc/systemd/system/outpost-clock.service:\n%s\n' "$service_unit" | sed 's/^/    /'
    else
      printf '%s\n' "$path_unit" | sudo tee /etc/systemd/system/outpost-clock.path >/dev/null
      printf '%s\n' "$service_unit" | sudo tee /etc/systemd/system/outpost-clock.service >/dev/null
    fi
    run sudo systemctl daemon-reload
    run sudo systemctl enable --now outpost-clock.path
    $CLOCK_FROM_NETWORK || say "Note: only a browser on this Pi may set the clock. To allow phones and laptops on your network, run this again with --clock-from-network."
  fi
fi

# ── Radio decoders ───────────────────────────────────────────────────────────
# For a radio on a sound interface, or an SDR, plugged into this Pi (Heard on the radio).
# Each decoder is installed switched off and runs as a service of its own; decoders.sh,
# run by a path unit as the clock's helper is, starts and stops them when Outpost leaves a
# request in the "decoders" folder of its data volume, and does nothing else. Every one
# only listens: Dire Wolf is given no PTT, no beacon and a null audio output.
# NOT TESTED ON A RASPBERRY PI.
if $DECODERS; then
  say "Installing the radio decoders, switched off: Dire Wolf for APRS and readsb for aircraft."
  run sudo apt-get install -y direwolf rtl-sdr alsa-utils usbutils
  if ! command -v readsb >/dev/null 2>&1; then
    # readsb's own install script, as its README recommends; it starts readsb's own service, which is then switched off
    # so that Outpost's button is the only switch.
    say "Installing readsb with its own install script (github.com/wiedehopf/adsb-scripts)."
    if $DRY_RUN; then
      printf '  would run: %s\n' 'sudo bash -c "$(wget -O - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)"'
    else
      sudo bash -c "$(wget -O - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)" || say "readsb could not be installed now; run this again later."
    fi
    run sudo systemctl disable --now readsb || true
  fi
  command -v AIS-catcher >/dev/null 2>&1 || say "AIS-catcher (ships) is not installed: install it with its own script from its installation page, then run this again."
  volume="outpost_outpost-data"
  data=""
  if ! $DRY_RUN; then
    data="$("${DOCKER[@]}" volume inspect "$volume" --format '{{ .Mountpoint }}' 2>/dev/null || true)"
  fi
  if [ -z "$data" ] && ! $DRY_RUN; then
    say "Outpost's data volume ($volume) was not found, so the decoders' switch was not added. Run this again once Outpost is running."
  else
    decoders_dir="${data:-/var/lib/docker/volumes/$volume/_data}/decoders"
    run sudo install -d -m 0755 /usr/local/lib/outpost /etc/outpost/decoders
    run sudo install -m 0755 "$HERE/decoders.sh" /usr/local/lib/outpost/decoders.sh
    if $DRY_RUN; then
      printf '  would write /etc/outpost/decoders/aprs-frequency: %s\n' "$APRS_FREQUENCY"
    else
      printf '%s\n' "$APRS_FREQUENCY" | sudo tee /etc/outpost/decoders/aprs-frequency >/dev/null
    fi
    # The decoders run as a user of their own, allowed the sound devices and USB, and nothing of Outpost's.
    if ! id outpost-decoder >/dev/null 2>&1; then
      run sudo useradd --system --no-create-home --shell /usr/sbin/nologin --groups audio,plugdev outpost-decoder
    fi
    run sudo install -d -m 0755 -o 1000 -g 1000 "$decoders_dir"
    if $DRY_RUN; then
      printf '  would write %s/helper\n' "$decoders_dir"
    else
      printf 'Written by deploy/pi/install.sh: outpost-decoders.path starts and stops the decoders from requests here.\n' | sudo tee "$decoders_dir/helper" >/dev/null
      sudo chown 1000:1000 "$decoders_dir/helper"
    fi
    for decoder in direwolf readsb ais-catcher; do
      unit="[Unit]
Description=Outpost: the ${decoder} decoder, listening only
After=network.target

[Service]
User=outpost-decoder
ExecStart=/etc/outpost/decoders/${decoder}.run
Restart=on-failure
RestartSec=10"
      if $DRY_RUN; then
        printf '  would write /etc/systemd/system/outpost-%s.service\n' "$decoder"
      else
        printf '%s\n' "$unit" | sudo tee "/etc/systemd/system/outpost-${decoder}.service" >/dev/null
      fi
    done
    path_unit="[Unit]
Description=Outpost: watch for a request to switch a decoder on or off

[Path]
PathExists=${decoders_dir}/request

[Install]
WantedBy=multi-user.target"
    service_unit="[Unit]
Description=Outpost: switch a decoder on or off as asked

[Service]
Type=oneshot
ExecStart=/usr/local/lib/outpost/decoders.sh ${decoders_dir}"
    if $DRY_RUN; then
      printf '  would write /etc/systemd/system/outpost-decoders.path and outpost-decoders.service\n'
    else
      printf '%s\n' "$path_unit" | sudo tee /etc/systemd/system/outpost-decoders.path >/dev/null
      printf '%s\n' "$service_unit" | sudo tee /etc/systemd/system/outpost-decoders.service >/dev/null
    fi
    run sudo systemctl daemon-reload
    run sudo systemctl enable --now outpost-decoders.path
    # A first look at what is plugged in, so that Settings has a list before anything is pressed.
    run sudo /usr/local/lib/outpost/decoders.sh "$decoders_dir"
    say "The decoders are installed and switched off. Switch one on in Outpost: Settings, Receivers. Then add a receiver with the address host.docker.internal."
  fi
fi

# ── HF propagation data ──────────────────────────────────────────────────────
# The one set-up download Outpost's planner needs: 15 files, 559 kB, from the engine's
# own repository at a pinned commit, each checked against engines/voacap/coefficients.json.
# Into the data volume, so that it survives rebuilds. Outpost itself never fetches them
# unless a person presses Download.
if $VOACAP_DATA; then
  say "Fetching VOACAP's coefficients for the HF propagation planner (15 files, 559 kB)."
  if ! run "${DOCKER[@]}" compose exec -T outpost node /app/scripts/fetch-voacap-data.mjs --data-dir /data; then
    say "They could not be fetched now. The planner will offer a Download button; or run this again later."
  fi
fi

say "Outpost is running."
echo "  On this Pi:        http://localhost:${port}"
if $LAN; then
  [ -n "$NAME" ] && echo "  By name:           http://${NAME}.local:${port}"
  # Each address of this Pi, leaving out Docker's own networks, which no phone can reach.
  if command -v ip >/dev/null 2>&1; then
    while read -r interface address; do
      case "$interface" in
        lo | docker* | br-* | veth*) ;;
        tailscale*) echo "  Over Tailscale:    http://${address}:${port}" ;;
        *) echo "  On your network:   http://${address}:${port}" ;;
      esac
    done < <(ip -4 -o addr show 2>/dev/null | awk '{ split($4, a, "/"); print $2, a[1] }')
  else
    for address in $(hostname -I 2>/dev/null || true); do
      case "$address" in *:*) ;; *) echo "  On your network:   http://${address}:${port}" ;; esac
    done
  fi
  echo "  For a Wi-Fi network of the Pi's own, with no router: sudo ./deploy/pi/hotspot.sh on"
  if $HTTPS; then
    echo "  HTTPS: open Settings → HTTPS on your network from a phone or laptop, turn it on,"
    echo "         press the button that adds the address you came by, then trust the"
    echo "         certificate on each device. The https address uses port 8443."
  else
    echo "  For location and the other things phones only allow over https, run this again with --https."
  fi
else
  echo "  Only this Pi can open it. Run again with --lan to share it with your network."
fi
echo "  Large collections belong on an SSD: see \"Raspberry Pi 4 and 5\" in docs/deployment.md."
