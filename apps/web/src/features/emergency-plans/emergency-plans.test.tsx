/** Emergency plans: the cards as PDFs, and the screens' states. Every person here is made up. */
import {
  type EmergencyPlan,
  type EmergencyPlanResponse,
  type EmergencyPlanSummary,
  emptyPlanBody,
  type HomeWarningsResponse,
  PLAN_TEMPLATES,
  type PlanResolved,
  planFromTemplate,
} from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { textWidth } from "@/features/maps/print/helvetica";
import { type DrawLine, writeLettered } from "@/features/maps/print/lettering";
import type { Sheet } from "@/features/maps/print/sheet";
import { fridgeSheets, grabSheets, walletSheets } from "./cards";
import CardsPage from "./cards-page";
import PlanPage from "./plan-page";
import PlansPage from "./plans-page";
import { readableOf } from "./printable";
import UsePlanPage from "./use-page";
import { warningLineOf } from "./warning-line";
import { guessEmergencyNumber } from "./words";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MADE = new Date(2026, 10, 16, 14, 5);

function plan(over: Partial<EmergencyPlan> = {}): EmergencyPlan {
  const template = PLAN_TEMPLATES.find((each) => each.id === "power-cut")!;
  let n = 0;
  const input = planFromTemplate(template, () => `s${++n}`, "999");
  return {
    ...input,
    id: "p1",
    use: { startedAt: null, ticks: {} },
    reviewedAt: MADE.getTime(),
    openedAt: null,
    createdAt: MADE.getTime(),
    updatedAt: MADE.getTime(),
    ...over,
    body: {
      ...input.body,
      people: [
        { id: "a", name: "Maya Okafor", remember: "Fetch Sam", medical: "Penicillin allergy", contactId: null },
        { id: "b", name: "Ελένη Παπαδοπούλου", remember: "", medical: "", contactId: null },
      ],
      contacts: [
        { id: "c1", contactId: "k1", name: "Ana Silva", phone: "", note: "Has a key", outOfArea: false },
        { id: "c2", contactId: null, name: "王小明", phone: "+44 7700 900123", note: "", outOfArea: true },
        { id: "c3", contactId: "gone", name: "Old neighbour", phone: "", note: "", outOfArea: false },
      ],
      places: [
        { id: "m1", role: "near", markerId: "hall", name: "Village hall", note: "Side door" },
        { id: "m2", role: "away", markerId: "lost", name: "Church", note: "" },
      ],
      ...over.body,
    },
  };
}
const resolved: PlanResolved = {
  contacts: { k1: { displayName: "Ana Silva", phones: [{ value: "+44 (0)1632 960 188", label: "home" }], callsign: "" }, gone: null },
  places: { hall: { name: "Village hall", lat: 54.3, lon: -2.2 }, lost: null },
  commPlan: undefined,
  powerPlan: undefined,
  links: [],
};

/** A device that draws a line as a picture the width the typeface would give it. */
const draws: DrawLine = async (item) => ({
  picture: { jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), width: 10, height: 4 },
  width: textWidth(item.text, item.size, item.bold) * 1.1,
  height: item.size * 1.5,
  baseline: item.size * 1.1,
});

async function readPdf(bytes: Uint8Array): Promise<string> {
  const reading = getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
  });
  const document = await reading.promise;
  const out: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1)
    out.push(...((await (await document.getPage(number)).getTextContent()).items as Array<{ str: string }>).map((item) => item.str));
  await reading.destroy();
  return out.join("\n");
}

const texts = (pages: Sheet[]) =>
  pages.flatMap((page) => page.items.flatMap((item) => (item.kind === "text" && !item.hidden ? [item.text] : [])));

