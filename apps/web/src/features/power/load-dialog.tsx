/**
 * Adding or changing one load of a power plan: a device with one power figure, or a
 * transceiver with transmit, receive and standby power and a duty cycle. Starts from a
 * kind of thing (with the figures that have a source filled in, and the rest left for
 * the person's own), from a radio saved for the HF planner, or from nothing.
 */
import { type PowerLoad, type PowerSupply, RADIO_MODES, type RadioModeId, radioModeById } from "@outpost/shared";
import { useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { localId } from "@/lib/utils";
import { loadDailyWh, radioDuty } from "./calc/plan";
import { useRadioProfiles } from "./data";
import { ChoiceField, Fields, figure, NumberField, PercentField } from "./inputs";

/** A load being typed: numbers may still be missing. */
interface Draft {
  kind: "device" | "radio";
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
  /** Where the starting figures came from, said under the form. */
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
  note: null,
};

/**
 * Kinds of thing to start from. Only the Raspberry Pi has a figure filled in, and that
 * is the supply Raspberry Pi recommends for it (Raspberry Pi documentation, "Power
 * supply"): the most it should draw, so a plan built on it errs on the safe side.
 */
export const LOAD_STARTS: Array<{ id: string; label: string; draft: Partial<Draft> }> = [
  {
    id: "pi4",
    label: "Raspberry Pi 4 running Outpost",
    draft: {
      name: "Raspberry Pi 4 running Outpost",
      watts: 15,
      hoursPerDay: 24,
      startHour: 0,
      note: '15 W is the supply Raspberry Pi recommends, 3 A at 5 V: the most it should draw with its USB devices. The bare board typically draws 600 mA, 3 W (Raspberry Pi documentation, "Power supply"); a drive adds to that. A USB power meter gives yours.',
    },
  },
  {
    id: "pi5",
    label: "Raspberry Pi 5 running Outpost",
    draft: {
      name: "Raspberry Pi 5 running Outpost",
      watts: 25,
      hoursPerDay: 24,
      startHour: 0,
      note: '25 W is the supply Raspberry Pi recommends, 5 A at 5 V: the most it should draw with its USB devices. The bare board typically draws 800 mA, 4 W (Raspberry Pi documentation, "Power supply"); a drive adds to that. A USB power meter gives yours.',
    },
  },
  { id: "radio", label: "Radio transceiver", draft: { kind: "radio", name: "Radio", startHour: 18, note: null } },
  {
    id: "lights",
    label: "Lights",
    draft: {
      name: "Lights",
      hoursPerDay: 5,
      startHour: 18,
      note: "Type the watts on the lamp or its label. LED lamps say their watts on the base.",
    },
  },
  {
    id: "phone",
    label: "Phone charger",
    draft: {
      name: "Phone charger",
      hoursPerDay: 2,
      startHour: 20,
      note: "A charger's label gives its output: 5 V at 2 A is 10 W, the most it draws. A phone draws less as it fills.",
    },
  },
  {
    id: "laptop",
    label: "Laptop",
    draft: {
      name: "Laptop",
      supply: "ac",
      hoursPerDay: 3,
      startHour: 9,
      note: "Its charger's label gives the most it draws (often 45 to 100 W). On battery and charged, a laptop draws much less. A USB-C laptop can charge from the battery through a DC charger instead, without the inverter.",
    },
  },
  { id: "other", label: "Something else", draft: { name: "", note: null } },
];

function draftOf(load: PowerLoad): Draft {
  return load.kind === "device" ? { ...blank, ...load, note: null } : { ...blank, ...load, watts: null, hoursPerDay: null, note: null };
}

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
  };
  if (draft.kind === "device") {
    const missing = need(draft.watts, "Give its power in watts.") ?? need(draft.hoursPerDay, "Give the hours a day it is on.");
    if (missing) return missing;
    return { ...base, kind: "device", watts: draft.watts!, hoursPerDay: draft.hoursPerDay! };
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
  const [start, setStart] = useState<string>(load ? "kept" : "pi4");
  const [draft, setDraft] = useState<Draft>(load ? draftOf(load) : { ...blank, ...LOAD_STARTS[0]!.draft });
  const [problem, setProblem] = useState<string | null>(null);
  const radios = useRadioProfiles();
  const set = (patch: Partial<Draft>) => {
    setProblem(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const choose = (value: string) => {
    setStart(value);
    setProblem(null);
    const preset = LOAD_STARTS.find((item) => item.id === value);
    if (preset) {
      setDraft({ ...blank, ...preset.draft });
      return;
    }
    const radio = radios.data?.find((item) => `radio:${item.id}` === value);
    if (radio)
      setDraft({
        ...blank,
        kind: "radio",
        name: radio.name,
        transmitW: radio.powerWatts * 2,
        note: `From the radio “${radio.name}” (${radio.powerWatts} W output). The transmit draw is an estimate, twice the output, as for an amplifier about half efficient: the transmit current in its manual × the supply voltage is better. Type the receive draw from the manual.`,
      });
  };
  const preview = finish(draft, load?.id ?? "preview");
  const startOptions = [
    ...(load ? [{ value: "kept", label: "As it is" }] : []),
    ...LOAD_STARTS.map((item) => ({ value: item.id, label: item.label })),
    ...(radios.data ?? []).map((radio) => ({
      value: `radio:${radio.id}`,
      label: `Saved radio: ${radio.name}`,
      description: `${radio.powerWatts} W output`,
    })),
  ];
  const mode = radioModeById(draft.mode);
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
            <ChoiceField label="Start from" value={start} onChange={choose} options={startOptions} />
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
                  hint={draft.supply === "ac" ? "At the plug." : undefined}
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
            {typeof preview !== "string" ? (
              <p className="tabular text-small text-ink">
                Uses {figure(loadDailyWh(preview), 0)} Wh a day
                {preview.supply === "ac" ? " at the plug, more from the battery through the inverter" : ""}.
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
