import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerProps, MESSAGE_MAX } from "./composer";
import { keyboardInset } from "./use-keyboard-inset";

function Harness(props: Partial<ComposerProps> & { start?: string }) {
  const [value, setValue] = useState(props.start ?? "");
  const [library, setLibrary] = useState(props.useLibrary ?? false);
  return (
    <MemoryRouter>
      <Composer value={value} onChange={setValue} onSend={() => {}} useLibrary={library} onUseLibrary={setLibrary} {...props} />
    </MemoryRouter>
  );
}

const box = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Your message" });

/** As on a phone: the keyboard has no Shift+Enter, so the browser reports a coarse pointer. */
function onATouchKeyboard() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes("coarse") })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

afterEach(() => vi.restoreAllMocks());

describe("the message box", () => {
  it("sends on Enter, makes a new line on Shift+Enter, and sends nothing that is only spaces", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} />);
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    await user.type(box(), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();

    await user.clear(box());
    await user.type(box(), "First line{Shift>}{Enter}{/Shift}second line");
    expect(box()).toHaveValue("First line\nsecond line");
    expect(onSend).not.toHaveBeenCalled();
    expect(send).toBeEnabled();

    await user.type(box(), "{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    // The box is cleared by whoever sent the message, not by the key press.
    expect(box()).toHaveValue("First line\nsecond line");
  });

  it("leaves Enter to an input method that is still choosing a character", () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} start="にほん" />);
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("on a touch keyboard, Enter makes a new line and the button sends", async () => {
    const restore = onATouchKeyboard();
    try {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<Harness onSend={onSend} autoFocus />);
      // The keyboard is not thrown up over the conversation just because the screen opened.
      expect(box()).not.toHaveFocus();
      await user.type(box(), "One{Enter}two");
      expect(box()).toHaveValue("One\ntwo");
      expect(onSend).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Send" }));
      expect(onSend).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it("grows with what is typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // jsdom lays nothing out; say how tall the text would be.
    Object.defineProperty(box(), "scrollHeight", { configurable: true, get: () => 44 + box().value.split("\n").length * 24 });
    await user.type(box(), "one{Shift>}{Enter}{/Shift}two{Shift>}{Enter}{/Shift}three");
    expect(box().style.height).toBe(`${44 + 3 * 24}px`);
    await user.clear(box());
    expect(box().style.height).toBe(`${44 + 24}px`);
  });

  it("takes focus on a screen with a keyboard of its own", () => {
    render(<Harness autoFocus />);
    expect(box()).toHaveFocus();
  });

  it("shows Stop in place of Send while a reply is written, and still takes typing", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} onStop={onStop} />);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await user.type(box(), "The next thing{Enter}");
    expect(box()).toHaveValue("The next thing");
    expect(onSend).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("says why a message cannot be sent, and does not send it", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSend={onSend} blocked="Choose a model first" start="Hello" />);
    expect(screen.getByText("Choose a model first")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(box(), "{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("refuses a message longer than the server takes, and says by how much", () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} start={"x".repeat(MESSAGE_MAX + 12)} />);
    expect(screen.getByRole("alert")).toHaveTextContent("12 characters too long");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("says exactly what the model will be given, and changes with the switch", async () => {
    const onUseLibrary = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <Composer value="" onChange={() => {}} onSend={() => {}} useLibrary={false} onUseLibrary={onUseLibrary} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("chat-mode")).toHaveTextContent(
      "A plain conversation: the model answers from what it learned, and nothing from your library is sent.",
    );
    await user.click(screen.getByRole("switch", { name: "Use my library" }));
    expect(onUseLibrary).toHaveBeenCalledWith(true);
    rerender(
      <MemoryRouter>
        <Composer value="" onChange={() => {}} onSend={() => {}} useLibrary onUseLibrary={onUseLibrary} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("chat-mode")).toHaveTextContent(
      "From your library: each message is answered from passages found in your documents, notes and books, which are sent to the model with it.",
    );
    // The sentence is the description of the box, for someone who cannot see it.
    expect(box()).toHaveAccessibleDescription(/From your library/);
  });

  it("has no switch in a conversation about one item, and names the item", () => {
    render(<Harness scope={{ kind: "document", title: "Stove care", url: "/library/documents/d1" }} />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByTestId("chat-mode")).toHaveTextContent("Each message is answered from passages of Stove care alone");
    expect(screen.getByRole("link", { name: "Stove care" })).toHaveAttribute("href", "/library/documents/d1");
    expect(box()).toHaveAttribute("placeholder", "Ask about this document");
  });

  it("writes the last message again: says what sending will do, and Escape puts it back", async () => {
    const onCancelEdit = vi.fn();
    const user = userEvent.setup();
    render(<Harness editing onCancelEdit={onCancelEdit} start="Secnod mesage" />);
    expect(screen.getByText("Writing your last message again. Sending replaces it and its reply.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send again" })).toBeEnabled();
    expect(box()).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Keep the message as it was" }));
    expect(onCancelEdit).toHaveBeenCalledTimes(2);
  });
});

describe("how much of the window a phone's keyboard covers", () => {
  it("is the difference between the window and what can be seen of it", () => {
    expect(keyboardInset(844, { height: 844, scale: 1 })).toBe(0);
    expect(keyboardInset(844, { height: 508, scale: 1 })).toBe(336);
  });

  it("is nothing for a toolbar sliding away, a pinch to zoom, or a browser that does not say", () => {
    expect(keyboardInset(844, { height: 790, scale: 1 })).toBe(0);
    expect(keyboardInset(844, { height: 422, scale: 2 })).toBe(0);
    expect(keyboardInset(844, null)).toBe(0);
  });
});
