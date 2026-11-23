/**
 * The quick battery runtime calculator built from things: devices from the library or a
 * person's own, each with how it is used, and the answers a person in a power cut wants,
 * each with its working: how long the battery runs what runs, how many charges it holds
 * besides or instead, what it does over so many days, which thing uses most, and the
 * battery that so many days would need. Nothing here is kept unless the person makes it
 * a plan.
 */
import { newPowerPlan, type PowerLoad, type PowerPlanInput, USB_CHARGING, USB_CONVERTER } from "@outpost/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { EmptyState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { localId } from "@/lib/utils";
import { loadFromEntry, loadFromOwn, type MixAnswers, type MixSetting, workOutMix } from "./calc/devices";
import { useCreatePowerPlan } from "./data";
import { DevicePickerDialog, type PickerChoice } from "./device-picker";
import { DeviceRow } from "./device-rows";
import { MAKER_SENTENCE, mixSentences, TRADE_MARKS } from "./device-text";
import { Answer, Answers, Basis, Fields, figure, NumberField, PercentField } from "./inputs";

/** The starting figure for an inverter, as a plan's: Outpost's, not a source. */
export const INVERTER_START = 0.88;

/** Adds a chosen device to the list: one more of it when it is already there unchanged, otherwise a new row. */
export function addChoice(loads: PowerLoad[], choice: PickerChoice): PowerLoad[] {
  const made =
    choice.kind === "common"
      ? loadFromEntry(choice.entry, localId())
      : choice.kind === "own"
        ? loadFromOwn(choice.device, localId())
        : null;
  if (!made) return loads;
  const same = loads.find(
    (load) =>
      load.origin &&
      made.origin &&
      load.origin.library === made.origin.library &&
      load.origin.id === made.origin.id &&
      load.origin.state === made.origin.state,
  );
  if (same) return loads.map((load) => (load === same ? { ...load, quantity: load.quantity + 1 } : load));
  return [...loads, made];
}

