#!/usr/bin/env bash
# Checks install.sh, nas-share.sh and on-this-pi.sh as far as a computer that is not a Pi
# can: in scratch copies of the checkout, with a stand-in for Docker where one is needed.
# Runs as your own user, with bash 3.2 or later (macOS or Linux):
#
#   deploy/pi/test/scripts.sh
#
# Where Docker is running, the order check also asks `docker compose config` which ports
# are published, and the on-this-pi.sh check uses a real Outpost image if one is here
# (OUTPOST_TEST_IMAGE, default outpost:local; skipped when missing). Ports:
# OUTPOST_TEST_PORT (default 9711) and OUTPOST_TEST_RELAY_PORT (default 9713).
# The stand-ins below are shell scripts written out whole, so $ in single quotes is meant.
# shellcheck disable=SC2016
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/outpost-pi-test.XXXXXX")"
trap 'rm -rf "$SCRATCH"' EXIT
failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() { echo "ok: $*"; }
have_docker=false
docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && have_docker=true

checkout() { # checkout NAME: a scratch copy of what the scripts need, printed
  local dir="$SCRATCH/$1"
  mkdir -p "$dir/deploy" "$dir/docker"
  cp "$REPO/compose.yaml" "$REPO/.env.example" "$dir/"
  cp -R "$REPO/deploy/pi" "$dir/deploy/pi"
  cp -R "$REPO/docker/valhalla" "$dir/docker/valhalla"
  : >"$dir/deploy/release-key.pub"
  echo "$dir"
}

# What each script writes, as it writes it (the parts that need root or a NAS left out).
write_override() { # as install.sh --https does
  printf '# Written by deploy/pi/install.sh --https. Publishes the port HTTPS uses.\nservices:\n  outpost:\n    ports:\n      - "${OUTPOST_BIND:-127.0.0.1}:${OUTPOST_HTTPS_PORT:-8443}:${OUTPOST_HTTPS_PORT:-8443}"\n' >compose.override.yaml
}
write_nas() { # as nas-share.sh does, from the text in the script itself
  # shellcheck disable=SC2034 # read by the text taken from nas-share.sh
  local PARENT=/tmp/outpost-nas-test
  eval "$(sed -n '/^NAS_COMPOSE="/,/propagation: rslave"$/p' deploy/pi/nas-share.sh)"
  printf '%s\n' "$NAS_COMPOSE" >compose.nas.yaml
}

# ── COMPOSE_FILE names every file, in either order ───────────────────────────
for order in "nas https" "https nas" "https" "nas"; do
  dir="$(checkout "order-${order// /-}")"
  (
    cd "$dir" || exit 1
    cp .env.example .env
    # shellcheck source=deploy/pi/compose-files.sh
    . deploy/pi/compose-files.sh
    for step in $order; do
      case "$step" in
        nas) write_nas && compose_files_sync false compose.nas.yaml >/dev/null ;;
        https) write_override && compose_files_sync false compose.override.yaml >/dev/null ;;
      esac
    done
  )
  files="$(grep '^COMPOSE_FILE=' "$dir/.env" | tail -1 | cut -d= -f2-)"
  case "$order" in
    "nas https" | "https nas") want="compose.yaml:compose.override.yaml:compose.nas.yaml" ;;
    nas) want="compose.yaml:compose.nas.yaml" ;;
    https) want="" ;;
  esac
  if [ "$files" = "$want" ]; then
    pass "$order: COMPOSE_FILE=${files:-(not set; Compose reads the override by itself)}"
  else
    fail "$order: COMPOSE_FILE=$files, wanted $want"
  fi
  if $have_docker; then
    config="$(cd "$dir" && docker compose --profile routes config 2>&1)"
    if [[ "$order" == *https* ]]; then
      if printf '%s\n' "$config" | grep -q 'published: "8443"'; then pass "$order: 8443 is published"; else fail "$order: 8443 is not published"; fi
    fi
    if [[ "$order" == *nas* ]]; then
      valhalla="$(printf '%s\n' "$config" | awk '/^  valhalla:/ { on = 1; next } /^  [a-z]/ { on = 0 } on')"
      kiwix="$(printf '%s\n' "$config" | awk '/^  kiwix:/ { on = 1; next } /^  [a-z]/ { on = 0 } on')"
      if printf '%s\n' "$valhalla" | grep -A3 'target: /storage/nas$' | grep -q 'read_only: true'; then
        fail "$order: the streets service has the NAS read-only"
      else
        pass "$order: the streets service may write to the NAS"
      fi
      if printf '%s\n' "$kiwix" | grep -A3 'target: /storage/nas$' | grep -q 'read_only: true'; then
        pass "$order: kiwix has the NAS read-only"
      else
        fail "$order: kiwix may write to the NAS"
      fi
    fi
  fi
