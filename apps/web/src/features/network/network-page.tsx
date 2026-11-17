/**
 * Devices on this network: what answers on the networks the computer running Outpost
 * is itself on. The server decides what is looked at, from the computer's own
 * interfaces; this screen says exactly what that is and what a scan sends before
 * anything is sent.
 *
 * Device names can be people's names. The list is shown here and nowhere else: not in
 * search, not exported except by "Copy the list" or "Save as CSV".
 */
import { formatBytes, type JobDto, NETWORK_TEXT_LIMITS, type NetworkDevice, type NetworkStatus } from "@outpost/shared";
import { Copy, Download, ExternalLink, Pencil, Radar, Square, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Progress, Skeleton } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { formatDate, plural } from "@/lib/utils";
import {
  useFetchMakers,
  useForgetAll,
  useForgetDevice,
  useNetwork,
  useNetworkJobs,
  useRemoveMakers,
  useStartScan,
  useStopJob,
  useUpdateDevice,
} from "./network-data";
import { deviceTitle, listText, MAKERS_BYTES_SEEN, makerWords, missingWords, scanWords, seenWords, servicesWords } from "./network-text";

export default function NetworkPage() {
  const network = useNetwork();
  const jobs = useNetworkJobs(network.data);
  const start = useStartScan();

  const status = network.data;
  const scanning = jobs.scan;
  // With nothing listed yet, the empty state holds the one button.
  const canScan = status && mayScan(status) && status.devices.length > 0;
  const action = scanning ? null : canScan ? (
    <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending}>
      <Radar /> {status.lastScan ? "Look again" : "Look for devices"}
    </Button>
  ) : null;

  return (
    <Page width="reading">
      <PageHeader
        title="Devices on this network"
        description="What answers on the network the computer running Outpost is on: a NAS, a printer, a radio’s network interface, a Raspberry Pi whose address you have forgotten."
        actions={action}
      />
      {network.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : network.isError ? (
        <ErrorState error={network.error} onRetry={() => network.refetch()} />
      ) : (
        <Loaded
          status={network.data}
          scanning={scanning}
          makersJob={jobs.makers}
          onScan={() => start.mutate()}
          starting={start.isPending}
        />
      )}
    </Page>
  );
}

function Loaded({
  status,
  scanning,
  makersJob,
  onScan,
  starting,
}: {
  status: NetworkStatus;
  scanning: JobDto | null;
  makersJob: JobDto | null;
  onScan: () => void;
  starting: boolean;
}) {
  const canScan = mayScan(status);
  return (
    <>
      <Unavailable status={status} />
      {scanning ? <ScanProgress job={scanning} /> : null}
      {status.devices.length === 0 ? (
        scanning ? null : canScan ? (
          <EmptyState
            title="Nothing listed yet"
            action={
              <Button variant="primary" onClick={onScan} loading={starting}>
                <Radar /> Look for devices
              </Button>
            }
          >
            Outpost asks each address on this computer’s own network once, slowly, and lists what answers. What it sends is set out below.
          </EmptyState>
        ) : null
      ) : (
        <DeviceList status={status} />
      )}
      <WhatItDoes status={status} />
      <Makers status={status} job={makersJob} />
    </>
  );
}

/** Whether a scan can be offered here: the computer can look, and this device may ask it to. */
function mayScan(status: NetworkStatus): boolean {
  return !status.unavailable && status.subnets.length > 0 && status.scanRight.allowed;
}

