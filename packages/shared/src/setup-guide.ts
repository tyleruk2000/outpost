/**
 * The set-up guide for search by meaning, answers and chat: one source, two pages.
 *
 * The in-app guide (`/help/search-and-answers`, apps/web/src/features/help) draws this
 * with its own elements, so it works with no internet. `docs/setup-guide.md` is written
 * from the same data by `node scripts/write-setup-guide.mjs`, and a server test fails
 * when the file and this source differ. So the two cannot drift: change the words
 * here, run the script, and both follow.
 *
 * Text may use three marks, which mean the same in both pages:
 *   **a thing to press or look for**    `a thing to type, or a name as it is spelled`
 *   [words](https://address)             a link that opens in the browser
 *
 * Every command, setting name, port and model name here was read from its publisher's
 * own documentation on the day in `checked`; `sources` says which page gave what. Do
 * not change one from memory.
 */
import { MODEL_LIBRARY_URL, pullCommand, RECOMMENDED_MODELS, RECOMMENDED_MODELS_CHECKED, STARTING_MODEL } from "./recommended-models.ts";

export type GuideSystem = "mac" | "windows" | "linux" | "pi";

export const GUIDE_SYSTEMS: ReadonlyArray<{ id: GuideSystem; name: string }> = [
  { id: "mac", name: "Mac" },
  { id: "windows", name: "Windows" },
  { id: "linux", name: "Linux" },
  { id: "pi", name: "Raspberry Pi" },
];

/** One numbered step: what to do, and the exact thing to type when there is one. */
export type GuideStep = string | { text: string; command: string };

export type GuideBlock =
  | { kind: "text"; text: string }
  | { kind: "steps"; steps: GuideStep[] }
  /** The same step done differently on each kind of computer. */
  | { kind: "bySystem"; systems: Record<GuideSystem, GuideBlock[]> }
  /** Something to type, or to put in a file, set apart. */
  | { kind: "command"; command: string }
  /** The short list of recommended models, from recommended-models.ts. */
  | { kind: "models" }
  | { kind: "problems"; problems: Array<{ says: string; means: string; fix: string }> }
  | { kind: "sources"; sources: Array<{ label: string; url: string; gave: string }> };

export interface GuideSection {
  /** The fragment of the page's address that leads here. */
  id: string;
  title: string;
  /** This part cannot be done without the internet. */
  needsInternet?: boolean;
  blocks: GuideBlock[];
  parts?: GuideSection[];
}

export interface Guide {
  title: string;
  /** The day the facts were read from their publishers, as YYYY-MM-DD. */
  checked: string;
  intro: string[];
  sections: GuideSection[];
}

/** Where the guide lives inside Outpost. */
export const SETUP_GUIDE_PATH = "/help/search-and-answers";

const START = STARTING_MODEL.name;
/** The lightest of the list that is not the one to start with, for a computer the starting one is slow on. */
const SMALLER = [...RECOMMENDED_MODELS].filter((model) => model.name !== START).sort((a, b) => a.memoryGb - b.memoryGb)[0]!.name;
const START_NOTE =
  STARTING_MODEL.fits === "4 GB"
    ? `\`${START}\` is the one to start with, and a computer with 4 GB of memory can hold it.`
    : `\`${START}\` is the one to start with. On a computer with 4 GB of memory, get \`${SMALLER}\` instead.`;
const INSTALL = "curl -fsSL https://ollama.com/install.sh | sh";
const LISTEN = "0.0.0.0:11434";

const openTerminal: Record<GuideSystem, GuideBlock[]> = {
  mac: [
    {
      kind: "text",
      text: "On a Mac, open **Terminal**: click the magnifying glass at the top right of the screen, type `Terminal`, then click **Terminal**.",
    },
  ],
  windows: [
    {
      kind: "text",
      text: "On Windows, open the **Start** menu, type `Windows PowerShell`, select **Windows PowerShell**, then select **Open**.",
    },
  ],
  linux: [{ kind: "text", text: "On Linux, use the terminal window from step 1." }],
  pi: [{ kind: "text", text: "On a Raspberry Pi, use the terminal window from step 1." }],
};

