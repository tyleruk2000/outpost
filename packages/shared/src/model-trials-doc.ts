/**
 * docs/which-model.md, written from the one data file of measured results
 * (model-trials.ts), so that the page in the repository and the "Which model" screen
 * cannot disagree. `node scripts/write-which-model.mjs` writes it; `--check` fails when
 * it is out of date.
 */
import { MODEL_TRIALS, type ModelTrial, type ModelTrials, TOOL_QUESTIONS, VERDICT_WORDS } from "./model-trials.ts";

const SUITS: Record<string, string> = {
  "pi-4gb": "a Raspberry Pi 5 with 4 GB",
  "pi-8gb": "a Raspberry Pi 5 with 8 GB",
  mac: "a Mac or PC (too large for a Pi)",
};

function libraryWords(model: ModelTrial): string {
  const library = model.library;
  if (!library) return "not run through the library questions";
  return `${library.right} of ${library.of} right; declined ${library.declinedRightly} of ${library.ofDeclined} it should have${library.note ? `. ${library.note}` : ""}`;
}

function toolsWords(model: ModelTrial): string {
  if (!model.tools) return "not tried";
  return `${model.tools.right} of ${model.tools.of} right${model.tools.mistakes ? `. ${model.tools.mistakes}` : ""}`;
}

function timingWords(model: ModelTrial): string {
  if (!model.timing) return "not timed";
  return `first word ${model.timing.firstWordS.toFixed(1)} s, whole reply ${model.timing.wholeS.toFixed(1)} s (medians), on that Mac, not on a Pi`;
}

export function whichModelMarkdown(trials: ModelTrials = MODEL_TRIALS): string {
  const lines: string[] = [
    "<!-- Written by scripts/write-which-model.mjs from packages/shared/src/model-trials.ts. Change that file, not this one. -->",
    "",
    "# Which model",
    "",
    `Which of the models tried here to use for answers and Chat, and whether each can look things up in Outpost. Measured on ${trials.measuredOn}, on ${trials.machine}, with Ollama ${trials.ollama}. The same page is inside Outpost at \`/help/which-model\`, linked where a model is chosen. How it was measured is in [ai.md](ai.md#tried-with-a-real-model-tools).`,
    "",
    "**No model has been timed on a Raspberry Pi.** A Pi will be slower; by how much has not been measured.",
    "",
    "## Start here",
    "",
  ];
  const { pi, mac, avoid } = trials.recommendation;
  if (pi) lines.push(`- **On a Raspberry Pi: \`${pi.name}\`.** ${pi.reason} Get it with \`ollama pull ${pi.name}\`.`);
  if (mac) lines.push(`- **On a Mac or PC: \`${mac.name}\`.** ${mac.reason}`);
  for (const choice of avoid) lines.push(`- **Not worth getting: \`${choice.name}\`.** ${choice.reason}`);
  lines.push("", "## Each model", "");
  for (const model of trials.models) {
    lines.push(
      `### \`${model.name}\`: ${VERDICT_WORDS[model.verdict]}`,
      "",
      model.reason,
      "",
      `- Download: ${model.download ?? "size not read"}`,
      `- Memory while answering here: ${model.memoryGb === null ? "not measured" : `${model.memoryGb.toFixed(1)} GB`}`,
      `- Suits: ${model.suits ? SUITS[model.suits] : "not judged"}`,
      `- Licence: ${model.licence.read && model.licence.name ? `[${model.licence.name}](${model.licence.url})` : `not read ([its page](${model.licence.url}))`}`,
      `- Thinks before answering: ${model.thinks === null ? "not known" : model.thinks ? "yes" : "no"}`,
      `- Answers from the library's passages: ${libraryWords(model)}`,
      `- Looking things up: ${toolsWords(model)}`,
      `- Time: ${timingWords(model)}`,
      "",
    );
  }
  if (TOOL_QUESTIONS.length > 0) {
    lines.push("## The questions asked to try looking things up", "");
    for (const question of TOOL_QUESTIONS) lines.push(`1. ${question}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
