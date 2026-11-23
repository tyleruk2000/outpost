/**
 * "Test a restore": what the last test found, and one under way. The test itself is
 * started from a stored backup's menu (automatic-backups.tsx).
 */
import type { BackupSchedule, RestoreTestResult } from "@outpost/shared";
import { Check, CircleAlert } from "lucide-react";
import { Notice } from "@/components/page";
import { Progress } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
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
          <div className="mt-2 max-w-md">
            <Table label="What the backup holds, against what is here now">
              <TableHead>
                <Tr>
                  <Th>
                    <span className="sr-only">What</span>
                  </Th>
                  <Th numeric>In the backup</Th>
                  <Th numeric>Here now</Th>
                </Tr>
              </TableHead>
              <tbody>
                {test.counts.map((entry) => (
                  <Tr key={entry.what}>
                    <Th scope="row" className="py-2.5 align-top font-normal text-ink">
                      {entry.what}
                    </Th>
                    <Td numeric>{entry.inBackup}</Td>
                    <Td numeric className="text-ink-muted">
                      {entry.now}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      ) : (
        <Notice tone="danger" icon={<CircleAlert aria-hidden />} title={restoreTestHeadline(test)} className="mt-2">
          {test.problem} Make a new backup with Back up now and test that one.
        </Notice>
      )}
    </div>
  );
}
