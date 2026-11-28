import { describe, expect, it } from "vitest";
import { ONE_TABLE_UP_TO, transmitterGroups } from "./main-transmitter";
import { ISS_LIKE } from "./test-orbits";

describe("a satellite's transmitters", () => {
  it("are one table when there are few", () => {
    const few = ISS_LIKE.slice(0, ONE_TABLE_UP_TO);
    const groups = transmitterGroups(few);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "all", folded: false });
    expect(groups[0]!.transmitters).toHaveLength(ONE_TABLE_UP_TO);
  });

  it("are grouped by what each is for when there are many, the long tail folded and a record listed twice listed once", () => {
    expect(ISS_LIKE).toHaveLength(41);
    const groups = transmitterGroups(ISS_LIKE);
    expect(groups.map((group) => [group.id, group.transmitters.length, group.folded])).toEqual([
      ["work", 2, false],
      ["listen", 2, false],
      ["quiet", 30, true],
      ["uplink", 1, true],
    ]);
    // Every one that is different is still listed somewhere.
    expect(groups.reduce((sum, group) => sum + group.transmitters.length, 0)).toBe(35);
  });

  it("opens the first group when there is nothing to work or listen to", () => {
    const groups = transmitterGroups(ISS_LIKE.slice(5));
    expect(groups[0]).toMatchObject({ id: "quiet", folded: false });
  });
});
