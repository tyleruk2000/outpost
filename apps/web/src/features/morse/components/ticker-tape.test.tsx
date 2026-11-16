import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TickerTape } from "./ticker-tape";

describe("TickerTape", () => {
  it("gives the decoded text as a log that is only added to", () => {
    render(<TickerTape text="CQ CQ" pending=".-" wpm={18} />);
    const log = screen.getByRole("log", { name: "Decoded Morse" });
    expect(log).toHaveTextContent("CQ CQ");
    // The dits and dahs in progress change on every press; they are visual only.
    expect(log.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText("about 18 wpm")).toBeInTheDocument();
  });

  it("shows the placeholder and no speed until something has been decoded", () => {
    render(<TickerTape text="" pending="" wpm={0} placeholder="Key your reply" />);
    expect(screen.getByRole("log")).toHaveTextContent("Key your reply");
    expect(screen.queryByText(/wpm/)).not.toBeInTheDocument();
  });
});
