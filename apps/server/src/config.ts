/**
 * Deployment configuration.
 *
 * Everything here comes from environment variables and is fixed for the lifetime of the
 * process. Behaviour that people change from the Settings screen lives in the database
 * (see modules/settings) so that it survives container rebuilds.
 */
import path from "node:path";
import { z } from "zod";
import { appRoot, defaultCatalogDir, defaultWebDir, isBundled } from "./core/paths.ts";

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return fallback;
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    });

const list = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OUTPOST_HOST: z.string().default("127.0.0.1"),
  OUTPOST_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  OUTPOST_DATA_DIR: z.string().default("./data"),
  OUTPOST_STORAGE_ROOTS: list,
  OUTPOST_LAN_ACCESS: bool(false),
  OUTPOST_IN_CONTAINER: bool(false),
  OUTPOST_PUBLISHED_ADDRESS: z.string().optional(),
  OUTPOST_AUTH: z.enum(["auto", "on", "off"]).default("auto"),
  OUTPOST_ALLOW_UNAUTHENTICATED_LAN: bool(false),
  OUTPOST_ALLOWED_HOSTS: list,
  OUTPOST_SECURE_COOKIES: bool(false),
  OUTPOST_KIWIX_URL: z.string().optional(),
  OUTPOST_KIWIX_BIN: z.string().optional(),
  OUTPOST_KIWIX_LIBRARY_PATH: z.string().optional(),
  OUTPOST_CATALOG_DIR: z.string().optional(),
  OUTPOST_WEB_DIR: z.string().optional(),
  OUTPOST_MAX_UPLOAD_MB: z.coerce.number().int().min(1).default(2048),
  OUTPOST_ALLOW_PRIVATE_DOWNLOADS: bool(false),
  OUTPOST_DOWNLOAD_HOSTS: list,
  OUTPOST_PORTABLE: bool(false),
  OUTPOST_APP_DIR: z.string().optional(),
  OUTPOST_NODE_DIST_URL: z.string().optional(),
  OUTPOST_KIWIX_DIST_URL: z.string().optional(),
  OUTPOST_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
});

export interface Config {
  env: "development" | "production" | "test";
  host: string;
  port: number;
  /** Database, attachments, staging and other state Outpost owns. */
  dataDir: string;
  /**
   * Directories an administrator has made available for content. Storage locations can
   * only be created inside one of these. The browser never sees anything outside them.
   */
  storageRoots: string[];
  lanAccess: boolean;
  authRequired: boolean;
  allowedHosts: string[];
  secureCookies: boolean;
  kiwix: {
    /** Base URL of an externally managed kiwix-serve (the Compose sidecar). */
    url?: string;
    /** Path to a kiwix-serve binary that Outpost starts itself. */
    bin?: string;
    libraryPath: string;
  };
  catalogDir: string;
  webDir: string;
  maxUploadBytes: number;
  /** Lets downloads reach private addresses, for a mirror on your own network. */
  allowPrivateDownloads: boolean;
  extraDownloadHosts: string[];
  logLevel: string;
  /** Running from a portable drive: paths are relative to the drive, nothing is assumed about the host. */
  portable: boolean;
  /** Packaged app directory to copy when writing a portable drive. */
  appBundleDir: string;
  /** Where Node runtimes for portable drives are fetched from. Defaults to nodejs.org; set for a mirror. */
  nodeDistUrl?: string;
  /** Where kiwix-serve for portable drives is fetched from. Defaults to download.kiwix.org. */
  kiwixDistUrl?: string;
}

/**
 * Places removable and network drives usually appear. Used only for the default when
 * OUTPOST_STORAGE_ROOTS is not set, which is the case for a person running Outpost
 * directly on their own computer. Containers and servers set the roots explicitly.
 */
