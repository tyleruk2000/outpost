/**
 * The planner: say where the two stations are and what they have, and read what the
 * engine predicts for the day.
 */
import {
  ANTENNA_PRESETS,
  antennaModelLabel,
  bandOf,
  HF_BANDS,
  isApproximatedAntenna,
  type ModeId,
  modeById,
  NOISE_ENVIRONMENTS,
  type NoiseEnvironment,
  OPERATING_MODES,
  type PredictionResult,
} from "@outpost/shared";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { EmptyState, Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import {
  AS_SAVED,
  antennaOf,
  antennaSummary,
  emptyForm,
  exampleForm,
  openSaved,
  type PlannerForm,
  rememberedForm,
  rememberForm,
  requestOf,
  useEngines,
  usePlaces,
  usePredict,
  useProfiles,
  wireHint,
  useRemoveSaved,
  useSaved,
  useSavePrediction,
} from "./data";
import { PlaceInput } from "./place-field";
import { bestHour, Results } from "./results";

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The saved prediction on screen: asked again as it was saved, or the reason it was not asked. */
type Opened = { name: string; date: string; antennas: string[] } | { name: string; problem: string };

export function Planner() {
  const [form, setForm] = useState<PlannerForm>(rememberedForm);
  const [problem, setProblem] = useState<{ field: keyof PlannerForm; problem: string } | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [hour, setHour] = useState(12);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const replyId = useId();
  const engines = useEngines();
  const profiles = useProfiles();
  const places = usePlaces();
  const saved = useSaved();
  const predict = usePredict();
  const savePrediction = useSavePrediction();
  const removeSaved = useRemoveSaved();

  useEffect(() => rememberForm(form), [form]);
  const set = <K extends keyof PlannerForm>(key: K, value: PlannerForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (problem?.field === key) setProblem(null);
  };

  const antennas = profiles.data?.antennas ?? [];
  const radios = profiles.data?.radios ?? [];
  const engine = engines.data?.[0];

  const run = (next: PlannerForm = form) => {
    const built = requestOf(next, antennas);
    if ("problem" in built) {
      setProblem(built);
      return;
    }
    setProblem(null);
    predict.mutate(built.request, {
      onSuccess: (answer) => {
        setResult(answer);
        setHour(bestHour(answer));
      },
    });
  };

  const antennaOptions = (saved: PlannerForm["txAntennaSaved"]) => [
    ...(saved ? [{ value: AS_SAVED, label: "As saved", description: antennaSummary(saved) }] : []),
    ...antennas.map((antenna) => ({
      value: antenna.id,
      label: antenna.name,
      description: antennaModelLabel(antenna.kind, antenna.lengthM),
    })),
    ...ANTENNA_PRESETS.map((preset) => ({ value: `preset:${preset.id}`, label: preset.name, description: "Generic" })),
  ];
  const antennaNote = (id: string, saved: PlannerForm["txAntennaSaved"]) => {
    const chosen = antennaOf(id, antennas, saved);
    // A wire of a stated length: what it is on the frequency in the form, said before anything is asked.
    const wire = chosen ? wireHint(chosen.spec, form.frequencyMhz) : null;
    const onFrequency = wire ? ` ${wire.note} The matching unit's loss is not modelled: take it off as feedline loss in a profile.` : "";
    if (id === AS_SAVED && saved)
      return `The antenna this prediction was saved with: ${antennaSummary(saved)}. None of your profiles or the generic antennas is exactly this now.${onFrequency}`;
    const preset = ANTENNA_PRESETS.find((item) => `preset:${item.id}` === id);
    if (preset) return wire ? onFrequency.trim() : preset.modelledAs;
    if (!chosen) return undefined;
    if (wire) return `From your profile.${onFrequency}`;
    return `${antennaModelLabel(chosen.spec.kind)}${isApproximatedAntenna(chosen.spec.kind) ? "." : ", from your profile."}`;
  };
  const mode = modeById(form.mode);
  const fieldError = (field: keyof PlannerForm) => (problem?.field === field ? problem.problem : undefined);

  if (engines.isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      {engine && !engine.ready ? (
        <Notice tone="danger" title="The propagation engine cannot run, so nothing can be predicted">
          {engine.problem} Outpost does not estimate propagation any other way. See the Data tab for what is installed.
        </Notice>
      ) : null}

      <form
        className="grid gap-x-10 gap-y-8 lg:grid-cols-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setOpened(null);
          run();
        }}
      >
        <fieldset className="grid content-start gap-4">
          <legend className="mb-3 text-lead font-semibold text-ink">Where</legend>
          <PlaceInput
            label="Transmitter"
            what="the transmitter"
            value={form.tx}
            onChange={(value) => set("tx", value)}
            places={places.data ?? []}
            error={fieldError("tx")}
          />
          <PlaceInput
            label="Receiver"
            what="the receiver"
            value={form.rx}
            onChange={(value) => set("rx", value)}
            places={places.data ?? []}
            error={fieldError("rx")}
          />
          <p className="text-small text-ink-muted">
            Saved places are the ones you keep on the{" "}
            <Link to="/maps" className="text-primary underline underline-offset-2">
              map
            </Link>
            . A place pressed on the map here is used for this prediction and is not saved.
          </p>
          <Field label="Date (UTC)" hint="The model works by month: every day of a month gets the same answer.">
            {(ids) => (
              <Input {...ids} type="date" value={form.date} onChange={(event) => set("date", event.target.value)} className="max-w-48" />
            )}
          </Field>
          <Field label="Noise where the receiver is" hint="Man-made noise. Atmospheric and galactic noise come from the engine's maps.">
            {(ids) => (
              <Select<NoiseEnvironment>
                {...ids}
                value={form.noise}
                onChange={(value) => set("noise", value)}
                options={NOISE_ENVIRONMENTS.map((item) => ({
                  value: item.id,
                  label: item.label,
                  description: `${item.dbwAt3Mhz} dBW in 1 Hz at 3 MHz`,
                }))}
              />
            )}
          </Field>
        </fieldset>

        <fieldset className="grid content-start gap-4">
          <legend className="mb-3 text-lead font-semibold text-ink">With what</legend>
          {radios.length > 0 ? (
            <Field label="Radio">
              {(ids) => (
                <Select
                  {...ids}
                  value={form.radioId || "none"}
                  onChange={(id) => {
                    const radio = radios.find((item) => item.id === id);
                    setForm((current) => ({
                      ...current,
                      radioId: radio ? radio.id : "",
                      powerWatts: radio ? String(radio.powerWatts) : current.powerWatts,
                    }));
                  }}
                  options={[
                    { value: "none", label: "No profile" },
                    ...radios.map((radio) => ({ value: radio.id, label: radio.name, description: `${radio.powerWatts} W` })),
                  ]}
                />
              )}
            </Field>
          ) : null}
          <Field label="Transmitter power, watts" error={fieldError("powerWatts")}>
            {(ids) => (
              <Input
                {...ids}
                value={form.powerWatts}
                onChange={(event) => set("powerWatts", event.target.value)}
                inputMode="decimal"
                className="tabular max-w-32"
              />
            )}
          </Field>
          <Field label="Transmitting antenna" hint={antennaNote(form.txAntennaId, form.txAntennaSaved)} error={fieldError("txAntennaId")}>
            {(ids) => (
              <Select
                {...ids}
                value={form.txAntennaId}
                onChange={(value) => set("txAntennaId", value)}
                options={antennaOptions(form.txAntennaSaved)}
              />
            )}
          </Field>
          <Field label="Receiving antenna" hint={antennaNote(form.rxAntennaId, form.rxAntennaSaved)} error={fieldError("rxAntennaId")}>
            {(ids) => (
              <Select
                {...ids}
                value={form.rxAntennaId}
                onChange={(value) => set("rxAntennaId", value)}
                options={antennaOptions(form.rxAntennaSaved)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Band">
              {(ids) => (
                <Select
                  {...ids}
                  value={form.band}
                  onChange={(id) => {
                    const band = HF_BANDS.find((item) => item.id === id);
                    setForm((current) => ({ ...current, band: id, frequencyMhz: band ? String(band.mhz) : current.frequencyMhz }));
                  }}
                  options={[
                    ...HF_BANDS.map((band) => ({ value: band.id, label: band.label, description: `${band.mhz} MHz` })),
                    { value: "other", label: "Another frequency" },
                  ]}
                />
              )}
            </Field>
            <Field label="Frequency, MHz" error={fieldError("frequencyMhz")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={form.frequencyMhz}
                  onChange={(event) => {
                    const text = event.target.value;
                    setForm((current) => ({ ...current, frequencyMhz: text, band: bandOf(Number(text))?.id ?? "other" }));
                    if (problem?.field === "frequencyMhz") setProblem(null);
                  }}
                  inputMode="decimal"
                  className="tabular"
                />
              )}
            </Field>
          </div>
          <Field label="Mode" hint={mode.meaning}>
            {(ids) => (
              <Select<ModeId>
                {...ids}
                value={form.mode}
                onChange={(value) => setForm((current) => ({ ...current, mode: value, requiredSnrDb: "", referenceBandwidthHz: "" }))}
                options={OPERATING_MODES.map((item) => ({ value: item.id, label: item.label }))}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Needs, dB"
              hint={mode.requiredSnrDb === null ? "Your mode's figure." : `Leave empty for ${mode.requiredSnrDb} dB.`}
              error={fieldError("requiredSnrDb")}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={form.requiredSnrDb}
                  onChange={(event) => set("requiredSnrDb", event.target.value)}
                  inputMode="text"
                  placeholder={mode.requiredSnrDb === null ? "" : String(mode.requiredSnrDb)}
                  className="tabular"
                />
              )}
            </Field>
            <Field
              label="Measured in, Hz"
              hint={`Leave empty for ${mode.referenceBandwidthHz} Hz.`}
              error={fieldError("referenceBandwidthHz")}
            >
              {(ids) => (
                <Input
                  {...ids}
                  value={form.referenceBandwidthHz}
                  onChange={(event) => set("referenceBandwidthHz", event.target.value)}
                  inputMode="decimal"
                  placeholder={String(mode.referenceBandwidthHz)}
                  className="tabular"
                />
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset className="grid content-start gap-4">
          <legend className="mb-3 text-lead font-semibold text-ink">The Sun</legend>
          <Field
            label="Sunspot number"
            hint="The one figure about the Sun the engine takes. None of these is a reading of today's conditions."
          >
            {(ids) => (
              <Select
                {...ids}
                value={form.solar}
                onChange={(value) => set("solar", value)}
                options={[
                  { value: "table", label: "NOAA's forecast for the month", description: "From the solar cycle table installed" },
                  { value: "manual", label: "A sunspot number of my own" },
                  { value: "fof2", label: "From an foF2 I measured", description: "Read off an ionosonde, or found on the air" },
                ]}
              />
            )}
          </Field>
          {form.solar === "manual" ? (
            <Field label="Smoothed sunspot number" error={fieldError("ssn")}>
              {(ids) => (
                <Input
                  {...ids}
                  value={form.ssn}
                  onChange={(event) => set("ssn", event.target.value)}
                  inputMode="decimal"
                  className="tabular max-w-32"
                />
              )}
            </Field>
          ) : null}
          {form.solar === "fof2" ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="foF2, MHz" error={fieldError("fof2Mhz")}>
                {(ids) => (
                  <Input
                    {...ids}
                    value={form.fof2Mhz}
                    onChange={(event) => set("fof2Mhz", event.target.value)}
                    inputMode="decimal"
                    className="tabular"
                  />
                )}
              </Field>
              <Field label="At hour, UTC">
                {(ids) => (
                  <Select
                    {...ids}
                    value={form.fof2Hour}
                    onChange={(value) => set("fof2Hour", value)}
                    options={Array.from({ length: 24 }, (_, index) => ({
                      value: String(index + 1),
                      label: `${String(index + 1).padStart(2, "0")}:00`,
                    }))}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="grid content-start gap-4">
          <legend className="mb-3 text-lead font-semibold text-ink">The reply</legend>
          <label htmlFor={replyId} className="flex items-start gap-2.5 text-small text-ink">
            <Checkbox id={replyId} checked={form.reply} onCheckedChange={(checked) => set("reply", checked === true)} className="mt-0.5" />
            <span>
              Predict the way back as well
              <span className="block text-ink-muted">
                Hearing a station is not a contact. With the other station's power and the noise at the transmitter's end, both directions
                are worked out.
              </span>
            </span>
          </label>
          {form.reply ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Their power, watts" error={fieldError("replyPowerWatts")}>
                {(ids) => (
                  <Input
                    {...ids}
                    value={form.replyPowerWatts}
                    onChange={(event) => set("replyPowerWatts", event.target.value)}
                    inputMode="decimal"
                    className="tabular"
                  />
                )}
              </Field>
              <Field label="Noise at the transmitter's end">
                {(ids) => (
                  <Select<NoiseEnvironment>
                    {...ids}
                    value={form.replyNoise}
                    onChange={(value) => set("replyNoise", value)}
                    options={NOISE_ENVIRONMENTS.map((item) => ({ value: item.id, label: item.label }))}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
          <Button type="submit" variant="primary" loading={predict.isPending} disabled={engine ? !engine.ready : false}>
            Predict
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(emptyForm());
              setOpened(null);
            }}
          >
            Clear the form
          </Button>
          {result ? (
            <Button
              type="button"
              onClick={() => setSaveName(`${result.request.tx.name} to ${result.request.rx.name}, ${result.request.frequencyMhz} MHz`)}
            >
              Save this prediction
            </Button>
          ) : null}
          {problem ? <p className="basis-full text-small text-danger">Not sent: one thing above needs putting right.</p> : null}
        </div>
      </form>

      {saveName !== null && result ? (
        <Dialog open onOpenChange={(open) => !open && setSaveName(null)}>
          <DialogContent
            title="Save this prediction"
            description="The question is kept under this name. It is worked out again when you open it, with whatever data is installed then."
          >
            <DialogBody>
              <Field label="Name">
                {(ids) => <Input {...ids} value={saveName} onChange={(event) => setSaveName(event.target.value)} maxLength={120} />}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setSaveName(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={savePrediction.isPending}
                onClick={() =>
                  savePrediction.mutate(
                    { name: saveName.trim() || "Prediction", request: result.request, key: result.key },
                    { onSuccess: () => setSaveName(null) },
                  )
                }
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className="mt-10" aria-busy={predict.isPending}>
        {opened && "problem" in opened ? (
          <Notice tone="danger" title={`“${opened.name}” was not asked again`} className="mb-4">
            {opened.problem}
          </Notice>
        ) : opened ? (
          <Notice title={`Saved prediction: ${opened.name}`} className="mb-4">
            Asked again as it was saved, for {longDate.format(new Date(`${opened.date}T00:00:00Z`))}. That is the date it was saved with,
            not today's.
            {opened.antennas.map((line) => ` ${line}`)}
          </Notice>
        ) : null}
        {predict.isError ? (
          <Notice tone="danger" title="No prediction was made">
            {errorMessage(predict.error)}
          </Notice>
        ) : predict.isPending && !result ? (
          <div className="grid gap-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : result ? (
          <Results result={result} hour={hour} onHour={setHour} />
        ) : (
          <EmptyState
            title="No prediction yet"
            action={
              <Button
                variant="primary"
                disabled={engine ? !engine.ready : false}
                onClick={() => {
                  const example = exampleForm();
                  setForm(example);
                  setOpened(null);
                  run(example);
                }}
              >
                Try London to Birmingham on 40 m
              </Button>
            }
          >
            Say where the two stations are and press Predict. The answer is a day on that path, hour by hour and band by band, worked out on
            this computer with no connection.
          </EmptyState>
        )}
      </div>

      {saved.data && saved.data.length > 0 ? (
        <Section title="Saved predictions">
          <Rows className="border-y border-border">
            {saved.data.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{item.name}</span>
                  <span className="tabular block text-small text-ink-muted">
                    {item.request.date}, {item.request.frequencyMhz} MHz, {modeById(item.request.mode).label}, {item.request.powerWatts} W
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      const next = openSaved(item, antennas);
                      setForm(next.form);
                      if ("problem" in next) {
                        // Nothing else is shown under the saved name: not the last answer, and not a different question's.
                        setResult(null);
                        predict.reset();
                        setProblem(null);
                        setOpened({ name: item.name, problem: next.problem });
                      } else {
                        const kept = (which: string, spec: PlannerForm["txAntennaSaved"]) =>
                          spec
                            ? [
                                `Its ${which} antenna is not one of your profiles or a generic antenna now, so it is run as it was saved: ${antennaSummary(spec)}.`,
                              ]
                            : [];
                        setOpened({
                          name: item.name,
                          date: item.request.date,
                          antennas: [...kept("transmitting", next.form.txAntennaSaved), ...kept("receiving", next.form.rxAntennaSaved)],
                        });
                        run(next.form);
                      }
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    Open
                  </Button>
                  <Button size="sm" variant="danger-ghost" onClick={() => setRemoving({ id: item.id, name: item.name })}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </Rows>
        </Section>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this saved prediction?"
        description={`“${removing?.name ?? ""}” will be removed from the list. Nothing else is deleted.`}
        confirmLabel="Delete"
        loading={removeSaved.isPending}
        onConfirm={() => removing && removeSaved.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </div>
  );
}
