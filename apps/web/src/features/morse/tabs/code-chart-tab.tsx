/**
 * Code chart: every character the trainer sends and reads, the prosigns, and the timing
 * rules a learner needs while training, with the sources they come from.
 */
import {
  farnsworthTiming,
  MORSE_DIGITS,
  MORSE_LETTERS,
  MORSE_PROSIGNS,
  MORSE_PUNCTUATION,
  type MorseEntry,
  standardTiming,
} from "@outpost/shared";
import { useMorsePrefs } from "../prefs";

const ms = (value: number) => `${Math.round(value)} ms`;

/** A code as a screen reader should say it: "dit dah", not "middle dot, minus". */
function Code({ code }: { code: string }) {
  const words = [...code].map((mark) => (mark === "·" ? "dit" : "dah")).join(" ");
  return (
    <>
      <span aria-hidden>{code}</span>
      <span className="sr-only">{words}</span>
    </>
  );
}

function CodeGrid({ title, entries }: { title: string; entries: readonly MorseEntry[] }) {
  const id = `chart-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="text-body font-semibold text-ink">
        {title}
      </h3>
      {/* Two columns on a phone, one when the text is so large that a code would not fit in half the width. */}
      <dl className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] gap-x-6 border-t border-border sm:grid-cols-3 lg:grid-cols-4">
        {entries.map((entry) => (
          <div key={entry.char} className="flex items-baseline justify-between gap-3 border-b border-border py-1.5">
            <dt className="font-mono text-body font-semibold text-ink">{entry.char}</dt>
            <dd className="font-mono text-body tracking-widest text-ink">
              <Code code={entry.code} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CodeChartTab() {
  const prefs = useMorsePrefs();
  const plain = standardTiming(prefs.charWpm);
  const spaced = farnsworthTiming(prefs.charWpm, prefs.effWpm);

  return (
    <div className="max-w-[60rem] space-y-10">
      <section aria-labelledby="chart-timing" className="max-w-[46rem]">
        <h2 id="chart-timing" className="text-lead font-semibold text-ink">
          Timing
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-ink">
          <li>A dit is one unit; a dah is three.</li>
          <li>The gap between the parts of a character is one unit, between characters three, and between words seven.</li>
          <li>
            The unit comes from the speed: one dit lasts 1.2 ÷ wpm seconds (1200 ÷ wpm milliseconds), so 60 ms at 20 wpm. This is the PARIS
            standard: the word PARIS, with the gap after it, is 50 units long.
          </li>
          <li>
            Farnsworth spacing keeps each character at the character speed and stretches the gaps between characters and words until the
            whole reaches the slower effective speed. You learn each character's sound at full speed from the start.
          </li>
        </ul>
        <p className="tabular mt-3 text-small text-ink-muted">
          At your character speed of {prefs.charWpm} wpm a dit lasts {ms(plain.ditMs)} and a dah {ms(plain.dahMs)}.
          {prefs.effWpm < prefs.charWpm
            ? ` At your effective speed of ${prefs.effWpm} wpm the gap between characters is ${ms(spaced.interCharMs)} rather than ${ms(plain.interCharMs)}, and between words ${ms(spaced.interWordMs)} rather than ${ms(plain.interWordMs)}.`
            : ""}
        </p>
      </section>

      <section aria-labelledby="chart-code" className="space-y-6">
        <div>
          <h2 id="chart-code" className="text-lead font-semibold text-ink">
            The code
          </h2>
          <p className="mt-1 text-small text-ink-muted">
            <span aria-hidden>·</span> is a dit and <span aria-hidden>−</span> a dah.
          </p>
        </div>
        <CodeGrid title="Letters" entries={MORSE_LETTERS} />
        <CodeGrid title="Numbers" entries={MORSE_DIGITS} />
        <CodeGrid title="Punctuation" entries={MORSE_PUNCTUATION} />
        <section aria-labelledby="chart-prosigns">
          <h3 id="chart-prosigns" className="text-body font-semibold text-ink">
            Prosigns
          </h3>
          <p className="mt-1 text-small text-ink-muted">Each is sent as one run, with no gaps between its letters.</p>
          {/* On a phone each meaning is under its code rather than in a third column (one or the other is shown, so it is
              read once). With very large text even two columns can be wider than a phone: the table then scrolls in its
              own box, not the page. */}
          <section
            aria-label="Table of prosigns"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a box that scrolls must be reachable to be scrolled with the keyboard
            tabIndex={0}
            className="mt-2 overflow-x-auto rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <table className="w-full text-left text-body">
              <thead>
                <tr className="border-b border-border-strong text-small text-ink-muted">
                  <th scope="col" className="py-1.5 pr-4 font-medium">
                    Prosign
                  </th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">
                    Code
                  </th>
                  <th scope="col" className="py-1.5 font-medium max-sm:hidden">
                    Meaning
                  </th>
                </tr>
              </thead>
              <tbody>
                {MORSE_PROSIGNS.map((prosign) => (
                  <tr key={prosign.sign} className="border-b border-border align-baseline">
                    <th scope="row" className="py-1.5 pr-4 font-mono font-semibold text-ink">
                      {prosign.sign}
                    </th>
                    <td className="py-1.5 pr-4 text-ink">
                      <span className="font-mono tracking-widest whitespace-nowrap">
                        <Code code={prosign.code} />
                      </span>
                      <span className="block text-small text-ink-muted sm:hidden">{prosign.meaning}</span>
                    </td>
                    <td className="py-1.5 text-ink max-sm:hidden">{prosign.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </section>
      </section>

      <p className="max-w-[46rem] text-small text-ink-muted">
        Sources: the code is International Morse code as set out in Recommendation ITU-R M.1677-1. The timing is the PARIS standard, and
        Farnsworth spacing is worked out as in the ARRL's description by Jon Bloom, KE3Z, “A Standard for Morse Timing” (QEX, 1990), which
        is how the trainer times what it plays.
      </p>
    </div>
  );
}
