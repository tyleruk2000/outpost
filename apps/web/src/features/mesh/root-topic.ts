/**
 * The first choice of a Meshtastic radio's root topic, by Home's country (else the
 * device's region), from Meshtastic's table of LoRa regions by country. Only a first
 * choice: the radio's own setting is what counts, and once the radio has been heard the
 * screen says the topic it was heard under instead.
 */
import { meshtasticRegionFor, meshtasticRootFor } from "@outpost/shared";

export function suggestedRoot(home: { code: string } | null, region: string | null): string | null {
  return meshtasticRootFor(home?.code ?? region);
}

/** The hint under the root topic field when the radio has not been heard yet. */
export function rootTopicHint(home: { code: string; name: string } | null, region: string | null): string {
  const code = home?.code ?? region;
  const lora = meshtasticRegionFor(code);
  if (!lora)
    return "As set on the radio. A radio with none set uses msh/ and its LoRa region: msh/US in the United States, msh/EU_868 in Europe.";
  const where = home ? `Home is in ${home.name}` : `This device is set to ${code}`;
  return `As set on the radio. ${where}: Meshtastic's table of regions by country gives ${lora}, so a radio with none set uses msh/${lora}.`;
}
