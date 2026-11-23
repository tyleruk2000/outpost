import { describe, expect, it } from "vitest";
import { describeDownload, mapTaskTitle, removalDeletesPartialFile } from "./download-text";
import { download } from "./test-support";

describe("describing a download", () => {
  it("gives real bytes, speed and time left while transferring", () => {
    const view = describeDownload(download());
    expect(view.status).toBe("412 MB of 1.90 GB");
    expect(view.detail).toBe("2.10 MB/s, 4 minutes left");
    expect(view.fraction).toBeCloseTo(412 / 1900);
    expect(view.alive).toBe(true);
  });

  it("shows no fraction while the total is unknown", () => {
    const view = describeDownload(download({ totalBytes: null, bytesPerSecond: null, etaSeconds: null }));
    expect(view.status).toBe("412 MB so far");
    expect(view.fraction).toBeUndefined();
    expect(view.detail).toBeNull();
  });

  it("says the file is being checked while verifying, and installing after that", () => {
    const checking = describeDownload(
      download({ state: "verifying", receivedBytes: 1_900_000_000, message: "Checking the file", bytesPerSecond: null, etaSeconds: null }),
    );
    expect(checking.status).toBe("Checking the file against its checksum");
    expect(checking.fraction).toBeUndefined();
    expect(checking.alive).toBe(true);
    expect(describeDownload(download({ state: "verifying", message: "Installing" })).status).toBe("Installing");
  });

  it("uses the server's words while waiting to retry", () => {
    const message = "No connection. This download will resume when the network is back.";
    const view = describeDownload(
      download({ state: "queued", error: message, errorKind: "offline", bytesPerSecond: null, etaSeconds: null }),
    );
    expect(view.status).toBe(message);
    expect(view.detail).toBe("412 MB of 1.90 GB so far");
    expect(view.alive).toBe(false);
    expect(view.tone).toBe("normal");
  });

  it("covers waiting, paused, failed, cancelled and completed", () => {
    expect(describeDownload(download({ state: "queued", receivedBytes: 0, bytesPerSecond: null, etaSeconds: null })).status).toBe(
      "Waiting to start",
    );
    expect(describeDownload(download({ state: "paused" })).status).toBe("Paused at 412 MB of 1.90 GB");

    const failed = describeDownload(download({ state: "failed", error: '"USB drive" is full.', errorKind: "insufficient_space" }));
    expect(failed.status).toBe('"USB drive" is full.');
    expect(failed.detail).toBe("412 MB already downloaded is kept. Retry continues from there.");
    expect(failed.tone).toBe("danger");
    expect(describeDownload(download({ state: "failed", receivedBytes: 0 })).status).toBe("The download failed.");

    expect(describeDownload(download({ state: "cancelled" })).status).toBe("Cancelled at 412 MB of 1.90 GB");
    expect(describeDownload(download({ state: "cancelled", receivedBytes: 0 })).status).toBe("Cancelled before anything was downloaded");
    expect(describeDownload(download({ state: "completed", receivedBytes: 1_900_000_000 })).status).toBe("1.90 GB");
  });
});

describe("removing a download", () => {
  it("deletes a partial file only when there is one and the download did not finish", () => {
    expect(removalDeletesPartialFile(download({ state: "failed" }))).toBe(true);
    expect(removalDeletesPartialFile(download({ state: "cancelled" }))).toBe(true);
    expect(removalDeletesPartialFile(download({ state: "failed", receivedBytes: 0 }))).toBe(false);
    expect(removalDeletesPartialFile(download({ state: "completed" }))).toBe(false);
  });
});

describe("map data titles", () => {
  it("names old map downloads and tasks as Offline maps does, and leaves others as they are", () => {
    expect(mapTaskTitle("Country file: United Kingdom (Geofabrik)")).toBe("United Kingdom: source file");
    expect(mapTaskTitle("Country file: Monaco")).toBe("Monaco: source file");
    expect(mapTaskTitle("Building the road network: Wales")).toBe("Wales: routes");
    expect(mapTaskTitle("Reading the country file: France")).toBe("France: source file");
    expect(mapTaskTitle("OpenStreetMap: Ohio, United States of America (Geofabrik)")).toBe("Ohio, United States of America: nearby places");
    expect(mapTaskTitle("Building streets for routes: France")).toBe("France: walking and cycling");
    expect(mapTaskTitle("Satellite: Lake shore")).toBe("Lake shore: satellite pictures");
    expect(mapTaskTitle("United Kingdom: routes")).toBe("United Kingdom: routes");
    expect(mapTaskTitle("Wikipedia (English)")).toBe("Wikipedia (English)");
  });
});
