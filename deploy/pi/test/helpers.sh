#!/bin/sh
# Checks that the root helpers (set-clock.sh, update.sh, decoders.sh) trust nothing in the
# folder the container writes. Runs as root inside a Debian container, with the folder
# owned by uid 1000 as on the Pi:
#
#   deploy/pi/test/run.sh
set -u
HELPERS="${1:-/pi}"
failures=0
fail() {
  echo "FAIL: $*"
  failures=$((failures + 1))
}
pass() { echo "ok: $*"; }

fresh() { # fresh NAME: an empty folder owned by the container's user, and a folder of root's to aim links at
  rm -rf /data /victim
  mkdir -p "/data/$1" /victim
  chown 1000:1000 /data "/data/$1"
  chmod 0700 /victim
}
request() { # request NAME LINE: left as the container would leave it
  printf '%s\n' "$2" >"/data/$1/request"
  chown 1000:1000 "/data/$1/request"
}

# A link named "result" (or "status.json") pointing at a folder of root's: the answer must
# replace the link, not land inside the folder it points to.
for helper in set-clock update decoders; do
  fresh "$helper"
  case "$helper" in
    set-clock)
      request "$helper" "abc12 notanumber"
      out=result
      ;;
    update)
      request "$helper" "abc12 notarelease"
      out=result
      ;;
    decoders)
      request "$helper" "refresh direwolf -"
      out=status.json
      ;;
  esac
  ln -s /victim "/data/$helper/$out"
  chown -h 1000:1000 "/data/$helper/$out"
  sh "$HELPERS/$helper.sh" "/data/$helper" /nonexistent >/dev/null 2>&1
  if [ -z "$(ls -A /victim)" ]; then
    pass "$helper: a link named $out is replaced, not followed"
  else
    fail "$helper: wrote into the folder $out pointed to: $(ls -A /victim)"
  fi
  if [ -f "/data/$helper/$out" ] && [ ! -L "/data/$helper/$out" ]; then
    pass "$helper: $out written"
  else
    fail "$helper: $out not written as a file"
  fi
  if grep -Eq '^abc12 failed |^\{"at":[0-9]+,"error":null,"decoders":\[' "/data/$helper/$out" 2>/dev/null; then
    pass "$helper: $out says what happened"
  else
    fail "$helper: $out is not the answer expected: $(head -c 200 "/data/$helper/$out" 2>/dev/null)"
  fi
  if [ "$(stat -c %u "/data/$helper/$out" 2>/dev/null)" = 1000 ]; then
    pass "$helper: $out belongs to the folder's owner"
  else
    fail "$helper: $out does not belong to the folder's owner"
  fi
done

# The request is read as the folder's owner, so a request swapped at the last moment for a
# link to a file only root may read gives nothing away. Checked here with a request the
# owner may not read.
fresh set-clock
printf 'abc12 0\n' >/data/set-clock/request
chmod 0600 /data/set-clock/request
sh "$HELPERS/set-clock.sh" /data/set-clock >/dev/null 2>&1
if [ -e /data/set-clock/result ] && grep -q '^abc12 ' /data/set-clock/result; then
  fail "set-clock: read a request its folder's owner could not read"
else
  pass "set-clock: reads the request as the folder's owner"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