done

# A COMPOSE_FILE written by an older nas-share.sh, before the override existed, gains it.
dir="$(checkout older)"
(
  cd "$dir" || exit 1
  cp .env.example .env
  printf 'COMPOSE_FILE=compose.yaml:compose.nas.yaml:compose.mine.yaml\n' >>.env
  write_nas
  write_override
  . deploy/pi/compose-files.sh
  compose_files_sync false >/dev/null
)
files="$(grep '^COMPOSE_FILE=' "$dir/.env" | tail -1 | cut -d= -f2-)"
if [ "$files" = "compose.yaml:compose.override.yaml:compose.nas.yaml:compose.mine.yaml" ]; then
  pass "an older COMPOSE_FILE gains the override, keeping a file of your own"
else
  fail "an older COMPOSE_FILE became $files"
fi

# ── install.sh --dry-run, on a Pi with no Docker ─────────────────────────────
stand_in() { # stand_in DIR OK: a docker (and sudo) that works when OK is true, and fails otherwise
  mkdir -p "$1"
  printf '#!/bin/sh\n[ "$1" = compose ] && [ "$2" = version ] && exit %s\n[ "$1" = info ] && exit %s\nexit 0\n' "$2" "$2" >"$1/docker"
  printf '#!/bin/sh\n[ "$1" = -n ] && shift\nexec "$@"\n' >"$1/sudo"
  chmod +x "$1/docker" "$1/sudo"
}
dir="$(checkout dry-run)"
stand_in "$SCRATCH/no-docker" 1
out="$(cd "$dir" && PATH="$SCRATCH/no-docker:$PATH" bash deploy/pi/install.sh --dry-run 2>&1)"
status=$?
if [ $status -eq 0 ] && printf '%s' "$out" | grep -q "would run: sudo apt-get install -y docker-ce" && printf '%s' "$out" | grep -q "Outpost is running"; then
  pass "install.sh --dry-run without Docker shows the whole run, Docker's install included"
else
  fail "install.sh --dry-run without Docker stopped ($status): $(printf '%s' "$out" | tail -3)"
fi

# ── install.sh again for one option keeps saying what is in force ────────────
dir="$(checkout again)"
stand_in "$SCRATCH/docker" 0
(cd "$dir" && cp .env.example .env && printf 'OUTPOST_LAN_ACCESS=true\nOUTPOST_BIND=0.0.0.0\n' >>.env && write_override)
out="$(cd "$dir" && PATH="$SCRATCH/docker:$PATH" bash deploy/pi/install.sh --dry-run --street-routes 2>&1)"
if printf '%s' "$out" | grep -q "Only this Pi can open it"; then
  fail "install.sh --street-routes with LAN access on says only this Pi can open it"
else
  pass "install.sh --street-routes with LAN access on does not say only this Pi can open it"
fi
if printf '%s' "$out" | grep -q "HTTPS: open Settings"; then
  pass "install.sh --street-routes with the HTTPS port published says how to turn HTTPS on"
else
  fail "install.sh --street-routes with the HTTPS port published asks for --https again"
fi
out="$(cd "$dir" && rm -f .env compose.override.yaml && PATH="$SCRATCH/docker:$PATH" bash deploy/pi/install.sh --dry-run 2>&1)"
if printf '%s' "$out" | grep -q "Only this Pi can open it"; then
  pass "install.sh without --lan on a fresh checkout says only this Pi can open it"
else
  fail "install.sh without --lan on a fresh checkout does not say only this Pi can open it"
fi

# ── install.sh gives the container the Pi's time zone ────────────────────────
mkdir -p "$SCRATCH/zone"
printf '#!/bin/sh\n[ "$1 $2 $3" = "show -p Timezone" ] && echo Europe/London\n' >"$SCRATCH/zone/timedatectl"
chmod +x "$SCRATCH/zone/timedatectl"
out="$(cd "$dir" && PATH="$SCRATCH/zone:$SCRATCH/docker:$PATH" bash deploy/pi/install.sh --dry-run 2>&1)"
if printf '%s' "$out" | grep -q "would set TZ=Europe/London in .env"; then
  pass "install.sh sets TZ in .env to the Pi's time zone"
else
  fail "install.sh does not set TZ to the Pi's time zone: $(printf '%s' "$out" | grep -i zone | head -2)"
fi
if grep -q 'TZ: ${TZ:-Etc/UTC}' "$REPO/compose.yaml"; then
  pass "compose.yaml passes TZ from .env to Outpost"
else
  fail "compose.yaml does not pass TZ to Outpost"
fi

