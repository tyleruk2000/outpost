/**
 * One contact, laid out for reaching them: every number can be called, texted or
 * copied in one touch, an address can be found on the offline map, and what links to
 * the map and to notes is a link.
 */
import {
  addressLines,
  type ContactAddress,
  type ContactDto,
  dialable,
  formatDecimal,
  type MapOverview,
  type PlaceSearchResponse,
} from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ALargeSmall,
  ArrowLeft,
  Copy,
  Download,
  Ellipsis,
  LifeBuoy,
  Mail,
  MapPin,
  MessageSquare,
  NotebookText,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Skeleton } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { copyText } from "../library/document-meta";
import { birthdayWords, exportHref, labelOr, mailHref, safeWebHref, useContact, useRemoveContact, useSaveContact } from "./contacts-data";

const action =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-control px-2.5 text-small font-medium text-primary transition-colors duration-150 hover:bg-primary-soft max-md:size-11 max-md:px-0 [&_svg]:size-[18px]";

async function copy(text: string, what: string) {
  if (await copyText(text)) toast.success(`Copied ${what}.`);
  else toast.error("This browser would not copy it. Select the text and copy it by hand.");
}

function CopyButton({ text, what }: { text: string; what: string }) {
  return (
    <button
      type="button"
      className={cn(action, "text-ink-muted hover:bg-surface-strong hover:text-ink")}
      onClick={() => void copy(text, what)}
      aria-label={`Copy ${what}`}
    >
      <Copy aria-hidden strokeWidth={1.8} />
      <span className="max-md:sr-only">Copy</span>
    </button>
  );
}

