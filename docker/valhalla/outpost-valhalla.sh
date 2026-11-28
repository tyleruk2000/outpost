#!/usr/bin/env bash
# Outpost's streets sidecar: builds Valhalla tiles from country files already on this
# computer and serves them to Outpost. It never fetches anything from the internet.
#
#   outpost-valhalla.sh serve              serve /tiles/current, and build or import when asked
#   outpost-valhalla.sh build OUT NAME PBF...   build once into the folder OUT (for build-tiles.sh)
#   outpost-valhalla.sh health             for the container's health check
#   outpost-valhalla.sh priority           the priority builds run at here ("nice -n 19 ionice -c 3")
#
# Asking, in /tiles (the valhalla-tiles volume, which Outpost also mounts):
#   request.json   written by Outpost, one of
#                  {"id": "...", "name": "United Kingdom", "extracts": ["/storage/internal/…/great-britain.osm.pbf", …],
#                   "regions": [{"regionId", "name", "country", "dataDate"}, …],   optional, copied into tileset.json
#                   "work": "/storage/usb-ssd/outpost-streets-work"}                 optional, see below
#                  {"id": "...", "name": "United Kingdom", "import": "/storage/internal/…/streets-2026-11-23.tar"}
#                  {"id": "...", "remove": true}   stops serving and deletes the streets in use
#                  Taken once: it is renamed to last-request.json when work starts.
#                  "work" puts a build's working files (and its ~50 GB of writes for Great Britain)
#                  in that folder instead of /tiles/work: a USB SSD rather than an SD card. Its
#                  last part must be "outpost-streets-work" (it is deleted afterwards), and the
#                  storage it is on must be mounted read-write in this service.
#   cancel         an empty file: stops a build under way (the tiles in use stay).
# Answering:
#   status.json    {"state": "idle"|"building"|"ready"|"failed", "id", "name", "stage", "message",
#                   "startedAt", "finishedAt", "current": tileset.json or null}
#   current/       tiles.tar, valhalla.json, tileset.json: what is served
#                  tileset.json: {"name", "extracts": [{"file", "bytes"}], "builtAt", "tarBytes", "valhalla", "regions"}
#
# A build works in /tiles/work and replaces current/ only when it has finished; a failed
# or stopped build leaves the tiles in use as they were. Measured on a Raspberry Pi 5
# (8 GB): Great Britain takes about an hour with two threads and writes about 53 GB to
# the disk it works on; see docs/development/street-routes-measurements.md.
set -euo pipefail

HOME_DIR="${VALHALLA_HOME:-/tiles}"
BUILD_THREADS="${VALHALLA_BUILD_THREADS:-2}"
SERVE_THREADS="${VALHALLA_SERVE_THREADS:-2}"
# Stop a build when the computer has less memory than this left (MB), so that Outpost
# and everything else on it keep working.
MIN_AVAILABLE_MB="${VALHALLA_MIN_AVAILABLE_MB:-800}"
PORT=8002

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
now_ms() { python3 -c 'import time; print(int(time.time() * 1000))'; }

# write_status STATE STAGE MESSAGE: status.json, written whole and renamed into place.
STATUS_ID=""
STATUS_NAME=""
STATUS_STARTED=null
STATUS_FINISHED=null
write_status() {
  STATE="$1" STAGE="$2" MESSAGE="$3" ID="$STATUS_ID" NAME="$STATUS_NAME" \
    STARTED="$STATUS_STARTED" FINISHED="$STATUS_FINISHED" HOME_DIR="$HOME_DIR" python3 - <<'EOF'
import json, os
home = os.environ["HOME_DIR"]
current = None
try:
    with open(os.path.join(home, "current", "tileset.json")) as f:
        current = json.load(f)
except (OSError, ValueError):
    pass
def num(key):
    value = os.environ.get(key, "null")
    return None if value == "null" else int(value)
status = {
    "state": os.environ["STATE"],
    "id": os.environ["ID"] or None,
    "name": os.environ["NAME"] or None,
    "stage": os.environ["STAGE"] or None,
    "message": os.environ["MESSAGE"] or None,
    "startedAt": num("STARTED"),
    "finishedAt": num("FINISHED"),
    "current": current,
}
tmp = os.path.join(home, "status.json.part")
with open(tmp, "w") as f:
    json.dump(status, f)
os.replace(tmp, os.path.join(home, "status.json"))
EOF
}

