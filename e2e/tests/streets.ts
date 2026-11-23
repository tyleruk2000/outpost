/**
 * The optional streets service for the end-to-end tests. The suite's open server is pointed
 * at a stand-in answering with replies recorded from a real Valhalla serving Great Britain
 * (apps/server/test/fixtures/streets); streets count as installed only while the service's
 * status.json is in the server's streets folder, which these write and take away, as the
 * service itself would. Nothing reaches the internet.
 */
import fs from "node:fs";
import path from "node:path";
import { GB_TILESET, sidecarStatus } from "../../apps/server/test/fixtures/streets/valhalla-stand-in.ts";

const dir = () => path.join(process.env.OUTPOST_E2E_WORK!, "open", "valhalla");

/** The service as it says it is: streets for Great Britain ready, or none built yet. */
export function installStreets(state: "ready" | "none" = "ready"): void {
  fs.mkdirSync(dir(), { recursive: true });
  const status = state === "ready" ? sidecarStatus() : sidecarStatus({ state: "idle", current: null });
  fs.writeFileSync(path.join(dir(), "status.json.part"), JSON.stringify(status));
  fs.renameSync(path.join(dir(), "status.json.part"), path.join(dir(), "status.json"));
}

/** Back to "not installed", as on most installations. */
export function removeStreets(): void {
  fs.rmSync(path.join(dir(), "status.json"), { force: true });
}

export { GB_TILESET };
