#!/bin/sh
# Sets this computer's clock when Outpost asks: the one thing it does.
#
# Installed by deploy/pi/install.sh as /usr/local/lib/outpost/set-clock.sh and run as root
# by outpost-clock.service whenever the file "request" appears in the folder given (the
# "clock" folder in Outpost's data volume). Outpost, which runs in a container and cannot
# set the clock itself, writes one line there: an id and a number of milliseconds to move
# the clock by. This script reads that line and nothing else, moves the clock, and writes
# "<id> ok" or "<id> failed <reason>" to "result" for Outpost to read.
#
# The folder is writable by the container, so nothing in it is trusted: the folder must be
# a real folder (not a link), the request a regular file of at most a line, the id letters
# and digits, the amount a whole number of at most a hundred years. The answer is written
# to a new file and renamed into place, so a link left there by the container is replaced,
# never followed.
set -eu

DIR="${1:?usage: set-clock.sh FOLDER}"
LIMIT_MS=3155760000000 # 100 years

[ -d "$DIR" ] && [ ! -L "$DIR" ] || exit 0
cd "$DIR" || exit 0
# Every step below is relative to the folder reached, whatever happens to the name later.
if [ -L request ] || { [ -e request ] && [ ! -f request ]; }; then
  # Not a plain file: removed unread (a link itself, not what it points to), so that it does not set the service off again.
  rm -rf request
  exit 0
fi
[ -f request ] || exit 0
line="$(head -c 100 request | head -n 1)"
rm -f request

id="${line%% *}"
offset="${line#* }"
answer() {
  tmp="$(mktemp result.XXXXXX)"
  printf '%s %s\n' "$id" "$1" >"$tmp"
  owner="$(stat -c '%u:%g' .)"
  chown "$owner" "$tmp" 2>/dev/null || true
  chmod 0644 "$tmp"
  mv -f "$tmp" result
}

case "$id" in '' | *[!A-Za-z0-9]*) exit 0 ;; esac
case "$offset" in
  -*) magnitude="${offset#-}" ;;
  *) magnitude="$offset" ;;
esac
case "$magnitude" in '' | *[!0-9]*)
  answer "failed the request was not a number of milliseconds"
  exit 0
  ;;
esac
if [ "${#magnitude}" -gt 13 ] || [ "$magnitude" -gt "$LIMIT_MS" ]; then
  answer "failed the change asked for was more than a hundred years"
  exit 0
fi

now_ms="$(date +%s%3N)"
target_ms=$((now_ms + offset))
if message="$(date -u -s "@$((target_ms / 1000)).$(printf '%03d' $((target_ms % 1000)))" 2>&1)"; then
  # A clock chip (the Raspberry Pi 5 has one) keeps the new time over a restart, if it has a battery.
  if [ -e /dev/rtc0 ] && command -v hwclock >/dev/null 2>&1; then hwclock --systohc 2>/dev/null || true; fi
  logger -t outpost-clock "clock moved by ${offset} ms at Outpost's request" 2>/dev/null || true
  answer ok
else
  answer "failed $(printf '%s' "$message" | tr '\n' ' ' | head -c 200)"
fi
