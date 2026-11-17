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
  // 0 asks the system for any free port, which is what tests do.
  OUTPOST_HTTPS_PORT: z.coerce.number().int().min(0).max(65535).default(8443),
  OUTPOST_DATA_DIR: z.string().default("./data"),
  OUTPOST_STORAGE_ROOTS: list,
  OUTPOST_LAN_ACCESS: bool(false),
  OUTPOST_IN_CONTAINER: bool(false),
  OUTPOST_PUBLISHED_ADDRESS: z.string().optional(),
  OUTPOST_ALLOWED_HOSTS: list,
  OUTPOST_KIWIX_URL: z.string().optional(),
  OUTPOST_KIWIX_BIN: z.string().optional(),
  OUTPOST_KIWIX_LIBRARY_PATH: z.string().optional(),
  OUTPOST_CATALOG_DIR: z.string().optional(),
  OUTPOST_WEB_DIR: z.string().optional(),
  OUTPOST_MAX_UPLOAD_MB: z.coerce.number().int().min(1).default(2048),
  OUTPOST_ALLOW_PRIVATE_DOWNLOADS: bool(false),
  OUTPOST_SOLAR_TABLE_URL: z.string().url().default("https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json"),
  OUTPOST_P533_MAPS_MANIFEST: z.string().optional(),
  OUTPOST_VOACAP_DATA_MANIFEST: z.string().optional(),
  OUTPOST_ALLOW_REMOTE_ERASE: bool(false),
  OUTPOST_OWN_ADDRESS_IS_LOCAL: bool(true),
  OUTPOST_ALLOW_REMOTE_MODEL_SERVER: bool(false),
  OUTPOST_OLLAMA_ADDRESSES: list,
  OUTPOST_DOWNLOAD_HOSTS: list,
  OUTPOST_PORTABLE: bool(false),
  OUTPOST_APP_DIR: z.string().optional(),
  OUTPOST_NODE_DIST_URL: z.string().optional(),
  OUTPOST_KIWIX_DIST_URL: z.string().optional(),
  // Satellite imagery's publishers, replaced by a local stand-in in tests (docs/maps.md).
  OUTPOST_IMAGERY_STAC_URL: z.string().url().optional(),
  OUTPOST_IMAGERY_SENTINEL_HOST: z.string().optional(),
  OUTPOST_IMAGERY_WORLD_URL: z.string().url().optional(),
  OUTPOST_IMAGERY_WORLD_BYTES: z.coerce.number().int().positive().optional(),
  OUTPOST_IMAGERY_LINZ_BASE: z.string().url().optional(),
  OUTPOST_IMAGERY_NAIP_SEARCH_URL: z.string().url().optional(),
  OUTPOST_IMAGERY_NAIP_TOKEN_URL: z.string().url().optional(),
  OUTPOST_IMAGERY_NAIP_HOST: z.string().optional(),
  // Devices on this network: a made-up machine in place of this one, and a stand-in for the IEEE's registry (docs/tools-qr-and-network.md).
  OUTPOST_NETWORK_STAND_IN: z.string().optional(),
  OUTPOST_IEEE_OUI_URL: z.string().url().optional(),
  // Devices on this network: only the computer Outpost runs on may start a scan (docs/security.md). Off by default.
  OUTPOST_NETWORK_SCAN_LOCAL_ONLY: bool(false),
  // Set in a container run with host networking, which then sees the computer's own network.
  OUTPOST_HOST_NETWORK: z.string().optional(),
  OUTPOST_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  // For tests: one local server that stands in for every weather publisher (modules/weather/sources.ts).
  OUTPOST_WEATHER_STAND_IN: z.string().url().optional(),
  // For tests: a local server in place of the Environment Agency's flood zones service (modules/layers/adapters/flood-zones.ts).
  OUTPOST_FLOOD_ZONES_URL: z.string().url().optional(),
  // For tests: a local folder in place of OurAirports' data repository, holding airports.csv and airport-frequencies.csv.
  OUTPOST_OURAIRPORTS_URL: z.string().url().optional(),
});

