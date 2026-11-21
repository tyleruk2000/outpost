/**
 * docs/radio-licences.md, written from the statements in radio-licence-statements.ts so
 * that the Help page and the one-line notices on the radio screens rest on the same
 * words. `node scripts/write-radio-licences.mjs` writes it; a test fails when it is out
 * of date.
 */
import { checkedOn } from "./radio-frequencies.ts";
import { LICENCE_STATEMENT_GROUPS, RADIO_LICENCE_SETTING } from "./radio-licence.ts";
import { LICENCE_STATEMENTS } from "./radio-licence-statements.ts";

const COUNTRY = { GB: "United Kingdom (Ofcom)", US: "United States (FCC)" } as Record<string, string>;

export function radioLicencesMarkdown(): string {
  const days = LICENCE_STATEMENTS.flatMap((statement) =>
    statement.rules.flatMap((rule) => rule.sources.map((source) => source.checked)),
  ).sort();
  const lines: string[] = [
    "<!-- Written by scripts/write-radio-licences.mjs from packages/shared/src/radio-licence-statements.ts. Change that file, not this one. -->",
    "",
    "# What needs a radio licence",
    "",
    `What you may listen to, what you may send on without a licence, and what needs an amateur licence, as the UK's regulator (Ofcom) and the United States' (the FCC) and their laws say it. Every statement names the document it rests on and the day it was read (${checkedOn(days[0] ?? "")}${days.at(-1) && days.at(-1) !== days[0] ? ` to ${checkedOn(days.at(-1) ?? "")}` : ""}). Where Outpost does not know, it says so. This is general information, not legal advice.`,
    "",
    "Outpost never transmits on APRS or on any amateur frequency. It receives, and helps you plan and practise. The household board can send messages over a Meshtastic radio on its licence-exempt band, through the mesh link (see [mesh-radio.md](mesh-radio.md)).",
    "",
    "## Licensed and listen-only households",
    "",
    `In **Settings → Radio licence**, switch on **${RADIO_LICENCE_SETTING.label}** if someone in the household holds one, and give the callsign if you like. ${RADIO_LICENCE_SETTING.about}`,
    "",
    "With it off, which is how Outpost starts, every radio screen says in one line whether what it does needs a licence, and things that only make sense for transmitting (a callsign for the air, planning a transmission) are worded as practice. With it on, the reminders that transmitting needs a licence are left out. Warnings that are not about the licence stay for everyone: a public mesh channel can be read by anyone, and radio is not a way to call the emergency services.",
    "",
    "Band plans and what each class of licence may use, country by country, are on **Radio → Licences and band plans**.",
    "",
  ];
  for (const group of LICENCE_STATEMENT_GROUPS) {
    lines.push(`## ${group.title}`, "");
    for (const statement of LICENCE_STATEMENTS.filter((entry) => entry.group === group.id)) {
      lines.push(`### ${statement.topic}`, "");
      for (const rule of statement.rules) {
        lines.push(`**${COUNTRY[rule.country] ?? rule.country}.** ${rule.says}`, "");
        if (rule.quote) lines.push(`> “${rule.quote}”`, "");
        lines.push(
          `Sources: ${rule.sources.map((source) => `[${source.publisher}, ${source.title}](${source.url}) (read ${checkedOn(source.checked)})`).join("; ")}.`,
          "",
        );
      }
      if (statement.unknown) lines.push(`**Not known.** ${statement.unknown}`, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
