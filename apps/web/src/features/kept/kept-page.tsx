/**
 * "On this phone": what is kept in this browser for when the server is out of reach,
 * how much room it takes, and what this browser may do with it. The same screen is the
 * home of the app while the server is out of reach.
 */
import { formatBytes } from "@outpost/shared";
import { CircleAlert, CircleCheck, HeartPulse, ListChecks, Map as MapIcon, MapPin, NotebookText, Route, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Progress, Skeleton } from "@/components/ui/misc";
import { formatBboxSize, formatDistance } from "@/features/maps/lib/geo";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDateTime, formatNumber, plural } from "@/lib/utils";
import { continueArea, stopArea, useAreaWork } from "./area";
import { DEVICE, ON_THIS_DEVICE, runsInstalled } from "./device";
import { useOutbox } from "./outbox";
import { OutboxList } from "./outbox-list";
import { type KeptItem, keepingSupported, removeKept, useKept } from "./store";

const title = (item: KeptItem) => item.title.trim() || "Untitled";

function detailOf(item: KeptItem): string {
  if (item.kind === "note") {
    const inside = item.pages.length - 1;
    return [
      inside > 0 ? `With the ${plural(inside, "page")} inside it` : "One page",
      item.files > 0 ? plural(item.files, "picture or file", "pictures and files") : null,
      item.skipped > 0 ? `${plural(item.skipped, "file")} over 50 MB left out` : null,
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (item.kind === "track") return formatDistance(item.distanceMeters);
  if (item.kind === "places") return `${plural(item.count, "place")}, as a set`;
  if (item.kind === "medical")
    return `${plural(item.count, "sheet")}${item.locked > 0 ? `, ${item.locked} of them locked: they open here with their passphrase` : ""}`;
  if (item.kind === "plan")
    return `An emergency plan${item.household ? ` for ${item.household}` : ""}, ${plural(item.steps, "step")}, with its people's names and numbers${item.pending > 0 ? `; ${plural(item.pending, "tick")} made here waiting to be sent` : ""}`;
  return `${formatBboxSize(item.bbox)}, zoom 0 to ${item.maxZoom}, ${plural(item.tiles, "tile")}${item.terrainMaxZoom !== null ? ", with terrain" : ""}`;
}

const linkOf = (item: KeptItem): string =>
  item.kind === "note"
    ? `/notes/${item.id}`
    : item.kind === "track"
      ? `/maps?track=${item.id}`
      : item.kind === "plan"
        ? `/prepare/plans/${item.id}/use`
        : item.kind === "medical"
          ? "/prepare/medical"
          : "/maps";

const KINDS: Array<{ kind: KeptItem["kind"]; heading: string; icon: ReactNode }> = [
  { kind: "note", heading: "Pages", icon: <NotebookText aria-hidden strokeWidth={1.6} /> },
  { kind: "track", heading: "Routes", icon: <Route aria-hidden strokeWidth={1.6} /> },
  { kind: "places", heading: "Saved places", icon: <MapPin aria-hidden strokeWidth={1.6} /> },
  { kind: "area", heading: "Map areas", icon: <MapIcon aria-hidden strokeWidth={1.6} /> },
  { kind: "plan", heading: "Emergency plans", icon: <ListChecks aria-hidden strokeWidth={1.6} /> },
  { kind: "medical", heading: "Medical sheets", icon: <HeartPulse aria-hidden strokeWidth={1.6} /> },
];

function KeptRow({ item, outOfReach, onRemove }: { item: KeptItem; outOfReach: boolean; onRemove: () => void }) {
  const work = useAreaWork().find((entry) => entry.id === item.id);
  const unfinished = item.kind === "area" && !item.complete;
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={linkOf(item)}
            className="font-title text-body text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline"
          >
            {title(item)}
          </Link>
          <p className="tabular mt-0.5 text-small text-ink-muted">{detailOf(item)}</p>
          <p className="tabular text-small text-ink-muted">
            {formatBytes(item.bytes)}, copy from {formatDateTime(item.refreshedAt)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
            {item.gone ? (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> No longer on the server
              </Badge>
            ) : null}
            {item.kind === "area" && item.stale ? (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> The server's maps have changed since
              </Badge>
            ) : null}
            {item.kind === "area" && item.mixed && work?.state !== "running" ? (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> Fetching it again stopped part of the way: the area is whole, with some tiles newer than others
              </Badge>
            ) : null}
            {unfinished && work?.state !== "running" ? (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> Not finished: {formatNumber(item.done)} of {formatNumber(item.positions)} tiles looked at
              </Badge>
            ) : null}
          </div>
          {work?.state === "running" ? (
            <div className="mt-2 max-w-sm">
              <Progress tone="lamp" value={work.positions ? work.done / work.positions : null} label={`Keeping ${title(item)}`} />
              <p className="tabular mt-1 text-small text-ink-muted">
                {formatNumber(work.done)} of {formatNumber(work.positions)} tiles looked at, {formatBytes(work.bytes)} kept
              </p>
            </div>
          ) : null}
          {item.kind === "area" && !outOfReach ? (
            <div className="mt-1.5 flex flex-wrap gap-2 empty:hidden">
              {work?.state === "running" ? (
                <Button size="sm" onClick={() => stopArea(item.id)}>
                  Stop
                </Button>
              ) : unfinished ? (
                <Button size="sm" onClick={() => void continueArea(item.id).catch((error) => notify.error(errorMessage(error)))}>
                  Carry on
                </Button>
              ) : item.stale || item.mixed ? (
                <Button size="sm" onClick={() => void continueArea(item.id, true).catch((error) => notify.error(errorMessage(error)))}>
                  Fetch again
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" aria-label={`Remove ${title(item)} from this ${DEVICE}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

interface Room {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

async function readRoom(): Promise<Room> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;
  try {
    const estimate = await storage?.estimate?.();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    // The browser will not say.
  }
  try {
    persisted = (await storage?.persisted?.()) ?? null;
  } catch {
    // The browser will not say.
  }
  return { usage, quota, persisted };
}

/** What the browser reports about room, and the request that it should not clear this data to make room. */
function RoomSection({ keptBytes }: { keptBytes: number }) {
  const [room, setRoom] = useState<Room>();
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again whenever the amount kept changes
  useEffect(() => {
    let current = true;
    void readRoom().then((value) => current && setRoom(value));
    return () => {
      current = false;
    };
  }, [keptBytes]);

  const ask = async () => {
    setAsking(true);
    try {
      const granted = await navigator.storage.persist();
      setRefused(!granted);
      setRoom(await readRoom());
    } catch {
      setRefused(true);
    } finally {
      setAsking(false);
    }
  };

  return (
    <Section title="Room in this browser">
      {room === undefined ? (
        <Skeleton className="h-12" />
      ) : (
        <div className="grid gap-3">
          <p className="tabular max-w-[62ch] text-body text-ink">
            {keptBytes > 0 ? `What you have kept takes ${formatBytes(keptBytes)}. ` : null}
            {room.usage !== null && room.quota !== null
              ? `This browser reports about ${formatBytes(room.usage, 1)} in use by Outpost, the app itself included, out of about ${formatBytes(room.quota, 1)} it would allow.`
              : "This browser does not report how much room it allows."}
          </p>
          {room.usage !== null && room.quota !== null && room.quota > 0 ? (
            <Progress className="max-w-md" tone="primary" value={room.usage / room.quota} label="Room in use by Outpost in this browser" />
          ) : null}
          <p className="max-w-[62ch] text-small text-ink-muted">
            Browsers round these figures and base the limit on the size of the whole disk, so the limit is an upper bound, not room that is
            promised.
          </p>
          {room.persisted === true ? (
            <Notice tone="success" icon={<CircleCheck />}>
              This browser has agreed to keep Outpost's data: it will not clear it to make room for other sites.
            </Notice>
          ) : room.persisted === false ? (
            <div className="grid gap-2">
              <p className="max-w-[62ch] text-small text-ink">
                This browser may clear what is kept here when the {DEVICE} runs short of room. You can ask it not to.
                {refused
                  ? " It did not agree this time. Browsers decide this by themselves, and are more willing once Outpost is on the Home Screen or has been used for a while."
                  : ""}
              </p>
              <Button className="justify-self-start" loading={asking} onClick={() => void ask()}>
                Ask the browser to keep this data
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}

/** How to put Outpost on the Home Screen. The browser does it; Outpost can only say where the button is. */
function HomeScreen() {
  return (
    <Section title="On the Home Screen">
      <p className="max-w-[62ch] text-body text-ink">
        Outpost can be opened from the Home Screen like any app, without the browser's bars. On an iPhone or iPad it also matters for what
        is kept; see below.
      </p>
      <ul className="mt-2 grid max-w-[62ch] list-disc gap-1 pl-5 text-body text-ink marker:text-ink-faint">
        <li>iPhone and iPad, in Safari: the Share button, then “Add to Home Screen”.</li>
        <li>Android, in Chrome: the menu (three dots), then “Add to Home screen” or “Install app”.</li>
      </ul>
      <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
        Then open Outpost from its icon and keep things from there. What the icon opens has storage of its own on an iPhone or iPad: things
        kept in a Safari tab are not in it.
      </p>
    </Section>
  );
}

/** The limits that apply, said once where the person decides what to rely on. Sources and dates are in docs/offline.md. */
function GoodToKnow() {
  const installed = runsInstalled();
  return (
    <Section title="What to know before relying on it">
      <ul className="grid max-w-[66ch] list-disc gap-2 pl-5 text-body text-ink marker:text-ink-faint">
        <li>
          Kept copies are for reading. While the server is out of reach nothing can be changed, and a kept copy is never sent back to the
          server, so it cannot overwrite a page there. The one exception is ticking the steps of a kept emergency plan: the ticks are sent
          when the server is back, and added to the ones made elsewhere meanwhile (where both ticked a step, the earlier time is kept).
        </li>
        <li>
          Copies are brought up to date whenever this {DEVICE} has Outpost open within reach of the server. Open it once before you leave.
        </li>
        <li>
          {installed
            ? "Outpost is running from the Home Screen. On an iPhone or iPad that matters: what is kept here is not subject to Safari's seven-day rule."
            : "On an iPhone or iPad, Safari deletes everything a site has stored after seven days of using Safari without visiting that site, unless the site has been added to the Home Screen. Add Outpost to the Home Screen (Share, then Add to Home Screen) and keep things from there: the Home Screen app has storage of its own, separate from Safari's."}
        </li>
        <li>
          Any browser may clear a site's data when the device runs short of room, least recently used sites first. Asking the browser to
          keep the data, above, is how a site asks to be left out of that.
        </li>
        <li>
          Kept copies sit on this {DEVICE}, unencrypted beyond what the {DEVICE} itself does: anyone who can open this browser can read
          them. Removing a copy here deletes it from this {DEVICE} only.
        </li>
      </ul>
    </Section>
  );
}

/** What was written here while out of reach and has not been sent: there only when something is waiting, or out of reach. */
function WaitingSection({ outOfReach }: { outOfReach: boolean }) {
  const waiting = useOutbox();
  if (!outOfReach && (waiting?.length ?? 0) === 0) return null;
  return (
    <Section
      title="Written here, waiting to be sent"
      description={`Check-ins and new pages written on this ${DEVICE} while the server was out of reach. They are sent when it is back.`}
      actions={
        outOfReach ? (
          <Button asChild variant="primary" size="sm">
            <Link to="/kept/write">Write something</Link>
          </Button>
        ) : null
      }
    >
      <OutboxList canSend={!outOfReach} />
    </Section>
  );
}

export default function KeptPage({ outOfReach = false }: { outOfReach?: boolean }) {
  const kept = useKept();
  const supported = keepingSupported();
  const [removing, setRemoving] = useState<KeptItem>();
  const [last, setLast] = useState<KeptItem>();
  if (removing && removing !== last) setLast(removing);
  const [busy, setBusy] = useState(false);
  const total = (kept ?? []).reduce((sum, item) => sum + item.bytes, 0);

  return (
    <Page width="wide">
      <PageHeader
        title={ON_THIS_DEVICE}
        description={`Pages, routes, saved places, map areas, emergency plans and medical sheets kept in this browser, so they still open when this ${DEVICE} cannot reach the Outpost server.`}
      />

      {!supported ? (
        <Notice tone="info" icon={<CircleAlert />} title={`Nothing can be kept on this ${DEVICE} over plain HTTP`}>
          <p className="max-w-[66ch]">
            Browsers only let a site keep itself and its data for use without the server when the site is opened over HTTPS, or on the
            computer the server runs on. This address is neither, so Outpost works here only while the server is in reach.
          </p>
          <p className="mt-2">
            <Link to="/settings#https" className="font-medium underline underline-offset-2">
              Settings → HTTPS on your network
            </Link>{" "}
            says how to give Outpost an HTTPS address at home.
          </p>
        </Notice>
      ) : kept === undefined ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : kept.length === 0 ? (
        <EmptyState title={`Nothing is kept on this ${DEVICE} yet`}>
          {outOfReach ? (
            <p>Things are chosen while the server is in reach. When it is back, keep what you will need away from it.</p>
          ) : (
            <>
              <p>
                The app itself is kept automatically, so it opens anywhere. What it can show away from the server is what you choose to
                keep:
              </p>
              <ul className="mt-2 list-disc pl-5">
                <li>a page of notes, from its menu (the pages inside it come too);</li>
                <li>a route, from its panel on the map;</li>
                <li>your saved places, as a set, under their list;</li>
                <li>an area of the map, from “Offline maps” on the map;</li>
                <li>an emergency plan, at the foot of its “Use now”;</li>
                <li>the medical sheets, as a set, under their list (a locked sheet stays locked).</li>
              </ul>
            </>
          )}
        </EmptyState>
      ) : (
        KINDS.map(({ kind, heading, icon }) => {
          const items = kept.filter((item) => item.kind === kind);
          if (items.length === 0) return null;
          return (
            <Section
              key={kind}
              title={
                <span className="flex items-center gap-2 [&_svg]:size-[18px] [&_svg]:text-ink-muted">
                  {icon} {heading}
                </span>
              }
            >
              <Rows>
                {items.map((item) => (
                  <KeptRow key={item.id} item={item} outOfReach={outOfReach} onRemove={() => setRemoving(item)} />
                ))}
              </Rows>
            </Section>
          );
        })
      )}

      {supported ? <WaitingSection outOfReach={outOfReach} /> : null}
      {supported ? <RoomSection keptBytes={total} /> : null}
      {supported && DEVICE !== "computer" && !runsInstalled() ? <HomeScreen /> : null}
      <GoodToKnow />

      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={`Remove “${last ? title(last) : ""}” from this ${DEVICE}?`}
        description={
          last?.kind === "plan" && last.pending > 0
            ? `${plural(last.pending, "tick")} made here ${last.pending === 1 ? "has" : "have"} not been sent to the server yet, and will be lost. Nothing on the server is touched.`
            : last?.gone
              ? `It is no longer on the server, so this copy is the only one. Removing it cannot be undone.`
              : outOfReach
                ? `The server is out of reach, so it cannot be kept again until it is back. Nothing on the server is touched.`
                : `Only the copy in this browser is removed, freeing ${formatBytes(last?.bytes ?? 0)}. Nothing on the server is touched, and it can be kept again.`
        }
        confirmLabel={`Remove from this ${DEVICE}`}
        loading={busy}
        onConfirm={() => {
          if (!removing) return;
          setBusy(true);
          if (removing.kind === "area") stopArea(removing.id, true);
          removeKept(removing.kind, removing.id)
            .then(
              () => toast(`“${title(removing)}” is no longer kept on this ${DEVICE}.`),
              (error) => notify.error(errorMessage(error)),
            )
            .finally(() => {
              setBusy(false);
              setRemoving(undefined);
            });
        }}
      />
    </Page>
  );
}
