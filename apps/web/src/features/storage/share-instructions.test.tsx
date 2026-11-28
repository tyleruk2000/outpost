import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ShareInstructions } from "./share-instructions";

const hints = { uid: 1000, gid: 1000, mountBase: "/storage" };

function show(mode: "docker" | "linux") {
  render(
    <Dialog open>
      <DialogContent title="Connect a network share">
        <ShareInstructions mode={mode} hints={hints} onClose={() => {}} />
      </DialogContent>
    </Dialog>,
  );
}

async function fill() {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Server" }), "192.168.1.20");
  await user.type(screen.getByRole("textbox", { name: "Share" }), "docs");
  await user.type(screen.getByRole("textbox", { name: "User name" }), "walker");
}

describe("the steps for a share Outpost cannot connect itself", () => {
  it("in Docker, lead with deploy/pi/nas-share.sh filled in, then the steps by hand", async () => {
    show("docker");
    await fill();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent)
      .slice(1);
    expect(headings).toEqual(["On a Raspberry Pi: one command does it", "Anywhere else: what to do by hand"]);
    expect(screen.getByText("./deploy/pi/nas-share.sh --dry-run --server 192.168.1.20 --share docs --user walker")).toBeInTheDocument();
    expect(screen.getByText("./deploy/pi/nas-share.sh --server 192.168.1.20 --share docs --user walker")).toBeInTheDocument();
  });

  it("on Linux without Docker, offer only the steps by hand: the script is for Outpost in Docker", async () => {
    show("linux");
    await fill();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent)
        .slice(1),
    ).toEqual(["What to do"]);
    expect(screen.queryByText(/nas-share\.sh/)).not.toBeInTheDocument();
  });
});
