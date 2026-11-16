/** The Contacts screens against a stand-in server. Every person here is made up. */
import type { ContactDto, ContactImportPreview, ContactListResponse, ContactSummary, HttpsStatus } from "@outpost/shared";
import { emptyContactFields } from "@outpost/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderScreen } from "../manage/test-support";
import { birthdayWords, mailHref, pickerSupport, safeWebHref } from "./contacts-data";
import ContactsPage from "./contacts-page";
import { addressesFor } from "./phones-page";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const summary = (over: Partial<ContactSummary>): ContactSummary => ({
  id: "c1",
  kind: "person",
  displayName: "Maya Okafor",
  initial: "O",
  detail: "",
  phones: [{ value: "07700 900123", label: "mobile" }],
  emails: [],
  tags: [],
  isEmergency: false,
  emergencyNote: "",
  callsign: "",
  ...over,
});

const contact = (over: Partial<ContactDto> = {}): ContactDto => ({
  ...emptyContactFields(),
  id: "c1",
  displayName: "Maya Okafor",
  name: { prefix: "", given: "Maya", additional: "", family: "Okafor", suffix: "" },
  phones: [{ value: "+44 7700 900123", label: "mobile" }],
  emails: [{ value: "maya@okafor.example", label: "home" }],
  place: null,
  pages: [],
  otherFields: [],
  source: "manual",
  createdAt: 1_000,
  updatedAt: 2_000,
  ...over,
});

const listOf = (contacts: ContactSummary[], over: Partial<ContactListResponse> = {}): ContactListResponse => ({
  contacts,
  total: contacts.length,
  all: contacts.length,
  emergency: contacts.filter((entry) => entry.isEmergency).length,
  tags: [],
  ...over,
});

const people = [
  summary({
    id: "c2",
    displayName: "Borrowdale Mountain Rescue",
    kind: "organisation",
    initial: "B",
    isEmergency: true,
    emergencyNote: "Through 999 first.",
    phones: [{ value: "01632 960999", label: "main" }],
  }),
  summary({ id: "c3", displayName: "Tom Abbott", initial: "A", phones: [] }),
  summary({ id: "c1" }),
];

function show(route: string) {
  return renderScreen(
    <Suspense fallback={null}>
      <Routes>
        <Route path="contacts/*" element={<ContactsPage />} />
      </Routes>
    </Suspense>,
    route,
  );
}

const system = { "GET /api/system": { lanAccess: true } };