export interface Config {
  env: "development" | "production" | "test";
  host: string;
  port: number;
  /** Port of the HTTPS listener, which only exists once a person turns HTTPS on in Settings. */
  httpsPort: number;
  /** Database, attachments, staging and other state Outpost owns. */
  dataDir: string;
  /**
   * Directories an administrator has made available for content. Storage locations can
   * only be created inside one of these. The browser never sees anything outside them.
   */
  storageRoots: string[];
  lanAccess: boolean;
  allowedHosts: string[];
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
  /** Where a newer solar cycle table for HF propagation is fetched from, when a person asks for one. */
  solarTableUrl: string;
  /** For testing only: a list of P.533 map files to use in place of the ITU's (docs/hf-propagation.md). */
  p533MapsManifest: string | null;
  /** For testing: a list of VOACAP data files to use in place of engines/voacap/coefficients.json. */
  voacapDataManifest: string | null;
  extraDownloadHosts: string[];
  /**
   * Lets "erase everything" be started from any device that can reach Outpost. Without
   * it, only a request from this computer may erase the person's own things.
   */
  allowRemoteErase: boolean;
  /**
   * Whether a connection from one of this computer's own network addresses counts as
   * this computer (core/local.ts). On by default; turned off where something on this
   * computer forwards connections from elsewhere without a forwarding header.
   */
  ownAddressIsLocal: boolean;
  /** Let answers be written by a model server on the internet, not only one on this computer or the local network. */
  allowRemoteModelServer: boolean;
  /**
   * Where "Look for Ollama on this computer" looks, after the address in Settings. Empty means the
   * two places Ollama listens by default. Set for an Ollama on another port; the end-to-end tests set
   * it so that they never ask a real Ollama on the machine they run on.
   */
  ollamaAddresses: string[];
  logLevel: string;
  /** Running from a portable drive: paths are relative to the drive, nothing is assumed about the host. */
  portable: boolean;
  /** Packaged app directory to copy when writing a portable drive. */
  appBundleDir: string;
  /** Where Node runtimes for portable drives are fetched from. Defaults to nodejs.org; set for a mirror. */
  nodeDistUrl?: string;
  /** Where kiwix-serve for portable drives is fetched from. Defaults to download.kiwix.org. */
  kiwixDistUrl?: string;
  /** Devices on this network (modules/network). */
  network: {
    /** For tests only: a file describing a made-up machine and its network, used in place of this one. Nothing is sent. */
    standIn: string | null;
    /** Where the IEEE's registry of hardware-address prefixes is fetched from, when a person asks. */
    makersUrl: string;
    /** A container told that it shares the computer's own network (host networking). */
    hostNetwork: boolean;
    /** Only a request from the computer Outpost runs on may start a scan (the rule `assertBackupRight` uses, without its override). */
    scanLocalOnly: boolean;
  };
  /** For tests: a local server answering for every weather publisher, at /<source id>/<path>; unset in use. */
  weatherStandIn?: string;
  /** For tests: the flood zones collection's address in place of the Environment Agency's; unset in use. */
  floodZonesUrl?: string;
  /** For tests: the folder that stands in for OurAirports' data repository (it ends in a slash). */
  ourAirportsUrl?: string;
  /** Stand-ins for satellite imagery's publishers, for tests; unset in use. */
  imagery?: {
    endpoints?: {
      stacSearchUrl?: string;
      sentinelHost?: string;
      nasaHost?: string;
      aerial?: { linzBase?: string; naipSearchUrl?: string; naipTokenUrl?: string; naipHost?: string };
    };
    worldEntries?: Array<{
      id: string;
      name: string;
      description: string;
      resolutionMeters: number;
      maxZoom: number;
      files: Array<{ url: string; bytes: number; bounds: [number, number, number, number] }>;
      bytesPerTile: number;
    }>;
  };
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

