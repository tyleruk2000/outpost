/**
 * One power plan: the battery bank, the loads, the inverter, the charging, and the
 * answers worked out from them as the person types. Changes are saved a moment after
 * they are made. The plan can be copied, deleted, and written out as a PDF.
 */
import {
  CHEMISTRIES,
  type ChargeController,
  chemistryById,
  MONTHS,
  POWER_PLAN_MAX_LOADS,
  type PowerLoad,
  type PowerPlan,
  type PowerPlanInput,
  sunSourceText,
  USB_CONVERTER,
} from "@outpost/shared";
import { Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton, Switch } from "@/components/ui/misc";
import { madePdf } from "@/features/library/made/made-pdf";
import { PdfButtons, PdfStatus, useMadePdf } from "@/features/library/made/pdf-actions";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { assumptions, loadDailyWh, radioDuty, simulate, usbEfficiency, workOut } from "./calc/plan";
import { inputOf, useCopyPowerPlan, usePowerPlan, useRemovePowerPlan, useSavePowerPlan } from "./data";
import { FigureSources } from "./device-rows";
import { kindWords } from "./device-text";
import { chartMonth, ESTIMATE, hoursText, planPdf } from "./document";
import { LossFields, PVGIS_URL } from "./energy-calculators";
import { Answer, Answers, Basis, ChoiceField, Fields, figure, NumberField, PercentField } from "./inputs";
import { LoadDialog } from "./load-dialog";
import { SocChart } from "./soc-chart";
import { SunFromWeather } from "./sun-from-weather";

