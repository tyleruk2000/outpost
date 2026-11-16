/**
 * A device chosen for the quick calculator, as a row: how many, how it is used, and,
 * behind one disclosure, where its figures come from. Also that disclosure on its own,
 * for a plan's loads.
 */
import { type PowerLoad, type PublishedFigure, RADIO_MODES } from "@outpost/shared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deviceById,
  ESTIMATE_STATE,
  estimatedTransmitW,
  figureKind,
  stateOf,
  withLowerOutput,
  withMode,
  withState,
  withTransmit,
} from "./calc/devices";
import { figureWorking, kindWords, MAKER_SENTENCE, originSentence, sourceLine } from "./device-text";
import { Basis, ChoiceField, Fields, figure, NumberField } from "./inputs";

/** One published figure with its working, the publisher's words, and the source. */
function FigureLine({
  label,
  item,
  sources,
}: {
  label: string;
  item: PublishedFigure;
  sources: Array<{ publisher: string; document: string; url: string; read: string }>;
}) {
  const source = sources[item.source];
  return (
    <li className="grid gap-0.5">
      <span>
        <span className="font-medium">{label}:</span> <span className="tabular">{figureWorking(item)}</span>
        {item.basis === "at-most" ? " (the most it should draw, not a typical figure)" : ""}.
      </span>
      <span className="text-ink-muted">
        “{item.quote}”{item.note ? ` ${item.note}` : ""}
      </span>
      {source ? (
        <span className="text-ink-muted">
          {sourceLine(source).replace(/\.$/, "")}:{" "}
          <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-primary underline underline-offset-2">
            {source.url}
          </a>
        </span>
      ) : null}
    </li>
  );
}

/** "Where these figures come from", for a load made from the library or a person's own device. */
export function FigureSources({ load }: { load: PowerLoad }) {
  const from = load.origin;
  if (!from) return null;
  if (from.library === "own") return <p className="text-small text-ink-muted">{originSentence(load)}</p>;
  const entry = deviceById(from.id);
  if (!entry) return <p className="text-small text-ink-muted">{originSentence(load)}</p>;
  const lines: Array<{ label: string; item: PublishedFigure }> = [];
  if (entry.kind === "run") for (const state of entry.states) lines.push({ label: state.label, item: state.figure });
  if (entry.kind === "charge") lines.push({ label: "Battery", item: entry.battery });
  if (entry.kind === "radio") {
    lines.push({ label: "Receiving", item: entry.receive });
    if (entry.standby) lines.push({ label: "Standby", item: entry.standby });
    for (const point of entry.transmit) lines.push({ label: `Transmitting, ${point.label}`, item: point.figure });
  }
  return (
    <Basis summary="Where these figures come from">
      <ul className="grid gap-2.5">
        {lines.map((line) => (
          <FigureLine key={line.label} label={line.label} item={line.item} sources={entry.sources} />
        ))}
      </ul>
      {entry.note ? <p>{entry.note}</p> : null}
      {figureKind(load) === "own" ? <p>You have changed a figure since, so the answers use yours.</p> : null}
      <p className="text-ink-muted">{MAKER_SENTENCE}</p>
    </Basis>
  );
}

