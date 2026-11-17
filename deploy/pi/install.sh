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
#   --dry-run         Print the commands instead of running them.
#
# It never deletes anything, and it does not touch an existing .env except, with --lan,
# the lines named above (the file as it was is kept beside it).
set -euo pipefail

INSTALL_DOCKER=false
LAN=false
HTTPS=false
VOACAP_DATA=true
USE_SUDO=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --install-docker) INSTALL_DOCKER=true ;;
    --lan) LAN=true ;;
    --https) HTTPS=true ;;
    --no-voacap-data) VOACAP_DATA=false ;;
    --sudo) USE_SUDO=true ;;
    --dry-run) DRY_RUN=true ;;
    -h | --help)
      sed -n '2,36p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

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