function Unavailable({ status }: { status: NetworkStatus }) {
  if (status.unavailable === "container")
    return (
      <Notice tone="warning" title="Outpost is running in a container" className="mb-6">
        A container sees only its own small network, which Docker made for it, not your home’s. A scan from here would find nothing of
        yours, so none is offered. To see your home network, run Outpost with host networking (on Linux, <code>network_mode: host</code> in{" "}
        <code>compose.yaml</code>, and <code>OUTPOST_HOST_NETWORK=true</code> to say so), or run it directly on the computer. Docker Desktop
        on a Mac or Windows does not give a container the home network this way.
      </Notice>
    );
  if (status.unavailable === "portable")
    return (
      <Notice tone="info" title="Not from a portable drive" className="mb-6">
        Running from a portable drive, Outpost is a guest on this computer, and does not look round the network it is on.
      </Notice>
    );
  if (status.unavailable === "platform")
    return (
      <Notice tone="info" title="Not on this kind of computer" className="mb-6">
        Looking for devices works where Outpost runs on macOS or Linux (a Raspberry Pi included).
      </Notice>
    );
  if (status.subnets.length > 0 && !status.scanRight.allowed)
    return (
      <Notice tone="info" title="Started on the computer Outpost runs on" className="mb-6">
        Whoever set up Outpost has said that only the computer it runs on may look for devices. Open Outpost there to start a scan; what it
        found is listed here for every device.
      </Notice>
    );
  if (status.subnets.length === 0)
    return (
      <Notice tone="info" title="No private network to look at" className="mb-6">
        This computer is not on a private network that Outpost can look at just now. The networks it is on, and why each is left out, are
        listed below.
      </Notice>
    );
  return null;
}

function ScanProgress({ job }: { job: JobDto }) {
  const stop = useStopJob();
  const { current, total, message } = job.progress;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 border-y border-border py-3" aria-live="polite">
      <div className="min-w-48 flex-1">
        <p className="text-small text-ink">{job.state === "queued" ? "Starting" : (message ?? "Looking")}</p>
        <Progress className="mt-2" tone="lamp" value={total ? current / total : null} label="How far the scan has got" />
      </div>
      <Button onClick={() => stop.mutate(job.id)} loading={stop.isPending}>
        <Square /> Stop
      </Button>
    </div>
  );
}

function DeviceList({ status }: { status: NetworkStatus }) {
  const [forgetAll, setForgetAll] = useState(false);
  const forget = useForgetAll();
  const { devices, lastScan } = status;
  const fresh = devices.filter((device) => device.isNew).length;
  const gone = devices.filter((device) => device.isGone).length;

  const copy = async () => {
    const ok = await copyText(listText(devices, status.makers.present));
    if (ok) toast.success(`Copied ${plural(devices.length, "device")}`);
    else notify.error("This browser would not copy the list");
  };

  return (
    <Section
      title={plural(devices.length, "device")}
      description={
        <>
          {lastScan ? scanWords(lastScan) : null}
          {fresh > 0 || gone > 0 ? ` In this list: ${plural(fresh, "new one")}, ${plural(gone, "one")} not seen last time.` : null}
        </>
      }
    >
      <Rows>
        {devices.map((device) => (
          <DeviceRow key={device.id} device={device} makersPresent={status.makers.present} />
        ))}
      </Rows>
      <p className="mt-3 text-small text-ink-muted">
        Names here can be people’s names (“Anna’s iPhone”). This list is shown on this screen only: it is not in search, it leaves Outpost
        only when you copy it or save it as CSV, and “Erase everything” removes it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={copy}>
          <Copy /> Copy the list
        </Button>
        <Button asChild>
          <a href="/api/network/devices.csv" download>
            <Download /> Save as CSV
          </a>
        </Button>
        <Button variant="danger-ghost" onClick={() => setForgetAll(true)}>
          <Trash2 /> Forget all devices
        </Button>
      </div>
      <ConfirmDialog
        open={forgetAll}
        onOpenChange={setForgetAll}
        title={`Forget ${plural(devices.length, "device")}?`}
        description="The list, the names and notes you gave, and the record of past scans are removed. The next scan starts afresh, with nothing marked new."
        confirmLabel="Forget all devices"
        confirmVariant="danger"
        loading={forget.isPending}
        onConfirm={() => forget.mutate(undefined, { onSuccess: () => setForgetAll(false) })}
      />
    </Section>
  );
}