function removableMediaRoots(): string[] {
  if (process.platform === "darwin") return ["/Volumes"];
  if (process.platform === "linux") {
    const user = process.env.USER ?? process.env.LOGNAME;
    return [user ? `/media/${user}` : "/media", user ? `/run/media/${user}` : "/run/media", "/mnt"];
  }
  return [];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  const dataDir = path.resolve(parsed.OUTPOST_DATA_DIR);

  let authRequired: boolean;
  if (parsed.OUTPOST_AUTH === "on") authRequired = true;
  else if (parsed.OUTPOST_AUTH === "off") authRequired = false;
  else authRequired = parsed.OUTPOST_LAN_ACCESS;

  if (parsed.OUTPOST_LAN_ACCESS && !authRequired && !parsed.OUTPOST_ALLOW_UNAUTHENTICATED_LAN) {
    throw new Error(
      "OUTPOST_LAN_ACCESS is on but OUTPOST_AUTH is off. Anyone on your network could " +
        "change or delete your library. Turn sign-in on, or set " +
        "OUTPOST_ALLOW_UNAUTHENTICATED_LAN=true if you accept that.",
    );
  }

  // Sign-in off is only safe when nothing but this computer can connect. The Host check
  // stops browsers being tricked, but any program on the network can simply claim to be
  // "localhost". So if Outpost would be reachable from elsewhere, LAN access (and with
  // it sign-in) must have been chosen deliberately.
  const isLoopback = (address: string) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(address.trim().toLowerCase());
  // Inside a container the server always listens on every interface; what matters is
  // the address the port was published on, which only the person starting it knows.
  const reachableFrom = parsed.OUTPOST_IN_CONTAINER ? (parsed.OUTPOST_PUBLISHED_ADDRESS ?? "") : parsed.OUTPOST_HOST;
  if (!isLoopback(reachableFrom) && !parsed.OUTPOST_LAN_ACCESS) {
    throw new Error(
      parsed.OUTPOST_IN_CONTAINER
        ? "Outpost does not know that its port is published only to this computer. Either publish it on 127.0.0.1 and set OUTPOST_PUBLISHED_ADDRESS=127.0.0.1 (the Compose file does both), or set OUTPOST_LAN_ACCESS=true to share it on your network with sign-in."
        : `OUTPOST_HOST is ${parsed.OUTPOST_HOST}, which other devices can reach, but OUTPOST_LAN_ACCESS is not set. Set OUTPOST_LAN_ACCESS=true to share Outpost on your network with sign-in, or use OUTPOST_HOST=127.0.0.1.`,
    );
  }

  const storageRoots =
    parsed.OUTPOST_STORAGE_ROOTS.length > 0
      ? parsed.OUTPOST_STORAGE_ROOTS.map((root) => path.resolve(root))
      : [path.join(dataDir, "library"), ...(parsed.OUTPOST_PORTABLE ? [] : removableMediaRoots())];

  return {
    env: parsed.NODE_ENV,
    host: parsed.OUTPOST_HOST,
    port: parsed.OUTPOST_PORT,
    dataDir,
    storageRoots,
    lanAccess: parsed.OUTPOST_LAN_ACCESS,
    authRequired,
    allowedHosts: parsed.OUTPOST_ALLOWED_HOSTS.map((host) => host.toLowerCase()),
    secureCookies: parsed.OUTPOST_SECURE_COOKIES,
    kiwix: {
      url: parsed.OUTPOST_KIWIX_URL?.replace(/\/+$/, ""),
      bin: parsed.OUTPOST_KIWIX_BIN,
      libraryPath: parsed.OUTPOST_KIWIX_LIBRARY_PATH
        ? path.resolve(parsed.OUTPOST_KIWIX_LIBRARY_PATH)
        : path.join(dataDir, "kiwix", "library.xml"),
    },
    catalogDir: parsed.OUTPOST_CATALOG_DIR
      ? path.resolve(parsed.OUTPOST_CATALOG_DIR)
      : defaultCatalogDir,
    webDir: parsed.OUTPOST_WEB_DIR
      ? path.resolve(parsed.OUTPOST_WEB_DIR)
      : defaultWebDir,
    maxUploadBytes: parsed.OUTPOST_MAX_UPLOAD_MB * 1024 * 1024,
    allowPrivateDownloads: parsed.OUTPOST_ALLOW_PRIVATE_DOWNLOADS,
    extraDownloadHosts: parsed.OUTPOST_DOWNLOAD_HOSTS.map((host) => host.toLowerCase()),
    // A portable drive runs in a window a person is looking at: keep it quiet.
    logLevel: parsed.OUTPOST_LOG_LEVEL ?? (parsed.NODE_ENV === "test" ? "silent" : parsed.OUTPOST_PORTABLE ? "warn" : "info"),
    portable: parsed.OUTPOST_PORTABLE,
    appBundleDir: parsed.OUTPOST_APP_DIR
      ? path.resolve(parsed.OUTPOST_APP_DIR)
      : isBundled
        ? appRoot
        : path.join(appRoot, "dist/app"),
    nodeDistUrl: parsed.OUTPOST_NODE_DIST_URL,
    kiwixDistUrl: parsed.OUTPOST_KIWIX_DIST_URL,
  };
}