const listenOnLinux: GuideBlock[] = [
  {
    kind: "steps",
    steps: [
      { text: "In a terminal window, type this and press Enter:", command: "sudo systemctl edit ollama.service" },
      {
        text: "In the editor that opens, add these two lines, then save and close it:",
        command: `[Service]\nEnvironment="OLLAMA_HOST=${LISTEN}"`,
      },
      {
        text: "Then type these two lines, pressing Enter after each:",
        command: "sudo systemctl daemon-reload\nsudo systemctl restart ollama",
      },
    ],
  },
];

export const SETUP_GUIDE: Guide = {
  title: "Setting up search by meaning, answers and chat",
  checked: RECOMMENDED_MODELS_CHECKED,
  intro: [
    "Two things in Outpost are optional and switched off to begin with. **Search by meaning** needs nothing but its switch. **Answers and chat** need a free program called Ollama, which you install once.",
    "Outpost itself never needs the internet. Getting Ollama and a model does, once; the steps that do are marked.",
  ],
  sections: [
    {
      id: "search-by-meaning",
      title: "Search by meaning",
      blocks: [
        {
          kind: "steps",
          steps: [
            "Open **Settings** and go down to **Search by meaning**.",
            "Turn the switch on.",
            "Wait. Outpost reads your library once and says how long is left: about 45 seconds for every thousand passages on a recent laptop, and about four minutes on a Raspberry Pi 5. You can close the page; it carries on. It is done when it says **Search now also finds things by meaning**.",
          ],
        },
        {
          kind: "text",
          text: "That is all. Nothing is downloaded and nothing leaves the computer Outpost runs on. What you add later is read as it arrives. Turning the switch off keeps what was read.",
        },
      ],
    },
    {
      id: "answers-and-chat",
      title: "Answers and chat, with Ollama",
      blocks: [
        {
          kind: "text",
          text: "Answers and chat are written by a language model: a program that writes text. Outpost does not include one. Ollama is a free program that runs one on your own computer, normally the computer Outpost runs on. Once it is set up, what you ask goes to Ollama and nowhere else.",
        },
        {
          kind: "text",
          text: "Expect a helper, not an expert. For **Answer from my library** the model is given a few passages found in your documents and told to answer from those alone, with a number after each statement that opens the passage. When the passages found do not hold the answer it should say so, and with a small model and a short question that is often what you will see. Check anything that matters against the passage itself.",
        },
      ],
      parts: [
        {
          id: "get-ollama",
          title: "Step 1: get Ollama",
          needsInternet: true,
          blocks: [
            {
              kind: "bySystem",
              systems: {
                mac: [
                  {
                    kind: "steps",
                    steps: [
                      "On the Mac, open [ollama.com/download](https://ollama.com/download) in a browser and download Ollama for macOS. It needs macOS 14 (Sonoma) or newer.",
                      "Open the file that was downloaded, `Ollama.dmg`, and drag **Ollama** into the **Applications** folder.",
                      "Open **Ollama** from Applications. If it asks for permission to add its command to the Mac (a link in `/usr/local/bin`), allow it: step 2 uses that command.",
                    ],
                  },
                ],
                windows: [
                  {
                    kind: "steps",
                    steps: [
                      "On the PC, open [ollama.com/download](https://ollama.com/download) in a browser and download Ollama for Windows. It needs Windows 10 (version 22H2) or newer.",
                      "Open the file that was downloaded, `OllamaSetup.exe`, and follow it. It does not need an administrator.",
                      "Ollama then runs in the background, with an icon in the corner of the taskbar. Nothing else needs opening.",
                    ],
                  },
                ],
                linux: [
                  {
                    kind: "steps",
                    steps: [
                      "Open a terminal window. On most desktops the application is called Terminal.",
                      {
                        text: "Type this and press Enter. It is Ollama's own installer, and it may ask for your password:",
                        command: INSTALL,
                      },
                      "When it finishes, Ollama is running, and it starts with the computer from now on (as a service called `ollama`).",
                    ],
                  },
                ],
                pi: [
                  {
                    kind: "text",
                    text: "Use a Raspberry Pi 5, or a Pi 4, with the 64-bit Raspberry Pi OS. 8 GB of memory is the sensible size; 4 GB is enough for the smallest models in step 2. Ollama publishes a 64-bit ARM build for Linux, which is what a Pi needs. Its documentation does not mention the Raspberry Pi by name, and this project has not tried one.",
                  },
                  {
                    kind: "steps",
                    steps: [
                      "Open a terminal window on the Pi.",
                      {
                        text: "Type this and press Enter. It is Ollama's own installer, and it may ask for your password:",
                        command: INSTALL,
                      },
                      "When it finishes, Ollama is running, and it starts with the Pi from now on (as a service called `ollama`).",
                    ],
                  },
                ],
              },
            },
          ],
        },
        {
          id: "get-a-model",
          title: "Step 2: get a model",
          needsInternet: true,
          blocks: [
            {
              kind: "text",
              text: "A model is one large file that Ollama downloads and keeps. First open the place where commands are typed.",
            },
            { kind: "bySystem", systems: openTerminal },
            {
              kind: "steps",
              steps: [
                { text: "Type this and press Enter:", command: pullCommand(START) },
                `Wait for the download to finish: ${STARTING_MODEL.download}. It is done when the line you type on comes back.`,
                { text: "To see which models Ollama has, type:", command: "ollama ls" },
              ],
            },
            {
              kind: "text",
              text: `${START_NOTE} These are the small models Outpost suggests; all of them suit a laptop or a Raspberry Pi 5 with 8 GB. To get another, put its name in place of \`${START}\` in the command.`,
            },
            { kind: "models" },
            {
              kind: "text",
              text: `Names and download sizes are as Ollama's library listed them on ${longDate(RECOMMENDED_MODELS_CHECKED)}. Memory is what Ollama held for the model once loaded, on a Mac, where it says measured; otherwise it is the download size and a little more. For a model's sizes today, open [ollama.com/library](${MODEL_LIBRARY_URL}), choose the model, and look under **Tags**.`,
            },
          ],
        },
        {
          id: "back-to-outpost",
          title: "Step 3: come back to Outpost",
          blocks: [
            {
              kind: "steps",
              steps: [
                "Open **Settings** and go down to **Answers from your library**. The **Chat** screen offers the same buttons until this is done.",
                "Press **Look for Ollama on this computer**.",
                "Outpost lists the models Ollama has, with one already chosen. Press **Use this model**.",
                "Press **Try it**. Outpost asks the model for one word and shows what came back. The first try can take a minute, because Ollama loads the model into memory then. When it answers, answers and chat are switched on.",
              ],
            },
            {
              kind: "text",
              text: "To use it: on the **Search** screen, type a question and press **Answer from my library**; or open **Chat**.",
            },
            {
              kind: "text",
              text: "Chat can also let the model look things up in Outpost: places on the map, supplies, plans, the weather as last fetched and more. It is off until you switch it on under **Settings → Looking things up in Outpost**, and it needs a model that can call tools: **Which model** (under Settings) says which of the suggested ones do it well.",
            },
          ],
        },
      ],
    },
    {
      id: "another-computer",
      title: "When Ollama is on a different computer from Outpost",
      blocks: [
        {
          kind: "text",
          text: `As installed, Ollama answers only the computer it runs on (address \`127.0.0.1\`, port \`11434\`). To let an Outpost on another computer use it, set \`OLLAMA_HOST\` to \`${LISTEN}\` on the computer Ollama runs on.`,
        },
        {
          kind: "bySystem",
          systems: {
            mac: [
              {
                kind: "steps",
                steps: [
                  { text: "Open **Terminal**, type this and press Enter:", command: `launchctl setenv OLLAMA_HOST "${LISTEN}"` },
                  "Quit Ollama and open it again.",
                ],
              },
            ],
            windows: [
              {
                kind: "steps",
                steps: [
                  "Quit Ollama from its icon in the corner of the taskbar.",
                  "Open **Settings** (Windows 11) or **Control Panel** (Windows 10) and search for `environment variables`.",
                  "Click **Edit environment variables for your account**.",
                  `Make a new variable for your account named \`OLLAMA_HOST\` with the value \`${LISTEN}\`, and click **OK**.`,
                  "Start Ollama again from the Start menu.",
                ],
              },
            ],
            linux: listenOnLinux,
            pi: listenOnLinux,
          },
        },
        { kind: "text", text: "Then tell Outpost where it is:" },
        {
          kind: "steps",
          steps: [
            "Find the network address of the computer Ollama runs on, for example `192.168.1.20`.",
            "In Outpost, open **Settings**, **Answers from your library**, **More options**, and in **Server address** type `http://192.168.1.20:11434/v1`, with your own address in place of `192.168.1.20`.",
            "Press **Look for Ollama on this computer**. The address you typed is asked first. Then carry on as in step 3.",
          ],
        },
        {
          kind: "text",
          text: "Ollama has no password: once it listens on the network, anyone on that network can use it. Outpost sends questions only to an address on this computer or on a private network. An address on the internet is refused unless whoever starts Outpost sets `OUTPOST_ALLOW_REMOTE_MODEL_SERVER=true`.",
        },
      ],
    },
    {
      id: "docker",
      title: "When Outpost runs in Docker",
      blocks: [
        {
          kind: "text",
          text: "Inside a container, “this computer” is the container, not the machine Docker runs on. Docker calls that machine `host.docker.internal`, and **Look for Ollama on this computer** tries that name by itself, after `127.0.0.1`.",
        },
        { kind: "text", text: "With Docker Desktop, on a Mac or on Windows, the name works as it is." },
        {
          kind: "text",
          text: "With Docker on Linux, add this to the `outpost` service in `compose.yaml`, then start Outpost again:",
        },
        { kind: "command", command: 'extra_hosts:\n  - "host.docker.internal=host-gateway"' },
        {
          kind: "text",
          text: "If Ollama is still not found, tell it to listen on the network as in the section above: seen from a container, the machine it runs on is another computer.",
        },
      ],
    },
    {
      id: "when-it-does-not-work",
      title: "Three things that go wrong, and the fix",
      blocks: [
        {
          kind: "problems",
          problems: [
            {
              says: "“Ollama was not found”, or “No model server answered”",
              means: "Ollama is not running, or it is on another computer.",
              fix: "Start it. On a Mac, open **Ollama** from Applications. On Windows, open it from the Start menu. On Linux or a Raspberry Pi, type `sudo systemctl start ollama`. Then press the button again. If Ollama is on another computer, or Outpost runs in Docker, see the two sections above.",
            },
            {
              says: "“It has no models yet”, or “This model is not on the model server”",
              means: "Ollama is running, but step 2 did not finish or the model has been removed.",
              fix: `On the computer Ollama runs on, type \`${pullCommand(START)}\`, check with \`ollama ls\`, and press the button again.`,
            },
            {
              says: "The try gives up after a minute, or answers take minutes to start",
              means: "The model is still being loaded into memory, or it is too large for the computer.",
              fix: `Try once more: the first request after Ollama starts is the slow one. If it is always slow, get a smaller model from the list in step 2, such as \`${SMALLER}\`, and choose it in Outpost.`,
            },
          ],
        },
      ],
    },
    {
      id: "other-servers",
      title: "Other model servers",
      blocks: [
        {
          kind: "text",
          text: "Ollama is not the only choice. Any server that speaks the same protocol works. Start it, type its address in **Settings**, **Answers from your library**, **More options**, **Server address**, and press **Look for Ollama on this computer**: the address you typed is asked first.",
        },
        {
          kind: "text",
          text: "llama.cpp: `llama-server -m model.gguf` listens on `127.0.0.1`, port `9931`, unless told otherwise, so the address is `http://127.0.0.1:9931/v1`.",
        },
        {
          kind: "text",
          text: "LM Studio: on its **Developer** tab, turn on **Start server**. Its documentation's examples use port `1234`, so the address is `http://127.0.0.1:1234/v1` unless you changed the port.",
        },
        { kind: "text", text: "Neither has been tried with Outpost. Only their documentation was read." },
      ],
    },
    {
      id: "checked",
      title: "Where this was checked",
      blocks: [
        {
          kind: "text",
          text: `Every command, setting name, port and model name on this page was read from its publisher's own pages on ${longDate(RECOMMENDED_MODELS_CHECKED)}. They change, model names and sizes most of all.`,
        },
        {
          kind: "sources",
          sources: [
            {
              label: "Ollama: download",
              url: "https://ollama.com/download",
              gave: "the download page, the file names, the install command for Linux",
            },
            {
              label: "Ollama: macOS",
              url: "https://docs.ollama.com/macos",
              gave: "macOS 14 or newer, dragging the application to Applications, the command link in /usr/local/bin",
            },
            {
              label: "Ollama: Windows",
              url: "https://docs.ollama.com/windows",
              gave: "Windows 10 22H2 or newer, OllamaSetup.exe, no administrator, where commands are typed",
            },
            {
              label: "Ollama: Linux",
              url: "https://docs.ollama.com/linux",
              gave: "the install command, the 64-bit ARM build, the service called ollama",
            },
            { label: "Ollama: command line", url: "https://docs.ollama.com/cli", gave: "ollama pull, ollama ls" },
            {
              label: "Ollama: questions and answers",
              url: "https://docs.ollama.com/faq",
              gave: "the default address 127.0.0.1 and port 11434, OLLAMA_HOST and how to set it on each system",
            },
            {
              label: "Ollama: library",
              url: MODEL_LIBRARY_URL,
              gave: "model names and download sizes (the Tags page of lfm3, llama3.2, gemma3 and phi4-mini)",
            },
            {
              label: "Apple: open Terminal on a Mac",
              url: "https://support.apple.com/guide/terminal/open-or-quit-terminal-apd5265185d-f365-44cb-8b09-71a064a42125/mac",
              gave: "how to open Terminal",
            },
            {
              label: "Microsoft: starting Windows PowerShell",
              url: "https://learn.microsoft.com/en-us/powershell/scripting/windows-powershell/starting-windows-powershell",
              gave: "how to open PowerShell from the Start menu",
            },
            {
              label: "Raspberry Pi: operating system",
              url: "https://www.raspberrypi.com/documentation/computers/os.html",
              gave: "which Raspberry Pi models run the 64-bit system",
            },
            {
              label: "Docker: networking",
              url: "https://docs.docker.com/desktop/features/networking/networking-how-tos/",
              gave: "the name host.docker.internal",
            },
            {
              label: "Docker: docker run, add-host",
              url: "https://docs.docker.com/reference/cli/docker/container/run/",
              gave: "host-gateway, for Docker on Linux",
            },
            {
              label: "llama.cpp: server",
              url: "https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md",
              gave: "llama-server, its default address and port",
            },
            {
              label: "LM Studio: local server",
              url: "https://lmstudio.ai/docs/developer/core/server",
              gave: "the Developer tab and the Start server switch",
            },
            {
              label: "LM Studio: OpenAI compatibility",
              url: "https://lmstudio.ai/docs/developer/openai-compat",
              gave: "port 1234 in its examples",
            },
          ],
        },
        {
          kind: "text",
          text: "What was tried: step 3 was run against a real Ollama (version 0.40.16) on an Apple Silicon Mac that day, with `llama3.2:3b` and `llama3.2:1b`, and each was asked a few questions; `lfm3:1.7b` was run through Outpost on the same Mac the next day. What was not tried: installing Ollama by these steps on any system, Windows, Linux, a Raspberry Pi, Docker, Ollama on another computer, llama.cpp and LM Studio. For those, only the pages above were read.",
        },
      ],
    },
  ],
};

