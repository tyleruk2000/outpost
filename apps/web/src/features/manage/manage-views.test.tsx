import { ERASE_CONFIRMATION } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import CleanupView from "./cleanup-view";
import ItemsView from "./items-view";
import { JobAccount } from "./job-account";
import LeftoversView from "./leftovers-view";
import SpaceView from "./space-view";
import { fakeApi, item, job, leftover, plan, renderScreen, sampleItems, status, usage } from "./test-support";

afterEach(() => vi.unstubAllGlobals());

describe("everything installed", () => {
  it("adds up the selection as things are ticked, and keeps it while the list is narrowed", async () => {
    fakeApi({ "GET /api/manage/items": { items: sampleItems } });
    renderScreen(<ItemsView busy={false} />);
    const user = userEvent.setup();

    expect(await screen.findByText("4 items, 2.41 GB")).toBeVisible();
    // Largest first to begin with.
    const rows = within(screen.getByRole("list", { name: "Everything installed" })).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getAllByRole("link")[0]?.textContent)).toEqual([
      "Wikipedia",
      "The Alps",
      "Seed saving handbook",
      "Radio operating reference",
    ]);
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select Wikipedia" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Radio operating reference" }));
    const selection = screen.getByRole("region", { name: "Selection" });
    expect(within(selection).getByText("2 items selected")).toBeVisible();
    expect(selection).toHaveTextContent("1.80 GB");

    await user.type(screen.getByRole("searchbox", { name: "Filter by name" }), "alps");
    expect(screen.getByText("1 item, 600 MB shown of 4 items")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Select Wikipedia" })).not.toBeInTheDocument();
    // What was ticked is still ticked, though it is not on show.
    expect(within(selection).getByText("2 items selected")).toBeVisible();

    // "Select everything shown" adds only what is shown.
    await user.click(screen.getByRole("checkbox", { name: "Select everything shown" }));
    expect(within(selection).getByText("3 items selected")).toBeVisible();
    await user.click(within(selection).getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument();
  });

  it("says what is the matter with an item that is away, missing or busy", async () => {
    fakeApi({
      "GET /api/manage/items": {
        items: [
          item({ locationAvailable: false, locationName: "Field SSD" }),
          item({ id: "c2", key: "collection:c2", title: "Atlas", state: "missing" }),
          item({ id: "c3", key: "collection:c3", title: "Manual", state: "busy", busyReason: "It is being moved or checked." }),
        ],
      },
    });
    renderScreen(<ItemsView busy={false} />);
    expect(await screen.findByText("Not connected")).toBeVisible();
    expect(screen.getByText(/cannot be deleted while the location is away, only forgotten/)).toBeVisible();
    expect(screen.getByText("File missing")).toBeVisible();
    expect(screen.getByText("Being moved or checked")).toBeVisible();
    expect(screen.getByText("It is being moved or checked.")).toBeVisible();
  });

  it("shows the summary before removing, asks again when a choice changes, and removes only on confirmation", async () => {
    const api = fakeApi({
      "GET /api/manage/items": { items: sampleItems },
      "POST /api/manage/plan": (body: unknown) => {
        const request = body as { disconnected: string; files: string };
        return plan({
          changes: request.disconnected === "forget" ? 3 : 2,
          disconnected: {
            count: 1,
            bytes: 600_000_000,
            files: [
              {
                title: "The Alps",
                locationName: "Field SSD",
                path: "/Volumes/FieldSSD/outpost/collections/maps/alps.pmtiles",
                bytes: 600_000_000,
              },
            ],
          },
          refused: [{ key: "collection:x", title: "Road atlas", reason: "It is being moved or checked." }],
        });
      },
      "POST /api/manage/remove": { job: job() },
    });
    renderScreen(<ItemsView busy={false} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Select everything" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    const dialog = await screen.findByRole("dialog", { name: "Remove 4 items" });
    expect(await within(dialog).findByText("2 items will be deleted, files and all: 1.80 GB.")).toBeVisible();
    expect(within(dialog).getByText(/is the same file as a catalogue item here, and goes with it/)).toBeVisible();
    // By kind and by location.
    expect(within(dialog).getByRole("row", { name: /Reference archive\s*1\s*1\.80 GB/ })).toBeVisible();
    expect(within(dialog).getByRole("row", { name: /Internal storage\s*2 items, 1\.80 GB deleted/ })).toBeVisible();
    // What is on a drive that is away, by name and path, and what is refused and why.
    expect(within(dialog).getByText("1 item is on a location that is not connected")).toBeVisible();
    expect(within(dialog).getByText("/Volumes/FieldSSD/outpost/collections/maps/alps.pmtiles")).toBeVisible();
    expect(within(dialog).getByText("Road atlas")).toBeVisible();
    expect(api.bodiesOf("POST /api/manage/remove")).toEqual([]);
    expect(api.bodiesOf("POST /api/manage/plan")[0]).toEqual({
      scope: "items",
      keys: ["collection:c1", "collection:c2", "collection:c3", "document:d1"],
      files: "delete",
      disconnected: "leave",
    });

    await user.click(within(dialog).getByRole("checkbox", { name: /Forget it anyway/ }));
    const confirm = await within(dialog).findByRole("button", { name: "Remove 3 items" });
    expect(api.bodiesOf("POST /api/manage/plan").at(-1)).toMatchObject({ disconnected: "forget" });
    await user.click(confirm);
    await waitFor(() =>
      expect(api.bodiesOf("POST /api/manage/remove")).toEqual([
        { keys: ["collection:c1", "collection:c2", "collection:c3", "document:d1"], files: "delete", disconnected: "forget" },
      ]),
    );
    // Once started, the dialog closes and nothing stays selected.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument();
  });

  it("will not start a removal when nothing would change, or while another clean-up runs", async () => {
    fakeApi({
      "GET /api/manage/items": { items: sampleItems },
      "POST /api/manage/plan": plan({ changes: 0, remove: { count: 0, bytes: 0 }, byKind: [], byLocation: [] }),
    });
    const view = renderScreen(<ItemsView busy />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Select Wikipedia" }));
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    view.unmount();

    renderScreen(<ItemsView busy={false} />);
    await user.click(await screen.findByRole("checkbox", { name: "Select Wikipedia" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Nothing will be deleted.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Remove 0 items" })).toBeDisabled();
  });

  it("moves a selection to a location with room, and names what could not be moved", async () => {
    const api = fakeApi({
      "GET /api/manage/items": { items: sampleItems },
      "GET /api/storage/locations": {
        roots: [],
        locations: [
          {
            id: "loc1",
            name: "Internal storage",
            isDefault: true,
            status: "available",
            freeBytes: 60_000_000_000,
            totalBytes: 500_000_000_000,
          },
          {
            id: "usb",
            name: "Field SSD",
            isDefault: false,
            status: "available",
            freeBytes: 400_000_000_000,
            totalBytes: 1_000_000_000_000,
          },
          { id: "card", name: "SD card", isDefault: false, status: "available", freeBytes: 300_000_000, totalBytes: 32_000_000_000 },
        ],
      },
      "POST /api/manage/move": {
        jobs: [job({ type: "collection.move", title: "Move Wikipedia to Field SSD" })],
        refused: [{ key: "collection:c2", title: "The Alps", reason: 'It is already on "Field SSD".' }],
      },
    });
    renderScreen(<ItemsView busy={false} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Select Wikipedia" }));
    await user.click(screen.getByRole("checkbox", { name: "Select The Alps" }));
    await user.click(screen.getByRole("button", { name: "Move" }));

    const dialog = await screen.findByRole("dialog", { name: "Move 2 items" });
    expect(within(dialog).getByText("2 items, 2.40 GB")).toBeVisible();
    // A location too small for the selection is shown, says why, and cannot be chosen.
    expect(await within(dialog).findByRole("radio", { name: /SD card/ })).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: /Field SSD/ }));
    expect(within(dialog).getByText(/1\.80 GB will be copied to “Field SSD”\. 1 item already there stays as it is\./)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Move 1 item" }));

    expect(await within(dialog).findByText(/The move has started as 1 job/)).toBeVisible();
    expect(within(dialog).getByText('It is already on "Field SSD".')).toBeVisible();
    expect(api.bodiesOf("POST /api/manage/move")).toEqual([{ keys: ["collection:c1", "collection:c2"], locationId: "usb" }]);
  });

  it("invites the first step when nothing is installed", async () => {
    fakeApi({ "GET /api/manage/items": { items: [] } });
    renderScreen(<ItemsView busy={false} />);
    expect(await screen.findByRole("heading", { name: "Nothing is installed yet" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Find collections in Explore" })).toHaveAttribute("href", "/explore");
  });
});

describe("the clean-ups", () => {
  const everything = plan({
    scope: "everything",
    changes: 5,
    remove: { count: 4, bytes: 2_000_000_000 },
    own: { count: 1, bytes: 5_000_000 },
    outside: {
      count: 1,
      bytes: 96_000_000,
      files: [
        { title: "Family archive", locationName: "Internal storage", path: "/srv/outpost/my-archives/family.zim", bytes: 96_000_000 },
      ],
    },
    personal: {
      pages: 3,
      attachments: { count: 0, bytes: 0 },
      places: 1,
      routes: 0,
      contacts: 0,
      conversations: 0,
      repeaters: 0,
      repeaterLists: 0,
      settings: 2,
      vectors: 0,
      previous: { count: 0, bytes: 0 },
    },
  });

  it("does not offer erase everything on another device, and says why and how that can be changed", () => {
    fakeApi({});
    renderScreen(
      <CleanupView
        loading={false}
        status={status({ erase: { allowed: false, reason: "remote", option: "OUTPOST_ALLOW_REMOTE_ERASE" } })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Erase everything and start again" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Erase everything" })).not.toBeInTheDocument();
    expect(screen.getByText("Not offered on this device")).toBeVisible();
    expect(screen.getByText(/can only be started at the computer Outpost runs on/)).toBeVisible();
    expect(screen.getByText("OUTPOST_ALLOW_REMOTE_ERASE=true")).toBeVisible();
    // Removing downloaded content is still offered, as removing items one at a time is.
    expect(screen.getByRole("button", { name: "Remove downloaded content" })).toBeEnabled();
  });

  it("erases only after the summary has been shown and the phrase typed, and offers a backup first", async () => {
    const api = fakeApi({
      "POST /api/manage/plan": everything,
      "POST /api/manage/cleanup/everything": { job: job({ type: "manage.erase", title: "Erase everything" }) },
    });
    renderScreen(<CleanupView loading={false} status={status()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Erase everything" }));

    const dialog = await screen.findByRole("dialog", { name: "Erase everything and start again" });
    expect(await within(dialog).findByText("This cannot be undone.")).toBeVisible();
    expect(within(dialog).getByText("4 items will be deleted, files and all: 2.00 GB.")).toBeVisible();
    expect(within(dialog).getByText("1 item (5.00 MB) is your own and cannot be downloaded again.")).toBeVisible();
    expect(within(dialog).getByText(/Also erased: 3 pages of notes, 1 saved place, 2 changed settings and the history/)).toBeVisible();
    // What it will not delete, and where that is.
    expect(within(dialog).getByText("1 file will be left where they are")).toBeVisible();
    expect(within(dialog).getByText("/srv/outpost/my-archives/family.zim")).toBeVisible();
    // The backup, and what it does not hold.
    expect(within(dialog).getByRole("link", { name: "Download a backup" })).toHaveAttribute("href", "/api/backup/download");
    expect(within(dialog).getByText(/does not hold the files of documents you added/)).toBeVisible();

    const confirm = within(dialog).getByRole("button", { name: "Erase everything" });
    expect(confirm).toBeDisabled();
    const field = within(dialog).getByRole("textbox", { name: `Type “${ERASE_CONFIRMATION}” to confirm` });
    await user.type(field, "erase everythin");
    expect(confirm).toBeDisabled();
    expect(api.bodiesOf("POST /api/manage/cleanup/everything")).toEqual([]);
    await user.type(field, "g");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(api.bodiesOf("POST /api/manage/cleanup/everything")).toEqual([{ confirm: "erase everything" }]));
  });

  it("shows the server's refusal if erase is asked for from where it is not allowed", async () => {
    fakeApi({
      "POST /api/manage/plan": everything,
      "POST /api/manage/cleanup/everything": {
        status: 403,
        error: { code: "forbidden", message: "Erasing everything can only be started on the computer Outpost runs on." },
      },
    });
    renderScreen(<CleanupView loading={false} status={status()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Erase everything" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(await within(dialog).findByRole("textbox"), "erase everything");
    await user.click(within(dialog).getByRole("button", { name: "Erase everything" }));
    expect(await within(dialog).findByText("Erasing everything can only be started on the computer Outpost runs on.")).toBeVisible();
  });

  it("summarises downloaded content by kind and location, and what a disconnected drive keeps", async () => {
    const api = fakeApi({
      "POST /api/manage/plan": plan({
        scope: "downloaded",
        changes: 2,
        byLocation: [
          {
            locationId: "loc1",
            name: "Internal storage",
            path: "/srv",
            available: true,
            remove: { count: 2, bytes: 1_800_011_000 },
            stays: { count: 0, bytes: 0 },
          },
          {
            locationId: "usb",
            name: "Field SSD",
            path: "/Volumes/F",
            available: false,
            remove: { count: 0, bytes: 0 },
            stays: { count: 1, bytes: 600_000_000 },
          },
        ],
        disconnected: {
          count: 1,
          bytes: 600_000_000,
          files: [{ title: "The Alps", locationName: "Field SSD", path: "/Volumes/F/collections/maps/alps.pmtiles", bytes: 600_000_000 }],
        },
        downloads: { count: 1, bytes: 300 },
      }),
      "POST /api/manage/cleanup/downloaded": { job: job({ title: "Remove all downloaded content" }) },
    });
    renderScreen(<CleanupView loading={false} status={status()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove downloaded content" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove all downloaded content" });
    expect(await within(dialog).findByText("2 items will be deleted, files and all: 1.80 GB.")).toBeVisible();
    expect(within(dialog).getByText(/This deletes files because you are asking it to/)).toBeVisible();
    expect(within(dialog).getByText("1 unfinished download will be cancelled and its partial file deleted.")).toBeVisible();
    expect(within(dialog).getByRole("row", { name: /Field SSD\s*Not connected\s*1 item, 600 MB stay on it/ })).toBeVisible();
    expect(within(dialog).getByText("1 item, 600 MB on a location that is not connected")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove downloaded content" }));
    await waitFor(() => expect(api.bodiesOf("POST /api/manage/cleanup/downloaded")).toEqual([{ disconnected: "leave" }]));
  });

  it("clears and rebuilds only what is ticked, after saying what each costs", async () => {
    const api = fakeApi({ "POST /api/manage/cleanup/derived": { job: job({ type: "manage.derived" }) } });
    renderScreen(<CleanupView loading={false} status={status()} />);
    const user = userEvent.setup();
    const start = screen.getByRole("button", { name: "Clear and rebuild" });
    expect(start).toBeDisabled();
    expect(screen.getByText(/Clear semantic vectors \(1,200 vectors, about 1\.84 MB\)/)).toBeVisible();
    expect(screen.getByText(/Read the text of every document again \(10 documents\)/)).toBeVisible();
    expect(screen.getByText(/2 documents on a location that is not connected will be skipped/)).toBeVisible();
    expect(screen.getByText(/Compact the database \(4\.00 MB to give back, of 90\.0 MB\)/)).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: /Clear semantic vectors/ }));
    await user.click(screen.getByRole("checkbox", { name: /Compact the database/ }));
    await user.click(start);
    const confirm = await screen.findByRole("alertdialog", { name: "Clear and rebuild search data?" });
    expect(within(confirm).getByText(/running every passage through the model once more/)).toBeVisible();
    expect(within(confirm).getByText(/Outpost stops answering while it runs/)).toBeVisible();
    expect(within(confirm).queryByText(/Read the text of every document again/)).not.toBeInTheDocument();
    expect(api.bodiesOf("POST /api/manage/cleanup/derived")).toEqual([]);
    await user.click(within(confirm).getByRole("button", { name: "Clear and rebuild" }));
    await waitFor(() => expect(api.bodiesOf("POST /api/manage/cleanup/derived")).toEqual([{ steps: ["vectors", "compact"] }]));
  });

  it("offers nothing new while a clean-up is under way", () => {
    fakeApi({});
    renderScreen(<CleanupView loading={false} status={status({ active: job({ state: "running" }) as never })} />);
    expect(screen.getByText(/A clean-up is under way/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove downloaded content" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Erase everything" })).toBeDisabled();
  });
});

describe("the account of a clean-up", () => {
  it("shows real progress with a way to stop, then names what was left and what failed", async () => {
    const api = fakeApi({ "POST /api/jobs/job1/cancel": { job: job({ state: "cancelled" }) } });
    const running = job({ state: "running", progress: { current: 30, total: 120, message: "Removing Wikipedia" } });
    const view = renderScreen(<JobAccount status={status({ active: running as never })} />);
    const user = userEvent.setup();
    expect(screen.getByText("Removing Wikipedia")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Remove 2 items" })).toHaveAttribute("aria-valuenow", "25");
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(api.requests.map((request) => request.call)).toContain("POST /api/jobs/job1/cancel"));
    view.unmount();

    const finished = job({
      state: "cancelled",
      finishedAt: Date.now() - 5000,
      result: {
        scope: "items",
        stopped: true,
        removed: { count: 1, bytes: 1_800_000_000 },
        forgotten: { count: 1, bytes: 600_000_000 },
        left: { count: 0, bytes: 0 },
        leftBehind: [
          { title: "The Alps", locationName: "Field SSD", path: "/Volumes/F/collections/maps/alps.pmtiles", bytes: 600_000_000 },
        ],
        leftBehindMore: 0,
        failed: [{ title: "Road atlas", reason: "It is being moved or checked." }],
        failedMore: 0,
        notReached: 2,
        message: "",
      },
    });
    renderScreen(<JobAccount status={status({ last: finished as never })} />);
    expect(screen.getByText(/Remove 2 items: stopped/)).toBeVisible();
    expect(screen.getByText("Deleted 1 item, 1.80 GB.")).toBeVisible();
    expect(screen.getByText("Stopped before reaching 2 more items. What was already removed stays removed.")).toBeVisible();
    expect(screen.getByText("Road atlas")).toBeVisible();
    expect(screen.getByText("It is being moved or checked.")).toBeVisible();
    await user.click(screen.getByText(/Files that were not deleted, and where they are \(1\)/));
    expect(screen.getByText("/Volumes/F/collections/maps/alps.pmtiles")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Remove 2 items: stopped/)).not.toBeInTheDocument();
  });
});

describe("leftovers", () => {
  it("lists each kind with what clearing it does, and clears nothing that was not ticked and confirmed", async () => {
    const api = fakeApi({
      "GET /api/manage/leftovers": {
        items: [
          leftover(),
          leftover({
            id: "file:loc1:collections/maps/gone.pmtiles",
            title: "gone.pmtiles",
            detail: "/srv/outpost/collections/maps/gone.pmtiles",
            bytes: 12_000_000,
          }),
          leftover({
            id: "download:dl1",
            kind: "download",
            title: "Project Gutenberg library",
            bytes: 310_000_000,
            what: "failed",
            href: "/downloads/dl1",
          }),
          leftover({
            id: "missing:document:d7",
            kind: "missing",
            title: "Lost manual",
            bytes: null,
            href: "/explore?entry=manual",
            what: "downloaded",
          }),
          leftover({
            id: "cache:runtimes",
            kind: "cache",
            title: "Programs fetched for portable drives",
            bytes: 48_000_000,
            what: "runtimes",
            locationName: null,
          }),
        ],
        more: { untracked: { count: 3, bytes: 900 } },
        measuredAt: Date.now() - 60_000,
        measuring: false,
      },
      "POST /api/manage/leftovers/clear": {
        cleared: { count: 1, bytes: 88_000_000 },
        failed: [{ id: "x", title: "gone.pmtiles", reason: "Something in your library uses that file now. It was left alone." }],
      },
    });
    renderScreen(<LeftoversView />);
    const user = userEvent.setup();

    const stray = await screen.findByRole("region", { name: "Files no record refers to" });
    expect(within(stray).getByText(/Outpost never looks at, or deletes, anything outside those two folders/)).toBeVisible();
    expect(within(stray).getByText("/srv/outpost/collections/zim/old.zim")).toBeVisible();
    expect(within(stray).getByText("5 items, 100 MB")).toBeVisible();
    expect(within(stray).getByText(/And 3 more items/)).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Downloads that did not finish" })).getByText(/The download failed\./)).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Records whose file has gone" })).getByRole("link", {
        name: "Download it again from Explore",
      }),
    ).toHaveAttribute("href", "/explore?entry=manual");
    expect(
      within(screen.getByRole("region", { name: "Things that can be fetched or worked out again" })).getByText(/That needs a connection/),
    ).toBeVisible();

    const remove = within(stray).getByRole("button", { name: "Delete selected" });
    expect(remove).toBeDisabled();
    await user.click(within(stray).getByRole("checkbox", { name: "Select old.zim" }));
    expect(within(stray).getByText("1 item selected, 88.0 MB")).toBeVisible();
    await user.click(remove);
    const confirm = await screen.findByRole("alertdialog", { name: "Delete 1 item?" });
    expect(within(confirm).getByText(/These files are deleted for good/)).toBeVisible();
    expect(within(confirm).getByText("88.0 MB will be freed.")).toBeVisible();
    expect(api.bodiesOf("POST /api/manage/leftovers/clear")).toEqual([]);
    await user.click(within(confirm).getByRole("button", { name: "Delete 1 item" }));

    await waitFor(() => expect(api.bodiesOf("POST /api/manage/leftovers/clear")).toEqual([{ ids: ["file:loc1:collections/zim/old.zim"] }]));
    expect(await screen.findByText("Cleared 1 item, freeing 88.0 MB")).toBeVisible();
    expect(screen.getByText("Something in your library uses that file now. It was left alone.")).toBeVisible();
  });

  it("says when it is still looking, and when there is nothing left over", async () => {
    fakeApi({ "GET /api/manage/leftovers": { items: [], more: {}, measuredAt: null, measuring: true } });
    const view = renderScreen(<LeftoversView />);
    expect(await screen.findByText(/Looking through Outpost's folders for the first time/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Nothing found so far" })).toBeVisible();
    view.unmount();
    fakeApi({ "GET /api/manage/leftovers": { items: [], more: {}, measuredAt: Date.now(), measuring: false } });
    renderScreen(<LeftoversView />);
    expect(await screen.findByRole("heading", { name: "Nothing is left over" })).toBeVisible();
  });
});

describe("what is taking the space", () => {
  it("gives each kind as a row of a table, marks estimates, and says what is known only from before a drive went away", async () => {
    fakeApi({ "GET /api/manage/usage": usage() });
    renderScreen(
      <TooltipProvider>
        <SpaceView />
      </TooltipProvider>,
    );
    const table = await screen.findByRole("table", { name: "Space used by each kind of thing Outpost stores" });
    expect(
      within(table).getByRole("row", {
        name: /Reference archives\s*2 items; 800 MB of it on a location that is not connected, as last known\s*2\.60 GB/,
      }),
    ).toBeVisible();
    expect(within(table).getByRole("row", { name: /Search passages.*an estimate.*about\s*12\.0 MB/ })).toBeVisible();
    // Nothing of a kind: no row for it.
    expect(within(table).queryByRole("row", { name: /^Maps/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Outpost is storing/)).toHaveTextContent(
      "Outpost is storing 3.01 GB: 2.61 GB of content on 2 storage locations",
    );
    expect(screen.getByRole("link", { name: "310 MB of it is left over" })).toHaveAttribute("href", "/storage/manage?view=leftovers");

    expect(screen.getByText("1 storage location not connected")).toBeVisible();
    expect(screen.getByText("Disconnected")).toBeVisible();
    expect(
      screen.getByText(/Not connected, so nothing here can be measured or deleted\. What Outpost last knew, 3 days ago:/),
    ).toHaveTextContent("1 item, 800 MB, with 400 GB free of 1.00 TB.");
    expect(screen.getByText(/Outpost has 4 items/)).toHaveTextContent(
      "60.0 GB free of 500 GB. Outpost has 4 items, 1.81 GB here; its folders hold 2.12 GB on disk.",
    );
    expect(screen.getByText(/Measured 2 minutes ago\./)).toBeVisible();
  });

  it("says a figure is still being counted rather than showing nothing or a guess", async () => {
    const counting = usage({ measuring: true, measuredAt: null });
    counting.rows = counting.rows.map((row) => (row.basis === "disk" && row.id !== "database" ? { ...row, bytes: null } : row));
    counting.locations = counting.locations.map((location) => ({ ...location, measuredBytes: null }));
    fakeApi({ "GET /api/manage/usage": counting });
    renderScreen(
      <TooltipProvider>
        <SpaceView />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Counting what is on disk for the first time.")).toBeVisible();
    expect(screen.getByRole("row", { name: /Text read from documents\s*Counting/ })).toBeVisible();
    expect(screen.getByText(/Outpost is storing/)).toHaveTextContent("at least");
    expect(screen.getByText(/its folders are still being counted/)).toBeVisible();
  });
});
