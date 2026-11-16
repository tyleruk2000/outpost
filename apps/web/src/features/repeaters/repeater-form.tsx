/** Adding a repeater by hand, or changing one. Frequencies are typed in megahertz, a position as coordinates or a locator. */
import {
  formatDecimal,
  formatMHz,
  parseCoordinateReadings,
  REPEATER_MODES,
  REPEATER_STATUS_NAMES,
  REPEATER_STATUSES,
  type RepeaterDto,
  type RepeaterListDto,
  type RepeaterMode,
  type RepeaterStatus,
} from "@outpost/shared";
import { useEffect, useId, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox, Select } from "@/components/ui/misc";
import { type RepeaterInput, useSaveRepeater } from "./data";
import { isApproximate } from "./words";

interface Draft {
  callsign: string;
  output: string;
  input: string;
  modes: RepeaterMode[];
  ctcss: string;
  dcs: string;
  colourCode: string;
  talkgroups: string;
  accessNote: string;
  channel: string;
  place: string;
  region: string;
  country: string;
  position: string;
  antenna: string;
  keeper: string;
  status: RepeaterStatus;
  notes: string;
}

/** A position as the form shows it: the locator where that is all the list knew, otherwise the coordinates. */
function positionText(repeater: RepeaterDto): string {
  if (repeater.lat === null || repeater.lon === null) return "";
  if (repeater.locator && isApproximate(repeater)) return repeater.locator;
  return formatDecimal(repeater.lat, repeater.lon, 5);
}

const draftOf = (repeater: RepeaterDto | null): Draft => ({
  callsign: repeater?.callsign ?? "",
  output: repeater ? formatMHz(repeater.outputHz) : "",
  input: repeater && repeater.inputHz !== null ? formatMHz(repeater.inputHz) : "",
  modes: repeater?.modes ?? ["fm"],
  ctcss: repeater && repeater.ctcssHz !== null ? repeater.ctcssHz.toFixed(1) : "",
  dcs: repeater?.dcsCode ?? "",
  colourCode: repeater && repeater.dmrColourCode !== null ? String(repeater.dmrColourCode) : "",
  talkgroups: repeater?.talkgroups ?? "",
  accessNote: repeater?.accessNote ?? "",
  channel: repeater?.channel ?? "",
  place: repeater?.place ?? "",
  region: repeater?.region ?? "",
  country: repeater?.country ?? "",
  position: repeater ? positionText(repeater) : "",
  antenna: repeater && repeater.antennaMeters !== null ? String(repeater.antennaMeters) : "",
  keeper: repeater?.keeper ?? "",
  status: repeater?.status ?? "unknown",
  notes: repeater?.notes ?? "",
});

const numberOf = (text: string): number | null => {
  const tidy = text.trim().replace(",", ".");
  if (!tidy || !/^\d+(\.\d+)?$/.test(tidy)) return null;
  return Number(tidy);
};

type Problems = Partial<Record<keyof Draft, string>>;

/** The draft as the API takes it, or what is wrong with it. */
export function readDraft(draft: Draft, original: RepeaterDto | null): { input: Partial<RepeaterInput>; problems: Problems } {
  const problems: Problems = {};
  const megahertz = (text: string, field: "output" | "input"): number | null => {
    const value = numberOf(text);
    if (value === null || value < 1 || value > 250_000) {
      problems[field] = "A frequency in megahertz, such as 145.7750.";
      return null;
    }
    return Math.round(value * 1e6);
  };
  if (!draft.callsign.trim()) problems.callsign = "Give the repeater a callsign or a name.";
  const outputHz = megahertz(draft.output, "output");
  const inputHz = draft.input.trim() ? megahertz(draft.input, "input") : null;

  let ctcssHz: number | null = null;
  if (draft.ctcss.trim()) {
    ctcssHz = numberOf(draft.ctcss);
    if (ctcssHz === null || ctcssHz < 60 || ctcssHz > 260) problems.ctcss = "A tone in hertz between 60 and 260, such as 94.8.";
  }
  const dcs = draft.dcs.trim();
  if (dcs && !/^[0-7]{3}$/.test(dcs)) problems.dcs = "Three digits from 0 to 7, such as 023.";
  let dmrColourCode: number | null = null;
  if (draft.colourCode.trim()) {
    dmrColourCode = numberOf(draft.colourCode);
    if (dmrColourCode === null || !Number.isInteger(dmrColourCode) || dmrColourCode > 15)
      problems.colourCode = "A whole number from 0 to 15.";
  }
  let antennaMeters: number | null = null;
  if (draft.antenna.trim()) {
    antennaMeters = numberOf(draft.antenna);
    if (antennaMeters === null || antennaMeters > 1000) problems.antenna = "A height in metres, up to 1000.";
  }

  const input: Partial<RepeaterInput> = {
    callsign: draft.callsign.trim(),
    outputHz: outputHz ?? undefined,
    inputHz,
    modes: draft.modes,
    ctcssHz,
    dcsCode: dcs || null,
    dmrColourCode,
    talkgroups: draft.talkgroups,
    accessNote: draft.accessNote,
    channel: draft.channel,
    place: draft.place,
    region: draft.region,
    country: draft.country,
    antennaMeters,
    keeper: draft.keeper,
    status: draft.status,
    notes: draft.notes,
  };

  // The position is sent only when it was changed, so that looking at an entry does not make a listed position "exact".
  const position = draft.position.trim();
  if (!original || position !== positionText(original)) {
    if (!position) Object.assign(input, { lat: null, lon: null, locator: "" });
    else {
      const reading = parseCoordinateReadings(position)[0];
      if (!reading) problems.position = "Coordinates such as 54.46, -3.09, a grid reference, or a locator such as IO84KM.";
      else if (reading.locator) Object.assign(input, { lat: null, lon: null, locator: reading.locator });
      else Object.assign(input, { lat: Number(reading.lat.toFixed(6)), lon: Number(reading.lon.toFixed(6)), locator: "" });
    }
  }
  return { input, problems };
}

