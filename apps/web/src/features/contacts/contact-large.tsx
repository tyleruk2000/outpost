/**
 * One contact in type large enough to read at arm's length, in poor light, or by
 * someone who has put their glasses down: the name, the numbers, and the words for an
 * emergency. Every number is still a touch away from a call.
 */
import { addressLines, dialable } from "@outpost/shared";
import { X } from "lucide-react";
import { Link, useParams } from "react-router";
import { ErrorState, Page } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { labelOr, useContact } from "./contacts-data";

export default function LargeView() {
  const { id } = useParams();
  const contact = useContact(id);
  const data = contact.data;
  return (
    <Page width="wide">
      <div className="flex justify-end">
        <Link
          to={`/contacts/${id}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-body font-medium text-primary hover:bg-primary-soft"
        >
          <X aria-hidden className="size-5" /> Close large type
        </Link>
      </div>
      {contact.isPending ? (
        <div aria-busy className="mt-6 grid gap-6">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : contact.isError || !data ? (
        <div className="mt-6">
          <ErrorState error={contact.error} onRetry={() => contact.refetch()} />
        </div>
      ) : (
        <article className="mt-4" aria-labelledby="large-name">
          <h1 id="large-name" className="font-title text-[clamp(2.25rem,7vw,4rem)] leading-[1.1] text-ink [overflow-wrap:anywhere]">
            {data.displayName}
          </h1>
          {data.isEmergency && data.emergencyNote ? (
            <p className="mt-4 text-[clamp(1.25rem,3.4vw,1.75rem)] leading-snug text-ink">{data.emergencyNote}</p>
          ) : null}

          <ul className="mt-8 divide-y divide-border border-y border-border">
            {data.phones.map((phone, index) => {
              const number = dialable(phone.value);
              const digits = (
                <span className="tabular block text-[clamp(2rem,8.5vw,4.5rem)] leading-[1.15] font-semibold text-ink [overflow-wrap:anywhere]">
                  {phone.value}
                </span>
              );
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: a contact may hold the same number twice
                <li key={index} className="py-5">
                  <p className="text-[clamp(1.125rem,3vw,1.5rem)] text-ink-muted">{labelOr(phone.label, "phone")}</p>
                  {number ? (
                    <a
                      href={`tel:${number}`}
                      aria-label={`Call ${phone.value}`}
                      className="mt-1 block rounded-control underline-offset-[0.15em] hover:underline"
                    >
                      {digits}
                    </a>
                  ) : (
                    digits
                  )}
                </li>
              );
            })}
            {data.callsign || data.channels.length > 0 ? (
              <li className="py-5">
                <p className="text-[clamp(1.125rem,3vw,1.5rem)] text-ink-muted">radio</p>
                {data.callsign ? (
                  <p className="mt-1 font-mono text-[clamp(1.75rem,7vw,3.5rem)] leading-tight font-semibold text-ink">{data.callsign}</p>
                ) : null}
                {data.channels.map((channel, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: frequencies have no identity of their own
                  <p key={index} className="mt-2 text-[clamp(1.5rem,5vw,2.5rem)] leading-tight text-ink">
                    <span className="tabular font-semibold">{channel.frequency}</span>
                    {channel.mode ? <span className="text-ink-muted"> {channel.mode}</span> : null}
                  </p>
                ))}
              </li>
            ) : null}
            {data.addresses.map((address, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: as above
              <li key={index} className="py-5">
                <p className="text-[clamp(1.125rem,3vw,1.5rem)] text-ink-muted">{labelOr(address.label, "address")}</p>
                <address className="mt-1 text-[clamp(1.5rem,5vw,2.5rem)] leading-tight text-ink not-italic">
                  {addressLines(address).map((line, at) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines of one address, in order
                    <span key={at} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </li>
            ))}
          </ul>
          {data.phones.length === 0 && data.addresses.length === 0 && !data.callsign && data.channels.length === 0 ? (
            <p className="mt-6 text-lead text-ink-muted">This contact has no number, address or callsign to show.</p>
          ) : null}
        </article>
      )}
    </Page>
  );
}
