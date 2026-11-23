/**
 * The idea of a passage, drawn simply: a book, one of its pages, and that page cut into
 * a few short pieces, one of which holds the answer. Not drawn from the library: the
 * ribbon below it is.
 */
import type { ReactNode } from "react";
import { COLOR } from "../charts/colors";

function Step({ number, title, children, drawing }: { number: number; title: string; children: string; drawing: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-1 basis-48 flex-col gap-3">
      <div aria-hidden className="flex h-28 items-end justify-center rounded-control border border-border bg-surface p-3">
        {drawing}
      </div>
      <p className="text-small text-ink">
        <span className="font-semibold">
          {number}. {title}
        </span>{" "}
        <span className="text-ink-muted">{children}</span>
      </p>
    </li>
  );
}

const line = (width: string, strong = false) => (
  <span className="block h-1.5 rounded-full" style={{ width, background: strong ? COLOR.keyword : COLOR.borderStrong }} />
);

export function PassagesPicture() {
  return (
    <ol className="flex flex-wrap gap-4" aria-label="From a book to the passage that answers">
      <Step
        number={1}
        title="A whole book."
        drawing={
          <span className="relative block h-20 w-16">
            <span className="absolute inset-0 translate-x-2 -translate-y-2 rounded-sm border border-border-strong bg-page" />
            <span className="absolute inset-0 translate-x-1 -translate-y-1 rounded-sm border border-border-strong bg-page" />
            <span className="absolute inset-0 grid place-items-center rounded-sm border border-border-strong bg-page text-micro text-ink-muted">
              300 pages
            </span>
          </span>
        }
      >
        Finding the right book is not enough: you would still have to read it to find the answer.
      </Step>
      <Step
        number={2}
        title="One page of it."
        drawing={
          <span className="flex h-20 w-16 flex-col gap-1.5 rounded-sm border border-border-strong bg-page p-2">
            {line("100%")}
            {line("90%")}
            {line("100%")}
            {line("70%")}
            {line("95%")}
            {line("80%")}
          </span>
        }
      >
        Outpost keeps track of every page, so a result can open the book at the right one.
      </Step>
      <Step
        number={3}
        title="The page, cut into passages."
        drawing={
          <span className="flex h-20 w-16 flex-col justify-between">
            <span className="flex flex-col gap-1 rounded-sm border border-border-strong bg-page p-1.5">
              {line("100%")}
              {line("80%")}
            </span>
            <span className="flex flex-col gap-1 rounded-sm border-2 bg-page p-1.5" style={{ borderColor: COLOR.keyword }}>
              {line("100%", true)}
              {line("70%", true)}
            </span>
            <span className="flex flex-col gap-1 rounded-sm border border-border-strong bg-page p-1.5">{line("90%")}</span>
          </span>
        }
      >
        A passage is a few paragraphs. The search scores each one, and shows you the one that holds your words.
      </Step>
    </ol>
  );
}
