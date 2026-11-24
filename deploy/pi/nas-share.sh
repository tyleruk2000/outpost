#!/usr/bin/env bash
# Connects a folder on a NAS (an SMB share) to Outpost running in Docker on a Raspberry Pi
# or another Debian-based Linux computer, from this checkout.
#
# First run on a Raspberry Pi 5 (Raspberry Pi OS, Debian 12) against a Synology share on
# 17 November 2026. Read it before running it, and run it with --dry-run first.
#
#   ./deploy/pi/nas-share.sh --dry-run --server 192.168.1.20 --share docs --folder Outpost --user me
#   ./deploy/pi/nas-share.sh --server 192.168.1.20 --share docs --folder Outpost --user me
#
#   --server ADDRESS  The NAS: its address or its name on your network.
#   --share NAME      The share on it.
#   --folder PATH     A folder inside the share, which must be there already. Only this
#                     folder is mounted, so nothing else in the share can be seen from
#                     Outpost. Leave it out to mount the whole share.
#   --user NAME       The user to sign in to the NAS as.
#   --name NAME       What to call it on this computer (default: the share's name). It
#                     appears in Outpost as /storage/nas/NAME.
#   --new-password    Ask for the password again, replacing the one kept.
#   --sudo            Use the system's Docker through sudo even when `docker` works
#                     without it (as deploy/pi/install.sh --sudo does).
#   --no-restart      Do not restart Outpost at the end; do it yourself with
#                     `docker compose up -d`.
#   --dry-run         Print what would be done instead of doing it. Asks for no password.
#
# What it does:
#   1. Asks for the NAS password, without showing it, and keeps it in a file only root can
#      read (/root/.outpost-smb-NAME, mode 600). The password is never put on a command
#      line, in .env, or anywhere Outpost can read. Outpost itself never has it.
#   2. Adds one line to /etc/fstab (the file as it was is kept beside it) so that the
#      system mounts the folder at /mnt/outpost-nas/NAME when it is first used, and again
#      after a restart. If the NAS is off, the Pi still starts.
#   3. Writes compose.nas.yaml, which gives the containers /mnt/outpost-nas as
#      /storage/nas (read-only for kiwix), and names it in COMPOSE_FILE in .env.
#      Run again after an update, it brings compose.nas.yaml up to date (the password
#      kept is used again).
#   4. Restarts Outpost so that it sees the folder.
# Then, in Outpost: Storage → Add a location, folder /storage/nas/NAME, kind Network share.
#
# It deletes nothing. To undo it: remove the line from /etc/fstab, `sudo umount
# /mnt/outpost-nas/NAME`, delete compose.nas.yaml and the COMPOSE_FILE line in .env, delete
# /root/.outpost-smb-NAME, and `docker compose up -d`.
set -euo pipefail

SERVER=""
SHARE=""
FOLDER=""
NAS_USER=""
NAME=""
NEW_PASSWORD=false
RESTART=true
USE_SUDO=false
DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="${2:-}"; shift 2 ;;
    --share) SHARE="${2:-}"; shift 2 ;;
    --folder) FOLDER="${2:-}"; shift 2 ;;
    --user) NAS_USER="${2:-}"; shift 2 ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --new-password) NEW_PASSWORD=true; shift ;;
    --no-restart) RESTART=false; shift ;;
    --sudo) USE_SUDO=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h | --help)
      awk 'NR > 1 && /^set -euo/ { exit } NR > 1' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (try --help)" >&2
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