describe("a plan as it is read", () => {
  it("puts in linked contacts and places as they are now, and keeps missing ones, said to be missing", () => {
    const read = readableOf(plan(), resolved);
    expect(read.contacts.map((contact) => [contact.name, contact.numbers.map((number) => number.value), contact.missing])).toEqual([
      ["Ana Silva", ["+44 (0)1632 960 188"], false],
      ["王小明", ["+44 7700 900123"], false],
      ["Old neighbour", [], true],
    ]);
    expect(read.contacts[0]!.numbers[0]!.dial).toBe("+4401632960188");
    expect(read.places.map((place) => [place.name, place.mapPath, place.missing])).toEqual([
      ["Village hall", "/maps?lat=54.30000&lon=-2.20000&z=15", false],
      ["Church", null, true],
    ]);
    // Water for the 2 people in the plan for its 3 days: 3 × 2 × 3 = 18 litres.
    expect(read.supplies.find((supply) => supply.name === "Bottled water")?.amount).toBe("18 litre");
  });

  it("offers the number for the device's country first, and 112 otherwise", () => {
    expect(guessEmergencyNumber("en-GB")).toBe("999");
    expect(guessEmergencyNumber("en-US")).toBe("911");
    expect(guessEmergencyNumber("de-DE")).toBe("112");
    expect(guessEmergencyNumber("en-NZ")).toBe("111");
    expect(guessEmergencyNumber("en")).toBe("112");
  });
});

describe("the cards", () => {
  const read = readableOf(plan(), resolved);

  it("gives each person a wallet card, numbers whole on one line, four to a sheet", () => {
    const { pages, cards } = walletSheets(read, read.people, { made: MADE, paper: "a4" });
    expect(pages).toHaveLength(1);
    expect(cards.map((card) => card.overflow)).toEqual([false, false]);
    const words = texts(pages);
    // Each number is one piece of text, exactly as kept: never broken across lines.
    expect(words).toContain("+44 (0)1632 960 188");
    expect(words).toContain("+44 7700 900123");
    expect(words).toContain("999");
    // Medical words only on the person's own card.
    expect(texts([{ ...pages[0]!, items: cards[0]!.front }])).toContain("Penicillin allergy");
    expect(texts([{ ...pages[0]!, items: cards[1]!.front }])).not.toContain("Penicillin allergy");
    expect(words.filter((word) => word === "Penicillin allergy")).toHaveLength(1);
    // The out-of-area contact, and the places to meet, but not the one missing from the map.
    expect(words).toContain("Out-of-area contact");
    expect(words.join(" ")).toContain("Village hall");
    expect(words.join(" ")).not.toContain("Church");
  });

  it("says when a card has too much on it", () => {
    // 600 characters, the most a medical note may have, fit in the smallest type; more than that does not.
    const long = { ...read.people[0]!, medical: "Takes many medicines. ".repeat(80) };
    expect(walletSheets(read, [long], { made: MADE, paper: "letter" }).cards[0]!.overflow).toBe(true);
  });

  it("puts the fridge sheet on one page, with the steps for during and after, the numbers and the places", () => {
    const pages = fridgeSheets(read, { made: MADE, paper: "a4" });
    expect(pages).toHaveLength(1);
    const words = texts(pages).join("\n");
    expect(words).toContain("During");
    expect(words).toContain("After");
    expect(words).not.toContain("\nBefore\n");
    expect(words).toContain("+44 7700 900123");
    expect(words).toContain("Old neighbour: no longer in Contacts");
    expect(words).toContain("Church (no longer on the map)");
    expect(words).toContain("In a real emergency, follow the emergency services and official warnings.");
    // The official words carry their licence, once.
    expect(words.match(/Contains public sector information licensed under the Open Government Licence v3\.0\./g)).toHaveLength(1);
    // A pointer names the page and quotes nothing.
    expect(words).toContain("The British Red Cross has advice on a power cut");
  });

  it("writes a PDF whose text has every number exactly, and names in other scripts found by search", async () => {
    const written = await writeLettered(fridgeSheets(read, { made: MADE, paper: "a4" }), "Fridge sheet", MADE, draws);
    expect(written.drawn).toBeGreaterThan(0);
    const text = await readPdf(written.bytes);
    expect(text).toContain("+44 7700 900123");
    expect(text).toContain("+44 (0)1632 960 188");
    expect(text).toContain("王小明");
    expect(text).toContain("Contains public sector information licensed under the Open Government Licence v3.0.");

    const wallet = await writeLettered(walletSheets(read, read.people, { made: MADE, paper: "a4" }).pages, "Wallet cards", MADE, draws);
    const cardText = await readPdf(wallet.bytes);
    expect(cardText).toContain("Ελένη Παπαδοπούλου");
    expect(cardText).toContain("+44 7700 900123");
  });

  it("lists what to take on the grab list, with the amount for the household", () => {
    const words = texts(grabSheets(read, { made: MADE, paper: "a4" }));
    expect(words).toContain("Bottled water");
    expect(words).toContain("18 litre");
    expect(words.join(" ")).toContain("Open Government Licence v3.0");
  });
});

