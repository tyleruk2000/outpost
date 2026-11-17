/**
 * Where this server runs, as far as connecting shares is concerned. A Mac run directly
 * can mount a share for the person. A container has no right to, and Linux needs root,
 * so there Outpost only writes out what to do.
 */
import type { ShareHostMode, SystemInfo } from "@outpost/shared";
import { containerReason, type FileProbe } from "../../../core/local.ts";

/**
 * A container is recognised by the same signs the local-only rule uses (Docker, Podman,
 * LXC, Kubernetes and others: see `containerReason`), so the two never disagree. Pass
 * `env`, `platform` and `files` to test; with none, the answer is worked out once, since
 * a running process does not move in or out of a container.
 */
export function detectHost(env?: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform, files?: FileProbe): SystemInfo["host"] {
  if (env === undefined && files === undefined && platform === process.platform) {
    detected ??= describe(process.env, platform);
    return detected;
  }
  return describe(env ?? process.env, platform, files);
}

let detected: SystemInfo["host"] | undefined;

function describe(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, files?: FileProbe): SystemInfo["host"] {
  const os = platform === "darwin" ? "macos" : platform === "linux" ? "linux" : platform === "win32" ? "windows" : "other";
  // The containers these signs describe run Linux; elsewhere only the variables count.
  return { os, inContainer: containerReason(env, os === "linux" ? files : nothing) !== null };
}

const nothing: FileProbe = { exists: () => false, read: () => null };

export function shareHostMode(host: SystemInfo["host"], options: { portable: boolean }): ShareHostMode {
  // From a portable drive Outpost is a guest on someone else's computer: it does not
  // mount things there or put anything in that computer's keychain.
  if (options.portable) return "unsupported";
  if (host.inContainer) return "docker";
  if (host.os === "macos") return "macos";
  if (host.os === "linux") return "linux";
  return "unsupported";
}