describe("the list", () => {
  it("says once who can see the contacts, lists the marked ones first, and puts a call one touch away", async () => {
    fakeApi({ ...system, "GET /api/contacts": listOf(people, { tags: [{ name: "Family", count: 2 }] }) });
    show("/contacts");
    expect(
      await screen.findByText(/Everyone who can open this Outpost on your network can read, change and export these contacts/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/There are no accounts to keep them apart/)).toHaveLength(1);

    const groups = await screen.findAllByRole("region");
    expect(groups[0]).toHaveAccessibleName("In an emergency");
    expect(within(groups[0]!).getByRole("link", { name: /^Borrowdale Mountain Rescue/ })).toHaveAttribute("href", "/contacts/c2");
    expect(within(groups[0]!).getByText("Through 999 first.")).toBeInTheDocument();
    expect(within(groups[0]!).getByRole("link", { name: "Print the sheet" })).toHaveAttribute("href", "/contacts/emergency");
    expect(screen.getByRole("link", { name: "Call Borrowdale Mountain Rescue on 01632 960999" })).toHaveAttribute(
      "href",
      "tel:01632960999",
    );
    expect(screen.getByRole("link", { name: "Call Maya Okafor on 07700 900123" })).toHaveAttribute("href", "tel:07700900123");
    // Nobody is offered a call to a contact without a number.
    expect(screen.queryByRole("link", { name: /Call Tom Abbott/ })).not.toBeInTheDocument();
    expect(screen.getByText("3 contacts, 1 marked for an emergency.")).toBeInTheDocument();
  });

  it("finds as the person types, and by tag", async () => {
    const api = fakeApi({ ...system, "GET /api/contacts": listOf(people, { tags: [{ name: "Family", count: 2 }] }) });
    const user = userEvent.setup();
    show("/contacts");
    await user.type(await screen.findByRole("searchbox", { name: "Find a contact" }), "oka");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("q=oka"))).toBe(true));
    await user.click(screen.getByRole("button", { name: /Family/ }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("tag=Family"))).toBe(true));
    expect(screen.getByRole("button", { name: /Family/ })).toHaveAttribute("aria-pressed", "true");
    expect(api.requests.every((request) => request.call.startsWith("GET"))).toBe(true);
  });

  it("invites the first contact when there are none, and says when the list cannot be loaded", async () => {
    fakeApi({ ...system, "GET /api/contacts": listOf([]) });
    const first = show("/contacts");
    expect(await screen.findByRole("heading", { name: "No contacts yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a contact" })).toHaveAttribute("href", "/contacts/new");
    expect(screen.getByRole("link", { name: "Bring in from a phone" })).toHaveAttribute("href", "/contacts/import");
    first.unmount();

    fakeApi({ ...system, "GET /api/contacts": { status: 500, error: { code: "internal", message: "The database is busy." } } });
    show("/contacts");
    expect(await screen.findByText("The database is busy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("one contact", () => {
  it("makes every number a call or a text, an email address a letter, and only a web address a link", async () => {
    fakeApi({
      ...system,
      "GET /api/contacts": listOf(people),
      "GET /api/contacts/c1": {
        contact: contact({
          phones: [
            { value: "+44 7700 900123", label: "mobile" },
            { value: "ask at the harbour office", label: "" },
          ],
          links: [
            { value: "https://okafor.example/tides", label: "website" },
            { value: "javascript:alert(1)", label: "website" },
          ],
          callsign: "M0MAY",
          channels: [{ frequency: "145.500 MHz", mode: "FM" }],
          note: "<b>not markup</b>",
          otherFields: ["Date: 2020-01-01"],
        }),
      },
    });
    show("/contacts/c1");
    expect(await screen.findByRole("heading", { name: "Maya Okafor", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call +44 7700 900123" })).toHaveAttribute("href", "tel:+447700900123");
    expect(screen.getByRole("link", { name: "Text +44 7700 900123" })).toHaveAttribute("href", "sms:+447700900123");
    // Words are not a number: they can be copied, not dialled.
    expect(screen.queryByRole("link", { name: "Call ask at the harbour office" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy ask at the harbour office" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email maya@okafor.example" })).toHaveAttribute("href", "mailto:maya@okafor.example");
    const web = screen.getByRole("link", { name: "https://okafor.example/tides" });
    expect(web).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("javascript:alert(1)").closest("a")).toBeNull();
    expect(screen.getByText("<b>not markup</b>")).toBeInTheDocument();
    expect(screen.getByText("M0MAY")).toBeInTheDocument();
    expect(screen.getByText("1 more field came with this contact")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Large type" })).toHaveAttribute("href", "/contacts/c1/large");
  });

  it("marks a contact for an emergency as a change to the version that was read", async () => {
    let marked = false;
    const api = fakeApi({
      ...system,
      "GET /api/contacts": listOf(people),
      "GET /api/contacts/c1": () => ({ contact: contact(marked ? { isEmergency: true, updatedAt: 3_000 } : {}) }),
      "PATCH /api/contacts/c1": () => {
        marked = true;
        return { contact: contact({ isEmergency: true, updatedAt: 3_000 }) };
      },
    });
    const user = userEvent.setup();
    show("/contacts/c1");
    await user.click(await screen.findByRole("button", { name: "More to do with Maya Okafor" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark for an emergency" }));
    await waitFor(() => expect(api.bodiesOf("PATCH /api/contacts/c1")).toEqual([{ isEmergency: true, baseUpdatedAt: 2_000 }]));
    expect(await screen.findByText("In an emergency.")).toBeInTheDocument();
  });

  it("shows the numbers in large type, each still a call", async () => {
    fakeApi({ ...system, "GET /api/contacts/c1": { contact: contact({ isEmergency: true, emergencyNote: "Sister. Has the keys." }) } });
    show("/contacts/c1/large");
    expect(await screen.findByRole("heading", { name: "Maya Okafor", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Sister. Has the keys.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call +44 7700 900123" })).toHaveAttribute("href", "tel:+447700900123");
    expect(screen.getByRole("link", { name: "Close large type" })).toHaveAttribute("href", "/contacts/c1");
  });
});

describe("adding and changing", () => {
  it("saves a new contact only when asked, with the rows that were filled in", async () => {
    const api = fakeApi({
      ...system,
      "GET /api/contacts": listOf(people),
      "GET /api/maps/markers": { markers: [] },
      "POST /api/contacts": { contact: contact({ id: "c9", displayName: "Hana Nakamura" }) },
      "GET /api/contacts/c9": { contact: contact({ id: "c9", displayName: "Hana Nakamura" }) },
    });
    const user = userEvent.setup();
    show("/contacts/new");
    await user.type(await screen.findByRole("textbox", { name: "First name" }), "Hana");
    await user.type(screen.getByRole("textbox", { name: "Family name" }), "Nakamura");
    await user.click(screen.getByRole("button", { name: "Add a phone number" }));
    await user.type(screen.getByRole("textbox", { name: "Phone number 1" }), "07700 900888");
    await user.click(screen.getByRole("button", { name: "Add an email address" }));
    await user.click(screen.getByRole("switch", { name: "Mark this contact for an emergency" }));
    expect(api.bodiesOf("POST /api/contacts")).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(api.bodiesOf("POST /api/contacts")).toHaveLength(1));
    expect(api.bodiesOf("POST /api/contacts")[0]).toMatchObject({
      kind: "person",
      name: { given: "Hana", family: "Nakamura" },
      phones: [{ value: "07700 900888", label: "mobile" }],
      // The email row that was added and left empty is not sent.
      emails: [],
      isEmergency: true,
      markerId: null,
      pageIds: [],
    });
    expect(await screen.findByRole("heading", { name: "Hana Nakamura", level: 1 })).toBeInTheDocument();
  });

  it("keeps what was typed when the server will not save it, and says why", async () => {
    const api = fakeApi({
      ...system,
      "GET /api/contacts": listOf(people),
      "GET /api/maps/markers": { markers: [] },
      "GET /api/contacts/c1": { contact: contact() },
      "PATCH /api/contacts/c1": {
        status: 409,
        error: {
          code: "conflict",
          message: "This contact was changed somewhere else after you opened it. Nothing was saved. Open it again to see how it is now.",
        },
      },
    });
    const user = userEvent.setup();
    show("/contacts/c1/edit");
    const note = await screen.findByRole("textbox", { name: "Note" });
    await user.type(note, "Night shifts");
    await user.click(screen.getByRole("button", { name: "Save contact" }));
    expect(await screen.findByText(/changed somewhere else after you opened it/)).toBeInTheDocument();
    expect(api.bodiesOf("PATCH /api/contacts/c1")[0]).toMatchObject({ baseUpdatedAt: 2_000, note: "Night shifts" });
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Night shifts");

    // Leaving with something unsaved is asked about first.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("alertdialog", { name: "Leave without saving?" })).toBeInTheDocument();
  });
});

describe("bringing contacts in", () => {
  const preview: ContactImportPreview = {
    token: "tok",
    fileName: "phone.vcf",
    versions: ["3.0"],
    cards: 5,
    fresh: [
      { index: 0, displayName: "Hana Nakamura", detail: "07700 900888" },
      { index: 1, displayName: "João Ferreira", detail: "" },
    ],
    alreadyHere: 1,
    repeated: 0,
    duplicates: [
      {
        index: 2,
        displayName: "Maya Okafor",
        existing: { id: "c1", displayName: "Maya Okafor" },
        reason: "same-card",
        lines: [
          { label: "Name", here: ["Maya Okafor"], incoming: ["Maya Okafor"], differs: false, adds: false },
          {
            label: "Phone",
            here: ["07700 900123 (mobile)"],
            incoming: ["07700 900123 (mobile)", "01632 960200 (work)"],
            differs: true,
            adds: true,
          },
          { label: "Email", here: ["maya@okafor.example"], incoming: [], differs: true, adds: false },
        ],
        mergeAdds: ["1 phone number"],
      },
    ],
    unreadable: [{ position: 5, reason: "It has no name, number or address." }],
    photosLeftOut: 3,
    room: 19_000,
  };

  it("reads the file first, leaves a look-alike alone unless asked, and says exactly what the button will do", async () => {
    const api = fakeApi({
      ...system,
      "POST /api/contacts/import/preview": preview,
      "POST /api/contacts/import/apply": { added: 1, merged: 1, replaced: 0, kept: 0, alreadyHere: 1, leftOut: 1, overLimit: 0 },
    });
    const user = userEvent.setup();
    show("/contacts/import");
    const file = new File(["BEGIN:VCARD\r\nEND:VCARD\r\n"], "phone.vcf", { type: "text/vcard" });
    await user.upload(await screen.findByLabelText("vCard file"), file);

    expect(await screen.findByText("Nothing has been changed yet.")).toBeInTheDocument();
    expect(screen.getByText("2 contacts are new.")).toBeInTheDocument();
    expect(screen.getByText(/1 is already here, with everything this has for it/)).toBeInTheDocument();
    expect(screen.getByText("3 pictures in the file were left out: Outpost keeps no photos of people.")).toBeInTheDocument();
    expect(screen.getByText("It has no name, number or address.")).toBeInTheDocument();

    // Side by side, with what the file would add marked, and Outpost's own kept unless chosen otherwise.
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "In Outpost" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "In the file" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /Phone\s*differs/ })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /Email\s*only in Outpost/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Leave Outpost’s as it is/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add 2 contacts" })).toBeInTheDocument();
    expect(api.bodiesOf("POST /api/contacts/import/apply")).toEqual([]);

    await user.click(screen.getByRole("radio", { name: /Add what is new/ }));
    await user.click(screen.getByRole("checkbox", { name: /João Ferreira/ }));
    await user.click(screen.getByRole("button", { name: "Add 1 contact and change 1" }));
    await waitFor(() =>
      expect(api.bodiesOf("POST /api/contacts/import/apply")).toEqual([{ token: "tok", choices: { "2": "merge" }, leaveOut: [1] }]),
    );
    expect(await screen.findByText("Added 1 contact.")).toBeInTheDocument();
    expect(screen.getByText("Added what was new to 1 contact already here.")).toBeInTheDocument();
    expect(screen.getByText("Left out 1 that you unticked.")).toBeInTheDocument();
  });

  it("says why a file could not be read, and why this browser has no picker", async () => {
    fakeApi({
      ...system,
      "POST /api/contacts/import/preview": {
        status: 400,
        error: {
          code: "bad_request",
          message: "That file holds no contacts. A vCard file has a line that reads BEGIN:VCARD for each one.",
        },
      },
    });
    // Whatever a person manages to choose is sent, and the server says what it is not.
    const user = userEvent.setup({ applyAccept: false });
    show("/contacts/import");
    await user.upload(await screen.findByLabelText("vCard file"), new File(["name,phone"], "contacts.csv", { type: "text/csv" }));
    expect(await screen.findByText(/That file holds no contacts/)).toBeInTheDocument();
    expect(screen.getByText(/This browser cannot hand contacts to a web page/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pick from this phone" })).not.toBeInTheDocument();
    expect(screen.getByText("iPhone or iPad")).toBeInTheDocument();
    expect(screen.getByText("Android phone")).toBeInTheDocument();
  });
});

describe("the emergency sheet", () => {
  it("lays out the marked contacts as a page, and gives the printer a copy that is the only thing on the paper", async () => {
    fakeApi({
      ...system,
      "GET /api/contacts/emergency": {
        contacts: [
          contact({
            isEmergency: true,
            emergencyNote: "Sister. Has the keys.",
            callsign: "M0MAY",
            channels: [{ frequency: "145.500 MHz", mode: "FM" }],
            addresses: [{ label: "home", street: "4 Mill Lane", locality: "Hawes", region: "", postcode: "DL8 9ZZ", country: "" }],
          }),
        ],
      },
    });
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const user = userEvent.setup();
    show("/contacts/emergency");
    const sheet = await screen.findByTestId("sheet-preview");
    expect(within(sheet).getByRole("heading", { name: "In an emergency" })).toBeInTheDocument();
    expect(within(sheet).getByText("Maya Okafor")).toBeInTheDocument();
    expect(within(sheet).getByText("Sister. Has the keys.")).toBeInTheDocument();
    expect(within(sheet).getByText("+44 7700 900123")).toBeInTheDocument();
    expect(within(sheet).getByText("M0MAY")).toBeInTheDocument();
    expect(within(sheet).getByText("4 Mill Lane, Hawes DL8 9ZZ")).toBeInTheDocument();

    // The copy for the printer is a child of the body itself, which is what the print rules in contacts.css rely on.
    const copy = document.body.querySelector(":scope > .outpost-contacts-print");
    expect(copy).not.toBeNull();
    expect(copy).toHaveTextContent("Maya Okafor");
    expect(copy).toHaveTextContent("+44 7700 900123");

    await user.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Save these as a vCard file" })).toHaveAttribute(
      "href",
      "/api/contacts/export.vcf?emergency=1",
    );
  });

  it("has no Print button where the browser cannot print, and says how to print the sheet all the same", async () => {
    fakeApi({ ...system, "GET /api/contacts/emergency": { contacts: [contact({ isEmergency: true })] } });
    vi.stubGlobal("print", undefined);
    show("/contacts/emergency");
    const sheet = await screen.findByTestId("sheet-preview");
    expect(within(sheet).getByText("Maya Okafor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
    const notice = screen.getByText("This browser cannot print from a page").closest('[role="status"]')!;
    expect(notice).toHaveTextContent("Use the browser’s own Share menu, then Print, or take a screenshot of it.");
    // The copy that the browser's own Print prints is there whether or not the button is.
    expect(document.body.querySelector(":scope > .outpost-contacts-print")).toHaveTextContent("Maya Okafor");
    expect(screen.getByRole("link", { name: "Save these as a vCard file" })).toBeInTheDocument();
  });

  it("says that Print may not start where the app was opened from the Home Screen", async () => {
    fakeApi({ ...system, "GET /api/contacts/emergency": { contacts: [contact({ isEmergency: true })] } });
    vi.stubGlobal("print", vi.fn());
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    try {
      show("/contacts/emergency");
      await screen.findByTestId("sheet-preview");
      expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
      expect(screen.getByText("Opened from the Home Screen, a phone does not always print from a button")).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "standalone", { value: undefined, configurable: true });
    }
  });

  it("says how to mark someone when nobody is", async () => {
    fakeApi({ ...system, "GET /api/contacts/emergency": { contacts: [] } });
    show("/contacts/emergency");
    expect(await screen.findByRole("heading", { name: "Nobody is marked for an emergency yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
  });
});

describe("keeping a copy on a phone", () => {
  const https = (over: Partial<HttpsStatus>): HttpsStatus => ({ enabled: true, listening: true, addresses: [], ...over }) as HttpsStatus;

  it("says which way contacts travel before anything else, and turns on with a setting", async () => {
    const api = fakeApi({
      ...system,
      "GET /api/contacts/phones": {
        enabled: false,
        unavailable: null,
        lanAccess: true,
        userName: "outpost",
        path: "/dav/principal/",
        contacts: 9,
      },
      "GET /api/settings": { settings: { "contacts.carddav": false } },
      "GET /api/https": https({ listening: false }),
      "PATCH /api/settings": { settings: { "contacts.carddav": true } },
    });
    const user = userEvent.setup();
    show("/contacts/phones");
    expect(await screen.findByText("From Outpost to the phone, and never back.")).toBeInTheDocument();
    expect(
      screen.getByText(/Whatever is added, changed or deleted on the phone in this address book is refused by Outpost/),
    ).toBeInTheDocument();
    expect(screen.queryByText("User name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Let phones on your network subscribe to these contacts" }));
    await waitFor(() => expect(api.bodiesOf("PATCH /api/settings")).toEqual([{ "contacts.carddav": true }]));
    expect(await screen.findByText("User name")).toBeInTheDocument();
    expect(screen.getByText(/There is none. Outpost has no accounts/)).toBeInTheDocument();
    expect(screen.getByText(/Never type one you use\s+anywhere else/)).toBeInTheDocument();
    expect(screen.getByText(/not yet on an iPhone, an Android phone or a Mac/)).toBeInTheDocument();
  });

  it("offers the https addresses first, and never one only this computer can use", () => {
    const status = https({
      addresses: [
        { url: "https://192.168.1.20:8443", name: "192.168.1.20", kind: "address" },
        { url: "https://localhost:8443", name: "localhost", kind: "this-computer" },
      ],
    });
    expect(addressesFor(status, "http://192.168.1.20:8080", "/dav/principal/")).toEqual([
      { url: "https://192.168.1.20:8443/dav/principal/", secure: true },
      { url: "http://192.168.1.20:8080/dav/principal/", secure: false },
    ]);
    expect(addressesFor(https({ listening: false, addresses: status.addresses }), "http://localhost:8080", "/dav/principal/")).toEqual([]);
    expect(addressesFor(undefined, "https://outpost.local:8443", "/dav/principal/")).toEqual([
      { url: "https://outpost.local:8443/dav/principal/", secure: true },
    ]);
  });
});

describe("small things the screens rely on", () => {
  it("makes links only of web addresses and email addresses", () => {
    expect(safeWebHref("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
    expect(safeWebHref("example.org/tides")).toBe("https://example.org/tides");
    expect(safeWebHref("javascript:alert(1)")).toBeNull();
    expect(safeWebHref("data:text/html,<script>1</script>")).toBeNull();
    expect(safeWebHref("file:///etc/passwd")).toBeNull();
    expect(safeWebHref("ask at the desk")).toBeNull();
    expect(mailHref(" maya@okafor.example ")).toBe("mailto:maya@okafor.example");
    expect(mailHref("maya@okafor.example?bcc=someone@example.org&body=x y")).toBeNull();
    expect(mailHref("not an address")).toBeNull();
  });

  it("writes a birthday in words, with or without its year", () => {
    expect(birthdayWords("1984-03-09")).toBe("9 March 1984");
    expect(birthdayWords("--03-09")).toBe("9 March");
    expect(birthdayWords("early spring")).toBe("early spring");
  });

  it("knows a browser without a contact picker from one that only lacks https", () => {
    expect(pickerSupport()).toBe("unsupported");
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
    });
    vi.stubGlobal("isSecureContext", false);
    expect(pickerSupport()).toBe("needs-https");
    vi.stubGlobal("navigator", { userAgent: "Android Chrome/142", contacts: { select: async () => [], getProperties: async () => [] } });
    vi.stubGlobal("ContactsManager", class {});
    expect(pickerSupport()).toBe("available");
  });
});