export function DeviceMix({
  battery,
  onSolar,
}: {
  /** The battery as typed above: rated watt-hours, volts and the usable share; null while something is missing. */
  battery: { wattHours: number; volts: number; usable: number } | null;
  /** Carries the day's energy to the solar calculator. */
  onSolar?: (dailyWh: number) => void;
}) {
  const [loads, setLoads] = useState<PowerLoad[]>([]);
  const [picking, setPicking] = useState(false);
  const [entryNote, setEntryNote] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(3);
  const [inverter, setInverter] = useState<number | null>(INVERTER_START);
  const [usb, setUsb] = useState<number | null>(USB_CONVERTER.share);
  const [charging, setCharging] = useState<number | null>(USB_CHARGING.share);
  const [planning, setPlanning] = useState(false);
  const hasAc = loads.some((load) => load.supply === "ac");
  const hasUsb = loads.some((load) => load.supply === "usb");
  const hasCharge = loads.some((load) => load.kind === "charge");
  /** One charging efficiency for everything charged here; a plan keeps one for each. */
  const withCharging = (list: PowerLoad[], share: number | null) =>
    share && share > 0 ? list.map((load) => (load.kind === "charge" ? { ...load, chargeEfficiency: share } : load)) : list;
  const setting: MixSetting | null = battery && days !== null && inverter && usb ? { ...battery, inverter, usb, days } : null;
  const answers = setting && loads.length > 0 && charging ? workOutMix(withCharging(loads, charging), setting) : null;

  const pick = (choice: PickerChoice) => {
    if (choice.kind === "common" && (choice.entry.kind === "label" || choice.entry.kind === "guide")) {
      // Nothing to add: there is no figure. Its words say what to do instead.
      setEntryNote(`${choice.entry.name}: ${choice.entry.kind === "guide" ? choice.entry.text : choice.entry.hint}`);
      setPicking(false);
      return;
    }
    setEntryNote(null);
    setLoads((current) => withCharging(addChoice(current, choice), charging));
    setPicking(false);
  };

  return (
    <div className="grid gap-4">
      {loads.length === 0 ? (
        <EmptyState
          title="Nothing to run yet"
          compact
          level={3}
          seed={5}
          action={
            <Button onClick={() => setPicking(true)}>
              <Plus aria-hidden />
              Add a device
            </Button>
          }
        >
          Add what the battery should run or charge: a Raspberry Pi, the phones, a radio, a router, a lamp. Each comes with its maker's
          figure and where it was published.
        </EmptyState>
      ) : (
        <ul aria-label="What it runs and charges" className="divide-y divide-border border-y border-border">
          {loads.map((load) => (
            <DeviceRow
              key={load.id}
              load={load}
              onChange={(next) => setLoads((current) => current.map((item) => (item.id === load.id ? next : item)))}
              onRemove={() => setLoads((current) => current.filter((item) => item.id !== load.id))}
            />
          ))}
        </ul>
      )}
      {loads.length === 0 ? null : (
        <div>
          <Button onClick={() => setPicking(true)}>
            <Plus aria-hidden />
            Add a device
          </Button>
        </div>
      )}
      {entryNote ? <Notice>{entryNote}</Notice> : null}

      <Fields>
        <NumberField label="For how many days" unit="days" value={days} onChange={setDays} min={0} max={365} />
        {hasCharge ? (
          <PercentField
            label="Charging efficiency"
            value={charging}
            onChange={setCharging}
            hint={`The share of the energy from the socket that ends up in a battery being charged. ${USB_CHARGING.basis}`}
          />
        ) : null}
        {hasUsb ? (
          <PercentField
            label="USB converter efficiency"
            value={usb}
            onChange={setUsb}
            hint={`From the battery to USB (a 12 V “car charger”). ${USB_CONVERTER.basis}`}
          />
        ) : null}
        {hasAc ? (
          <PercentField
            label="Inverter efficiency"
            value={inverter}
            onChange={setInverter}
            hint="From its data sheet. 88% is Outpost's starting figure, as in a power plan, not a measured inverter."
          />
        ) : null}
      </Fields>

      {loads.length > 0 ? (
        <Answers missing={answers ? null : "Give the capacity, the voltage, the usable share and the days to see the answers."}>
          {answers ? <MixAnswerRows answers={answers} setting={setting!} /> : null}
        </Answers>
      ) : null}

      {answers ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setPlanning(true)}>
            Make this a plan
          </Button>
          {onSolar ? <Button onClick={() => onSolar(answers.dailyWh)}>Solar to keep up with this</Button> : null}
        </div>
      ) : null}

      <Basis>
        <p>
          Can be taken out = capacity (Wh) × usable share. Each thing uses, from the battery, its draw × hours a day (a radio: duty ×
          transmit + (1 − duty) × receive while on, where duty is the minutes an hour transmitting ÷ 60 × the mode's factor), or its
          battery's watt-hours × charges a day ÷ the charging efficiency; ÷ the USB converter's efficiency for a USB device, and ÷ the
          inverter's for a mains one.
        </p>
        <p>
          Runs what runs = can be taken out ÷ what runs uses in a day. Charges instead = can be taken out ÷ one charge from the battery;
          besides = what is left after running the rest for the days given ÷ one charge. Battery needed = a day's use × days ÷ usable share.
        </p>
        <p>
          Charging: {USB_CHARGING.basis} The converter: {USB_CONVERTER.basis}
        </p>
        <p>
          Where a figure is the most a device should draw (a supply's rating), the battery runs it at least as long as said: the answers say
          “at least”. Left out: the battery's own losses (a power plan counts them), the cold, its age, and a phone or laptop drawing less
          as it fills.
        </p>
        <p>{MAKER_SENTENCE}</p>
        <p>{TRADE_MARKS}</p>
      </Basis>

      {picking ? <DevicePickerDialog onPick={pick} onClose={() => setPicking(false)} /> : null}
      {planning && setting ? (
        <MakePlanDialog loads={withCharging(loads, charging)} setting={setting} onClose={() => setPlanning(false)} />
      ) : null}
    </div>
  );
}

