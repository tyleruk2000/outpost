/**
 * The five screens of calculators: each opens with its heading and an answer from the
 * figures it starts with, says what is wrong with a figure that cannot be used, keeps a
 * unit chosen on this device, and refuses outside a formula's range.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchesWords } from "@/components/command-palette";
import { prepareScreens } from "@/features/prepare/screens";
import BuildingPage from "./building/building-page";
import CookingPage from "./cooking/cooking-page";
import OutdoorsPage from "./outdoors/outdoors-page";
import RadioToolsPage from "./radio/radio-tools-page";
import { toolScreens } from "./screens";
import WaterPage from "./water/water-page";

function show(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The calculator section with this heading. */
const section = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  localStorage.clear();
});

describe("the Tools registry", () => {
  it("lists the five screens of calculators, each with a heading of the same name", () => {
    expect(toolScreens.map((item) => [item.to, item.label])).toEqual(
      expect.arrayContaining([
        ["/tools/water", "Water"],
        ["/tools/outdoors", "Outdoors"],
        ["/tools/radio", "Radio calculators"],
        ["/tools/building", "Building"],
        ["/tools/cooking", "Cooking"],
      ]),
    );
  });
});

describe("the quick search, for the screens under Tools and Preparedness", () => {
  const found = (typed: string) =>
    [...toolScreens, ...prepareScreens]
      .filter((item) => matchesWords(`${item.label} ${item.keywords ?? ""}`, typed))
      .map((item) => item.to);

  it("knows every screen by other words than its name", () => {
    for (const item of [...toolScreens, ...prepareScreens]) expect(item.keywords, item.label).toBeTruthy();
  });

  it("finds a screen by the words people type for it", () => {
    expect(found("hiking")).toContain("/tools/outdoors");
    expect(found("antenna")).toContain("/tools/radio");
    expect(found("solar panel")).toContain("/tools/power");
    expect(found("wifi")).toContain("/tools/qr");
    expect(found("sundial")).toContain("/tools/solar-clock");
    expect(found("food")).toContain("/prepare/supplies");
    expect(found("flood")).toContain("/prepare/weather");
    expect(found("fallout")).toContain("/prepare/nuclear");
    expect(found("grab bag")).toContain("/prepare/plans");
  });
});

