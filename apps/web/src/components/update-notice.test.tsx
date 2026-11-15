import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runningBuild, UpdateNotice } from "./update-notice";

function show(running: string | null, served: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(served), { status: 200, headers: { "content-type": "application/json" } })),
  );
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <UpdateNotice running={running} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("runningBuild", () => {
  it("reads the name of the script the page was started from, and nothing in development", () => {
    const built = new DOMParser().parseFromString(
      '<html><head><script type="module" crossorigin src="/assets/index-C9-rXAPD.js"></script></head></html>',
      "text/html",
    );
    expect(runningBuild(built)).toBe("index-C9-rXAPD.js");
    const dev = new DOMParser().parseFromString(
      '<html><head><script type="module" src="/src/main.tsx"></script></head></html>',
      "text/html",
    );
    expect(runningBuild(dev)).toBeNull();
  });
});

describe("the update notice", () => {
  it("offers a reload when the server serves a newer build than this tab is running", async () => {
    show("index-OLD.js", { status: "ok", web: "index-NEW.js" });
    expect(await screen.findByRole("status")).toHaveTextContent("Outpost has been updated");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("says nothing when the builds match, when the server does not say, or in development", async () => {
    const same = show("index-A.js", { status: "ok", web: "index-A.js" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    same.unmount();

    const silent = show("index-A.js", { status: "ok" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    silent.unmount();

    show(null, { status: "ok", web: "index-NEW.js" });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