const HOURS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, "0")}:00` }));
const SAVE_AFTER_MS = 700;
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "Power plan, Shack, 16 Nov 2026" */
export const powerPlanTitle = (plan: PowerPlan) => `Power plan, ${plan.name}, ${shortDate.format(new Date(plan.updatedAt))}`;

/** Keeps a draft of the plan and saves it a moment after the last change. */
function useDraft(plan: PowerPlan | undefined) {
  const save = useSavePowerPlan(plan?.id ?? "");
  const [draft, setDraft] = useState<PowerPlanInput | null>(null);
  const pending = useRef<PowerPlanInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (plan && loadedId.current !== plan.id) {
      loadedId.current = plan.id;
      setDraft(inputOf(plan));
    }
  }, [plan]);
  /** Saves what is waiting now; resolves once it is saved (or at once when nothing is waiting). */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // A plan always has a name: one emptied while typing waits for the next.
    if (pending.current?.name.trim()) {
      const input = { ...pending.current, name: pending.current.name.trim() };
      pending.current = null;
      await save.mutateAsync(input).catch(() => undefined);
    }
  }, [save]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);
  const change = (next: PowerPlanInput) => {
    setDraft(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), SAVE_AFTER_MS);
  };
  const state = draft && !draft.name.trim() ? "unnamed" : pending.current || save.isPending ? "saving" : save.isError ? "failed" : "saved";
  return { draft, change, state, flush };
}

export default function PowerPlanPage() {
  const { id = "" } = useParams();
  const plan = usePowerPlan(id);
  const { draft, change, state, flush } = useDraft(plan.data);
  const copy = useCopyPowerPlan();
  const remove = useRemovePowerPlan();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<PowerLoad | "new" | null>(null);
  const [removing, setRemoving] = useState<PowerLoad | null>(null);
  const [deleting, setDeleting] = useState(false);
  const answers = useMemo(() => (draft ? workOut(draft) : null), [draft]);

  // The PDF is made from the plan as saved, so that the file and the library's copy say what is kept.
  const saved = plan.data;
  const pdf = useMemo(() => {
    if (!saved) return null;
    const input = inputOf(saved);
    return madePdf(planPdf(input, workOut(input), new Date(saved.updatedAt)), powerPlanTitle(saved), "Power plan", {
      what: `the power plan “${saved.name}”`,
      path: `/tools/power/plans/${saved.id}`,
    });
  }, [saved]);
  const made = useMadePdf(pdf);

  if (plan.isPending || (plan.data && !draft)) {
    return (
      <Page>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-8 h-40 w-full" />
        <Skeleton className="mt-6 h-64 w-full" />
      </Page>
    );
  }
  if (plan.isError || !draft || !answers || !saved) {
    return (
      <Page>
        <PageHeader title="Power plan" />
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
        <p className="mt-4 text-small">
          <Link to="/tools/power" className="text-primary underline underline-offset-2">
            Power and batteries
          </Link>
        </p>
      </Page>
    );
  }

  const set = (patch: Partial<PowerPlanInput>) => change({ ...draft, ...patch });
  const battery = (patch: Partial<PowerPlanInput["battery"]>) => set({ battery: { ...draft.battery, ...patch } });
  const solar = (patch: Partial<PowerPlanInput["solar"]>) => set({ solar: { ...draft.solar, ...patch } });
  const charger = (patch: Partial<PowerPlanInput["charger"]>) => set({ charger: { ...draft.charger, ...patch } });
  const inverter = (patch: Partial<PowerPlanInput["inverter"]>) => set({ inverter: { ...draft.inverter, ...patch } });
  /** A field left empty keeps the figure it had: a plan always has one. */
  const keep = <T,>(value: number | null, apply: (value: number) => T) => (value === null ? undefined : apply(value));
  const hasAc = draft.loads.some((load) => load.supply === "ac");
  const month = chartMonth(answers);
  const run = simulate(draft, month, 3);
  const floor = 1 - draft.battery.usableDod;
  const over = [
    answers.peak.battery.over ? `more than the ${figure(answers.peak.battery.limit!, 0)} A the battery is rated to give` : null,
    answers.peak.cable.over ? `more than the cable's ${figure(answers.peak.cable.limit!, 0)} A rating` : null,
  ].filter(Boolean);

  return (
    <Page>
      <PageHeader
        title={draft.name.trim() || saved.name}
        description={
          <>
            A power plan.{" "}
            <Link to="/tools/power" className="text-primary underline underline-offset-2">
              All plans and calculators
            </Link>
            <span className="ml-2 text-small" aria-live="polite">
              {state === "unnamed"
                ? "Not saved: give the plan a name."
                : state === "saving"
                  ? "Saving…"
                  : state === "failed"
                    ? "Not saved: the last change could not be saved."
                    : "Saved."}
            </span>
          </>
        }
        actions={
          <>
            <PdfButtons made={made} lead="none" />
            <Button
              loading={copy.isPending}
              onClick={async () => {
                // The copy is made of the plan as saved, so what is waiting is saved first.
                await flush();
                copy.mutate(saved.id, { onSuccess: (plan) => navigate(`/tools/power/plans/${plan.id}`) });
              }}
            >
              <Copy aria-hidden />
              Copy plan
            </Button>
            <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
              Delete plan
            </Button>
          </>
        }
      />
      <PdfStatus made={made} className="-mt-4 mb-6" />

      <Section title="Answers" description={ESTIMATE}>
        <Answers>
          <Answer
            label="Used in a day"
            detail={`An average of ${figure(answers.averageW, 1)} W from the battery${hasAc ? `, the inverter's losses and its own draw (${figure(answers.inverterIdleWh, 0)} Wh) included` : ""}.`}
          >
            {figure(answers.dailyUseWh, 0)} Wh
          </Answer>
          <Answer
            label="Runs with no charging"
            detail={`${figure(answers.bank.deliveredWh, 0)} Wh can be taken out of ${figure(answers.bank.wattHours, 0)} Wh rated.`}
          >
            {hoursText(answers.runtimeHours)}
          </Answer>
          <Answer label="Days of autonomy">{answers.daysOfAutonomy === null ? "No loads yet" : figure(answers.daysOfAutonomy, 1)}</Answer>
          <Answer
            label="Made in a day"
            detail={
              answers.worstMonth === null
                ? "Give the peak sun hours under Charging for the solar's share."
                : `Solar from ${figure(Math.min(...answers.months.filter((item) => item.sunHours !== null).map((item) => item.solarWh)), 0)} Wh in ${MONTHS[answers.worstMonth]} to ${figure(Math.max(...answers.months.map((item) => item.solarWh)), 0)} Wh.${answers.chargerWh > 0 ? ` The charger adds ${figure(answers.chargerWh, 0)} Wh.` : ""}`
            }
          >
            {answers.worstMonth === null && answers.chargerWh === 0
              ? "No charging given"
              : `${figure(answers.months[answers.worstMonth ?? 0]!.solarWh + answers.chargerWh, 0)} Wh in the worst month`}
          </Answer>
          <Answer
            label="Solar to break even"
            detail={
              answers.breakEvenArrayW !== null
                ? `In ${MONTHS[answers.worstMonth!]}, the month with the least sun, with no charger. You have ${figure(draft.solar.arrayWatts, 0)} W.`
                : undefined
            }
          >
            {answers.breakEvenArrayW === null
              ? answers.dailyUseWh === 0
                ? "No loads yet"
                : "Give the peak sun hours"
              : Number.isFinite(answers.breakEvenArrayW)
                ? `${figure(answers.breakEvenArrayW, 0)} W of panels`
                : "No amount: that month has no sun"}
          </Answer>
          <Answer
            label="Peak current from the battery"
            detail={
              answers.peak.battery.limit === null && answers.peak.cable.limit === null
                ? "Not checked: give the battery's rated discharge current and the cable's rating below, from their makers."
                : over.length > 0
                  ? `That is ${over.join(" and ")}.`
                  : "Within the limits given."
            }
          >
            {figure(answers.peak.dischargeA, 1)} A
          </Answer>
          <Answer
            label="Peak charge current"
            detail={
              answers.peak.charge.limit === null
                ? "Not checked: give the battery's rated charge current below."
                : answers.peak.charge.over
                  ? `More than the ${figure(answers.peak.charge.limit, 0)} A the battery is rated to take. A charge controller or charger set to a lower current keeps it within.`
                  : "Within the battery's rated charge current."
            }
          >
            {figure(answers.peak.chargeA, 1)} A
          </Answer>
        </Answers>
        {over.length > 0 ? (
          <Notice tone="warning" className="mt-3">
            The peak current is {over.join(" and ")}. Too much current through a battery or a cable heats it. Share the load out, or use a
            battery and cable rated for it, fused to protect the cable.
          </Notice>
        ) : null}

        <div className="mt-8">
          <h3 className="text-body font-semibold text-ink">
            State of charge over three days{month === null ? ", with no solar" : `, in ${MONTHS[month]}`}, starting full
          </h3>
          <p className="mt-0.5 mb-2 max-w-[70ch] text-small text-ink-muted">
            {month === null
              ? "No sun hours are given, so only the charger, if any, charges it."
              : `${MONTHS[month]} is the month with the fewest peak sun hours given.`}{" "}
            {run.shortWh > 0 ? `At the usable limit, ${figure(run.shortWh, 0)} Wh of the loads would go unmet over the three days.` : ""}
          </p>
          <SocChart
            soc={run.soc}
            floor={floor}
            name={`State of charge, hour by hour over three days${month === null ? "" : ` in ${MONTHS[month]}`}`}
          />
        </div>

        <div className="mt-8">
          <h3 className="text-body font-semibold text-ink">Each month, from full</h3>
          <div className="scroll-quiet mt-2 overflow-x-auto">
            <table className="tabular w-full min-w-[30rem] text-small">
              <caption className="sr-only">
                For each month: peak sun hours, solar a day, the lowest charge in 30 days, and when it runs down
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    Month
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Sun hours
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Solar a day
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Lowest
                  </th>
                  <th scope="col" className="py-1.5 pl-2 font-medium">
                    Runs down
                  </th>
                </tr>
              </thead>
              <tbody>
                {answers.months.map((item) => (
                  <tr key={item.month} className="border-b border-border">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                      {MONTHS[item.month]}
                    </th>
                    <td className="px-2 py-1.5 text-right text-ink">{item.sunHours === null ? "–" : figure(item.sunHours, 2)}</td>
                    <td className="px-2 py-1.5 text-right text-ink">{figure(item.solarWh, 0)} Wh</td>
                    <td className="px-2 py-1.5 text-right text-ink">{Math.round(item.lowest * 100)}%</td>
                    <td className="py-1.5 pl-2 text-ink">
                      {answers.dailyUseWh === 0 ? "–" : item.emptyOnDay === null ? "Keeps up" : `On day ${item.emptyOnDay}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 max-w-[70ch] text-small text-ink-muted">
            Thirty days of each month's sun, starting full. “Lowest” is the lowest charge reached; “runs down” is the day it first reaches
            the usable limit, after which the loads would be cut off.
          </p>
        </div>

        <Basis summary="Every assumption behind these answers">
          <ul className="list-disc space-y-1.5 pl-4">
            {assumptions(draft, answers).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Basis>
      </Section>

      <Section title="Battery bank">
        <Fields>
          <ChoiceField
            label="Chemistry"
            value={draft.battery.chemistry}
            hint="Choosing one sets its voltage, usable share and efficiency to the starting figures; change any of them after."
            onChange={(id) => {
              const facts = chemistryById(id);
              battery({
                chemistry: id,
                volts: Number((facts.cellVolts * facts.cellsPerBlock).toFixed(2)),
                usableDod: facts.usableDod,
                roundTrip: facts.roundTrip,
              });
            }}
            options={CHEMISTRIES.map((item) => ({ value: item.id, label: item.label }))}
          />
          <NumberField
            label="Voltage of one battery"
            unit="V"
            value={draft.battery.volts}
            onChange={(value) => keep(value, (volts) => volts > 0 && battery({ volts }))}
            min={0}
          />
          <NumberField
            label="Capacity of one battery"
            unit="Ah"
            value={draft.battery.ampHours}
            onChange={(value) => keep(value, (ampHours) => ampHours > 0 && battery({ ampHours }))}
            min={0}
          />
          <NumberField
            label="In series"
            value={draft.battery.series}
            onChange={(value) => keep(value, (series) => battery({ series: Math.max(1, Math.round(series)) }))}
            min={1}
            max={100}
          />
          <NumberField
            label="Strings in parallel"
            value={draft.battery.parallel}
            onChange={(value) => keep(value, (parallel) => battery({ parallel: Math.max(1, Math.round(parallel)) }))}
            min={1}
            max={100}
          />
          <PercentField
            label="Usable share"
            value={draft.battery.usableDod}
            onChange={(value) => keep(value, (usableDod) => usableDod > 0 && battery({ usableDod }))}
            hint={chemistryById(draft.battery.chemistry).basis}
          />
          <PercentField
            label="Round-trip efficiency"
            value={draft.battery.roundTrip}
            onChange={(value) => keep(value, (roundTrip) => roundTrip > 0 && battery({ roundTrip }))}
          />
          <NumberField
            label="Rated discharge current, whole bank"
            unit="A"
            value={draft.battery.maxDischargeA}
            onChange={(maxDischargeA) => battery({ maxDischargeA: maxDischargeA && maxDischargeA > 0 ? maxDischargeA : null })}
            min={0}
            hint="From the maker's data: for lithium, the BMS's continuous rating. Outpost does not guess it."
          />
          <NumberField
            label="Rated charge current, whole bank"
            unit="A"
            value={draft.battery.maxChargeA}
            onChange={(maxChargeA) => battery({ maxChargeA: maxChargeA && maxChargeA > 0 ? maxChargeA : null })}
            min={0}
            hint="From the maker's data."
          />
        </Fields>
        <p className="tabular mt-3 text-small text-ink">
          {figure(answers.bank.volts, 1)} V, {figure(answers.bank.ampHours, 0)} Ah, {figure(answers.bank.wattHours, 0)} Wh rated, of which{" "}
          {figure(answers.bank.usableWh, 0)} Wh is used.
        </p>
        {draft.battery.series * draft.battery.parallel > 1 ? (
          <p className="mt-1 max-w-[70ch] text-small text-ink-muted">
            Batteries joined together should be the same model, capacity and age, at the same charge when connected, and allowed by their
            maker in series or parallel; lithium needs a BMS.
          </p>
        ) : null}
      </Section>

      <Section
        title="Loads"
        description="Everything that draws from the battery."
        actions={
          <Button disabled={draft.loads.length >= POWER_PLAN_MAX_LOADS} onClick={() => setEditing("new")}>
            Add a load
          </Button>
        }
      >
        {draft.loads.length === 0 ? (
          <p className="rounded-panel border border-border px-4 py-6 text-small text-ink-muted">
            No loads yet. Add the first: the Raspberry Pi Outpost runs on, a radio, lights, a phone charger.
          </p>
        ) : (
          <Rows>
            {draft.loads.map((load) => (
              <li key={load.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-ink">
                      {load.name}
                      {load.quantity > 1 ? ` × ${load.quantity}` : ""}
                    </span>
                    <span className="tabular block text-small text-ink-muted">
                      {load.kind === "device"
                        ? `${figure(load.watts, 1)} W for ${figure(load.hoursPerDay, 1)} h`
                        : load.kind === "charge"
                          ? `${figure(load.chargesPerDay, 1)} ${load.chargesPerDay === 1 ? "charge" : "charges"} a day of ${figure(load.wattHours, 1)} Wh`
                          : `${figure(load.transmitW, 1)} W transmitting, ${figure(load.receiveW, 1)} W receiving, ${figure(load.onAirHours, 1)} h on the air, duty ${figure(radioDuty(load) * 100, 1)}%`}{" "}
                      · {load.supply === "ac" ? "AC, through the inverter" : load.supply === "usb" ? "USB, through the converter" : "DC"} ·{" "}
                      {figure(loadDailyWh(load), 0)} Wh a day
                    </span>
                  </div>
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => setEditing(load)} aria-label={`Change ${load.name}`}>
                      Change
                    </Button>
                    <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(load)} aria-label={`Remove ${load.name}`}>
                      Remove
                    </Button>
                  </span>
                </div>
                {load.origin ? <LoadOrigin load={load} /> : null}
              </li>
            ))}
          </Rows>
        )}
      </Section>

      {draft.loads.some((load) => load.supply === "usb") ? (
        <Section title="USB converter" description="USB loads are supplied through it, from the battery.">
          <Fields>
            <PercentField
              label="Efficiency"
              value={usbEfficiency(draft)}
              onChange={(value) => keep(value, (efficiency) => efficiency > 0 && set({ usb: { efficiency } }))}
              hint="From its data sheet, or the car charger's."
            />
          </Fields>
          <p className="mt-2 text-small text-ink-muted">{USB_CONVERTER.basis}</p>
        </Section>
      ) : null}

      <Section title="Inverter" description={hasAc ? "AC loads go through it." : "Used only by AC loads; this plan has none."}>
        <Fields>
          <PercentField
            label="Efficiency under load"
            value={draft.inverter.efficiency}
            onChange={(value) => keep(value, (efficiency) => efficiency > 0 && inverter({ efficiency }))}
            hint="From its data sheet."
          />
          <NumberField
            label="Its own draw when on"
            unit="W"
            value={draft.inverter.idleW}
            onChange={(value) => keep(value, (idleW) => inverter({ idleW }))}
            min={0}
            hint="The data sheet's “no load” or “zero load” power."
          />
          <NumberField
            label="Hours a day switched on"
            unit="h"
            value={draft.inverter.hoursOn}
            onChange={(value) => keep(value, (hoursOn) => inverter({ hoursOn }))}
            min={0}
            max={24}
          />
        </Fields>
        <p className="mt-2 text-small text-ink-muted">88% and 8 W are Outpost's starting figures, not a measured inverter: use yours.</p>
      </Section>

      <Section title="Charging">
        <h3 className="mb-3 text-body font-semibold text-ink">Solar</h3>
        <Fields>
          <NumberField
            label="Panels"
            unit="W"
            value={draft.solar.arrayWatts}
            onChange={(value) => keep(value, (arrayWatts) => solar({ arrayWatts }))}
            min={0}
            hint="The sum of the panels' rated watts. Nought for none."
          />
          <ChoiceField<ChargeController>
            label="Charge controller"
            value={draft.solar.controller}
            onChange={(controller) => solar({ controller })}
            options={[
              { value: "mppt", label: "MPPT" },
              { value: "pwm", label: "PWM" },
            ]}
          />
          {draft.solar.controller === "mppt" ? (
            <PercentField
              label="Controller efficiency"
              value={draft.solar.mpptEfficiency}
              onChange={(value) => keep(value, (mpptEfficiency) => mpptEfficiency > 0 && solar({ mpptEfficiency }))}
              hint="From its data sheet. 95% is a starting figure."
            />
          ) : (
            <>
              <NumberField
                label="Battery voltage while charging"
                unit="V"
                value={draft.solar.pwmBatteryVolts}
                onChange={(value) => keep(value, (pwmBatteryVolts) => pwmBatteryVolts > 0 && solar({ pwmBatteryVolts }))}
                min={0}
              />
              <NumberField
                label="Panel voltage at maximum power (Vmp)"
                unit="V"
                value={draft.solar.pwmPanelVmp}
                onChange={(value) => keep(value, (pwmPanelVmp) => pwmPanelVmp > 0 && solar({ pwmPanelVmp }))}
                min={0}
                hint="On the panel's label."
              />
            </>
          )}
        </Fields>
        <h4 className="mt-5 mb-1 text-small font-semibold text-ink">Peak sun hours, by month</h4>
        <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
          The day's sun on the panels' plane, kWh/m², for your place and tilt. Outpost cannot work these out without weather records; PVGIS,
          from the European Commission's Joint Research Centre, gives them for anywhere in Europe, Africa and much of Asia and the Americas
          (
          <a href={PVGIS_URL} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            re.jrc.ec.europa.eu/pvg_tools
          </a>
          , needs the internet: “Monthly data”, in-plane irradiation, divided by the days in the month). Leave a month empty to leave it
          out.
        </p>
        <SunFromWeather
          sunHours={draft.solar.sunHours}
          source={draft.solar.sunHoursSource}
          onFill={(sunHours, sunHoursSource) => solar({ sunHours, sunHoursSource })}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {MONTHS.map((name, index) => (
            <NumberField
              key={name}
              label={name}
              unit="h"
              min={0}
              max={12}
              value={draft.solar.sunHours[index] ?? null}
              onChange={(value) =>
                solar({
                  sunHours: draft.solar.sunHours.map((item, at) => (at === index ? value : item)),
                  // Typed over: the figures are no longer only PVGIS's, and the plan says so.
                  ...(draft.solar.sunHoursSource ? { sunHoursSource: { ...draft.solar.sunHoursSource, edited: true } } : {}),
                })
              }
            />
          ))}
        </div>
        {draft.solar.sunHoursSource ? (
          <p className="mt-2 max-w-[70ch] text-small text-ink-muted">{sunSourceText(draft.solar.sunHoursSource)}</p>
        ) : null}
        <Basis summary="Losses (PVWatts' defaults, change any)">
          <LossFields losses={draft.solar.losses} onChange={(losses) => solar({ losses })} />
          <p>Combined as PVWatts does, 1 − Π(1 − lossᵢ): {figure(answers.loss * 100, 2)}% in all.</p>
        </Basis>

        <div className="mt-6 flex items-center gap-3">
          <Switch id="power-charger" checked={draft.charger.enabled} onCheckedChange={(enabled) => charger({ enabled })} />
          <label htmlFor="power-charger" className="text-body font-semibold text-ink">
            A generator or mains charger as well
          </label>
        </div>
        {draft.charger.enabled ? (
          <Fields className="mt-3">
            <Field label="Name">
              {(ids) => (
                <Input {...ids} value={draft.charger.name} maxLength={80} onChange={(event) => charger({ name: event.target.value })} />
              )}
            </Field>
            <NumberField
              label="Into the battery"
              unit="W"
              value={draft.charger.watts}
              onChange={(value) => keep(value, (watts) => charger({ watts }))}
              min={0}
              hint="The charger's output current × the charging voltage: 20 A at 14 V is 280 W."
            />
            <NumberField
              label="Hours a day"
              unit="h"
              value={draft.charger.hoursPerDay}
              onChange={(value) => keep(value, (hoursPerDay) => charger({ hoursPerDay }))}
              min={0}
              max={24}
            />
            <ChoiceField
              label="From"
              value={String(draft.charger.startHour)}
              onChange={(value) => charger({ startHour: Number(value) })}
              options={HOURS}
            />
          </Fields>
        ) : null}
      </Section>

      <Section title="Wiring" description="The cable between the battery and the loads.">
        <Fields>
          <NumberField
            label="Cable's rated current"
            unit="A"
            value={draft.cableRatingA}
            onChange={(cableRatingA) => set({ cableRatingA: cableRatingA && cableRatingA > 0 ? cableRatingA : null })}
            min={0}
            hint="From its maker, or the wiring regulations you work to. The cable calculator above the plans gives one rule's figure, as guidance."
          />
        </Fields>
      </Section>

      <Section title="Name and notes">
        <div className="grid gap-4">
          <Field label="Name">
            {(ids) => <Input {...ids} value={draft.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} />}
          </Field>
          <Field label="Notes" hint="Printed with the plan.">
            {(ids) => <Textarea {...ids} value={draft.notes} maxLength={20_000} onChange={(event) => set({ notes: event.target.value })} />}
          </Field>
          <p className="text-small text-ink-muted">
            To link to this plan from a note, put this address in the note's link field:{" "}
            <span className="font-mono break-all text-ink select-all">/tools/power/plans/{saved.id}</span>
          </p>
        </div>
      </Section>

      {editing ? (
        <LoadDialog
          load={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(load) => {
            set({ loads: editing === "new" ? [...draft.loads, load] : draft.loads.map((item) => (item.id === load.id ? load : item)) });
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this load"}?`}
        description="It is taken out of this plan."
        confirmLabel="Remove load"
        onConfirm={() => {
          if (removing) set({ loads: draft.loads.filter((item) => item.id !== removing.id) });
          setRemoving(null);
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${saved.name}?`}
        description={`The plan and its ${plural(draft.loads.length, "load")} are deleted. A PDF of it already added to the library stays there.`}
        confirmLabel="Delete plan"
        onConfirm={() => remove.mutate(saved.id, { onSuccess: () => navigate("/tools/power") })}
      />
      {remove.isError ? <Notice tone="danger">{errorMessage(remove.error)}</Notice> : null}
    </Page>
  );
}

/** Where a load's figures came from: a few words, and the sources behind one disclosure. */
function LoadOrigin({ load }: { load: PowerLoad }) {
  const words = kindWords(load);
  return (
    <div className="mt-1 text-small text-ink-muted">
      {load.origin?.library === "own" ? `From your own device “${load.origin.name}”` : `From the library: ${load.origin?.name}`}
      {words ? `, ${words}` : ""}.
      <FigureSources load={load} />
    </div>
  );
}
