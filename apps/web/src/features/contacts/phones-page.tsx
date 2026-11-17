/**
 * Keeping a copy of the contacts on a phone: turning the address book for phones on,
 * and what to type on the phone. The page says which way contacts travel before it says
 * anything else, because that is the thing a person has to know before trusting it.
 */
import type { HttpsStatus } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice, Page, PageHeader, Section } from "@/components/page";
import { Badge, Skeleton, Switch } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { useSettings, useUpdateSettings } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { usePhoneStatus } from "./contacts-data";
import { SubscribeSteps } from "./phone-steps";

interface Address {
  url: string;
  secure: boolean;
}

/** The addresses a phone could be given: the https ones Outpost answers at, then the one this page was opened at. */
export function addressesFor(https: HttpsStatus | undefined, origin: string, path: string): Address[] {
  const found: Address[] = [];
  for (const address of https?.listening ? https.addresses : []) {
    if (address.kind !== "this-computer") found.push({ url: `${address.url}${path}`, secure: true });
  }
  let here: URL | undefined;
  try {
    here = new URL(origin);
  } catch {
    here = undefined;
  }
  const local = !here || ["localhost", "127.0.0.1", "[::1]"].includes(here.hostname);
  if (here && !local) {
    const url = `${here.origin}${path}`;
    if (!found.some((address) => address.url === url)) found.push({ url, secure: here.protocol === "https:" });
  }
  return found;
}

