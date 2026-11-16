/** Adding or changing one station of a plan: where it is and what is there. */
import {
  ANTENNA_PRESETS,
  type AntennaProfile,
  antennaModelLabel,
  type MarkerDto,
  NOISE_ENVIRONMENTS,
  type NoiseEnvironment,
  type PlanStation,
  parseCoordinates,
  type RadioProfile,
  sameAntennaSpec,
} from "@outpost/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { localId } from "@/lib/utils";
import { antennaOf, antennaSummary, type PlaceField, wireBandsNote } from "../data";
import { PlaceInput } from "../place-field";

/** The antenna a station was saved with, when no profile or generic antenna is exactly it any more. */
const KEPT = "kept";

export function StationDialog({
  station,
  radios,
  antennas,
  places,
  saving,
  onSave,
  onClose,
}: {
  /** The station being changed, or null for a new one. */
  station: PlanStation | null;
  radios: RadioProfile[];
  antennas: AntennaProfile[];
  places: MarkerDto[];
  saving: boolean;
  onSave: (station: PlanStation) => void;
  onClose: () => void;
}) {
  const startAntenna = () => {
    if (!station) return "preset:low-dipole";
    const preset = ANTENNA_PRESETS.find((item) => sameAntennaSpec(item.spec, station.antenna));
    if (preset) return `preset:${preset.id}`;
    return antennas.find((item) => sameAntennaSpec(item, station.antenna))?.id ?? KEPT;
  };
  const [name, setName] = useState(station?.name ?? "");
  const [place, setPlace] = useState<PlaceField>(station ? { text: `${station.lat}, ${station.lon}`, name: "" } : { text: "", name: "" });
  const [powerWatts, setPowerWatts] = useState(String(station?.powerWatts ?? 5));
  const [antennaId, setAntennaId] = useState(startAntenna);
  const [noise, setNoise] = useState<NoiseEnvironment>(station?.noise ?? "residential");
  const [problem, setProblem] = useState<{ field: "name" | "place" | "power" | "antenna"; text: string } | null>(null);
  const error = (field: NonNullable<typeof problem>["field"]) => (problem?.field === field ? problem.text : undefined);

  const picked = antennaId === KEPT && station ? station.antenna : antennaOf(antennaId, antennas)?.spec;
  const wireNote = picked ? wireBandsNote(picked) : null;

  const submit = () => {
    const found = parseCoordinates(place.text);
    const called = name.trim() || place.name.trim();
    if (!called) return setProblem({ field: "name", text: "Give the station a name: Home base, Remote shelter." });
    if (!found)
      return setProblem({ field: "place", text: "Say where the station is: a saved place, a press on the map, coordinates or a locator." });
    const watts = powerWatts.trim() === "" ? Number.NaN : Number(powerWatts);
    if (!(watts >= 0.1)) return setProblem({ field: "power", text: "Give the transmitter power in watts, at least 0.1." });
    const chosen = antennaId === KEPT && station ? { spec: station.antenna, name: station.antennaName } : antennaOf(antennaId, antennas);
    if (!chosen) return setProblem({ field: "antenna", text: "Choose the antenna at this station." });
    onSave({
      id: station?.id ?? localId().slice(0, 12),
      name: called.slice(0, 60),
      lat: found.lat,
      lon: found.lon,
      powerWatts: watts,
      antenna: chosen.spec,
      antennaName: chosen.name,
      noise,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={station ? `Change ${station.name}` : "Add a station"} description="A place, and the equipment that is there.">
        <DialogBody className="grid gap-4">
          <Field label="Name" error={error("name")}>
            {(ids) => (
              <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Home base" />
            )}
          </Field>
          <PlaceInput
            label="Where it is"
            what="this station"
            value={place}
            onChange={(value) => {
              setPlace(value);
              // A saved place brings its name with it, unless the station already has one.
              if (value.name && !name.trim()) setName(value.name);
            }}
            places={places}
            error={error("place")}
          />
          {radios.length > 0 ? (
            <Field label="Radio" hint="A radio profile fills in the power.">
              {(ids) => (
                <Select
                  {...ids}
                  value={undefined}
                  placeholder="Choose a radio profile"
                  onChange={(id) => {
                    const radio = radios.find((item) => item.id === id);
                    if (radio) setPowerWatts(String(radio.powerWatts));
                  }}
                  options={radios.map((radio) => ({ value: radio.id, label: radio.name, description: `${radio.powerWatts} W` }))}
                />
              )}
            </Field>
          ) : null}
          <Field label="Transmitter power, watts" error={error("power")}>
            {(ids) => (
              <Input
                {...ids}
                value={powerWatts}
                onChange={(event) => setPowerWatts(event.target.value)}
                inputMode="decimal"
                className="tabular max-w-32"
              />
            )}
          </Field>
          <Field
            label="Antenna"
            hint={`With no bearing of its own, the antenna is turned towards each other station in turn.${wireNote ? ` ${wireNote}` : ""}`}
            error={error("antenna")}
          >
            {(ids) => (
              <Select
                {...ids}
                value={antennaId}
                onChange={setAntennaId}
                options={[
                  ...(antennaId === KEPT && station
                    ? [{ value: KEPT, label: station.antennaName || "As saved", description: antennaSummary(station.antenna) }]
                    : []),
                  ...antennas.map((antenna) => ({
                    value: antenna.id,
                    label: antenna.name,
                    description: antennaModelLabel(antenna.kind, antenna.lengthM),
                  })),
                  ...ANTENNA_PRESETS.map((preset) => ({ value: `preset:${preset.id}`, label: preset.name, description: "Generic" })),
                ]}
              />
            )}
          </Field>
          <Field label="Noise where this station listens" hint="Man-made noise. It decides how well this station hears the others.">
            {(ids) => (
              <Select<NoiseEnvironment>
                {...ids}
                value={noise}
                onChange={setNoise}
                options={NOISE_ENVIRONMENTS.map((item) => ({
                  value: item.id,
                  label: item.label,
                  description: `${item.dbwAt3Mhz} dBW in 1 Hz at 3 MHz`,
                }))}
              />
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {station ? "Save station" : "Add station"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
