/**
 * Ciphers to work by hand: a tool for each, the steps written out with the person's own
 * message, and paper aids to print. None of this needs a key or a secure page; nothing
 * typed here is sent or stored.
 */
import { CircleAlert, Printer, RadioTower, RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import {
  ALPHABET,
  CipherError,
  type ColumnarWorking,
  caesar,
  columnar,
  type Direction,
  inGroups,
  type OneTimePadWorking,
  oneTimePad,
  type PlayfairWorking,
  playfair,
  type RailFenceWorking,
  type Reduced,
  railFence,
  reduce,
  type VigenereWorking,
  vigenere,
  vigenereSquare,
} from "./ciphers";
import { padsDocument, squareDocument } from "./kit-aids";
import {
  type AidPaper,
  lineNumber,
  makePads,
  PAD_RULE,
  type Pad,
  padHeading,
  padHolder,
  padLines,
  SQUARE_HOW,
  SQUARE_TITLE,
} from "./paper-aids";
import { CopyButton, Panel } from "./parts";
import { PrintView } from "./print-view";

type CipherId = "caesar" | "vigenere" | "playfair" | "rail" | "columnar" | "otp";

const CIPHERS: Record<CipherId, { name: string; strength: string }> = {
  caesar: {
    name: "Caesar and ROT13",
    strength:
      "No protection. There are 25 shifts to try, which a person does in minutes and a computer at once. ROT13, the shift of 13, is for hiding a spoiler from a glance, not for keeping a secret.",
  },
  vigenere: {
    name: "Vigenère",
    strength:
      "Broken. Repeated stretches of ciphertext give away the length of the key (Kasiski’s method, published in 1863), and each position of the key is then a Caesar cipher. A computer does it in a moment unless the key is random and as long as the message, which makes it a one-time pad.",
  },
  playfair: {
    name: "Playfair",
    strength:
      "Broken. Pairs of letters have their own frequencies, and the same pair always enciphers the same way. A few hundred letters of ciphertext are enough for a computer to recover the square in seconds.",
  },
  rail: {
    name: "Rail fence",
    strength: "No protection. The only secret is the number of rails, so anyone who knows the method tries each in turn.",
  },
  columnar: {
    name: "Columnar transposition",
    strength:
      "Broken. Every letter is still there, only moved, so counting letters shows what kind of cipher it is, and the columns can be put back in order by trial. Doing it twice with two keys is harder for a person and no obstacle to a computer.",
  },
  otp: {
    name: "One-time pad",
    strength:
      "Cannot be broken, if and only if all four of its rules are kept: the pad is truly random, it is at least as long as the message, it is never used again in whole or in part, and nobody but the two of you ever sees it. Break any one and it can be read. Use a pad twice and it will be.",
  },
};

const cell = "grid h-7 w-6 shrink-0 place-items-center font-mono text-[0.875rem]";

/** A row of letters, each in a cell of the same width, with a label in front. Scrolls sideways on a narrow screen. */
function LetterRow({ label, letters, strong, muted }: { label: string; letters: readonly string[]; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center">
      <span className="w-24 shrink-0 pr-3 text-small text-ink-muted">{label}</span>
      {letters.map((letter, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a row of letters is positional, and letters repeat
        <span key={index} className={cn(cell, strong && "font-semibold text-ink", muted && "text-ink-muted")}>
          {letter}
        </span>
      ))}
    </div>
  );
}

function Working({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="mt-3">
      <div className="scroll-quiet overflow-x-auto rounded-panel border border-border bg-surface px-4 py-3">{children}</div>
      {caption ? <figcaption className="mt-1.5 text-small text-ink-muted">{caption}</figcaption> : null}
    </figure>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-3 grid max-w-[70ch] list-decimal gap-1.5 pl-5 text-small text-ink marker:text-ink-muted">{children}</ol>;
}

const SHOWN = 30;
const more = (total: number) => (total > SHOWN ? ` The first ${SHOWN} letters are shown; the rest go the same way.` : "");

function leftOut(dropped: Reduced | undefined, keepsDigits: boolean): string | null {
  if (!dropped || (dropped.digits === 0 && dropped.others === 0)) return null;
  const parts: string[] = [];
  if (dropped.digits > 0) parts.push(`${dropped.digits} ${dropped.digits === 1 ? "figure" : "figures"} (spell numbers out in words)`);
  if (dropped.others > 0) parts.push(`${dropped.others} ${dropped.others === 1 ? "mark" : "marks"} of punctuation or other characters`);
  return `Left out, as when the message is prepared by hand: ${parts.join(" and ")}. Spaces are dropped${keepsDigits ? "; figures are kept" : ""}.`;
}

// ── Paper aids ──────────────────────────────────────────────────────────────
// The sheets as the browser prints them. Their words and the lines of a pad come from paper-aids.ts, which lays the same out for the PDF.

function VigenereSquareSheet() {
  const rows = vigenereSquare();
  return (
    <div className="sheet-part" data-sheet="vigenere-square">
      <p className="mb-2 font-sans text-[11pt] font-semibold">{SQUARE_TITLE}</p>
      <table className="border-collapse text-center font-mono text-[9pt] leading-none">
        <thead>
          <tr>
            <th className="size-[6.4mm] border border-border-strong" />
            {[...ALPHABET].map((letter) => (
              <th key={letter} className="size-[6.4mm] border border-border-strong font-bold">
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row}>
              <th className="size-[6.4mm] border border-border-strong font-bold">{ALPHABET[index]}</th>
              {[...row].map((letter, column) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed 26 × 26 table
                <td key={column} className="size-[6.4mm] border border-border">
                  {letter}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-[165mm] font-sans text-[9pt]">{SQUARE_HOW}</p>
    </div>
  );
}

function PadCopy({ pad, copy }: { pad: Pad; copy: 1 | 2 }) {
  return (
    <div className="sheet-part border border-dashed border-border-strong px-4 py-3" data-pad={pad.serial} data-copy={copy}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 font-sans text-[9pt]">
        <p className="font-semibold">{padHeading(pad, copy)}</p>
        <p>{padHolder(copy)}</p>
      </div>
      <div className="mt-2 grid gap-1 font-mono text-[11pt] leading-tight">
        {padLines(pad.letters).map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines of a pad are positional
          <p key={index} className="flex gap-3 whitespace-nowrap">
            <span className="w-6 text-right text-[8pt]">{lineNumber(index)}</span>
            <span className="tracking-[0.08em]">{line}</span>
          </p>
        ))}
      </div>
      <p className="mt-2 font-sans text-[8pt]">{PAD_RULE}</p>
    </div>
  );
}

function PadSheets({ pads }: { pads: readonly Pad[] }) {
  return (
    <div data-sheet="pads" className="grid gap-4">
      {pads.map((pad) => (
        <div key={pad.serial} className="grid gap-4">
          <PadCopy pad={pad} copy={1} />
          <PadCopy pad={pad} copy={2} />
        </div>
      ))}
    </div>
  );
}

type Aid = { kind: "square" } | { kind: "pads"; pads: Pad[] };

/** A paper aid opened to print: the sheet filling the screen, with Print and Save as PDF. */
function AidView({ aid, onClose }: { aid: Aid; onClose(): void }) {
  // Kept the same from one render to the next: the PDF is made again only when the paper or the aid changes.
  const pages = useCallback(
    (paper: AidPaper, made: Date) => (aid.kind === "square" ? squareDocument(paper, made) : padsDocument(aid.pads, paper, made)),
    [aid],
  );
  if (aid.kind === "square") {
    return (
      <PrintView title={SQUARE_TITLE} summary="One sheet, to keep beside you." document={pages} onClose={onClose}>
        <VigenereSquareSheet />
      </PrintView>
    );
  }
  const letters = aid.pads[0]?.letters.length ?? 0;
  return (
    <PrintView
      title="One-time pads"
      summary={`${aid.pads.length === 1 ? "1 pad" : `${aid.pads.length} pads`} of ${letters} letters, two copies of each.`}
      secret
      document={pages}
      onClose={onClose}
    >
      <PadSheets pads={aid.pads} />
    </PrintView>
  );
}

function PadMaker({ onPrint }: { onPrint(pads: Pad[]): void }) {
  const [count, setCount] = useState("2");
  const [size, setSize] = useState("250");
  const [pads, setPads] = useState<Pad[] | null>(null);
  return (
    <Panel title="Make pads to print">
      <div className="grid gap-4">
        <p className="max-w-[70ch] text-small text-ink-muted">
          Each pad is printed twice: one copy for each of you, and no third. The letters come from this browser’s cryptographic random
          source, are never stored or sent, and are gone when you leave this screen. “Print pads” shows the sheets as they will print, to
          print from the browser or save as a PDF file; a saved file is a third copy until you delete it. The pads are only as secret as
          this device, its printer and the route the paper takes to the other person. The strict way is dice and a pencil.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Pads">
            {(ids) => (
              <Select
                {...ids}
                value={count}
                onChange={setCount}
                options={["1", "2", "4", "8"].map((value) => ({ value, label: value }))}
                className="w-24"
              />
            )}
          </Field>
          <Field label="Letters in each">
            {(ids) => (
              <Select
                {...ids}
                value={size}
                onChange={setSize}
                options={["100", "250", "500"].map((value) => ({ value, label: value }))}
                className="w-28"
              />
            )}
          </Field>
          <Button onClick={() => setPads(makePads(Number(count), Number(size)))}>
            <RefreshCw /> {pads ? "Make new pads" : "Make pads"}
          </Button>
          {pads ? (
            <Button variant="primary" onClick={() => onPrint(pads)}>
              <Printer /> Print pads
            </Button>
          ) : null}
        </div>
        {pads ? (
          <div
            className="scroll-quiet max-h-[28rem] overflow-auto rounded-panel border border-border bg-surface p-4"
            data-testid="pad-preview"
          >
            <PadSheets pads={pads} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

// ── Each cipher's steps, shown with the person's message ────────────────────

function CaesarSteps({ shift, direction }: { shift: number; direction: Direction }) {
  const { cipherAlphabet, shift: by } = caesar("", shift);
  return (
    <>
      <Steps>
        <li>
          Write the alphabet out. Under it write the alphabet again, started {by} {by === 1 ? "letter" : "letters"} later, so that A stands
          over {cipherAlphabet[0]}.
        </li>
        <li>
          {direction === "encipher"
            ? "For each letter of the message, find it in the top row and write down the letter beneath it."
            : "For each letter of the ciphertext, find it in the bottom row and write down the letter above it."}
        </li>
        <li>Copy spaces, figures and punctuation as they are.</li>
      </Steps>
      <Working caption={by === 13 ? "A shift of 13 is ROT13: doing it twice gives back the message." : undefined}>
        <LetterRow label="Plain" letters={[...ALPHABET]} />
        <LetterRow label="Cipher" letters={[...cipherAlphabet]} strong />
      </Working>
    </>
  );
}

function VigenereSteps({ worked, direction, onPrint }: { worked: VigenereWorking; direction: Direction; onPrint(): void }) {
  const shown = worked.steps.slice(0, SHOWN);
  return (
    <>
      <Steps>
        <li>
          Write the message out, and under it the key, repeated to the end. Skip spaces and punctuation: the key moves on only at letters.
        </li>
        <li>
          {direction === "encipher"
            ? "For each letter, find the key letter’s row of the square and the message letter’s column. The letter where they meet is the cipher letter."
            : "For each letter, go along the key letter’s row of the square to the cipher letter. The message letter is at the top of that column."}
        </li>
        <li>
          Without a square: count A as 0 up to Z as 25,{" "}
          {direction === "encipher" ? "add the key letter to the message letter" : "take the key letter from the cipher letter"}, and{" "}
          {direction === "encipher" ? "take 26 off if the sum is 26 or more" : "add 26 if the result is below 0"}.
        </li>
      </Steps>
      {shown.length > 0 ? (
        <Working caption={more(worked.steps.length).trim() || undefined}>
          <LetterRow label={direction === "encipher" ? "Message" : "Cipher"} letters={shown.map((step) => step.input)} />
          <LetterRow label="Key" letters={shown.map((step) => step.key)} muted />
          <LetterRow label={direction === "encipher" ? "Cipher" : "Message"} letters={shown.map((step) => step.output)} strong />
        </Working>
      ) : null}
      <Button className="mt-3" onClick={onPrint}>
        <Printer /> Print a Vigenère square
      </Button>
    </>
  );
}

const RULES = { row: "same row", column: "same column", rectangle: "rectangle" } as const;

function PlayfairSteps({ worked, direction }: { worked: PlayfairWorking; direction: Direction }) {
  const shown = worked.steps.slice(0, SHOWN / 2);
  return (
    <>
      <Steps>
        <li>
          Fill a 5 × 5 square with the letters of the key, leaving out any letter already used, then the rest of the alphabet. I and J share
          a place.
        </li>
        {direction === "encipher" ? (
          <li>
            Split the message into pairs. If a pair would be a doubled letter, put an X between them. If one letter is left at the end, add
            an X.
          </li>
        ) : (
          <li>Split the ciphertext into pairs.</li>
        )}
        <li>
          Two letters in the same row: take the letter to the {direction === "encipher" ? "right" : "left"} of each, going round the end. In
          the same column: the letter {direction === "encipher" ? "below" : "above"} each. Otherwise they are corners of a rectangle: take
          the other corner in each letter’s own row.
        </li>
        {direction === "decipher" ? (
          <li>Read the result, dropping the Xs that were added, and putting J back where I does not make sense.</li>
        ) : null}
      </Steps>
      <Working
        caption={worked.steps.length > shown.length ? `The first ${shown.length} pairs are shown; the rest go the same way.` : undefined}
      >
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <table aria-label="Key square" className="border-collapse">
            <tbody>
              {worked.square.map((row) => (
                <tr key={row}>
                  {[...row].map((letter) => (
                    <td key={letter} className="size-8 border border-border bg-page text-center font-mono text-[0.875rem]">
                      {letter}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 0 ? (
            <table className="text-small">
              <tbody>
                {shown.map((step, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the same pair can occur twice in a message
                  <tr key={index}>
                    <td className="pr-3 font-mono">{step.input}</td>
                    <td className="pr-3 text-ink-muted">becomes</td>
                    <td className="pr-4 font-mono font-semibold">{step.output}</td>
                    <td className="text-ink-muted">{RULES[step.rule]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </Working>
    </>
  );
}

function RailFenceSteps({ worked, rails, direction }: { worked: RailFenceWorking; rails: number; direction: Direction }) {
  const width = Math.min(worked.layout[0]?.length ?? 0, 48);
  return (
    <>
      <Steps>
        {direction === "encipher" ? (
          <>
            <li>Rule {rails} lines. Write the message in a zigzag: one letter on each line going down, then back up, and so on.</li>
            <li>Read the letters off one line at a time, top line first.</li>
          </>
        ) : (
          <>
            <li>Rule {rails} lines and mark the same zigzag with as many dots as the ciphertext has letters.</li>
            <li>Fill the dots with the ciphertext, the top line first from left to right, then the next.</li>
            <li>Read the message along the zigzag.</li>
          </>
        )}
      </Steps>
      {width > 0 ? (
        <Working caption={worked.layout[0]!.length > width ? `The first ${width} letters are shown.` : undefined}>
          {worked.layout.map((line, index) => {
            const letters = [...line.slice(0, width)].map((letter) => (letter === " " ? "·" : letter));
            // biome-ignore lint/suspicious/noArrayIndexKey: rails are positional
            return <LetterRow key={index} label={`Rail ${index + 1}`} letters={letters} />;
          })}
        </Working>
      ) : null}
    </>
  );
}

function ColumnarSteps({ worked, direction }: { worked: ColumnarWorking; direction: Direction }) {
  const rows = worked.rows.slice(0, 12);
  return (
    <>
      <Steps>
        <li>Write the key. Number its letters in alphabetical order; where a letter comes twice, the one on the left is numbered first.</li>
        {direction === "encipher" ? (
          <>
            <li>Write the message under the key in rows, one letter to a column. The last row may be short.</li>
            <li>Copy out column 1 from top to bottom, then column 2, and so on.</li>
          </>
        ) : (
          <>
            <li>
              Divide the number of letters by the length of the key to find how many rows there are; the remainder says how many columns,
              from the left, are one letter longer.
            </li>
            <li>Fill column 1 from top to bottom with the first letters of the ciphertext, then column 2, and so on.</li>
            <li>Read the message along the rows.</li>
          </>
        )}
      </Steps>
      <Working caption={worked.rows.length > rows.length ? `The first ${rows.length} rows are shown.` : undefined}>
        <LetterRow label="Key" letters={[...worked.key]} muted />
        <LetterRow label="Order" letters={worked.order.map(String)} strong />
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows of the grid are positional
          <LetterRow key={index} label={index === 0 ? "Message" : ""} letters={[...row]} />
        ))}
      </Working>
    </>
  );
}

function OneTimePadSteps({ worked, direction }: { worked: OneTimePadWorking; direction: Direction }) {
  const shown = worked.steps.slice(0, SHOWN);
  return (
    <>
      <Steps>
        <li>
          Write the {direction === "encipher" ? "message" : "ciphertext"} out without spaces, and under each letter the next unused letter
          of the pad.
        </li>
        <li>Count A as 0, B as 1, up to Z as 25.</li>
        <li>
          {direction === "encipher"
            ? "Add each pair of numbers. If the sum is 26 or more, take 26 off. Write the letter for the result."
            : "Take the pad’s number from the ciphertext’s. If the result is below 0, add 26. Write the letter for the result."}
        </li>
        <li>Cross out the pad letters you used. They are never used again, by either of you, for anything.</li>
      </Steps>
      {shown.length > 0 ? (
        <Working caption={`${worked.used} ${worked.used === 1 ? "letter" : "letters"} of pad used.${more(worked.steps.length)}`}>
          <LetterRow label={direction === "encipher" ? "Message" : "Cipher"} letters={shown.map((step) => step.input)} />
          <LetterRow label="Pad" letters={shown.map((step) => step.pad)} muted />
          <LetterRow label={direction === "encipher" ? "Sum" : "Difference"} letters={shown.map((step) => String(step.sum))} muted />
          <LetterRow label={direction === "encipher" ? "Cipher" : "Message"} letters={shown.map((step) => step.output)} strong />
        </Working>
      ) : null}
    </>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────

export function HandTab() {
  const [cipher, setCipher] = useState<CipherId>("caesar");
  const [direction, setDirection] = useState<Direction>("encipher");
  const [text, setText] = useState("");
  const [shift, setShift] = useState("3");
  const [key, setKey] = useState("");
  const [rails, setRails] = useState("3");
  const [pad, setPad] = useState("");
  // The paper aid that is open to print, if one is.
  const [aid, setAid] = useState<Aid | null>(null);

  // Worked afresh at each keystroke: the longest of these is a few passes over a short text.
  const result = (() => {
    try {
      switch (cipher) {
        case "caesar": {
          const worked = caesar(text, Number(shift), direction);
          return {
            output: worked.output,
            grouped: false,
            dropped: undefined,
            view: <CaesarSteps shift={Number(shift)} direction={direction} />,
          };
        }
        case "vigenere": {
          const worked = vigenere(text, key, direction);
          return {
            output: worked.output,
            grouped: false,
            dropped: undefined,
            view: <VigenereSteps worked={worked} direction={direction} onPrint={() => setAid({ kind: "square" })} />,
          };
        }
        case "playfair": {
          const worked = playfair(text, key, direction);
          return {
            output: worked.output,
            grouped: true,
            dropped: worked.dropped,
            view: <PlayfairSteps worked={worked} direction={direction} />,
          };
        }
        case "rail": {
          const worked = railFence(text, Number(rails), direction);
          return {
            output: worked.output,
            grouped: true,
            dropped: worked.dropped,
            view: <RailFenceSteps worked={worked} rails={Number(rails)} direction={direction} />,
          };
        }
        case "columnar": {
          const worked = columnar(text, key, direction);
          return {
            output: worked.output,
            grouped: true,
            dropped: worked.dropped,
            view: <ColumnarSteps worked={worked} direction={direction} />,
          };
        }
        case "otp": {
          const worked = oneTimePad(text, pad, direction);
          return {
            output: worked.output,
            grouped: true,
            dropped: worked.dropped,
            view: <OneTimePadSteps worked={worked} direction={direction} />,
          };
        }
      }
    } catch (error) {
      if (error instanceof CipherError) return { error: error.message };
      throw error;
    }
  })();

  const info = CIPHERS[cipher];
  const output = result && "output" in result ? (result.output ?? "") : "";
  const shown = result && "output" in result && result.grouped && direction === "encipher" ? inGroups(output) : output;
  const needsKey = cipher === "vigenere" || cipher === "playfair" || cipher === "columnar";
  const keepsDigits = cipher === "rail" || cipher === "columnar";
  const note = result && "output" in result ? leftOut(result.dropped, keepsDigits) : null;
  const padLetters = cipher === "otp" ? reduce(pad).text.length : 0;

  return (
    <div>
      <Notice tone="warning" icon={<RadioTower />} title="Not on the amateur bands" className="max-w-[46rem]">
        Enciphering a message to hide what it says is not allowed on amateur radio. Ofcom’s licence requires that transmissions “are not
        encrypted for the purpose of obscuring their meaning” (conditions booklet OFW611, condition 6, clause 19(b)), and the ITU Radio
        Regulations say the same of messages between countries (25.2A). Work these on paper, or send them by other means.
      </Notice>

      <div className="mt-6 grid max-w-[46rem] gap-5">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Cipher" className="min-w-[14rem] flex-1">
            {(ids) => (
              <Select<CipherId>
                {...ids}
                value={cipher}
                onChange={setCipher}
                options={(Object.keys(CIPHERS) as CipherId[]).map((id) => ({ value: id, label: CIPHERS[id].name }))}
              />
            )}
          </Field>
          <Segmented<Direction>
            label="Direction"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "encipher", label: "Encipher" },
              { value: "decipher", label: "Decipher" },
            ]}
          />
        </div>

        <p className="text-small text-ink" data-testid="cipher-strength">
          <strong className="font-semibold">How strong it is: </strong>
          {info.strength}
        </p>

        <Field label={direction === "encipher" ? "Message" : "Ciphertext"}>
          {(ids) => (
            <Textarea
              {...ids}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              spellCheck={direction === "encipher"}
            />
          )}
        </Field>

        {cipher === "caesar" ? (
          <Field
            label="Shift"
            hint="How many places along the alphabet each letter moves. 3 is Caesar’s own; 13 is ROT13."
            className="max-w-[12rem]"
          >
            {(ids) => (
              <Input {...ids} type="number" min={-25} max={25} step={1} value={shift} onChange={(event) => setShift(event.target.value)} />
            )}
          </Field>
        ) : null}
        {needsKey ? (
          <Field
            label="Key"
            hint={
              cipher === "playfair"
                ? "A word or phrase. Only its letters are used, each once."
                : cipher === "columnar"
                  ? "A word of two or more letters. Its length is the number of columns."
                  : "A word or phrase. Only its letters are used."
            }
          >
            {(ids) => (
              <Input
                {...ids}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono"
              />
            )}
          </Field>
        ) : null}
        {cipher === "rail" ? (
          <Field label="Rails" className="max-w-[12rem]">
            {(ids) => (
              <Input {...ids} type="number" min={2} max={40} step={1} value={rails} onChange={(event) => setRails(event.target.value)} />
            )}
          </Field>
        ) : null}
        {cipher === "otp" ? (
          <Field
            label="Pad letters"
            hint={`Type the next unused letters from your printed pad. ${padLetters} entered. Typing a pad into any computer leaves it there: for a message that matters, do the sums on paper.`}
          >
            {(ids) => (
              <Textarea
                {...ids}
                value={pad}
                onChange={(event) => setPad(event.target.value)}
                rows={3}
                spellCheck={false}
                autoCapitalize="characters"
                className="font-mono"
              />
            )}
          </Field>
        ) : null}

        {result && "error" in result ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {result.error}
          </Notice>
        ) : (
          <div className="grid gap-2">
            <Field label={direction === "encipher" ? "Ciphertext" : "Message"} hint={note ?? undefined}>
              {(ids) => <Textarea {...ids} readOnly value={shown} rows={3} className="font-mono" data-testid="cipher-output" />}
            </Field>
            <div>
              <CopyButton text={shown} />
            </div>
          </div>
        )}
      </div>

      <section className="mt-10">
        <h2 className="text-lead font-semibold text-ink">By hand</h2>
        {result && "view" in result ? (
          result.view
        ) : (
          <p className="mt-2 text-small text-ink-muted">The steps appear once the key above is one the cipher can use.</p>
        )}
      </section>

      {cipher === "otp" ? (
        <div className="mt-10 max-w-[46rem]">
          <PadMaker onPrint={(pads) => setAid({ kind: "pads", pads })} />
        </div>
      ) : null}

      {aid ? <AidView aid={aid} onClose={() => setAid(null)} /> : null}
    </div>
  );
}
