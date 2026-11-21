#!/bin/sh
# Starts and stops the radio decoders when Outpost asks: the one thing it does.
#
# NOT TESTED ON A RASPBERRY PI. Written for Raspberry Pi OS (Debian, systemd); checked only
# with sh -n, and its status output with a stand-in folder, on another computer.
#
# Installed by deploy/pi/install.sh --decoders as /usr/local/lib/outpost/decoders.sh and run
# as root by outpost-decoders.service whenever the file "request" appears in the folder
# given (the "decoders" folder in Outpost's data volume). Outpost runs in a container and
# cannot start a program on the Pi; it writes one line there:
#
#   start|stop|refresh  direwolf|readsb|ais-catcher  DEVICE|-
#
# This script reads that line and nothing else. It starts or stops one of three services
# it knows (outpost-direwolf, outpost-readsb, outpost-ais-catcher), with a device from the
# list it makes itself, and writes status.json: what is installed and running, the sound
# devices and SDRs it found, and the decoder's last lines (Dire Wolf's audio level).
#
# Every decoder it starts only listens. Dire Wolf is given a configuration with a null
# audio output, no PTT, no beacon and no digipeater, so it cannot key a radio.
#
# The folder is writable by the container, so nothing in it is trusted: the folder must be
# a real folder (not a link), the request a regular file of at most a line, each word one
# of a fixed list or a device this script listed. The folder is read and written as its
# owner, never as root, and answers are written to a new file and renamed over the old
# (mv -T), so a link left there is replaced, never followed.
set -eu

DIR="${1:?usage: decoders.sh FOLDER}"
CONF=/etc/outpost/decoders

[ -d "$DIR" ] && [ ! -L "$DIR" ] || exit 0
cd "$DIR" || exit 0
# Everything read from or written to the folder is read or written as its owner (setpriv),
# never as root, so a link swapped in reaches nothing the container could not reach itself.
owner_uid="$(stat -c %u .)"
owner_gid="$(stat -c %g .)"
as_owner() { setpriv --reuid="$owner_uid" --regid="$owner_gid" --clear-groups -- "$@"; }

# ── What is plugged in ──

# Sound devices as Dire Wolf names them on Linux: "plughw:CARD,DEVICE" (Dire Wolf's guide, "Audio Device selection – Linux ALSA").
sound_devices() {
  command -v arecord >/dev/null 2>&1 || return 0
  arecord -l 2>/dev/null | sed -n 's/^card \([0-9]*\): [^[]*\[\([^]]*\)\], device \([0-9]*\):.*/plughw:\1,\3|\2/p'
}

# RTL-SDR dongles by index, from the USB ids of the RTL2832U (0bda:2832 and 0bda:2838).
sdr_devices() {
  command -v lsusb >/dev/null 2>&1 || return 0
  lsusb 2>/dev/null | grep -Ei 'id 0bda:283[28]' | awk '{ print "sdr:" NR-1 "|RTL-SDR " NR-1 }'
}

listed() {
  { sound_devices; sdr_devices; } | cut -d'|' -f1 | grep -qxF "$1"
}

json_string() {
  # Quotes and backslashes escaped, control characters dropped.
  printf '"%s"' "$(printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')"
}

# ── The services ──

binary_of() {
  case "$1" in
    direwolf) echo direwolf ;;
    readsb) echo readsb ;;
    ais-catcher) echo AIS-catcher ;;
  esac
}

