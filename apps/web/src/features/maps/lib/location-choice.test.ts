import { describe, expect, it } from "vitest";
import { chooseLocation } from "./location-choice";

const GB = 1024 ** 3;
const internal = { id: "internal", name: "Internal storage", isDefault: true, status: "available" as const, freeBytes: 40 * GB };
const drive = { id: "drive", name: "Field SSD", isDefault: false, status: "available" as const, freeBytes: 200 * GB };
const unplugged = { id: "usb", name: "USB stick", isDefault: false, status: "unavailable" as const, freeBytes: null };
const all = [internal, drive, unplugged];

describe("choosing where a map download goes", () => {
  it("uses the default location when nothing else is known", () => {
    expect(chooseLocation(all, null, {})).toEqual({ locationId: "internal", displaced: undefined });
    expect(chooseLocation(all, 2 * GB, { remembered: null })).toEqual({ locationId: "internal", displaced: undefined });
  });

  it("goes back to the location the last download went to", () => {
    expect(chooseLocation(all, 2 * GB, { remembered: "drive" })).toEqual({ locationId: "drive", displaced: undefined });
  });

  it("lets a choice made just now win over the remembered one", () => {
    expect(chooseLocation(all, 2 * GB, { picked: "internal", remembered: "drive" })).toEqual({
      locationId: "internal",
      displaced: undefined,
    });
  });

  it("never chooses a location that is disconnected, and says which one was passed over", () => {
    expect(chooseLocation(all, 2 * GB, { remembered: "usb" })).toEqual({ locationId: "internal", displaced: unplugged });
    expect(chooseLocation(all, null, { picked: "usb" })).toEqual({ locationId: "internal", displaced: unplugged });
  });

  it("moves on when the wanted location is too small once the size is known", () => {
    // Fine while the size is unknown.
    expect(chooseLocation(all, null, { picked: "internal" }).locationId).toBe("internal");
    // 40 GB free is not room for 40 GB plus the reserve the server keeps.
    expect(chooseLocation(all, 40 * GB, { picked: "internal" })).toEqual({ locationId: "drive", displaced: internal });
    // A remembered location that is too small falls back to the picked-over default only if that has room.
    expect(chooseLocation(all, 100 * GB, { remembered: "internal" })).toEqual({ locationId: "drive", displaced: internal });
  });

  it("chooses nothing when nowhere has room", () => {
    expect(chooseLocation(all, 500 * GB, { picked: "drive" })).toEqual({ locationId: undefined, displaced: drive });
    expect(chooseLocation([], null, {})).toEqual({ locationId: undefined, displaced: undefined });
  });

  it("forgets a remembered location that no longer exists", () => {
    expect(chooseLocation(all, null, { remembered: "gone" })).toEqual({ locationId: "internal", displaced: undefined });
  });

  it("still names the one location when there is only one", () => {
    expect(chooseLocation([drive], 2 * GB, {})).toEqual({ locationId: "drive", displaced: undefined });
  });
});
