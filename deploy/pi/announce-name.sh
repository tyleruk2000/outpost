#!/bin/bash
# Announces this computer on the local network as NAME.local (outpost.local unless told
# otherwise), so that phones reach Outpost at http://outpost.local:8080 whatever the router
# calls the Pi.
#
# Installed by deploy/pi/install.sh as /usr/local/lib/outpost/announce-name.sh and run by
# outpost-name.service. It publishes the name with avahi-publish (from avahi-utils), which
# keeps it published for as long as it runs, for the Pi's current address on the network.
# When that address changes (a new lease, the Pi's own Wi-Fi network turned on), it
# publishes the name again for the new one. It waits on the system's own address events
# (ip monitor), so it does nothing while nothing changes.
#
# -f: wait for the Avahi daemon, and publish again if it is restarted.
# -R: no reverse entry. The address already has one, the Pi's own name, and a second would
# collide with it.
set -u

NAME="${1:-outpost.local}"

# The first IPv4 address on a network a phone could be on: not loopback, not Docker's own.
address() {
  ip -4 -o addr show scope global 2>/dev/null |
    awk '$2 !~ /^(docker|br-|veth)/ { split($4, a, "/"); print a[1]; exit }'
}

publisher=""
published=""
publish() {
  local now
  now="$(address)"
  [ "$now" = "$published" ] && [ -n "$publisher" ] && kill -0 "$publisher" 2>/dev/null && return
  [ -n "$publisher" ] && kill "$publisher" 2>/dev/null && wait "$publisher" 2>/dev/null
  publisher=""
  published="$now"
  if [ -n "$now" ]; then
    avahi-publish -f -a -R "$NAME" "$now" &
    publisher=$!
    echo "announcing $NAME at $now"
  else
    echo "no network address yet; $NAME is announced once there is one"
  fi
}

trap '[ -n "$publisher" ] && kill "$publisher" 2>/dev/null; exit 0' TERM INT

publish
# One line per change of address; each is a reason to look again.
while read -r _; do
  publish
done < <(ip -4 -o monitor address)