[ -n "$SERVER" ] && [ -n "$SHARE" ] && [ -n "$NAS_USER" ] || stop "Give --server, --share and --user (try --help)."
[ -n "$NAME" ] || NAME="$SHARE"
FOLDER="${FOLDER#/}"
FOLDER="${FOLDER%/}"
# /etc/fstab and a systemd unit name are written from these, so they are kept to plain characters.
plain='^[A-Za-z0-9][A-Za-z0-9._-]*$'
[[ "$SERVER" =~ $plain ]] || stop "The server \"$SERVER\" has characters this script does not write to /etc/fstab. Use its address."
[[ "$SHARE" =~ $plain ]] || stop "The share \"$SHARE\" has a space or another character this script does not write to /etc/fstab. See docs/storage.md to write the line yourself."
[[ "$NAME" =~ $plain ]] || stop "The name \"$NAME\" must be letters, numbers, dots, dashes and underscores."
plain_user='^[A-Za-z0-9][A-Za-z0-9._@-]*$'
[[ "$NAS_USER" =~ $plain_user ]] || stop "The user \"$NAS_USER\" has characters this script does not write to a credentials file."
if [ -n "$FOLDER" ]; then
  plain_folder='^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$'
  [[ "$FOLDER" =~ $plain_folder ]] || stop "The folder \"$FOLDER\" has a space or another character this script does not write to /etc/fstab. See docs/storage.md to write the line yourself."
  case "/$FOLDER/" in */../* | */./*) stop "The folder must not contain . or .. parts." ;; esac
fi

if ! $DRY_RUN; then
  [ "$(uname -s)" = "Linux" ] || stop "This script is for Raspberry Pi OS and other Debian-based Linux. On a Mac, Outpost connects shares itself: see docs/storage.md."
  [ "$(id -u)" -ne 0 ] || stop "Run this as your own user, not with sudo. It asks for sudo where it needs it."
  command -v systemctl >/dev/null || stop "This script expects systemd, as Raspberry Pi OS has."
fi
[ -f "$REPO/compose.yaml" ] || stop "compose.yaml was not found in $REPO. Run this from a checkout of Outpost."

DOCKER=(docker)
if $USE_SUDO; then
  DOCKER=(sudo docker)
elif ! $DRY_RUN && ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
elif ! $DRY_RUN && docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -q rootless; then
  stop "\`docker\` here is rootless Docker (your own user's). A share mounted by the system cannot be
handed to a rootless container in a way Outpost can write to. If Outpost runs in the
system's Docker, run this again with --sudo. Nothing was changed."
fi

SOURCE="//$SERVER/$SHARE${FOLDER:+/$FOLDER}"
PARENT="/mnt/outpost-nas"
MOUNT="$PARENT/$NAME"
CREDENTIALS="/root/.outpost-smb-$NAME"
# uid 1000 is the user the server runs as inside its container, whoever you are here.
OPTIONS="credentials=$CREDENTIALS,uid=1000,gid=1000,file_mode=0664,dir_mode=0775,vers=3.0,nofail,_netdev,x-systemd.automount,x-systemd.mount-timeout=30"
LINE="$SOURCE  $MOUNT  cifs  $OPTIONS  0  0"

# ── What mounts an SMB share ─────────────────────────────────────────────────
if ! command -v mount.cifs >/dev/null 2>&1 && [ ! -x /sbin/mount.cifs ] && [ ! -x /usr/sbin/mount.cifs ]; then
  say "Installing cifs-utils, which mounts SMB shares."
  run sudo apt-get update
  run sudo apt-get install -y cifs-utils
fi

# ── The password, kept where only root can read it ───────────────────────────
have_credentials() { sudo test -f "$CREDENTIALS"; }
if $DRY_RUN; then
  printf '  would ask for the password of %s on %s and keep it in %s (mode 600, root only)\n' "$NAS_USER" "$SERVER" "$CREDENTIALS"
elif $NEW_PASSWORD || ! have_credentials; then
  [ -t 0 ] || stop "The password is asked for at the keyboard, and there is none here. Run this in a terminal (over ssh, use: ssh -t)."
  printf '\nPassword for %s on %s (it is not shown): ' "$NAS_USER" "$SERVER"
  IFS= read -rs PASSWORD
  printf '\n'
  [ -n "$PASSWORD" ] || stop "No password was typed. Nothing was changed."
  # Through a pipe, so that it is never on a command line where other programs could see it.
  printf 'username=%s\npassword=%s\n' "$NAS_USER" "$PASSWORD" | sudo sh -c "umask 077 && cat > '$CREDENTIALS'"
  unset PASSWORD
  sudo chmod 600 "$CREDENTIALS"
  say "The password is kept in $CREDENTIALS, which only root can read."
else
  say "Using the password already kept in $CREDENTIALS (--new-password asks again)."
fi

# ── /etc/fstab ───────────────────────────────────────────────────────────────
run sudo mkdir -p "$MOUNT"
if grep -qE "^[^#]*[[:space:]]${MOUNT}[[:space:]]" /etc/fstab 2>/dev/null; then
  if grep -qF "$LINE" /etc/fstab; then
    say "/etc/fstab already has the line for $MOUNT."
  else
    stop "/etc/fstab already mounts something else at $MOUNT:
$(grep -E "^[^#]*[[:space:]]${MOUNT}[[:space:]]" /etc/fstab)
Remove that line, or choose another --name, and run this again."
  fi
else
  say "Adding to /etc/fstab (the file as it was is kept as /etc/fstab.before-outpost-nas):"
  printf '  %s\n' "$LINE"
  if ! $DRY_RUN; then
    sudo test -f /etc/fstab.before-outpost-nas || sudo cp /etc/fstab /etc/fstab.before-outpost-nas
    printf '%s\n' "$LINE" | sudo tee -a /etc/fstab >/dev/null
  fi
fi

run sudo systemctl daemon-reload
UNIT="$(systemd-escape -p --suffix=automount "$MOUNT" 2>/dev/null || echo "mnt-outpost-nas-$NAME.automount")"
run sudo systemctl restart "$UNIT"

if ! $DRY_RUN; then
  say "Looking in $MOUNT, which mounts it."
  if ! ls "$MOUNT" >/dev/null 2>&1 || ! findmnt -t cifs "$MOUNT" >/dev/null 2>&1; then
    stop "$SOURCE could not be mounted. What the system said:
$(sudo journalctl -k -n 5 --no-pager 2>/dev/null | grep -i cifs | tail -3)
The usual reasons: a wrong password (run this again with --new-password), a share or
folder that is not there (the folder must exist on the NAS already), or a NAS that
wants another SMB version (change vers=3.0 in /etc/fstab to 2.1 or 3.1.1)."
  fi
  check="$MOUNT/.outpost-nas-check-$$"
  if sudo -u "#1000" sh -c "echo ok > '$check'" 2>/dev/null; then
    sudo -u "#1000" rm -f "$check"
    say "Mounted, and it can be written to."
  else
    say "Mounted, but it could not be written to as uid 1000: Outpost would only be able to read it. Check what $NAS_USER may do with the share on the NAS."
  fi
fi

# ── Docker ───────────────────────────────────────────────────────────────────
cd "$REPO"
NAS_COMPOSE="# Written by deploy/pi/nas-share.sh. Gives the containers the folder that NAS shares are
# mounted in. \"rslave\" is what lets a share mounted after the container started (the
# NAS was off, or is first used later) appear inside it.
services:
  outpost:
    volumes:
      - type: bind
        source: $PARENT
        target: /storage/nas
        bind:
          propagation: rslave
  kiwix:
    volumes:
      - type: bind
        source: $PARENT
        target: /storage/nas
        read_only: true
        bind:
          propagation: rslave
  # Walking and cycling (the optional \"routes\" profile) reads country files kept on the
  # NAS, and may build there (Offline maps → Where it works) to spare this computer's SD
  # card, so it may write too. It writes only inside a folder called outpost-streets-work.
  # The whole folder is given, not that one: a mount of a folder inside the share would
  # stop the streets service starting whenever the NAS is off.
  valhalla:
    volumes:
      - type: bind
        source: $PARENT
        target: /storage/nas
        bind:
          propagation: rslave"
if $DRY_RUN; then
  printf '  would write compose.nas.yaml:\n%s\n' "$NAS_COMPOSE" | sed 's/^/    /'
else
  say "Writing compose.nas.yaml."
  printf '%s\n' "$NAS_COMPOSE" >compose.nas.yaml
fi

# Naming COMPOSE_FILE stops Compose reading compose.override.yaml by itself (install.sh
# --https writes it), so compose-files.sh names that too, whichever script ran first.
# shellcheck source=deploy/pi/compose-files.sh
. "$HERE/compose-files.sh"
compose_files_sync "$DRY_RUN" compose.nas.yaml

if $RESTART; then
  say "Restarting Outpost so that it sees the folder (a few seconds)."
  run "${DOCKER[@]}" compose up -d
else
  say "Not restarting Outpost. When you are ready: ${DOCKER[*]} compose up -d"
fi

say "Done. In Outpost: Storage → Add a location, folder /storage/nas/$NAME, kind Network share.
Keep the database where it is, on this computer: only documents, collections and maps belong on a share."
