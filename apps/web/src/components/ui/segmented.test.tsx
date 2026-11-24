import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Segmented } from "./misc";

function Units() {
  const [unit, setUnit] = useState<"m2" | "ft2" | "acre">("m2");
  return (
    <>
      <button type="button">Before</button>
      <Segmented
        label="Units"
        value={unit}
        onChange={setUnit}
        options={[
          { value: "m2", label: "m²" },
          { value: "ft2", label: "sq ft" },
          { value: "acre", label: "acres" },
        ]}
      />
      <output aria-label="Chosen">{unit}</output>
    </>
  );
}

describe("a segmented choice", () => {
  it("chooses as an arrow key moves along it, as a group of radio buttons does, and Tab alone chooses nothing", async () => {
    const user = userEvent.setup();
    render(<Units />);
    await user.click(screen.getByRole("button", { name: "Before" }));
    await user.tab();
    expect(screen.getByRole("radio", { name: "m²" })).toHaveFocus();
    expect(screen.getByLabelText("Chosen")).toHaveTextContent("m2");

    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("radio", { name: "sq ft" })).toHaveFocus());
    expect(screen.getByLabelText("Chosen")).toHaveTextContent("ft2");
    expect(screen.getByRole("radio", { name: "sq ft" })).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{End}");
    await waitFor(() => expect(screen.getByLabelText("Chosen")).toHaveTextContent("acre"));
    await user.keyboard("{ArrowRight}");
    // Round to the first again.
    await waitFor(() => expect(screen.getByLabelText("Chosen")).toHaveTextContent("m2"));
  });
});
