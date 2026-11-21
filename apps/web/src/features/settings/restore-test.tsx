/**
 * "Test a restore": what the last test found, and one under way. The test itself is
 * started from a stored backup's menu (automatic-backups.tsx).
 */
import type { BackupSchedule, RestoreTestResult } from "@outpost/shared";
import { Check, CircleAlert } from "lucide-react";
import { Notice } from "@/components/page";
import { Progress } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

/** "Opened and sound", or what was wrong, in one line. */
export function restoreTestHeadline(test: RestoreTestResult): string {
  const made = formatDateTime(test.backupCreatedAt);
  return test.ok
    ? `The backup of ${made} opened, and its database is sound. Tested ${formatDateTime(test.at)}.`
    : `The backup of ${made} would not restore. Tested ${formatDateTime(test.at)}.`;
}

export function RestoreTestPart({ schedule }: { schedule: BackupSchedule }) {
  const test = schedule.restoreTest;
  const active = schedule.restoreTestActive;
  return (
    <div>
      <h3 className="text-small font-medium text-ink">Restore test</h3>
      {active ? (
        <div className="mt-2">
          <Progress tone="lamp" label="Testing a restore" />
          <p className="mt-1.5 text-small text-ink-muted">{active.progress.message ?? "Waiting for its turn"}</p>
        </div>
      ) : null}
      {!test ? (
        active ? null : (
          <p className="mt-1 text-small text-ink-muted">
            Not tested yet. Choose <span className="text-ink">Test a restore</span> in a backup's menu: it is opened into a scratch copy,
            checked and counted, and nothing here is changed.
          </p>
        )
      ) : test.ok ? (
        <div className="mt-1">
          <p className="flex items-start gap-2 text-small text-ink">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {restoreTestHeadline(test)}
          </p>
          {test.migrations && test.migrations.backup < test.migrations.current ? (
            <p className="mt-0.5 text-small text-ink-muted">
              It was made by an earlier version of Outpost ({test.appVersion}); a restore brings its database up to date as it starts.
            </p>
          ) : null}
          <table className="mt-2 w-full max-w-md text-small">
            <caption className="sr-only">What the backup holds, against what is here now</caption>
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="py-1.5 pr-4 text-left font-normal">
                  &nbsp;
                </th>
                <th scope="col" className="py-1.5 pr-4 text-right font-normal">
                  In the backup
                </th>
                <th scope="col" className="py-1.5 text-right font-normal">
                  Here now
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-y border-border">
              {test.counts.map((entry) => (
                <tr key={entry.what}>
                  <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink">
                    {entry.what}
                  </th>
                  <td className="tabular py-1.5 pr-4 text-right text-ink">{entry.inBackup}</td>
                  <td className="tabular py-1.5 text-right text-ink-muted">{entry.now}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Notice tone="danger" icon={<CircleAlert aria-hidden />} title={restoreTestHeadline(test)} className="mt-2">
          {test.problem} Make a new backup with Back up now and test that one.
        </Notice>
      )}
    </div>
  );
}
