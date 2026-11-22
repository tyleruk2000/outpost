import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { RouteAnnouncer } from "./route-announcer";

function OwnTitle() {
  useEffect(() => {
    document.title = "Field manual / Outpost";
    return () => {
      document.title = "Outpost";
    };
  }, []);
  return <h1>Field manual, page 3</h1>;
}

function App() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/settings">Settings</Link>
        <Link to="/doc">Document</Link>
        <Link to="/map">Map</Link>
      </nav>
      <main id="content">
        <Routes>
          <Route index element={<h1>Your library</h1>} />
          <Route path="settings" element={<h1>Settings</h1>} />
          <Route path="doc" element={<OwnTitle />} />
          <Route path="map" element={<p>No heading here</p>} />
        </Routes>
      </main>
      <RouteAnnouncer />
    </MemoryRouter>
  );
}

afterEach(() => {
  document.title = "Outpost";
});

describe("RouteAnnouncer", () => {
  it("names the tab after the screen's heading, and says a move to another screen aloud, but not the first", async () => {
    document.title = "Outpost";
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.title).toBe("Your library / Outpost"));
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");

    await user.click(screen.getByRole("link", { name: "Settings" }));
    await waitFor(() => expect(document.title).toBe("Settings / Outpost"));
    await waitFor(() => expect(region).toHaveTextContent("Settings"));
  });

  it("leaves a screen's own name for the tab alone, and does not keep the last name on a screen with no heading", async () => {
    document.title = "Outpost";
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    await waitFor(() => expect(document.title).toBe("Settings / Outpost"));
    await user.click(screen.getByRole("link", { name: "Document" }));
    await act(() => new Promise((done) => setTimeout(done, 300)));
    expect(document.title).toBe("Field manual / Outpost");
    expect(screen.getByRole("status")).toHaveTextContent("Field manual, page 3");
    await user.click(screen.getByRole("link", { name: "Settings" }));
    await waitFor(() => expect(document.title).toBe("Settings / Outpost"));
    await user.click(screen.getByRole("link", { name: "Map" }));
    await act(() => new Promise((done) => setTimeout(done, 300)));
    expect(document.title).toBe("Outpost");
  });
});
