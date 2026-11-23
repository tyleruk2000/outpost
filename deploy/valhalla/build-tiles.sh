#!/usr/bin/env bash
# Builds streets for routes (Valhalla tiles) from a folder of country files, on any
# computer with Docker, without Outpost running. Not needed on a Raspberry Pi: Outpost
# builds them itself there (Offline maps → Map data). Use this to build on another
# computer, or to keep a build out of the way of a busy Pi.
#
#   deploy/valhalla/build-tiles.sh FOLDER [NAME]
#
#   FOLDER  holds one or more .osm.pbf files (Geofabrik's country files). Several are
#           joined into one set of streets; neighbouring countries should be built together.
#   NAME    what Outpost calls the result (default: the folder's name).
#
# Writes FOLDER/streets-YYYY-MM-DD.tar and FOLDER/streets-YYYY-MM-DD.json beside the
# country files. Put both in Outpost's storage and import them from Map data. Nothing is
# fetched from the internet except the Valhalla image the first time (by `docker build`).
#
# Measured for Great Britain (2.2 GB): about an hour and 2.3 GB of memory on a Raspberry
# Pi 5 with two threads; the tar is 2.7 GB. See docs/development/street-routes-measurements.md.
#
#   VALHALLA_BUILD_THREADS=2   threads to build with
set -euo pipefail

[ "$#" -ge 1 ] || { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
FOLDER="$(cd "$1" && pwd)"
NAME="${2:-$(basename "$FOLDER")}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
IMAGE="${OUTPOST_VALHALLA_IMAGE:-outpost-valhalla:local}"
DOCKER=(docker)
docker info >/dev/null 2>&1 || DOCKER=(sudo docker)

shopt -s nullglob
files=("$FOLDER"/*.osm.pbf)
[ "${#files[@]}" -gt 0 ] || { echo "There are no .osm.pbf files in $FOLDER." >&2; exit 1; }

"${DOCKER[@]}" image inspect "$IMAGE" >/dev/null 2>&1 || "${DOCKER[@]}" build -t "$IMAGE" "$REPO/docker/valhalla"

stamp="$(date +%Y-%m-%d)"
inside=()
for f in "${files[@]}"; do inside+=("/in/$(basename "$f")"); done
echo "Building streets for $NAME from ${#files[@]} file(s). This takes a while (about an hour for Great Britain on a Pi 5)."
start=$(date +%s)
"${DOCKER[@]}" run --rm --user "$(id -u):$(id -g)" \
  -e VALHALLA_BUILD_THREADS="${VALHALLA_BUILD_THREADS:-2}" \
  -v "$FOLDER:/in" \
  "$IMAGE" build "/in/.streets-work" "$NAME" "${inside[@]}"
mv "$FOLDER/.streets-work/tiles.tar" "$FOLDER/streets-$stamp.tar"
mv "$FOLDER/.streets-work/tileset.json" "$FOLDER/streets-$stamp.json"
rm -rf "$FOLDER/.streets-work"
echo "Done in $(( ($(date +%s) - start) / 60 )) min: $FOLDER/streets-$stamp.tar"
