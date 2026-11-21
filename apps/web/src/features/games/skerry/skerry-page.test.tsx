/**
 * The Skerry screen: typing at the prompt, Tab and the arrows, a level solved and the
 * next one offered, progress kept in this browser through a reload, and nothing fetched.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SkerryPage from "./skerry-page";

const fetched = vi.fn();
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", fetched);
});
afterEach(() => vi.unstubAllGlobals());

const show = () =>
  render(
    <MemoryRouter>
      <SkerryPage />
    </MemoryRouter>,
  );

const prompt = () => screen.getByRole("textbox", { name: /Command/ });
const terminal = () => screen.getByRole("log", { name: "Terminal" });

describe("Skerry", () => {
  it("opens on the first level with its story and goal, at a prompt that phones will not correct", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Skerry" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Level 1 of 12: Arrival" })).toBeInTheDocument();
    expect(terminal()).toHaveTextContent("Goal: Read Ines's welcome note.");
    expect(terminal()).toHaveAttribute("aria-live", "polite");
    expect(prompt()).toHaveAttribute("autocapitalize", "off");
    expect(prompt()).toHaveAttribute("spellcheck", "false");
    expect(prompt()).toHaveAttribute("enterkeyhint", "send");
  });

  it("runs what is typed, finishes names with Tab, and solves a level", async () => {
    const user = userEvent.setup();
    show();
    await user.type(prompt(), "ls{Enter}");
    expect(terminal()).toHaveTextContent("tarrow:~$ ls");
    expect(terminal()).toHaveTextContent("welcome.txt");
    await user.type(prompt(), "cat wel");
    await user.keyboard("{Tab}");
    expect(prompt()).toHaveValue("cat welcome.txt ");
    await user.keyboard("{Enter}");
    expect(terminal()).toHaveTextContent("Welcome to Tarrow Skerry!");
    expect(terminal()).toHaveTextContent("Solved.");
    expect(within(screen.getByRole("list")).getAllByText("Solved")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Next level: The key board" }));
    expect(screen.getByRole("heading", { name: "Level 2 of 12: The key board" })).toBeInTheDocument();
    expect(fetched).not.toHaveBeenCalled();
  });

  it("brings back earlier commands with the arrows and the buttons, and gives hints", async () => {
    const user = userEvent.setup();
    show();
    await user.type(prompt(), "pwd{Enter}ls -a{Enter}");
    expect(terminal()).toHaveTextContent("/home/keeper");
    await user.keyboard("{ArrowUp}");
    expect(prompt()).toHaveValue("ls -a");
    await user.keyboard("{ArrowUp}");
    expect(prompt()).toHaveValue("pwd");
    await user.click(screen.getByRole("button", { name: "Next command" }));
    expect(prompt()).toHaveValue("ls -a");
    await user.click(screen.getByRole("button", { name: "Next command" }));
    expect(prompt()).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Hint" }));
    expect(terminal()).toHaveTextContent("Hint 1 of 2: ls lists what is in the folder you are in.");
    await user.click(screen.getByRole("button", { name: "Tab" }));
    expect(prompt()).toHaveValue("");
  });

  it("keeps what has been solved and the level being played through a reload", async () => {
    const user = userEvent.setup();
    const first = show();
    await user.type(prompt(), "cat welcome.txt{Enter}");
    await user.click(screen.getByRole("button", { name: "Next level: The key board" }));
    first.unmount();
    show();
    expect(screen.getByRole("heading", { name: "Level 2 of 12: The key board" })).toBeInTheDocument();
    expect(screen.getByText("1 of 12 solved.", { exact: false })).toBeInTheDocument();
  });

  it("plays any level from the list", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: /Handover/ }));
    expect(screen.getByRole("heading", { name: "Level 12 of 12: Handover" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Handover/ })).toHaveAttribute("aria-current", "true");
  });

  it("starts with nothing kept when what is kept cannot be read", () => {
    localStorage.setItem("outpost.games.skerry", "{not json");
    show();
    expect(screen.getByRole("heading", { name: "Level 1 of 12: Arrival" })).toBeInTheDocument();
  });
});