  // Outpost has no accounts, so the only question is who can reach it. Nothing but this
  // computer can, unless sharing it on the network was chosen deliberately at start-up.
  // The Host check stops browsers being tricked, but any program on the network can
  // simply claim to be "localhost", so listening on a reachable address needs that choice.
  const isLoopback = (address: string) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(address.trim().toLowerCase());
  // Inside a container the server always listens on every interface; what matters is
  // the address the port was published on, which only the person starting it knows.
  const reachableFrom = parsed.OUTPOST_IN_CONTAINER ? (parsed.OUTPOST_PUBLISHED_ADDRESS ?? "") : parsed.OUTPOST_HOST;
  if (!isLoopback(reachableFrom) && !parsed.OUTPOST_LAN_ACCESS) {
    throw new Error(
      parsed.OUTPOST_IN_CONTAINER
        ? "Outpost does not know that its port is published only to this computer. Either publish it on 127.0.0.1 and set OUTPOST_PUBLISHED_ADDRESS=127.0.0.1 (the Compose file does both), or set OUTPOST_LAN_ACCESS=true to share it with everyone on your network."
        : `OUTPOST_HOST is ${parsed.OUTPOST_HOST}, which other devices can reach, but OUTPOST_LAN_ACCESS is not set. Set OUTPOST_LAN_ACCESS=true to share Outpost with everyone on your network, or use OUTPOST_HOST=127.0.0.1.`,
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
    httpsPort: parsed.OUTPOST_HTTPS_PORT,
    dataDir,
    storageRoots,
    lanAccess: parsed.OUTPOST_LAN_ACCESS,
    allowedHosts: parsed.OUTPOST_ALLOWED_HOSTS.map((host) => host.toLowerCase()),
    kiwix: {
      url: parsed.OUTPOST_KIWIX_URL?.replace(/\/+$/, ""),
      bin: parsed.OUTPOST_KIWIX_BIN,
      libraryPath: parsed.OUTPOST_KIWIX_LIBRARY_PATH
        ? path.resolve(parsed.OUTPOST_KIWIX_LIBRARY_PATH)
        : path.join(dataDir, "kiwix", "library.xml"),
    },
    catalogDir: parsed.OUTPOST_CATALOG_DIR ? path.resolve(parsed.OUTPOST_CATALOG_DIR) : defaultCatalogDir,
    webDir: parsed.OUTPOST_WEB_DIR ? path.resolve(parsed.OUTPOST_WEB_DIR) : defaultWebDir,
    maxUploadBytes: parsed.OUTPOST_MAX_UPLOAD_MB * 1024 * 1024,
    allowPrivateDownloads: parsed.OUTPOST_ALLOW_PRIVATE_DOWNLOADS,
    solarTableUrl: parsed.OUTPOST_SOLAR_TABLE_URL,
    p533MapsManifest: parsed.OUTPOST_P533_MAPS_MANIFEST ? path.resolve(parsed.OUTPOST_P533_MAPS_MANIFEST) : null,
    voacapDataManifest: parsed.OUTPOST_VOACAP_DATA_MANIFEST ? path.resolve(parsed.OUTPOST_VOACAP_DATA_MANIFEST) : null,
    extraDownloadHosts: parsed.OUTPOST_DOWNLOAD_HOSTS.map((host) => host.toLowerCase()),
    allowRemoteErase: parsed.OUTPOST_ALLOW_REMOTE_ERASE,
    ownAddressIsLocal: parsed.OUTPOST_OWN_ADDRESS_IS_LOCAL,
    allowRemoteModelServer: parsed.OUTPOST_ALLOW_REMOTE_MODEL_SERVER,
    ollamaAddresses: parsed.OUTPOST_OLLAMA_ADDRESSES,
    // A portable drive runs in a window a person is looking at: keep it quiet.
    logLevel: parsed.OUTPOST_LOG_LEVEL ?? (parsed.NODE_ENV === "test" ? "silent" : parsed.OUTPOST_PORTABLE ? "warn" : "info"),
    portable: parsed.OUTPOST_PORTABLE,
    appBundleDir: parsed.OUTPOST_APP_DIR ? path.resolve(parsed.OUTPOST_APP_DIR) : isBundled ? appRoot : path.join(appRoot, "dist/app"),
    nodeDistUrl: parsed.OUTPOST_NODE_DIST_URL,
    kiwixDistUrl: parsed.OUTPOST_KIWIX_DIST_URL,
    network: {
      standIn: parsed.OUTPOST_NETWORK_STAND_IN ? path.resolve(parsed.OUTPOST_NETWORK_STAND_IN) : null,
      makersUrl: parsed.OUTPOST_IEEE_OUI_URL ?? "https://standards-oui.ieee.org/oui/oui.csv",
      hostNetwork: ["1", "true", "yes", "on"].includes((parsed.OUTPOST_HOST_NETWORK ?? "").toLowerCase()),
      scanLocalOnly: parsed.OUTPOST_NETWORK_SCAN_LOCAL_ONLY,
    },
    imagery: imageryStandIns(parsed),
    weatherStandIn: parsed.OUTPOST_WEATHER_STAND_IN,
    floodZonesUrl: parsed.OUTPOST_FLOOD_ZONES_URL,
    ourAirportsUrl: parsed.OUTPOST_OURAIRPORTS_URL,
  };
}

/** The test stand-ins for satellite imagery's publishers, when any is set. */
function imageryStandIns(parsed: {
  OUTPOST_IMAGERY_STAC_URL?: string;
  OUTPOST_IMAGERY_SENTINEL_HOST?: string;
  OUTPOST_IMAGERY_WORLD_URL?: string;
  OUTPOST_IMAGERY_WORLD_BYTES?: number;
  OUTPOST_IMAGERY_LINZ_BASE?: string;
  OUTPOST_IMAGERY_NAIP_SEARCH_URL?: string;
  OUTPOST_IMAGERY_NAIP_TOKEN_URL?: string;
  OUTPOST_IMAGERY_NAIP_HOST?: string;
}): Config["imagery"] {
  const world = parsed.OUTPOST_IMAGERY_WORLD_URL;
  const aerial = {
    linzBase: parsed.OUTPOST_IMAGERY_LINZ_BASE?.replace(/\/$/, ""),
    naipSearchUrl: parsed.OUTPOST_IMAGERY_NAIP_SEARCH_URL,
    naipTokenUrl: parsed.OUTPOST_IMAGERY_NAIP_TOKEN_URL,
    naipHost: parsed.OUTPOST_IMAGERY_NAIP_HOST?.toLowerCase(),
  };
  const anyAerial = Object.values(aerial).some(Boolean);
  if (!parsed.OUTPOST_IMAGERY_STAC_URL && !parsed.OUTPOST_IMAGERY_SENTINEL_HOST && !world && !anyAerial) return undefined;
  return {
    endpoints: {
      ...(anyAerial ? { aerial } : {}),
      stacSearchUrl: parsed.OUTPOST_IMAGERY_STAC_URL,
      sentinelHost: parsed.OUTPOST_IMAGERY_SENTINEL_HOST?.toLowerCase(),
      nasaHost: world ? new URL(world).hostname.toLowerCase() : undefined,
    },
    worldEntries: world
      ? [
          {
            id: "blue-marble-2km",
            name: "The world, 2 km a pixel",
            description: "A small stand-in for NASA's picture, for tests.",
            resolutionMeters: 2000,
            maxZoom: 2,
            files: [{ url: world, bytes: parsed.OUTPOST_IMAGERY_WORLD_BYTES ?? 0, bounds: [-180, -90, 180, 90] }],
            bytesPerTile: 3000,
          },
        ]
      : undefined,
  };
}