function MixAnswerRows({ answers, setting }: { answers: MixAnswers; setting: MixSetting }) {
  const words = mixSentences(answers, setting);
  return (
    <>
      {answers.atLeast ? (
        <div className="py-2">
          <Notice tone="info" title="At least">
            {words.atLeast}
          </Notice>
        </div>
      ) : null}
      {words.runs ? (
        <Answer label="Runs what runs" detail={words.runs.detail}>
          {words.runs.figure}
        </Answer>
      ) : null}
      {words.charges.map((line) => (
        <Answer key={line.label} label={line.label} detail={line.detail}>
          {line.figure}
        </Answer>
      ))}
      <Answer label={`For ${figure(setting.days, 1)} ${setting.days === 1 ? "day" : "days"}`} detail={words.over.detail}>
        {words.over.figure}
      </Answer>
      {words.all ? (
        <Answer label="Everything as set" detail={words.all.detail}>
          {words.all.figure}
        </Answer>
      ) : null}
      <div className="grid gap-x-4 gap-y-1 py-2 sm:grid-cols-[12rem_1fr]">
        <dt className="text-small text-ink-muted">Uses most</dt>
        <dd className="min-w-0">
          <UsesMost answers={answers} />
        </dd>
      </div>
      <Answer label="Battery needed" detail={words.need.detail}>
        {words.need.figure}
      </Answer>
    </>
  );
}

/**
 * Which thing uses most: the same figures as a table and as bars on one axis (watt-hours
 * a day from the battery), each labelled directly. The bars are drawn in the table's own
 * cells, so the chart and the figures cannot disagree.
 */
export function UsesMost({ answers }: { answers: MixAnswers }) {
  const most = Math.max(...answers.ranked.map((item) => item.fromBatteryWh), 0);
  return (
    <Table label="Watt-hours a day from the battery, most first" className="tabular">
      <thead className="sr-only">
        <tr>
          <th scope="col">Device</th>
          <th scope="col">Watt-hours a day</th>
          <th scope="col">Share</th>
        </tr>
      </thead>
      <tbody>
        {answers.ranked.map((item) => (
          <tr key={item.load.id} className="align-top">
            <th scope="row" className="w-full py-1 pr-3 text-left font-normal text-ink">
              <span className="block">
                {item.load.quantity > 1 ? `${item.load.quantity} × ` : ""}
                {item.load.name}
              </span>
              <span aria-hidden className="mt-1 block h-2 rounded-full bg-surface-strong">
                <span
                  className="block h-2 rounded-full bg-chart-1"
                  style={{ width: `${most > 0 ? Math.max(1, (item.fromBatteryWh / most) * 100) : 0}%` }}
                />
              </span>
            </th>
            <td className="py-1 pr-2 text-right whitespace-nowrap text-ink">
              {figure(item.fromBatteryWh, item.fromBatteryWh < 10 ? 1 : 0)} Wh
            </td>
            <td className="py-1 text-right whitespace-nowrap text-ink-muted">{figure(item.share * 100, 0)}%</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** "Make this a plan": a name, then a plan holding this battery and these devices, with where their figures came from. */
function MakePlanDialog({ loads, setting, onClose }: { loads: PowerLoad[]; setting: MixSetting; onClose: () => void }) {
  const [name, setName] = useState("Power cut");
  const create = useCreatePowerPlan();
  const navigate = useNavigate();
  const submit = () => {
    if (!name.trim()) return;
    create.mutate(planFromMix(name.trim(), loads, setting), { onSuccess: (plan) => navigate(`/tools/power/plans/${plan.id}`) });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Make this a plan"
        description="A power plan with this battery and these devices, kept on this Outpost, where solar and charging can be added."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody className="grid gap-3">
            <Field label="Name">
              {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />}
            </Field>
            <p className="text-small text-ink-muted">
              The plan takes the battery as lithium iron phosphate unless changed there, and counts its round-trip loss, so its runtime is a
              little shorter than here.
            </p>
            {create.isError ? <Notice tone="danger">{errorMessage(create.error)}</Notice> : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
              Create plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A plan from the quick calculator: its battery, its devices with their records, and its converter and inverter. */
export function planFromMix(name: string, loads: PowerLoad[], setting: MixSetting): PowerPlanInput {
  const plan = newPowerPlan(name);
  return {
    ...plan,
    battery: {
      ...plan.battery,
      volts: setting.volts,
      ampHours: Number((setting.wattHours / setting.volts).toFixed(2)),
      usableDod: setting.usable,
    },
    loads: loads.map((load) => ({ ...load, id: localId() })),
    inverter: { ...plan.inverter, efficiency: setting.inverter },
    usb: { efficiency: setting.usb },
  };
}