/** "2026-11-16" as "16 November 2026". */
export function longDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${date} ${months[(month ?? 1) - 1]} ${year}`;
}

export type GuideInline = { type: "text" | "strong" | "code"; text: string } | { type: "link"; text: string; url: string };

/** Splits text into plain words and the three marks, for a page that draws them with its own elements. */
export function guideInline(text: string): GuideInline[] {
  const parts: GuideInline[] = [];
  const marks = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(marks)) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ type: "strong", text: match[1] });
    else if (match[2] !== undefined) parts.push({ type: "code", text: match[2] });
    else parts.push({ type: "link", text: match[3]!, url: match[4]! });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** How much memory a recommended model takes, in words: "about 2.4 GB (measured)". */
export function memoryWords(model: { memoryGb: number; memoryMeasured: boolean }): string {
  return `about ${model.memoryGb} GB (${model.memoryMeasured ? "measured" : "estimated"})`;
}

// ── The same guide as a Markdown page ──────────────────────────────────────

function blockMarkdown(block: GuideBlock, depth: number): string[] {
  // One line each, so that a command of several lines inside a numbered step is indented whole and stays in the step.
  const fence = (command: string) => ["```", ...command.split("\n"), "```"];
  switch (block.kind) {
    case "text":
      return [block.text, ""];
    case "command":
      return [...fence(block.command), ""];
    case "steps":
      return [
        ...block.steps.flatMap((step, index) =>
          typeof step === "string"
            ? [`${index + 1}. ${step}`]
            : [`${index + 1}. ${step.text}`, "", ...fence(step.command).map((line) => `   ${line}`), ""],
        ),
        "",
      ];
    case "bySystem":
      return GUIDE_SYSTEMS.flatMap(({ id, name }) => [
        `${"#".repeat(depth + 1)} ${name}`,
        "",
        ...block.systems[id].flatMap((inner) => blockMarkdown(inner, depth + 1)),
      ]);
    case "models":
      return [
        "| Model | Download | Memory once loaded | Smallest computer | What to expect |",
        "| --- | --- | --- | --- | --- |",
        ...RECOMMENDED_MODELS.map(
          (model) => `| \`${model.name}\` | ${model.download} | ${memoryWords(model)} | ${model.fits} of memory | ${model.suits} |`,
        ),
        "",
      ];
    case "problems":
      return block.problems.flatMap((problem, index) => [
        `${index + 1}. **Outpost says:** ${problem.says}`,
        "",
        `   **What it means:** ${problem.means}`,
        "",
        `   **The fix:** ${problem.fix}`,
        "",
      ]);
    case "sources":
      return [...block.sources.map((source) => `- [${source.label}](${source.url}): ${source.gave}.`), ""];
  }
}

function sectionMarkdown(section: GuideSection, depth: number): string[] {
  return [
    `${"#".repeat(depth)} ${section.title}`,
    "",
    ...(section.needsInternet ? ["*This step needs the internet.*", ""] : []),
    ...section.blocks.flatMap((block) => blockMarkdown(block, depth)),
    ...(section.parts ?? []).flatMap((part) => sectionMarkdown(part, depth + 1)),
  ];
}

/** The guide as the Markdown page kept in docs/. The in-app page shows the same content in the same order. */
export function guideMarkdown(guide: Guide = SETUP_GUIDE): string {
  const lines = [
    `# ${guide.title}`,
    "",
    "<!-- Written by scripts/write-setup-guide.mjs from packages/shared/src/setup-guide.ts and",
    "     recommended-models.ts. Do not edit this file: change the source and run the script. -->",
    "",
    `This is the guide Outpost shows at \`${SETUP_GUIDE_PATH}\`, word for word. Checked on ${longDate(guide.checked)}.`,
    "",
    ...guide.intro.flatMap((paragraph) => [paragraph, ""]),
    ...guide.sections.flatMap((section) => sectionMarkdown(section, 2)),
  ];
  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}
