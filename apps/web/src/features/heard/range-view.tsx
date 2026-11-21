/**
 * The range view's controls and answer (outpost-ywbh.8): one receiver, one station (your
 * own radio) or all, and a time span, so that a walk on one afternoon is one test. A test
 * can be kept by name, and two compared (before and after moving the aerial). The outline
 * is drawn on the map from "Show on the map".
 */
import type { RangeTest } from "@outpost/shared";
import { MapPin, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { formatBearing, formatDistance } from "@/features/maps/lib/geo";
import { formatDateTime, plural } from "@/lib/utils";
import { type ReportsQuery, useRangeTests, useReceivers, useRemoveRangeTest, useReports, useSaveRangeTest, useStations } from "./data";
import { computeRange, type RangeResult } from "./range";
import type { Home } from "./words";

const DAY = 86_400_000;
const toLocal = (ms: number) => {
  const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};
const fromLocal = (text: string) => (text ? new Date(text).getTime() : Number.NaN);

export interface RangeChoice {
  receiverId: string;
  stationId: string | null;
  from: number;
  to: number;
}

export const rangeLink = (choice: RangeChoice, compare?: RangeChoice | null) => {
  const params = new URLSearchParams({ range: JSON.stringify(choice) });
  if (compare) params.set("compare", JSON.stringify(compare));
  return `/maps?${params}`;
};

export const queryOf = (choice: RangeChoice): ReportsQuery => ({
  receiverId: choice.receiverId,
  ...(choice.stationId ? { stationId: choice.stationId } : {}),
  from: choice.from,
  to: choice.to,
});

/** What the outline says in words: the furthest report, and what was kept apart. */
export function RangeSummary({ result, limited }: { result: RangeResult; limited: boolean }) {
  const viaCount = [...result.via.values()].reduce((sum, list) => sum + list.length, 0);
  return (
    <div className="grid gap-1 text-small text-ink">
      {result.furthest ? (
        <p>
          <span className="font-medium">Furthest heard directly:</span> {result.furthest.name}, {formatDistance(result.furthest.meters)}{" "}
          {formatBearing(result.furthest.bearing)} from home, {formatDateTime(result.furthest.at)}
          {result.furthest.rssi !== null ? `, signal ${result.furthest.rssi} dBm` : ""}
          {result.furthest.snr !== null ? `, SNR ${result.furthest.snr} dB` : ""}.
        </p>
      ) : (
        <p>No position heard directly in this span.</p>
      )}
      <p className="text-ink-muted">
        {plural(result.direct.length, "position")} heard directly, in {plural(result.sectorsHeard, "direction")} of 36
        {result.outline.length > 0 ? ", joined into the outline" : "; three or more are needed for an outline"}.
      </p>
      {viaCount > 0 ? (
        <p className="text-ink-muted">
          Kept apart, drawn hollow:{" "}
          {[...result.via.entries()]
            .map(
              ([via, list]) =>
                `${plural(list.length, "position")} ${via ? `through ${via}` : "through other radios or an unnamed digipeater"}`,
            )
            .join("; ")}
          .
        </p>
      ) : null}
      {result.unknownHops > 0 ? (
        <p className="text-ink-muted">
          {plural(result.unknownHops, "mesh position")} did not say how many radios it came through; hops through other radios cannot always
          be told apart, so these may not have been heard directly.
        </p>
      ) : null}
      {limited ? <p className="text-warning">Only the newest 20,000 positions are used: choose a shorter span.</p> : null}
      <p className="text-ink-muted">
        This is where this receiver heard these radios at these times, not a promise of coverage. Set it beside the estimated range from
        terrain: on the map, press and hold Home and choose "Estimated radio range from here".
      </p>
    </div>
  );
}

function TestRow({ test, home, receivers, onUse }: { test: RangeTest; home: Home; receivers: Map<string, string>; onUse: () => void }) {
  const remove = useRemoveRangeTest();
  const choice = { receiverId: test.receiverId ?? "", stationId: test.stationId, from: test.from, to: test.to };
  const reports = useReports(queryOf(choice), Boolean(test.receiverId));
  const result = reports.data ? computeRange(reports.data.reports, home) : null;
  return (
    <li className="flex flex-wrap items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1 text-small">
        <p className="font-medium text-ink">{test.name}</p>
        <p className="text-ink-muted">
          {receivers.get(test.receiverId ?? "") ?? "A receiver since removed"} · {formatDateTime(test.from)} to {formatDateTime(test.to)}
        </p>
        <p className="text-ink">
          {result?.furthest
            ? `Furthest ${formatDistance(result.furthest.meters)} ${formatBearing(result.furthest.bearing)}, ${plural(result.sectorsHeard, "direction")} heard`
            : reports.isPending
              ? "Working it out…"
              : "Nothing heard directly."}
        </p>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onUse}>
          Use
        </Button>
        <Button size="sm" variant="danger-ghost" aria-label={`Remove the test ${test.name}`} onClick={() => remove.mutate(test.id)}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function RangeView({ home }: { home: Home | null }) {
  const receivers = useReceivers();
  const mesh = useStations("mesh");
  const aprs = useStations("aprs");
  const tests = useRangeTests();
  const save = useSaveRangeTest();
  const choices = useMemo(() => {
    const list = (receivers.data?.receivers ?? [])
      .filter((receiver) => receiver.kind === "aprs")
      .map((receiver) => ({ value: receiver.id, label: receiver.name }));
    if ((mesh.data?.length ?? 0) > 0) list.push({ value: "mesh", label: "The mesh radio link" });
    return list;
  }, [receivers.data, mesh.data]);
  const [receiverId, setReceiverId] = useState<string | undefined>(undefined);
  const [stationId, setStationId] = useState<string>("all");
  const [from, setFrom] = useState(() => toLocal(Date.now() - DAY));
  const [to, setTo] = useState(() => toLocal(Date.now()));
  const [name, setName] = useState("");
  const [compare, setCompare] = useState<string>("none");
  const receiver = receiverId ?? choices[0]?.value;
  const stations = receiver === "mesh" ? (mesh.data ?? []) : (aprs.data ?? []).filter((station) => station.receiverId === receiver);
  const choice: RangeChoice | null =
    receiver && Number.isFinite(fromLocal(from)) && Number.isFinite(fromLocal(to))
      ? { receiverId: receiver, stationId: stationId === "all" ? null : stationId, from: fromLocal(from), to: fromLocal(to) }
      : null;
  const reports = useReports(choice ? queryOf(choice) : {}, Boolean(choice && home));
  const result = useMemo(() => (reports.data && home ? computeRange(reports.data.reports, home) : null), [reports.data, home]);
  const names = new Map(choices.map((entry) => [entry.value, entry.label]));
  const other = tests.data?.find((test) => test.id === compare);
  const otherChoice = other?.receiverId
    ? { receiverId: other.receiverId, stationId: other.stationId, from: other.from, to: other.to }
    : null;

  if (!home)
    return <p className="text-small text-ink-muted">The range view is measured from home. Mark a saved place as home on the map first.</p>;
  if (receivers.isPending) return <Skeleton className="h-24" />;
  if (choices.length === 0)
    return (
      <p className="text-small text-ink-muted">
        Once an APRS receiver or the mesh radio link has heard positions, the range view works from them.
      </p>
    );
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Receiver">
          {(ids) => (
            <Select
              {...ids}
              value={receiver}
              onChange={(value) => {
                setReceiverId(value);
                setStationId("all");
              }}
              options={choices}
              className="w-full"
            />
          )}
        </Field>
        <Field label="Station">
          {(ids) => (
            <Select
              {...ids}
              value={stationId}
              onChange={setStationId}
              options={[
                { value: "all", label: "Every station heard" },
                ...stations.map((station) => ({ value: station.id, label: station.pinName ?? station.name })),
              ]}
              className="w-full"
            />
          )}
        </Field>
        <Field label="From">
          {(ids) => <Input {...ids} type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />}
        </Field>
        <Field label="To">
          {(ids) => <Input {...ids} type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />}
        </Field>
      </div>
      {reports.isPending && choice ? (
        <Skeleton className="h-16" />
      ) : result ? (
        <RangeSummary result={result} limited={reports.data?.limited ?? false} />
      ) : null}
      {choice ? (
        <div className="flex flex-wrap items-end gap-3">
          <Button asChild variant="primary">
            <Link to={rangeLink(choice, otherChoice)}>
              <MapPin aria-hidden /> Show on the map
            </Link>
          </Button>
          {(tests.data?.length ?? 0) > 0 ? (
            <Field label="Compare with">
              {(ids) => (
                <Select
                  {...ids}
                  value={compare}
                  onChange={setCompare}
                  options={[
                    { value: "none", label: "Nothing" },
                    ...(tests.data ?? []).map((test) => ({ value: test.id, label: test.name })),
                  ]}
                  className="w-56 max-w-full"
                />
              )}
            </Field>
          ) : null}
        </div>
      ) : null}
      {choice ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(
              { name: name.trim(), receiverId: choice.receiverId, stationId: choice.stationId, from: choice.from, to: choice.to },
              { onSuccess: () => setName("") },
            );
          }}
        >
          <Field label="Keep this test as" className="min-w-0 flex-1">
            {(ids) => (
              <Input
                {...ids}
                value={name}
                maxLength={60}
                placeholder="Saturday walk, old aerial"
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={!name.trim()} loading={save.isPending}>
            Keep test
          </Button>
        </form>
      ) : null}
      {(tests.data?.length ?? 0) > 0 ? (
        <div>
          <h3 className="text-body font-semibold text-ink">Kept tests</h3>
          <Rows aria-label="Kept range tests" className="mt-1">
            {(tests.data ?? []).map((test) => (
              <TestRow
                key={test.id}
                test={test}
                home={home}
                receivers={names}
                onUse={() => {
                  if (test.receiverId) setReceiverId(test.receiverId);
                  setStationId(test.stationId ?? "all");
                  setFrom(toLocal(test.from));
                  setTo(toLocal(test.to));
                }}
              />
            ))}
          </Rows>
        </div>
      ) : null}
    </div>
  );
}
