/** The emergency sheet's PDF: the three buttons, and the question before anyone's details go into the library. Every person here is made up. */
import { type ContactDto, emptyContactFields } from "@outpost/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Printing } from "@/lib/printing";
import { SheetPdf } from "./emergency-sheet";

const contact = (over: Partial<ContactDto>): ContactDto => ({
  ...emptyContactFields(),
  id: "c1",
  displayName: "Maya Okafor",
  phones: [{ value: "+44 7700 900123", label: "mobile" }],
  place: null,
  pages: [],
  otherFields: [],
  source: "manual",
  createdAt: 1_000,
  updatedAt: 2_000,
  isEmergency: true,
  ...over,
});
const people = [contact({}), contact({ id: "c2", displayName: "Ελένη Παπαδοπούλου", phones: [{ value: "+30 21 0123 4567", label: "" }] })];

const printing: Printing = { canPrint: true, standalone: false, print: () => undefined, unanswered: false, lead: "print" };

const sent: FormData[] = [];
class Upload {
  upload = {};
  status = 200;
  responseText = JSON.stringify({
    results: [
      {
        originalName: "x.pdf",
        status: "created",
        document: { id: "d9", title: "Emergency sheet, 2 contacts", category: "Made in Outpost" },
      },
    ],
  });
  onload: (() => void) | undefined;
  open() {}
  setRequestHeader() {}
  send(form: FormData) {
    sent.push(form);
    this.onload?.();
  }
  abort() {}
}

const made: File[] = [];
beforeEach(() => {
  URL.createObjectURL = vi.fn((file: Blob) => `blob:made-${made.push(file as File)}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("XMLHttpRequest", Upload);
});
afterEach(() => {
  sent.length = 0;
  made.length = 0;
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the emergency sheet as a PDF", () => {
  it("offers Save as PDF, Add to library and asks before adding other people's details", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SheetPdf contacts={people} printing={printing} />
      </MemoryRouter>,
    );
    const block = screen.getByRole("region", { name: "The sheet as a PDF" });
    const save = await within(block).findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
    expect(save.getAttribute("download")).toMatch(/^emergency-sheet-2-contacts-made-\d{1,2}-[a-z]{3}-\d{4}\.pdf$/);
    expect((await made.at(-1)!.text()).startsWith("%PDF-1.")).toBe(true);
    expect(block).toHaveTextContent(/1 page of (A4|US Letter), made on this device on \d{1,2} \w+ \d{4} at \d\d:\d\d\./);
    expect(block).toHaveTextContent("The file carries the date it was made.");

    // Asked first; saying no sends nothing.
    await user.click(within(block).getByRole("button", { name: "Add to library" }));
    const question = await screen.findByRole("alertdialog", { name: "Put other people’s details in the library?" });
    expect(question).toHaveTextContent("names, numbers and addresses of 2 people");
    expect(question).toHaveTextContent("everyone who can reach Outpost on your network can read it and find it by search");
    expect(question).toHaveTextContent("It also goes into every backup.");
    expect(question).toHaveTextContent("It will not change when a contact is corrected or removed");
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(sent).toHaveLength(0);

    // Saying yes sends the same bytes through the library's upload.
    await user.click(within(block).getByRole("button", { name: "Add to library" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Add to library" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.get("title")).toMatch(/^Emergency sheet, 2 contacts, made \d{1,2} \w{3} \d{4}$/);
    expect(sent[0]!.get("tags")).toBe("Emergency sheet");
    expect(sent[0]!.get("category")).toBe("Made in Outpost");
    expect(sent[0]!.get("source")).toBe("Made in Outpost from the emergency sheet of contacts: /contacts/emergency");
    expect((sent[0]!.get("file") as File).size).toBe(made.at(-1)!.size);
    expect(await within(block).findByTestId("pdf-status")).toHaveTextContent("Added to the library under “Made in Outpost” as");
  }, 20_000);
});
