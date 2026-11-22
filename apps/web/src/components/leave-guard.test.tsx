/** Asking before unsaved changes are left: in the app, and on reload or close. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { LeaveGuard } from "./leave-guard";

function Form() {
  const [dirty, setDirty] = useState(false);
  return (
    <div>
      <h1>The form</h1>
      <button type="button" onClick={() => setDirty(true)}>
        Type something
      </button>
      <button type="button" onClick={() => setDirty(false)}>
        Save
      </button>
      <Link to="/elsewhere">Go elsewhere</Link>
      <Link to="/form?view=other">Another tab</Link>
      <LeaveGuard when={dirty} what="the changes to this sheet" />
    </div>
  );
}

function show() {
  const router = createMemoryRouter(
    [
      { path: "/form", element: <Form /> },
      { path: "/elsewhere", element: <h1>Elsewhere</h1> },
    ],
    { initialEntries: ["/form"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("LeaveGuard", () => {
  it("lets the person go when nothing is unsaved", async () => {
    show();
    await userEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
    expect(await screen.findByRole("heading", { name: "Elsewhere" })).toBeInTheDocument();
  });

  it("asks before another screen, and stays or leaves as answered", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Type something" }));
    await userEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
    const ask = await screen.findByRole("alertdialog", { name: "Leave without saving?" });
    expect(ask).toHaveTextContent("The changes to this sheet are not saved yet.");
    await userEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("heading", { name: "The form" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Go elsewhere" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(await screen.findByRole("heading", { name: "Elsewhere" })).toBeInTheDocument();
  });

  it("does not ask about another tab of the same screen unless told to", async () => {
    const router = show();
    await userEvent.click(screen.getByRole("button", { name: "Type something" }));
    await userEvent.click(screen.getByRole("link", { name: "Another tab" }));
    expect(router.state.location.search).toBe("?view=other");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks the browser before a reload or close while something is unsaved", async () => {
    show();
    const askedOnUnload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(askedOnUnload()).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Type something" }));
    expect(askedOnUnload()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(askedOnUnload()).toBe(false);
  });
});
