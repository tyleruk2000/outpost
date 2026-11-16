/**
 * Choosing a device: the library of common devices (bundled, with their makers'
 * figures), the person's own devices (kept on the server), and whatever else the place
 * it is used from offers (the radios saved for the HF planner, typing the figures by
 * hand). One search box over all of it, then the groups, as plain lists: one press on a
 * name picks it.
 */
import { COMMON_DEVICES, type CommonDevice, DEVICE_GROUPS, type OwnDevice, type OwnDeviceInput } from "@outpost/shared";
import { Plus, Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useOwnDevices, useRemoveOwnDevice, useSaveOwnDevice } from "./data";
import { entrySummary, ownSummary } from "./device-text";
import { ChoiceField, Fields, NumberField } from "./inputs";

export type PickerChoice = { kind: "common"; entry: CommonDevice } | { kind: "own"; device: OwnDevice } | { kind: "extra"; id: string };

export interface PickerExtra {
  id: string;
  label: string;
  description?: string;
}

/** Lower case, without accents or punctuation, for matching what is typed. */
const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Every word typed is somewhere in the name, the other names, or the group. */
export function matches(entry: CommonDevice, query: string): boolean {
  const words = plain(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const group = DEVICE_GROUPS.find((item) => item.id === entry.group)?.label ?? "";
  const haystack = plain([entry.name, ...(entry.aliases ?? []), group].join(" "));
  // Each word matched at the start of a word in the haystack, so "pi" finds "Raspberry Pi" but not "Spindle".
  return words.every((word) => haystack.split(" ").some((part) => part.startsWith(word)) || haystack.replace(/ /g, "").includes(word));
}

function PickRow({ label, detail, onPick, aside }: { label: ReactNode; detail?: ReactNode; onPick: () => void; aside?: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPick}
        className="group min-h-11 min-w-0 flex-1 rounded-control py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="block text-body text-ink group-hover:text-primary">{label}</span>
        {detail ? (
          <>
            <span className="sr-only">: </span>
            <span className="tabular block text-small text-ink-muted">{detail}</span>
          </>
        ) : null}
      </button>
      {aside}
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1 text-small font-semibold text-ink-muted">{title}</h3>
      <ul className="divide-y divide-border border-y border-border">{children}</ul>
    </section>
  );
}

/** The search box and the lists. Used inside a dialog: by the quick calculator, and by a plan's "Add a load". */
export function DevicePicker({
  onPick,
  extras = [],
  extrasTitle = "Other ways to start",
}: {
  onPick: (choice: PickerChoice) => void;
  extras?: PickerExtra[];
  extrasTitle?: string;
}) {
  const [query, setQuery] = useState("");
  const own = useOwnDevices();
  const [editing, setEditing] = useState<OwnDevice | "new" | null>(null);
  const shown = useMemo(() => COMMON_DEVICES.filter((entry) => matches(entry, query)), [query]);
  const ownShown = (own.data ?? []).filter((device) => {
    const words = plain(query).split(" ").filter(Boolean);
    return words.every((word) => plain(`${device.name} ${device.note}`).includes(word));
  });
  const extrasShown = extras.filter((extra) => plain(extra.label).includes(plain(query)));
  const nothing = shown.length === 0 && ownShown.length === 0 && extrasShown.length === 0;
  return (
    <div className="grid gap-5">
      <Field label="Find a device" hint="A name, a maker or a kind of thing: “Pi 5”, “iPhone”, “handheld”, “lamp”.">
        {(ids) => (
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-ink-muted" />
            <Input {...ids} type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
          </div>
        )}
      </Field>

      {extrasShown.length > 0 ? (
        <Group title={extrasTitle}>
          {extrasShown.map((extra) => (
            <PickRow key={extra.id} label={extra.label} detail={extra.description} onPick={() => onPick({ kind: "extra", id: extra.id })} />
          ))}
        </Group>
      ) : null}

      {own.isPending ? (
        <Skeleton className="h-11 w-full" />
      ) : own.isError ? (
        <Notice tone="warning">Your own devices could not be loaded: {errorMessage(own.error)} The library below still works.</Notice>
      ) : ownShown.length > 0 ? (
        <Group title="Your own devices">
          {ownShown.map((device) => (
            <PickRow
              key={device.id}
              label={device.name}
              detail={`${ownSummary(device)}${device.note ? ` · ${device.note}` : ""}`}
              onPick={() => onPick({ kind: "own", device })}
              aside={
                <Button size="md" variant="ghost" onClick={() => setEditing(device)} aria-label={`Change ${device.name}`}>
                  Change
                </Button>
              }
            />
          ))}
        </Group>
      ) : null}

      {DEVICE_GROUPS.map((group) => {
        const entries = shown.filter((entry) => entry.group === group.id);
        if (entries.length === 0) return null;
        return (
          <Group key={group.id} title={group.label}>
            {entries.map((entry) => (
              <PickRow key={entry.id} label={entry.name} detail={entrySummary(entry)} onPick={() => onPick({ kind: "common", entry })} />
            ))}
          </Group>
        );
      })}

      {nothing ? (
        <p className="text-small text-ink-muted">
          Nothing matches “{query.trim()}”. Add it as a device of your own, with the figure from its label, and it will be here next time.
        </p>
      ) : null}

      <div>
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          Add a device of your own
        </Button>
        <p className="mt-1.5 text-small text-ink-muted">Kept on this Outpost, so that your own radio or lamp is one press next time.</p>
      </div>

      {editing ? (
        <OwnDeviceDialog
          device={editing === "new" ? null : editing}
          start={editing === "new" ? query.trim() : ""}
          onClose={() => setEditing(null)}
          onSaved={(device, created) => {
            setEditing(null);
            if (created) onPick({ kind: "own", device });
          }}
        />
      ) : null}
    </div>
  );
}

