/**
 * One repeater: what to listen on and how to get in, where it is and how far, what its
 * list said about it and when, and the ways on from here (the map, a line-of-sight
 * check, changing or removing the entry).
 */
import {
  bandName,
  bearingDegrees,
  formatDecimal,
  formatMHz,
  formatShift,
  formatTone,
  haversineMeters,
  REPEATER_LICENCE_LINE,
  REPEATER_STATUS_LINE,
  REPEATER_STATUS_NAMES,
  type RepeaterFields,
  toMaidenhead,
} from "@outpost/shared";
import { ArrowLeft, CircleAlert, MapPin, Pencil, RadioTower, Trash2, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { formatBearing, formatDistance } from "@/features/maps/lib/geo";
import { formatDate } from "@/lib/utils";
import { useRemoveRepeater, useRepeater, useRevertRepeater, useSeparate } from "./data";
import { OriginPicker, useOrigin } from "./origin";
import { RepeaterFormDialog } from "./repeater-form";
import { ageWarning, isApproximate, modesLine, positionDigits, positionNote, sourceOf } from "./words";

function Facts({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border border-y border-border">{children}</dl>;
}

function Fact({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-body text-ink">
        {children}
        {note ? <span className="block text-small text-ink-muted">{note}</span> : null}
      </dd>
    </div>
  );
}

/** The parts of an entry the person changed, each beside what the list says. */
function differences(mine: RepeaterFields, listed: RepeaterFields): Array<{ label: string; mine: string; listed: string }> {
  const text = (value: unknown): string =>
    value === null || value === undefined || value === ""
      ? "nothing"
      : Array.isArray(value)
        ? value.join(", ") || "nothing"
        : String(value);
  const rows: Array<[string, unknown, unknown]> = [
    ["Callsign", mine.callsign, listed.callsign],
    ["Listen on", `${formatMHz(mine.outputHz)} MHz`, `${formatMHz(listed.outputHz)} MHz`],
    ["Shift", formatShift(mine.outputHz, mine.inputHz), formatShift(listed.outputHz, listed.inputHz)],
    ["CTCSS tone", mine.ctcssHz === null ? null : formatTone(mine.ctcssHz), listed.ctcssHz === null ? null : formatTone(listed.ctcssHz)],
    ["DCS code", mine.dcsCode, listed.dcsCode],
    ["Colour code", mine.dmrColourCode, listed.dmrColourCode],
    ["Talkgroups", mine.talkgroups, listed.talkgroups],
    ["Other access details", mine.accessNote, listed.accessNote],
    ["Modes", mine.modes, listed.modes],
    ["Town or site", mine.place, listed.place],
    [
      "Position",
      mine.lat === null ? null : formatDecimal(mine.lat, mine.lon ?? 0, 5),
      listed.lat === null ? null : formatDecimal(listed.lat, listed.lon ?? 0, 5),
    ],
    ["Locator", mine.locator, listed.locator],
    ["Keeper", mine.keeper, listed.keeper],
    ["Status", REPEATER_STATUS_NAMES[mine.status], REPEATER_STATUS_NAMES[listed.status]],
    ["Notes", mine.notes, listed.notes],
  ];
  return rows.filter(([, a, b]) => text(a) !== text(b)).map(([label, a, b]) => ({ label, mine: text(a), listed: text(b) }));
}

export default function RepeaterPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useRepeater(id);
  const origin = useOrigin();
  const revert = useRevertRepeater();
  const separate = useSeparate();
  const remove = useRemoveRepeater();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2.5 mb-4">
      <Link to="/radio/repeaters">
        <ArrowLeft /> Repeaters
      </Link>
    </Button>
  );

  if (detail.isPending) {
    return (
      <Page width="reading">
        {back}
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-48 w-full" />
          <span className="sr-only">Loading the repeater</span>
        </div>
      </Page>
    );
  }
  if (detail.isError) {
    return (
      <Page width="reading">
        {back}
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </Page>
    );
  }

  const { repeater, list, asListed, merged } = detail.data;
  const source = sourceOf(list);
  const warning = list ? ageWarning(list) : null;
  const placed = repeater.lat !== null && repeater.lon !== null;
  const position = placed ? { lat: repeater.lat!, lon: repeater.lon! } : null;
  const locator = repeater.locator || (position ? (toMaidenhead(position.lat, position.lon, 6) ?? "") : "");
  const from = origin.position;
  const distance = position && from ? haversineMeters(from.lat, from.lon, position.lat, position.lon) : null;
  const bearing = position && from ? bearingDegrees(from.lat, from.lon, position.lat, position.lon) : null;
  const changes = asListed ? differences(repeater, asListed) : [];
  const mapHref = `/maps?repeater=${repeater.id}`;
  const sightHref = `${mapHref}&sight=1${from ? `&from=${from.lat.toFixed(5)},${from.lon.toFixed(5)}` : ""}`;

  return (
    <Page width="reading">
      {back}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-title text-title text-ink">{repeater.callsign}</h1>
          <p className="mt-1 text-body text-ink-muted">
            {[repeater.place, repeater.region, repeater.country].filter(Boolean).join(", ") || "No place listed"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)}>
            <Pencil /> Change
          </Button>
          <Button variant="danger-ghost" onClick={() => setRemoving(true)}>
            <Trash2 /> Remove
          </Button>
        </div>
      </header>

      <p className="mb-4 text-small text-ink-muted">
        {list ? "From " : ""}
        <span className="text-ink">{source.text}</span>
        {list ? ` (the list “${list.name}”)` : ""}
        {repeater.edited ? ". Changed by you since." : "."}
      </p>
      {warning ? (
        <Notice tone="warning" icon={<CircleAlert />} className="mb-4">
          {warning}
        </Notice>
      ) : null}

      <Facts>
        <Fact label="Listen on" note="The repeater's output.">
          <span className="tabular font-mono">{formatMHz(repeater.outputHz)} MHz</span>
        </Fact>
        <Fact
          label="Transmit on"
          note={
            repeater.inputHz === null ? "The list gives no input or shift." : `Shift ${formatShift(repeater.outputHz, repeater.inputHz)}.`
          }
        >
          {repeater.inputHz === null ? "Not listed" : <span className="tabular font-mono">{formatMHz(repeater.inputHz)} MHz</span>}
        </Fact>
        <Fact label="Access">
          {repeater.ctcssHz === null &&
          repeater.dcsCode === null &&
          repeater.dmrColourCode === null &&
          !repeater.talkgroups &&
          !repeater.accessNote ? (
            "None listed"
          ) : (
            <ul className="tabular">
              {repeater.ctcssHz !== null ? <li>CTCSS tone {formatTone(repeater.ctcssHz)}</li> : null}
              {repeater.dcsCode !== null ? <li>DCS code {repeater.dcsCode}</li> : null}
              {repeater.dmrColourCode !== null ? <li>DMR colour code {repeater.dmrColourCode}</li> : null}
              {repeater.talkgroups ? <li>Talkgroups: {repeater.talkgroups}</li> : null}
              {repeater.accessNote ? <li>{repeater.accessNote}</li> : null}
            </ul>
          )}
        </Fact>
        <Fact label="Modes">{modesLine(repeater) || "Not listed"}</Fact>
        <Fact label="Band">
          {bandName(repeater.band)}
          {repeater.channel ? `, channel ${repeater.channel}` : ""}
        </Fact>
        <Fact
          label="Status"
          note={list ? `As the list said on ${formatDate(list.dataDate)}. Not what is on the air now.` : "As you entered it."}
        >
          {REPEATER_STATUS_NAMES[repeater.status].replace(/^Listed as/, list ? "Listed as" : "Entered as")}
          {repeater.statusText && repeater.statusText.toLowerCase() !== repeater.status ? (
            <span className="text-ink-muted"> (“{repeater.statusText.toLowerCase()}”)</span>
          ) : null}
        </Fact>
        {repeater.keeper ? <Fact label="Keeper">{repeater.keeper}</Fact> : null}
        <Fact
          label="Position"
          note={
            position
              ? positionNote(repeater)
              : "Without a position it is not on the map and has no distance. Change the entry to give it one."
          }
        >
          {position ? (
            <span className="tabular font-mono text-[0.9375rem]">
              {formatDecimal(position.lat, position.lon, positionDigits(repeater))}
              {locator ? ` · ${locator}` : ""}
            </span>
          ) : (
            "Not listed"
          )}
        </Fact>
        {repeater.antennaMeters !== null ? (
          <Fact label="Aerial" note="Worth typing into a line-of-sight check as the height at this end.">
            <span className="tabular">{repeater.antennaMeters} m above the ground, as listed</span>
          </Fact>
        ) : null}
        {repeater.notes ? (
          <Fact label="Notes">
            <span className="whitespace-pre-wrap">{repeater.notes}</span>
          </Fact>
        ) : null}
      </Facts>

      <section aria-label="From a place" className="mt-8 grid gap-3">
        <h2 className="text-lead font-semibold text-ink">From a place</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <OriginPicker origin={origin} label="Measure from" />
        </div>
        {position && from && distance !== null && bearing !== null ? (
          <p className="tabular text-body text-ink" aria-live="polite">
            {isApproximate(repeater) ? "About " : ""}
            <span className="font-semibold">{formatDistance(distance)}</span> from {origin.name}, on a bearing of{" "}
            <span className="font-semibold">{formatBearing(bearing)}</span>.
          </p>
        ) : position ? (
          <p className="text-small text-ink-muted">Choose a place to see how far the repeater is from it, and on what bearing.</p>
        ) : null}
        {position ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={mapHref}>
                <MapPin /> Show on the map
              </Link>
            </Button>
            <Button asChild>
              <Link to={sightHref}>
                <RadioTower /> Check line of sight
              </Link>
            </Button>
          </div>
        ) : null}
        {position ? (
          <p className="max-w-[65ch] text-small text-ink-muted">
            The check takes {from ? `${origin.name} and this repeater` : "this repeater as one end, and asks for the other on the map"}. It
            is geometry over installed terrain, not a forecast of signal
            {isApproximate(repeater) ? ", and here it starts from a position the list has blurred: read its answer as a rough guide" : ""}.
          </p>
        ) : null}
      </section>

      {changes.length > 0 ? (
        <section aria-label="Your changes" className="mt-8 grid gap-3">
          <h2 className="text-lead font-semibold text-ink">Your changes</h2>
          <p className="text-small text-ink-muted">
            Bringing the list up to date leaves this entry as you have it. This is where it differs from what the list says now.
          </p>
          <div className="scroll-quiet overflow-x-auto border-y border-border">
            <table className="w-full min-w-[26rem] text-small">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th scope="col" className="py-1.5 pr-4 font-medium">
                    What
                  </th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">
                    As you have it
                  </th>
                  <th scope="col" className="py-1.5 font-medium">
                    As listed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {changes.map((change) => (
                  <tr key={change.label} className="align-top">
                    <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-muted">
                      {change.label}
                    </th>
                    <td className="py-1.5 pr-4 text-ink">{change.mine}</td>
                    <td className="py-1.5 text-ink">{change.listed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Button
              onClick={() =>
                revert.mutate(repeater.id, { onSuccess: () => toast.success(`${repeater.callsign} is back to what its list says.`) })
              }
              loading={revert.isPending}
            >
              <Undo2 /> Put back to what the list says
            </Button>
          </div>
        </section>
      ) : null}

      {merged.length > 0 ? (
        <section aria-label="Merged entries" className="mt-8 grid gap-3">
          <h2 className="text-lead font-semibold text-ink">Held more than once</h2>
          <p className="max-w-[65ch] text-small text-ink-muted">
            {merged.length === 1 ? "One other entry is" : `${merged.length} other entries are`} the same repeater, and{" "}
            {merged.length === 1 ? "is" : "are"} set aside so that it is listed once. Anything you had typed on{" "}
            {merged.length === 1 ? "it" : "them"} was carried onto this entry.
          </p>
          <ul className="divide-y divide-border border-y border-border">
            {merged.map((entry) => (
              <li key={entry.id} className="tabular py-2 text-small text-ink">
                {entry.callsign}, {formatMHz(entry.outputHz)} MHz:{" "}
                <span className="text-ink-muted">
                  {entry.listName
                    ? `from “${entry.listName}”${entry.dataDate ? `, data of ${formatDate(entry.dataDate)}` : ""}`
                    : "entered by hand"}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <Button
              onClick={() =>
                separate.mutate(repeater.id, {
                  onSuccess: ({ separated }) =>
                    toast.success(`${separated === 1 ? "The other entry is" : `The ${separated} other entries are`} listed again.`),
                })
              }
              loading={separate.isPending}
            >
              <Undo2 /> Separate them
            </Button>
          </div>
        </section>
      ) : null}

      <p className="mt-8 max-w-[65ch] text-small text-ink-muted">
        {REPEATER_LICENCE_LINE} {REPEATER_STATUS_LINE}
      </p>

      <RepeaterFormDialog open={editing} onClose={() => setEditing(false)} repeater={repeater} list={list} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${repeater.callsign}?`}
        description={
          list
            ? `It is taken out of your repeaters, and stays out when “${list.name}” is brought up to date. It can be brought back from that list's menu.`
            : "You entered this one by hand, so removing it cannot be undone."
        }
        confirmLabel="Remove repeater"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(repeater.id, {
            onSuccess: () => {
              toast.success(`Removed ${repeater.callsign}.`);
              navigate("/radio/repeaters");
            },
          })
        }
      />
    </Page>
  );
}
