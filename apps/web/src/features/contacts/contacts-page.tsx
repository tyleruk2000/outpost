/**
 * Contacts: the people and places to reach when the phone network and the internet are
 * down. A list to find someone in, with the contact that is open beside it on a wide
 * screen and in its place on a phone.
 *
 * The addresses under /contacts are routed here, so that the rest of the app needs to
 * know one address and no more.
 */
import "./contacts.css";
import type { ContactSummary } from "@outpost/shared";
import { dialable } from "@outpost/shared";
import { Download, Ellipsis, FileUp, LifeBuoy, Phone, Plus, Printer, Search, Smartphone, X } from "lucide-react";
import { lazy, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/misc";
import { useDebounced } from "@/lib/use-debounced";
import { cn, formatNumber, plural } from "@/lib/utils";
import { ContactDetail } from "./contact-detail";
import { ContactEditor } from "./contact-editor";
import { exportHref, LIST_STEP, type ListFilter, useContactList, usePhoneStatus } from "./contacts-data";

const ImportPage = lazy(() => import("./import-page"));
const PhonesPage = lazy(() => import("./phones-page"));
const EmergencySheetPage = lazy(() => import("./emergency-sheet"));
const LargeView = lazy(() => import("./contact-large"));

/** Said once, on the list: there are no accounts, so there is no keeping contacts from anyone who can open Outpost. */
function WhoCanSee() {
  // The phones screen's status carries the one fact needed here, and is not polled.
  const shared = usePhoneStatus().data?.lanAccess ?? true;
  return (
    <p className="max-w-[70ch] text-small text-ink-muted">
      {shared
        ? "Everyone who can open this Outpost on your network can read, change and export these contacts. There are no accounts to keep them apart."
        : "Outpost is open only on this computer at the moment, so these contacts can be read here and nowhere else. If it is shared on a network, everyone who can open it can read, change and export them: there are no accounts to keep them apart."}
    </p>
  );
}

function Row({ contact, inEmergencyGroup }: { contact: ContactSummary; inEmergencyGroup: boolean }) {
  const first = contact.phones[0];
  const number = first ? dialable(first.value) : null;
  const second = (inEmergencyGroup && contact.emergencyNote) || contact.detail || contact.callsign || contact.emails[0]?.value || "";
  return (
    <li className="flex items-stretch">
      <NavLink
        to={`/contacts/${contact.id}`}
        className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-control px-2.5 py-2 transition-colors duration-150 hover:bg-surface aria-[current=page]:bg-primary-soft"
      >
        <span className="min-w-0 flex-1">
          {/* A name is what the row is for: it takes a second line rather than lose its end. */}
          <span className="line-clamp-2 block text-body font-medium [overflow-wrap:anywhere] text-ink group-aria-[current=page]:text-primary-soft-ink">
            {contact.displayName}
          </span>
          {second ? <span className="block truncate text-small text-ink-muted">{second}</span> : null}
        </span>
        {first ? <span className="tabular hidden shrink-0 text-small text-ink-muted @lg:block">{first.value}</span> : null}
      </NavLink>
      {first && number ? (
        <a
          href={`tel:${number}`}
          aria-label={`Call ${contact.displayName} on ${first.value}`}
          className="grid w-11 shrink-0 place-content-center rounded-control text-primary transition-colors duration-150 hover:bg-surface-strong"
        >
          <Phone aria-hidden className="size-[18px]" strokeWidth={1.8} />
        </a>
      ) : (
        <span aria-hidden className="w-11 shrink-0" />
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-2" aria-busy>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <Skeleton key={row} className="h-12" />
      ))}
    </div>
  );
}

