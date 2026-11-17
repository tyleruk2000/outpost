/**
 * What restoring a backup does, said in the dialog before the press, in the same words
 * for a stored backup and a file chosen from this device: four short lines a worried
 * person can scan, under one sentence naming the backup.
 */
import type { ReactNode } from "react";

/** The dialog's button: what the person wants, not how Outpost does it. */
export const RESTORE_LABEL = "Restore after restart";

const lines: Array<[string, string]> = [
  [
    "Replaced",
    "notes, saved places, contacts, plans, settings, the library’s records and the search index, as they were in the backup. Anything added or changed since will not be here.",
  ],
  ["Not touched", "the files of collections, maps and documents on your storage."],
  ["When", "the next time Outpost starts. Downloads under way stop then."],
  ["To cancel", "press Cancel restore in Settings before then. What Outpost holds now is kept in a dated folder, not deleted."],
];

export function RestoreWords({ lead }: { lead: ReactNode }) {
  return (
    <>
      <p>{lead}</p>
      <ul aria-label="What restoring does" className="mt-3 space-y-1.5">
        {lines.map(([term, words]) => (
          <li key={term}>
            <span className="font-medium text-ink">{term}:</span> {words}
          </li>
        ))}
      </ul>
    </>
  );
}
