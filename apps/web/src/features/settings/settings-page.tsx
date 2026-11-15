import { formatBytes, type Settings } from "@outpost/shared";
import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { useIsAdmin, useSession, useSettings, useSystem, useUpdateSettings } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { cn, plural } from "@/lib/utils";

export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-x-10 gap-y-4 border-t border-border py-8 first:border-t-0 first:pt-0 lg:grid-cols-[15rem_1fr]">
      <div>
        <h2 id={`${id}-title`} className="text-lead font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-small text-ink-muted">{description}</p> : null}
      </div>
      <div className="grid max-w-[40rem] gap-5">{children}</div>
    </section>
  );
}

export function SettingRow({ label, hint, control, htmlFor }: { label: ReactNode; hint?: ReactNode; control: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-48 flex-1">
        <label htmlFor={htmlFor} className="text-small font-medium text-ink">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-small text-ink-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** A number field that saves when the person leaves it or presses Enter, and reverts if invalid. */
function NumberSetting({ id, value, min, max, disabled, onSave, unit }: { id: string; value: number; min: number; max: number; disabled: boolean; onSave: (value: number) => void; unit?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) return setDraft(String(value));
    if (parsed !== value) onSave(parsed);
  };
  return (
    <span className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
        className="tabular w-24 text-right"
      />
      {unit ? <span className="w-16 text-small text-ink-muted">{unit}</span> : null}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="tabular text-right text-small text-ink">{value}</dd>
    </div>
  );
}

export default function SettingsPage({ extraSections }: { extraSections?: ReactNode }) {
  const settings = useSettings();
  const system = useSystem();
  const session = useSession();
  const update = useUpdateSettings();
  const admin = useIsAdmin();
  const { theme, setTheme, reading, setReading } = useTheme();
  const disabled = !admin || update.isPending;
  const save = <K extends keyof Settings>(key: K, value: Settings[K]) => update.mutate({ [key]: value } as Partial<Settings>);
  const s = settings.data;
  const info = system.data;

  return (
    <Page>
      <PageHeader title="Settings" />
      {!admin ? (
        <Notice tone="info" className="mb-8">
          You can change how Outpost looks for you. Other settings belong to an administrator.
        </Notice>
      ) : null}

      <SettingsSection id="appearance" title="Appearance" description="Saved in this browser, so each device can have its own.">
        <SettingRow
          label="Theme"
          control={
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: "System", icon: <Monitor /> },
                { value: "light", label: "Light", icon: <Sun /> },
                { value: "dark", label: "Dark", icon: <Moon /> },
              ]}
            />
          }
        />
        <SettingRow
          label="Reading typeface"
          hint="Used for pages and document text."
          control={
            <Segmented
              label="Reading typeface"
              value={reading}
              onChange={setReading}
              options={[
                { value: "serif", label: <span className="font-serif">Serif</span> },
                { value: "sans", label: "Sans" },
              ]}
            />
          }
        />
      </SettingsSection>

      {settings.isPending ? (
        <div className="grid gap-4 border-t border-border py-8" aria-busy>
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : settings.isError || !s ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        <>
          <SettingsSection id="downloads" title="Downloads" description="How hard Outpost works when fetching collections and maps.">
            <SettingRow
              htmlFor="dl-concurrency"
              label="Downloads at once"
              hint="More is faster on a good connection. On a Raspberry Pi or a slow link, 1 or 2 keeps things responsive."
              control={<NumberSetting id="dl-concurrency" value={s["downloads.concurrency"]} min={1} max={8} disabled={disabled} onSave={(value) => save("downloads.concurrency", value)} />}
            />
            <SettingRow
              htmlFor="dl-attempts"
              label="Attempts before giving up"
              hint="Failed downloads wait longer between each attempt, and resume from where they stopped."
              control={<NumberSetting id="dl-attempts" value={s["downloads.maxAttempts"]} min={1} max={20} disabled={disabled} onSave={(value) => save("downloads.maxAttempts", value)} />}
            />
          </SettingsSection>

          <SettingsSection id="indexing" title="Reading documents" description="Text is pulled out of documents so they can be searched. Changes apply to documents added or re-read from now on.">
            <SettingRow
              htmlFor="ix-concurrency"
              label="Documents processed at once"
              hint="Each one uses a processor core and some memory while it runs."
              control={<NumberSetting id="ix-concurrency" value={s["indexing.concurrency"]} min={1} max={8} disabled={disabled} onSave={(value) => save("indexing.concurrency", value)} />}
            />
            <SettingRow
              htmlFor="ix-pages"
              label="Most pages read from one PDF"
              hint="Very long PDFs are read up to this page. Use 0 for no limit."
              control={<NumberSetting id="ix-pages" value={s["indexing.maxPdfPages"]} min={0} max={100000} disabled={disabled} onSave={(value) => save("indexing.maxPdfPages", value)} unit="pages" />}
            />
            <SettingRow
              htmlFor="ix-chunk"
              label="Passage length"
              hint="Text is split into passages of about this size for search results and future question answering."
              control={<NumberSetting id="ix-chunk" value={s["indexing.chunkSize"]} min={300} max={4000} disabled={disabled} onSave={(value) => save("indexing.chunkSize", value)} unit="characters" />}
            />
            <SettingRow
              htmlFor="ix-overlap"
              label="Passage overlap"
              hint="How much neighbouring passages share, so a sentence across a boundary is still found whole."
              control={<NumberSetting id="ix-overlap" value={s["indexing.chunkOverlap"]} min={0} max={800} disabled={disabled} onSave={(value) => save("indexing.chunkOverlap", value)} unit="characters" />}
            />
          </SettingsSection>

          <SettingsSection id="search" title="Search">
            <SettingRow
              label="Search inside reference collections"
              hint="Includes articles from installed collections such as Wikipedia in results. Turn off to search only your own documents and pages."
              control={<Switch checked={s["search.includeReference"]} disabled={disabled} onCheckedChange={(value) => save("search.includeReference", value)} aria-label="Search inside reference collections" />}
            />
          </SettingsSection>

          {extraSections}
        </>
      )}

      <SettingsSection
        id="access"
        title="Network and sign-in"
        description="Set when the server starts, not from this screen, so that nobody on the network can open Outpost up from a browser."
      >
        <dl>
          <Fact label="Reachable from other devices" value={session.data?.lanAccess ? "Yes, on your local network" : "No, this device only"} />
          <Fact label="Sign-in required" value={session.data?.authRequired ? "Yes" : "No"} />
          {session.data?.user && session.data.authRequired ? <Fact label="Signed in as" value={`${session.data.user.username} (${session.data.user.role === "admin" ? "administrator" : "member"})`} /> : null}
        </dl>
        <p className="text-small text-ink-muted">
          To let phones and other computers on your network use this library, set <span className="font-mono text-[0.8125rem] text-ink">OUTPOST_LAN_ACCESS=true</span> in the <span className="font-mono text-[0.8125rem] text-ink">.env</span> file and restart. Sign-in is turned on with it.
        </p>
      </SettingsSection>

      <SettingsSection id="about" title="This installation" description="What Outpost is using on this device right now.">
        {info ? (
          <dl>
            <Fact label="Version" value={`${info.version}${info.portable ? ", portable" : ""}`} />
            <Fact label="Running on" value={`${info.platform}, Node ${info.node.replace(/^v/, "")}`} />
            <Fact label="Memory used by Outpost" value={`${formatBytes(info.resources.processRssBytes)} of ${formatBytes(info.resources.systemTotalBytes)}`} />
            <Fact label="Processor load (1 min)" value={`${info.resources.loadAverage[0]?.toFixed(2)} across ${plural(info.resources.cpuCount, "core")}`} />
            <Fact label="Database size" value={formatBytes(info.resources.databaseBytes)} />
            <Fact
              label="Background work"
              value={
                Object.keys(info.queues).length === 0
                  ? "Nothing waiting"
                  : Object.entries(info.queues)
                      .map(([queue, counts]) => `${queue}: ${counts.running} running, ${counts.queued} waiting`)
                      .join("; ")
              }
            />
          </dl>
        ) : (
          <div className={cn("grid gap-2")} aria-busy>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        )}
        <p className="text-small text-ink-muted">Outpost sends no telemetry and makes no network requests unless you start a download or refresh the catalogue.</p>
      </SettingsSection>
    </Page>
  );
}
