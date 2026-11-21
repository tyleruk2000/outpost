#!/bin/sh
# Installs an Outpost release when Outpost asks: the one thing it does.
#
# Installed by deploy/pi/install.sh as /usr/local/lib/outpost/update.sh and run as root by
# outpost-update.service whenever the file "request" appears in the folder given (the
# "update" folder in Outpost's data volume). A container cannot replace itself, so
# Outpost checks a release, keeps it in staged/ beside the request, makes a backup, and
# writes one line: an id and the release. This script then:
#
#   1. copies staged/release.json, its signature and the image to a folder of root's own;
#   2. checks the signature with minisign and the release key install.sh put beside this
#      script (not Outpost's copy: the folder is the container's, so nothing in it is
#      trusted), and the image against the SHA-256 the signed manifest gives;
#   3. loads the image into Docker and checks it is the one the manifest names;
#   4. sets OUTPOST_IMAGE in the checkout's .env to it and starts Outpost from it;
#   5. waits up to three minutes for Outpost to report healthy, and if it does not, puts
#      OUTPOST_IMAGE back as it was and starts the version before again.
#
# It writes "<id> ok <release>", "<id> rolled-back <release> <reason>" or
# "<id> failed <release> <reason>" to "result" for Outpost to read when it starts. The
# image of the version before is not removed; nor is anything else.
#
#   update.sh FOLDER CHECKOUT
set -eu

DIR="${1:?usage: update.sh FOLDER CHECKOUT}"
REPO="${2:?usage: update.sh FOLDER CHECKOUT}"
HERE="$(cd "$(dirname "$0")" && pwd)"
KEY="${OUTPOST_RELEASE_KEY_FILE:-$HERE/release-key.pub}"
WORK_ROOT="${OUTPOST_UPDATE_WORK:-/var/lib/outpost-update}"
HEALTH_WAIT="${OUTPOST_UPDATE_HEALTH_WAIT:-180}"
DOCKER="${OUTPOST_DOCKER:-docker}"

[ -d "$DIR" ] && [ ! -L "$DIR" ] || exit 0
cd "$DIR" || exit 0
if [ -L request ] || { [ -e request ] && [ ! -f request ]; }; then
  rm -rf request
  exit 0
fi
[ -f request ] || exit 0
line="$(head -c 200 request | head -n 1)"
rm -f request

id="${line%% *}"
release="${line#* }"
case "$id" in '' | *[!A-Za-z0-9]*) exit 0 ;; esac

answer() { # answer OUTCOME WORDS…
  outcome="$1"
  shift
  tmp="$(mktemp "$DIR/result.XXXXXX")"
  printf '%s %s %s %s\n' "$id" "$outcome" "${release:--}" "$*" >"$tmp"
  owner="$(stat -c '%u:%g' "$DIR" 2>/dev/null || stat -f '%u:%g' "$DIR")"
  chown "$owner" "$tmp" 2>/dev/null || true
  chmod 0644 "$tmp"
  mv -f "$tmp" "$DIR/result"
  logger -t outpost-update "$outcome $release $*" 2>/dev/null || true
}

if ! printf '%s' "$release" | grep -Eq '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(-[0-9A-Za-z.]{1,40})?$'; then
  release=""
  answer failed "the request did not name a release"
  exit 0
fi
[ -s "$KEY" ] || { answer failed "no release key is installed beside the update service; run deploy/pi/install.sh again"; exit 0; }
command -v minisign >/dev/null 2>&1 || { answer failed "minisign is not installed; run deploy/pi/install.sh again"; exit 0; }

# ── 1. A copy of root's own ──
work="$WORK_ROOT/$id"
rm -rf "$work"
mkdir -p "$work"
chmod 0700 "$WORK_ROOT" "$work"
for name in release.json release.json.minisig image.tar.gz; do
  source="$DIR/staged/$name"
  if [ -L "$source" ] || [ ! -f "$source" ]; then
    answer failed "staged/$name is missing or is not an ordinary file"
    exit 0
  fi
  cp "$source" "$work/$name"
