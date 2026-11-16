#!/usr/bin/env bash
# Turns a Raspberry Pi's Wi-Fi into a network of its own, so phones can join the Pi
# directly and open Outpost with no router and no internet.
#
# NOT TESTED ON A RASPBERRY PI. It was written from NetworkManager's documentation and
# source and checked only for syntax and with --dry-run on another computer. Read it
# before running it. If you are connected to the Pi over Wi-Fi, turning the hotspot on
# cuts that connection: use a screen and keyboard, or Ethernet.
#
#   sudo ./deploy/pi/hotspot.sh on [--ssid NAME] [--interface wlan0] [--yes] [--dry-run]
#   sudo ./deploy/pi/hotspot.sh off
#   sudo ./deploy/pi/hotspot.sh status
#
# What "on" does, using NetworkManager (Raspberry Pi OS Bookworm and later):
#   - makes a connection called "outpost-hotspot": a WPA2 access point on the Wi-Fi
#     interface, with the Pi at 10.42.0.1 handing out addresses to whoever joins;
#   - sets it to start by itself at boot;
#   - gives the Pi the name outpost.home.arpa on that network.
# While it is on, that interface cannot also join your home Wi-Fi. If the Pi has
# internet over Ethernet, NetworkManager shares it with whoever joins the hotspot.
#
# The password is asked for and typed unseen (or taken from OUTPOST_HOTSPOT_PASSWORD).
# This script writes it nowhere; NetworkManager keeps it in its own connection file,
# which only root can read. It is the only thing between the network and Outpost,
# which has no accounts: anyone who joins can read, change and delete what is in it.
#
# "off" removes the connection and the name, and nothing else.
set -euo pipefail

CONNECTION="outpost-hotspot"
ADDRESS="10.42.0.1"
NAME="outpost.home.arpa"
# NetworkManager starts its own dnsmasq for a shared connection and reads this folder.
DNS_DIR="/etc/NetworkManager/dnsmasq-shared.d"
DNS_FILE="$DNS_DIR/outpost.conf"

ACTION="${1:-}"
[ $# -gt 0 ] && shift
SSID="Outpost"
INTERFACE="wlan0"
YES=false
DRY_RUN=false
while [ $# -gt 0 ]; do
  case "$1" in
    --ssid)
      SSID="${2:-}"
      shift 2
      ;;
    --interface)
      INTERFACE="${2:-}"
      shift 2
      ;;
    --yes)
      YES=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

stop() {
  printf '%s\n' "$*" >&2
  exit 1
}
run() {
  if $DRY_RUN; then
    # The password is never printed.
    printf '  would run:'
    local hide=false
    for word in "$@"; do
      if $hide; then
        printf ' ********'
        hide=false
      else
        printf ' %s' "$word"
        [ "$word" = "wifi-sec.psk" ] && hide=true
      fi
    done
    printf '\n'
  else
    "$@"
  fi
}
need_root() { $DRY_RUN || [ "$(id -u)" -eq 0 ] || stop "Run this with sudo."; }
need_nm() {
  $DRY_RUN && return 0
  command -v nmcli >/dev/null || stop "nmcli was not found. This script needs NetworkManager (Raspberry Pi OS Bookworm or later)."
  nmcli -t -f RUNNING general 2>/dev/null | grep -q '^running$' || stop "NetworkManager is not running."
}