write_runner() {
  decoder="$1"
  device="$2"
  mkdir -p "$CONF"
  tmp="$(mktemp "$CONF/run.XXXXXX")"
  case "$decoder" in
    direwolf)
      case "$device" in
        sdr:*)
          frequency="$(cat "$CONF/aprs-frequency" 2>/dev/null || echo 144.80M)"
          case "$frequency" in *[!0-9.M]*) frequency=144.80M ;; esac
          printf 'ADEVICE stdin null\nACHANNELS 1\nMYCALL NOCALL\nMODEM 1200\nAGWPORT 0\nKISSPORT 8001\n' >"$CONF/direwolf.conf"
          printf '#!/bin/sh\nexec sh -c "rtl_fm -d %s -f %s - | direwolf -c %s/direwolf.conf -r 24000 -t 0 -"\n' \
            "${device#sdr:}" "$frequency" "$CONF" >"$tmp"
          ;;
        *)
          printf 'ADEVICE %s null\nACHANNELS 1\nMYCALL NOCALL\nMODEM 1200\nAGWPORT 0\nKISSPORT 8001\n' "$device" >"$CONF/direwolf.conf"
          printf '#!/bin/sh\nexec direwolf -c %s/direwolf.conf -t 0\n' "$CONF" >"$tmp"
          ;;
      esac
      ;;
    readsb)
      printf '#!/bin/sh\nexec readsb --device-type rtlsdr --device=%s --net --net-sbs-port 30003 --quiet\n' "${device#sdr:}" >"$tmp"
      ;;
    ais-catcher)
      printf '#!/bin/sh\nexec AIS-catcher -d:%s -S 10110\n' "${device#sdr:}" >"$tmp"
      ;;
  esac
  chmod 0755 "$tmp"
  mv -f "$tmp" "$CONF/$decoder.run"
  printf '%s\n' "$device" >"$CONF/$decoder.device"
}

# ── The request ──

error=""
if [ -L request ] || { [ -e request ] && [ ! -f request ]; }; then
  rm -rf request
elif [ -f request ]; then
  line="$(as_owner head -c 200 request | head -n 1)" || line=""
  rm -f request
  action="$(printf '%s' "$line" | cut -d' ' -f1)"
  decoder="$(printf '%s' "$line" | cut -d' ' -f2)"
  device="$(printf '%s' "$line" | cut -d' ' -f3)"
  case "$decoder" in direwolf | readsb | ais-catcher) ;; *) decoder="" ;; esac
  if [ -n "$decoder" ]; then
    case "$action" in
      start)
        if ! command -v "$(binary_of "$decoder")" >/dev/null 2>&1; then
          error="$decoder is not installed on this Pi."
        elif ! listed "$device"; then
          error="That device is not plugged in now. Look again and choose from the list."
        else
          # One SDR cannot serve two decoders: whatever else holds it is stopped first.
          for other in direwolf readsb ais-catcher; do
            [ "$other" = "$decoder" ] && continue
            if [ "$(cat "$CONF/$other.device" 2>/dev/null || true)" = "$device" ]; then systemctl stop "outpost-$other.service" || true; fi
          done
          write_runner "$decoder" "$device"
          systemctl restart "outpost-$decoder.service" || error="$decoder did not start: see journalctl -u outpost-$decoder."
        fi
        ;;
      stop) systemctl stop "outpost-$decoder.service" || true ;;
      refresh) ;;
    esac
  fi
fi

# ── What Outpost is told ──

{
  printf '{"at":%s,"error":%s,"decoders":[' "$(date +%s)" "$(if [ -n "$error" ]; then json_string "$error"; else echo null; fi)"
  first=true
  for decoder in direwolf readsb ais-catcher; do
    $first || printf ','
    first=false
    installed=false
    command -v "$(binary_of "$decoder")" >/dev/null 2>&1 && installed=true
    running=false
    systemctl is-active --quiet "outpost-$decoder.service" && running=true
    device="$(cat "$CONF/$decoder.device" 2>/dev/null || true)"
    printf '{"id":"%s","installed":%s,"running":%s,"device":%s,"log":[' "$decoder" "$installed" "$running" \
      "$(if [ -n "$device" ]; then json_string "$device"; else echo null; fi)"
    lines=true
    if $running; then
      journalctl -u "outpost-$decoder.service" -n 20 --no-pager -o cat 2>/dev/null | cut -c1-200 | while IFS= read -r entry; do
        $lines || printf ','
        lines=false
        json_string "$entry"
      done
    fi
    printf ']}'
  done
  printf '],"devices":['
  first=true
  { sound_devices | sed 's/$/|sound/'; sdr_devices | sed 's/$/|sdr/'; } | while IFS='|' read -r id name kind; do
    $first || printf ','
    first=false
    printf '{"id":%s,"name":%s,"kind":"%s"}' "$(json_string "$id")" "$(json_string "$name")" "$kind"
  done
  printf ']}\n'
} | as_owner sh -c 'umask 022; tmp="$(mktemp status.XXXXXX)" && cat >"$tmp" && chmod 0644 "$tmp" && mv -fT "$tmp" status.json'
