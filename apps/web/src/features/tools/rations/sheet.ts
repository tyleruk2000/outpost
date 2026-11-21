/**
 * The ration plan as a sheet to print and keep: who is fed, each person's daily figure and
 * what it is made of, the stock shared by need, and who must not be put on a reduced
 * ration by a calculator. Pure: blocks out.
 */
import { type PersonNeed, RATION_SOURCES, type ShareLine } from "@outpost/shared";
import type { Block } from "../kit/sheet";

const whole = (value: number) => Math.round(value).toLocaleString("en-GB");

export function rationBlocks({
  title,
  needs,
  shared,
  whoNot,
}: {
  title: string;
  needs: PersonNeed[];
  shared: { perDay: number; lines: ShareLine[] };
  whoNot: string;
}): Block[] {
  return [
    { kind: "title", text: title },
    {
      kind: "para",
      text: "A planning aid worked out with Outpost's ration calculator from the figures of the bodies named below. It gives no medical or dietary advice.",
    },
    { kind: "heading", text: "Who must not be put on a reduced ration by a calculator" },
    { kind: "para", text: whoNot },
    { kind: "heading", text: "Each person's need a day" },
    {
      kind: "table",
      head: ["Who", "Made of", "kcal a day", "Kept on full"],
      rows: needs.map((need) => [
        need.name || "Someone",
        need.parts.map((part) => `${part.label} ${whole(part.kcal)}`).join(" + "),
        need.kcal === null ? "no figure" : whole(need.kcal),
        need.protected ? `yes: ${need.why.join(", ")}` : "",
      ]),
    },
    { kind: "heading", text: `The stock shared by need: ${whole(shared.perDay)} kcal a day` },
    {
      kind: "table",
      head: ["Who", "kcal a day", "Of their need"],
      rows: shared.lines.map((line) => [line.name || "Someone", whole(line.kcal), `${Math.round(line.ofNeed * 100)}%`]),
    },
    { kind: "heading", text: "Sources" },
    { kind: "list", items: Object.values(RATION_SOURCES).map((source) => `${source.name}, read ${source.read}`) },
  ];
}