function DeviceRow({ device, makersPresent }: { device: NetworkDevice; makersPresent: boolean }) {
  const [editing, setEditing] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const forget = useForgetDevice();
  const maker = makerWords(device, makersPresent);
  const services = servicesWords(device);
  const title = deviceTitle(device);
  return (
    <li className="py-3.5" data-testid="network-device">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="min-w-0 break-words text-lead text-ink">{title}</h3>
        {device.isSelf ? <Badge tone="primary">This computer</Badge> : null}
        {device.isRouter ? <Badge tone="primary">Your router</Badge> : null}
        {device.isNew ? <Badge tone="success">New since last time</Badge> : null}
        {device.isGone ? <Badge>Not seen in the last scan</Badge> : null}
      </div>
      {device.label && device.name ? <p className="text-small text-ink-muted">Calls itself {device.name}</p> : null}
      <p className="mt-0.5 break-all font-mono text-small text-ink">{device.addresses.join("  ")}</p>
      <dl className="mt-1 grid gap-0.5 text-small text-ink-muted">
        {device.mac ? (
          <div>
            <dt className="inline">Hardware address </dt>
            <dd className="inline font-mono">{device.mac}</dd>
            {maker ? <dd className="inline">{` · ${maker}`}</dd> : null}
          </div>
        ) : null}
        {services ? (
          <div>
            <dt className="inline">Announces </dt>
            <dd className="inline">{services}</dd>
          </div>
        ) : null}
        <div>
          <dd>{seenWords(device)}</dd>
        </div>
        {device.note ? (
          <div>
            <dt className="sr-only">Note</dt>
            <dd className="whitespace-pre-line text-ink">{device.note}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-2 flex flex-wrap gap-2">
        {device.webUrl ? (
          <Button asChild size="sm" variant="soft">
            {/* Opened by this browser, not fetched by Outpost. */}
            <a href={device.webUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open its web page
            </a>
          </Button>
        ) : null}
        <Button size="sm" onClick={() => setEditing(true)} aria-label={`Name and note for ${title}`}>
          <Pencil /> Name and note
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setForgetting(true)} aria-label={`Forget ${title}`}>
          <Trash2 /> Forget
        </Button>
      </div>
      {editing ? <EditDevice device={device} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={forgetting}
        onOpenChange={setForgetting}
        title={`Forget ${title}?`}
        description="It goes from the list with any name and note you gave it. If it answers the next scan, it is listed again, as new."
        confirmLabel="Forget"
        confirmVariant="danger"
        loading={forget.isPending}
        onConfirm={() => forget.mutate(device.id, { onSuccess: () => setForgetting(false) })}
      />
    </li>
  );
}

function EditDevice({ device, onClose }: { device: NetworkDevice; onClose: () => void }) {
  const [label, setLabel] = useState(device.label);
  const [note, setNote] = useState(device.note);
  const update = useUpdateDevice();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ id: device.id, patch: { label, note } }, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title="Name and note"
        description={`For ${device.name || device.addresses[0]}. Kept in Outpost’s database, and in its backups.`}
      >
        <form onSubmit={submit}>
          <DialogBody className="grid gap-4">
            <Field label="Your name for it" hint={device.name ? `It calls itself ${device.name}.` : undefined}>
              {(ids) => (
                <Input {...ids} value={label} maxLength={NETWORK_TEXT_LIMITS.label} onChange={(event) => setLabel(event.target.value)} />
              )}
            </Field>
            <Field label="Note">
              {(ids) => (
                <Textarea
                  {...ids}
                  rows={3}
                  value={note}
                  maxLength={NETWORK_TEXT_LIMITS.note}
                  onChange={(event) => setNote(event.target.value)}
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending}>
              Keep
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WhatItDoes({ status }: { status: NetworkStatus }) {
  const { limits, abilities } = status;
  const missing = missingWords(abilities, status.os);
  return (
    <Section title="What a scan does">
      <div className="grid max-w-[65ch] gap-3 text-small text-ink">
        <p>
          It looks only at the networks this computer is itself on, read from the computer when you press, and only at private ones. Nothing
          you type or choose here can widen it.
        </p>
        {status.subnets.length > 0 ? (
          <ul className="grid gap-1.5">
            {status.subnets.map((subnet) => (
              <li key={`${subnet.interface}-${subnet.cidr}`}>
                <span className="font-mono">{subnet.swept ?? subnet.cidr}</span> on {subnet.interface}
                {subnet.plan === "listen" ? ": not swept (IPv6). " : `: ${plural(subnet.addresses, "address", "addresses")} asked. `}
                {subnet.reason ? <span className="text-ink-muted">{subnet.reason}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {status.skipped.length > 0 ? (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-primary md:min-h-0">
              {plural(status.skipped.length, "address", "addresses")} of this computer’s not looked at
            </summary>
            <ul className="mt-1 grid gap-1 text-ink-muted">
              {status.skipped.map((entry) => (
                <li key={`${entry.interface}-${entry.address}`}>
                  <span className="font-mono">{entry.address}</span> on {entry.interface}: {entry.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <ol className="grid list-decimal gap-1.5 pl-5">
          <li>
            Each address is sent one ping. One that does not answer is sent a connection attempt on port 80, then on port 443, closed the
            moment it opens. Nothing is sent over it.
          </li>
          <li>
            At most {limits.packetsPerSecond} of these a second, {limits.concurrent} at a time, each waiting {limits.timeoutMs / 1000}{" "}
            second for an answer. One scan at a time; it can be stopped.
          </li>
          <li>
            The computer’s own list of neighbours (ARP and NDP) is read: a device that ignores every probe still answers the computer’s “who
            has this address?”.
          </li>
          <li>
            What devices already announce (Bonjour, mDNS) is read from the computer’s own listener, and names are asked of its resolver.
          </li>
        </ol>
        <p className="text-ink-muted">
          No other port is tried, no service is asked anything, nothing is logged in to, nothing is checked for weaknesses and no traffic is
          recorded. A link to a device’s web page is opened by your browser; Outpost does not fetch it. Anyone who can open Outpost can
          start a scan; any device on this network could do the same itself.
        </p>
        {missing.length > 0 ? (
          <Notice tone="info" title="Not available on this computer">
            <ul className="grid gap-1">
              {missing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </div>
    </Section>
  );
}

function Makers({ status, job }: { status: NetworkStatus; job: JobDto | null }) {
  const fetchMakers = useFetchMakers();
  const remove = useRemoveMakers();
  const { makers } = status;
  const host = (() => {
    try {
      return new URL(makers.url).host;
    } catch {
      return makers.url;
    }
  })();
  return (
    <Section title="Who made each device">
      <div className="grid max-w-[65ch] gap-3 text-small text-ink">
        <p>
          The first half of a hardware address says who made the device, by the IEEE’s public registry of prefixes. The registry is not part
          of Outpost (its terms do not say it may be passed on), so makers are shown only once it has been fetched from the IEEE. Phones and
          many computers now make up their hardware address on each network for privacy; for those no maker can be known.
        </p>
        {job ? (
          <div aria-live="polite">
            <p>Fetching the registry from {host}</p>
            <Progress
              className="mt-2"
              tone="lamp"
              value={job.progress.total ? job.progress.current / job.progress.total : null}
              label="How much of the registry has arrived"
            />
          </div>
        ) : makers.present ? (
          <>
            <p>
              Fetched {makers.fetchedAt ? formatDate(makers.fetchedAt) : ""}: {makers.entries.toLocaleString("en-GB")} prefixes,{" "}
              {formatBytes(makers.bytes ?? 0)}, kept on the computer running Outpost.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fetchMakers.mutate()} loading={fetchMakers.isPending}>
                <Download /> Fetch it again
              </Button>
              <Button variant="ghost" onClick={() => remove.mutate()} loading={remove.isPending}>
                <Trash2 /> Remove it
              </Button>
            </div>
          </>
        ) : (
          <div>
            <Button onClick={() => fetchMakers.mutate()} loading={fetchMakers.isPending}>
              <Download /> Fetch the registry from the IEEE
            </Button>
            <p className="mt-1.5 text-ink-muted">
              About {formatBytes(MAKERS_BYTES_SEEN)}, from {host}. This needs an internet connection, and is the only thing on this screen
              that does.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