/** A chosen device in the quick calculator. */
export function DeviceRow({ load, onChange, onRemove }: { load: PowerLoad; onChange: (load: PowerLoad) => void; onRemove: () => void }) {
  const entry = load.origin?.library === "common" ? deviceById(load.origin.id) : undefined;
  const words = kindWords(load);
  const set = (patch: Partial<PowerLoad>) => onChange({ ...load, ...patch } as PowerLoad);
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">
            <span className="tabular">{load.quantity} ×</span> {load.name}
          </p>
          {words ? <p className="text-small text-ink-muted">{words[0]!.toUpperCase() + words.slice(1)}.</p> : null}
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${load.name}`}>
          <X aria-hidden />
        </Button>
      </div>
      <Fields className="mt-2 grid-cols-2">
        <NumberField
          label="How many"
          value={load.quantity}
          onChange={(value) => value !== null && value >= 1 && set({ quantity: Math.round(value) })}
          min={1}
          max={1000}
        />
        {load.kind === "device" ? (
          <NumberField
            label="Hours a day"
            unit="h"
            value={load.hoursPerDay}
            onChange={(value) => value !== null && set({ hoursPerDay: value })}
            min={0}
            max={24}
          />
        ) : load.kind === "charge" ? (
          <NumberField
            label="Charges a day"
            value={load.chargesPerDay}
            onChange={(value) => value !== null && set({ chargesPerDay: value })}
            min={0}
            max={100}
            hint="From empty to full; half a charge is 0.5."
          />
        ) : (
          <NumberField
            label="Hours a day on"
            unit="h"
            value={load.onAirHours}
            onChange={(value) => value !== null && set({ onAirHours: value })}
            min={0}
            max={24}
          />
        )}
      </Fields>
      {load.kind === "device" && entry?.kind === "run" && entry.states.length > 1 ? (
        <ChoiceField
          className="mt-3"
          label={entry.range ? "Nearest to yours" : "Figure"}
          value={load.origin?.state ?? entry.states[0]!.id}
          onChange={(id) => {
            const state = stateOf(entry, id);
            if (state) onChange(withState(load, state));
          }}
          options={entry.states.map((state) => ({
            value: state.id,
            label: `${state.label}: ${figure(state.figure.value, 2)} W${state.figure.basis === "at-most" ? " at most" : ""}`,
          }))}
        />
      ) : null}
      {load.kind === "device" && !entry ? (
        <NumberField
          className="mt-3"
          label="Power while on"
          unit="W"
          value={load.watts}
          onChange={(value) => value !== null && set({ watts: value })}
          min={0}
        />
      ) : null}
      {load.kind === "radio" ? <RadioUse load={load} onChange={onChange} /> : null}
      <FigureSources load={load} />
    </li>
  );
}

function RadioUse({ load, onChange }: { load: Extract<PowerLoad, { kind: "radio" }>; onChange: (load: PowerLoad) => void }) {
  const entry = load.origin?.library === "common" ? deviceById(load.origin.id) : undefined;
  const radio = entry?.kind === "radio" ? entry : null;
  const estimate = load.origin?.state?.startsWith(ESTIMATE_STATE) ? Number(load.origin.state.split(":")[1]) : null;
  const output = estimate !== null ? "lower" : (load.origin?.state ?? "");
  return (
    <div className="mt-3 grid gap-3">
      <Fields>
        <ChoiceField
          label="Mode"
          value={load.mode}
          onChange={(mode) => onChange(withMode(load, mode))}
          options={RADIO_MODES.map((mode) => ({ value: mode.id, label: mode.label }))}
        />
        <NumberField
          label="Minutes an hour transmitting"
          unit="min"
          value={Number((load.transmitShare * 60).toFixed(2))}
          onChange={(value) => value !== null && onChange({ ...load, transmitShare: value / 60, mode: "custom" })}
          min={0}
          max={60}
        />
      </Fields>
      {radio ? (
        <Fields>
          <ChoiceField
            label="Output"
            value={output}
            onChange={(value) =>
              onChange(
                value === "lower"
                  ? withLowerOutput(load, Math.max(0.5, Math.round(radio.transmit.at(-1)!.outputW / 2)))
                  : withTransmit(load, radio, value),
              )
            }
            options={[
              ...radio.transmit.map((point) => ({ value: point.id, label: `${point.label}, the maker's figure` })),
              { value: "lower", label: "Lower, estimated" },
            ]}
          />
          {estimate !== null ? (
            <NumberField
              label="Output"
              unit="W"
              value={estimate}
              onChange={(value) => value !== null && value > 0 && onChange(withLowerOutput(load, value))}
              min={0}
              hint={`An estimate: ${figure(estimatedTransmitW(estimate), 1)} W drawn, twice the output, as for an amplifier about half efficient.${radio.fullPowerOnly ? " The maker gives the transmit current at full output only." : ""}`}
            />
          ) : null}
        </Fields>
      ) : null}
      <p className="text-small text-ink-muted">
        {load.mode === "custom"
          ? `Your own share of time transmitting; while transmitting it counts as ${figure(load.modeFactor * 100, 0)}% of full output.`
          : RADIO_MODES.find((mode) => mode.id === load.mode)?.basis}
      </p>
    </div>
  );
}
