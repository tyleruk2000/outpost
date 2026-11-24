import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { predictPasses } from "./engine";
import { GroundTrack } from "./ground-track-map";
import { ESHAIL, FUNCUBE } from "./test-orbits";

const LONDON = { lat: 51.5074, lon: -0.1278 };
const NOW = new Date(Date.parse("2026-11-24T02:50:00Z"));

describe("the ground track on the screen", () => {
  it("draws the track with its caption in words, a key, and the track as a table", async () => {
    const user = userEvent.setup();
    const passes = predictPasses(FUNCUBE, LONDON, NOW, 24, 18);
    render(<GroundTrack orbit={FUNCUBE} observer={LONDON} placeName="Home" now={NOW} pass={passes[0]!} passes={passes} />);
    const map = await screen.findByRole("img", { name: /^Ground track\. Now over / });
    expect(map.getAttribute("aria-label")).toMatch(/Above Home \d\d:\d\d to \d\d:\d\d UTC, [NESW]+ to [NESW]+/);
    expect(screen.getByText(/Night is shaded as now\./)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Key" })).getByText("Above the horizon at Home")).toBeInTheDocument();
    // Time labels on the drawing, each a whole 10 minutes.
    const labels = [...map.querySelectorAll("text")].map((text) => text.textContent);
    expect(labels.length).toBeGreaterThan(4);
    for (const label of labels) expect(label).toMatch(/^\d\d:\d0$/);

    await user.click(screen.getByText("The track as a table"));
    const table = screen.getByRole("table", { name: "The ground track every 10 minutes" });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(10);
    expect(within(table).getAllByText(/° up$/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("radio", { name: "This pass" }));
    expect(screen.getByText(/Night is shaded as at its highest, \d\d:\d\d UTC\./)).toBeInTheDocument();
  });

  it("says when next where the stretch drawn has no pass", async () => {
    const passes = predictPasses(FUNCUBE, LONDON, NOW, 24, 18);
    // Ninety minutes after a pass ends, one turn holds no other.
    const quiet = new Date(passes[0]!.los.getTime() + 20 * 60_000);
    const later = passes.filter((item) => item.aos > quiet);
    render(<GroundTrack orbit={FUNCUBE} observer={LONDON} placeName="Home" now={quiet} pass={null} passes={later} />);
    await screen.findByRole("img", { name: /^Ground track/ });
    const caption = screen.getByText(/Now over/);
    if (/Not above Home/.test(caption.textContent ?? "")) expect(caption.textContent).toMatch(/next up at \d\d:\d\d UTC/);
    expect(screen.queryByRole("radio", { name: "This pass" })).toBeNull();
  });

  it("draws a geostationary satellite as one dot that stays over its longitude", async () => {
    render(<GroundTrack orbit={ESHAIL} observer={LONDON} placeName="Home" now={NOW} pass={null} passes={[]} />);
    const map = await screen.findByRole("img", { name: /Geostationary: stays over 25\.\d° E/ });
    expect(map.getAttribute("aria-label")).toMatch(/Seen from Home \d+° above the horizon, bearing \d+° [NESW]+, all day\./);
    expect(screen.queryByText("The track as a table")).toBeNull();
  });
});