case "$ACTION" in
  on)
    need_root
    need_nm
    [ -n "$SSID" ] && [ "${#SSID}" -le 32 ] || stop "The network name must be 1 to 32 characters."
    if ! $DRY_RUN; then
      nmcli -t -f DEVICE,TYPE device | grep -q "^${INTERFACE}:wifi$" || stop "$INTERFACE is not a Wi-Fi interface on this computer. Name yours with --interface."
      # A Raspberry Pi keeps its Wi-Fi off until it knows which country it is in.
      if command -v raspi-config >/dev/null; then
        country="$(raspi-config nonint get_wifi_country 2>/dev/null || true)"
        [ -n "$country" ] || stop "The Wi-Fi country is not set. Set it first: sudo raspi-config nonint do_wifi_country GB (with your own country code)."
      fi
    fi

    password="${OUTPOST_HOTSPOT_PASSWORD:-}"
    if [ -z "$password" ]; then
      [ -t 0 ] || stop "No password given. Run this in a terminal, or set OUTPOST_HOTSPOT_PASSWORD."
      read -r -s -p "Password for the \"$SSID\" network (8 to 63 characters): " password
      echo
      read -r -s -p "Again: " again
      echo
      [ "$password" = "$again" ] || stop "The two did not match."
    fi
    [ "${#password}" -ge 8 ] && [ "${#password}" -le 63 ] || stop "The password must be 8 to 63 characters."

    if ! $YES && ! $DRY_RUN; then
      echo "This turns $INTERFACE into the \"$SSID\" network. It will leave any Wi-Fi network it is on now,"
      echo "and if you are connected to this Pi over that Wi-Fi you will be cut off."
      read -r -p "Go ahead? [y/N] " answer
      case "$answer" in y | Y | yes | Yes) ;; *) stop "Nothing was changed." ;; esac
    fi

    run mkdir -p "$DNS_DIR"
    if $DRY_RUN; then
      echo "  would write $DNS_FILE: address=/$NAME/$ADDRESS"
    else
      printf '# Written by Outpost deploy/pi/hotspot.sh; removed by "hotspot.sh off".\naddress=/%s/%s\n' "$NAME" "$ADDRESS" >"$DNS_FILE"
    fi

    # Start again from nothing, so a changed name or password takes effect.
    if ! $DRY_RUN && nmcli -t -f NAME connection show | grep -qx "$CONNECTION"; then
      nmcli connection delete "$CONNECTION" >/dev/null
    fi
    # The password is on nmcli's command line for the moment this takes, where other
    # users signed in to this Pi could see it. nmcli offers no other way to store one.
    run nmcli connection add type wifi ifname "$INTERFACE" con-name "$CONNECTION" \
      autoconnect yes connection.autoconnect-priority 100 \
      ssid "$SSID" 802-11-wireless.mode ap 802-11-wireless.band bg \
      ipv4.method shared ipv4.addresses "$ADDRESS/24" ipv6.method disabled \
      wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$password"
    run nmcli connection up "$CONNECTION"

    echo
    echo "The \"$SSID\" network is on. Join it from a phone, then open:"
    echo "  http://$ADDRESS:8080"
    echo "  http://$NAME:8080"
    echo "Outpost must be shared with the network for either to answer (./deploy/pi/install.sh --lan)."
    echo "A phone may say this network has no internet and ask whether to stay on it: stay."
    echo "Turn it off again with: sudo $0 off"
    ;;

  off)
    need_root
    need_nm
    if $DRY_RUN || nmcli -t -f NAME connection show | grep -qx "$CONNECTION"; then
      run nmcli connection down "$CONNECTION" || true
      run nmcli connection delete "$CONNECTION"
    else
      echo "There is no \"$CONNECTION\" connection."
    fi
    # Only the file this script wrote.
    if [ -f "$DNS_FILE" ] && grep -q "deploy/pi/hotspot.sh" "$DNS_FILE"; then run rm -f "$DNS_FILE"; fi
    echo "The hotspot is off. $INTERFACE will rejoin a Wi-Fi network it knows by itself."
    ;;

  status)
    need_nm
    if $DRY_RUN; then
      echo "  would run: nmcli connection show $CONNECTION"
    elif nmcli -t -f NAME connection show --active | grep -qx "$CONNECTION"; then
      echo "On: $(nmcli -g 802-11-wireless.ssid connection show "$CONNECTION") at http://$ADDRESS:8080"
    elif nmcli -t -f NAME connection show | grep -qx "$CONNECTION"; then
      echo "Set up but not on. Start it with: sudo nmcli connection up $CONNECTION"
    else
      echo "Off."
    fi
    ;;

  *)
    sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