/** A titled group of rows. Left out altogether when it has nothing in it. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-1 text-small font-semibold text-ink-muted">{title}</h2>
      <div className="divide-y divide-border border-y border-border">{children}</div>
    </section>
  );
}

function Line({ label, children, actions }: { label?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        {label ? <p className="text-small text-ink-muted">{label}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
    </div>
  );
}

/** Looks an address's town up in the place names installed for the map. It finds the town, not the street. */
function FindOnMap({ address }: { address: ContactAddress }) {
  const [open, setOpen] = useState(false);
  const town = address.locality.trim() || address.postcode.trim() || address.region.trim();
  const overview = useQuery({ queryKey: ["maps", "overview"], queryFn: () => api.get<MapOverview>("/api/maps/overview"), enabled: open });
  const installed = (overview.data?.counts.places ?? 0) > 0;
  const places = useQuery({
    queryKey: ["maps", "places", "contact", town],
    queryFn: () => api.get<PlaceSearchResponse>("/api/maps/places", { q: town, limit: 5 }),
    enabled: open && installed && Boolean(town),
  });
  if (!town) return null;
  return (
    <div className="basis-full">
      {open ? (
        <div className="mb-1 rounded-panel bg-surface px-3 py-2.5 text-small" aria-live="polite">
          {overview.isPending || (installed && places.isPending) ? (
            <p className="text-ink-muted">Looking for {town}…</p>
          ) : overview.isError || places.isError ? (
            <p className="text-danger">{errorMessage(overview.error ?? places.error)}</p>
          ) : !installed ? (
            <p className="text-ink-muted">
              Place names are not installed, so an address cannot be looked up on the map.{" "}
              <Link to="/maps" className="text-primary underline underline-offset-2">
                Add them from Maps
              </Link>
              , or link this contact to a saved place.
            </p>
          ) : (places.data?.places.length ?? 0) === 0 ? (
            <p className="text-ink-muted">No place called “{town}” is among the place names installed.</p>
          ) : (
            <>
              <p className="text-ink-muted">Places called “{town}”. The map shows the town, not the street.</p>
              <ul className="mt-1.5 grid gap-0.5">
                {places.data!.places.map((place) => (
                  <li key={place.id}>
                    <Link
                      to={`/maps?lat=${place.lat.toFixed(5)}&lon=${place.lon.toFixed(5)}&z=13`}
                      className="flex min-h-9 items-center gap-2 rounded-control text-primary underline-offset-2 hover:underline max-md:min-h-11"
                    >
                      <MapPin aria-hidden className="size-4 shrink-0" />
                      <span>
                        {place.name}
                        <span className="text-ink-muted"> {[place.kindLabel, place.admin1, place.country].filter(Boolean).join(", ")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
      <button
        type="button"
        className={cn(action, "-ml-2.5 max-md:size-auto max-md:h-11 max-md:px-2.5")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MapPin aria-hidden strokeWidth={1.8} />
        {open ? "Hide the map results" : "Find on the map"}
      </button>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-40" />
      <div className="mt-8 grid gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

export function BackToList() {
  return (
    <Link to="/contacts" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-small text-primary lg:hidden">
      <ArrowLeft aria-hidden className="size-4" /> Contacts
    </Link>
  );
}

function Details({ contact }: { contact: ContactDto }) {
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(false);
  const save = useSaveContact(contact.id);
  const remove = useRemoveContact();
  const under = [
    contact.kind === "person" ? [contact.title, contact.organisation].filter(Boolean).join(", ") : contact.department,
    contact.nickname ? `Known as ${contact.nickname}` : "",
  ].filter(Boolean);

  const mark = (isEmergency: boolean) =>
    save.mutate(
      { isEmergency, baseUpdatedAt: contact.updatedAt },
      {
        onSuccess: () =>
          toast.success(isEmergency ? "Marked for an emergency. It is now on the emergency sheet." : "No longer marked for an emergency."),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  // Opened from the list (or with the list hidden, on a phone), the focus comes to the
  // name, so that Tab goes on to this contact's actions rather than through the rest of
  // the list. Focus anywhere else, such as a field being typed in, is left where it is.
  const heading = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each contact opened
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body || active.closest("[data-contact-list]")) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [contact.id]);

  return (
    <article aria-labelledby="contact-name">
      <BackToList />
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1
            ref={heading}
            id="contact-name"
            tabIndex={-1}
            className="font-title text-title text-ink [overflow-wrap:anywhere] focus:outline-none"
          >
            {contact.displayName}
          </h1>
          {under.map((line) => (
            <p key={line} className="mt-1 text-body text-ink-muted">
              {line}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to={`/contacts/${contact.id}/large`}>
              <ALargeSmall /> Large type
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/contacts/${contact.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`More to do with ${contact.displayName}`}>
                <Ellipsis />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => mark(!contact.isEmergency)}>
                <LifeBuoy /> {contact.isEmergency ? "Take off the emergency list" : "Mark for an emergency"}
              </MenuItem>
              <MenuItem asChild>
                <a href={exportHref({ ids: [contact.id] })} download>
                  <Download /> Save as a vCard file
                </a>
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={() => setRemoving(true)}>
                <Trash2 /> Delete contact
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      {contact.isEmergency ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-panel bg-primary-soft px-3.5 py-2.5 text-body text-primary-soft-ink">
          <LifeBuoy aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} />
          <span>
            <span className="font-semibold">In an emergency.</span> {contact.emergencyNote || "On the emergency sheet."}
          </span>
        </p>
      ) : null}

      {contact.phones.length > 0 ? (
        <Group title="Phone">
          {contact.phones.map((phone, index) => {
            const number = dialable(phone.value);
            return (
              <Line
                // biome-ignore lint/suspicious/noArrayIndexKey: a contact may hold the same number twice
                key={index}
                label={labelOr(phone.label, "phone")}
                actions={
                  <>
                    {number ? (
                      <>
                        <a href={`tel:${number}`} className={action} aria-label={`Call ${phone.value}`}>
                          <Phone aria-hidden strokeWidth={1.8} />
                          <span className="max-md:sr-only">Call</span>
                        </a>
                        <a href={`sms:${number}`} className={action} aria-label={`Text ${phone.value}`}>
                          <MessageSquare aria-hidden strokeWidth={1.8} />
                          <span className="max-md:sr-only">Text</span>
                        </a>
                      </>
                    ) : null}
                    <CopyButton text={phone.value} what={phone.value} />
                  </>
                }
              >
                <p className="tabular text-lead text-ink [overflow-wrap:anywhere]">{phone.value}</p>
              </Line>
            );
          })}
        </Group>
      ) : null}

      {contact.emails.length > 0 ? (
        <Group title="Email">
          {contact.emails.map((email, index) => {
            const href = mailHref(email.value);
            return (
              <Line
                // biome-ignore lint/suspicious/noArrayIndexKey: as above
                key={index}
                label={labelOr(email.label, "email")}
                actions={
                  <>
                    {href ? (
                      <a href={href} className={action} aria-label={`Email ${email.value}`}>
                        <Mail aria-hidden strokeWidth={1.8} />
                        <span className="max-md:sr-only">Email</span>
                      </a>
                    ) : null}
                    <CopyButton text={email.value} what={email.value} />
                  </>
                }
              >
                <p className="text-body text-ink [overflow-wrap:anywhere]">{email.value}</p>
              </Line>
            );
          })}
        </Group>
      ) : null}

      {contact.callsign || contact.channels.length > 0 ? (
        <Group title="Radio">
          {contact.callsign ? (
            <Line label="callsign" actions={<CopyButton text={contact.callsign} what={contact.callsign} />}>
              <p className="font-mono text-lead text-ink">{contact.callsign}</p>
            </Line>
          ) : null}
          {contact.channels.map((channel, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: frequencies have no identity of their own
            <Line key={index} label={index === 0 ? "frequencies to try, in order" : undefined}>
              <p className="text-body text-ink">
                <span className="tabular font-medium">{channel.frequency}</span>
                {channel.mode ? <span className="text-ink-muted"> {channel.mode}</span> : null}
              </p>
            </Line>
          ))}
        </Group>
      ) : null}

      {contact.addresses.length > 0 || contact.place ? (
        <Group title="Where">
          {contact.place ? (
            <Line label="saved place on the map">
              <Link
                to={`/maps?marker=${contact.place.id}`}
                className="inline-flex min-h-9 items-center gap-2 text-body text-primary underline-offset-2 hover:underline max-md:min-h-11"
              >
                <MapPin aria-hidden className="size-4 shrink-0" />
                {contact.place.name}
              </Link>
              <p className="font-mono text-small text-ink-muted">{formatDecimal(contact.place.lat, contact.place.lon)}</p>
            </Line>
          ) : null}
          {contact.addresses.map((address, index) => {
            const lines = addressLines(address);
            return (
              <Line
                // biome-ignore lint/suspicious/noArrayIndexKey: as above
                key={index}
                label={labelOr(address.label, "address")}
                actions={<CopyButton text={lines.join("\n")} what="the address" />}
              >
                <address className="text-body text-ink not-italic">
                  {lines.map((line, at) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines of one address, in order
                    <span key={at} className="block">
                      {line}
                    </span>
                  ))}
                </address>
                <FindOnMap address={address} />
              </Line>
            );
          })}
        </Group>
      ) : null}

      {contact.pages.length > 0 ? (
        <Group title="Notes">
          {contact.pages.map((page) => (
            <Line key={page.id}>
              <Link
                to={`/notes/${page.id}`}
                className="inline-flex min-h-9 items-center gap-2 text-body text-primary underline-offset-2 hover:underline max-md:min-h-11"
              >
                {page.icon ? <span aria-hidden>{page.icon}</span> : <NotebookText aria-hidden className="size-4 shrink-0" />}
                {page.title}
              </Link>
            </Line>
          ))}
        </Group>
      ) : null}

      {contact.related.length > 0 || contact.birthday || contact.links.length > 0 ? (
        <Group title="More">
          {contact.related.map((related, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above
            <Line key={index} label={labelOr(related.label, "related")}>
              <p className="text-body text-ink">{related.name}</p>
            </Line>
          ))}
          {contact.birthday ? (
            <Line label="birthday">
              <p className="text-body text-ink">{birthdayWords(contact.birthday)}</p>
            </Line>
          ) : null}
          {contact.links.map((link, index) => {
            const href = safeWebHref(link.value);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: as above
              <Line key={index} label={labelOr(link.label, "link")} actions={<CopyButton text={link.value} what="the link" />}>
                {href ? (
                  // A web address leaves Outpost and may need the internet; it opens apart from the app, and tells the site nothing.
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-body text-primary underline underline-offset-2 [overflow-wrap:anywhere]"
                  >
                    {link.value}
                  </a>
                ) : (
                  <p className="text-body text-ink [overflow-wrap:anywhere]">{link.value}</p>
                )}
              </Line>
            );
          })}
        </Group>
      ) : null}

      {contact.note ? (
        <section className="mt-7">
          <h2 className="mb-1 text-small font-semibold text-ink-muted">Note</h2>
          <p className="max-w-[70ch] border-t border-border pt-2.5 text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
            {contact.note}
          </p>
        </section>
      ) : null}

      {contact.tags.length > 0 ? (
        <ul aria-label="Tags" className="mt-6 flex flex-wrap gap-1.5">
          {contact.tags.map((tag) => (
            <li key={tag}>
              <Badge>{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {contact.otherFields.length > 0 ? (
        <details className="mt-7 text-small text-ink-muted">
          <summary className="min-h-9 cursor-pointer py-1.5 text-ink-muted hover:text-ink max-md:min-h-11">
            {contact.otherFields.length === 1 ? "1 more field" : `${contact.otherFields.length} more fields`} came with this contact
          </summary>
          <ul className="mt-1 grid gap-1">
            {contact.otherFields.map((field) => (
              <li key={field} className="[overflow-wrap:anywhere]">
                {field}
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-[60ch]">
            Outpost has no place to show or change these. They are kept, and go out again when the contact is exported.
          </p>
        </details>
      ) : null}

      <p className="mt-8 text-small text-ink-muted">
        {contact.source === "file" ? "Brought in from a file. " : contact.source === "picker" ? "Picked from a phone. " : ""}
        Last changed {timeAgo(contact.updatedAt)}.
      </p>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Delete ${contact.displayName}?`}
        description="The contact is removed from Outpost for good, with its links to the map and to notes. Nothing on any phone is changed. A phone that keeps a copy of these contacts drops this one the next time it looks."
        confirmLabel="Delete contact"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(contact.id, {
            onSuccess: () => {
              toast.success(`Deleted ${contact.displayName}.`);
              void navigate("/contacts");
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </article>
  );
}

export function ContactDetail({ id }: { id: string }) {
  const contact = useContact(id);
  if (contact.isPending) return <DetailSkeleton />;
  if (contact.isError) {
    if (contact.error instanceof ApiError && contact.error.status === 404) {
      return (
        <div>
          <BackToList />
          <h1 className="font-title text-heading text-ink">This contact is no longer here</h1>
          <p className="mt-2 text-ink-muted">It may have been deleted from another device. The list has everyone who is here now.</p>
        </div>
      );
    }
    return <ErrorState error={contact.error} onRetry={() => contact.refetch()} />;
  }
  return <Details contact={contact.data} />;
}
