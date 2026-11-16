/**
 * Radios and antennas a person owns, saved once and picked in the planner. Lists with
 * hairlines; a profile is edited in a dialog.
 */
import {
  ANTENNA_PRESETS,
  type AntennaKind,
  type AntennaProfile,
  type AntennaProfileInput,
  antennaModelLabel,
  GROUNDS,
  type GroundKind,
  type ModeId,
  OPERATING_MODES,
  type RadioProfile,
  type RadioProfileInput,
} from "@outpost/shared";
import { useId, useState } from "react";
import { EmptyState, ErrorState, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { useProfiles, useRemoveAntenna, useRemoveRadio, useSaveAntenna, useSaveRadio } from "./data";

const KINDS: AntennaKind[] = ["horizontal-dipole", "inverted-v", "end-fed-half-wave", "vertical-monopole", "isotropic"];
const KIND_NAMES: Record<AntennaKind, string> = {
  "horizontal-dipole": "Horizontal dipole",
  "inverted-v": "Inverted-V",
  "end-fed-half-wave": "End-fed half-wave",
  "vertical-monopole": "Quarter-wave vertical",
  isotropic: "Isotropic (a gain figure only)",
};
const presetNote = (kind: AntennaKind) => ANTENNA_PRESETS.find((preset) => preset.spec.kind === kind)?.modelledAs ?? "";
const number = (text: string, fallback = Number.NaN) => (text.trim() === "" ? fallback : Number(text));

type RadioDraft = {
  id?: string;
  name: string;
  model: string;
  powerWatts: string;
  minMhz: string;
  maxMhz: string;
  modes: ModeId[];
  receiver: string;
  notes: string;
};
type AntennaDraft = {
  id?: string;
  name: string;
  kind: AntennaKind;
  heightM: string;
  ground: GroundKind;
  broadside: string;
  gainDb: string;
  feedlineLossDb: string;
  minMhz: string;
  maxMhz: string;
  notes: string;
};

const radioDraft = (radio?: RadioProfile): RadioDraft =>
  radio
    ? {
        id: radio.id,
        name: radio.name,
        model: radio.model,
        powerWatts: String(radio.powerWatts),
        minMhz: String(radio.minMhz),
        maxMhz: String(radio.maxMhz),
        modes: radio.modes,
        receiver: radio.receiver,
        notes: radio.notes,
      }
    : { name: "", model: "", powerWatts: "5", minMhz: "1.8", maxMhz: "30", modes: ["ssb", "cw"], receiver: "", notes: "" };
const antennaDraft = (antenna?: AntennaProfile): AntennaDraft =>
  antenna
    ? {
        id: antenna.id,
        name: antenna.name,
        kind: antenna.kind,
        heightM: String(antenna.heightM),
        ground: antenna.ground,
        broadside: antenna.broadsideDeg === null ? "" : String(antenna.broadsideDeg),
        gainDb: String(antenna.gainDb),
        feedlineLossDb: String(antenna.feedlineLossDb),
        minMhz: String(antenna.minMhz),
        maxMhz: String(antenna.maxMhz),
        notes: antenna.notes,
      }
    : {
        name: "",
        kind: "horizontal-dipole",
        heightM: "5",
        ground: "average",
        broadside: "",
        gainDb: "0",
        feedlineLossDb: "0",
        minMhz: "3.5",
        maxMhz: "30",
        notes: "",
      };

function RadioDialog({ draft, onClose }: { draft: RadioDraft; onClose: () => void }) {
  const [value, setValue] = useState(draft);
  const [problem, setProblem] = useState<string | null>(null);
  const modesId = useId();
  const save = useSaveRadio();
  const set = <K extends keyof RadioDraft>(key: K, next: RadioDraft[K]) => setValue((current) => ({ ...current, [key]: next }));
  const submit = () => {
    const input: RadioProfileInput = {
      name: value.name.trim(),
      model: value.model.trim(),
      powerWatts: number(value.powerWatts),
      minMhz: number(value.minMhz),
      maxMhz: number(value.maxMhz),
      modes: value.modes,
      receiver: value.receiver,
      notes: value.notes,
    };
    if (!input.name) return setProblem("Give the radio a name.");
    if (!(input.powerWatts >= 0.1)) return setProblem("Give the power in watts, at least 0.1.");
    if (!(input.minMhz > 0 && input.maxMhz >= input.minMhz)) return setProblem("Give the range it transmits over, lowest frequency first.");
    save.mutate({ id: value.id, input }, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={value.id ? "Edit radio" : "Add a radio"}>
        <DialogBody className="grid gap-4">
          <Field label="Name">
            {(ids) => <Input {...ids} value={value.name} onChange={(event) => set("name", event.target.value)} maxLength={80} />}
          </Field>
          <Field label="Model">
            {(ids) => <Input {...ids} value={value.model} onChange={(event) => set("model", event.target.value)} maxLength={120} />}
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Power, W">
              {(ids) => (
                <Input
                  {...ids}
                  value={value.powerWatts}
                  onChange={(event) => set("powerWatts", event.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
            <Field label="From, MHz">
              {(ids) => (
                <Input
                  {...ids}
                  value={value.minMhz}
                  onChange={(event) => set("minMhz", event.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
            <Field label="To, MHz">
              {(ids) => (
                <Input
                  {...ids}
                  value={value.maxMhz}
                  onChange={(event) => set("maxMhz", event.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-small font-medium text-ink">Modes</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {OPERATING_MODES.map((mode) => (
                <label key={mode.id} htmlFor={`${modesId}-${mode.id}`} className="flex items-center gap-2 text-small text-ink">
                  <Checkbox
                    id={`${modesId}-${mode.id}`}
                    checked={value.modes.includes(mode.id)}
                    onCheckedChange={(checked) =>
                      set("modes", checked === true ? [...value.modes, mode.id] : value.modes.filter((id) => id !== mode.id))
                    }
                  />
                  {mode.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Receiver" hint="Anything worth recording: filters, sensitivity. Not used in a prediction.">
            {(ids) => <Input {...ids} value={value.receiver} onChange={(event) => set("receiver", event.target.value)} maxLength={2000} />}
          </Field>
          <Field label="Notes">
            {(ids) => (
              <Textarea {...ids} value={value.notes} onChange={(event) => set("notes", event.target.value)} rows={3} maxLength={4000} />
            )}
          </Field>
          {problem ? (
            <p role="alert" className="text-small text-danger">
              {problem}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {value.id ? "Save radio" : "Add radio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AntennaDialog({ draft, onClose }: { draft: AntennaDraft; onClose: () => void }) {
  const [value, setValue] = useState(draft);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveAntenna();
  const set = <K extends keyof AntennaDraft>(key: K, next: AntennaDraft[K]) => setValue((current) => ({ ...current, [key]: next }));
  const horizontal = value.kind === "horizontal-dipole" || value.kind === "inverted-v" || value.kind === "end-fed-half-wave";
  const submit = () => {
    const input: AntennaProfileInput = {
      name: value.name.trim(),
      kind: value.kind,
      heightM: horizontal ? number(value.heightM) : 0,
      ground: value.ground,
      broadsideDeg: horizontal && value.broadside.trim() !== "" ? number(value.broadside) : null,
      gainDb: number(value.gainDb, 0),
      feedlineLossDb: number(value.feedlineLossDb, 0),
      minMhz: number(value.minMhz),
      maxMhz: number(value.maxMhz),
      notes: value.notes,
    };
    if (!input.name) return setProblem("Give the antenna a name.");
    if (horizontal && !(input.heightM >= 0.5)) return setProblem("Give the height of the wire above the ground in metres, at least 0.5.");
    if (input.broadsideDeg !== null && !(input.broadsideDeg >= 0 && input.broadsideDeg <= 360))
      return setProblem("Give the bearing its broadside faces, 0 to 360, or leave it empty.");
    if (!Number.isFinite(input.gainDb) || !(input.feedlineLossDb >= 0))
      return setProblem("Give the gain and the feedline loss in decibels.");
    if (!(input.minMhz > 0 && input.maxMhz >= input.minMhz)) return setProblem("Give the range it is used over, lowest frequency first.");
    save.mutate({ id: value.id, input }, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={value.id ? "Edit antenna" : "Add an antenna"}>
        <DialogBody className="grid gap-4">
          <Field label="Name">
            {(ids) => <Input {...ids} value={value.name} onChange={(event) => set("name", event.target.value)} maxLength={80} />}
          </Field>
          <Field label="Kind" hint={presetNote(value.kind)}>
            {(ids) => (
              <Select<AntennaKind>
                {...ids}
                value={value.kind}
                onChange={(kind) => set("kind", kind)}
                options={KINDS.map((kind) => ({ value: kind, label: KIND_NAMES[kind] }))}
              />
            )}
          </Field>
          {horizontal ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height of the wire, m" hint={value.kind === "inverted-v" ? "The mean height, not the apex." : undefined}>
                {(ids) => (
                  <Input
                    {...ids}
                    value={value.heightM}
                    onChange={(event) => set("heightM", event.target.value)}
                    inputMode="decimal"
                    className="tabular"
                  />
                )}
              </Field>
              <Field label="Broadside faces, °" hint="Empty turns it towards the other station.">
                {(ids) => (
                  <Input
                    {...ids}
                    value={value.broadside}
                    onChange={(event) => set("broadside", event.target.value)}
                    inputMode="decimal"
                    className="tabular"
                  />
                )}
              </Field>
            </div>
          ) : null}
          {value.kind !== "isotropic" ? (
            <Field label="Ground under it" hint="An assumption about the ground, handed to the antenna model.">
              {(ids) => (
                <Select<GroundKind>
                  {...ids}
                  value={value.ground}
                  onChange={(ground) => set("ground", ground)}
                  options={GROUNDS.map((ground) => ({
                    value: ground.id,
                    label: ground.label,
                    description: `Dielectric ${ground.dielectric}, ${ground.conductivity} S/m`,
                  }))}
                />
              )}
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={value.kind === "isotropic" ? "Gain, dBi" : "Gain added, dB"}
              hint={value.kind === "isotropic" ? undefined : "Negative for a short or loaded antenna."}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={value.gainDb}
                  onChange={(event) => set("gainDb", event.target.value)}
                  inputMode="text"
                  className="tabular"
                />
              )}
            </Field>
            <Field label="Feedline loss, dB">
              {(ids) => (
                <Input
                  {...ids}
                  value={value.feedlineLossDb}
                  onChange={(event) => set("feedlineLossDb", event.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
            <Field label="Used from, MHz">
              {(ids) => (
                <Input
                  {...ids}
                  value={value.minMhz}
                  onChange={(event) => set("minMhz", event.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
            <Field label="To, MHz">
              {(ids) => (
                <Input
                  {...ids}
                  value={value.maxMhz}
                  onChange={(event) => set("maxMhz", event.target.value)}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
          </div>
          <Field label="Notes">
            {(ids) => (
              <Textarea {...ids} value={value.notes} onChange={(event) => set("notes", event.target.value)} rows={3} maxLength={4000} />
            )}
          </Field>
          {problem ? (
            <p role="alert" className="text-small text-danger">
              {problem}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {value.id ? "Save antenna" : "Add antenna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Equipment() {
  const profiles = useProfiles();
  const removeRadio = useRemoveRadio();
  const removeAntenna = useRemoveAntenna();
  const [radio, setRadio] = useState<RadioDraft | null>(null);
  const [antenna, setAntenna] = useState<AntennaDraft | null>(null);
  const [removing, setRemoving] = useState<{ what: "radio" | "antenna"; id: string; name: string } | null>(null);

  if (profiles.isPending) return <Skeleton className="h-48 w-full" />;
  if (profiles.isError) return <ErrorState error={profiles.error} onRetry={() => profiles.refetch()} />;
  const { radios, antennas } = profiles.data;
  const actions = (edit: () => void, remove: () => void) => (
    <span className="flex shrink-0 gap-2">
      <Button size="sm" onClick={edit}>
        Edit
      </Button>
      <Button size="sm" variant="danger-ghost" onClick={remove}>
        Delete
      </Button>
    </span>
  );

  return (
    <div>
      <Section title="Radios" actions={<Button onClick={() => setRadio(radioDraft())}>Add a radio</Button>}>
        {radios.length === 0 ? (
          <EmptyState
            compact
            title="No radios yet"
            action={
              <Button variant="primary" onClick={() => setRadio(radioDraft())}>
                Add a radio
              </Button>
            }
          >
            A radio profile keeps a transmitter's power, range and modes, so the planner can fill them in.
          </EmptyState>
        ) : (
          <Rows className="border-y border-border">
            {radios.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{item.name}</span>
                  <span className="tabular block text-small text-ink-muted">
                    {[
                      item.model,
                      `${item.powerWatts} W`,
                      `${item.minMhz} to ${item.maxMhz} MHz`,
                      item.modes.map((id) => OPERATING_MODES.find((mode) => mode.id === id)?.label ?? id).join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {actions(
                  () => setRadio(radioDraft(item)),
                  () => setRemoving({ what: "radio", id: item.id, name: item.name }),
                )}
              </li>
            ))}
          </Rows>
        )}
      </Section>

      <Section
        title="Antennas"
        description="Each is run as one of the engine's own antenna models. Two antennas of the same kind are never quite alike; a profile is a starting point."
        actions={<Button onClick={() => setAntenna(antennaDraft())}>Add an antenna</Button>}
      >
        {antennas.length === 0 ? (
          <EmptyState
            compact
            title="No antennas of your own yet"
            action={
              <Button variant="primary" onClick={() => setAntenna(antennaDraft())}>
                Add an antenna
              </Button>
            }
          >
            The planner offers the generic antennas below until you add your own.
          </EmptyState>
        ) : (
          <Rows className="border-y border-border">
            {antennas.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{item.name}</span>
                  <span className="tabular block text-small text-ink-muted">
                    {[
                      antennaModelLabel(item.kind),
                      item.kind === "isotropic" || item.kind === "vertical-monopole" ? null : `${item.heightM} m up`,
                      item.gainDb - item.feedlineLossDb === 0 ? null : `${(item.gainDb - item.feedlineLossDb).toFixed(1)} dB net`,
                      `${item.minMhz} to ${item.maxMhz} MHz`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {actions(
                  () => setAntenna(antennaDraft(item)),
                  () => setRemoving({ what: "antenna", id: item.id, name: item.name }),
                )}
              </li>
            ))}
          </Rows>
        )}
      </Section>

      <Section title="Generic antennas" description="Always offered in the planner. Each says how it is modelled and what that leaves out.">
        <Rows className="border-y border-border">
          {ANTENNA_PRESETS.map((preset) => (
            <li key={preset.id} className="py-2.5">
              <span className="block text-ink">{preset.name}</span>
              <span className="block max-w-[75ch] text-small text-ink-muted">{preset.modelledAs}</span>
            </li>
          ))}
        </Rows>
      </Section>

      {radio ? <RadioDialog draft={radio} onClose={() => setRadio(null)} /> : null}
      {antenna ? <AntennaDialog draft={antenna} onClose={() => setAntenna(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete this ${removing?.what ?? "profile"}?`}
        description={`“${removing?.name ?? ""}” will be removed. Saved predictions keep the figures they were made with.`}
        confirmLabel="Delete"
        loading={removeRadio.isPending || removeAntenna.isPending}
        onConfirm={() =>
          removing && (removing.what === "radio" ? removeRadio : removeAntenna).mutate(removing.id, { onSuccess: () => setRemoving(null) })
        }
      />
    </div>
  );
}
