/**
 * The emergency sheet: the marked contacts on one clean page, to print and keep where
 * a phone is not needed to read it. What is on the screen is what is printed; the
 * browser's own Print prints the sheet and nothing around it (see contacts.css).
 */
import { addressLines, type ContactDto } from "@outpost/shared";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { formatDate, plural } from "@/lib/utils";
import { exportHref, labelOr, useEmergencyContacts } from "./contacts-data";

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

export default function EmergencySheetPage() {
  const contacts = useEmergencyContacts();
  const printedOn = Date.now();
  const marked = contacts.data ?? [];
  return (
    <Page width="reading">
      <Link to="/contacts" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-small text-primary">
        <ArrowLeft aria-hidden className="size-4" /> Contacts
      </Link>
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
              <Button variant="primary" onClick={() => window.print()}>
                <Printer /> Print
              </Button>
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