function ContactList({ filter, setFilter }: { filter: ListFilter; setFilter: (next: ListFilter) => void }) {
  const [draft, setDraft] = useState(filter.q);
  const settled = useDebounced(draft.trim(), 150);
  // Only what was typed moves the filter from here. A change made elsewhere (a tag, "Show everyone") is not undone by it.
  const latest = useRef(filter);
  latest.current = filter;
  useEffect(() => {
    if (settled !== latest.current.q) setFilter({ ...latest.current, q: settled, limit: LIST_STEP });
  }, [settled, setFilter]);

  const list = useContactList(filter);
  const data = list.data;
  const filtering = Boolean(filter.q || filter.tag);

  if (list.isPending) return <ListSkeleton />;
  if (list.isError || !data) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (data.all === 0) {
    return (
      <EmptyState
        title="No contacts yet"
        action={
          <>
            <Button asChild variant="primary">
              <Link to="/contacts/new">Add contact</Link>
            </Button>
            <Button asChild>
              <Link to="/contacts/import">Bring in from a phone or a file</Link>
            </Button>
          </>
        }
      >
        Keep the numbers you would want if your phone were lost or the network were down: family, neighbours, a doctor, a meeting point, a
        callsign and the frequency to try.
      </EmptyState>
    );
  }

  // In the order they arrive: the marked contacts, then by name. A heading goes wherever the group changes.
  const groups: Array<{ key: string; title: string; emergency: boolean; contacts: ContactSummary[] }> = [];
  for (const contact of data.contacts) {
    const key = contact.isEmergency ? "emergency" : contact.initial;
    const last = groups.at(-1);
    if (last?.key === key) last.contacts.push(contact);
    else
      groups.push({
        key,
        title: contact.isEmergency ? "In an emergency" : contact.initial,
        emergency: contact.isEmergency,
        contacts: [contact],
      });
  }

  return (
    <div className="@container">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Find by name, number, place or callsign"
          aria-label="Find a contact"
          className="pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {draft ? (
          <button
            type="button"
            aria-label="Clear what is typed"
            onClick={() => setDraft("")}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-content-center rounded-control text-ink-muted hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>

      {data.tags.length > 0 ? (
        <ul aria-label="Show one tag" className="mt-3 flex flex-wrap gap-1.5">
          {data.tags.map((tag) => {
            const on = filter.tag.toLowerCase() === tag.name.toLowerCase();
            return (
              <li key={tag.name} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter({ ...filter, tag: on ? "" : tag.name, limit: LIST_STEP })}
                  className={cn(
                    "flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-small transition-colors duration-150 max-md:h-11",
                    on
                      ? "border-primary bg-primary-soft font-medium text-primary-soft-ink"
                      : "border-border-strong text-ink-muted hover:bg-surface hover:text-ink",
                  )}
                >
                  <span className="truncate">{tag.name}</span>
                  <span className="tabular text-micro">{formatNumber(tag.count)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-3 text-small text-ink-muted" aria-live="polite">
        {filtering
          ? data.total === 0
            ? "Nobody matches."
            : `${plural(data.total, "contact")} of ${formatNumber(data.all)} ${data.total === 1 ? "matches" : "match"}.`
          : `${plural(data.all, "contact")}${data.emergency > 0 ? `, ${formatNumber(data.emergency)} marked for an emergency` : ""}.`}
      </p>

      {data.total === 0 ? (
        <p className="mt-6 text-small text-ink-muted">
          Try fewer letters, or part of a number.{" "}
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={() => {
              setDraft("");
              setFilter({ q: "", tag: "", limit: LIST_STEP });
            }}
          >
            Show everyone
          </button>
        </p>
      ) : (
        <div data-contact-list className={cn("mt-2", list.isPlaceholderData && "opacity-70")}>
          {groups.map((group) => (
            <section key={group.key} aria-label={group.emergency ? "In an emergency" : `Names under ${group.title}`}>
              <h2 className="sticky top-13 z-(--z-sticky) flex items-center gap-2 border-b border-border bg-page px-2.5 pt-4 pb-1.5 text-small font-semibold text-ink-muted md:top-0">
                {group.emergency ? <LifeBuoy aria-hidden className="size-4 text-primary" strokeWidth={1.8} /> : null}
                <span className="flex-1">{group.title}</span>
                {group.emergency ? (
                  <Link
                    to="/contacts/emergency"
                    className="-my-2 inline-flex min-h-9 items-center gap-1.5 font-medium text-primary max-md:min-h-11"
                  >
                    <Printer aria-hidden className="size-4" /> Print the sheet
                  </Link>
                ) : null}
              </h2>
              <ul className="divide-y divide-border">
                {group.contacts.map((contact) => (
                  <Row key={contact.id} contact={contact} inEmergencyGroup={group.emergency} />
                ))}
              </ul>
            </section>
          ))}
          {data.total > data.contacts.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={() => setFilter({ ...filter, limit: filter.limit + LIST_STEP })} loading={list.isFetching}>
                Show more
              </Button>
              <p className="text-small text-ink-muted">
                Showing {formatNumber(data.contacts.length)} of {formatNumber(data.total)}. Typing a few letters is quicker.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The list, with whatever is open beside it. On a phone the two take turns. */
function Frame({ pane, filter, setFilter }: { pane?: ReactNode; filter: ListFilter; setFilter: (next: ListFilter) => void }) {
  return (
    <Page>
      <div className={cn(pane && "max-lg:hidden")}>
        <PageHeader
          title="Contacts"
          description="People and places to reach when the phone network and the internet are down."
          className="mb-4"
          actions={
            <>
              <Button asChild variant="primary">
                <Link to="/contacts/new">
                  <Plus /> Add contact
                </Link>
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More to do with contacts">
                    <Ellipsis />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem asChild>
                    <Link to="/contacts/import">
                      <FileUp /> Bring in from a phone or a file
                    </Link>
                  </MenuItem>
                  <MenuItem asChild>
                    <Link to="/contacts/phones">
                      <Smartphone /> Keep a copy on a phone
                    </Link>
                  </MenuItem>
                  <MenuItem asChild>
                    <Link to="/contacts/emergency">
                      <Printer /> Print the emergency sheet
                    </Link>
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem asChild>
                    <a href={exportHref()} download>
                      <Download /> Export all as a vCard file
                    </a>
                  </MenuItem>
                </MenuContent>
              </Menu>
            </>
          }
        />
        <WhoCanSee />
      </div>
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-x-12 lg:mt-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]", !pane && "mt-6")}>
        <div className={cn("min-w-0", pane && "max-lg:hidden")}>
          <ContactList filter={filter} setFilter={setFilter} />
        </div>
        <div className={cn("min-w-0", !pane && "max-lg:hidden")}>
          {pane ?? <p className="pt-16 text-small text-ink-muted">Choose a contact to see how to reach them.</p>}
        </div>
      </div>
    </Page>
  );
}

function Opened() {
  const { id } = useParams();
  return id ? <ContactDetail key={id} id={id} /> : null;
}

function Editing() {
  const { id } = useParams();
  return <ContactEditor key={id ?? "new"} id={id} />;
}

export default function ContactsPage() {
  // Held here, above the routes, so that what was typed is still there after a contact is opened and closed.
  const [filter, setFilter] = useState<ListFilter>({ q: "", tag: "", limit: LIST_STEP });
  const frame = (pane?: ReactNode) => <Frame pane={pane} filter={filter} setFilter={setFilter} />;
  return (
    <Routes>
      <Route index element={frame()} />
      <Route path="new" element={frame(<Editing />)} />
      <Route path="import" element={<ImportPage />} />
      <Route path="phones" element={<PhonesPage />} />
      <Route path="emergency" element={<EmergencySheetPage />} />
      <Route path=":id" element={frame(<Opened />)} />
      <Route path=":id/edit" element={frame(<Editing />)} />
      <Route path=":id/large" element={<LargeView />} />
    </Routes>
  );
}
