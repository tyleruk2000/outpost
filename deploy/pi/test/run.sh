#!/bin/sh
# Runs deploy/pi/test/helpers.sh as root in a Debian container, with no network.
set -eu
HERE="$(cd "$(dirname "$0")/.." && pwd)"
exec docker run --rm --network none -v "$HERE:/pi:ro" "${OUTPOST_TEST_IMAGE:-debian:bookworm-slim}" sh /pi/test/helpers.sh /pi