export default function PhonesPage() {
  const status = usePhoneStatus();
  const settings = useSettings();
  const update = useUpdateSettings();
  const https = useQuery({ queryKey: ["https"], queryFn: () => api.get<HttpsStatus>("/api/https") });
  const data = status.data;
  const on = Boolean(settings.data?.["contacts.carddav"]) && data?.unavailable === null;
  const addresses = data ? addressesFor(https.data, window.location.origin, data.path) : [];
  const best = addresses[0];

  return (
    <Page width="reading">
      <Link to="/contacts" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-small text-primary">
        <ArrowLeft aria-hidden className="size-4" /> Contacts
      </Link>
      <PageHeader
        title="Keep a copy on a phone"
        description="A phone or computer can subscribe to these contacts and keep its own copy up to date. The copy is still on the phone when Outpost cannot be reached."
      />

      {status.isPending || settings.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-24" />
          <Skeleton className="h-14" />
        </div>
      ) : status.isError || !data ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      ) : (
        <>
          <Section title="Which way it goes">
            <div className="max-w-[65ch] space-y-2 text-body text-ink">
              <p>
                <span className="font-semibold">From Outpost to the phone, and never back.</span> The phone can read these contacts and
                cannot change them. Whatever is added, changed or deleted on the phone in this address book is refused by Outpost and does
                not reach it.
              </p>
              <p className="text-ink-muted">
                The phone holds Outpost’s contacts as an account of its own, beside the contacts it already has, and those are not touched.
                Removing the account from the phone removes the copy and nothing else. To bring contacts from a phone into Outpost,{" "}
                <Link to="/contacts/import" className="text-primary underline underline-offset-2">
                  use a file
                </Link>
                , where you see what would change first.
              </p>
            </div>
          </Section>

          <Section title="Turn it on">
            {data.unavailable === "portable" ? (
              <Notice tone="info">
                Outpost is running from a portable drive, which only this computer can open, so there is no phone to subscribe.
              </Notice>
            ) : (
              <>
                <label
                  htmlFor="contacts-phones-switch"
                  className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-y border-border py-2"
                >
                  <span className="min-w-0">
                    <span className="block text-body font-medium text-ink">Let phones on your network subscribe to these contacts</span>
                    <span className="block text-small text-ink-muted">
                      {on
                        ? `On. ${plural(data.contacts, "contact")} can be read by any device that can open this Outpost, with no password.`
                        : "Off. Outpost does not answer contacts apps at all."}
                    </span>
                  </span>
                  <Switch
                    id="contacts-phones-switch"
                    checked={on}
                    disabled={update.isPending}
                    onCheckedChange={(next) => update.mutate({ "contacts.carddav": next })}
                    aria-label="Let phones on your network subscribe to these contacts"
                  />
                </label>
                {!data.lanAccess ? (
                  <p className="mt-2 max-w-[65ch] text-small text-ink-muted">
                    Outpost is open only on this computer at the moment, so no phone can reach it. Sharing it on the network is a start-up
                    setting (OUTPOST_LAN_ACCESS).
                  </p>
                ) : null}
              </>
            )}
          </Section>

          {on ? (
            <>
              <Section title="What to give the phone">
                <dl className="divide-y divide-border border-y border-border">
                  <div className="py-2.5">
                    <dt className="text-small text-ink-muted">Server address</dt>
                    <dd className="mt-1 grid gap-1.5">
                      {addresses.length === 0 ? (
                        <p className="max-w-[65ch] text-small text-ink">
                          This page was opened on the computer Outpost runs on, at an address a phone cannot use. Open Outpost on the phone
                          and come back to this page, or turn on{" "}
                          <Link to="/settings#https" className="text-primary underline underline-offset-2">
                            HTTPS on your network
                          </Link>
                          , which lists the addresses.
                        </p>
                      ) : (
                        addresses.map((address) => (
                          <div key={address.url} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="min-w-0 font-mono text-[0.8125rem] break-all text-ink">{address.url}</span>
                            <Badge tone={address.secure ? "success" : "neutral"}>{address.secure ? "Encrypted" : "Not encrypted"}</Badge>
                            <button
                              type="button"
                              aria-label={`Copy ${address.url}`}
                              onClick={() =>
                                void copyText(address.url).then((copied) =>
                                  copied
                                    ? toast.success("Copied the address.")
                                    : notify.error("This browser would not copy it. Select the text and copy it by hand."),
                                )
                              }
                              className="inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-small text-ink-muted hover:bg-surface-strong hover:text-ink max-md:h-11"
                            >
                              <Copy aria-hidden className="size-4" /> Copy
                            </button>
                          </div>
                        ))
                      )}
                    </dd>
                  </div>
                  <div className="py-2.5">
                    <dt className="text-small text-ink-muted">User name</dt>
                    <dd className="mt-0.5 font-mono text-body text-ink">{data.userName}</dd>
                  </div>
                  <div className="py-2.5">
                    <dt className="text-small text-ink-muted">Password</dt>
                    <dd className="mt-0.5 max-w-[65ch] text-small text-ink">
                      There is none. Outpost has no accounts, and these contacts can already be read in a browser by the same devices. Where
                      a phone will not go on without a password, type <span className="font-mono">{data.userName}</span>. Never type one you
                      use anywhere else: Outpost ignores it, and a phone may send it across your network unprotected.
                    </dd>
                  </div>
                </dl>
                {addresses.length > 0 && !addresses.some((address) => address.secure) ? (
                  <p className="mt-3 max-w-[65ch] text-small text-ink-muted">
                    An iPhone or a Mac will not use an address that starts with http. Turn on{" "}
                    <Link to="/settings#https" className="text-primary underline underline-offset-2">
                      HTTPS on your network
                    </Link>{" "}
                    for an address they will use. Over http the contacts cross your network unencrypted, as they do when Outpost is opened
                    at that address.
                  </p>
                ) : null}
              </Section>

              <Section title="On the phone" description="The steps in Apple’s help pages and the DAVx⁵ manual as of November 2026.">
                <SubscribeSteps address={best?.url ?? `https://your-outpost:8443${data.path}`} userName={data.userName} />
                <p className="mt-4 max-w-[65ch] text-small text-ink-muted">
                  This has been tested with CardDAV software on a computer, and not yet on an iPhone, an Android phone or a Mac. If a device
                  will not connect, a vCard file from the Contacts menu always works.
                </p>
              </Section>
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}