// ── The screens ──────────────────────────────────────────────────────────────

interface Server {
  posted: Array<{ path: string; body: unknown }>;
}

function serve(routes: Record<string, unknown | (() => Response | Promise<Response>)>): Server {
  const server: Server = { posted: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), "http://outpost.test");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      const method = init?.method ?? "GET";
      if (method !== "GET") server.posted.push({ path: `${method} ${pathname}`, body: init?.body ? JSON.parse(String(init.body)) : null });
      const answer = routes[`${method} ${pathname}`] ?? routes[pathname];
      if (typeof answer === "function") return (answer as () => Response)();
      if (answer !== undefined) return json(answer);
      if (method !== "GET") return json(routes["POST *"] ?? { ok: true });
      return json({ error: { code: "not_found", message: "Not here." } }, 404);
    }),
  );
  return server;
}

function show(path: string, element: ReactNode, route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const summary = (over: Partial<EmergencyPlanSummary> = {}): EmergencyPlanSummary => ({
  id: "p1",
  name: "Power cut",
  kind: "power-cut",
  kindText: "",
  templateId: null,
  scenarios: [],
  steps: 29,
  ticked: 0,
  startedAt: null,
  reviewedAt: Date.now(),
  reviewEveryDays: 180,
  openedAt: null,
  missing: 0,
  updatedAt: Date.now(),
  ...over,
});

describe("the list of plans", () => {
  it("invites the first plan when there are none", async () => {
    serve({ "/api/emergency-plans": { plans: [] } });
    show("/prepare/plans", <PlansPage />, "/prepare/plans");
    expect(await screen.findByText("No emergency plans yet")).toBeInTheDocument();
  });

  it("lists plans with what is missing and what is due, each a press from use", async () => {
    serve({
      "/api/emergency-plans": {
        plans: [summary({ missing: 2, reviewedAt: 0 }), summary({ id: "p2", name: "Flood", startedAt: Date.now(), ticked: 3, steps: 10 })],
      },
    });
    show("/prepare/plans", <PlansPage />, "/prepare/plans");
    expect(await screen.findByText(/2 linked contacts or places missing/)).toBeInTheDocument();
    expect(screen.getByText(/Due for a look over/)).toBeInTheDocument();
    expect(screen.getByText(/3 of 10 steps done/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use now: Flood" })).toHaveAttribute("href", "/prepare/plans/p2/use");
  });

  it("titles each plan as every other list does, without saying its name twice or a stray arrow", async () => {
    serve({
      "/api/emergency-plans": { plans: [summary({ steps: 22 }), summary({ id: "p2", name: "Grandad's house", kind: "flooding" })] },
    });
    show("/prepare/plans", <PlansPage />, "/prepare/plans");
    const title = await screen.findByRole("link", { name: "Power cut" });
    expect(title.closest(".font-title")).not.toBeNull();
    // The kind is said only where the name does not already say it.
    expect(screen.getByText("22 steps")).toBeInTheDocument();
    expect(screen.queryByText(/Power cut\. 22 steps/)).toBeNull();
    expect(screen.getByText(/^Flooding/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Open / })).toBeNull();
  });

  it("says when the plans could not be loaded", async () => {
    serve({
      "/api/emergency-plans": () => new Response(JSON.stringify({ error: { code: "internal", message: "Busy." } }), { status: 500 }),
    });
    show("/prepare/plans", <PlansPage />, "/prepare/plans");
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
  });

  it("starts a plan from a template", async () => {
    const server = serve({ "/api/emergency-plans": { plans: [] }, "POST /api/emergency-plans": { plan: plan(), resolved } });
    show("/prepare/plans", <PlansPage />, "/prepare/plans");
    await userEvent.click(await screen.findByRole("button", { name: "New plan" }));
    await userEvent.click(screen.getByRole("radio", { name: /^Power cut/ }));
    await userEvent.click(screen.getByRole("button", { name: "Make the plan" }));
    await waitFor(() => expect(server.posted.some((post) => post.path === "POST /api/emergency-plans")).toBe(true));
    const sent = server.posted.find((post) => post.path === "POST /api/emergency-plans")!.body as EmergencyPlan;
    expect(sent.templateId).toBe("power-cut");
    expect(sent.body.steps.every((step) => step.origin?.startsWith("power-cut."))).toBe(true);
  });
});

const answer = (over: Partial<EmergencyPlan> = {}): EmergencyPlanResponse => ({ plan: plan(over), resolved });

describe("a plan", () => {
  const others = {
    "/api/supplies": {
      items: [],
      household: { daysWanted: 3, drinkingLitres: 3, allUsesLitres: 7.5, waterBasis: "drinking", members: [], updatedAt: 0 },
      locations: [],
    },
    "/api/supplies/outlook": () => new Promise<Response>(() => {}),
    "/api/power/plans": { plans: [] },
    "/api/radio/communication-plans": { plans: [] },
    "/api/maps/markers": { markers: [] },
  };

  it("says whose words each step is, and shows a deleted contact or place as missing", async () => {
    serve({ "/api/emergency-plans/p1": answer(), "POST /api/emergency-plans/p1/opened": answer(), ...others });
    show("/prepare/plans/p1", <PlanPage />, "/prepare/plans/:id");
    expect(await screen.findByRole("heading", { level: 1, name: "Power cut" })).toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => element?.tagName === "SUMMARY" && element.textContent!.startsWith("From ")).length,
    ).toBeGreaterThan(5);
    expect(screen.getByText(/Old neighbour: no longer in Contacts/)).toBeInTheDocument();
    expect(screen.getByText(/Church: no longer on the map/)).toBeInTheDocument();
    expect(screen.getAllByText(/In a real emergency, follow the emergency services/).length).toBeGreaterThan(0);
    // Whose words are included and under what licence; whose pages are only pointed to.
    const licences = screen.getByTestId("template-licences");
    expect(licences).toHaveTextContent("under Open Government Licence v3.0");
    expect(licences).toHaveTextContent("British Red Cross has not given permission for its words to be copied");
    expect(screen.getByText(/A pointer, not advice/)).toBeInTheDocument();
    // Nothing in Supplies: each listed thing is missing, and can go on the shopping list.
    await waitFor(() => expect(screen.getAllByTestId("supply-standing")[0]).toHaveTextContent("Missing"));
    expect(screen.getByRole("button", { name: /Add 10 missing or low things to the shopping list/ })).toBeEnabled();
  });

  it("says when the copy was last opened, not the plan it was copied from", async () => {
    const DAY = 86_400_000;
    serve({
      "/api/emergency-plans/p1": answer({ openedAt: Date.now() - 3 * DAY }),
      "POST /api/emergency-plans/p1/opened": answer({ openedAt: Date.now() }),
      "POST /api/emergency-plans/p1/copy": answer({ id: "p2", name: "Power cut (copy)" }),
      "/api/emergency-plans/p2": answer({ id: "p2", name: "Power cut (copy)" }),
      "POST /api/emergency-plans/p2/opened": answer({ id: "p2", name: "Power cut (copy)", openedAt: Date.now() }),
      ...others,
    });
    show("/prepare/plans/p1", <PlanPage />, "/prepare/plans/:id");
    expect(await screen.findByText(/Last opened 3 days ago/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Make a copy" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Power cut (copy)" })).toBeInTheDocument();
    expect(screen.getByText(/Last opened never before/)).toBeInTheDocument();
  });

  it("links a person's own number from Contacts, without offering to type a number it would not keep", async () => {
    serve({
      "/api/emergency-plans/p1": answer(),
      "POST /api/emergency-plans/p1/opened": answer(),
      "/api/contacts": { contacts: [], all: 0 },
      ...others,
    });
    show("/prepare/plans/p1", <PlanPage />, "/prepare/plans/:id");
    await userEvent.click((await screen.findAllByRole("button", { name: "Link their own number from Contacts" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Their own number" });
    expect(await within(dialog).findByText(/There are no contacts in Outpost yet/)).toBeInTheDocument();
    expect(within(dialog).queryByText("Or type one in")).toBeNull();
    expect(within(dialog).queryByLabelText("Phone number (optional)")).toBeNull();
  });

  it("says how many lines went on the shopping list when it stops part way", async () => {
    let posts = 0;
    const failed = vi.spyOn(toast, "error");
    serve({
      "/api/emergency-plans/p1": answer(),
      "POST /api/emergency-plans/p1/opened": answer(),
      "POST /api/supplies/shopping": () => {
        posts += 1;
        return posts <= 2
          ? new Response(JSON.stringify({ line: { id: `l${posts}` } }), { headers: { "content-type": "application/json" } })
          : new Response(JSON.stringify({ error: { code: "internal", message: "The database is busy." } }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
      },
      ...others,
    });
    show("/prepare/plans/p1", <PlanPage />, "/prepare/plans/:id");
    await userEvent.click(await screen.findByRole("button", { name: /Add 10 missing or low things to the shopping list/ }));
    await waitFor(() => expect(failed).toHaveBeenCalled());
    expect(String(failed.mock.calls[0]![0])).toBe("2 of 10 lines went on the shopping list, then it stopped: The database is busy.");
  });

  it("asks for a review when one is due", async () => {
    serve({
      "/api/emergency-plans/p1": answer({ reviewedAt: 0 }),
      "POST /api/emergency-plans/p1/opened": answer({ reviewedAt: 0 }),
      ...others,
    });
    show("/prepare/plans/p1", <PlanPage />, "/prepare/plans/:id");
    expect(await screen.findByText("Time to look this plan over")).toBeInTheDocument();
  });

  describe("changed on another device while open here", { timeout: 30_000 }, () => {
    const THEIRS = MADE.getTime() + 60_000;
    /** The plan as another device left it, and a server that refuses the first change made from the older copy. */
    function changedElsewhere() {
      let current = answer();
      let puts = 0;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      const server = serve({
        "/api/emergency-plans/p1": () => json(current),
        "POST /api/emergency-plans/p1/opened": () => json(current),
        "PUT /api/emergency-plans/p1": () => {
          puts += 1;
          if (puts === 1) {
            current = answer({ name: "Power cut (from the kitchen)", updatedAt: THEIRS });
            return json(
              {
                error: {
                  code: "conflict",
                  message:
                    "This plan was changed somewhere else after you opened it, in another tab or on another device. Your changes were not saved over it; reload to see the newer version.",
                  details: { current: { updatedAt: THEIRS, name: "Power cut (from the kitchen)" } },
                },
              },
              409,
            );
          }
          const sent = server.posted.at(-1)!.body as EmergencyPlan;
          current = answer({ name: sent.name, updatedAt: THEIRS + 1000 * puts });
          return json(current);
        },
        ...others,
      });
      return server;
    }
    /** The plan's own name: the people in it have names too. */
    const nameBox = () => screen.getAllByRole("textbox", { name: "Name" })[0]!;
    const puts = (server: Server) => server.posted.filter((post) => post.path === "PUT /api/emergency-plans/p1");

    async function editName() {
      show("/prepare/plans/p1", <PlanPage />, "/prepare/plans/:id");
      const name = (await screen.findAllByRole("textbox", { name: "Name" }))[0]!;
      await userEvent.clear(name);
      await userEvent.type(name, "Power cut (mine)");
      expect(await screen.findByText("This plan was changed somewhere else", {}, { timeout: 3000 })).toBeInTheDocument();
    }

    it("says so instead of saving over it, and keeps what was typed", async () => {
      const server = changedElsewhere();
      await editName();
      expect(puts(server)).toHaveLength(1);
      expect(puts(server)[0]!.body).toMatchObject({ name: "Power cut (mine)", baseUpdatedAt: MADE.getTime() });
      expect(screen.getByText(/Your version is still here, unsaved, and nothing has been overwritten/)).toBeInTheDocument();
      expect(screen.getByText(/Not saved: this plan was changed somewhere else/)).toBeInTheDocument();
      expect(nameBox()).toHaveValue("Power cut (mine)");
      // Typing more does not send anything until a side is chosen.
      await userEvent.type(nameBox(), "!");
      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(puts(server)).toHaveLength(1);
    });

    it("keeps my version by sending it again on top of the newer one", async () => {
      const server = changedElsewhere();
      await editName();
      await userEvent.click(screen.getByRole("button", { name: "Keep my version" }));
      await waitFor(() => expect(puts(server)).toHaveLength(2));
      expect(puts(server)[1]!.body).toMatchObject({ name: "Power cut (mine)", baseUpdatedAt: THEIRS });
      expect(await screen.findByText(/^Saved\./)).toBeInTheDocument();
      expect(screen.queryByText("This plan was changed somewhere else")).toBeNull();
      expect(screen.getByRole("heading", { level: 1, name: "Power cut (mine)" })).toBeInTheDocument();
    });

    it("loads the other version into the plan instead, and later changes build on it", async () => {
      const server = changedElsewhere();
      await editName();
      await userEvent.click(screen.getByRole("button", { name: "Load the other version" }));
      await waitFor(() => expect(nameBox()).toHaveValue("Power cut (from the kitchen)"));
      expect(screen.queryByText("This plan was changed somewhere else")).toBeNull();
      expect(puts(server)).toHaveLength(1);
      await userEvent.type(screen.getByLabelText("In your words (optional)"), "Storm");
      await waitFor(() => expect(puts(server)).toHaveLength(2), { timeout: 3000 });
      expect(puts(server)[1]!.body).toMatchObject({ name: "Power cut (from the kitchen)", kindText: "Storm", baseUpdatedAt: THEIRS });
    });
  });
});

describe("the cards to print", () => {
  it("with nobody in the plan, links to where the people are added", async () => {
    const empty = answer();
    empty.plan.body.people = [];
    serve({ "/api/emergency-plans/p1": empty });
    show("/prepare/plans/p1/cards", <CardsPage />, "/prepare/plans/:id/cards");
    expect(await screen.findByRole("link", { name: "Add the household's people to the plan" })).toHaveAttribute(
      "href",
      "/prepare/plans/p1#household",
    );
  });
});

describe("a plan in use", () => {
  it("is only the steps, the numbers and the places, and a tick is sent with the step", async () => {
    const server = serve({
      "/api/emergency-plans/p1": answer(),
      "POST /api/emergency-plans/p1/opened": answer(),
      "POST /api/emergency-plans/p1/ticks": () => {
        const ticked = answer();
        const first = ticked.plan.body.steps[0]!.id;
        ticked.plan.use = { startedAt: MADE.getTime(), ticks: { [first]: MADE.getTime() } };
        return new Response(JSON.stringify(ticked), { headers: { "content-type": "application/json" } });
      },
    });
    show("/prepare/plans/p1/use", <UsePlanPage />, "/prepare/plans/:id/use");
    expect(await screen.findByRole("link", { name: "Call the emergency services: 999" })).toHaveAttribute("href", "tel:999");
    expect(screen.getByRole("link", { name: "Call 王小明: +44 7700 900123" })).toHaveAttribute("href", "tel:+447700900123");
    expect(screen.getByRole("link", { name: /Village hall/ })).toHaveAttribute("href", "/maps?lat=54.30000&lon=-2.20000&z=15");
    expect(screen.getByText("No longer in Contacts: no number to call.")).toBeInTheDocument();

    const during = screen.getByRole("heading", { name: "During" }).closest("section")!;
    const boxes = within(screen.getByRole("heading", { name: "Before" }).closest("section")!).getAllByRole("checkbox");
    expect(within(during).getAllByRole("checkbox").length).toBeGreaterThan(0);
    await userEvent.click(boxes[0]!);
    await waitFor(() =>
      expect(server.posted.find((post) => post.path === "POST /api/emergency-plans/p1/ticks")?.body).toMatchObject({ done: true }),
    );
    expect(await screen.findByText(/Done at 14:05/)).toBeInTheDocument();
    // At an address that is not secure, keeping it on the device says what it needs and where to fix it.
    const keep = screen.getByRole("heading", { name: /^Keep on this / }).closest("section")!;
    expect(keep).toHaveTextContent(/needs Outpost opened at an HTTPS address/);
    expect(within(keep).getByRole("link", { name: "Settings, HTTPS on your network" })).toHaveAttribute("href", "/settings#https");
  });

  it("starts no clock: nothing on it changes by itself, so nothing ticks while it is open", async () => {
    // Timers of the page's own, leaving out the test library's polling while it waits for the page.
    const own: string[] = [];
    const real = { interval: window.setInterval.bind(window), frame: window.requestAnimationFrame?.bind(window) };
    vi.spyOn(window, "setInterval").mockImplementation(((run: () => void, ms?: number) => {
      if (!new Error().stack?.includes("@testing-library")) own.push(`setInterval ${ms}`);
      return real.interval(run, ms);
    }) as typeof window.setInterval);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((run) => {
      own.push("requestAnimationFrame");
      return real.frame ? real.frame(run) : 0;
    });
    serve({ "/api/emergency-plans/p1": answer(), "POST /api/emergency-plans/p1/opened": answer() });
    show("/prepare/plans/p1/use", <UsePlanPage />, "/prepare/plans/:id/use");
    expect(await screen.findByRole("link", { name: "Call the emergency services: 999" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Not in use\./)).toBeInTheDocument());
    expect(own).toEqual([]);
  });

  it("resets for next time after asking", async () => {
    const server = serve({
      "/api/emergency-plans/p1": answer({ use: { startedAt: MADE.getTime(), ticks: {} } }),
      "POST /api/emergency-plans/p1/opened": answer({ use: { startedAt: MADE.getTime(), ticks: {} } }),
      "POST /api/emergency-plans/p1/reset": answer(),
    });
    show("/prepare/plans/p1/use", <UsePlanPage />, "/prepare/plans/:id/use");
    await userEvent.click(await screen.findByRole("button", { name: "Reset for next time" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(server.posted.some((post) => post.path === "POST /api/emergency-plans/p1/reset")).toBe(true));
    expect(await screen.findByRole("button", { name: "Start using this plan" })).toBeInTheDocument();
  });

  it("starts from blank with nothing in it but the caveat", async () => {
    serve({
      "/api/emergency-plans/p1": { plan: { ...plan(), body: emptyPlanBody() }, resolved },
      "POST /api/emergency-plans/p1/opened": { plan: { ...plan(), body: emptyPlanBody() }, resolved },
    });
    show("/prepare/plans/p1/use", <UsePlanPage />, "/prepare/plans/:id/use");
    expect(await screen.findByText(/0 steps\. Not in use\./)).toBeInTheDocument();
  });
});

describe("the line about warnings held for the home place", () => {
  const NOW = Date.UTC(2026, 10, 16, 15);
  const HOUR = 3_600_000;
  const held = (over: Partial<HomeWarningsResponse> = {}): HomeWarningsResponse => ({
    place: { id: "w1", name: "Home", region: "London & South East England" },
    homeMarker: { id: "m1", name: "Home" },
    fetchedAt: NOW - 3 * HOUR,
    weather: [
      {
        id: "1",
        title: "Yellow warning of wind affecting London & South East England",
        description: "Strong winds may cause some disruption.",
        link: "https://www.metoffice.gov.uk/",
        level: "yellow",
        region: "London & South East England",
        validFrom: NOW - HOUR,
        validUntil: NOW + 10 * HOUR,
      },
    ],
    flood: [],
    floodFetchedAt: null,
    stale: true,
    note: "",
    now: NOW,
    ...over,
  });

  it("names the warning in the publisher's words, with its age", () => {
    expect(warningLineOf(held(), NOW)).toEqual({
      words: "“Yellow warning of wind affecting London & South East England”",
      age: "3 hours ago",
      more: 0,
    });
  });

  it("says nothing with no home, no warning, or a copy too old to be of use", () => {
    expect(warningLineOf(held({ place: null }), NOW)).toBeNull();
    expect(warningLineOf(held({ weather: [] }), NOW)).toBeNull();
    expect(warningLineOf(held({ fetchedAt: NOW - 25 * HOUR }), NOW)).toBeNull();
    expect(warningLineOf(undefined, NOW)).toBeNull();
  });

  it("names the most severe and counts the rest, flood warnings included", () => {
    const line = warningLineOf(
      held({
        flood: [
          {
            id: "f",
            area: "River Ouse at Bedford",
            county: "",
            riverOrSea: "River Great Ouse",
            severity: "Flood warning",
            severityLevel: 2,
            message: "",
            isTidal: false,
            raisedAt: null,
            changedAt: null,
          },
        ],
        floodFetchedAt: NOW - 2 * HOUR,
      }),
      NOW,
    );
    expect(line).toEqual({ words: "The Environment Agency’s “Flood warning” for River Ouse at Bedford", age: "2 hours ago", more: 1 });
    expect(warningLineOf(held({ weather: [], flood: held().flood, floodFetchedAt: NOW - 13 * HOUR }), NOW)).toBeNull();
  });

  it("shows on the list of plans and on Use now, linking to Weather and hazards, and not at all when there is none", async () => {
    // One reading of the clock: two could straddle a millisecond and make it "2 hours ago".
    const at = Date.now();
    serve({
      "/api/emergency-plans": { plans: [summary()] },
      "/api/weather/home-warnings": held({ now: at, fetchedAt: at - 3 * HOUR }),
    });
    show("/prepare/plans", <PlansPage />, "/prepare/plans");
    const line = await screen.findByTestId("home-warning-line");
    expect(line).toHaveTextContent(
      "“Yellow warning of wind affecting London & South East England” was in force for your area when Outpost last checked, 3 hours ago: open Weather and hazards",
    );
    expect(within(line).getByRole("link", { name: "open Weather and hazards" })).toHaveAttribute("href", "/prepare/weather?view=warnings");
  });

  it("shows on Use now", async () => {
    const at = Date.now();
    serve({
      "/api/emergency-plans/p1": answer(),
      "POST /api/emergency-plans/p1/opened": answer(),
      "/api/weather/home-warnings": held({ now: at, fetchedAt: at - HOUR }),
    });
    show("/prepare/plans/p1/use", <UsePlanPage />, "/prepare/plans/:id/use");
    expect(await screen.findByTestId("home-warning-line")).toHaveTextContent(/when Outpost last checked, 1 hour ago/);
  });
});
