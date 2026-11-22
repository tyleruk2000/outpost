/**
 * Radio → Heard on the radio: the receivers and whether each is connected, everything they
 * heard (APRS stations, aircraft, ships) with its distance and bearing from Home, the age
 * of its last report and which receiver heard it; clearing what is kept; and how to set
 * up each end on a Raspberry Pi, a Mac or Windows.
 */
import { formatBytes, type HeardSourceId, type HeardStation, RECEIVER_KINDS, type ReceiverKind } from "@outpost/shared";
import { CircleAlert, MapPin, Pin, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { HomeAsOf, NoHome, useHome } from "@/features/households/home";
import { useSettings, useUpdateSettings } from "@/lib/queries";
import { cn, formatNumber, plural, timeAgo } from "@/lib/utils";
import { useClear, useReceivers, useRemoveStation, useStations } from "./data";
import { AircraftGuide, AprsGuide, BoardsGuide, ShipsGuide } from "./guides";
import { ListenOnly } from "./licence";
import { PowerCut } from "./power-cut";
import { RangeView } from "./range-view";
import {
  displayName,
  fromHome,
  type Home,
  KIND_NAMES,
  lastPacketWords,
  metersFromHome,
  pathWords,
  sourceName,
  stateWords,
  UNTRIED,
} from "./words";

const link = "text-primary underline underline-offset-2";

function Receivers() {
  const receivers = useReceivers();
  if (receivers.isPending)
    return (
      <div className="grid gap-2" aria-busy>
        <Skeleton className="h-5" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  if (receivers.isError) return <ErrorState error={receivers.error} onRetry={() => void receivers.refetch()} />;
  const list = receivers.data.receivers;
  if (list.length === 0)
    return (
      <EmptyState
        compact
        level={3}
        title="No receiver yet"
        action={
          <Button asChild variant="primary">
            <Link to="/settings#receivers">Add a receiver</Link>
          </Button>
        }
      >
        Outpost connects to nothing until a receiver is added: the address and port of a decoder on the network. The guides below say how to
        start one.
      </EmptyState>
    );
  return (
    <>
      <Rows aria-label="Receivers">
        {list.map((receiver) => {
          const trouble = receiver.status.state === "away";
          return (
            <li key={receiver.id} className="py-3">
              <p className="text-small font-medium text-ink">
                {receiver.name} <span className="font-normal text-ink-muted">· {KIND_NAMES[receiver.kind]}</span>
              </p>
              <p role="status" className={cn("flex items-baseline gap-1.5 text-small", trouble ? "text-warning" : "text-ink")}>
                {trouble ? <CircleAlert aria-hidden className="size-4 shrink-0 translate-y-0.5" /> : null}
                <span className="min-w-0 [overflow-wrap:anywhere]">{stateWords(receiver)}</span>
              </p>
              <p className="text-small text-ink-muted">{lastPacketWords(receiver)}</p>
            </li>
          );
        })}
      </Rows>
      <p className="mt-2 text-small">
        <Link to="/settings#receivers" className={link}>
          Change the receivers in Settings
        </Link>
      </p>
    </>
  );
}

function StationRow({ station, home, receiverName }: { station: HeardStation; home: Home | null; receiverName: string | null }) {
  const [removing, setRemoving] = useState(false);
  const remove = useRemoveStation();
  const name = displayName(station);
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-small font-medium text-ink">
          {station.pinned ? <Pin aria-label="Pinned, one of ours" className="size-3.5 shrink-0 text-primary" /> : null}
          <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
          {name !== station.name ? <span className="font-normal text-ink-muted">({station.name})</span> : null}
        </p>
        <p className="text-small text-ink">
          <Joined
            parts={[
              station.kindWords,
              fromHome(home, station) ?? (station.lat === null ? "no position" : null),
              `heard ${timeAgo(station.lastAt)}`,
            ].filter(Boolean)}
          />
        </p>
        <p className="text-small text-ink-muted">
          <Joined
            parts={[receiverName ? `by ${receiverName}` : null, pathWords(station), plural(station.reports, "position")].filter(Boolean)}
          />
        </p>
      </div>
      <div className="flex gap-1">
        {station.lat !== null ? (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/maps?heard=${encodeURIComponent(station.id)}`} aria-label={`Show ${name} on the map`}>
              <MapPin aria-hidden /> Map
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(true)} aria-label={`Remove ${name}`}>
          <Trash2 aria-hidden />
        </Button>
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${name}?`}
        description="Its last report and its whole trail are removed. If it is heard again, it comes back as new."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(station.id, { onSuccess: () => setRemoving(false) })}
      />
    </li>
  );
}

type Order = "recent" | "near";

function StationList({ source, home }: { source: ReceiverKind; home: Home | null }) {
  const stations = useStations(source);
  const receivers = useReceivers();
  const [filter, setFilter] = useState("");
  const [order, setOrder] = useState<Order>("recent");
  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase();
    const list = (stations.data ?? []).filter(
      (station) =>
        !words || `${station.name} ${station.pinName ?? ""} ${station.key} ${station.kindWords ?? ""}`.toLowerCase().includes(words),
    );
    if (order === "near" && home)
      return [...list].sort(
        (a, b) => (metersFromHome(home, a) ?? Number.POSITIVE_INFINITY) - (metersFromHome(home, b) ?? Number.POSITIVE_INFINITY),
      );
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastAt - a.lastAt);
  }, [stations.data, filter, order, home]);
  if (stations.isPending)
    return (
      <div className="grid gap-2" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  if (stations.isError) return <ErrorState error={stations.error} onRetry={() => void stations.refetch()} />;
  if (stations.data.length === 0)
    return (
      <EmptyState compact level={3} title={`No ${sourceName(source).toLowerCase()} heard yet`}>
        What a {KIND_NAMES[source]} receiver hears is listed here and put on the map, and kept until you clear it.
      </EmptyState>
    );
  const names = new Map((receivers.data?.receivers ?? []).map((receiver) => [receiver.id, receiver.name]));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Find" className="min-w-0 flex-1">
          {(ids) => (
            <Input {...ids} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Callsign, name or type" />
          )}
        </Field>
        <Field label="Order">
          {(ids) => (
            <Select
              {...ids}
              value={order}
              onChange={setOrder}
              options={[
                { value: "recent", label: "Last heard first" },
                { value: "near", label: "Nearest home first", disabled: !home },
              ]}
              className="w-56 max-w-full"
            />
          )}
        </Field>
      </div>
      {shown.length === 0 ? (
        <p className="text-small text-ink-muted">
          Nothing matches "{filter}".{" "}
          <Button variant="link" onClick={() => setFilter("")}>
            Clear the search
          </Button>
        </p>
      ) : (
        <Rows aria-label={`${sourceName(source)} heard`}>
          {shown.slice(0, 300).map((station) => (
            <StationRow
              key={station.id}
              station={station}
              home={home}
              receiverName={station.receiverId ? (names.get(station.receiverId) ?? null) : null}
            />
          ))}
        </Rows>
      )}
      {shown.length > 300 ? (
        <p className="text-small text-ink-muted">The 300 most recent of {formatNumber(shown.length)} are listed; all are on the map.</p>
      ) : null}
    </div>
  );
}

function ClearDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const clear = useClear();
  const [what, setWhat] = useState<"all" | HeardSourceId>("all");
  const [older, setOlder] = useState("");
  const before = older ? new Date(`${older}T00:00:00`).getTime() : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Clear what was heard" description="Stations, aircraft and ships, with their trails. Receivers are kept.">
        <DialogBody className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="text-small font-medium text-ink">What</legend>
            {(["all", ...RECEIVER_KINDS, "mesh"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-small text-ink">
                <input type="radio" name="clear-what" className="accent-primary" checked={what === value} onChange={() => setWhat(value)} />
                {value === "all"
                  ? "Everything heard"
                  : value === "mesh"
                    ? "Mesh radio positions kept for the range view"
                    : `${sourceName(value)} only`}
              </label>
            ))}
          </fieldset>
          <Field label="Only what was last heard before" optional hint="Leave empty to clear it all.">
            {(ids) => <Input {...ids} type="date" value={older} onChange={(event) => setOlder(event.target.value)} className="w-48" />}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={clear.isPending}
            onClick={() =>
              clear.mutate(
                { ...(what === "all" ? {} : { source: what }), ...(before !== undefined ? { before } : {}) },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Clear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const HOURS = ["0", "6", "24", "72", "168"] as const;

function Keeping() {
  const receivers = useReceivers();
  const settings = useSettings();
  const update = useUpdateSettings();
  const [clearing, setClearing] = useState(false);
  const space = receivers.data?.space;
  const hours = String(settings.data?.["heard.aircraftHours"] ?? 0);
  return (
    <div className="grid gap-3">
      <p className="text-small text-ink">
        {space
          ? `${plural(space.stations, "station")} and ${plural(space.reports, "position")} are kept${space.bytes !== null ? `, taking ${formatBytes(space.bytes)} of the database` : ""}. All of it is kept until you clear it.`
          : "Counting what is kept…"}
      </p>
      <Field label="Aircraft" hint="Aircraft are many. Keep only the last so many hours of them; pinned ones are always kept.">
        {(ids) => (
          <Select
            {...ids}
            value={HOURS.includes(hours as (typeof HOURS)[number]) ? (hours as (typeof HOURS)[number]) : "0"}
            disabled={!settings.data || update.isPending}
            onChange={(next) => update.mutate({ "heard.aircraftHours": Number(next) })}
            options={HOURS.map((value) => ({
              value,
              label: value === "0" ? "Keep until cleared" : `The last ${plural(Number(value), "hour")}`,
            }))}
            className="w-60 max-w-full"
          />
        )}
      </Field>
      <div>
        <Button variant="danger-ghost" onClick={() => setClearing(true)}>
          <Trash2 aria-hidden /> Clear what was heard
        </Button>
      </div>
      <ClearDialog open={clearing} onOpenChange={setClearing} />
    </div>
  );
}

export default function HeardPage() {
  // Distances are from the current household's home: its saved place, or where it was last said to be.
  const current = useHome();
  const found = current.home;
  const home = useMemo(() => (found ? { lat: found.lat, lon: found.lon, name: found.name } : null), [found]);
  const receivers = useReceivers();
  const counts = receivers.data?.space.bySource;
  return (
    <Page width="reading">
      <PageHeader
        title="Heard on the radio"
        description="APRS stations, aircraft and ships that your own receivers heard, from a decoder on the network. Nothing comes from the internet."
      />
      <div className="grid gap-3">
        <ListenOnly />
        <Notice tone="info">{UNTRIED}</Notice>
        {!current.isPending && !current.isError && !home ? <NoHome /> : null}
        <HomeAsOf home={found} />
      </div>

      <Section title="Receivers">
        <Receivers />
      </Section>

      <Section
        title="What was heard"
        description={
          <>
            Also on the{" "}
            <Link to="/maps" className={link}>
              map
            </Link>
            , in the Layers tab under Heard on the radio.
          </>
        }
      >
        <Tabs defaultValue="aprs">
          <TabsList aria-label="Which source">
            {RECEIVER_KINDS.map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {sourceName(kind)}
                {counts ? <span className="ml-1.5 text-ink-muted tabular">{counts[kind].stations}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {RECEIVER_KINDS.map((kind) => (
            <TabsContent key={kind} value={kind} className="mt-3">
              <ListenOnly source={kind} />
              <div className="mt-3">
                <StationList source={kind} home={home} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Section>

      <Section title="Range heard" description="How far a receiver hears, from the APRS and mesh positions it heard.">
        <RangeView home={home} />
      </Section>

      <Section title="Keeping what was heard">
        <Keeping />
      </Section>

      <Section title="Setting up" description="Both ends: the decoder, wherever the radio or SDR is plugged in, and Outpost.">
        <Tabs defaultValue="aprs">
          <TabsList aria-label="Which guide">
            <TabsTrigger value="aprs">APRS</TabsTrigger>
            <TabsTrigger value="aircraft">Aircraft</TabsTrigger>
            <TabsTrigger value="ships">Ships</TabsTrigger>
            <TabsTrigger value="boards">Boards on the Wi-Fi</TabsTrigger>
          </TabsList>
          <TabsContent value="aprs" className="mt-3">
            <AprsGuide />
          </TabsContent>
          <TabsContent value="aircraft" className="mt-3">
            <AircraftGuide />
          </TabsContent>
          <TabsContent value="ships" className="mt-3">
            <ShipsGuide />
          </TabsContent>
          <TabsContent value="boards" className="mt-3">
            <BoardsGuide />
          </TabsContent>
        </Tabs>
        <div className="mt-4">
          <PowerCut />
        </div>
      </Section>
    </Page>
  );
}