# write_config DIR: a Valhalla configuration reading DIR/tiles.tar, with nothing fetched:
# no timezones, no elevation, no traffic. Reachable areas go up to 8 hours on foot, so the
# longest isochrone allowed is 480 minutes (Valhalla's default is 120), at most 4 at once
# (Outpost asks for 3). Written again every time the service starts, so a rebuilt image
# takes it up over the tiles already built.
write_config() {
  local dir="$1"
  valhalla_build_config \
    --mjolnir-tile-dir "$dir/tiles" \
    --mjolnir-tile-extract "$dir/tiles.tar" \
    --mjolnir-admin "$dir/admins.sqlite" \
    --mjolnir-timezone "$dir/no-timezones.sqlite" \
    --mjolnir-traffic-extract "" \
    --additional-data-elevation "" \
    --mjolnir-concurrency "$BUILD_THREADS" \
    --httpd-service-listen "tcp://*:$PORT" \
    --httpd-service-loopback "ipc:///tmp/loopback" \
    --httpd-service-interrupt "ipc:///tmp/interrupt" \
    --httpd-service-drain-seconds 1 \
    --httpd-service-shutdown-seconds 1 \
    --service-limits-isochrone-max-time-contour 480 \
    --service-limits-isochrone-max-contours 4 \
    >"$dir/valhalla.json"
}

# low_priority: PRIORITY, the words put before each step of a build so that it gives way to
# Outpost and everything else on the computer: `nice -n 19` (the lowest processor
# priority) and `ionice -c 3` (the disk only when nothing else wants it; a Pi took 30 s to
# answer a health check while Great Britain was being packed). Each only where it is there
# and allowed: a system without one, or a container that refuses it, builds without it.
PRIORITY=()
low_priority() {
  PRIORITY=()
  if command -v nice >/dev/null 2>&1 && nice -n 19 true >/dev/null 2>&1; then PRIORITY+=(nice -n 19); fi
  if command -v ionice >/dev/null 2>&1 && ionice -c 3 true >/dev/null 2>&1; then PRIORITY+=(ionice -c 3); fi
}

