/**
 * Adding or changing one load of a power plan. A new load starts from the library of
 * common devices (with its makers' figures and their sources), from one of the person's
 * own devices, from a radio saved for the HF planner, or from nothing; then its figures
 * and how it is used can be changed. A load made from the library keeps a record of
 * where its figures came from, so that the plan can cite it and say when one has been
 * changed by hand.
 */
import {
  type LoadOrigin,
  type PowerLoad,
  type PowerSupply,
  RADIO_MODES,
  type RadioModeId,
  radioModeById,
  USB_CHARGING,
} from "@outpost/shared";
import { useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { localId } from "@/lib/utils";
import { changedSince, loadFromEntry, loadFromOwn } from "./calc/devices";
import { loadDailyWh, radioDuty } from "./calc/plan";
import { useRadioProfiles } from "./data";
import { DevicePicker, type PickerChoice } from "./device-picker";
import { FigureSources } from "./device-rows";
import { kindWords } from "./device-text";
import { ChoiceField, Fields, figure, NumberField, PercentField } from "./inputs";

/** A load being typed: numbers may still be missing. */
interface Draft {
  kind: "device" | "radio" | "charge";
  name: string;
  supply: PowerSupply;
  quantity: number | null;
  startHour: number | null;
  watts: number | null;
  hoursPerDay: number | null;
  transmitW: number | null;
  receiveW: number | null;
  standbyW: number | null;
  onAirHours: number | null;
  standbyHours: number | null;
  transmitShare: number | null;
  modeFactor: number | null;
  mode: RadioModeId;
  wattHours: number | null;
  chargesPerDay: number | null;
  chargeEfficiency: number | null;
  chargeHours: number | null;
  origin: LoadOrigin | null;
  /** Where the starting figures came from, said under the form when there is no record to cite. */
  note: string | null;
}

const blank: Draft = {
  kind: "device",
  name: "",
  supply: "dc",
  quantity: 1,
  startHour: 18,
  watts: null,
  hoursPerDay: null,
  transmitW: null,
  receiveW: null,
  standbyW: null,
  onAirHours: 2,
  standbyHours: 0,
  transmitShare: 0.5,
  modeFactor: 0.2,
  mode: "ssb",
  wattHours: null,
  chargesPerDay: 1,
  chargeEfficiency: USB_CHARGING.share,
  chargeHours: 2,
  origin: null,
  note: null,
};

const draftOf = (load: PowerLoad): Draft => ({ ...blank, ...load, origin: load.origin ?? null, note: null });

/** The ways to start that are not a device: a radio saved for the HF planner, or typing the figures. */
const TYPE_IT = [
  { id: "type:device", label: "Something that runs: type its watts", draft: { kind: "device" } as Partial<Draft> },
  { id: "type:radio", label: "A radio: type its draw", draft: { kind: "radio" } as Partial<Draft> },
  {
    id: "type:charge",
    label: "Something charged: type its battery",
    draft: { kind: "charge", supply: "usb", startHour: 20 } as Partial<Draft>,
  },
];

/** The load the draft makes, or what is missing. */
function finish(draft: Draft, id: string): PowerLoad | string {
  if (!draft.name.trim()) return "Give it a name.";
  const need = (value: number | null, what: string) => (value === null ? what : null);
  const base = {
    id,
    name: draft.name.trim(),
    supply: draft.supply,
    quantity: Math.max(1, Math.round(draft.quantity ?? 1)),
    startHour: Math.round(draft.startHour ?? 0),
    ...(draft.origin ? { origin: draft.origin } : {}),
  };
  if (draft.kind === "device") {
    const missing = need(draft.watts, "Give its power in watts.") ?? need(draft.hoursPerDay, "Give the hours a day it is on.");
    if (missing) return missing;
    return { ...base, kind: "device", watts: draft.watts!, hoursPerDay: draft.hoursPerDay! };
  }
  if (draft.kind === "charge") {
    const missing =
      need(draft.wattHours, "Give its battery's watt-hours.") ??
      need(draft.chargesPerDay, "Give the charges a day.") ??
      need(draft.chargeEfficiency, "Give the charging efficiency.");
    if (missing) return missing;
    if ((draft.chargeEfficiency ?? 0) <= 0) return "The charging efficiency must be more than nothing.";
    if ((draft.wattHours ?? 0) <= 0) return "Give its battery's watt-hours.";
    return {
      ...base,
      kind: "charge",
      wattHours: draft.wattHours!,
      chargesPerDay: draft.chargesPerDay!,
      chargeEfficiency: draft.chargeEfficiency!,
      chargeHours: draft.chargeHours && draft.chargeHours > 0 ? draft.chargeHours : 2,
    };
  }
  const missing =
    need(draft.transmitW, "Give the power it draws transmitting.") ??
    need(draft.receiveW, "Give the power it draws receiving.") ??
    need(draft.onAirHours, "Give the hours a day on the air.");
  if (missing) return missing;
  if ((draft.onAirHours ?? 0) + (draft.standbyHours ?? 0) > 24) return "The hours on the air and on standby add up to more than a day.";
  return {
    ...base,
    kind: "radio",
    transmitW: draft.transmitW!,
    receiveW: draft.receiveW!,
    standbyW: draft.standbyW ?? 0,
    onAirHours: draft.onAirHours!,
    standbyHours: draft.standbyHours ?? 0,
    transmitShare: draft.transmitShare ?? 0,
    modeFactor: draft.modeFactor ?? 0,
    mode: draft.mode,
  };
}

const HOURS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, "0")}:00` }));

export function LoadDialog({ load, onSave, onClose }: { load: PowerLoad | null; onSave: (load: PowerLoad) => void; onClose: () => void }) {
  const [picking, setPicking] = useState(load === null);
  const [draft, setDraft] = useState<Draft>(load ? draftOf(load) : blank);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const radios = useRadioProfiles();
  const set = (patch: Partial<Draft>) => {
    setProblem(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const pick = (choice: PickerChoice) => {
    setProblem(null);
    setSaid(null);
    if (choice.kind === "common" && (choice.entry.kind === "label" || choice.entry.kind === "guide")) {
      if (choice.entry.kind === "guide") {
        // No figure, by design: say what the maker's guide says and stay on the list.
        setSaid(choice.entry.text);
        return;
      }
      setDraft({
        ...blank,
        ...(choice.entry.unit === "Wh" ? { kind: "charge", supply: "usb", startHour: 20 } : { kind: "device" }),
        name: choice.entry.name,
        note: choice.entry.hint,
      });
      setPicking(false);
      return;
    }
    if (choice.kind === "common" || choice.kind === "own") {
      const made = choice.kind === "common" ? loadFromEntry(choice.entry, "draft") : loadFromOwn(choice.device, "draft");
      if (made) {
        setDraft(draftOf(made));
        setPicking(false);
      }
      return;
    }
    const typed = TYPE_IT.find((item) => item.id === choice.id);
    if (typed) {
      setDraft({ ...blank, ...typed.draft });
      setPicking(false);
      return;
    }
    const radio = radios.data?.find((item) => `radio:${item.id}` === choice.id);
    if (radio) {
      setDraft({
        ...blank,
        kind: "radio",
        name: radio.name,
        transmitW: radio.powerWatts * 2,
        note: `From the radio “${radio.name}” (${radio.powerWatts} W output). The transmit draw is an estimate, twice the output, as for an amplifier about half efficient: the transmit current in its manual × the supply voltage is better. Type the receive draw from the manual.`,
      });
      setPicking(false);
    }
  };

  const preview = finish(draft, load?.id ?? "preview");
  const mode = radioModeById(draft.mode);
  const extras = [
    ...(radios.data ?? []).map((radio) => ({
      id: `radio:${radio.id}`,
      label: `Saved radio: ${radio.name}`,
      description: `${radio.powerWatts} W output, from the HF planner`,
    })),
    ...TYPE_IT.map((item) => ({ id: item.id, label: item.label })),
  ];

  if (picking) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          title="Add a load"
          description="Choose what draws from the battery: its figures come with it, and can be changed."
          size="lg"
        >
          <DialogBody className="grid gap-4">
            {said ? <Notice tone="warning">{said}</Notice> : null}
            <DevicePicker onPick={pick} extras={extras} extrasTitle="Your radios, or type the figures" />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const previewLoad = typeof preview !== "string" ? preview : null;
  const words = previewLoad ? kindWords(previewLoad) : null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={load ? `Change ${load.name}` : "Add a load"} description="Something that draws from the battery." size="lg">
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const done = finish(draft, load?.id ?? localId());
            if (typeof done === "string") setProblem(done);
            else onSave(done);
          }}
        >
          <DialogBody className="grid gap-4">
            {!load ? (
              <div>
                <Button variant="link" onClick={() => setPicking(true)}>
                  Choose another device
                </Button>
              </div>
            ) : null}
            {draft.origin && previewLoad ? (
              <div className="text-small text-ink-muted">
                {draft.origin.library === "own" ? `From your own device “${draft.origin.name}”` : `From the library: ${draft.origin.name}`}
                {words ? `, ${words}` : ""}.
                {changedSince(previewLoad) ? " A figure has been changed, so it is yours; where the rest came from is kept." : ""}
                <FigureSources load={previewLoad} />
              </div>
            ) : null}
            {draft.note ? <p className="text-small text-ink-muted">{draft.note}</p> : null}
            <Fields>
              <Field label="Name">
                {(ids) => <Input {...ids} value={draft.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} />}
              </Field>
              <ChoiceField
                label="Supplied"
                value={draft.supply}
                onChange={(supply) => set({ supply })}
                options={[
                  { value: "dc", label: "From the battery (DC)" },
                  { value: "usb", label: "Over USB, through the converter" },
                  { value: "ac", label: "Through the inverter (AC)" },
                ]}
              />
              <NumberField label="How many" value={draft.quantity} onChange={(quantity) => set({ quantity })} min={1} max={1000} />
              <ChoiceField
                label="First on at"
                value={String(draft.startHour ?? 0)}
                onChange={(value) => set({ startHour: Number(value) })}
                options={HOURS}
                hint="For the hour-by-hour chart."
              />
            </Fields>
            {draft.kind === "device" ? (
              <Fields>
                <NumberField
                  label="Power while on"
                  unit="W"
                  value={draft.watts}
                  onChange={(watts) => set({ watts })}
                  min={0}
                  hint={draft.supply === "ac" ? "At the plug." : draft.supply === "usb" ? "At the USB socket." : undefined}
                />
                <NumberField
                  label="Hours a day"
                  unit="h"
                  value={draft.hoursPerDay}
                  onChange={(hoursPerDay) => set({ hoursPerDay })}
                  min={0}
                  max={24}
                />
              </Fields>
            ) : draft.kind === "charge" ? (
              <Fields>
                <NumberField
                  label="Its battery"
                  unit="Wh"
                  value={draft.wattHours}
                  onChange={(wattHours) => set({ wattHours })}
                  min={0}
                  hint="mAh × volts ÷ 1000."
                />
                <NumberField
                  label="Charges a day"
                  value={draft.chargesPerDay}
                  onChange={(chargesPerDay) => set({ chargesPerDay })}
                  min={0}
                  max={100}
                />
                <PercentField
                  label="Charging efficiency"
                  value={draft.chargeEfficiency}
                  onChange={(chargeEfficiency) => set({ chargeEfficiency })}
                  hint={USB_CHARGING.basis}
                />
                <NumberField
                  label="Hours a charge takes"
                  unit="h"
                  value={draft.chargeHours}
                  onChange={(chargeHours) => set({ chargeHours })}
                  min={0}
                  max={24}
                  hint="For the hour-by-hour chart only."
                />
              </Fields>
            ) : (
              <>
                <Fields>
                  <NumberField
                    label="Draw transmitting at full output"
                    unit="W"
                    value={draft.transmitW}
                    onChange={(transmitW) => set({ transmitW })}
                    min={0}
                    hint="The manual's transmit current × the supply voltage."
                  />
                  <NumberField label="Draw receiving" unit="W" value={draft.receiveW} onChange={(receiveW) => set({ receiveW })} min={0} />
                  <NumberField label="Draw on standby" unit="W" value={draft.standbyW} onChange={(standbyW) => set({ standbyW })} min={0} />
                  <NumberField
                    label="Hours a day on the air"
                    unit="h"
                    value={draft.onAirHours}
                    onChange={(onAirHours) => set({ onAirHours })}
                    min={0}
                    max={24}
                  />
                  <NumberField
                    label="Hours a day on standby"
                    unit="h"
                    value={draft.standbyHours}
                    onChange={(standbyHours) => set({ standbyHours })}
                    min={0}
                    max={24}
                  />
                  <ChoiceField
                    label="Mode"
                    value={draft.mode}
                    onChange={(id) => {
                      const preset = radioModeById(id);
                      set(
                        id === "custom" ? { mode: id } : { mode: id, transmitShare: preset.transmitShare, modeFactor: preset.modeFactor },
                      );
                    }}
                    options={RADIO_MODES.map((item) => ({ value: item.id, label: item.label }))}
                  />
                  <PercentField
                    label="Share of time on the air transmitting"
                    value={draft.transmitShare}
                    onChange={(transmitShare) => set({ transmitShare, mode: "custom" })}
                  />
                  <PercentField
                    label="Mode's power while transmitting"
                    value={draft.modeFactor}
                    onChange={(modeFactor) => set({ modeFactor, mode: "custom" })}
                    hint="Against full output: the mode's duty factor."
                  />
                </Fields>
                <p className="text-small text-ink-muted">
                  Duty cycle {figure(radioDuty({ transmitShare: draft.transmitShare ?? 0, modeFactor: draft.modeFactor ?? 0 }) * 100, 1)}%.{" "}
                  {draft.mode === "custom" ? "Your own figures." : mode.basis}
                </p>
              </>
            )}
            {previewLoad ? (
              <p className="tabular text-small text-ink">
                Uses {figure(loadDailyWh(previewLoad), 0)} Wh a day
                {previewLoad.supply === "ac"
                  ? " at the plug, more from the battery through the inverter"
                  : previewLoad.supply === "usb"
                    ? " at the USB socket, more from the battery through the converter"
                    : ""}
                .
              </p>
            ) : null}
            {problem ? <Notice tone="danger">{problem}</Notice> : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">
              {load ? "Save load" : "Add load"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
