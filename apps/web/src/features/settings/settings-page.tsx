import { formatBytes, type Settings } from "@outpost/shared";
import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router";
import { settingsSections } from "@/components/nav";
import { ErrorState, JumpLinks, Page, PageHeader } from "@/components/page";
import { Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { AccessPinSetting } from "@/features/access/access-section";
import { useAccess } from "@/features/access/data";
import { BoardSettingsSection } from "@/features/board/settings-section";
import { GuidesLine } from "@/features/help/guides-line";
import { MeshSettingsSection } from "@/features/mesh/mesh-settings-section";
import { useClockStyle } from "@/lib/clock";
import { useSettings, useSystem, useUpdateSettings } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { plural } from "@/lib/utils";
import { AnswersSection } from "./answers-section";
import { BackupSection } from "./backup-section";
import { ClockSetting } from "./clock-setting";
import { HeightSetting } from "./height-setting";
import { HttpsSection } from "./https-section";
import { NumberSetting, SettingRow, SettingsSection, TextSetting } from "./parts";
import { SemanticSection } from "./semantic-section";
import { TextSizeSetting } from "./text-size-setting";
import { ToolsSection } from "./tools-section";

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="tabular text-right text-small text-ink">{value}</dd>
    </div>
  );
}

/** What each queue of background work is, in words; a queue not named here is shown by its own name. */
const QUEUE_NAMES: Record<string, string> = {
  download: "Downloads",
  index: "Reading documents",
  ocr: "Reading scans",
  import: "Imports",
  transfer: "Moves and copies",
  backup: "Backups",
  database: "Database upkeep",
  manage: "Clean-up",
  network: "Looking for devices",
  propagation: "Radio predictions",
  "reference-files": "Files from reference collections",
  webpage: "Saving web pages",
};

function queueText(queue: string, counts: { running: number; queued: number; paused: number }): string {
  const parts = [
    counts.running > 0 ? `${counts.running} running` : null,
    counts.queued > 0 ? `${counts.queued} waiting` : null,
    counts.paused > 0 ? `${counts.paused} paused` : null,
  ];
  return `${QUEUE_NAMES[queue] ?? queue}: ${parts.filter(Boolean).join(", ")}`;
}

/**
 * The sections in the order they come, so that a person on a phone can go straight to one. They are listed in
 * components/nav.ts, where the quick search finds each by its everyday words ("backup", "dark mode").
 */
const SECTIONS = settingsSections.filter((section) => section.inContents);

