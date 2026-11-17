import { describe, expect, it } from "vitest";
import { roomToMake } from "./table-menu";

describe("room for the table's bar", () => {
  it("makes room above a table when the bar would lie over the line before it", () => {
    // A 44 px bar over a table 16 px below a list: 40 px more, so the list stays in view.
    expect(roomToMake(16, 44)).toBe(40);
  });
  it("makes none where there is room already", () => {
    expect(roomToMake(80, 44)).toBe(0);
  });
});