done

# ── 2. The signature, and the image against the signed manifest ──
if ! minisign -Vm "$work/release.json" -p "$KEY" -q >/dev/null 2>&1; then
  answer failed "release.json is not signed by the release key"
  rm -rf "$work"
  exit 0
fi
case "$(uname -m)" in
  aarch64 | arm64) platform="linux/arm64" ;;
  x86_64 | amd64) platform="linux/amd64" ;;
  *) platform="linux/$(uname -m)" ;;
esac
# The manifest is JSON; python3 is on Raspberry Pi OS and Debian. Prints: release, sha256, image.
fields="$(python3 -c '
import json, sys
m = json.load(open(sys.argv[1]))
p = m["platforms"][sys.argv[2]]
print(m["release"], p["sha256"], p["image"])
' "$work/release.json" "$platform" 2>/dev/null)" || {
  answer failed "the signed manifest has no image for $platform"
  rm -rf "$work"
  exit 0
}
set -- $fields
if [ "${1:-}" != "$release" ]; then
  answer failed "the signed manifest is for release ${1:-none}, not $release"
  rm -rf "$work"
  exit 0
fi
want_sha="$2"
want_image="$3"
case "$want_image" in outpost:[0-9A-Za-z.-]*) ;; *)
  answer failed "the signed manifest names an image that is not Outpost's"
  rm -rf "$work"
  exit 0
  ;;
esac
have_sha="$(sha256sum "$work/image.tar.gz" | cut -d' ' -f1)"
if [ "$have_sha" != "$want_sha" ]; then
  answer failed "the image does not match the checksum in the signed manifest"
  rm -rf "$work"
  exit 0
fi

# ── 3. Load it ──
loaded="$("$DOCKER" load -i "$work/image.tar.gz" 2>&1)" || {
  answer failed "docker could not load the image: $(printf '%s' "$loaded" | tr '\n' ' ' | head -c 200)"
  rm -rf "$work"
  exit 0
}
rm -rf "$work"
if ! printf '%s\n' "$loaded" | grep -qx "Loaded image: $want_image"; then
  answer failed "the image loaded is not $want_image"
  exit 0
fi

# ── 4. Start it ──
cd "$REPO" || { answer failed "the checkout $REPO is not there"; exit 0; }
[ -f .env ] || touch .env
previous="$(grep '^OUTPOST_IMAGE=' .env | head -1 | cut -d= -f2- || true)"
set_image() {
  if grep -q '^OUTPOST_IMAGE=' .env; then
    sed -i "s|^OUTPOST_IMAGE=.*|OUTPOST_IMAGE=$1|" .env
  else
    printf 'OUTPOST_IMAGE=%s\n' "$1" >>.env
  fi
}
unset_image() {
  sed -i '/^OUTPOST_IMAGE=/d' .env
}
set_image "$want_image"
"$DOCKER" compose up -d --no-build outpost >/dev/null 2>&1 || true

# ── 5. Healthy, or back ──
healthy=false
waited=0
while [ "$waited" -lt "$HEALTH_WAIT" ]; do
  container="$("$DOCKER" compose ps -q outpost 2>/dev/null | head -1)"
  if [ -n "$container" ] && [ "$("$DOCKER" inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null)" = "healthy" ] &&
    "$DOCKER" inspect -f '{{.Config.Image}}' "$container" 2>/dev/null | grep -qx "$want_image"; then
    healthy=true
    break
  fi
  sleep 5
  waited=$((waited + 5))
done

if $healthy; then
  answer ok "Outpost $release started healthy"
  exit 0
fi
if [ -n "$previous" ]; then set_image "$previous"; else unset_image; fi
"$DOCKER" compose up -d --no-build outpost >/dev/null 2>&1 || true
answer rolled-back "Outpost $release did not report healthy within $HEALTH_WAIT seconds, so the version before was started again"