/** The picker in a dialog of its own, for the quick calculator. */
export function DevicePickerDialog({ onPick, onClose }: { onPick: (choice: PickerChoice) => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Add a device" description="Figures from the makers, each with its source; or one of your own." size="lg">
        <DialogBody>
          <DevicePicker onPick={onPick} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A device of a person's own ──────────────────────────────────────────────

const KINDS = [
  { value: "run", label: "Runs" },
  { value: "charge", label: "Is charged" },
  { value: "radio", label: "Radio" },
] as const;

const SUPPLIES = [
  { value: "dc", label: "From the battery (12 V or the like)" },
  { value: "usb", label: "Over USB, through a converter" },
  { value: "ac", label: "From a mains socket, through an inverter" },
] as const;

export function OwnDeviceDialog({
  device,
  start = "",
  onClose,
  onSaved,
}: {
  device: OwnDevice | null;
  start?: string;
  onClose: () => void;
  onSaved: (device: OwnDevice, created: boolean) => void;
}) {
  const [draft, setDraft] = useState<OwnDeviceInput>(
    device ?? {
      name: start,
      kind: "run",
      supply: "dc",
      watts: null,
      wattHours: null,
      receiveW: null,
      transmitW: null,
      standbyW: null,
      note: "",
    },
  );
  const [by, setBy] = useState<"wh" | "mah">("wh");
  const [mah, setMah] = useState<number | null>(null);
  const [volts, setVolts] = useState<number | null>(3.7);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const save = useSaveOwnDevice();
  const remove = useRemoveOwnDevice();
  const set = (patch: Partial<OwnDeviceInput>) => {
    setProblem(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const wattHours = by === "wh" ? draft.wattHours : mah !== null && volts !== null ? (mah / 1000) * volts : null;
  const submit = () => {
    const input = { ...draft, name: draft.name.trim(), wattHours };
    const missing = !input.name
      ? "Give it a name."
      : input.kind === "run" && input.watts === null
        ? "Give its power in watts."
        : input.kind === "charge" && input.wattHours === null
          ? "Give its battery's watt-hours, or its mAh and volts."
          : input.kind === "radio" && (input.receiveW === null || input.transmitW === null)
            ? "Give the power it draws receiving and transmitting."
            : null;
    if (missing) return setProblem(missing);
    save.mutate({ id: device?.id ?? null, input }, { onSuccess: (saved) => onSaved(saved, device === null) });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={device ? `Change ${device.name}` : "A device of your own"}
        description="Its figure from its label, its manual or a meter. Kept on this Outpost."
      >
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody className="grid gap-4">
            <Field label="Name">
              {(ids) => <Input {...ids} value={draft.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} />}
            </Field>
            <Segmented label="It" value={draft.kind} onChange={(kind) => set({ kind })} options={[...KINDS]} />
            <ChoiceField label="Supplied" value={draft.supply} onChange={(supply) => set({ supply })} options={[...SUPPLIES]} />
            {draft.kind === "run" ? (
              <NumberField
                label="Power while on"
                unit="W"
                value={draft.watts}
                onChange={(watts) => set({ watts })}
                min={0}
                hint="The label gives the most it draws: volts × amps. A plug-in power meter gives what it draws in use."
              />
            ) : draft.kind === "charge" ? (
              <>
                <Segmented
                  label="Battery given as"
                  value={by}
                  onChange={setBy}
                  options={[
                    { value: "wh", label: "Watt-hours" },
                    { value: "mah", label: "mAh and volts" },
                  ]}
                />
                {by === "wh" ? (
                  <NumberField label="Battery" unit="Wh" value={draft.wattHours} onChange={(value) => set({ wattHours: value })} min={0} />
                ) : (
                  <Fields>
                    <NumberField label="Battery" unit="mAh" value={mah} onChange={setMah} min={0} />
                    <NumberField
                      label="At"
                      unit="V"
                      value={volts}
                      onChange={setVolts}
                      min={0}
                      hint="The nominal voltage on the battery or its label. A power bank's mAh are usually at its cells' 3.6 or 3.7 V: its label says."
                    />
                  </Fields>
                )}
              </>
            ) : (
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
              </Fields>
            )}
            <Field label="Note" hint="Where the figure came from, for next time.">
              {(ids) => (
                <Textarea {...ids} value={draft.note} maxLength={2000} rows={2} onChange={(event) => set({ note: event.target.value })} />
              )}
            </Field>
            {problem ? <Notice tone="danger">{problem}</Notice> : null}
            {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
          </DialogBody>
          <DialogFooter>
            {device ? (
              <Button variant="danger-ghost" className="mr-auto" onClick={() => setRemoving(true)}>
                Remove
              </Button>
            ) : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {device ? "Save device" : "Keep device"}
            </Button>
          </DialogFooter>
        </form>
        {device ? (
          <ConfirmDialog
            open={removing}
            onOpenChange={setRemoving}
            title={`Remove ${device.name}?`}
            description="It goes from your own devices. Loads already made from it keep their figures."
            confirmLabel="Remove device"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(device.id, { onSuccess: onClose })}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
