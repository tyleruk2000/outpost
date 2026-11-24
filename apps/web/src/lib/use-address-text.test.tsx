import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";
import { useAddressText } from "./use-address-text";

function Find() {
  const [text, written, setText] = useAddressText("q", 50);
  const [params, setParams] = useSearchParams();
  return (
    <>
      <input aria-label="Find" value={text} onChange={(event) => setText(event.target.value)} />
      <output aria-label="Address">{params.toString()}</output>
      <output aria-label="Written">{written}</output>
      <button type="button" onClick={() => setParams(new URLSearchParams({ place: "any" }))}>
        Clear the filters
      </button>
    </>
  );
}

describe("a find kept in the address", () => {
  it("keeps every letter typed quickly, writes the address after a pause, and follows the address when it is cleared", async () => {
    // Every key at once, with no pause between them.
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter initialEntries={["/frequencies?q=old&kind=marine"]}>
        <Find />
      </MemoryRouter>,
    );
    const box = screen.getByRole("textbox", { name: "Find" });
    expect(box).toHaveValue("old");
    await user.clear(box);
    await user.type(box, "time signal");
    expect(box).toHaveValue("time signal");
    // Not yet in the address: typing has not paused.
    expect(screen.getByLabelText("Written")).toHaveTextContent("old");
    await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
    expect(screen.getByLabelText("Address")).toHaveTextContent("q=time+signal&kind=marine");
    expect(screen.getByLabelText("Written")).toHaveTextContent("time signal");

    await user.click(screen.getByRole("button", { name: "Clear the filters" }));
    expect(box).toHaveValue("");
  });
});
