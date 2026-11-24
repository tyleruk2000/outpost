#!/usr/bin/env bash
# Opens Outpost as "the computer Outpost runs on", for a browser on this Pi or for your
# own laptop through SSH, while this runs. Ctrl-C closes it again.
#
#   ./deploy/pi/on-this-pi.sh            then open http://localhost:8090 in a browser on the Pi
#
# From a laptop with no screen on the Pi: sign in with a tunnel, run it, and open
# http://localhost:8090 on the laptop. In Windows PowerShell, macOS or Linux alike:
#
#   ssh -L 8090:localhost:8090 yourname@outpost.local
#   cd outpost && ./deploy/pi/on-this-pi.sh
#
#   --port N   The port to open on this Pi (default 8090).
#   --sudo     Use the system's Docker through sudo even when `docker` works without it.
#
# Why. A few things are kept to the computer Outpost runs on, because Outpost has no
# accounts: restoring a backup, deleting stored ones, a backup passphrase, erasing
# everything, setting the clock, and some settings. In Docker no browser counts as that
# computer, not even one on the Pi: every connection reaches the container from outside
# it. Trusting the address Docker's connections come from would not be safe, because
# connections from other devices can arrive from it too: Docker's own proxy carries IPv6
# connections that way, and rootless Docker, or Docker without its firewall rules, carries
# every connection that way. So this does the one thing that is safe: it listens on this Pi's own
# loopback address only, and carries each connection into the container, where it
# reaches Outpost from the container's loopback, which only something on this Pi can do.
# Over SSH, your laptop is let in by the Pi's password or key, as you are.
#
# It changes nothing: no setting, no file, no service. It needs python3 (Raspberry Pi OS
# has it) and Outpost running.
set -euo pipefail

PORT=8090
USE_SUDO=false
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --sudo) USE_SUDO=true; shift ;;
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
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || {
  echo "--port takes a number from 1024 to 65535." >&2
  exit 2
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$REPO"
command -v python3 >/dev/null || {
  echo "This needs python3: sudo apt install -y python3" >&2
  exit 1
}

DOCKER=(docker)
if $USE_SUDO || ! docker info >/dev/null 2>&1; then DOCKER=(sudo docker); fi
container="$("${DOCKER[@]}" compose ps -q outpost 2>/dev/null | head -1 || true)"
[ -n "$container" ] || {
  echo "Outpost is not running here. Start it with: ${DOCKER[*]} compose up -d" >&2
  exit 1
}

# Inside the container: join this program's input and output to Outpost's port on loopback.
relay='const s=require("node:net").connect(8080,"127.0.0.1");process.stdin.pipe(s);s.pipe(process.stdout);s.on("error",()=>process.exit(1));s.on("close",()=>process.exit(0));'

printf '\nOutpost is open as this Pi at http://localhost:%s until you press Ctrl-C.\n' "$PORT"
printf 'Only this Pi, or a laptop signed in with ssh -L %s:localhost:%s, can reach it.\n\n' "$PORT" "$PORT"

exec python3 -I -c '
import os, socket, subprocess, sys, threading

port, command = int(sys.argv[1]), sys.argv[2:]

def write_all(fd, data):
    while data:
        data = data[os.write(fd, data):]

def serve(conn):
    child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)

    def inward():
        try:
            while True:
                data = conn.recv(65536)
                if not data:
                    break
                write_all(child.stdin.fileno(), data)
        except OSError:
            pass
        finally:
            try:
                child.stdin.close()
            except OSError:
                pass

    threading.Thread(target=inward, daemon=True).start()
    try:
        while True:
            data = os.read(child.stdout.fileno(), 65536)
            if not data:
                break
            conn.sendall(data)
    except OSError:
        pass
    finally:
        try:
            conn.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        conn.close()
        child.kill()
        child.wait()

try:
    listener = socket.create_server(("127.0.0.1", port))
except OSError as error:
    sys.exit(f"Port {port} cannot be opened here ({error.strerror}). Try another: --port {port + 1}")
try:
    while True:
        conn, _ = listener.accept()
        threading.Thread(target=serve, args=(conn,), daemon=True).start()
except KeyboardInterrupt:
    print("\nClosed.")
' "$PORT" "${DOCKER[@]}" exec -i "$container" node -e "$relay"
