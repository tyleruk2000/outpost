/**
 * Answers from the library, offered where a question is typed (Home's search and the
 * Search screen) while no writing model is set up: what it does, what it needs, and one
 * button that opens the same three steps Settings and Chat use (model-setup.tsx). The
 * owner wanted it in plain sight, not only in Settings.
 *
 * Outpost includes no model that writes. The small one built in (all-MiniLM-L6-v2) only
 * finds pages by meaning, so a person who has turned that on has not set up answers,
 * and this says so.
 */
import { SETUP_GUIDE_PATH } from "@outpost/shared";
import { TextQuote } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useAnswersStatus } from "@/features/search/answer";
import { cn } from "@/lib/utils";
import { ModelSetup, outpostComputer } from "./model-setup";

/** One sentence on what is missing, the same wherever it is shown. */
export function writingModelWords(): string {
  return `It needs a writing model (a language model). Outpost does not include one: the small model built in, all-MiniLM-L6-v2, only finds pages by meaning and cannot write. A writing model is installed once, with Ollama, on ${outpostComputer()}.`;
}

/** The three steps, in a dialog, from one button. */
export function SetUpAnswers({ label = "Set up answers", className }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <Button variant="primary" className={className} onClick={() => setOpen(true)}>
        <TextQuote aria-hidden /> {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setDone(false);
        }}
      >
        <DialogContent title="Set up answers and chat" size="lg">
          <DialogBody>
            <p className="max-w-[60ch] text-small text-ink-muted">
              {writingModelWords()} It is a download of about 2 GB that needs the internet; after that nothing you ask leaves your own
              network.{" "}
              <Link to={`${SETUP_GUIDE_PATH}#answers-and-chat`} className="text-primary underline underline-offset-2">
                The set-up guide
              </Link>{" "}
              has every step.
            </p>
            {done ? (
              <p className="mt-5 text-body font-medium text-ink" role="status">
                Answers are set up. Type a question and press Answer from my library.
              </p>
            ) : (
              <ModelSetup className="mt-5" onReady={() => setDone(true)} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>{done ? "Done" : "Close"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The offer itself. Nothing while the status is loading, and nothing once answers are
 * switched on: the Search screen then offers "Answer from my library", or says why not.
 */
export function AnswersOffer({ className, question }: { className?: string; question?: string }) {
  const status = useAnswersStatus();
  if (!status.data || status.data.enabled) return null;
  return (
    <section
      aria-labelledby="answers-offer-title"
      className={cn("max-w-[46rem] rounded-panel border border-border bg-surface px-4 py-3.5", className)}
    >
      <h2 id="answers-offer-title" className="text-body font-semibold text-ink">
        {question ? "Want a written answer?" : "Ask in your own words, get a written answer"}
      </h2>
      <p className="mt-1 max-w-[64ch] text-small text-ink-muted">
        {question ? (
          <>
            Answers from your library would read the best passages for “
            <span className="text-ink [overflow-wrap:anywhere]">{question}</span>” and write a short reply, quoting each source.{" "}
          </>
        ) : (
          "Answers from your library writes a short reply to a question from your own documents, notes and books, quoting each source. "
        )}
        {writingModelWords()}
      </p>
      <SetUpAnswers className="mt-3" />
    </section>
  );
}
