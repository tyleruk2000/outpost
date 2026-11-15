/**
 * The files a person double-clicks on a portable drive. Each one finds the runtime for
 * the computer it is on, points Outpost at the drive's own data and library folders,
 * and starts it. Nothing is installed on, or written to, the host computer.
 *
 * Exit code 75 means "start me again" (used after a restore), so every launcher loops
 * on it.
 */

export const PORTABLE_PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "win-x64", "win-arm64"] as const;
export type PortablePlatform = (typeof PORTABLE_PLATFORMS)[number];

export const platformLabels: Record<PortablePlatform, string> = {
  "darwin-arm64": "Mac (Apple Silicon)",
  "darwin-x64": "Mac (Intel)",
  "linux-x64": "Linux (64-bit PC)",
  "linux-arm64": "Linux (ARM64, Raspberry Pi)",
  "win-x64": "Windows (64-bit PC)",
  "win-arm64": "Windows (ARM64)",
};

export function currentPlatform(): PortablePlatform | undefined {
  const os = process.platform === "win32" ? "win" : process.platform;
  const key = `${os}-${process.arch}`;
  return (PORTABLE_PLATFORMS as readonly string[]).includes(key) ? (key as PortablePlatform) : undefined;
}

const posixBody = `
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "Outpost does not have a launcher for this system."; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=x64 ;;
  *) echo "Outpost does not support this processor: $(uname -m)"; exit 1 ;;
esac
RUNTIME="$ROOT/runtime/$OS-$ARCH"
NODE="$RUNTIME/node"
if [ ! -f "$NODE" ]; then
  echo "This drive does not include Outpost for this kind of computer ($OS-$ARCH)."
  echo "Add it from the Outpost that made the drive: Storage, Portable drive."
  printf "Press Enter to close. "; read -r _
  exit 1
fi
# Drives formatted on other systems can lose the executable flag.
chmod +x "$NODE" 2>/dev/null || true

export OUTPOST_PORTABLE=true
export OUTPOST_SUPERVISED=true
export OUTPOST_OPEN_BROWSER=\${OUTPOST_OPEN_BROWSER:-true}
export OUTPOST_HOST=\${OUTPOST_HOST:-127.0.0.1}
export OUTPOST_PORT=\${OUTPOST_PORT:-8080}
export OUTPOST_DATA_DIR="$ROOT/data"
export OUTPOST_STORAGE_ROOTS="$ROOT/library"
export NODE_ENV=production
if [ -f "$RUNTIME/kiwix-serve" ]; then
  chmod +x "$RUNTIME/kiwix-serve" 2>/dev/null || true
  export OUTPOST_KIWIX_BIN="$RUNTIME/kiwix-serve"
fi

echo "Starting Outpost from $ROOT"
echo "Leave this window open while you use it. Close it, or press Ctrl+C, to stop."
echo
while true; do
  "$NODE" "$ROOT/app/server/outpost.mjs"
  CODE=$?
  [ "$CODE" -eq 75 ] || break
  echo "Restarting Outpost..."
done
if [ "$CODE" -ne 0 ] && [ "$CODE" -ne 130 ]; then
  echo
  echo "Outpost stopped unexpectedly (code $CODE)."
  printf "Press Enter to close. "; read -r _
fi
`;

export const macLauncher = `#!/bin/bash\n# Outpost portable launcher for macOS. Double-click to start.${posixBody}`;
export const linuxLauncher = `#!/bin/sh\n# Outpost portable launcher for Linux. Run: sh start-outpost.sh${posixBody}`;

export const windowsLauncher = `@echo off\r
rem Outpost portable launcher for Windows. Double-click to start.\r
setlocal\r
title Outpost\r
set "ROOT=%~dp0"\r
set "ARCH=x64"\r
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"\r
set "RUNTIME=%ROOT%runtime\\win-%ARCH%"\r
if not exist "%RUNTIME%\\node.exe" if "%ARCH%"=="arm64" set "RUNTIME=%ROOT%runtime\\win-x64"\r
if not exist "%RUNTIME%\\node.exe" (\r
  echo This drive does not include Outpost for Windows.\r
  echo Add it from the Outpost that made the drive: Storage, Portable drive.\r
  pause\r
  exit /b 1\r
)\r
set "OUTPOST_PORTABLE=true"\r
set "OUTPOST_SUPERVISED=true"\r
if not defined OUTPOST_OPEN_BROWSER set "OUTPOST_OPEN_BROWSER=true"\r
if not defined OUTPOST_HOST set "OUTPOST_HOST=127.0.0.1"\r
if not defined OUTPOST_PORT set "OUTPOST_PORT=8080"\r
set "OUTPOST_DATA_DIR=%ROOT%data"\r
set "OUTPOST_STORAGE_ROOTS=%ROOT%library"\r
set "NODE_ENV=production"\r
if exist "%RUNTIME%\\kiwix-serve.exe" set "OUTPOST_KIWIX_BIN=%RUNTIME%\\kiwix-serve.exe"\r
echo Starting Outpost from %ROOT%\r
echo Leave this window open while you use it. Close it to stop.\r
echo.\r
:run\r
"%RUNTIME%\\node.exe" "%ROOT%app\\server\\outpost.mjs"\r
if %ERRORLEVEL%==75 goto run\r
if not %ERRORLEVEL%==0 (\r
  echo.\r
  echo Outpost stopped unexpectedly ^(code %ERRORLEVEL%^).\r
  pause\r
)\r
endlocal\r
`;

export function readme(input: { version: string; createdAt: string; platforms: PortablePlatform[]; hasKiwix: boolean }): string {
  const lines = [
    "OUTPOST PORTABLE DRIVE",
    "======================",
    "",
    "This drive holds a complete copy of Outpost and part of a library. It runs from",
    "the drive. Nothing is installed on the computer you plug it into, and no internet",
    "connection is needed.",
    "",
    "TO START",
    "",
    '  Mac        Double-click "Start Outpost.command".',
    "             The first time, macOS may ask you to confirm: right-click the file,",
    "             choose Open, then Open again.",
    '  Windows    Double-click "Start Outpost.bat".',
    "             If Windows shows a blue SmartScreen box, choose More info, Run anyway.",
    "  Linux      Open a terminal in this folder and run:  sh start-outpost.sh",
    "",
    "A window opens and stays open while Outpost runs. Your browser then opens",
    "http://localhost:8080. Close the window to stop Outpost before unplugging the drive.",
    "",
    "THIS DRIVE CAN RUN ON",
    "",
    ...input.platforms.map((platform) => `  - ${platformLabels[platform]}`),
    "",
    input.hasKiwix
      ? "Reference collections (Wikipedia and similar) are included and readable."
      : "Reference collections (Wikipedia and similar) need the kiwix-serve program, which is\nnot on this drive. Documents, notes, maps and search work without it.",
    "",
    "WHAT IS WHERE",
    "",
    "  app/       Outpost itself",
    "  runtime/   the program that runs it, one folder per kind of computer",
    "  data/      your notes, settings and the library index",
    "  library/   documents, collections and maps",
    "",
    "Changes you make while running from this drive (new notes, new documents) are saved",
    "on the drive. They are not sent back to the Outpost that created it.",
    "",
    `Outpost ${input.version}, drive written ${input.createdAt}.`,
    "Outpost is open-source software under the MIT licence. Map data (c) OpenStreetMap",
    "contributors. Each collection carries its own licence; see Library in the app.",
    "",
  ];
  return lines.join("\r\n");
}
