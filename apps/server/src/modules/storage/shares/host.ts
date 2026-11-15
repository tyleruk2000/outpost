/**
 * Where this server runs, as far as connecting shares is concerned. A Mac run directly
 * can mount a share for the person. A container has no right to, and Linux needs root,
 * so there Outpost only writes out what to do.
 */
import fs from "node:fs";
import type { ShareHostMode, SystemInfo } from "@outpost/shared";

const truthy = (value: string | undefined) => ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());

export function detectHost(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): SystemInfo["host"] {
  const os = platform === "darwin" ? "macos" : platform === "linux" ? "linux" : platform === "win32" ? "windows" : "other";
  // The Compose file sets OUTPOST_IN_CONTAINER; the marker file covers a plain `docker run`.
  const inContainer = truthy(env.OUTPOST_IN_CONTAINER) || (platform === "linux" && fs.existsSync("/.dockerenv"));
  return { os, inContainer };
}

export function shareHostMode(host: SystemInfo["host"], options: { portable: boolean }): ShareHostMode {
  // From a portable drive Outpost is a guest on someone else's computer: it does not
  // mount things there or put anything in that computer's keychain.
  if (options.portable) return "unsupported";
  if (host.inContainer) return "docker";
  if (host.os === "macos") return "macos";
  if (host.os === "linux") return "linux";
  return "unsupported";
}
