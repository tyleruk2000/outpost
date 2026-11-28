/**
 * compose.yaml gives the container its zone as TZ (deploy/pi/install.sh writes the Pi's). The image is
 * node:26-bookworm-slim, where the system's zone files may be missing: Node keeps its own copy of the
 * zone database in its ICU data, and this proves TZ alone is enough, with the system's zone files out
 * of reach (TZDIR pointing at nothing), for both Intl and Date's own local time.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const local = (zone: string) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        `const summer = new Date(Date.UTC(2026, 6, 1, 12));
         const winter = new Date(Date.UTC(2026, 0, 15, 12));
         console.log(JSON.stringify({
           zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
           summerOffset: summer.getTimezoneOffset(),
           winterOffset: winter.getTimezoneOffset(),
           summerHour: summer.getHours(),
         }));`,
      ],
      { env: { PATH: process.env.PATH ?? "", TZ: zone, TZDIR: "/nonexistent-zoneinfo" }, encoding: "utf8" },
    ),
  ) as { zone: string; summerOffset: number; winterOffset: number; summerHour: number };

describe("the server's time zone, from TZ", () => {
  it("keeps British summer time with no zone files on the system", () => {
    expect(local("Europe/London")).toEqual({ zone: "Europe/London", summerOffset: -60, winterOffset: 0, summerHour: 13 });
  });

  it("is UTC when compose.yaml gives its default", () => {
    expect(local("Etc/UTC")).toMatchObject({ summerOffset: 0, summerHour: 12 });
  });
});
