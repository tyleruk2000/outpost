import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SpeedChart } from "./speed-chart";

afterEach(() => {
  document.documentElement.style.fontSize = "";
});

const chart = () =>
  render(
    <SpeedChart
      readings={[
        { at: 1_000, value: 900 },
        { at: 2_000, value: 1_000 },
      ]}
      domain={[0, 60_000]}
      xTicks={[{ at: 60_000, label: "now" }]}
      label="Speed"
      timeLabel={String}
      tableCaption="Speed"
      tableBucketSeconds={10}
    />,
  ).container.querySelector("svg")!;

describe("a chart with large text", () => {
  it("grows with the text, so that its labels keep their room", () => {
    const normal = Number(chart().getAttribute("height"));
    document.documentElement.style.fontSize = "32px";
    expect(Number(chart().getAttribute("height"))).toBe(normal * 2);
  });
});