# ── on-this-pi.sh: a browser here counts as the computer Outpost runs on ─────
image="${OUTPOST_TEST_IMAGE:-outpost:local}"
port="${OUTPOST_TEST_PORT:-9711}"
relay_port="${OUTPOST_TEST_RELAY_PORT:-9713}"
if $have_docker && docker image inspect "$image" >/dev/null 2>&1; then
  name="outpost-pi-test-$$"
  docker run -d --rm --name "$name" -p "127.0.0.1:$port:8080" -e OUTPOST_LAN_ACCESS=true \
    -e OUTPOST_PUBLISHED_ADDRESS=0.0.0.0 "$image" >/dev/null
  for _ in $(seq 1 60); do curl -fsS -m 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 && break; sleep 1; done
  direct="$(curl -fsS -m 5 "http://127.0.0.1:$port/api/backup/status" 2>&1)"
  # The script finds the container with `docker compose ps -q outpost`; here it is the one just started.
  mkdir -p "$SCRATCH/compose-ps"
  printf '#!/bin/sh\nif [ "$1" = compose ] && [ "$2" = ps ]; then echo %s; exit 0; fi\nexec %s "$@"\n' "$name" "$(command -v docker)" >"$SCRATCH/compose-ps/docker"
  chmod +x "$SCRATCH/compose-ps/docker"
  PATH="$SCRATCH/compose-ps:$PATH" bash "$REPO/deploy/pi/on-this-pi.sh" --port "$relay_port" >/dev/null 2>&1 &
  relay=$!
  for _ in $(seq 1 20); do curl -fsS -m 5 "http://localhost:$relay_port/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
  through="$(curl -fsS -m 10 "http://localhost:$relay_port/api/backup/status" 2>&1)"
  kill "$relay" 2>/dev/null
  wait "$relay" 2>/dev/null
  docker stop "$name" >/dev/null 2>&1
  if printf '%s' "$direct" | grep -q '"reason":"remote"'; then
    pass "on-this-pi: straight to the published port, the Pi counts as remote (as on a real Pi)"
  else
    fail "on-this-pi: straight to the published port: $(printf '%s' "$direct" | head -c 200)"
  fi
  if printf '%s' "$through" | grep -q '"right":{"allowed":true,"reason":"local"'; then
    pass "on-this-pi: through it, the browser counts as the computer Outpost runs on"
  else
    fail "on-this-pi: through it: $(printf '%s' "$through" | head -c 300)"
  fi
elif command -v node >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  # No image here: the relay alone, into a stand-in "container" that is this computer,
  # where a small server answers with the address each connection came from.
  echo "(no image $image here: checking the relay with a stand-in; set OUTPOST_TEST_IMAGE for the real one)"
  node -e '
    require("node:http").createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => res.end(JSON.stringify({ from: req.socket.remoteAddress, forwarded: req.headers["x-forwarded-for"] ?? null, method: req.method, body })));
    }).listen(Number(process.argv[1]), "127.0.0.1");
  ' "$port" &
  server=$!
  mkdir -p "$SCRATCH/stand-in"
  cat >"$SCRATCH/stand-in/docker" <<STANDIN
#!/bin/sh
case "\$1" in
  info) exit 0 ;;
  compose) echo stand-in; exit 0 ;;
  exec) shift 3; exec node -e "\$(printf '%s' "\$3" | sed 's/connect(8080,/connect($port,/')" ;;
esac
exit 1
STANDIN
  chmod +x "$SCRATCH/stand-in/docker"
  PATH="$SCRATCH/stand-in:$PATH" bash "$REPO/deploy/pi/on-this-pi.sh" --port "$relay_port" >/dev/null 2>&1 &
  relay=$!
  for _ in $(seq 1 20); do curl -fsS -m 2 "http://localhost:$relay_port/" >/dev/null 2>&1 && break; sleep 0.5; done
  got="$(curl -fsS -m 5 -X POST --data 'hello' "http://localhost:$relay_port/api/x" 2>&1)"
  again="$(curl -fsS -m 5 "http://localhost:$relay_port/api/y" "http://localhost:$relay_port/api/z" 2>&1)"
  kill "$relay" "$server" 2>/dev/null
  wait "$relay" "$server" 2>/dev/null
  if printf '%s' "$got" | grep -q '"from":"127.0.0.1","forwarded":null,"method":"POST","body":"hello"'; then
    pass "on-this-pi: a request and its body arrive from loopback, with no forwarding header"
  else
    fail "on-this-pi: through the relay: $(printf '%s' "$got" | head -c 300)"
  fi
  if [ "$(printf '%s' "$again" | grep -o '"from":"127.0.0.1"' | wc -l | tr -d ' ')" = 2 ]; then
    pass "on-this-pi: two requests on one connection both arrive"
  else
    fail "on-this-pi: two requests on one connection: $(printf '%s' "$again" | head -c 300)"
  fi
else
  echo "skipped: on-this-pi.sh (needs Docker and the image $image, or node and curl)"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
