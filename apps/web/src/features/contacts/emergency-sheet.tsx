/**
 * The emergency sheet: the marked contacts on one clean page, to print and keep where
 * a phone is not needed to read it. What is on the screen is what is printed; the
 * browser's own Print prints the sheet and nothing around it (see contacts.css).
 *
 * The same sheet is made as a PDF with the print kit (kit-emergency.ts), with the three
 * things every PDF made in Outpost offers: save it, add it to the library, share it. Adding it to
 * the library asks first, because the sheet is other people's details.
 */
import { addressLines, type ContactDto } from "@outpost/shared";
import { Download, Printer } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { BackLink, EmptyState, ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { PrintNotice } from "@/components/print-notice";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { PAPERS } from "@/features/maps/print/paper";
import { useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { useClockStyle } from "@/lib/clock";
import { type Printing, usePrinting } from "@/lib/printing";
import { formatDate, plural } from "@/lib/utils";
import { exportHref, labelOr, useEmergencyContacts } from "./contacts-data";
import { emergencyTitle, madeWords, type SheetPaper } from "./emergency-document";
import { emergencyDocument } from "./kit-emergency";

/** The sheet itself. Black on white whatever the theme, and sized in points, because it is paper. */
export function EmergencySheet({ contacts, printedOn }: { contacts: ContactDto[]; printedOn: number }) {
  return (
    <div className="outpost-contacts-sheet">
      <h1 className="font-title">In an emergency</h1>
      <p className="sheet-quiet" style={{ marginBottom: "10pt" }}>
        {plural(contacts.length, "contact")}, as kept in Outpost on {formatDate(printedOn)}.
      </p>
      {contacts.map((contact) => {
        const role = [
          contact.kind === "person" ? [contact.title, contact.organisation].filter(Boolean).join(", ") : contact.department,
          contact.emergencyNote,
        ].filter(Boolean);
        return (
          <section key={contact.id} className="sheet-entry">
            <p className="sheet-name">{contact.displayName}</p>
            {role.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <table style={{ marginTop: "3pt", borderCollapse: "collapse" }}>
              <tbody>
                {contact.phones.map((phone, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a contact may hold the same number twice
                  <tr key={index}>
                    <th scope="row" className="sheet-label">
                      {labelOr(phone.label, "phone")}
                    </th>
                    <td className="sheet-number">{phone.value}</td>
                  </tr>
                ))}
                {contact.callsign ? (
                  <tr>
                    <th scope="row" className="sheet-label">
                      callsign
                    </th>
                    <td className="sheet-number">{contact.callsign}</td>
                  </tr>
                ) : null}
                {contact.channels.map((channel, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: frequencies have no identity of their own
                  <tr key={index}>
                    <th scope="row" className="sheet-label">
                      {index === 0 ? "radio" : ""}
                    </th>
                    <td>
                      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{channel.frequency}</span> {channel.mode}
                    </td>
                  </tr>
                ))}
                {contact.emails.map((email, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: as above
                  <tr key={index}>
                    <th scope="row" className="sheet-label">
                      {index === 0 ? "email" : ""}
                    </th>
                    <td>{email.value}</td>
                  </tr>
                ))}
                {contact.addresses.map((address, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: as above
                  <tr key={index}>
                    <th scope="row" className="sheet-label">
                      {labelOr(address.label, "address")}
                    </th>
                    <td>{addressLines(address).join(", ")}</td>
                  </tr>
                ))}
                {contact.place ? (
                  <tr>
                    <th scope="row" className="sheet-label">
                      on the map
                    </th>
                    <td>
                      {contact.place.name}{" "}
                      <span className="sheet-quiet" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {contact.place.lat.toFixed(5)}, {contact.place.lon.toFixed(5)}
                      </span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

/** What "Add to library" asks before it sends anything. */
export function libraryQuestion(count: number) {
  return {
    title: "Put other people’s details in the library?",
    description: (
      <>
        <span className="block">
          This sheet holds the names, numbers and addresses of {plural(count, "person", "people")}. In the library everyone who can reach
          Outpost on your network can read it and find it by search, as they can on the Contacts screen. It also goes into every backup.
        </span>
        <span className="mt-2 block">
          It is a copy. It will not change when a contact is corrected or removed, and it stays in the library and its backups until you
          delete it there.
        </span>
      </>
    ),
  };
}

/**
 * The sheet as a PDF, laid out with the print kit: made on this device when the screen
 * opens, and again when the contacts or the paper change. Names in other scripts are set
 * in the kit's fallback typefaces, as words a reader can search.
 */
export function SheetPdf({ contacts, printing }: { contacts: ContactDto[]; printing: Printing }) {
  const style = useClockStyle();
  const [paper, setPaper] = useState<SheetPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  // When it was made: a new moment whenever what it is made from changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the inputs are what make a new sheet
  const at = useMemo(() => new Date(), [contacts, style, paper]);
  const make = useCallback(() => emergencyDocument(contacts, { made: at, style, paper }), [contacts, style, paper, at]);
  const made = useKitPdf(make, {
    title: emergencyTitle(contacts, at),
    kind: "Emergency sheet",
    from: { what: "the emergency sheet of contacts", path: "/contacts/emergency" },
  });
  return (
    <section aria-label="The sheet as a PDF" className="mb-5 grid max-w-[65ch] gap-3 border-y border-border py-4" data-testid="sheet-pdf">
      <div>
        <h2 className="text-body font-semibold text-ink">The sheet as a PDF</h2>
        <p className="mt-0.5 text-small text-ink-muted">
          {made.status === "made"
            ? `${plural(made.pages, "page")} of ${PAPERS[paper].label}, made on this device on ${madeWords(at, style)}.`
            : `Being made on this device, on ${PAPERS[paper].label}.`}{" "}
          The file carries the date it was made. Save it to keep it on this device, or add it to the library to print it from anywhere.
        </p>
      </div>
      {made.status === "failed" ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error} The sheet below can still be printed from the browser.
        </Notice>
      ) : (
        <PdfActions
          pdf={made.status === "made" ? made.pdf : null}
          lead={printing.lead === "print" ? "none" : undefined}
          confirm={libraryQuestion(contacts.length)}
        />
      )}
      <Segmented<SheetPaper>
        label="Paper for the PDF"
        value={paper}
        onChange={(next) => {
          setPaper(next);
          writeStored(AID_PAPER_KEY, next);
        }}
        options={(["a4", "letter"] as const).map((id) => ({ value: id, label: PAPERS[id].label }))}
        className="justify-self-start"
      />
    </section>
  );
}

export default function EmergencySheetPage() {
  const contacts = useEmergencyContacts();
  const printedOn = Date.now();
  const marked = contacts.data ?? [];
  const printing = usePrinting();
  return (
    <Page width="reading">
      <BackLink to="/contacts" className="mb-2">
        Contacts
      </BackLink>
      <PageHeader
        title="Emergency sheet"
        description="The contacts marked for an emergency, on a page to print and keep by the door, in the car or in a grab bag."
        actions={
          marked.length > 0 ? (
            <>
              <Button asChild>
                <a href={exportHref({ emergency: true })} download>
                  <Download /> Save these as a vCard file
                </a>
              </Button>
              {printing.canPrint ? (
                <Button variant="primary" onClick={printing.print}>
                  <Printer /> Print
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      {contacts.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : contacts.isError ? (
        <ErrorState error={contacts.error} onRetry={() => contacts.refetch()} />
      ) : marked.length === 0 ? (
        <EmptyState
          title="Nobody is marked for an emergency yet"
          action={
            <Button asChild variant="primary">
              <Link to="/contacts">Choose contacts to mark</Link>
            </Button>
          }
        >
          Open a contact and choose “Mark for an emergency”. Marked contacts are listed first and printed here.
        </EmptyState>
      ) : (
        <>
          {/* Where the button cannot start a print, the sheet below is still the page: the browser's own Print prints it alone. */}
          <PrintNotice
            printing={printing}
            instead="Use the browser’s own Share menu, then Print, or take a screenshot of the sheet below."
            className="mb-4 max-w-[65ch]"
          />
          <SheetPdf contacts={marked} printing={printing} />
          <p className="mb-3 max-w-[65ch] text-small text-ink-muted">
            This is the page as it prints. A printed sheet can be read by whoever finds it, and does not change when a contact does: print
            it again after changing a number.
          </p>
          {/* On screen: the sheet as a sheet of paper, so that what will print can be read before printing. */}
          <div className="outpost-contacts-paper rounded-panel border border-border-strong p-6 md:p-10" data-testid="sheet-preview">
            <EmergencySheet contacts={marked} printedOn={printedOn} />
          </div>
          {/* For the printer: a copy that is a child of the body, the only thing on the paper. */}
          {createPortal(
            <div className="outpost-contacts-print">
              <EmergencySheet contacts={marked} printedOn={printedOn} />
            </div>,
            document.body,
          )}
        </>
      )}
    </Page>
  );
}