export function RepeaterFormDialog({
  open,
  onClose,
  repeater,
  list,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The entry being changed. Without it, a new one is made. */
  repeater?: RepeaterDto | null;
  list?: RepeaterListDto | null;
  onSaved?: (repeater: RepeaterDto) => void;
}) {
  const original = repeater ?? null;
  const [draft, setDraft] = useState<Draft>(() => draftOf(original));
  const [tried, setTried] = useState(false);
  const save = useSaveRepeater();
  const modesId = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: opening the dialog starts from the entry as it is
  useEffect(() => {
    if (!open) return;
    setDraft(draftOf(original));
    setTried(false);
    save.reset();
  }, [open, original?.id]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const { input, problems } = readDraft(draft, original);
  const shown: Problems = tried ? problems : {};
  const text =
    (key: keyof Draft, props: { maxLength?: number; placeholder?: string; mono?: boolean; inputMode?: "decimal" | "numeric" } = {}) =>
    (ids: object) => (
      <Input
        {...ids}
        value={draft[key] as string}
        onChange={(event) => set(key, event.target.value as never)}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        autoComplete="off"
        spellCheck={false}
        className={props.mono ? "tabular font-mono text-small" : undefined}
      />
    );

  const submit = () => {
    setTried(true);
    if (Object.keys(problems).length > 0) return;
    save.mutate(
      { id: original?.id, ...input },
      {
        onSuccess: ({ repeater: saved }) => {
          onSaved?.(saved);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !save.isPending && onClose()}>
      <DialogContent title={original ? `Change ${original.callsign}` : "Add a repeater"} size="lg">
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody className="grid gap-4">
            {original && list && !original.edited ? (
              <Notice tone="info">
                This entry came from “{list.name}”. Once you change it, bringing that list up to date leaves it as you have it, and you can
                put it back to what the list says at any time.
              </Notice>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Callsign" error={shown.callsign}>
                {text("callsign", { maxLength: 40 })}
              </Field>
              <Field label="Listen on, MHz" hint="The repeater's output." error={shown.output}>
                {text("output", { placeholder: "145.7750", mono: true, inputMode: "decimal" })}
              </Field>
              <Field label="Transmit on, MHz" hint="Its input. Empty if not known." error={shown.input}>
                {text("input", { placeholder: "145.1750", mono: true, inputMode: "decimal" })}
              </Field>
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="text-small font-medium text-ink">Modes</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {REPEATER_MODES.map((mode) => (
                  <span key={mode.id} className="flex min-h-9 items-center gap-2 max-md:min-h-11">
                    <Checkbox
                      id={`${modesId}-${mode.id}`}
                      checked={draft.modes.includes(mode.id)}
                      onCheckedChange={(checked) =>
                        set("modes", checked === true ? [...draft.modes, mode.id] : draft.modes.filter((item) => item !== mode.id))
                      }
                    />
                    <label htmlFor={`${modesId}-${mode.id}`} className="text-small text-ink">
                      {mode.name}
                    </label>
                  </span>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="CTCSS tone, Hz" error={shown.ctcss}>
                {text("ctcss", { placeholder: "94.8", mono: true, inputMode: "decimal" })}
              </Field>
              <Field label="DCS code" error={shown.dcs}>
                {text("dcs", { placeholder: "023", mono: true, inputMode: "numeric", maxLength: 3 })}
              </Field>
              <Field label="DMR colour code" error={shown.colourCode}>
                {text("colourCode", { mono: true, inputMode: "numeric", maxLength: 2 })}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="DMR talkgroups">{text("talkgroups", { maxLength: 500 })}</Field>
              <Field label="Other access details" hint="A tone burst, a D-STAR module, a Fusion group.">
                {text("accessNote", { maxLength: 500 })}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Town or site">{text("place", { maxLength: 120 })}</Field>
              <Field label="Region">{text("region", { maxLength: 80 })}</Field>
              <Field label="Country">{text("country", { maxLength: 80 })}</Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Position"
                hint="Coordinates, a grid reference or a locator. A locator alone puts it at the middle of its square."
                error={shown.position}
                className="sm:col-span-2"
              >
                {text("position", { placeholder: "54.46, -3.09 or IO84KM", mono: true })}
              </Field>
              <Field label="Aerial above ground, m" error={shown.antenna}>
                {text("antenna", { mono: true, inputMode: "decimal" })}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Keeper">{text("keeper", { maxLength: 80 })}</Field>
              <Field label="Channel">{text("channel", { maxLength: 40 })}</Field>
              <Field label="Status">
                {(ids) => (
                  <Select
                    {...ids}
                    value={draft.status}
                    onChange={(status) => set("status", status)}
                    options={REPEATER_STATUSES.map((status) => ({
                      value: status,
                      label:
                        status === "unknown"
                          ? "Not known"
                          : REPEATER_STATUS_NAMES[status].replace("Listed as ", "").replace(/^./, (letter) => letter.toUpperCase()),
                    }))}
                  />
                )}
              </Field>
            </div>
            <Field label="Notes">
              {(ids) => (
                <Textarea {...ids} value={draft.notes} onChange={(event) => set("notes", event.target.value)} maxLength={2000} rows={3} />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {original ? "Save changes" : "Add repeater"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
