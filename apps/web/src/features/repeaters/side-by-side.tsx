/**
 * Entries that are, or may be, the same repeater, set beside one another: one column
 * each, and a row for every part in which they differ. What they agree on is said once
 * above the table, so that the eye goes to the differences.
 */
import {
  formatDecimal,
  formatMHz,
  formatShift,
  formatTone,
  modeName,
  REPEATER_STATUS_NAMES,
  type RepeaterDuplicateSide,
} from "@outpost/shared";
import { ScrollBox } from "@/features/radio/scroll-box";
import { cn } from "@/lib/utils";
import { sideLabel } from "./words";

const NOTHING = "nothing";

/** A label as it reads in the middle of a sentence: "Town or site" loses its capital, "CTCSS tone" does not. */
const inSentence = (label: string) => (/^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1));

const text = (value: unknown): string =>
  value === null || value === undefined || value === "" ? NOTHING : Array.isArray(value) ? value.join(", ") || NOTHING : String(value);

/** Each part of an entry as it is shown, in the order a person reads a repeater. */
function parts(entry: RepeaterDuplicateSide): Array<[string, string]> {
  return [
    ["Callsign", text(entry.callsign)],
    ["Listen on", `${formatMHz(entry.outputHz)} MHz`],
    ["Shift", formatShift(entry.outputHz, entry.inputHz)],
    ["CTCSS tone", text(entry.ctcssHz === null ? null : formatTone(entry.ctcssHz))],
    ["DCS code", text(entry.dcsCode)],
    ["Colour code", text(entry.dmrColourCode)],
    ["Talkgroups", text(entry.talkgroups)],
    ["Other access", text(entry.accessNote)],
    ["Modes", text(entry.modes.map(modeName))],
    ["Channel", text(entry.channel)],
    ["Town or site", text(entry.place)],
    ["Region", text([entry.region, entry.country].filter(Boolean).join(", "))],
    ["Position", text(entry.lat === null ? null : formatDecimal(entry.lat, entry.lon ?? 0, 5))],
    ["Locator", text(entry.locator)],
    ["Keeper", text(entry.keeper)],
    ["Status", REPEATER_STATUS_NAMES[entry.status]],
    ["Notes", text(entry.notes)],
  ];
}

export function SideBySide({
  entries,
  keepId,
  onKeep,
  name,
  caption,
}: {
  entries: RepeaterDuplicateSide[];
  /** The entry that would be kept, when one is being chosen. */
  keepId?: string | null;
  onKeep?: (id: string) => void;
  /** A name for the group of radio buttons, unique on the page. */
  name?: string;
  caption: string;
}) {
  const columns = entries.map(parts);
  const rows = (columns[0] ?? []).map(([label], index) => ({ label, values: columns.map((column) => column[index]![1]) }));
  const differing = rows.filter((row) => new Set(row.values).size > 1);
  const agreed = rows.filter((row) => new Set(row.values).size === 1 && row.values[0] !== NOTHING && row.label !== "Callsign");
  return (
    <div className="grid gap-1.5">
      <ScrollBox label={caption} className="scroll-quiet overflow-x-auto border-y border-border">
        <table className="w-full text-small" style={{ minWidth: `${7 + entries.length * 9.5}rem` }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left align-top">
              <th scope="col" className="w-[7rem] py-1.5 pr-3 font-medium text-ink-muted">
                <span className="sr-only">What</span>
              </th>
              {entries.map((entry, index) => (
                <th key={entry.id ?? `row-${index}`} scope="col" className="py-1.5 pr-3 font-medium text-ink">
                  {onKeep && entry.id ? (
                    <label className="flex min-h-9 cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name={name}
                        checked={keepId === entry.id}
                        onChange={() => onKeep(entry.id!)}
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                      />
                      <span>
                        {sideLabel(entry)}
                        <span className={cn("block font-normal", keepId === entry.id ? "text-primary" : "text-ink-muted")}>
                          {keepId === entry.id ? "Keep this one" : "Set aside"}
                        </span>
                      </span>
                    </label>
                  ) : (
                    sideLabel(entry)
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {differing.length === 0 ? (
              <tr>
                <td colSpan={entries.length + 1} className="py-1.5 text-ink-muted">
                  They say the same in every part.
                </td>
              </tr>
            ) : (
              differing.map((row) => (
                <tr key={row.label} className="align-top">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-muted">
                    {row.label}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: the columns are the entries, in a fixed order
                      key={index}
                      className={cn(
                        "py-1.5 pr-3 break-words",
                        value === NOTHING ? "text-ink-muted" : "text-ink",
                        row.label === "Listen on" && "tabular",
                      )}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollBox>
      {agreed.length > 0 ? (
        <p className="tabular text-small text-ink-muted">
          They agree on {agreed.map((row) => `${inSentence(row.label)} ${row.values[0]}`).join("; ")}.
        </p>
      ) : null}
    </div>
  );
}
