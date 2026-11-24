# Sourced by install.sh and nas-share.sh (bash), not run on its own.
#
# Keeps COMPOSE_FILE in .env naming every Compose file the scripts write, whichever ran
# first. Once COMPOSE_FILE is set, Compose stops reading compose.override.yaml by itself,
# so a file left out is silently ignored (install.sh --https after nas-share.sh used to
# leave the HTTPS port unpublished that way).
#
# compose_files_sync DRY_RUN [FILE...]: run in the checkout. FILEs are counted as here
# already (for a dry run, before they are written). Sets COMPOSE_FILE to compose.yaml,
# then compose.override.yaml and compose.nas.yaml where each is here, then any other
# files it already named, in their order. With nothing but compose.yaml and the override,
# and no COMPOSE_FILE line yet, it adds none: Compose reads those two by itself.
# DRY_RUN=true prints what it would set instead. Prints nothing when nothing changes.

compose_files_sync() {
  local dry_run="${1:-false}" current wanted part
  shift || true
  local coming=" $* "
  _compose_file_here() { [ -f "$1" ] || [[ "$coming" == *" $1 "* ]]; }
  current="$(grep '^COMPOSE_FILE=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  wanted="compose.yaml"
  _compose_file_here compose.override.yaml && wanted="$wanted:compose.override.yaml"
  _compose_file_here compose.nas.yaml && wanted="$wanted:compose.nas.yaml"
  local IFS=:
  for part in $current; do
    [ -n "$part" ] || continue
    case ":$wanted:" in *":$part:"*) ;; *) wanted="$wanted:$part" ;; esac
  done
  unset IFS
  [ "$wanted" = "$current" ] && return 0
  if [ -z "$current" ]; then
    case "$wanted" in compose.yaml | compose.yaml:compose.override.yaml) return 0 ;; esac
  fi
  if [ "$dry_run" = true ]; then
    printf '  would set COMPOSE_FILE=%s in .env\n' "$wanted"
    return 0
  fi
  [ -f .env ] || cp .env.example .env
  if grep -q '^COMPOSE_FILE=' .env; then
    sed -i.compose-files-tmp "s|^COMPOSE_FILE=.*|COMPOSE_FILE=$wanted|" .env && rm -f .env.compose-files-tmp
  else
    printf '\n# The Compose files in use, kept up to date by deploy/pi/install.sh and nas-share.sh.\nCOMPOSE_FILE=%s\n' "$wanted" >>.env
  fi
  printf '\nCOMPOSE_FILE in .env now names: %s\n' "${wanted//:/, }"
}