# run_stage DIR STAGE MESSAGE COMMAND...: one step of a build, at low priority, stopped
# when cancelled or when memory runs short. Returns 0, or 1 with REASON set.
REASON=""
run_stage() {
  local dir="$1" stage="$2" message="$3"
  shift 3
  [ -n "$STATUS_ID" ] && write_status building "$stage" "$message"
  log "$stage: $message"
  ${PRIORITY[@]+"${PRIORITY[@]}"} "$@" >>"$dir/build.log" 2>&1 &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ -e "$HOME_DIR/cancel" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      REASON="Stopped."
      return 1
    fi
    local available
    available=$(awk '/MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)
    if [ "$available" -lt "$MIN_AVAILABLE_MB" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      REASON="Stopped because this computer was running short of memory (${available} MB left). Try a smaller area, or fewer threads (VALHALLA_BUILD_THREADS)."
      return 1
    fi
    sleep 5
  done
  if ! wait "$pid"; then
    REASON="Valhalla stopped at \"$stage\": $(tail -n 3 "$dir/build.log" | tr '\n' ' ' | cut -c1-400)"
    return 1
  fi
}

# build OUT NAME PBF...: tiles.tar, valhalla.json and tileset.json in OUT.
build() {
  local out="$1" name="$2"
  shift 2
  local extracts=("$@") total=0 file
  [ "${#extracts[@]}" -gt 0 ] || { REASON="No country files were given."; return 1; }
  for file in "${extracts[@]}"; do
    [ -r "$file" ] || { REASON="The country file $file cannot be read."; return 1; }
    total=$((total + $(stat -c %s "$file")))
  done
  mkdir -p "$out"
  : >"$out/build.log"
  # A Pi 5 building Great Britain (2.2 GB) ended with 5.2 GB in its work folder; ask for
  # three times the country files, and more when several are joined.
  local need=$((total * 3)) free
  [ "${#extracts[@]}" -gt 1 ] && need=$((total * 4))
  free=$(df -B1 --output=avail "$out" | tail -n 1)
  if [ "$free" -lt "$need" ]; then
    REASON="Not enough free space: building needs about $((need / 1000000000 + 1)) GB, and $((free / 1000000000)) GB is free."
    return 1
  fi
  write_config "$out"
  local pbf="${extracts[0]}"
  if [ "${#extracts[@]}" -gt 1 ]; then
    pbf="$out/joined.osm.pbf"
    run_stage "$out" merge "Joining ${#extracts[@]} country files" osmium merge --overwrite -o "$pbf" "${extracts[@]}" || return 1
  fi
  run_stage "$out" admins "Reading boundaries" valhalla_build_admins -c "$out/valhalla.json" "$pbf" || return 1
  run_stage "$out" tiles "Building streets (the long part)" valhalla_build_tiles -c "$out/valhalla.json" "$pbf" || return 1
  run_stage "$out" extract "Packing tiles" valhalla_build_extract -c "$out/valhalla.json" --overwrite || return 1
  rm -rf "$out/tiles" "$out/joined.osm.pbf" "$out/admins.sqlite"
  NAME="$name" OUT="$out" REQUEST="${REQUEST_FILE:-}" python3 - "${extracts[@]}" <<'EOF'
import json, os, sys, time
out = os.environ["OUT"]
regions = []
try:
    regions = json.load(open(os.environ["REQUEST"])).get("regions") or []
except (OSError, ValueError, KeyError, AttributeError):
    pass
tileset = {
    "name": os.environ["NAME"],
    "extracts": [{"file": os.path.basename(p), "bytes": os.path.getsize(p)} for p in sys.argv[1:]],
    "builtAt": int(time.time() * 1000),
    "tarBytes": os.path.getsize(os.path.join(out, "tiles.tar")),
    "valhalla": "3.9.3",
    "regions": regions if isinstance(regions, list) else [],
}
with open(os.path.join(out, "tileset.json"), "w") as f:
    json.dump(tileset, f, indent=1)
EOF
}

# import_tar OUT NAME TAR: a tiles.tar built elsewhere (deploy/valhalla/build-tiles.sh).
import_tar() {
  local out="$1" name="$2" tar="$3"
  [ -r "$tar" ] || { REASON="The file $tar cannot be read."; return 1; }
  mkdir -p "$out"
  : >"$out/build.log"
  write_config "$out"
  run_stage "$out" import "Copying the tiles" cp "$tar" "$out/tiles.tar" || return 1
  local manifest="${tar%.tar}.json"
  if [ -r "$manifest" ]; then
    cp "$manifest" "$out/tileset.json"
  else
    NAME="$name" OUT="$out" python3 -c 'import json, os, time; out = os.environ["OUT"]; json.dump({"name": os.environ["NAME"], "extracts": [], "builtAt": int(time.time() * 1000), "tarBytes": os.path.getsize(os.path.join(out, "tiles.tar")), "valhalla": None}, open(os.path.join(out, "tileset.json"), "w"))'
  fi
  # A file that is not a tar fails here rather than after the swap.
  tar -tf "$out/tiles.tar" >/dev/null 2>&1 || { REASON="$tar is not a tiles file."; return 1; }
}

SERVICE_PID=""
start_service() {
  if [ -r "$HOME_DIR/current/tiles.tar" ]; then
    write_config "$HOME_DIR/current"
    valhalla_service "$HOME_DIR/current/valhalla.json" "$SERVE_THREADS" &
    SERVICE_PID=$!
    log "serving $(cat "$HOME_DIR/current/tileset.json" 2>/dev/null | tr -d '\n' | cut -c1-200)"
  fi
}
stop_service() {
  if [ -n "$SERVICE_PID" ]; then
    kill "$SERVICE_PID" 2>/dev/null || true
    wait "$SERVICE_PID" 2>/dev/null || true
    SERVICE_PID=""
  fi
}

handle_request() {
  local request="$HOME_DIR/request.json"
  mv "$request" "$HOME_DIR/last-request.json"
  rm -f "$HOME_DIR/cancel"
  local fields
  fields=$(python3 -c '
import json, sys
r = json.load(open(sys.argv[1]))
print(str(r.get("id") or ""))
print(str(r.get("name") or "Streets"))
print(str(r.get("import") or ""))
print(str(r.get("work") or ""))
print("yes" if r.get("remove") is True else "")
for p in r.get("extracts") or []:
    print(str(p))
' "$HOME_DIR/last-request.json" 2>/dev/null) || {
    STATUS_ID="" STATUS_NAME="" STATUS_STARTED=null STATUS_FINISHED=null
    write_status failed "" "The request could not be read."
    return
  }
  local id name import_from work_from remove
  local -a extracts=()
  { read -r id; read -r name; read -r import_from; read -r work_from; read -r remove; while read -r line; do extracts+=("$line"); done; } <<<"$fields"
  STATUS_ID="$id" STATUS_NAME="$name" STATUS_STARTED=$(now_ms) STATUS_FINISHED=null
  if [ "$remove" = "yes" ]; then
    write_status building remove "Removing the streets"
    stop_service
    rm -rf "$HOME_DIR/current" "$HOME_DIR/previous"
    STATUS_FINISHED=$(now_ms)
    log "removed the streets in use"
    write_status idle "" ""
    return
  fi
  local work="$HOME_DIR/work"
  REASON=""
  local ok=true
  if [ -n "$work_from" ] && [ -z "$import_from" ]; then
    # Another disk for the working files: Outpost's own folder there, never anything else.
    if [ "$(basename "$work_from")" != "outpost-streets-work" ]; then
      ok=false
      REASON="The work folder must be called outpost-streets-work."
    elif ! mkdir -p "$work_from" 2>/dev/null || ! touch "$work_from/.writable" 2>/dev/null; then
      ok=false
      REASON="The streets service cannot write to $(dirname "$work_from"). If the NAS was connected with deploy/pi/nas-share.sh, run that script again with the same options, then docker compose up -d: it now lets the streets service write there. Otherwise mount that storage read-write in the valhalla service in compose.nas.yaml or compose.override.yaml, or choose This device's own disk under Where it works."
    else
      rm -f "$work_from/.writable"
      work="$work_from/build"
    fi
  fi
  rm -rf "$work"
  if $ok; then
    if [ -n "$import_from" ]; then
      import_tar "$work" "$name" "$import_from" || ok=false
    else
      REQUEST_FILE="$HOME_DIR/last-request.json" build "$work" "$name" "${extracts[@]}" || ok=false
    fi
  fi
  # Built on another disk: bring the finished streets onto the streets' volume before the swap.
  if $ok && [ "$work" != "$HOME_DIR/work" ]; then
    rm -rf "$HOME_DIR/work"
    mkdir -p "$HOME_DIR/work"
    if run_stage "$HOME_DIR/work" swap "Copying the new streets" cp "$work/tiles.tar" "$work/tileset.json" "$HOME_DIR/work/"; then
      cp "$work/build.log" "$HOME_DIR/work/build.log" 2>/dev/null || true
      rm -rf "$work"
      work="$HOME_DIR/work"
    else
      ok=false
    fi
  fi
  STATUS_FINISHED=$(now_ms)
  if ! $ok; then
    log "failed: $REASON"
    cp "$work/build.log" "$HOME_DIR/last-build.log" 2>/dev/null || true
    rm -rf "$work"
    write_status failed "" "$REASON"
    return
  fi
  # Swap: the old tiles go only once the new ones are in place.
  write_status building swap "Starting the new streets"
  stop_service
  rm -rf "$HOME_DIR/previous"
  [ -d "$HOME_DIR/current" ] && mv "$HOME_DIR/current" "$HOME_DIR/previous"
  mv "$work" "$HOME_DIR/current"
  cp "$HOME_DIR/current/build.log" "$HOME_DIR/last-build.log" 2>/dev/null || true
  rm -rf "$HOME_DIR/previous"
  start_service
  write_status ready "" ""
}

serve() {
  mkdir -p "$HOME_DIR"
  # Outpost (another container, as OUTPOST_UID, 1000 by default) leaves its requests here, so
  # it must be able to write in this folder. This service runs as root and keeps writing.
  chown "${OUTPOST_UID:-1000}:${OUTPOST_GID:-1000}" "$HOME_DIR" 2>/dev/null || true
  chmod 0775 "$HOME_DIR" 2>/dev/null || true
  rm -rf "$HOME_DIR/work" "$HOME_DIR/status.json.part"
  # A swap cut short: previous/ is the last complete set.
  if [ ! -d "$HOME_DIR/current" ] && [ -d "$HOME_DIR/previous" ]; then mv "$HOME_DIR/previous" "$HOME_DIR/current"; fi
  trap 'stop_service; exit 0' TERM INT
  start_service
  if [ -n "$SERVICE_PID" ]; then write_status ready "" ""; else write_status idle "" ""; fi
  while true; do
    if [ -e "$HOME_DIR/request.json" ]; then
      handle_request
    fi
    if [ -n "$SERVICE_PID" ] && ! kill -0 "$SERVICE_PID" 2>/dev/null; then
      log "valhalla_service stopped; starting it again"
      SERVICE_PID=""
      start_service
    fi
    sleep 5 &
    wait $! || true
  done
}

health() {
  if [ -r "$HOME_DIR/current/tiles.tar" ] && [ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("state"))' "$HOME_DIR/status.json" 2>/dev/null)" = "ready" ]; then
    curl -fsS -m 4 "http://127.0.0.1:$PORT/status" >/dev/null
  fi
}

low_priority
case "${1:-serve}" in
  serve)
    log "builds run at: ${PRIORITY[*]:-normal priority (neither nice nor ionice can be used here)}"
    serve
    ;;
  priority) printf '%s\n' "${PRIORITY[*]:-}" ;;
  build)
    shift
    [ "$#" -ge 3 ] || { echo "usage: outpost-valhalla.sh build OUT NAME PBF..." >&2; exit 2; }
    out="$1" name="$2"
    shift 2
    if build "$out" "$name" "$@"; then
      log "built $out/tiles.tar"
    else
      log "failed: $REASON"
      exit 1
    fi
    ;;
  health) health ;;
  *)
    echo "usage: outpost-valhalla.sh serve | build OUT NAME PBF... | health | priority" >&2
    exit 2
    ;;
esac