export default function SettingsPage() {
  const settings = useSettings();
  const system = useSystem();
  const access = useAccess();
  const update = useUpdateSettings();
  const { theme, setTheme, reading, setReading } = useTheme();
  // Read here so that the whole screen, the backups and their times included, is drawn again when the clock is changed.
  useClockStyle();
  const disabled = update.isPending;
  const save = <K extends keyof Settings>(key: K, value: Settings[K]) => update.mutate({ [key]: value } as Partial<Settings>);
  const s = settings.data;
  const info = system.data;

  // A link such as /settings#backup (the quick search's "Settings: Backup") lands on that section once it has been
  // drawn, and stays on it while the sections above it fill in, until the person scrolls or presses a key.
  const { hash } = useLocation();
  const drawn = settings.isSuccess;
  useEffect(() => {
    if (!hash || !drawn) return;
    const land = () => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
    land();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(land);
    watch.observe(document.getElementById("content") ?? document.body);
    const stop = () => watch.disconnect();
    const done = window.setTimeout(stop, 2000);
    const leave = ["wheel", "touchstart", "keydown"] as const;
    for (const event of leave) window.addEventListener(event, stop, { once: true, passive: true });
    return () => {
      window.clearTimeout(done);
      stop();
      for (const event of leave) window.removeEventListener(event, stop);
    };
  }, [hash, drawn]);

  return (
    <Page>
      <PageHeader title="Settings" under="/settings" />
      <JumpLinks label="Sections of Settings" items={SECTIONS} />

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
        <TextSizeSetting />
        <ClockSetting />
        <HeightSetting />
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
              control={
                <NumberSetting
                  id="dl-concurrency"
                  value={s["downloads.concurrency"]}
                  min={1}
                  max={8}
                  disabled={disabled}
                  onSave={(value) => save("downloads.concurrency", value)}
                />
              }
            />
            <SettingRow
              htmlFor="dl-attempts"
              label="Attempts before giving up"
              hint="Failed downloads wait longer between each attempt, and resume from where they stopped."
              control={
                <NumberSetting
                  id="dl-attempts"
                  value={s["downloads.maxAttempts"]}
                  min={1}
                  max={20}
                  disabled={disabled}
                  onSave={(value) => save("downloads.maxAttempts", value)}
                />
              }
            />
          </SettingsSection>

          <SettingsSection
            id="indexing"
            title="Reading documents"
            description="Text is pulled out of documents so they can be searched. Changes apply to documents added or re-read from now on."
          >
            <SettingRow
              htmlFor="ix-concurrency"
              label="Documents processed at once"
              hint="Each one uses a processor core and some memory while it runs."
              control={
                <NumberSetting
                  id="ix-concurrency"
                  value={s["indexing.concurrency"]}
                  min={1}
                  max={8}
                  disabled={disabled}
                  onSave={(value) => save("indexing.concurrency", value)}
                />
              }
            />
            <SettingRow
              htmlFor="ix-pages"
              label="Most pages read from one PDF"
              hint="Very long PDFs are read up to this page. Use 0 for no limit."
              control={
                <NumberSetting
                  id="ix-pages"
                  value={s["indexing.maxPdfPages"]}
                  min={0}
                  max={100000}
                  disabled={disabled}
                  onSave={(value) => save("indexing.maxPdfPages", value)}
                  unit="pages"
                />
              }
            />
            <SettingRow
              label="Read text from scans automatically"
              hint="New scanned documents and images are read by OCR as soon as they are added. Reading runs on this device, one document at a time; it is slow, and it makes mistakes. When this is off, each such document offers it instead."
              control={
                <Switch
                  checked={s["ocr.auto"]}
                  disabled={disabled}
                  onCheckedChange={(value) => save("ocr.auto", value)}
                  aria-label="Read text from scans automatically"
                />
              }
            />
            <SettingRow
              htmlFor="ix-chunk"
              label="Passage length"
              hint="Text is split into passages of about this size for search results and for answers written from your library."
              control={
                <NumberSetting
                  id="ix-chunk"
                  value={s["indexing.chunkSize"]}
                  min={300}
                  max={4000}
                  disabled={disabled}
                  onSave={(value) => save("indexing.chunkSize", value)}
                  unit="characters"
                />
              }
            />
            <SettingRow
              htmlFor="ix-overlap"
              label="Passage overlap"
              hint="How much neighbouring passages share, so a sentence across a boundary is still found whole."
              control={
                <NumberSetting
                  id="ix-overlap"
                  value={s["indexing.chunkOverlap"]}
                  min={0}
                  max={800}
                  disabled={disabled}
                  onSave={(value) => save("indexing.chunkOverlap", value)}
                  unit="characters"
                />
              }
            />
          </SettingsSection>

          <SettingsSection id="search" title="Search">
            <SettingRow
              label="Search inside reference collections"
              hint="Includes articles from installed collections such as Wikipedia in results. Turn off to search only your own documents and pages."
              control={
                <Switch
                  checked={s["search.includeReference"]}
                  disabled={disabled}
                  onCheckedChange={(value) => save("search.includeReference", value)}
                  aria-label="Search inside reference collections"
                />
              }
            />
          </SettingsSection>

          <SemanticSection settings={s} disabled={disabled} save={save} />

          <AnswersSection settings={s} disabled={disabled} save={save} />
          <ToolsSection settings={s} disabled={disabled} save={save} />

          <SettingsSection
            id="maps"
            title="Maps"
            description="Where map regions are fetched from when you download them. The defaults suit almost everyone."
          >
            <SettingRow
              htmlFor="maps-source"
              label="Map source"
              hint="Address of a planet archive in PMTiles form. Leave empty to use the newest Protomaps build of OpenStreetMap."
              control={
                <TextSetting
                  id="maps-source"
                  value={s["maps.tileSource"]}
                  disabled={disabled}
                  onSave={(value) => save("maps.tileSource", value)}
                  placeholder="Newest Protomaps build"
                  mono
                />
              }
            />
            <SettingRow
              htmlFor="maps-terrain"
              label="Terrain source"
              hint="Used for hill shading when you choose to download terrain with a region."
              control={
                <TextSetting
                  id="maps-terrain"
                  value={s["maps.terrainSource"]}
                  disabled={disabled}
                  onSave={(value) => save("maps.terrainSource", value)}
                  mono
                />
              }
            />
          </SettingsSection>

          <BoardSettingsSection settings={s} disabled={disabled} save={save} />
          <MeshSettingsSection />

          <BackupSection />

          <HttpsSection settings={s} disabled={disabled} save={save} />
        </>
      )}

      <SettingsSection
        id="access"
        title="Who can use this library"
        description="Set when the server starts, not from this screen, so that nobody on the network can open Outpost up from a browser."
      >
        <dl>
          <Fact label="Reachable from" value={info?.lanAccess ? "Every device on your local network" : "This device only"} />
          <Fact label="Accounts" value="None" />
          <Fact
            label="Changing and deleting"
            value={access.data ? (access.data.mode === "pin" ? "Needs the household PIN" : "Every device, no PIN") : "…"}
          />
        </dl>
        <p className="text-small text-ink-muted">
          {info?.lanAccess
            ? "Outpost is shared with your network and has no sign-in, so use it only on a network where you trust everyone, such as your home. Do not forward its port to the internet. A household PIN keeps changing and deleting to the people who know it."
            : "To let phones and other computers on your network use this library, set "}
          {info?.lanAccess ? null : (
            <>
              <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">OUTPOST_LAN_ACCESS=true</span> in the{" "}
              <span className="font-mono text-[0.8125rem] text-ink">.env</span> file and restart. There is no sign-in: everyone on that
              network will be able to use and change it.
            </>
          )}
        </p>
        <AccessPinSetting />
      </SettingsSection>

      <SettingsSection id="about" title="This installation" description="What Outpost is using on this device right now.">
        {info ? (
          <dl>
            <Fact label="Version" value={`${info.version}${info.portable ? ", portable" : ""}`} />
            <Fact label="Running on" value={`${info.platform}, Node ${info.node.replace(/^v/, "")}`} />
            <Fact
              label="Memory used by Outpost"
              value={`${formatBytes(info.resources.processRssBytes)} of ${formatBytes(info.resources.systemTotalBytes)}`}
            />
            <Fact
              label="Processor load (1 min)"
              value={`${info.resources.loadAverage[0]?.toFixed(2)} across ${plural(info.resources.cpuCount, "core")}`}
            />
            <Fact label="Database size" value={formatBytes(info.resources.databaseBytes)} />
            <Fact
              label="Background work"
              value={
                Object.keys(info.queues).length === 0
                  ? "Nothing waiting"
                  : Object.entries(info.queues)
                      .map(([queue, counts]) => queueText(queue, counts))
                      .join("; ")
              }
            />
          </dl>
        ) : (
          <div className="grid gap-2" aria-busy>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        )}
        <p className="text-small text-ink-muted">
          Outpost sends no telemetry and makes no network requests unless you start a download or refresh the catalogue.
        </p>
        <GuidesLine />
      </SettingsSection>
    </Page>
  );
}