describe("the water screen", () => {
  it("works out water to store from the UK figure, and lists every body's figure beside it", () => {
    show(<WaterPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Water" })).toBeInTheDocument();
    const storage = section("Water to store");
    // Two people, three days, three litres each a day.
    expect(within(storage).getAllByText("18 litres")[0]).toHaveClass("text-heading");
    expect(within(storage).getByText("WHO, basic needs")).toBeInTheDocument();
  });

  it("says what is wrong with a figure, and gives no answer until it is put right", async () => {
    const user = userEvent.setup();
    show(<WaterPage />);
    const storage = section("Water to store");
    const people = within(storage).getByLabelText("People");
    await user.clear(people);
    await user.type(people, "two");
    expect(within(storage).getByRole("alert")).toHaveTextContent("Type a figure in numbers, such as 12.5.");
    expect(within(storage).getByText("Correct the figure marked above to see the answer.")).toBeInTheDocument();
  });

  it("gives the boiling time for a height, and the EPA's bleach table exactly", async () => {
    const user = userEvent.setup();
    show(<WaterPage />);
    const purification = section("Making water safe to drink");
    expect(within(purification).getByText("1 minute")).toBeInTheDocument();
    const height = within(purification).getByLabelText("Your height above sea level");
    await user.clear(height);
    await user.type(height, "2500");
    expect(within(purification).getByText("3 minutes")).toBeInTheDocument();
    expect(within(purification).getByText("16 drops (1/4 tsp)")).toBeInTheDocument();
    // The printable sheet is offered with the shared buttons.
    expect(within(purification).getByText(/Save as PDF/)).toBeInTheDocument();
  });

  it("works out rain from a roof as a range over the two published coefficients", () => {
    show(<WaterPage />);
    // 50 m², 10 mm, tiles 0.8 to 0.9, filter 0.9.
    expect(within(section("Rainwater from a roof")).getByText("360 to 410 litres")).toBeInTheDocument();
  });
});

describe("the outdoors screen", () => {
  it("works out Naismith's time for the walk it starts with", () => {
    show(<OutdoorsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Outdoors" })).toBeInTheDocument();
    // 12 km and 600 m of climb: 2 h 24 min and 1 h, 3 h 24 min, shown to the quarter hour the rule's round figures support.
    expect(within(section("Walking time")).getByText("3 hours 30 minutes")).toBeInTheDocument();
    expect(
      within(section("Walking time")).getByText(/Rounded to 5 minutes under 2 hours, the quarter hour under 12 hours/),
    ).toBeInTheDocument();
  });

  it("refuses wind chill outside the range it is defined for", async () => {
    const user = userEvent.setup();
    show(<OutdoorsPage />);
    const windChill = section("Wind chill");
    const air = within(windChill).getByLabelText("Air temperature");
    await user.clear(air);
    await user.type(air, "15");
    expect(within(windChill).getByText(/defined only for air at 10 °C/)).toBeInTheDocument();
  });

  it("keeps a unit chosen on this device", async () => {
    const user = userEvent.setup();
    const first = show(<OutdoorsPage />);
    const walking = section("Walking time");
    await user.click(within(walking).getAllByRole("radio", { name: "ft" })[0]!);
    first.unmount();
    show(<OutdoorsPage />);
    expect(within(section("Walking time")).getAllByRole("radio", { name: "ft" })[0]).toHaveAttribute("data-state", "on");
  });

  it("works out distance and bearing between a grid reference and decimal degrees", () => {
    show(<OutdoorsPage />);
    const distance = section("Distance, bearing and coordinates");
    expect(within(distance).getByText(/km \(/)).toBeInTheDocument();
    expect(within(distance).getAllByText(/Maidenhead: IO84/).length).toBeGreaterThan(0);
  });
});

describe("the radio screen", () => {
  it("gives a 40 m dipole's legs and the S9 conventions", () => {
    show(<RadioToolsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Radio calculators" })).toBeInTheDocument();
    // 142.4 ÷ 7.1 = 20.06 m, in two legs.
    expect(within(section("Antenna lengths")).getByText("10.03 m")).toBeInTheDocument();
    expect(within(section("Cable loss")).getByText(/dB$/)).toBeInTheDocument();
  });

  it("gives a battery's running time to the hour its estimates support, not to the minute", () => {
    show(<RadioToolsPage />);
    // 2,000 mAh × 80% ÷ 127.5 mA on average = 12.55 hours.
    expect(within(section("Battery life")).getByText("13 hours")).toBeInTheDocument();
  });

  it("does not guess a cable's loss outside its published frequencies", async () => {
    const user = userEvent.setup();
    show(<RadioToolsPage />);
    const coax = section("Cable loss");
    const frequency = within(coax).getByLabelText("Frequency");
    await user.clear(frequency);
    await user.type(frequency, "10");
    expect(within(coax).getByText(/does not guess outside them/)).toBeInTheDocument();
  });
});

describe("the building screen", () => {
  it("plans a cutting list and says how it was done", () => {
    show(<BuildingPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Building" })).toBeInTheDocument();
    const cutting = section("Cutting list");
    expect(within(cutting).getByText(/^Board 1,/)).toBeInTheDocument();
    expect(within(cutting).getByText(/not guaranteed to use the fewest boards/)).toBeInTheDocument();
  });

  it("works out a U-value from the layers, and heat loss from it", () => {
    show(<BuildingPage />);
    expect(within(section("U-value of a wall or roof")).getByText(/W\/m²K$/)).toBeInTheDocument();
    // 0.3 × 20 m² × 22 °C.
    expect(within(section("Heat loss")).getByText("132 W")).toBeInTheDocument();
  });
});

describe("the cooking screen", () => {
  it("gives the FSA's roasting time and starts a timer from it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
    try {
      show(<CookingPage />);
      expect(screen.getByRole("heading", { level: 1, name: "Cooking" })).toBeInTheDocument();
      const roasting = section("Roasting a bird");
      // A 2 kg chicken: 45 minutes per kg plus 20 minutes.
      expect(within(roasting).getByText("1 hour 50 minutes")).toBeInTheDocument();
      fireEvent.click(within(roasting).getByRole("button", { name: "Start a timer for this" }));
      expect(within(section("Timer")).getByRole("timer")).toHaveTextContent("1:50:00");
      expect(within(section("Timer")).getByRole("button", { name: "Pause" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("quotes the FSA's temperatures and offers them as a sheet", () => {
    show(<CookingPage />);
    const safe = section("Safe cooking temperatures");
    expect(within(safe).getByText("70°C (158°F)")).toBeInTheDocument();
    expect(within(safe).getByText(/Save as PDF/)).toBeInTheDocument();
  });

  it("keeps the From unit of weight and of volume when switching between them", async () => {
    const user = userEvent.setup();
    show(<CookingPage />);
    const convert = section("Weights and measures");
    const pick = async (label: string, option: string) => {
      await user.click(within(convert).getByRole("combobox", { name: label }));
      await user.click(screen.getByRole("option", { name: option }));
    };
    await pick("From", "pounds");
    await user.click(within(convert).getByRole("radio", { name: "Volume" }));
    await pick("From", "US cups");
    await user.click(within(convert).getByRole("radio", { name: "Weight" }));
    expect(within(convert).getByRole("combobox", { name: "From" })).toHaveTextContent("pounds");
    await user.click(within(convert).getByRole("radio", { name: "Volume" }));
    expect(within(convert).getByRole("combobox", { name: "From" })).toHaveTextContent("US cups");
  });

  it("scales a recipe", () => {
    show(<CookingPage />);
    expect(within(section("Scaling a recipe")).getByText("750 g minced beef")).toBeInTheDocument();
  });
});

describe("figures at the edges", () => {
  it("water: a filter whose figures run past any calendar says so instead of failing", async () => {
    const user = userEvent.setup();
    show(<WaterPage />);
    const filter = section("Filter life");
    const rated = within(filter).getByLabelText("Rated capacity, from its label");
    await user.clear(rated);
    await user.type(rated, "1e15");
    expect(within(filter).getByText(/more than 100 years/)).toBeInTheDocument();
  });

  it("water: gives UK gallons for both ends of a range", () => {
    localStorage.setItem("outpost.tools.choice.water.storage.figure", "who-basic");
    show(<WaterPage />);
    // 2 people, 3 days, 7.5 to 15 litres: 45 to 90 litres.
    expect(within(section("Water to store")).getByText(/About 10 to 20 UK gallons/)).toBeInTheDocument();
  });

  it("water: says how long rain lasts in days, no more precisely than the yield", () => {
    localStorage.setItem("outpost.tools.input.water.rain.use", JSON.stringify({ text: "8", unit: "l" }));
    show(<WaterPage />);
    // 360 to 405 litres at 8 litres a day.
    expect(within(section("Rainwater from a roof")).getByText(/lasts 45 to 51 days/)).toBeInTheDocument();
  });

  it("radio: path loss needs no transmitter power, which is optional", async () => {
    const user = userEvent.setup();
    show(<RadioToolsPage />);
    const pathLoss = section("Free-space path loss");
    await user.clear(within(pathLoss).getByLabelText(/Transmitter power/));
    expect(within(pathLoss).queryByRole("alert")).toBeNull();
    expect(within(pathLoss).getByText(/^\d+(\.\d)? dB$/)).toBeInTheDocument();
  });

  it("radio: gives no path loss closer than a wavelength, where the formula would give less than none", async () => {
    const user = userEvent.setup();
    show(<RadioToolsPage />);
    const pathLoss = section("Free-space path loss");
    const frequency = within(pathLoss).getByLabelText("Frequency");
    await user.clear(frequency);
    await user.type(frequency, "7.1");
    const distance = within(pathLoss).getByLabelText("Distance");
    await user.clear(distance);
    await user.type(distance, "0.001");
    expect(within(pathLoss).getByText(/wavelength/)).toBeInTheDocument();
    expect(within(pathLoss).queryByText(/^-?\d+(\.\d)? dB$/)).toBeNull();
  });

  it("radio: an S-unit reading below S9 is not held up by the hidden decibels-over field", async () => {
    localStorage.setItem("outpost.tools.choice.radio.levels.scale", "s-hf");
    localStorage.setItem("outpost.tools.input.radio.levels.value", JSON.stringify({ text: "9" }));
    localStorage.setItem("outpost.tools.input.radio.levels.over", JSON.stringify({ text: "" }));
    const user = userEvent.setup();
    show(<RadioToolsPage />);
    const levels = section("Watts, dBm and S-units");
    const level = within(levels).getByLabelText("Level");
    await user.clear(level);
    await user.type(level, "8");
    expect(within(levels).getAllByText("-79 dBm")[0]).toHaveClass("text-heading");
  });

  it("building: one sheet is one sheet", async () => {
    const user = userEvent.setup();
    show(<BuildingPage />);
    const sheets = section("Sheets and fixings");
    const area = within(sheets).getByLabelText("Area to cover");
    await user.clear(area);
    await user.type(area, "1");
    expect(within(sheets).getByText("1 sheet")).toBeInTheDocument();
  });
});
