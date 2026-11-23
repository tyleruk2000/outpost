/**
 * The steps on a phone, as its maker's own help pages give them. They were read on
 * 16 November 2026 (the sources are in docs/contacts.md) and have not been tried on a
 * phone, which the screens that show them say.
 */
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

function Steps({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <details className="group border-b border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-body font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <ol className="mb-3 ml-11 grid max-w-[65ch] list-decimal gap-1.5 text-small text-ink marker:text-ink-muted">{children}</ol>
      {note ? <p className="mb-3 ml-6 max-w-[65ch] text-small text-ink-muted">{note}</p> : null}
    </details>
  );
}

const Name = ({ children }: { children: ReactNode }) => <span className="font-semibold">{children}</span>;

/** Getting a vCard file out of a phone. */
export function ExportSteps() {
  return (
    <div className="border-t border-border">
      <Steps
        title="iPhone or iPad"
        note="Apple’s guide describes this for any list. To send everyone, use the list that holds all your contacts. From a computer, iCloud.com does the same: Contacts, select all, then Export vCard."
      >
        <li>
          Open <Name>Contacts</Name> and tap <Name>Lists</Name> at the top left.
        </li>
        <li>
          Touch and hold the list you want, then tap <Name>Export</Name>.
        </li>
        <li>
          Choose the fields to include and tap <Name>Done</Name>.
        </li>
        <li>
          Choose <Name>Save to Files</Name>. Then come back to this page, in Safari on the phone, and choose that file.
        </li>
      </Steps>
      <Steps
        title="Android phone"
        note="This is Google’s Contacts app. Other makers’ contacts apps have an export to a .vcf file too, usually under Manage contacts or Settings."
      >
        <li>
          Open <Name>Contacts</Name>.
        </li>
        <li>
          At the bottom, tap <Name>Fix &amp; manage</Name> (called <Name>Organise</Name> in some versions), then <Name>Export to file</Name>
          .
        </li>
        <li>
          Choose the account to export from and tap <Name>Export to .VCF file</Name>.
        </li>
        <li>Come back to this page on the phone and choose that file.</li>
      </Steps>
      <Steps title="Putting contacts from Outpost onto a phone, once">
        <li>
          On the phone, open Outpost’s Contacts and choose <Name>Export all as a vCard file</Name> from the menu, or save one contact from
          its own menu.
        </li>
        <li>
          On an iPhone, tap the file once it has downloaded and choose to add the contacts. On Android, open Contacts, then Fix &amp; manage
          (or Organise), then Import from file.
        </li>
      </Steps>
    </div>
  );
}

/** Subscribing a device to the address book. `address` is the one to type on it. */
export function SubscribeSteps({ address, userName }: { address: string; userName: string }) {
  const typed = <span className="font-mono text-[0.8125rem] break-all">{address}</span>;
  return (
    <div className="border-t border-border">
      <Steps
        title="iPhone or iPad"
        note="An iPhone uses a contacts account only over https, with a certificate it trusts. Outpost’s HTTPS section in Settings shows how to make the phone trust it."
      >
        <li>
          Open <Name>Settings</Name>, then <Name>Apps</Name>, <Name>Contacts</Name>, <Name>Contacts Accounts</Name>.
        </li>
        <li>
          Tap <Name>Add Account</Name>, <Name>Add Other Account</Name>, then <Name>Add CardDAV Account</Name>.
        </li>
        <li>
          Server: {typed}. User name: <Name>{userName}</Name>. Password: <Name>{userName}</Name> (it is not checked).
        </li>
        <li>
          Tap <Name>Next</Name>. The contacts appear in the Contacts app under a list named for this account.
        </li>
      </Steps>
      <Steps
        title="Android phone"
        note="Android has no CardDAV of its own. DAVx⁵ is a free, open-source app that adds it. It asks you to accept Outpost’s certificate the first time unless the phone already trusts it."
      >
        <li>
          Install <Name>DAVx⁵</Name> and tap the button to add an account.
        </li>
        <li>
          Choose <Name>Advanced login</Name>. Base URL: {typed}. Leave the user name and password empty.
        </li>
        <li>
          Choose the <Name>Outpost</Name> address book and let it sync. The contacts appear in the phone’s Contacts app.
        </li>
      </Steps>
      <Steps title="Mac" note="A Mac uses a contacts account only over https, with Outpost’s certificate trusted in Keychain Access.">
        <li>
          Open <Name>Contacts</Name>, then <Name>Contacts</Name> in the menu bar, <Name>Add Account</Name>,{" "}
          <Name>Other Contacts Account</Name>.
        </li>
        <li>
          Choose <Name>CardDAV</Name> and the account type <Name>Manual</Name>.
        </li>
        <li>
          User name: <Name>{userName}</Name>. Password: <Name>{userName}</Name>. Server address: {typed}.
        </li>
      </Steps>
    </div>
  );
}
